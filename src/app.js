import 'dotenv/config'
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'

// Servicios
import googleService from './services/googleService.js'
import aiService from './services/ai-chat.js'
import chatHistoryService from './services/chat-history.js'
import scheduledMessagesService from './services/scheduled-messages.js'
import messageBufferService from './services/message-buffer.js'
import woocommerceService from './services/woocommerceService.js'
import salesWebhookService from './services/salesWebhookService.js'
import humanHandoffService from './services/humanHandoffService.js'
import audioTranscriptionService from './services/audioTranscriptionService.js'
import surveyService from './services/surveyService.js'

const PORT = process.env.PORT ?? 3008

/**
 * Procesa el mensaje (después del buffer)
 */
async function processMessage(phoneNumber, userInput, flowDynamic) {
    console.log('🔄 Procesando mensaje combinado:', userInput.substring(0, 50) + '...')

    // ========================================
    // 1. VERIFICAR BLACKLIST
    // ========================================
    try {
        const isBlocked = await googleService.isBlacklisted(phoneNumber)
        if (isBlocked) {
            console.log('🚫 Número en blacklist, ignorando:', phoneNumber)
            return
        }
    } catch (blacklistError) {
        console.error('⚠️ Error al verificar blacklist:', blacklistError.message)
    }

    // ========================================
    // 1.5 VERIFICAR SI CHAT ESTÁ PAUSADO (HANDOFF)
    // ========================================
    if (humanHandoffService.isPaused(phoneNumber)) {
        console.log('⏸️ Chat pausado (handoff activo), ignorando:', phoneNumber)
        return
    }

    // ========================================
    // 1.6 DETECTAR INTENCIÓN DE HANDOFF
    // ========================================
    if (humanHandoffService.detectHandoffIntent(userInput)) {
        console.log('🤝 Intención de handoff detectada:', phoneNumber)
        await humanHandoffService.initiateHandoff(phoneNumber, userInput)
        return // No procesar más, ya se envió mensaje al cliente
    }

    // ========================================
    // 1.7 VERIFICAR SI HAY ENCUESTA ACTIVA
    // ========================================
    if (surveyService.hasActiveSurvey(phoneNumber)) {
        console.log('📋 Procesando respuesta de encuesta:', phoneNumber)
        const result = await surveyService.processAnswer(phoneNumber, userInput)
        if (result.message) {
            return await flowDynamic(result.message)
        }
        return
    }

    // ========================================
    // 1.8 DETECTAR PALABRA CLAVE DE ENCUESTA
    // ========================================
    if (surveyService.isKeywordTrigger(userInput)) {
        console.log('📋 Iniciando encuesta para:', phoneNumber)
        const welcomeMessage = await surveyService.startSurvey(phoneNumber)
        return await flowDynamic(welcomeMessage)
    }

    // ========================================
    // 2. BUSCAR EN FLUJOS DE SHEETS
    // ========================================
    try {
        const flows = await googleService.getFlows()
        const inputLower = userInput.toLowerCase()

        const triggeredFlow = flows.find(f => {
            if (!f.addKeyword) return false
            const keyword = String(f.addKeyword).toLowerCase().trim()
            return keyword && inputLower.includes(keyword)
        })

        if (triggeredFlow) {
            console.log('🧭 Flujo disparado:', triggeredFlow.addKeyword)

            const answer = (triggeredFlow.addAnswer || '').trim()
            const mediaUrl = triggeredFlow.media && triggeredFlow.media.trim()

            if (!answer) {
                console.log('⚠️ Flujo sin respuesta, derivando a IA')
                const aiResponse = await aiService.getResponse(userInput, phoneNumber)
                return await flowDynamic(aiResponse)
            }

            // Guardar historial en background
            chatHistoryService.saveMessage(phoneNumber, 'user', userInput).catch(() => { })
            chatHistoryService.saveMessage(phoneNumber, 'assistant', answer).catch(() => { })

            if (mediaUrl) {
                return await flowDynamic([{ body: answer, media: mediaUrl }])
            }
            return await flowDynamic(answer)
        }
    } catch (flowError) {
        console.error('⚠️ Error al procesar flujos:', flowError.message)
    }

    // ========================================
    // 3. FALLBACK A IA (CON WOOCOMMERCE)
    // ========================================
    console.log('🤖 No se encontró keyword, derivando a IA con WooCommerce...')
    try {
        const aiResponse = await aiService.getResponseWithWooCommerce(userInput, phoneNumber)
        return await flowDynamic(aiResponse)
    } catch (aiError) {
        console.error('❌ Error en respuesta IA:', aiError.message)
        return await flowDynamic('Disculpa, tuve un problema técnico. ¿Puedes intentar de nuevo?')
    }
}

