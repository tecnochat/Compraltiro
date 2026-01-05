import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api'

/**
 * @class WooCommerceService
 * Gestiona la comunicación con la API de WooCommerce.
 * Permite consultar productos e información de pedidos.
 */
class WooCommerceService {
    constructor() {
        this.api = null
        this.isConfigured = false
        this.cache = {
            products: null,
            categories: null,
            lastUpdate: {
                products: 0,
                categories: 0
            }
        }
        this.cacheExpiry = 5 * 60 * 1000 // 5 minutos

        this.init()
    }

    /**
     * Inicializa la conexión con WooCommerce
     */
    init() {
        const url = process.env.WOOCOMMERCE_URL
        const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY
        const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET

        if (!url || !consumerKey || !consumerSecret) {
            console.log('⚠️ WooCommerce no configurado. Añade las variables en .env')
            return
        }

        try {
            this.api = new WooCommerceRestApi.default({
                url: url,
                consumerKey: consumerKey,
                consumerSecret: consumerSecret,
                version: 'wc/v3'
            })
            this.isConfigured = true
            console.log('🛒 WooCommerce API configurada:', url)
        } catch (error) {
            console.error('❌ Error al configurar WooCommerce:', error.message)
        }
    }

    /**
     * Verifica si el cache es válido
     */
    isCacheValid(type) {
        return Date.now() - this.cache.lastUpdate[type] < this.cacheExpiry
    }

    // ==========================================
    // PRODUCTOS
    // ==========================================

    /**
     * Busca productos por nombre o SKU
     * @param {string} query - Término de búsqueda
     * @returns {Array} Lista de productos encontrados
     */
    async searchProducts(query) {
        if (!this.isConfigured) return []

        try {
            const response = await this.api.get('products', {
                search: query,
                per_page: 10,
                status: 'publish'
            })

            return response.data.map(p => this.formatProduct(p))
        } catch (error) {
            console.error('❌ Error al buscar productos:', error.message)
            return []
        }
    }

    /**
     * Obtiene todos los productos (con cache)
     * @returns {Array} Lista de todos los productos
     */
    async getAllProducts() {
        if (!this.isConfigured) return []

        if (this.isCacheValid('products') && this.cache.products) {
            return this.cache.products
        }

        try {
            const response = await this.api.get('products', {
                per_page: 100,
                status: 'publish'
            })

            this.cache.products = response.data.map(p => this.formatProduct(p))
            this.cache.lastUpdate.products = Date.now()
            console.log(`📦 ${this.cache.products.length} productos cargados de WooCommerce`)

            return this.cache.products
        } catch (error) {
            console.error('❌ Error al obtener productos:', error.message)
            return []
        }
    }

    /**
     * Obtiene un producto por ID
     * @param {number} id - ID del producto
     * @returns {object|null} Producto formateado
     */
    async getProductById(id) {
        if (!this.isConfigured) return null

        try {
            const response = await this.api.get(`products/${id}`)
            return this.formatProduct(response.data)
        } catch (error) {
            console.error('❌ Error al obtener producto:', error.message)
            return null
        }
    }

    /**
     * Verifica el stock de un producto
     * @param {string} productName - Nombre del producto
     * @returns {object} Info de stock
     */
    async checkProductStock(productName) {
        const products = await this.searchProducts(productName)

        if (products.length === 0) {
            return { found: false, message: 'Producto no encontrado' }
        }

        const product = products[0]
        return {
            found: true,
            name: product.name,
            inStock: product.inStock,
            stockQuantity: product.stockQuantity,
            stockStatus: product.stockStatus,
            message: product.inStock
                ? `✅ ${product.name} está disponible (${product.stockQuantity || 'en stock'})`
                : `❌ ${product.name} está agotado`
        }
    }

    /**
     * Obtiene todas las categorías
     * @returns {Array} Lista de categorías
     */
    async getCategories() {
        if (!this.isConfigured) return []

        if (this.isCacheValid('categories') && this.cache.categories) {
            return this.cache.categories
        }

        try {
            const response = await this.api.get('products/categories', {
                per_page: 100
            })

            this.cache.categories = response.data.map(c => ({
                id: c.id,
                name: c.name,
                count: c.count
            }))
            this.cache.lastUpdate.categories = Date.now()

            return this.cache.categories
        } catch (error) {
            console.error('❌ Error al obtener categorías:', error.message)
            return []
        }
    }

    /**
     * Formatea un producto para uso interno
     */
    formatProduct(product) {
        return {
            id: product.id,
            name: product.name,
            slug: product.slug,
            sku: product.sku,
            price: product.price,
            regularPrice: product.regular_price,
            salePrice: product.sale_price,
            onSale: product.on_sale,
            description: product.short_description?.replace(/<[^>]*>/g, '') || '',
            inStock: product.stock_status === 'instock',
            stockStatus: product.stock_status,
            stockQuantity: product.stock_quantity,
            categories: product.categories?.map(c => c.name) || [],
            image: product.images?.[0]?.src || null,
            permalink: product.permalink
        }
    }

    // ==========================================
    // PEDIDOS
    // ==========================================

    /**
     * Busca un pedido por su número
     * @param {string|number} orderNumber - Número del pedido
     * @returns {object|null} Información del pedido
     */
    async getOrderByNumber(orderNumber) {
        if (!this.isConfigured) return null

        try {
            // WooCommerce usa el ID como número de pedido
            const response = await this.api.get(`orders/${orderNumber}`)
            return this.formatOrder(response.data)
        } catch (error) {
            if (error.response?.status === 404) {
                return null // Pedido no encontrado
            }
            console.error('❌ Error al obtener pedido:', error.message)
            return null
        }
    }

