import googleService from './googleService.js'

/**
 * @class SurveyService
 * Gestiona encuestas dinámicas con preguntas desde Sheets.
 */
class SurveyService {
    constructor() {
        // Estado de encuestas activas por usuario
        this.activeSurveys = new Map() // { phoneNumber: { currentQuestion, answers, questions } }
        this.provider = null
        this.config = {
            keyword: 'encuesta',
            welcomeMessage: '📋 ¡Hola! Vamos a hacerte unas preguntas rápidas.',
            thankYouMessage: '✅ ¡Gracias por tus respuestas! Han sido guardadas.',
            isActive: true
        }
        this.questions = []
    }

    /**
     * Configura el proveedor de WhatsApp
     */
    setProvider(provider) {
        this.provider = provider
        console.log('📋 Survey: Provider configurado')
    }

    /**
     * Carga configuración y preguntas desde Sheets
     */
    async loadConfig() {
        try {
            const config = await googleService.getSurveyConfig()
            if (config) {
                if (config.keyword) this.config.keyword = config.keyword.toLowerCase().trim()
                if (config.welcomeMessage) this.config.welcomeMessage = config.welcomeMessage
                if (config.thankYouMessage) this.config.thankYouMessage = config.thankYouMessage
                if (config.isActive !== undefined) this.config.isActive = config.isActive
            }

            // Cargar preguntas
            this.questions = await googleService.getSurveyQuestions()
            console.log(`📋 Survey: ${this.questions.length} preguntas cargadas, keyword: "${this.config.keyword}"`)

        } catch (error) {
            console.error('❌ Error cargando config de encuesta:', error.message)
        }
    }

    /**
     * Verifica si el mensaje activa la encuesta
     * @param {string} message - Mensaje del usuario
     * @returns {boolean}
     */
    isKeywordTrigger(message) {
        if (!this.config.isActive) return false
        return message.toLowerCase().trim() === this.config.keyword
    }

    /**
     * Verifica si un usuario tiene encuesta activa
     * @param {string} phoneNumber
     * @returns {boolean}
     */
    hasActiveSurvey(phoneNumber) {
        return this.activeSurveys.has(phoneNumber)
    }

    /**
     * Inicia una encuesta para un usuario
     * @param {string} phoneNumber
     * @returns {string} Mensaje de bienvenida + primera pregunta
     */
    async startSurvey(phoneNumber) {
        // Recargar preguntas por si cambiaron
        await this.loadConfig()

        if (this.questions.length === 0) {
            console.log('⚠️ No hay preguntas configuradas')
            return 'No hay preguntas configuradas en este momento.'
        }

        this.activeSurveys.set(phoneNumber, {
            currentQuestion: 0,
            answers: [],
            questions: [...this.questions],
            startedAt: Date.now()
        })

        console.log(`📋 Encuesta iniciada para ${phoneNumber}`)

        const firstQuestion = this.questions[0]
        return `${this.config.welcomeMessage}\n\n*Pregunta 1/${this.questions.length}:*\n${firstQuestion}`
    }

    /**
     * Procesa respuesta y devuelve siguiente pregunta o finaliza
     * @param {string} phoneNumber
     * @param {string} answer
     * @returns {object} { message, isComplete }
     */
    async processAnswer(phoneNumber, answer) {
        const survey = this.activeSurveys.get(phoneNumber)

        if (!survey) {
            return { message: '', isComplete: true }
        }

        // Guardar respuesta
        survey.answers.push(answer)
        survey.currentQuestion++

        // ¿Hay más preguntas?
        if (survey.currentQuestion < survey.questions.length) {
            const nextQuestion = survey.questions[survey.currentQuestion]
            const questionNumber = survey.currentQuestion + 1
            const totalQuestions = survey.questions.length

            return {
                message: `*Pregunta ${questionNumber}/${totalQuestions}:*\n${nextQuestion}`,
                isComplete: false
            }
        }

        // Encuesta completada - guardar respuestas
        await this.saveSurveyResponses(phoneNumber, survey)
        this.activeSurveys.delete(phoneNumber)

        console.log(`✅ Encuesta completada por ${phoneNumber}`)

        return {
            message: this.config.thankYouMessage,
            isComplete: true
        }
    }

    /**
     * Guarda las respuestas en Sheets
     */
    async saveSurveyResponses(phoneNumber, survey) {
        try {
            const cleanNumber = phoneNumber.replace(/\D/g, '')
            const now = new Date().toLocaleString('es-CL')

            // Preparar fila: [Fecha, WhatsApp, Respuesta1, Respuesta2, ...]
            const row = [now, cleanNumber, ...survey.answers]

            await googleService.addSurveyResponse(row, survey.questions)
            console.log(`✅ Respuestas guardadas para ${cleanNumber}`)

        } catch (error) {
            console.error('❌ Error guardando respuestas:', error.message)
        }
    }

    /**
     * Cancela una encuesta activa
     */
    cancelSurvey(phoneNumber) {
        if (this.activeSurveys.has(phoneNumber)) {
            this.activeSurveys.delete(phoneNumber)
            console.log(`❌ Encuesta cancelada para ${phoneNumber}`)
            return true
        }
        return false
    }

    /**
     * Obtiene estadísticas
     */
    getStats() {
        return {
            activeSurveys: this.activeSurveys.size,
            questionsConfigured: this.questions.length,
            keyword: this.config.keyword,
            isActive: this.config.isActive
        }
    }
}

const surveyService = new SurveyService()
export default surveyService
