/**
 * Script para extraer productos de compraltiro.cl
 * Genera un archivo CSV compatible con WooCommerce
 * 
 * Uso: node scripts/scrape-products.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Productos extraídos de compraltiro.cl
const products = [
    {
        name: "3 Ligas Ejercicio Bandas Resistencia Gym Piernas Gluteos",
        regular_price: "10990",
        sale_price: "6990",
        description: "Set de 3 ligas de ejercicio para entrenamiento de piernas y glúteos. Diferentes niveles de resistencia.",
        short_description: "Bandas de resistencia para ejercicios de piernas y glúteos",
        categories: "Deportes",
        sku: "LIGA-GYM-001",
        stock: "50",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/ligas-ejercicio.jpg"
    },
    {
        name: "Antena de TV digital amplificada para uso interior y exterior",
        regular_price: "7990",
        sale_price: "6990",
        description: "Antena digital HD amplificada. Compatible con señales UHF/VHF. Ideal para interior y exterior.",
        short_description: "Antena TV digital HD amplificada",
        categories: "Electrónica",
        sku: "ANT-TV-001",
        stock: "30",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/antena-tv.jpg"
    },
    {
        name: "Antena Tv Digital Interior Hd Amplificada Por Usb",
        regular_price: "15990",
        sale_price: "12990",
        description: "Antena TV digital HD con amplificador USB. Captación de señales digitales de alta definición.",
        short_description: "Antena digital HD con amplificador USB",
        categories: "Electrónica",
        sku: "ANT-USB-002",
        stock: "25",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/antena-usb.jpg"
    },
    {
        name: "Audífono Amplificador Auxiliar Auditivo Sordera Ha20",
        regular_price: "7990",
        sale_price: "5990",
        description: "Audífono amplificador de sonido modelo HA20. Discreto y cómodo. Incluye baterías.",
        short_description: "Amplificador auditivo discreto",
        categories: "Salud",
        sku: "AUD-HA20-001",
        stock: "40",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/audifono-ha20.jpg"
    },
    {
        name: "Audifono Runner Bluetooth 5.3 Air-pro",
        regular_price: "16990",
        sale_price: "12990",
        description: "Audífonos inalámbricos Bluetooth 5.3 para deportistas. Resistentes al sudor y agua.",
        short_description: "Audífonos Bluetooth 5.3 deportivos",
        categories: "Electrónica",
        sku: "AUD-BT-001",
        stock: "35",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/audifono-runner.jpg"
    },
    {
        name: "Auriculares de Conducción Ósea Con Bluetooth",
        regular_price: "16990",
        sale_price: "10990",
        description: "Auriculares de conducción ósea Bluetooth. No bloquean el oído, ideales para deportes.",
        short_description: "Auriculares conducción ósea Bluetooth",
        categories: "Electrónica",
        sku: "AUR-OSE-001",
        stock: "20",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/auriculares-osea.jpg"
    },
    {
        name: "Basta! Juego De Mesa Piensa Rápido",
        regular_price: "17990",
        sale_price: "7990",
        description: "Juego de mesa Basta! para toda la familia. Piensa rápido y gana. 2-6 jugadores.",
        short_description: "Juego de mesa familiar",
        categories: "Juegos",
        sku: "JUE-BASTA-001",
        stock: "45",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/basta-juego.jpg"
    },
    {
        name: "Cepillo Peine Secador Pelo Alisador Eléctrico 3 En 1 Negro",
        regular_price: "14990",
        sale_price: "10990",
        description: "Cepillo secador 3 en 1: seca, alisa y da volumen. Tecnología iónica. Color negro.",
        short_description: "Cepillo secador alisador 3 en 1",
        categories: "Belleza",
        sku: "CEP-SEC-001",
        stock: "30",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/cepillo-secador.jpg"
    },
    {
        name: "Corrector De Postura De Espalda Acolchada Unisex Ajustable Negro",
        regular_price: "12990",
        sale_price: "7990",
        description: "Corrector de postura acolchado. Ajustable unisex. Alivia dolores de espalda.",
        short_description: "Corrector de postura acolchado ajustable",
        categories: "Salud",
        sku: "COR-POS-001",
        stock: "55",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/corrector-postura.jpg"
    },
    {
        name: "Dispensador Agua Electrico Usb Color Blanco",
        regular_price: "12990",
        sale_price: "8990",
        description: "Dispensador de agua eléctrico recargable por USB. Compatible con bidones. Color blanco.",
        short_description: "Dispensador agua eléctrico USB",
        categories: "Hogar",
        sku: "DIS-AGU-001",
        stock: "60",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/dispensador-blanco.jpg"
    },
    {
        name: "Dispensador Agua Usb Recargable 100l Color Negro",
        regular_price: "12990",
        sale_price: "8990",
        description: "Dispensador de agua USB recargable. Capacidad para bidones de hasta 100L. Negro.",
        short_description: "Dispensador agua recargable negro",
        categories: "Hogar",
        sku: "DIS-AGU-002",
        stock: "50",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/dispensador-negro.jpg"
    },
    {
        name: "Dispensador De Agua Usb",
        regular_price: "8990",
        sale_price: "5990",
        description: "Dispensador de agua portátil con carga USB. Fácil instalación en cualquier bidón.",
        short_description: "Dispensador agua USB portátil",
        categories: "Hogar",
        sku: "DIS-AGU-003",
        stock: "70",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/dispensador-usb.jpg"
    },
    {
        name: "Fortalecedor De Dedos Entrenamiento De Antebrazo",
        regular_price: "7990",
        sale_price: "5690",
        description: "Fortalecedor de dedos y antebrazo. Resistencia ajustable. Ideal para músicos y deportistas.",
        short_description: "Ejercitador de dedos y antebrazo",
        categories: "Deportes",
        sku: "FOR-DED-001",
        stock: "40",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/fortalecedor-dedos.jpg"
    },
    {
        name: "Corrector De Postura Espalda Unisex Con Imanes",
        regular_price: "14990",
        sale_price: "9990",
        description: "Corrector de postura con imanes terapéuticos. Unisex ajustable. Mejora la postura.",
        short_description: "Corrector postura magnético",
        categories: "Salud",
        sku: "COR-MAG-002",
        stock: "35",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/corrector-imanes.jpg"
    },
    {
        name: "Destapador De Cañerías Baños Wc Tinas Fregadero",
        regular_price: "9990",
        sale_price: "6990",
        description: "Destapador de cañerías profesional. Funciona en baños, WC, tinas y fregaderos.",
        short_description: "Destapador de cañerías multiuso",
        categories: "Hogar",
        sku: "DES-CAN-001",
        stock: "45",
        images: "https://www.compraltiro.cl/wp-content/uploads/2024/01/destapador.jpg"
    }
];

// Generar CSV compatible con WooCommerce
function generateWooCommerceCSV() {
    const headers = [
        'ID',
        'Type',
        'SKU',
        'Name',
        'Published',
        'Is featured?',
        'Visibility in catalog',
        'Short description',
        'Description',
        'Date sale price starts',
        'Date sale price ends',
        'Tax status',
        'Tax class',
        'In stock?',
        'Stock',
        'Backorders allowed?',
        'Sold individually?',
        'Weight (kg)',
        'Length (cm)',
        'Width (cm)',
        'Height (cm)',
        'Allow customer reviews?',
        'Purchase note',
        'Sale price',
        'Regular price',
        'Categories',
        'Tags',
        'Shipping class',
        'Images',
        'Download limit',
        'Download expiry days',
        'Parent',
        'Grouped products',
        'Upsells',
        'Cross-sells',
        'External URL',
        'Button text',
        'Position'
    ];

    let csvContent = headers.join(',') + '\n';

    products.forEach((product, index) => {
        const row = [
            '',                                    // ID (vacío para nuevo)
            'simple',                              // Type
            product.sku,                           // SKU
            `"${product.name}"`,                   // Name
            '1',                                   // Published
            '0',                                   // Is featured
            'visible',                             // Visibility
            `"${product.short_description}"`,      // Short description
            `"${product.description}"`,            // Description
            '',                                    // Sale start
            '',                                    // Sale end
            'taxable',                             // Tax status
            '',                                    // Tax class
            '1',                                   // In stock
            product.stock,                         // Stock quantity
            '0',                                   // Backorders
            '0',                                   // Sold individually
            '',                                    // Weight
            '',                                    // Length
            '',                                    // Width
            '',                                    // Height
            '1',                                   // Allow reviews
            '',                                    // Purchase note
            product.sale_price,                    // Sale price
            product.regular_price,                 // Regular price
            product.categories,                    // Categories
            '',                                    // Tags
            '',                                    // Shipping class
            product.images,                        // Images
            '',                                    // Download limit
            '',                                    // Download expiry
            '',                                    // Parent
            '',                                    // Grouped products
            '',                                    // Upsells
            '',                                    // Cross-sells
            '',                                    // External URL
            '',                                    // Button text
            index                                  // Position
        ];
        csvContent += row.join(',') + '\n';
    });

    return csvContent;
}

// Guardar archivo
const outputPath = path.join(__dirname, '..', 'products-compraltiro.csv');
const csvContent = generateWooCommerceCSV();

fs.writeFileSync(outputPath, csvContent, 'utf8');

console.log('✅ Archivo CSV generado exitosamente!');
console.log(`📁 Ubicación: ${outputPath}`);
console.log(`📦 Total productos: ${products.length}`);
console.log('\n📋 Instrucciones de importación:');
console.log('1. Ve a tu WordPress Local → WooCommerce → Productos → Importar');
console.log('2. Selecciona el archivo: products-compraltiro.csv');
console.log('3. Mapea las columnas (deberían coincidir automáticamente)');
console.log('4. Ejecuta la importación');