/**
 * Flujo principal dinámico con buffer de mensajes
 * Espera mensajes fragmentados antes de procesar
 */
const dynamicFlow = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, { flowDynamic }) => {
        const phoneNumber = ctx.from
        const userInput = ctx.body.trim()

        console.log('📩 Mensaje recibido de:', phoneNumber)
        console.log('   Contenido:', userInput.substring(0, 50) + (userInput.length > 50 ? '...' : ''))

        // Agregar mensaje al buffer y esperar
        const result = await messageBufferService.addMessage(phoneNumber, userInput, ctx)

        // Si result es null, significa que llegó otro mensaje y este fue descartado
        if (!result) {
            console.log('⏳ Mensaje agregado al buffer, esperando más...')
            return
        }

        // Procesar el mensaje combinado
        await processMessage(phoneNumber, result.combined, flowDynamic)
    })

/**
 * Flujo para mensajes de voz
 * Transcribe el audio y lo procesa como texto
 */
const voiceFlow = addKeyword(EVENTS.VOICE_NOTE)
    .addAction(async (ctx, { flowDynamic, provider }) => {
        const phoneNumber = ctx.from

        console.log('🎙️ Mensaje de voz recibido de:', phoneNumber)
        console.log('🎙️ CTX keys:', Object.keys(ctx))
        console.log('🎙️ Message keys:', ctx.message ? Object.keys(ctx.message) : 'no message')

        let transcribedText = ''
        let buffer = null

        try {
            // Método 1: downloadContentFromMessage (Baileys directo)
            if (!transcribedText && ctx.message?.audioMessage) {
                try {
                    console.log('🎙️ Intentando downloadContentFromMessage...')
                    const { downloadContentFromMessage } = await import('baileys')
                    const stream = await downloadContentFromMessage(ctx.message.audioMessage, 'audio')

                    const chunks = []
                    for await (const chunk of stream) {
                        chunks.push(chunk)
                    }
                    buffer = Buffer.concat(chunks)

                    if (buffer && buffer.length > 0) {
                        console.log(`🎙️ Audio descargado via downloadContentFromMessage: ${Math.round(buffer.length / 1024)}KB`)
                        transcribedText = await audioTranscriptionService.transcribeFromBuffer(buffer, 'audio.ogg')
                    }
                } catch (dcErr) {
                    console.log('⚠️ downloadContentFromMessage falló:', dcErr.message)
                }
            }

            // Método 2: downloadMediaMessage directo
            if (!transcribedText && provider.vendor?.downloadMediaMessage) {
                try {
                    console.log('🎙️ Intentando downloadMediaMessage con vendor...')
                    buffer = await provider.vendor.downloadMediaMessage(ctx.message)
                    if (buffer) {
                        console.log(`🎙️ Audio descargado: ${Math.round(buffer.length / 1024)}KB`)
                        transcribedText = await audioTranscriptionService.transcribeFromBuffer(buffer, 'audio.ogg')
                    }
                } catch (dlErr) {
                    console.log('⚠️ downloadMediaMessage falló:', dlErr.message)
                }
            }

            // Método 3: saveFile de BuilderBot
            if (!transcribedText && provider.saveFile && ctx.message) {
                try {
                    console.log('🎙️ Intentando método saveFile...')
                    const filePath = await provider.saveFile(ctx, { path: './temp' })
                    if (filePath) {
                        console.log(`🎙️ Audio guardado en: ${filePath}`)
                        transcribedText = await audioTranscriptionService.transcribeFromFile(filePath)
                    }
                } catch (saveErr) {
                    console.log('⚠️ saveFile falló:', saveErr.message)
                }
            }

        } catch (downloadError) {
            console.error('❌ Error en descarga de audio:', downloadError.message)
        }

        // Enviar respuesta basada en resultado
        try {
            if (transcribedText && transcribedText.trim() !== '') {
                console.log(`✅ Transcripción: "${transcribedText.substring(0, 100)}..."`)

                // Procesar el texto transcrito como un mensaje normal
                await processMessage(phoneNumber, transcribedText, flowDynamic)
            } else {
                console.log('⚠️ No se pudo transcribir el audio')
                await flowDynamic('No logré entender el audio. ¿Puedes intentar de nuevo o escribir tu mensaje?')
            }
        } catch (responseError) {
            console.error('❌ Error enviando respuesta:', responseError.message)
        }
    })

