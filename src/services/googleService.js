import { GoogleAuth } from 'google-auth-library'
import { google } from 'googleapis'

/**
 * @class GoogleService
 * Servicio unificado para gestionar Google Sheets.
 * Maneja Flujos, Prompts IA, Blacklist y Envíos.
 */
class GoogleService {
    constructor() {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
        this.auth = new GoogleAuth({
            credentials,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets'
            ]
        })
        this.sheets = google.sheets({ version: 'v4', auth: this.auth })
        this.sheetId = process.env.SHEET_ID

        // Cache para reducir llamadas a la API
        this.cache = {
            flows: null,
            prompts: null,
            blacklist: null,
            lastUpdate: {}
        }
        this.cacheTTL = 5 * 60 * 1000 // 5 minutos
    }

    /**
     * Verifica si el cache de un tipo está vigente
     */
    isCacheValid(type) {
        const lastUpdate = this.cache.lastUpdate[type]
        if (!lastUpdate) return false
        return (Date.now() - lastUpdate) < this.cacheTTL
    }

    /**
     * Invalida todo el cache
     */
    invalidateCache() {
        this.cache = {
            flows: null,
            prompts: null,
            blacklist: null,
            lastUpdate: {}
        }
        console.log('🔄 Cache invalidado')
    }

    // ==========================================
    // FLUJOS - Respuestas automáticas por keyword
    // ==========================================

    /**
     * Obtiene los flujos desde la hoja 'Flujos'
     * Columnas: addKeyword | addAnswer | media
     */
    async getFlows() {
        if (this.isCacheValid('flows') && this.cache.flows) {
            return this.cache.flows
        }

        try {
            // Verificar/crear hoja si no existe
            await this.ensureFlowsSheet()

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Flujos!A2:C'
            })

            const rows = response.data.values || []
            const flows = rows.map(row => ({
                addKeyword: row[0] || '',
                addAnswer: row[1] || '',
                media: row[2] || ''
            })).filter(f => f.addKeyword)

            this.cache.flows = flows
            this.cache.lastUpdate.flows = Date.now()
            console.log(`📋 ${flows.length} flujos cargados desde Sheets`)

            return flows
        } catch (error) {
            console.error('❌ Error al obtener flujos:', error.message)
            return []
        }
    }

    /**
     * Asegura que existe la hoja 'Flujos' con headers
     */
    async ensureFlowsSheet() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            })

            const sheetExists = spreadsheet.data.sheets.some(
                s => s.properties.title === 'Flujos'
            )

            if (!sheetExists) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.sheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: { title: 'Flujos' }
                            }
                        }]
                    }
                })

                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
                    range: 'Flujos!A1:C1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['addKeyword', 'addAnswer', 'media']]
                    }
                })
                console.log('📝 Hoja "Flujos" creada')
            }
        } catch (error) {
            console.error('❌ Error al verificar hoja Flujos:', error.message)
        }
    }

    // ==========================================
    // IA PROMPTS - Configuración del sistema IA
    // ==========================================

    /**
     * Obtiene los prompts de IA desde la hoja 'IA_Prompts'
     * Columnas: Rol | Contenido | (C vacía) | Buffer | Temperature
     */
    async getPrompts() {
        if (this.isCacheValid('prompts') && this.cache.prompts) {
            return this.cache.prompts
        }

        try {
            await this.ensurePromptsSheet()

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'IA_Prompts!A2:E'
            })

            const rows = response.data.values || []
            const prompts = rows.map(row => ({
                role: row[0] || 'system',
                content: row[1] || '',
                buffer: row[3] || '',      // Columna D
                temperature: row[4] || ''  // Columna E
            })).filter(p => p.content)

            this.cache.prompts = prompts
            this.cache.lastUpdate.prompts = Date.now()
            console.log(`🧠 ${prompts.length} prompts IA cargados`)

            return prompts
        } catch (error) {
            console.error('❌ Error al obtener prompts:', error.message)
            return []
        }
    }

    /**
     * Obtiene la configuración completa de IA desde la hoja IA_Prompts
     * @returns {object} { bufferMs, temperature }
     */
    async getIAConfig() {
        try {
            const prompts = await this.getPrompts()
            const systemPrompt = prompts.find(p => p.role === 'system')

            const config = {
                bufferMs: 2500,      // Default: 2.5 segundos
                temperature: 0.7    // Default: 0.7
            }

            if (systemPrompt) {
                // Buffer (columna D)
                if (systemPrompt.buffer) {
                    const seconds = parseFloat(systemPrompt.buffer)
                    if (!isNaN(seconds) && seconds >= 0) {
                        config.bufferMs = Math.round(seconds * 1000)
                    }
                }

                // Temperature (columna E)
                if (systemPrompt.temperature) {
                    const temp = parseFloat(systemPrompt.temperature)
                    if (!isNaN(temp) && temp >= 0 && temp <= 2) {
                        config.temperature = temp
                    }
                }
            }

            console.log(`⚙️ Configuración IA: Buffer=${config.bufferMs}ms, Temperature=${config.temperature}`)
            return config
        } catch (error) {
            console.error('❌ Error al obtener config IA:', error.message)
            return { bufferMs: 2500, temperature: 0.7 }
        }
    }

    /**
     * Obtiene la configuración del buffer desde la hoja IA_Prompts
     * @deprecated Usar getIAConfig() en su lugar
     */
    async getBufferConfig() {
        const config = await this.getIAConfig()
        return config.bufferMs
    }

    /**
     * Asegura que existe la hoja 'IA_Prompts' con headers
     */
    async ensurePromptsSheet() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            })

            const sheetExists = spreadsheet.data.sheets.some(
                s => s.properties.title === 'IA_Prompts'
            )

            if (!sheetExists) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.sheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: { title: 'IA_Prompts' }
                            }
                        }]
                    }
                })

                // Headers con Buffer (D) y Temperature (E)
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
                    range: 'IA_Prompts!A1:E1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['Rol', 'Contenido', '', 'Buffer', 'Temperature']]
                    }
                })

                // Agregar prompt por defecto con buffer=2.5s y temperature=0.7
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.sheetId,
                    range: 'IA_Prompts!A2:E2',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['system', 'Eres un asistente virtual amable y profesional. Responde de manera concisa y útil.', '', '2.5', '0.7']]
                    }
                })
                console.log('📝 Hoja "IA_Prompts" creada con configuración por defecto')
            }
        } catch (error) {
            console.error('❌ Error al verificar hoja IA_Prompts:', error.message)
        }
    }


    // ==========================================
    // BLACKLIST - Números bloqueados
    // ==========================================

    /**
     * Asegura que existe la hoja 'BlackList' con headers
     */
    async ensureBlacklistSheet() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            })

            const sheetExists = spreadsheet.data.sheets.some(
                s => s.properties.title === 'BlackList'
            )

            if (!sheetExists) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.sheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: { title: 'BlackList' }
                            }
                        }]
                    }
                })

                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
                    range: 'BlackList!A1:C1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['Numero', 'Motivo', 'Fecha']]
                    }
                })
                console.log('📝 Hoja "BlackList" creada')
            }
        } catch (error) {
            console.error('❌ Error al verificar hoja BlackList:', error.message)
        }
    }

    /**
     * Obtiene la lista de números bloqueados
     */
    async getBlacklist() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'BlackList!A2:A'
            })

            const rows = response.data.values || []
            const numbers = rows.map(row => String(row[0] || '').replace(/\D/g, '')).filter(n => n)

            this.cache.blacklist = numbers
            this.cache.lastUpdate.blacklist = Date.now()

            return numbers
        } catch (error) {
            console.error('❌ Error al obtener blacklist:', error.message)
            return []
        }
    }

    /**
     * Verifica si un número está en la blacklist
     */
    async isBlacklisted(phoneNumber) {
        const cleanNumber = String(phoneNumber).replace(/\D/g, '')
        const blacklist = await this.getBlacklist()

        return blacklist.some(blocked => {
            const cleanBlocked = String(blocked).replace(/\D/g, '')
            return cleanNumber.includes(cleanBlocked) || cleanBlocked.includes(cleanNumber)
        })
    }

    /**
     * Agrega un número a la blacklist
     */
    async addToBlacklist(phoneNumber, motivo = 'Sin especificar') {
        try {
            const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.sheetId,
                range: 'BlackList!A:C',
                valueInputOption: 'RAW',
                resource: {
                    values: [[phoneNumber, motivo, fecha]]
                }
            })

            this.cache.blacklist = null
            this.cache.lastUpdate.blacklist = null
            console.log(`🚫 ${phoneNumber} agregado a blacklist`)
            return true
        } catch (error) {
            console.error('❌ Error al agregar a blacklist:', error.message)
            return false
        }
    }

    /**
     * Elimina un número de la blacklist
     */
    async removeFromBlacklist(phoneNumber) {
        try {
            const cleanNumber = String(phoneNumber).replace(/\D/g, '')

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'BlackList!A:A'
            })

            const rows = response.data.values || []
            let rowToDelete = -1

            for (let i = 1; i < rows.length; i++) {
                const rowNumber = String(rows[i][0] || '').replace(/\D/g, '')
                if (rowNumber === cleanNumber || cleanNumber.includes(rowNumber)) {
                    rowToDelete = i + 1 // +1 porque las filas en Sheets son 1-indexed
                    break
                }
            }

            if (rowToDelete > 1) {
                // Obtener el ID de la hoja
                const spreadsheet = await this.sheets.spreadsheets.get({
                    spreadsheetId: this.sheetId
                })

                const blacklistSheet = spreadsheet.data.sheets.find(
                    s => s.properties.title === 'BlackList'
                )

                if (blacklistSheet) {
                    await this.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: this.sheetId,
                        resource: {
                            requests: [{
                                deleteDimension: {
                                    range: {
                                        sheetId: blacklistSheet.properties.sheetId,
                                        dimension: 'ROWS',
                                        startIndex: rowToDelete - 1,
                                        endIndex: rowToDelete
                                    }
                                }
                            }]
                        }
                    })

                    this.cache.blacklist = null
                    this.cache.lastUpdate.blacklist = null
                    console.log(`✅ ${phoneNumber} eliminado de blacklist`)
                    return true
                }
            }

            console.log(`⚠️ ${phoneNumber} no encontrado en blacklist`)
            return false
        } catch (error) {
            console.error('❌ Error al eliminar de blacklist:', error.message)
            return false
        }
    }

    // ==========================================
    // ENVIOS - Mensajes programados
    // ==========================================

    /**
     * Asegura que existe la hoja 'Envios' con headers
     */
    async ensureEnviosSheet() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            })

            const sheetExists = spreadsheet.data.sheets.some(
                s => s.properties.title === 'Envios'
            )

            if (!sheetExists) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.sheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: { title: 'Envios' }
                            }
                        }]
                    }
                })

                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
                    range: 'Envios!A1:E1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['NumeroWhatsapp', 'MensajeTexto', 'MediaUrl', 'Hora', 'Estado']]
                    }
                })
                console.log('📝 Hoja "Envios" creada')
            }
        } catch (error) {
            console.error('❌ Error al verificar hoja Envios:', error.message)
        }
    }

    /**
     * Obtiene mensajes pendientes de envío
     */
    async getScheduledMessages() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Envios!A2:E'
            })

            const rows = response.data.values || []
            return rows.map((row, index) => ({
                rowIndex: index + 2,
                numeroWhatsapp: row[0] || '',
                mensajeTexto: row[1] || '',
                mediaUrl: row[2] || '',
                hora: row[3] || '',
                estado: row[4] || 'Pendiente'
            })).filter(m => m.numeroWhatsapp && m.mensajeTexto)
        } catch (error) {
            console.error('❌ Error al obtener mensajes programados:', error.message)
            return []
        }
    }

    /**
     * Actualiza el estado de un mensaje en la hoja Envios
     */
    /**
     * Actualiza el estado de un mensaje en la hoja Envios
     */
    async updateMessageStatus(rowIndex, newStatus) {
        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.sheetId,
                range: `Envios!E${rowIndex}`,
                valueInputOption: 'RAW',
                resource: { values: [[newStatus]] }
            })
            return true
        } catch (error) {
            console.error(`❌ Error al actualizar estado fila ${rowIndex}:`, error.message)
            return false
        }
    }

    // ==========================================
    // VENTAS - Registro de ventas de WooCommerce
    // ==========================================

    /**
     * Asegura que existan las hojas Ventas y Mensajes_Ventas
     */
    async ensureVentasSheets() {
        await this.ensureVentasSheet()
        await this.ensureMensajesVentasSheet()
    }

    /**
     * Asegura que existe la hoja 'Ventas'
     */
    async ensureVentasSheet() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            })

            const sheetExists = spreadsheet.data.sheets.some(
                s => s.properties.title === 'Ventas'
            )

            if (!sheetExists) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.sheetId,
                    resource: {
                        requests: [{
                            addSheet: { properties: { title: 'Ventas' } }
                        }]
                    }
                })

                // Headers
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
                    range: 'Ventas!A1:H1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['Whatsapp', 'Nombre_Cliente', 'Numero_Pedido', 'Productos', 'Estado_Pedido', 'Fecha', 'Notificado', 'Ultima_Actualizacion']]
                    }
                })
                console.log('📝 Hoja "Ventas" creada')
            }
        } catch (error) {
            console.error('❌ Error al verificar hoja Ventas:', error.message)
        }
    }

    /**
     * Asegura que existe la hoja 'Mensajes_Ventas' con templates
     */
    async ensureMensajesVentasSheet() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            })

            const sheetExists = spreadsheet.data.sheets.some(
                s => s.properties.title === 'Mensajes_Ventas'
            )

            if (!sheetExists) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.sheetId,
                    resource: {
                        requests: [{
                            addSheet: { properties: { title: 'Mensajes_Ventas' } }
                        }]
                    }
                })

                // Headers y mensajes por defecto
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
                    range: 'Mensajes_Ventas!A1:B8',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [
                            ['Estado', 'Mensaje'],
                            ['nueva_orden', '¡Hola {nombre}! 🎉 Tu pedido #{order} ha sido confirmado. Te avisaremos cuando esté listo.'],
                            ['pending', 'Tu pedido #{order} está pendiente de pago. Completa el pago para procesarlo.'],
                            ['processing', '📦 ¡Buenas noticias {nombre}! Tu pedido #{order} está siendo preparado.'],
                            ['on-hold', 'Tu pedido #{order} está en espera. Contáctanos si tienes dudas.'],
                            ['completed', '🎉 ¡{nombre}, tu pedido #{order} ha sido completado y entregado! Gracias por tu compra.'],
                            ['cancelled', 'Tu pedido #{order} ha sido cancelado. Si tienes dudas, contáctanos.'],
                            ['refunded', 'Tu pedido #{order} ha sido reembolsado. El dinero llegará en 5-10 días hábiles.']
                        ]
                    }
                })
                console.log('📝 Hoja "Mensajes_Ventas" creada con templates')
            }
        } catch (error) {
            console.error('❌ Error al verificar hoja Mensajes_Ventas:', error.message)
        }
    }

    /**
     * Agrega una nueva venta a la hoja
     * @param {object} orderInfo - Datos de la orden
     */
    async addVenta(orderInfo) {
        try {
            await this.ensureVentasSheet()

            const now = new Date().toLocaleString('es-CL')

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.sheetId,
                range: 'Ventas!A:H',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [[
                        orderInfo.phone,
                        orderInfo.customerName,
                        orderInfo.orderNumber,
                        orderInfo.products,
                        orderInfo.status,
                        now,
                        'No',
                        now
                    ]]
                }
            })
            console.log(`✅ Venta #${orderInfo.orderNumber} registrada en Sheets`)
            return true
        } catch (error) {
            console.error('❌ Error al agregar venta:', error.message)
            return false
        }
    }

    /**
     * Actualiza el estado de una venta
     * @param {string|number} orderNumber - Número de pedido
     * @param {string} newStatus - Nuevo estado
     */
    async updateVentaStatus(orderNumber, newStatus) {
        try {
            // Buscar la fila del pedido
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Ventas!A:H'
            })

            const rows = response.data.values || []
            const rowIndex = rows.findIndex((row, index) =>
                index > 0 && String(row[2]) === String(orderNumber)
            )

            if (rowIndex === -1) {
                console.log(`⚠️ Pedido #${orderNumber} no encontrado en Ventas`)
                return false
            }

            const now = new Date().toLocaleString('es-CL')

            // Actualizar estado y última actualización
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.sheetId,
                range: `Ventas!E${rowIndex + 1}:H${rowIndex + 1}`,
                valueInputOption: 'RAW',
                resource: {
                    values: [[newStatus, rows[rowIndex][5], rows[rowIndex][6], now]]
                }
            })
            console.log(`✅ Pedido #${orderNumber} actualizado a: ${newStatus}`)
            return true
        } catch (error) {
            console.error('❌ Error al actualizar venta:', error.message)
            return false
        }
    }

    /**
     * Marca una venta como notificada
     * @param {string|number} orderNumber - Número de pedido
     */
    async markVentaNotified(orderNumber) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Ventas!A:H'
            })

            const rows = response.data.values || []
            const rowIndex = rows.findIndex((row, index) =>
                index > 0 && String(row[2]) === String(orderNumber)
            )

            if (rowIndex === -1) return false

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.sheetId,
                range: `Ventas!G${rowIndex + 1}`,
                valueInputOption: 'RAW',
                resource: { values: [['Sí']] }
            })
            return true
        } catch (error) {
            console.error('❌ Error al marcar notificado:', error.message)
            return false
        }
    }

    /**
     * Obtiene el mensaje template para un estado
     * @param {string} status - Estado del pedido
     * @returns {string|null} Mensaje template o null
     */
    async getMensajeVenta(status) {
        try {
            await this.ensureMensajesVentasSheet()

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Mensajes_Ventas!A:B'
            })

            const rows = response.data.values || []
            const row = rows.find((r, index) =>
                index > 0 && r[0]?.toLowerCase() === status.toLowerCase()
            )

            return row ? row[1] : null
        } catch (error) {
            console.error('❌ Error al obtener mensaje:', error.message)
            return null
        }
    }

    // ==========================================
    // HANDOFF - Configuración de atención humana
    // ==========================================

    /**
     * Asegura que existe la hoja 'Handoff_Config'
     */
    async ensureHandoffConfigSheet() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            })

            const sheetExists = spreadsheet.data.sheets.some(
                s => s.properties.title === 'Handoff_Config'
            )

            if (!sheetExists) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.sheetId,
                    resource: {
                        requests: [{
                            addSheet: { properties: { title: 'Handoff_Config' } }
                        }]
                    }
                })

                // Configuración por defecto
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
                    range: 'Handoff_Config!A1:B6',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [
                            ['Configuración', 'Valor'],
                            ['Admin_Whatsapp', ''],
                            ['Pausa_Minutos', '30'],
                            ['Mensaje_Cliente', '⏳ En breve un asesor se comunicará contigo para darte atención personalizada. Por favor espera.'],
                            ['Mensaje_Admin', '🚨 *SOLICITUD DE ATENCIÓN*\n\n📱 Cliente: {phone}\n💬 Mensaje: {message}\n\n_Responde directamente a este número._'],
                            ['Keywords', 'hablar con alguien,persona real,humano,agente,asesor,vendedor,atención personalizada']
                        ]
                    }
                })
                console.log('📝 Hoja "Handoff_Config" creada')
            }
        } catch (error) {
            console.error('❌ Error al verificar hoja Handoff_Config:', error.message)
        }
    }

    /**
     * Obtiene la configuración de handoff
     * @returns {object|null} Configuración de handoff
     */
    async getHandoffConfig() {
        try {
            await this.ensureHandoffConfigSheet()

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Handoff_Config!A:B'
            })

            const rows = response.data.values || []
            const config = {}

            for (let i = 1; i < rows.length; i++) {
                const key = rows[i][0]
                const value = rows[i][1]

                if (key === 'Admin_Whatsapp') config.adminWhatsapp = value
                if (key === 'Pausa_Minutos') config.pauseMinutes = value
                if (key === 'Mensaje_Cliente') config.customerMessage = value
                if (key === 'Mensaje_Admin') config.adminMessage = value
                if (key === 'Keywords') config.keywords = value
            }

            return config
        } catch (error) {
            console.error('❌ Error al obtener config handoff:', error.message)
            return null
        }
    }

    // ==========================================
    // ENCUESTAS - Preguntas y Respuestas
    // ==========================================

    /**
     * Asegura que existan las hojas de encuesta
     */
    async ensureSurveySheets() {
        await this.ensureSurveyConfigSheet()
        await this.ensureSurveyQuestionsSheet()
        await this.ensureSurveyResponsesSheet()
    }

    /**
     * Asegura que existe la hoja 'Encuesta_Config'
     */
    async ensureSurveyConfigSheet() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            })

            const sheetExists = spreadsheet.data.sheets.some(
                s => s.properties.title === 'Encuesta_Config'
            )

            if (!sheetExists) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.sheetId,
                    resource: {
                        requests: [{
                            addSheet: { properties: { title: 'Encuesta_Config' } }
                        }]
                    }
                })

                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
                    range: 'Encuesta_Config!A1:B5',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [
                            ['Configuración', 'Valor'],
                            ['Palabra_Clave', 'encuesta'],
                            ['Mensaje_Inicio', '📋 ¡Hola! Vamos a hacerte unas preguntas rápidas.'],
                            ['Mensaje_Fin', '✅ ¡Gracias por tus respuestas! Han sido guardadas.'],
                            ['Activa', 'Sí']
                        ]
                    }
                })
                console.log('📝 Hoja "Encuesta_Config" creada')
            }
        } catch (error) {
            console.error('❌ Error al verificar Encuesta_Config:', error.message)
        }
    }

    /**
     * Asegura que existe la hoja 'Encuesta_Preguntas'
     */
    async ensureSurveyQuestionsSheet() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            })

            const sheetExists = spreadsheet.data.sheets.some(
                s => s.properties.title === 'Encuesta_Preguntas'
            )

            if (!sheetExists) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.sheetId,
                    resource: {
                        requests: [{
                            addSheet: { properties: { title: 'Encuesta_Preguntas' } }
                        }]
                    }
                })

                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
                    range: 'Encuesta_Preguntas!A1:D1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['¿Cuál es tu nombre?', '¿Cómo nos conociste?', '¿Qué producto te interesa?', '¿Tienes alguna pregunta?']]
                    }
                })
                console.log('📝 Hoja "Encuesta_Preguntas" creada con ejemplos')
            }
        } catch (error) {
            console.error('❌ Error al verificar Encuesta_Preguntas:', error.message)
        }
    }

    /**
     * Asegura que existe la hoja 'Encuesta_Respuestas'
     */
    async ensureSurveyResponsesSheet() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            })

            const sheetExists = spreadsheet.data.sheets.some(
                s => s.properties.title === 'Encuesta_Respuestas'
            )

            if (!sheetExists) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.sheetId,
                    resource: {
                        requests: [{
                            addSheet: { properties: { title: 'Encuesta_Respuestas' } }
                        }]
                    }
                })
                console.log('📝 Hoja "Encuesta_Respuestas" creada')
            }
        } catch (error) {
            console.error('❌ Error al verificar Encuesta_Respuestas:', error.message)
        }
    }

    /**
     * Obtiene configuración de encuesta
     */
    async getSurveyConfig() {
        try {
            await this.ensureSurveyConfigSheet()

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Encuesta_Config!A:B'
            })

            const rows = response.data.values || []
            const config = {}

            for (let i = 1; i < rows.length; i++) {
                const key = rows[i][0]
                const value = rows[i][1]

                if (key === 'Palabra_Clave') config.keyword = value
                if (key === 'Mensaje_Inicio') config.welcomeMessage = value
                if (key === 'Mensaje_Fin') config.thankYouMessage = value
                if (key === 'Activa') config.isActive = value?.toLowerCase() === 'sí' || value?.toLowerCase() === 'si'
            }

            return config
        } catch (error) {
            console.error('❌ Error al obtener config encuesta:', error.message)
            return null
        }
    }

    /**
     * Obtiene preguntas de encuesta (fila 1, todas las columnas con contenido)
     */
    async getSurveyQuestions() {
        try {
            await this.ensureSurveyQuestionsSheet()

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Encuesta_Preguntas!1:1'
            })

            const questions = (response.data.values?.[0] || []).filter(q => q && q.trim())
            return questions

        } catch (error) {
            console.error('❌ Error al obtener preguntas:', error.message)
            return []
        }
    }

    /**
     * Agrega respuesta de encuesta
     * @param {array} row - [Fecha, WhatsApp, Respuesta1, Respuesta2, ...]
     * @param {array} questions - Lista de preguntas para headers
     */
    async addSurveyResponse(row, questions) {
        try {
            await this.ensureSurveyResponsesSheet()

            // Verificar/crear headers dinámicos
            const existingHeaders = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Encuesta_Respuestas!1:1'
            })

            if (!existingHeaders.data.values || existingHeaders.data.values[0]?.length === 0) {
                // Crear headers: Fecha, WhatsApp, Pregunta1, Pregunta2...
                const headers = ['Fecha', 'WhatsApp', ...questions]
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
                    range: 'Encuesta_Respuestas!A1',
                    valueInputOption: 'RAW',
                    resource: { values: [headers] }
                })
            }

            // Agregar fila de respuestas
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.sheetId,
                range: 'Encuesta_Respuestas!A:Z',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [row] }
            })

            return true
        } catch (error) {
            console.error('❌ Error al guardar respuesta:', error.message)
            return false
        }
    }
}

const googleService = new GoogleService()
export default googleService



