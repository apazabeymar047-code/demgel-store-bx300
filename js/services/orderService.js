/**
 * SERVICIO DE PEDIDOS (MOCK ORDER SERVICE)
 * FASE 2D: Lógica de creación atómica, idempotencia, reserva de 30 minutos y expiración
 * Diseñado como adaptador desacoplado para ser reemplazado por SupabaseOrderService.
 * 
 * AUTORIDAD DEL TIEMPO Y ESTADO:
 * - Situación actual: MOCK / LOCAL = Simulación en navegador y localStorage para validar UX y flujos.
 * - Futura integración: Supabase (PostgreSQL / Edge Functions) será la AUTORIDAD REAL del tiempo y del stock.
 */

const DemgelOrderService = (function() {
    const STORAGE_KEY_ORDERS = "demgel_mock_orders";
    const STORAGE_KEY_IDEMPOTENCY = "demgel_idempotency_keys";
    const STORAGE_KEY_SEQ = "demgel_order_seq";
    const STORAGE_KEY_STOCK = "demgel_mock_stock";

    // 1. Inicializar stock mock persistente si no existe
    function initStock() {
        try {
            if (!localStorage.getItem(STORAGE_KEY_STOCK)) {
                const stockMap = {};
                DEMGEL_PRODUCTS.forEach(p => {
                    stockMap[p.id] = p.stock;
                });
                localStorage.setItem(STORAGE_KEY_STOCK, JSON.stringify(stockMap));
            }
        } catch (e) {
            console.warn("No se pudo inicializar stock mock en localStorage:", e);
        }
    }

    function getStock(productId) {
        initStock();
        try {
            const stockMap = JSON.parse(localStorage.getItem(STORAGE_KEY_STOCK) || "{}");
            return typeof stockMap[productId] === "number" ? stockMap[productId] : 0;
        } catch (e) {
            return 0;
        }
    }

    function updateStock(productId, delta) {
        initStock();
        try {
            const stockMap = JSON.parse(localStorage.getItem(STORAGE_KEY_STOCK) || "{}");
            stockMap[productId] = (stockMap[productId] || 0) + delta;
            localStorage.setItem(STORAGE_KEY_STOCK, JSON.stringify(stockMap));
        } catch (e) {
            console.error("Error al actualizar stock mock:", e);
        }
    }

    // 2. Generador secuencial de número de pedido: DG-2026-0001
    function getNextOrderNumber() {
        try {
            let seq = parseInt(localStorage.getItem(STORAGE_KEY_SEQ) || "0", 10) + 1;
            localStorage.setItem(STORAGE_KEY_SEQ, seq.toString());
            const year = new Date().getFullYear();
            return `DG-${year}-${seq.toString().padStart(4, "0")}`;
        } catch (e) {
            const rnd = Math.floor(1000 + Math.random() * 9000);
            return `DG-2026-${rnd}`;
        }
    }

    // 3. Crear pedido con reserva de 30 MINUTOS e Idempotencia (Supabase RPC con fallback local)
    async function createOrder(orderPayload) {
        initStock();
        const {
            customer_name,
            customer_phone,
            customer_email,
            payment_method,
            items,
            idempotency_key,
            source_campaign
        } = orderPayload;

        // Validaciones previas
        if (!items || items.length === 0) {
            return { success: false, error: "CARRITO_VACIO", message: "El carrito no puede estar vacío para iniciar checkout." };
        }

        const nameClean = (customer_name && customer_name.trim()) ? customer_name.trim() : "Cliente Demgel";
        const phoneClean = (customer_phone && customer_phone.trim()) ? customer_phone.trim() : "Sin Teléfono";

        if (!["transferencia", "cajavecina"].includes(payment_method)) {
            return { success: false, error: "METODO_INVALIDO", message: "Selecciona un método de pago válido." };
        }

        // Si Supabase está disponible, delegar a create_order_with_reservation
        if (typeof DemgelSupabase !== "undefined") {
            try {
                // Mapear items asegurando que tengan product_id válido
                const rpcItems = items.map(it => {
                    const prod = getProductById(it.productId || it.product_id);
                    return {
                        productId: (prod && prod.id) ? prod.id : (it.productId || it.product_id),
                        quantity: it.quantity
                    };
                });

                const rpcRes = await DemgelSupabase.createOrderWithReservation({
                    customer_name: nameClean,
                    customer_phone: phoneClean,
                    customer_email: customer_email ? customer_email.trim() : null,
                    payment_method: payment_method,
                    source_campaign: source_campaign || "direct",
                    items: rpcItems,
                    idempotency_key: idempotency_key || null
                });

                if (rpcRes && rpcRes.success) {
                    const detailedItems = items.map(it => {
                        const prod = getProductById(it.productId || it.product_id) || {};
                        return {
                            product_id: prod.id || it.productId,
                            product_name: prod.name || "Producto Demgel",
                            model_reference: prod.model_reference || "",
                            image: prod.image || "assets/products/1.png",
                            store_price: prod.store_price || 0,
                            online_price: prod.online_price || 0,
                            quantity: it.quantity,
                            subtotal: (prod.online_price || 0) * it.quantity
                        };
                    });

                    const newOrder = {
                        id: rpcRes.order_id,
                        order_number: rpcRes.order_number,
                        customer_name: nameClean,
                        customer_phone: phoneClean,
                        customer_email: customer_email ? customer_email.trim() : null,
                        payment_method: payment_method,
                        status: "PENDIENTE DE PAGO",
                        total_store_price: rpcRes.total_store_price,
                        total_online_price: rpcRes.total_online_price,
                        total_savings: rpcRes.total_savings,
                        items: detailedItems,
                        source_campaign: source_campaign || "direct",
                        access_token: rpcRes.access_token,
                        idempotency_key: idempotency_key || null,
                        created_at: new Date().toISOString(),
                        expires_at: rpcRes.expires_at,
                        receipt: null,
                        admin_notes: null
                    };

                    saveOrder(newOrder);

                    return {
                        success: true,
                        order: newOrder,
                        is_duplicate_request: rpcRes.is_duplicate_request || false
                    };
                } else if (rpcRes && !rpcRes.success) {
                    return rpcRes;
                }
            } catch (e) {
                console.warn("Fallo RPC Supabase, usando fallback local:", e);
            }
        }

        // --- Fallback Local Mock ---
        return createOrderMock(orderPayload);
    }

    function createOrderMock(orderPayload) {
        const {
            customer_name,
            customer_phone,
            customer_email,
            payment_method,
            items,
            idempotency_key,
            source_campaign
        } = orderPayload;

        if (idempotency_key) {
            try {
                const idempMap = JSON.parse(localStorage.getItem(STORAGE_KEY_IDEMPOTENCY) || "{}");
                if (idempMap[idempotency_key]) {
                    const existingOrder = getOrderById(idempMap[idempotency_key]);
                    if (existingOrder) {
                        return {
                            success: true,
                            order: existingOrder,
                            is_duplicate_request: true
                        };
                    }
                }
            } catch (e) {}
        }

        for (const it of items) {
            const product = getProductById(it.productId);
            if (!product) {
                return { success: false, error: "PRODUCTO_INEXISTENTE", message: `El producto ${it.productId} no existe.` };
            }
            const currentStock = getStock(it.productId);
            if (currentStock < it.quantity) {
                return {
                    success: false,
                    error: "STOCK_INSUFICIENTE",
                    message: `Stock insuficiente para "${product.name}". Disponibles: ${currentStock}`
                };
            }
        }

        let totalStore = 0;
        let totalOnline = 0;
        const detailedItems = [];

        for (const it of items) {
            const product = getProductById(it.productId);
            const subtotalOnline = product.online_price * it.quantity;
            const subtotalStore = product.store_price * it.quantity;

            totalStore += subtotalStore;
            totalOnline += subtotalOnline;

            updateStock(it.productId, -it.quantity);

            detailedItems.push({
                product_id: product.id,
                product_name: product.name,
                model_reference: product.model_reference,
                image: product.image,
                store_price: product.store_price,
                online_price: product.online_price,
                quantity: it.quantity,
                subtotal: subtotalOnline
            });
        }

        const totalSavings = totalStore - totalOnline;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

        const orderId = "ord_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());
        const orderNumber = getNextOrderNumber();
        const accessToken = "tok_" + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).substring(2));

        const nameClean = (customer_name && customer_name.trim()) ? customer_name.trim() : "Cliente Demgel";
        const phoneClean = (customer_phone && customer_phone.trim()) ? customer_phone.trim() : "Sin Teléfono";

        const newOrder = {
            id: orderId,
            order_number: orderNumber,
            customer_name: nameClean,
            customer_phone: phoneClean,
            customer_email: customer_email ? customer_email.trim() : null,
            payment_method: payment_method,
            status: "PENDIENTE DE PAGO",
            total_store_price: totalStore,
            total_online_price: totalOnline,
            total_savings: totalSavings,
            items: detailedItems,
            source_campaign: source_campaign || "direct",
            access_token: accessToken,
            idempotency_key: idempotency_key || null,
            created_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            receipt: null,
            admin_notes: null
        };

        saveOrder(newOrder);

        if (idempotency_key) {
            try {
                const idempMap = JSON.parse(localStorage.getItem(STORAGE_KEY_IDEMPOTENCY) || "{}");
                idempMap[idempotency_key] = orderId;
                localStorage.setItem(STORAGE_KEY_IDEMPOTENCY, JSON.stringify(idempMap));
            } catch (e) {}
        }

        return {
            success: true,
            order: newOrder,
            is_duplicate_request: false
        };
    }

    // 4. Guardar y Obtener Órdenes
    function saveOrder(order) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ORDERS);
            const orders = raw ? JSON.parse(raw) : [];
            const idx = orders.findIndex(o => o.id === order.id);
            if (idx >= 0) {
                orders[idx] = order;
            } else {
                orders.push(order);
            }
            localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(orders));
        } catch (e) {
            console.error("Error al guardar orden en localStorage:", e);
        }
    }

    function getOrderById(orderId) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ORDERS);
            const orders = raw ? JSON.parse(raw) : [];
            return orders.find(o => o.id === orderId) || null;
        } catch (e) {
            return null;
        }
    }

    // Acceso seguro por ID y Access Token (Supabase RPC con fallback local)
    async function getOrderByToken(orderId, accessToken) {
        if (typeof DemgelSupabase !== "undefined") {
            try {
                const remoteOrder = await DemgelSupabase.getOrderByToken(orderId, accessToken);
                if (remoteOrder) {
                    saveOrder(remoteOrder);
                    return remoteOrder;
                }
            } catch (e) {
                console.warn("Fallo getOrderByToken Supabase, usando local:", e);
            }
        }

        // Chequeo de expiración y fallback local
        checkOrderExpiration(orderId);
        const order = getOrderById(orderId);
        if (!order) return null;
        if (order.access_token !== accessToken) return null;
        return order;
    }

    // 5. Expiración de 30 Minutos y Liberación de Stock
    function checkOrderExpiration(orderId) {
        const order = getOrderById(orderId);
        if (!order) return false;

        if (order.status === "PENDIENTE DE PAGO") {
            const now = new Date();
            const expires = new Date(order.expires_at);
            if (now >= expires) {
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach(it => {
                        updateStock(it.product_id || it.productId, it.quantity);
                    });
                }

                order.status = "CANCELADO";
                order.admin_notes = "Reserva vencida automáticamente tras cumplirse los 30 minutos (RESERVA EXPIRADA)";
                order.cancelled_at = now.toISOString();
                saveOrder(order);

                DemgelAnalytics.trackOrderExpired(order);
                return true;
            }
        }
        return false;
    }

    // 6. Subida y Asociación de Comprobante
    async function submitReceipt(orderId, accessToken, receiptData) {
        // Si Supabase está disponible y se subió el path a Storage
        if (typeof DemgelSupabase !== "undefined" && receiptData && receiptData.storagePath) {
            try {
                const rpcRes = await DemgelSupabase.submitOrderReceipt(
                    orderId,
                    accessToken,
                    receiptData.storagePath,
                    receiptData.fileType || "application/octet-stream"
                );

                if (rpcRes && rpcRes.success) {
                    const order = getOrderById(orderId) || {};
                    order.status = "PAGO EN REVISIÓN";
                    order.receipt_path = receiptData.storagePath;
                    order.receipt = {
                        fileName: receiptData.fileName,
                        fileType: receiptData.fileType,
                        fileSize: receiptData.fileSize,
                        previewUrl: receiptData.previewUrl,
                        storagePath: receiptData.storagePath,
                        uploadedAt: new Date().toISOString()
                    };
                    saveOrder(order);
                    DemgelAnalytics.trackReceiptUploaded(order);
                    return {
                        success: true,
                        status: "PAGO EN REVISIÓN",
                        order: order,
                        message: rpcRes.message || "Comprobante recibido con éxito. En revisión por tienda."
                    };
                } else if (rpcRes && !rpcRes.success) {
                    return rpcRes;
                }
            } catch (e) {
                console.warn("Fallo submitReceipt en Supabase:", e);
            }
        }

        // Fallback local mock
        checkOrderExpiration(orderId);
        const order = getOrderById(orderId);

        if (!order || order.access_token !== accessToken) {
            return { success: false, error: "NO_AUTORIZADO", message: "Acceso no válido al pedido." };
        }

        if (order.status === "CANCELADO") {
            return {
                success: false,
                error: "RESERVA_EXPIRADA",
                message: "Esta reserva ya venció y el pedido fue cancelado. No es posible asociar este comprobante a esta reserva."
            };
        }

        if (order.status !== "PENDIENTE DE PAGO") {
            return {
                success: true,
                status: order.status,
                already_processed: true,
                message: "El comprobante ya fue recibido para este pedido."
            };
        }

        order.receipt = {
            fileName: receiptData.fileName,
            fileType: receiptData.fileType,
            fileSize: receiptData.fileSize,
            previewUrl: receiptData.previewUrl,
            uploadedAt: new Date().toISOString()
        };
        order.status = "PAGO EN REVISIÓN";
        saveOrder(order);

        DemgelAnalytics.trackReceiptUploaded(order);

        return {
            success: true,
            status: "PAGO EN REVISIÓN",
            order: order,
            message: "Comprobante recibido. Estamos verificando tu pago."
        };
    }

    return {
        initStock,
        getStock,
        createOrder,
        createOrderMock,
        getOrderById,
        getOrderByToken,
        checkOrderExpiration,
        submitReceipt
    };
})();
