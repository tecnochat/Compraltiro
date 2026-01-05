import crypto from 'crypto'
import googleService from './googleService.js'

/**
 * @class SalesWebhookService
 * Procesa webhooks de WooCommerce para automatizar el registro de ventas.
 */
class SalesWebhookService {
    constructor() {
        this.webhookSecret = process.env.WOOCOMMERCE_WEBHOOK_SECRET || ''
        this.adapterSend = null // Se inyecta desde app.js
    }

    /**
     * Configura el método para enviar mensajes WhatsApp
     * @param {Function} sendFunction - Función del proveedor para enviar mensajes
     */
    setMessageSender(sendFunction) {
        this.adapterSend = sendFunction
        console.log('📨 SalesWebhook: Sender de mensajes configurado')
    }

    /**
     * Verifica la firma del webhook de WooCommerce
     * @param {string} payload - Body del request
     * @param {string} signature - Header X-WC-Webhook-Signature
     * @returns {boolean}
     */
    verifyWebhookSignature(payload, signature) {
        if (!this.webhookSecret) {
            console.log('⚠️ No hay webhook secret configurado, aceptando sin verificar')
            return true
        }

        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(payload, 'utf8')
            .digest('base64')

        return signature === expectedSignature
    }

    /**
     * Procesa el webhook de una orden nueva o actualizada
     * @param {object} orderData - Datos de la orden de WooCommerce
     * @param {string} event - Tipo de evento (order.created, order.updated)
     */
    async processOrderWebhook(orderData, event) {
        console.log(`🛒 [Webhook] Evento recibido: ${event}`)
        console.log(`🛒 [Webhook] Orden #${orderData.id} - Estado: ${orderData.status}`)

        try {
            // Extraer datos relevantes
            const orderInfo = this.extractOrderInfo(orderData)

            if (event === 'order.created') {
                await this.handleNewOrder(orderInfo)
            } else if (event === 'order.updated') {
                await this.handleOrderUpdate(orderInfo)
            }

            return { success: true, orderId: orderData.id }
        } catch (error) {
            console.error('❌ [Webhook] Error procesando orden:', error.message)
            return { success: false, error: error.message }
        }
    }

    /**
     * Extrae información relevante de la orden
     * @param {object} orderData - Datos crudos de WooCommerce
     */
    extractOrderInfo(orderData) {
        // Obtener teléfono (billing o shipping)
        let phone = orderData.billing?.phone || orderData.shipping?.phone || ''

        // Limpiar teléfono (solo números)
        phone = phone.replace(/\D/g, '')

        // Agregar código de país si no tiene
        if (phone && phone.length <= 10) {
            phone = '56' + phone // Chile por defecto
        }

        // Construir lista de productos
        const productos = (orderData.line_items || [])
            .map(item => `${item.name} x${item.quantity}`)
            .join(', ')

        return {
            orderId: orderData.id,
            orderNumber: orderData.number || orderData.id,
            status: orderData.status,
            phone: phone,
            customerName: `${orderData.billing?.first_name || ''} ${orderData.billing?.last_name || ''}`.trim(),
            email: orderData.billing?.email || '',
            products: productos,
            total: orderData.total,
            currency: orderData.currency,
            dateCreated: orderData.date_created
        }
    }

    /**
     * Maneja una nueva orden
     * @param {object} orderInfo - Información extraída de la orden
     */
    async handleNewOrder(orderInfo) {
        console.log(`📦 [Webhook] Nueva orden #${orderInfo.orderNumber}`)
        console.log(`   Cliente: ${orderInfo.customerName}`)
        console.log(`   Teléfono: ${orderInfo.phone}`)
        console.log(`   Productos: ${orderInfo.products}`)

        // Guardar en Google Sheets
        await googleService.addVenta(orderInfo)

        // Enviar mensaje de confirmación
        if (orderInfo.phone) {
            await this.sendOrderNotification(orderInfo, 'nueva_orden')
        } else {
            console.log('⚠️ [Webhook] No hay teléfono para notificar')
        }
    }

    /**
     * Maneja actualización de estado de orden
     * @param {object} orderInfo - Información extraída de la orden
     */
    async handleOrderUpdate(orderInfo) {
        console.log(`🔄 [Webhook] Orden #${orderInfo.orderNumber} actualizada a: ${orderInfo.status}`)

        // Actualizar en Google Sheets
        await googleService.updateVentaStatus(orderInfo.orderNumber, orderInfo.status)

        // Enviar mensaje según el nuevo estado
        if (orderInfo.phone) {
            await this.sendOrderNotification(orderInfo, orderInfo.status)
        }
    }

    /**
     * Envía notificación WhatsApp al cliente
     * @param {object} orderInfo - Información de la orden
     * @param {string} status - Estado para buscar el mensaje template
     */
    async sendOrderNotification(orderInfo, status) {
        if (!this.adapterSend) {
            console.log('⚠️ [Webhook] No hay sender configurado para WhatsApp')
            return
        }

        try {
            // Obtener mensaje template
            const template = await googleService.getMensajeVenta(status)

            if (!template) {
                console.log(`ℹ️ [Webhook] No hay mensaje configurado para estado: ${status}`)
                return
            }

            // Reemplazar variables en el mensaje
            const message = this.replaceTemplateVariables(template, orderInfo)

            // Formatear número para WhatsApp
            const phoneNumber = orderInfo.phone.includes('@')
                ? orderInfo.phone
                : `${orderInfo.phone}@s.whatsapp.net`

            // Enviar mensaje
            await this.adapterSend(phoneNumber, message)
            console.log(`✅ [Webhook] Mensaje enviado a ${orderInfo.phone}`)

            // Marcar como notificado en Sheets
            await googleService.markVentaNotified(orderInfo.orderNumber)

        } catch (error) {
            console.error('❌ [Webhook] Error enviando notificación:', error.message)
        }
    }

    /**
     * Reemplaza variables en el template del mensaje
     * @param {string} template - Mensaje con variables {order}, {name}, etc.
     * @param {object} orderInfo - Datos de la orden
     */
    replaceTemplateVariables(template, orderInfo) {
        return template
            .replace(/{order}/g, orderInfo.orderNumber)
            .replace(/{name}/g, orderInfo.customerName)
            .replace(/{nombre}/g, orderInfo.customerName)
            .replace(/{products}/g, orderInfo.products)
            .replace(/{productos}/g, orderInfo.products)
            .replace(/{total}/g, `${orderInfo.currency} ${orderInfo.total}`)
            .replace(/{status}/g, this.getStatusLabel(orderInfo.status))
            .replace(/{estado}/g, this.getStatusLabel(orderInfo.status))
    }

    /**
     * Obtiene etiqueta legible del estado
     */
    getStatusLabel(status) {
        const labels = {
            'pending': 'Pendiente de pago',
            'processing': 'En preparación',
            'on-hold': 'En espera',
            'completed': 'Completado',
            'cancelled': 'Cancelado',
            'refunded': 'Reembolsado',
            'failed': 'Fallido'
        }
        return labels[status] || status
    }
}

const salesWebhookService = new SalesWebhookService()
export default salesWebhookService
