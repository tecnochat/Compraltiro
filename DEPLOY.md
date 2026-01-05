# 🚂 Deploy a Railway - Guía Completa

## 📋 Preparación

### 1. Archivos Creados
- ✅ `.gitignore` - Actualizado para excluir archivos sensibles
- ✅ `railway.json` - Configuración de Railway
- ✅ `.env.example` - Template de variables

---

## 🚀 Pasos para Deploy

### 1. Subir a GitHub

```bash
# Inicializar git (si no lo has hecho)
git init

# Agregar todos los archivos
git add .

# Commit inicial
git commit -m "Preparado para Railway deploy"

# Crear rama main
git branch -M main

# Conectar con tu repositorio (crea uno en github.com primero)
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git

# Subir código
git push -u origin main
```

### 2. Crear Proyecto en Railway

1. Ve a [railway.app](https://railway.app) y haz login con GitHub
2. Clic en **"New Project"**
3. Selecciona **"Deploy from GitHub repo"**
4. Elige tu repositorio `compraltiro-chatbot`
5. Railway comenzará el build automáticamente

### 3. Configurar Variables de Entorno

En el dashboard de Railway, ve a la pestaña **"Variables"** y agrega:

```env
GROQ_API_KEY=gsk_2Uod...0HjY
GOOGLE_SHEET_ID=1abc...xyz
GOOGLE_SERVICE_ACCOUNT_EMAIL=tu-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIB...tu_clave...\n-----END PRIVATE KEY-----\n
WOOCOMMERCE_URL=https://tu-tienda.com
WOOCOMMERCE_CONSUMER_KEY=ck_xxxxxxxxxxxxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxxxxxxxxxxx
PORT=3008
```

> ⚠️ **IMPORTANTE:** Para `GOOGLE_PRIVATE_KEY`, copia el valor exacto de tu `.env` local, incluyendo los `\n`.

### 4. Generar Dominio Público

1. En Railway, ve a **Settings**
2. Sección **"Networking"**
3. Clic en **"Generate Domain"**
4. Obtendrás una URL como: `https://compraltiro-chatbot.up.railway.app`

### 5. Actualizar Webhooks en WooCommerce

Ve a tu panel de WooCommerce: **WooCommerce → Configuración → Avanzado → Webhooks**

**Webhook 1: Order Created**
- URL: `https://tu-proyecto.up.railway.app/v1/webhook/woocommerce`
- Tópico: `Order created`
- Estado: `Activo`

**Webhook 2: Order Updated**  
- URL: `https://tu-proyecto.up.railway.app/v1/webhook/woocommerce`
- Tópico: `Order updated`
- Estado: `Activo`

### 6. Conectar WhatsApp

Una vez desplegado:

1. Revisa los **Logs** en Railway
2. Busca el QR code en los logs
3. Escanéalo con WhatsApp Business
4. El bot quedará conectado

> 💡 **Tip:** En producción, Railway mantiene la sesión de WhatsApp automáticamente.

---

## 🔍 Verificación

### Revisar Logs
```
Railway Dashboard → Tu Proyecto → Deployments → Ver Logs
```

Deberías ver:
```
🚀 Iniciando bot...
✅ Google Sheets inicializado
📦 Sistema de ventas configurado
🌐 Servidor HTTP escuchando en puerto 3008
```

### Probar Endpoints

```bash
# Verificar que el servidor responde
curl https://tu-proyecto.up.railway.app/v1/stats

# Debería retornar JSON con estadísticas
```

---

## ⚡ Comandos Útiles

```bash
# Ver logs en tiempo real
railway logs

# Forzar redeploy
railway up --detach

# Ver variables de entorno
railway variables
```

---

## 🐛 Troubleshooting

### Error: "Module not found"
- Verifica que `package.json` tenga `"type": "module"`
- Asegúrate de que todas las dependencias estén en `package.json`

### Error: Google Sheets
- Verifica que `GOOGLE_PRIVATE_KEY` tenga los `\n` correctos
- Confirma que el Service Account tenga acceso al Sheet

### Webhook no funciona
- Verifica que la URL en WooCommerce sea correcta
- Revisa los logs de Railway cuando hagas una compra de prueba

### WhatsApp desconectado
- Revisa los logs para el QR code
- Vuelve a escanear si es necesario

---

## 📊 Monitoreo

Railway muestra:
- **CPU Usage**
- **Memory Usage**  
- **Network Traffic**
- **Logs en tiempo real**

---

## 🔄 Actualizar el Bot

```bash
# Hacer cambios en tu código local
git add .
git commit -m "Actualización de features"
git push

# Railway hará redeploy automáticamente
```

---

## 💰 Costos

- **Starter Plan (Free):** $5 USD/mes de crédito
- **Developer Plan:** $5 USD/mes base + uso
- **Team Plan:** Desde $20 USD/mes

Este proyecto usa ~100-200MB RAM y consume poco CPU, ideal para el plan free.

---

## ✅ Checklist Final

- [ ] Código subido a GitHub
- [ ] Proyecto creado en Railway
- [ ] Variables de entorno configuradas
- [ ] Dominio generado
- [ ] Webhooks actualizados en WooCommerce
- [ ] WhatsApp conectado
- [ ] Prueba de compra exitosa
- [ ] Logs sin errores

---

¡Todo listo! Tu chatbot está en producción 🎉
