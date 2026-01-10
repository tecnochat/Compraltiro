import Groq from 'groq-sdk'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * @class AudioTranscriptionService
 * Transcribe mensajes de voz usando Groq Whisper API.
 */
class AudioTranscriptionService {
    constructor() {
        let apiKey = process.env.GROQ_API_KEY || ''
        apiKey = apiKey.replace(/^["']|["']$/g, '').trim()

        this.client = new Groq({ apiKey })
        this.model = 'whisper-large-v3-turbo'
        this.tempDir = path.join(__dirname, '../../temp')

        // Crear directorio temporal si no existe
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true })
        }

        console.log('🎙️ AudioTranscription: Servicio inicializado')
    }

    /**
     * Transcribe un archivo de audio desde un buffer
     * @param {Buffer} audioBuffer - Buffer del archivo de audio
     * @param {string} fileName - Nombre del archivo (para extensión)
     * @returns {Promise<string>} Texto transcrito
     */
    async transcribeFromBuffer(audioBuffer, fileName = 'audio.ogg') {
        const tempPath = path.join(this.tempDir, `audio_${Date.now()}_${fileName}`)

        try {
            // Guardar buffer temporalmente
            fs.writeFileSync(tempPath, audioBuffer)
            console.log(`🎙️ Audio guardado temporalmente: ${tempPath} (${Math.round(audioBuffer.length / 1024)}KB)`)

            // Transcribir
            const transcription = await this.client.audio.transcriptions.create({
                file: fs.createReadStream(tempPath),
                model: this.model,
                language: 'es', // Español
                response_format: 'text'
            })

            console.log(`✅ Transcripción completada: "${transcription.substring(0, 50)}..."`)
            return transcription

        } catch (error) {
            console.error('❌ Error en transcripción:', error.message)
            throw error
        } finally {
            // Limpiar archivo temporal
            try {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath)
                }
            } catch (cleanupError) {
                console.error('⚠️ Error limpiando archivo temporal:', cleanupError.message)
            }
        }
    }

    /**
     * Transcribe audio desde una URL
     * @param {string} audioUrl - URL del archivo de audio
     * @returns {Promise<string>} Texto transcrito
     */
    async transcribeFromUrl(audioUrl) {
        try {
            console.log(`🎙️ Descargando audio desde URL...`)

            const response = await fetch(audioUrl)
            if (!response.ok) {
                throw new Error(`Error descargando audio: ${response.status}`)
            }

            const arrayBuffer = await response.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)

            return await this.transcribeFromBuffer(buffer, 'audio.ogg')

        } catch (error) {
            console.error('❌ Error descargando/transcribiendo audio:', error.message)
            throw error
        }
    }

    /**
     * Transcribe audio desde ruta local
     * @param {string} filePath - Ruta al archivo de audio
     * @returns {Promise<string>} Texto transcrito
     */
    async transcribeFromFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`Archivo no encontrado: ${filePath}`)
            }

            console.log(`🎙️ [transcribeFromFile] Inicio: ${filePath}`)

            // Leer el archivo como buffer
            const audioBuffer = fs.readFileSync(filePath)
            console.log(`🎙️ Buffer leído: ${Math.round(audioBuffer.length / 1024)}KB`)

            // Usar transcribeFromBuffer que maneja la extensión correctamente
            const transcription = await this.transcribeFromBuffer(audioBuffer, 'audio.ogg')

            // Limpiar archivo temporal
            try {
                fs.unlinkSync(filePath)
            } catch (e) {
                // Ignorar
            }

            return transcription

        } catch (error) {
            console.error('❌ Error transcribiendo archivo:', error.message)
            throw error
        }
    }

    /**
     * Método principal para transcribir (detecta automáticamente el tipo de input)
     * @param {Buffer|string} audio - Buffer, URL o ruta de archivo
     * @returns {Promise<string>} Texto transcrito
     */
    async transcribe(audio) {
        if (Buffer.isBuffer(audio)) {
            return await this.transcribeFromBuffer(audio)
        } else if (typeof audio === 'string') {
            if (audio.startsWith('http://') || audio.startsWith('https://')) {
                return await this.transcribeFromUrl(audio)
            } else {
                return await this.transcribeFromFile(audio)
            }
        } else {
            throw new Error('Tipo de audio no soportado')
        }
    }
}

const audioTranscriptionService = new AudioTranscriptionService()
export default audioTranscriptionService