/**
 * Función principal - Inicialización del bot
 */
const main = async () => {
    console.log('🚀 Iniciando bot...')

    // ========================================
    // INICIALIZAR GOOGLE SHEETS
    // ========================================
    try {
        console.log('📊 Inicializando Google Sheets...')
        await googleService.getFlows()
        await googleService.getPrompts()
        await googleService.ensureBlacklistSheet()
        await googleService.ensureEnviosSheet()
        console.log('✅ Google Sheets inicializado correctamente')
    } catch (sheetsError) {
        console.error('❌ Error al inicializar Sheets:', sheetsError.message)
        console.log('⚠️ El bot funcionará sin conexión a Sheets')
    }

    // ========================================
    // VERIFICAR CONEXIÓN CON GROQ API
    // ========================================
    const groqOk = await aiService.testConnection()
    if (!groqOk) {
        console.error('⚠️ La IA no está disponible. Verifica tu API key en https://console.groq.com/keys')
    }

    // ========================================
    // CONFIGURAR BUFFER Y TEMPERATURA
    // ========================================
    try {
        const iaConfig = await googleService.getIAConfig()
        messageBufferService.setConfig({ waitTimeMs: iaConfig.bufferMs })
        aiService.setTemperature(iaConfig.temperature)
    } catch (configError) {
        console.error('⚠️ Error al cargar configuración IA:', configError.message)
    }

    // ========================================
    // VERIFICAR CONEXIÓN CON WOOCOMMERCE
    // ========================================
    const wcOk = await woocommerceService.testConnection()
    if (wcOk) {
        const summary = await woocommerceService.getCatalogSummary()
        console.log(`📦 Catálogo: ${summary.totalProducts} productos`)
    }

    // ========================================
    // PROGRAMAR LIMPIEZA AUTOMÁTICA DE HISTORIAL
    // ========================================
    setInterval(async () => {
        console.log('🧹 Iniciando limpieza automática del historial...')
        const deletedCount = await chatHistoryService.cleanOldHistories()
        console.log(`🧹 Limpieza completada. Archivos eliminados: ${deletedCount}`)
    }, 24 * 60 * 60 * 1000) // Cada 24 horas

    // Mostrar estadísticas iniciales
    const stats = await chatHistoryService.getStats()
    console.log('📊 Estadísticas del historial:', stats)

    // ========================================
    // CREAR BOT
    // ========================================
    const adapterFlow = createFlow([dynamicFlow, voiceFlow])
    const adapterProvider = createProvider(Provider, {
        version: [2, 3000, 1027934701]
    })
    const adapterDB = new Database()

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    // ========================================
    // INICIAR SCHEDULER DE MENSAJES PROGRAMADOS
    // ========================================
    scheduledMessagesService.startScheduler(adapterProvider)

    // ========================================
    // CONFIGURAR WEBHOOK DE VENTAS
    // ========================================
    salesWebhookService.setMessageSender(async (number, message) => {
        try {
            await adapterProvider.sendMessage(number, message, {})
        } catch (error) {
            console.error('❌ Error enviando mensaje de venta:', error.message)
        }
    })
    await googleService.ensureVentasSheets()
    console.log('📦 Sistema de ventas automáticas configurado')

    // ========================================
    // CONFIGURAR HANDOFF (ATENCIÓN HUMANA)
    // ========================================
    humanHandoffService.setProvider(adapterProvider)
    await humanHandoffService.loadConfig()
    console.log('🤝 Sistema de handoff humano configurado')

    // ========================================
    // CONFIGURAR ENCUESTAS
    // ========================================
    surveyService.setProvider(adapterProvider)
    await surveyService.loadConfig()
    await googleService.ensureSurveySheets()
    console.log('📋 Sistema de encuestas configurado')

    // ========================================
    // ENDPOINTS HTTP
    // ========================================

    // Enviar mensaje manual
    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            const { number, message, urlMedia } = req.body
            await bot.sendMessage(number, message, { media: urlMedia ?? null })
            return res.end('sended')
        })
    )

    // Gestionar Blacklist (agregar/eliminar)
    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            const { number, intent, motivo } = req.body
            let result = { status: 'error', message: 'Operación no válida' }

            if (intent === 'add') {
                const success = await googleService.addToBlacklist(number, motivo || 'Agregado vía API')
                if (success) {
                    bot.blacklist.add(number)
                    result = { status: 'ok', message: `${number} agregado a blacklist` }
                }
            } else if (intent === 'remove') {
                const success = await googleService.removeFromBlacklist(number)
                if (success) {
                    bot.blacklist.remove(number)
                    result = { status: 'ok', message: `${number} eliminado de blacklist` }
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify(result))
        })
    )

    // Listar Blacklist
    adapterProvider.server.get(
        '/v1/blacklist/list',
        handleCtx(async (bot, req, res) => {
            const blacklist = await googleService.getBlacklist()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', blacklist }))
        })
    )

    // Invalidar cache de Sheets
    adapterProvider.server.post(
        '/v1/cache/invalidate',
        handleCtx(async (bot, req, res) => {
            googleService.invalidateCache()
            await aiService.refreshSettings()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', message: 'Cache invalidado' }))
        })
    )

    // Estadísticas del bot
    adapterProvider.server.get(
        '/v1/stats',
        handleCtx(async (bot, req, res) => {
            const historyStats = await chatHistoryService.getStats()
            const schedulerStats = scheduledMessagesService.getStats()

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({
                status: 'ok',
                history: historyStats,
                scheduler: schedulerStats
            }))
        })
    )

    // Webhook de WooCommerce (ventas)
    adapterProvider.server.post(
        '/v1/webhook/woocommerce',
        handleCtx(async (bot, req, res) => {
            console.log('🔔 [Webhook] Solicitud recibida!')
            console.log('🔔 [Webhook] Headers:', JSON.stringify(req.headers, null, 2).substring(0, 500))
            console.log('🔔 [Webhook] Body keys:', Object.keys(req.body || {}))

            try {
                const signature = req.headers['x-wc-webhook-signature'] || ''
                const event = req.headers['x-wc-webhook-topic'] || 'unknown'
                const payload = JSON.stringify(req.body)

                console.log('🔔 [Webhook] Evento:', event)
                console.log('🔔 [Webhook] Payload length:', payload.length)

                // Verificar firma (opcional si no hay secret)
                if (!salesWebhookService.verifyWebhookSignature(payload, signature)) {
                    console.log('⚠️ Webhook: Firma inválida')
                    res.writeHead(401)
                    return res.end('Invalid signature')
                }

                // Procesar el webhook
                console.log('🔔 [Webhook] Procesando...')
                const result = await salesWebhookService.processOrderWebhook(req.body, event)
                console.log('🔔 [Webhook] Resultado:', JSON.stringify(result))

                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify(result))
            } catch (error) {
                console.error('❌ Error en webhook:', error.message)
                res.writeHead(500)
                return res.end(JSON.stringify({ error: error.message }))
            }
        })
    )

    // ========================================
    // ENDPOINTS HANDOFF (ATENCIÓN HUMANA)
    // ========================================

    // Reanudar chat (quitar pausa)
    adapterProvider.server.post(
        '/v1/handoff/resume',
        handleCtx(async (bot, req, res) => {
            const { number } = req.body
            if (!number) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ error: 'Número requerido' }))
            }

            const resumed = humanHandoffService.resumeChat(number)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({
                status: resumed ? 'ok' : 'not_found',
                message: resumed ? `Chat ${number} reanudado` : 'Chat no estaba pausado'
            }))
        })
    )

    // Listar chats pausados
    adapterProvider.server.get(
        '/v1/handoff/paused',
        handleCtx(async (bot, req, res) => {
            const pausedChats = humanHandoffService.getPausedChats()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({
                status: 'ok',
                count: pausedChats.length,
                chats: pausedChats
            }))
        })
    )

    // ========================================
    // INICIAR SERVIDOR HTTP
    // ========================================
    httpServer(+PORT)
    console.log(`🌐 Servidor HTTP escuchando en puerto ${PORT}`)
    console.log('📱 Esperando conexión de WhatsApp...')
}

main()
