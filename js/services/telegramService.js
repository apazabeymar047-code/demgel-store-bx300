/**
 * SERVICIO OFICIAL TELEGRAM BOT - DEMGEL STORE
 * Permite enviar notificaciones en tiempo real de nuevos pedidos y comprobantes de pago
 * directamente al Telegram del administrador.
 */

const DemgelTelegramService = (function() {
    const BOT_TOKEN = "8992939198:AAHM_7YQbAQp2zjtcB6SGuc9J_LqBGUEvHE";
    const CHAT_ID = "7057646572";
    const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

    // 1. Notificación de Nuevo Pedido Creado
    async function notifyNewOrder(order) {
        if (!order) return { success: false };

        const itemsText = (order.items || []).map(it => 
            `  • <b>${it.product_name || 'Producto'}</b> (Ref: ${it.model_reference || 'S/M'}) x${it.quantity} - <b>${formatCLP(it.subtotal || it.online_price * it.quantity)}</b>`
        ).join("\n");

        const msgHtml = `
🛍️ <b>¡NUEVO PEDIDO RESERVADO EN LA TIENDA!</b>

📌 <b>Código de Retiro:</b> <code>${order.order_number || order.id}</code>
👤 <b>Cliente:</b> <b>${order.customer_name || 'Cliente Demgel'}</b>
💳 <b>Método de Pago:</b> ${order.payment_method === 'transferencia' ? '🏦 Transferencia Bancaria' : '🏪 CajaVecina'}
⏱️ <b>Reserva:</b> Stock reservado por 30 minutos

🛒 <b>Detalle de la Compra:</b>
${itemsText}

💰 <b>TOTAL A PAGAR:</b> <b>${formatCLP(order.total_online_price)}</b>
🏷️ <i>Ahorro Online otorgado: ${formatCLP(order.total_savings)}</i>
        `.trim();

        return await sendTextMessage(msgHtml);
    }

    // 2. Notificación de Comprobante de Pago Recibido (Con Foto o PDF)
    async function notifyReceiptUploaded(order, receiptData, rawFile = null) {
        if (!order) return { success: false };

        const caption = `
📸 <b>¡COMPROBANTE DE PAGO RECIBIDO!</b>

📌 <b>Pedido:</b> <code>${order.order_number || order.id}</code>
👤 <b>Cliente:</b> ${order.customer_name || 'Cliente Demgel'}
💰 <b>Monto a Verificar:</b> <b>${formatCLP(order.total_online_price)}</b>
💳 <b>Método:</b> ${order.payment_method === 'transferencia' ? 'Transferencia' : 'CajaVecina'}
📄 <b>Archivo:</b> ${receiptData.fileName || 'Comprobante'} (${receiptData.fileSize || ''})

⚡ <i>El comprobante ya está listo para ser revisado por la tienda.</i>
        `.trim();

        // Si tenemos el archivo físico (Blob/File)
        const fileToUpload = rawFile || (receiptData && receiptData.rawFile);

        if (fileToUpload) {
            if (receiptData.isPdf || fileToUpload.type === "application/pdf") {
                return await sendDocument(fileToUpload, caption);
            } else {
                return await sendPhoto(fileToUpload, caption);
            }
        } 
        // Si tenemos previsualización Base64
        else if (receiptData && receiptData.previewUrl && receiptData.previewUrl.startsWith("data:image")) {
            try {
                const blob = await (await fetch(receiptData.previewUrl)).blob();
                return await sendPhoto(blob, caption);
            } catch (e) {
                console.warn("No se pudo convertir Base64 a Blob, enviando como texto:", e);
            }
        }

        return await sendTextMessage(caption);
    }

    // Helper: Enviar Mensaje HTML
    async function sendTextMessage(textHtml) {
        try {
            const res = await fetch(`${API_BASE}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: textHtml,
                    parse_mode: "HTML",
                    disable_web_page_preview: true
                })
            });
            const data = await res.json();
            return { success: data.ok, result: data.result, error: data.description };
        } catch (err) {
            console.error("DemgelTelegramService Error:", err);
            return { success: false, error: err.message };
        }
    }

    // Helper: Enviar Foto (Multipart)
    async function sendPhoto(photoFileOrBlob, captionHtml) {
        try {
            const formData = new FormData();
            formData.append("chat_id", CHAT_ID);
            formData.append("photo", photoFileOrBlob, "comprobante.jpg");
            formData.append("caption", captionHtml);
            formData.append("parse_mode", "HTML");

            const res = await fetch(`${API_BASE}/sendPhoto`, {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            return { success: data.ok, result: data.result, error: data.description };
        } catch (err) {
            console.error("DemgelTelegramService sendPhoto Error:", err);
            return { success: false, error: err.message };
        }
    }

    // Helper: Enviar Documento PDF (Multipart)
    async function sendDocument(docFileOrBlob, captionHtml) {
        try {
            const formData = new FormData();
            formData.append("chat_id", CHAT_ID);
            formData.append("document", docFileOrBlob, docFileOrBlob.name || "comprobante.pdf");
            formData.append("caption", captionHtml);
            formData.append("parse_mode", "HTML");

            const res = await fetch(`${API_BASE}/sendDocument`, {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            return { success: data.ok, result: data.result, error: data.description };
        } catch (err) {
            console.error("DemgelTelegramService sendDocument Error:", err);
            return { success: false, error: err.message };
        }
    }

    // 3. Notificación de Producto Creado o Actualizado
    async function notifyProductCreatedOrUpdated(product, isNew = true) {
        if (!product) return { success: false };

        const titleHeader = isNew ? "📦 <b>¡NUEVO PRODUCTO PUBLICADO EN DEMGEL!</b>" : "✏️ <b>¡PRODUCTO ACTUALIZADO EN DEMGEL!</b>";

        const caption = `
${titleHeader}

🏷️ <b>Nombre:</b> ${product.name}
🔢 <b>Referencia Modelo:</b> <code>${product.model_reference || 'S/M'}</code>
📁 <b>Categoría:</b> ${product.category_name || product.category || 'General'}
🏪 <b>Precio Tienda:</b> ${formatCLP(product.store_price)}
⚡ <b>Precio Online:</b> <b>${formatCLP(product.online_price)}</b>
📦 <b>Stock Disponible:</b> ${product.stock} unidades
✅ <b>Estado:</b> ${product.is_active ? 'Activo en Catálogo' : 'Inactivo'}

✨ <i>El catálogo público ya fue actualizado automáticamente.</i>
        `.trim();

        // Si la imagen es un Base64 DataURL, intentar enviarla como foto
        if (product.image && product.image.startsWith("data:image")) {
            try {
                const blob = await (await fetch(product.image)).blob();
                return await sendPhoto(blob, caption);
            } catch (e) {
                console.warn("No se pudo enviar foto Base64 a Telegram, enviando texto:", e);
            }
        }

        return await sendTextMessage(caption);
    }

    return {
        BOT_TOKEN,
        CHAT_ID,
        notifyNewOrder,
        notifyReceiptUploaded,
        notifyProductCreatedOrUpdated,
        sendTextMessage
    };
})();