    /**
     * Obtiene el estado formateado de un pedido
     * @param {string|number} orderNumber - Número del pedido
     * @returns {object} Info del estado
     */
    async getOrderStatus(orderNumber) {
        const order = await this.getOrderByNumber(orderNumber)

        if (!order) {
            return {
                found: false,
                message: `No encontré el pedido #${orderNumber}. Verifica que el número sea correcto.`
            }
        }

        return {
            found: true,
            orderNumber: order.number,
            status: order.status,
            statusLabel: order.statusLabel,
            total: order.total,
            currency: order.currency,
            dateCreated: order.dateCreated,
            items: order.items,
            message: this.generateOrderStatusMessage(order)
        }
    }

    /**
     * Genera un mensaje legible sobre el estado del pedido
     */
    generateOrderStatusMessage(order) {
        const statusMessages = {
            'pending': `⏳ Tu pedido #${order.number} está **pendiente de pago**. Total: $${order.total}`,
            'processing': `📦 Tu pedido #${order.number} está siendo **preparado para envío**. ¡Pronto lo recibirás!`,
            'on-hold': `⏸️ Tu pedido #${order.number} está **en espera**. Contáctanos si tienes dudas.`,
            'completed': `✅ Tu pedido #${order.number} ha sido **completado y entregado**. ¡Gracias por tu compra!`,
            'cancelled': `❌ Tu pedido #${order.number} fue **cancelado**.`,
            'refunded': `💰 Tu pedido #${order.number} fue **reembolsado**.`,
            'failed': `⚠️ El pago de tu pedido #${order.number} **falló**. Intenta nuevamente.`
        }

        let message = statusMessages[order.status] || `Tu pedido #${order.number} tiene estado: ${order.statusLabel}`

        // Agregar detalle de productos
        if (order.items && order.items.length > 0) {
            message += '\n\n**Productos:**'
            order.items.forEach(item => {
                message += `\n• ${item.name} x${item.quantity}`
            })
        }

        return message
    }

    /**
     * Formatea un pedido para uso interno
     */
    formatOrder(order) {
        const statusLabels = {
            'pending': 'Pendiente de pago',
            'processing': 'En preparación',
            'on-hold': 'En espera',
            'completed': 'Completado',
            'cancelled': 'Cancelado',
            'refunded': 'Reembolsado',
            'failed': 'Fallido'
        }

        return {
            id: order.id,
            number: order.number,
            status: order.status,
            statusLabel: statusLabels[order.status] || order.status,
            total: order.total,
            currency: order.currency,
            dateCreated: order.date_created,
            billing: {
                firstName: order.billing?.first_name,
                lastName: order.billing?.last_name,
                email: order.billing?.email
            },
            items: order.line_items?.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                total: item.total
            })) || []
        }
    }

    // ==========================================
    // UTILIDADES
    // ==========================================

    /**
     * Verifica la conexión con WooCommerce
     */
    async testConnection() {
        if (!this.isConfigured) {
            console.log('⚠️ WooCommerce no está configurado')
            return false
        }

        try {
            await this.api.get('products', { per_page: 1 })
            console.log('✅ Conexión con WooCommerce verificada')
            return true
        } catch (error) {
            console.error('❌ Error de conexión WooCommerce:', error.message)
            return false
        }
    }

    /**
     * Invalida el cache
     */
    invalidateCache() {
        this.cache.products = null
        this.cache.categories = null
        this.cache.lastUpdate.products = 0
        this.cache.lastUpdate.categories = 0
        console.log('🔄 Cache de WooCommerce invalidado')
    }

    /**
     * Genera un resumen del catálogo para la IA
     */
    async getCatalogSummary() {
        const products = await this.getAllProducts()
        const categories = await this.getCategories()

        return {
            totalProducts: products.length,
            categories: categories.map(c => `${c.name} (${c.count})`).join(', '),
            priceRange: {
                min: Math.min(...products.map(p => parseFloat(p.price) || 0)),
                max: Math.max(...products.map(p => parseFloat(p.price) || 0))
            }
        }
    }

    /**
     * Genera el catálogo completo en formato optimizado para inyectar en el prompt de IA
     * @returns {string} Catálogo formateado para el contexto de IA
     */
    async getProductCatalogForAI() {
        const products = await this.getAllProducts()

        if (products.length === 0) {
            return ''
        }

        let catalog = '\n\n=== CATÁLOGO DE PRODUCTOS (INFORMACIÓN EN TIEMPO REAL) ===\n'
        catalog += 'Usa SOLO esta información para responder sobre productos:\n\n'

        products.forEach((p, index) => {
            const stock = p.inStock ? '✅ Disponible' : '❌ Agotado'
            const price = p.onSale
                ? `$${p.salePrice} (antes $${p.regularPrice})`
                : `$${p.price}`
            const categories = p.categories.length > 0 ? ` [${p.categories.join(', ')}]` : ''

            catalog += `${index + 1}. ${p.name}${categories}\n`
            catalog += `   Precio: ${price} | Stock: ${stock}\n`
            if (p.description) {
                catalog += `   Descripción: ${p.description.substring(0, 100)}${p.description.length > 100 ? '...' : ''}\n`
            }
            catalog += '\n'
        })

        catalog += '=== FIN DEL CATÁLOGO ===\n'
        catalog += 'IMPORTANTE: Responde SIEMPRE basándote en este catálogo. Si preguntan por un producto que NO está listado, indica que no lo tenemos disponible.\n'

        return catalog
    }
}

const woocommerceService = new WooCommerceService()
export default woocommerceService
