import googleService from './googleService.js'

/**
 * @class HumanHandoffService
 * Gestiona la transferencia de conversaciones a agentes humanos.
 * Detecta intención, pausa el bot, y notifica al admin.
 */
class HumanHandoffService {
    constructor() {
        // Lista de chats pausados (en memoria)
        this.pausedChats = new Map() // { phoneNumber: { pausedAt, expiresAt, reason } }
        this.provider = null
        this.config = {
            adminWhatsapp: '',
            pauseMinutes: 30,
            customerMessage: '⏳ En breve un asesor se comunicará contigo para darte atención personalizada. Por favor espera.',
            adminMessage: '🚨 *SOLICITUD DE ATENCIÓN*\n\n📱 Cliente: {phone}\n💬 Mensaje: {message}\n\n_Responde directamente a este número._'
        }

        // Palabras clave para detectar intención de hablar con humano
        this.handoffKeywords = [
            'hablar con alguien',
            'persona real',
            'humano',
            'agente',
            'asesor',
            'vendedor',
            'atención personalizada',
            'hablar con una persona',
            'comunicarme con alguien',
            'quiero llamar',
            'pueden llamarme',
            'necesito ayuda humana',
            'operador',
            'representante'
        ]
    }

    /**
     * Configura el proveedor de WhatsApp
     */
    setProvider(provider) {
        this.provider = provider
        console.log('🤝 HumanHandoff: Provider configurado')
    }

    /**
     * Carga configuración desde Google Sheets
     */
    async loadConfig() {
        try {
            const sheetConfig = await googleService.getHandoffConfig()
            if (sheetConfig) {
                if (sheetConfig.adminWhatsapp) {
                    this.config.adminWhatsapp = sheetConfig.adminWhatsapp.replace(/\D/g, '')
                }
                if (sheetConfig.pauseMinutes) {
                    this.config.pauseMinutes = parseInt(sheetConfig.pauseMinutes) || 30
                }
                if (sheetConfig.customerMessage) {
                    this.config.customerMessage = sheetConfig.customerMessage
                }
                if (sheetConfig.adminMessage) {
                    this.config.adminMessage = sheetConfig.adminMessage
                }
                console.log(`🤝 HumanHandoff: Config cargada - Admin: ${this.config.adminWhatsapp}, Pausa: ${this.config.pauseMinutes}min`)
            }
        } catch (error) {
            console.error('❌ Error cargando config handoff:', error.message)
        }
    }

    /**
     * Detecta si el mensaje tiene intención de hablar con un humano
     * @param {string} message - Mensaje del usuario
     * @returns {boolean}
     */
    detectHandoffIntent(message) {
        const messageLower = message.toLowerCase()
        return this.handoffKeywords.some(keyword => messageLower.includes(keyword))
    }

    /**
     * Verifica si un chat está pausado
     * @param {string} phoneNumber - Número de teléfono
     * @returns {boolean}
     */
    isPaused(phoneNumber) {
        const cleanNumber = phoneNumber.replace(/\D/g, '')
        const pauseInfo = this.pausedChats.get(cleanNumber)

        if (!pauseInfo) return false

        // Verificar si expiró
        if (Date.now() > pauseInfo.expiresAt) {
            this.pausedChats.delete(cleanNumber)
            console.log(`⏰ Pausa expirada para ${cleanNumber}`)
            return false
        }

        return true
    }

    /**
     * Pausa un chat
     * @param {string} phoneNumber - Número de teléfono
     * @param {string} reason - Razón de la pausa
     */
    pauseChat(phoneNumber, reason = '') {
        const cleanNumber = phoneNumber.replace(/\D/g, '')
        const now = Date.now()
        const expiresAt = now + (this.config.pauseMinutes * 60 * 1000)

        this.pausedChats.set(cleanNumber, {
            pausedAt: now,
            expiresAt: expiresAt,
            reason: reason
        })

        console.log(`⏸️ Chat pausado: ${cleanNumber} por ${this.config.pauseMinutes} minutos`)
    }

    /**
     * Reanuda un chat (quita la pausa)
     * @param {string} phoneNumber - Número de teléfono
     * @returns {boolean}
     */
    resumeChat(phoneNumber) {
        const cleanNumber = phoneNumber.replace(/\D/g, '')
        if (this.pausedChats.has(cleanNumber)) {
            this.pausedChats.delete(cleanNumber)
            console.log(`▶️ Chat reanudado: ${cleanNumber}`)
            return true
        }
        return false
    }

    /**
     * Inicia el proceso de handoff
     * @param {string} phoneNumber - Número del cliente
     * @param {string} message - Mensaje del cliente
     */
    async initiateHandoff(phoneNumber, message) {
        const cleanNumber = phoneNumber.replace(/\D/g, '')

        // 1. Pausar el chat
        this.pauseChat(cleanNumber, message)

        // 2. Enviar mensaje al cliente
        try {
            const customerNumber = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`
            await this.provider.sendMessage(customerNumber, this.config.customerMessage, {})
            console.log(`✅ Mensaje de handoff enviado al cliente ${cleanNumber}`)
        } catch (error) {
            console.error('❌ Error enviando mensaje al cliente:', error.message)
        }

        // 3. Notificar al admin
        if (this.config.adminWhatsapp) {
            try {
                const adminNumber = `${this.config.adminWhatsapp}@s.whatsapp.net`
                const adminMessage = this.config.adminMessage
                    .replace(/{phone}/g, cleanNumber)
                    .replace(/{message}/g, message)

                await this.provider.sendMessage(adminNumber, adminMessage, {})
                console.log(`✅ Admin notificado: ${this.config.adminWhatsapp}`)
            } catch (error) {
                console.error('❌ Error notificando al admin:', error.message)
            }
        } else {
            console.log('⚠️ No hay admin configurado para notificar')
        }
    }

    /**
     * Obtiene lista de chats pausados
     */
    getPausedChats() {
        const list = []
        const now = Date.now()

        for (const [phone, info] of this.pausedChats.entries()) {
            if (now <= info.expiresAt) {
                list.push({
                    phone: phone,
                    pausedAt: new Date(info.pausedAt).toLocaleString('es-CL'),
                    expiresAt: new Date(info.expiresAt).toLocaleString('es-CL'),
                    remainingMinutes: Math.round((info.expiresAt - now) / 60000),
                    reason: info.reason
                })
            }
        }

        return list
    }

    /**
     * Obtiene estadísticas del servicio
     */
    getStats() {
        return {
            pausedChatsCount: this.pausedChats.size,
            adminConfigured: !!this.config.adminWhatsapp,
            pauseMinutes: this.config.pauseMinutes
        }
    }
}

const humanHandoffService = new HumanHandoffService()
export default humanHandoffService
