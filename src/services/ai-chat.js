import Groq from 'groq-sdk'
import googleService from './googleService.js'
import chatHistoryService from './chat-history.js'
import woocommerceService from './woocommerceService.js'

/**
 * @class AIService
 * Gestiona la comunicación con Groq AI.
 * Obtiene configuración desde Google Sheets y genera respuestas con contexto.
 */
class AIService {
    constructor() {
        // Limpiar API key de posibles comillas o espacios
        let apiKey = process.env.GROQ_API_KEY || ''
        apiKey = apiKey.replace(/^["']|["']$/g, '').trim()

        this.apiKey = apiKey
        this.client = null  // Inicialización lazy
        this.model = 'meta-llama/llama-4-scout-17b-16e-instruct'
        this.settings = null
        this.maxTokens = 80
        this.temperature = 0.5

        // Debug: mostrar formato del API key
        if (apiKey) {
            const masked = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4)
            console.log('🔑 GROQ API Key cargada:', masked, `(${apiKey.length} caracteres)`)
        } else {
            console.error('❌ GROQ_API_KEY no encontrada en .env')
        }
    }

    /**
     * Obtiene el cliente Groq (lazy initialization)
     */
    getClient() {
        if (!this.client) {
            this.client = new Groq({ apiKey: this.apiKey })
        }
        return this.client
    }

    /**
     * Configura la temperatura de las respuestas IA
     * @param {number} temp - Valor entre 0 y 2 (0=determinista, 2=creativo)
     */
    setTemperature(temp) {
        if (typeof temp === 'number' && temp >= 0 && temp <= 2) {
            this.temperature = temp
            console.log(`🌡️ Temperatura IA configurada: ${temp}`)
        }
    }

    /**
     * Verifica la conexión con Groq API
     */
    async testConnection() {
        try {
            const client = this.getClient()
            const response = await client.chat.completions.create({
                model: this.model,
                messages: [{ role: 'user', content: 'Responde solo: OK' }],
                max_tokens: 10
            })
            console.log('✅ Conexión con Groq API verificada')
            return true
        } catch (error) {
            console.error('❌ Error de conexión Groq:', error.message)
            return false
        }
    }

    /**
     * Carga la configuración de IA desde Google Sheets
     */
    async loadSettings() {
        try {
            const prompts = await googleService.getPrompts()

            if (prompts.length > 0) {
                this.settings = {
                    systemPrompts: prompts.filter(p => p.role === 'system'),
                    modelConfig: prompts.find(p => p.role === 'config') || null
                }

                // Si hay configuración de modelo, aplicarla
                if (this.settings.modelConfig) {
                    try {
                        const config = JSON.parse(this.settings.modelConfig.content)
                        if (config.model) this.model = config.model
                        if (config.maxTokens) this.maxTokens = config.maxTokens
                        if (config.temperature) this.temperature = config.temperature
                    } catch {
                        // Si no es JSON válido, ignorar
                    }
                }

                console.log('🧠 Configuración IA cargada desde Sheets')
            }
        } catch (error) {
            console.error('❌ Error al cargar configuración IA:', error.message)
        }
    }

    /**
     * Construye el prompt del sistema desde los prompts de Sheets + Catálogo WC
     * @returns {Promise<string>} Prompt completo con catálogo de productos
     */
    async getSystemPrompt() {
        let basePrompt = 'IMPORTANTE: Siempre responde en español. '

        if (!this.settings || !this.settings.systemPrompts.length) {
            basePrompt += 'Eres un asistente virtual amable y profesional para WhatsApp. Responde de manera concisa, útil y siempre en español.'
        } else {
            basePrompt += this.settings.systemPrompts
                .map(p => p.content)
                .join('\n\n')
        }

        // Inyectar catálogo de productos de WooCommerce
        const catalog = await woocommerceService.getProductCatalogForAI()
        if (catalog) {
            console.log('📦 [AI] Catálogo inyectado:', catalog.substring(0, 200) + '...')
            basePrompt += catalog
        } else {
            console.log('⚠️ [AI] No hay catálogo para inyectar')
        }

        return basePrompt
    }

    /**
     * Genera una respuesta de IA
     * @param {string} userInput - Mensaje del usuario
     * @param {string} phoneNumber - Número para obtener contexto
     * @returns {string} Respuesta generada
     */
    async getResponse(userInput, phoneNumber = null) {
        console.log('🤖 [AI] Iniciando getResponse...')
        console.log('🤖 [AI] Input:', userInput.substring(0, 50))

        try {
            // Cargar configuración si no está cargada
            if (!this.settings) {
                console.log('🤖 [AI] Cargando settings...')
                await this.loadSettings()
            }

            // Guardar mensaje del usuario en historial
            if (phoneNumber) {
                await chatHistoryService.saveMessage(phoneNumber, 'user', userInput)
            }

            // Construir mensajes para la API
            const systemPrompt = await this.getSystemPrompt()
            console.log('🤖 [AI] System prompt length:', systemPrompt.length, 'caracteres')

            const messages = [
                {
                    role: 'system',
                    content: systemPrompt
                }
            ]

            // Agregar contexto del historial si existe
            if (phoneNumber) {
                const context = await chatHistoryService.getContextForAI(phoneNumber)
                const previousContext = context.slice(0, -1)
                messages.push(...previousContext)
                console.log('🤖 [AI] Contexto:', previousContext.length, 'mensajes')
            }

            // Agregar mensaje actual del usuario
            messages.push({
                role: 'user',
                content: userInput
            })

            console.log('🤖 [AI] Total mensajes:', messages.length)
            console.log('🤖 [AI] Modelo:', this.model)
            console.log('🤖 [AI] Llamando a Groq API...')

            // Llamar a Groq API
            const client = this.getClient()
            const completion = await client.chat.completions.create({
                model: this.model,
                messages: messages,
                max_tokens: this.maxTokens,
                temperature: this.temperature
            })

            console.log('🤖 [AI] ✅ Respuesta recibida de Groq')

            const response = completion.choices[0]?.message?.content ||
                'Lo siento, no pude generar una respuesta en este momento.'

            console.log('🤖 [AI] Respuesta:', response.substring(0, 100) + '...')

            // Guardar respuesta en historial
            if (phoneNumber) {
                await chatHistoryService.saveMessage(phoneNumber, 'assistant', response)
            }

            return response

        } catch (error) {
            console.error('❌ [AI] Error completo:', error)
            console.error('❌ [AI] Message:', error.message)
            console.error('❌ [AI] Status:', error.status)
            console.error('❌ [AI] Body:', JSON.stringify(error.body || error.error || {}))

            // Mensajes de error más específicos
            if (error.message?.includes('API key') || error.message?.includes('401')) {
                return 'Error de configuración: Verifica tu API key de Groq en https://console.groq.com/keys'
            }
            if (error.message?.includes('rate limit')) {
                return 'El servicio está ocupado, intenta de nuevo en unos segundos.'
            }

            return 'Disculpa, tuve un problema técnico. ¿Puedes intentar de nuevo?'
        }
    }

    /**
     * Detecta si el mensaje tiene intención de consultar WooCommerce
     * @param {string} input - Mensaje del usuario
     * @returns {object} { type: 'product'|'order'|null, query: string }
     */
    detectWooCommerceIntent(input) {
        const inputLower = input.toLowerCase()

        // Detectar consulta de pedido (número de orden)
        const orderPatterns = [
            /pedido\s*#?\s*(\d+)/i,
            /orden\s*#?\s*(\d+)/i,
            /compra\s*#?\s*(\d+)/i,
            /número\s*#?\s*(\d+)/i,
            /estado.*?(\d{3,})/i,
            /#(\d{3,})/
        ]

        for (const pattern of orderPatterns) {
            const match = input.match(pattern)
            if (match) {
                return { type: 'order', query: match[1] }
            }
        }

        // Detectar consulta de producto
        const productKeywords = [
            'precio', 'cuesta', 'cuanto', 'cuánto', 'vale',
            'tienen', 'tienes', 'hay', 'disponible', 'stock',
            'producto', 'productos', 'artículo', 'articulo',
            'busco', 'necesito', 'quiero', 'comprar'
        ]

        const hasProductKeyword = productKeywords.some(kw => inputLower.includes(kw))

        if (hasProductKeyword) {
            // Extraer términos de búsqueda (quitar palabras comunes)
            const stopWords = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'que', 'y', 'o', 'a', 'en', 'es', 'si', 'no', 'por', 'para', 'con', 'tienen', 'tienes', 'hay', 'cuanto', 'cuesta', 'precio', 'disponible', 'stock', 'busco', 'necesito', 'quiero', 'comprar']
            const words = inputLower.split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w))
            return { type: 'product', query: words.join(' ') }
        }

        return { type: null, query: null }
    }

    /**
     * Obtiene contexto de WooCommerce para enriquecer la respuesta de IA
     * @param {string} input - Mensaje del usuario
     * @returns {string} Contexto adicional para la IA
     */
    async getWooCommerceContext(input) {
        if (!woocommerceService.isConfigured) {
            return ''
        }

        const intent = this.detectWooCommerceIntent(input)

        if (!intent.type) {
            return ''
        }

        // Solo procesar consultas de pedidos
        // (Los productos ya están en el system prompt)
        if (intent.type !== 'order') {
            return ''
        }

        console.log('🛒 [WC] Consulta de pedido detectada:', intent.query)

        try {
            const orderStatus = await woocommerceService.getOrderStatus(intent.query)
            if (orderStatus.found) {
                return `\n\n[DATOS DEL PEDIDO #${intent.query}]\n${orderStatus.message}`
            } else {
                return `\n\n[PEDIDO NO ENCONTRADO]\nNo se encontró el pedido #${intent.query}. Pide al cliente que verifique el número.`
            }
        } catch (error) {
            console.error('❌ [WC] Error al consultar pedido:', error.message)
        }

        return ''
    }

    /**
     * Genera respuesta con contexto de WooCommerce (solo para pedidos)
     * Los productos ya están en el system prompt
     * @param {string} userInput - Mensaje del usuario
     * @param {string} phoneNumber - Número de teléfono
     * @returns {string} Respuesta enriquecida
     */
    async getResponseWithWooCommerce(userInput, phoneNumber = null) {
        // Solo agregar contexto para consultas de pedidos
        const wcContext = await this.getWooCommerceContext(userInput)

        // Si hay contexto de pedido, agregarlo al mensaje
        const enrichedInput = wcContext
            ? `${userInput}\n${wcContext}`
            : userInput

        return this.getResponse(enrichedInput, phoneNumber)
    }

    /**
     * Refresca la configuración desde Sheets
     */
    async refreshSettings() {
        this.settings = null
        await this.loadSettings()
    }
}

const aiService = new AIService()
export default aiService
