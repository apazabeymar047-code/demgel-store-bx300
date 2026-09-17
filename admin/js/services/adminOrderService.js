/**
 * SERVICIO ADMINISTRATIVO DE PEDIDOS (ADMIN ORDER SERVICE)
 * FASE 2E: Gestión de pedidos, filtros, transiciones de estado y eventos de auditoría
 * Diseñado como adaptador desacoplado para ser reemplazado posteriormente por Supabase.
 */

const AdminOrderService = (function() {
    const STORAGE_KEY_ORDERS = "demgel_mock_orders";
    const STORAGE_KEY_ADMIN_EVENTS = "demgel_mock_admin_events";
    const STORAGE_KEY_STOCK = "demgel_mock_stock";

    // 6 Estados Oficiales del Sistema
    const ORDER_STATES = {
        PENDING: "PENDIENTE DE PAGO",
        REVIEW: "PAGO EN REVISIÓN",
        CONFIRMED: "PAGO CONFIRMADO",
        READY: "LISTO PARA RETIRAR",
        COMPLETED: "RETIRADO",
        CANCELLED: "CANCELADO"
    };

    // 1. Obtener todos los pedidos con filtros
    function getOrders(filters = {}) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ORDERS);
            let orders = raw ? JSON.parse(raw) : [];

            // Actualizar expiración de pedidos pendientes antes de listar
            orders.forEach(o => {
                if (o.status === ORDER_STATES.PENDING) {
                    checkOrderExpiration(o.id);
                }
            });

            // Re-leer tras posibles expiraciones
            orders = JSON.parse(localStorage.getItem(STORAGE_KEY_ORDERS) || "[]");

            // Filtrar por estado
            if (filters.status && filters.status !== "all") {
                orders = orders.filter(o => o.status === filters.status);
            }

            // Filtrar por campaña de origen (flyer vs directo)
            if (filters.source_campaign && filters.source_campaign !== "all") {
                if (filters.source_campaign === "flyer") {
                    orders = orders.filter(o => o.source_campaign === "flyer");
                } else if (filters.source_campaign === "direct") {
                    orders = orders.filter(o => !o.source_campaign || o.source_campaign === "direct");
                }
            }

            // Filtrar por término de búsqueda (código, cliente, whatsapp)
            if (filters.search && filters.search.trim() !== "") {
                const q = filters.search.toLowerCase().trim();
                orders = orders.filter(o => 
                    (o.order_number && o.order_number.toLowerCase().includes(q)) ||
                    (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
                    (o.customer_phone && o.customer_phone.toLowerCase().includes(q))
                );
            }

            // Ordenar por fecha descendente (más recientes primero)
            orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return orders;
        } catch (e) {
            console.error("Error al obtener pedidos en admin:", e);
            return [];
        }
    }

    // 2. Obtener pedido por ID con detalles completos
    function getOrderById(orderId) {
        try {
            checkOrderExpiration(orderId);
            const raw = localStorage.getItem(STORAGE_KEY_ORDERS);
            const orders = raw ? JSON.parse(raw) : [];
            return orders.find(o => o.id === orderId) || null;
        } catch (e) {
            return null;
        }
    }

    // 3. Chequeo de expiración estricta de 30 minutos
    function checkOrderExpiration(orderId) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ORDERS);
            const orders = raw ? JSON.parse(raw) : [];
            const order = orders.find(o => o.id === orderId);
            if (!order) return false;

            // Solo expiran los pedidos en PENDIENTE DE PAGO que superaron los 30 min
            // PAGO EN REVISIÓN nunca expira (reserva protegida)
            if (order.status === ORDER_STATES.PENDING) {
                const now = new Date();
                const expires = new Date(order.expires_at);
                if (now >= expires) {
                    // Liberar stock al inventario
                    restoreStock(order.items);

                    order.status = ORDER_STATES.CANCELLED;
                    order.admin_notes = "Reserva vencida automáticamente tras cumplirse los 30 minutos (RESERVA EXPIRADA)";
                    order.cancelled_at = now.toISOString();
                    saveOrder(order);

                    logAdminEvent("ORDER_EXPIRED", order.id, {
                        order_number: order.order_number,
                        reason: "RESERVA EXPIRADA"
                    });
                    return true;
                }
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    // 4. Transiciones controladas de estado
    function changeOrderStatus(orderId, newStatus, adminNote = "", adminUser = "Admin Demo") {
        const order = getOrderById(orderId);
        if (!order) {
            return { success: false, error: "ORDER_NOT_FOUND", message: "Pedido no encontrado." };
        }

        const currentStatus = order.status;

        // Validar transiciones permitidas
        const allowedTransitions = {
            [ORDER_STATES.PENDING]: [ORDER_STATES.REVIEW, ORDER_STATES.CANCELLED],
            [ORDER_STATES.REVIEW]: [ORDER_STATES.CONFIRMED, ORDER_STATES.CANCELLED],
            [ORDER_STATES.CONFIRMED]: [ORDER_STATES.READY, ORDER_STATES.CANCELLED],
            [ORDER_STATES.READY]: [ORDER_STATES.COMPLETED, ORDER_STATES.CANCELLED],
            [ORDER_STATES.COMPLETED]: [], // Estado final
            [ORDER_STATES.CANCELLED]: []  // Estado final
        };

        const validTargets = allowedTransitions[currentStatus] || [];
        if (!validTargets.includes(newStatus)) {
            return {
                success: false,
                error: "TRANSICION_NO_PERMITIDA",
                message: `Transición no válida de "${currentStatus}" a "${newStatus}".`
            };
        }

        const now = new Date().toISOString();

        // Acciones específicas según el nuevo estado
        if (newStatus === ORDER_STATES.CONFIRMED) {
            order.status = ORDER_STATES.CONFIRMED;
            order.confirmed_at = now;
            order.confirmed_by = adminUser;
            if (adminNote) order.admin_notes = (order.admin_notes ? order.admin_notes + " | " : "") + adminNote;
        } else if (newStatus === ORDER_STATES.READY) {
            order.status = ORDER_STATES.READY;
            order.ready_at = now;
            order.ready_by = adminUser;
            if (adminNote) order.admin_notes = (order.admin_notes ? order.admin_notes + " | " : "") + adminNote;
        } else if (newStatus === ORDER_STATES.COMPLETED) {
            order.status = ORDER_STATES.COMPLETED;
            order.completed_at = now;
            order.completed_by = adminUser;
            if (adminNote) order.admin_notes = (order.admin_notes ? order.admin_notes + " | " : "") + adminNote;
        } else if (newStatus === ORDER_STATES.CANCELLED) {
            // Requiere motivo obligatorio para cancelación manual
            if (!adminNote || adminNote.trim().length < 3) {
                return {
                    success: false,
                    error: "MOTIVO_REQUERIDO",
                    message: "Es obligatorio especificar el motivo de la cancelación administrativa."
                };
            }

            // Si aún tenía stock reservado, liberarlo
            if ([ORDER_STATES.PENDING, ORDER_STATES.REVIEW, ORDER_STATES.CONFIRMED, ORDER_STATES.READY].includes(currentStatus)) {
                restoreStock(order.items);
            }

            order.status = ORDER_STATES.CANCELLED;
            order.cancelled_at = now;
            order.cancelled_by = adminUser;
            order.admin_notes = (order.admin_notes ? order.admin_notes + " | " : "") + `Cancelado por ${adminUser}: ${adminNote.trim()}`;
        } else if (newStatus === ORDER_STATES.REVIEW) {
            order.status = ORDER_STATES.REVIEW;
        }

        saveOrder(order);

        // Registrar evento en auditoría administrativa
        logAdminEvent("STATUS_CHANGE", order.id, {
            order_number: order.order_number,
            previous_status: currentStatus,
            new_status: newStatus,
            admin_user: adminUser,
            note: adminNote || null
        });

        return {
            success: true,
            order: order,
            message: `Estado actualizado a "${newStatus}" con éxito.`
        };
    }

    // 5. Restablecer stock de ítems
    function restoreStock(items) {
        try {
            const stockMap = JSON.parse(localStorage.getItem(STORAGE_KEY_STOCK) || "{}");
            items.forEach(it => {
                const pId = it.product_id || it.productId;
                const qty = it.quantity || 1;
                stockMap[pId] = (stockMap[pId] || 0) + qty;
            });
            localStorage.setItem(STORAGE_KEY_STOCK, JSON.stringify(stockMap));
        } catch (e) {
            console.error("Error al restaurar stock:", e);
        }
    }

    // 6. Guardar orden
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
            console.error("Error al guardar orden en admin:", e);
        }
    }

    // 7. Registro de logs de auditoría administrativa (Simula tabla event_logs)
    function logAdminEvent(eventType, orderId, details) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ADMIN_EVENTS);
            const events = raw ? JSON.parse(raw) : [];
            const eventEntry = {
                id: "evt_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()),
                event_type: eventType,
                order_id: orderId,
                details: details,
                admin_user: (details && details.admin_user) || "Admin Demo",
                created_at: new Date().toISOString()
            };
            events.unshift(eventEntry); // Más recientes al inicio
            if (events.length > 200) events.length = 200;
            localStorage.setItem(STORAGE_KEY_ADMIN_EVENTS, JSON.stringify(events));
            return eventEntry;
        } catch (e) {
            console.error("Error al registrar log de auditoría:", e);
            return null;
        }
    }

    function getAdminEvents(orderId = null) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ADMIN_EVENTS);
            const events = raw ? JSON.parse(raw) : [];
            if (orderId) {
                return events.filter(e => e.order_id === orderId);
            }
            return events;
        } catch (e) {
            return [];
        }
    }

    return {
        ORDER_STATES,
        getOrders,
        getOrderById,
        checkOrderExpiration,
        changeOrderStatus,
        logAdminEvent,
        getAdminEvents
    };
})();
