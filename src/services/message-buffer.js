/**
 * @class MessageBufferService
 * Acumula mensajes fragmentados de un mismo usuario antes de procesarlos.
 * Espera un delay después del último mensaje para combinarlos en uno solo.
 */
class MessageBufferService {
    constructor() {
        // Buffer de mensajes por número de teléfono
        this.buffers = new Map()

        // Configuración
        this.config = {
            waitTimeMs: 2500,      // Tiempo de espera después del último mensaje (2.5s)
            maxWaitTimeMs: 10000,  // Máximo tiempo de espera total (10s)
            separator: ' '         // Separador entre mensajes combinados
        }
    }

    /**
     * Agrega un mensaje al buffer y devuelve una promesa que se resuelve
     * cuando el usuario deja de escribir (después de waitTimeMs)
     * 
     * @param {string} phoneNumber - Número del contacto
     * @param {string} message - Mensaje recibido
     * @param {object} ctx - Contexto del mensaje (opcional)
     * @returns {Promise<{combined: string, count: number, ctx: object} | null>}
     *          - Retorna el mensaje combinado si es el momento de procesar
     *          - Retorna null si aún se está esperando más mensajes
     */
    addMessage(phoneNumber, message, ctx = null) {
        return new Promise((resolve) => {
            const now = Date.now()

            // Obtener o crear buffer para este usuario
            let buffer = this.buffers.get(phoneNumber)

            if (!buffer) {
                buffer = {
                    messages: [],
                    firstMessageTime: now,
                    lastContext: ctx,
                    timeout: null,
                    resolve: null
                }
                this.buffers.set(phoneNumber, buffer)
            }

            // Agregar mensaje al buffer
            buffer.messages.push(message.trim())
            buffer.lastContext = ctx

            // Cancelar timeout anterior si existe
            if (buffer.timeout) {
                clearTimeout(buffer.timeout)
            }

            // Si hay una promesa anterior pendiente, resolverla con null
            if (buffer.resolve && buffer.resolve !== resolve) {
                buffer.resolve(null)
            }

            buffer.resolve = resolve

            // Calcular tiempo restante máximo
            const elapsedTime = now - buffer.firstMessageTime
            const remainingMaxTime = this.config.maxWaitTimeMs - elapsedTime
            const waitTime = Math.min(this.config.waitTimeMs, remainingMaxTime)

            // Si ya pasó el tiempo máximo, procesar inmediatamente
            if (waitTime <= 0) {
                this._processBuffer(phoneNumber)
                return
            }

            // Configurar nuevo timeout
            buffer.timeout = setTimeout(() => {
                this._processBuffer(phoneNumber)
            }, waitTime)
        })
    }

    /**
     * Procesa el buffer de un usuario (combina mensajes y resuelve la promesa)
     */
    _processBuffer(phoneNumber) {
        const buffer = this.buffers.get(phoneNumber)
        if (!buffer) return

        const combined = buffer.messages.join(this.config.separator)
        const count = buffer.messages.length
        const ctx = buffer.lastContext

        console.log(`📦 Buffer procesado para ${phoneNumber}: ${count} mensaje(s) → "${combined.substring(0, 50)}..."`)

        // Limpiar buffer
        if (buffer.timeout) {
            clearTimeout(buffer.timeout)
        }

        const resolveFunc = buffer.resolve
        this.buffers.delete(phoneNumber)

        // Resolver promesa con el mensaje combinado
        if (resolveFunc) {
            resolveFunc({
                combined,
                count,
                ctx
            })
        }
    }

    /**
     * Cancela el buffer de un usuario (útil para comandos especiales)
     */
    cancelBuffer(phoneNumber) {
        const buffer = this.buffers.get(phoneNumber)
        if (buffer) {
            if (buffer.timeout) {
                clearTimeout(buffer.timeout)
            }
            if (buffer.resolve) {
                buffer.resolve(null)
            }
            this.buffers.delete(phoneNumber)
        }
    }

    /**
     * Obtiene estadísticas del buffer
     */
    getStats() {
        return {
            activeBuffers: this.buffers.size,
            config: this.config
        }
    }

    /**
     * Actualiza la configuración del buffer
     */
    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig }
        console.log('📦 Buffer config actualizada:', this.config)
    }
}

const messageBufferService = new MessageBufferService()
export default messageBufferService
