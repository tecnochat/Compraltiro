import googleService from './googleService.js'

/**
 * @class ScheduledMessagesService
 * Gestiona el envío automático de mensajes programados.
 * Lee desde la hoja 'Envios' y aplica protecciones anti-bloqueo.
 */
class ScheduledMessagesService {
    constructor() {
        this.isProcessing = false
        this.dailySentCount = 0
        this.lastResetDate = new Date().toDateString()
        this.provider = null

        // Configuración anti-bloqueo
        this.config = {
            minDelayMs: 5000,       // 5 segundos mínimo entre mensajes
            maxDelayMs: 15000,      // 15 segundos máximo entre mensajes
            maxDailyMessages: 50,   // Límite diario
            checkIntervalMs: 60000, // Verificar cada 1 minuto
            startHour: 6,           // Hora inicio (6am)
            endHour: 22             // Hora fin (10pm)
        }
    }

    /**
     * Parsea fecha en formato DD/MM/YYYY HH:mm:ss
     */
    parseDateTime(dateTimeStr) {
        if (!dateTimeStr) return null

        try {
            const parts = dateTimeStr.trim().split(' ')
            if (parts.length < 2) return null

            const dateParts = parts[0].split('/')
            const timeParts = parts[1].split(':')

            if (dateParts.length < 3) return null

            const day = parseInt(dateParts[0])
            const month = parseInt(dateParts[1]) - 1
            const year = parseInt(dateParts[2])
            const hour = parseInt(timeParts[0])
            const minute = parseInt(timeParts[1]) || 0
            const second = parseInt(timeParts[2]) || 0

            return new Date(year, month, day, hour, minute, second)
        } catch {
            return null
        }
    }

    /**
     * Verifica si estamos en horario permitido
     */
    isWithinAllowedHours() {
        const now = new Date()
        const hour = now.getHours()
        return hour >= this.config.startHour && hour < this.config.endHour
    }

    /**
     * Genera delay aleatorio entre min y max
     */
    getRandomDelay() {
        return Math.floor(
            Math.random() * (this.config.maxDelayMs - this.config.minDelayMs)
        ) + this.config.minDelayMs
    }

    /**
     * Verifica y resetea el contador diario si es nuevo día
     */
    checkDailyReset() {
        const today = new Date().toDateString()
        if (today !== this.lastResetDate) {
            this.dailySentCount = 0
            this.lastResetDate = today
            console.log('📅 Contador diario de envíos reseteado')
        }
    }

    /**
     * Procesa y envía mensajes pendientes
     */
    async processScheduledMessages() {
        if (this.isProcessing || !this.provider) {
            return
        }

        this.isProcessing = true

        try {
            // Verificar horario permitido
            if (!this.isWithinAllowedHours()) {
                return
            }

            // Verificar/resetear contador diario
            this.checkDailyReset()

            // Verificar límite diario
            if (this.dailySentCount >= this.config.maxDailyMessages) {
                console.log('⚠️ Límite diario de mensajes alcanzado:', this.dailySentCount)
                return
            }

            const messages = await googleService.getScheduledMessages()
            const now = new Date()

            // Filtrar mensajes pendientes cuya hora ya pasó
            const pendingMessages = messages.filter(m => {
                const estadoLower = (m.estado || '').toLowerCase()
                if (estadoLower !== 'pendiente') return false
                const scheduledTime = this.parseDateTime(m.hora)
                if (!scheduledTime) {
                    console.log('⚠️ Hora inválida para:', m.numeroWhatsapp, '- Hora:', m.hora)
                    return false
                }
                return scheduledTime <= now
            })

            if (pendingMessages.length === 0) {
                return
            }

            console.log(`📬 ${pendingMessages.length} mensaje(s) programado(s) para enviar`)

            for (const msg of pendingMessages) {
                // Verificar límite diario antes de cada envío
                if (this.dailySentCount >= this.config.maxDailyMessages) {
                    console.log('⚠️ Límite diario alcanzado durante procesamiento')
                    break
                }

                try {
                    // Formatear número (asegurar formato correcto)
                    const numero = msg.numeroWhatsapp.replace(/\D/g, '')
                    console.log(`📤 Enviando mensaje programado a ${numero}...`)

                    // Enviar mensaje
                    if (msg.mediaUrl && msg.mediaUrl.trim()) {
                        await this.provider.sendMessage(numero, msg.mensajeTexto, {
                            media: msg.mediaUrl.trim()
                        })
                    } else {
                        await this.provider.sendMessage(numero, msg.mensajeTexto, {})
                    }

                    // Actualizar estado a Enviado
                    await googleService.updateMessageStatus(msg.rowIndex, 'Enviado')
                    this.dailySentCount++

                    console.log(`✅ Mensaje enviado a ${numero} (${this.dailySentCount}/${this.config.maxDailyMessages})`)

                    // Delay aleatorio antes del siguiente mensaje
                    const msgIndex = pendingMessages.indexOf(msg)
                    if (msgIndex < pendingMessages.length - 1) {
                        const delay = this.getRandomDelay()
                        console.log(`⏳ Esperando ${Math.round(delay / 1000)}s antes del siguiente envío...`)
                        await new Promise(resolve => setTimeout(resolve, delay))
                    }

                } catch (sendError) {
                    console.error(`❌ Error enviando a ${msg.numeroWhatsapp}:`, sendError.message)
                    await googleService.updateMessageStatus(msg.rowIndex, 'Error')
                }
            }

        } catch (error) {
            console.error('❌ Error en processScheduledMessages:', error.message)
        } finally {
            this.isProcessing = false
        }
    }

    /**
     * Inicia el scheduler de mensajes programados
     * @param {Object} provider - Instancia del provider de WhatsApp
     */
    startScheduler(provider) {
        this.provider = provider

        console.log('📅 Scheduler de mensajes programados iniciado')
        console.log(`   ⏰ Verificación cada ${this.config.checkIntervalMs / 1000}s`)
        console.log(`   🕐 Horario permitido: ${this.config.startHour}:00 - ${this.config.endHour}:00`)
        console.log(`   📊 Límite diario: ${this.config.maxDailyMessages} mensajes`)

        // Ejecutar inmediatamente una vez
        this.processScheduledMessages()

        // Configurar intervalo
        setInterval(() => {
            this.processScheduledMessages()
        }, this.config.checkIntervalMs)
    }

    /**
     * Obtiene estadísticas del servicio
     */
    getStats() {
        return {
            dailySentCount: this.dailySentCount,
            maxDailyMessages: this.config.maxDailyMessages,
            isProcessing: this.isProcessing,
            isWithinHours: this.isWithinAllowedHours()
        }
    }
}

const scheduledMessagesService = new ScheduledMessagesService()
export default scheduledMessagesService
