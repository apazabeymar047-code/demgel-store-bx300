/**
 * SERVICIO ADMINISTRATIVO DE ANALÍTICA (ADMIN ANALYTICS SERVICE)
 * FASE 2E: Embudo comercial, KPIs de conversión y métricas operativas
 * NOTA: Métricas calculadas en base a eventos y pedidos locales (ENTORNO MOCK/DEMO).
 * Diseñado como adaptador desacoplado para ser reemplazado posteriormente por Supabase/PostgreSQL.
 */

const AdminAnalyticsService = (function() {
    const STORAGE_KEY_ORDERS = "demgel_mock_orders";
    const STORAGE_KEY_EVENTS = "demgel_local_analytics_events";

    function getMetrics() {
        try {
            const rawOrders = localStorage.getItem(STORAGE_KEY_ORDERS);
            const orders = rawOrders ? JSON.parse(rawOrders) : [];

            const rawEvents = localStorage.getItem(STORAGE_KEY_EVENTS);
            const events = rawEvents ? JSON.parse(rawEvents) : [];

            // 1. Conteo por estado de pedidos
            const statusCounts = {
                pending: 0,    // PENDIENTE DE PAGO
                review: 0,     // PAGO EN REVISIÓN
                confirmed: 0,  // PAGO CONFIRMADO
                ready: 0,      // LISTO PARA RETIRAR
                completed: 0,  // RETIRADO
                cancelled: 0   // CANCELADO
            };

            let grossOnlineSales = 0;
            let totalCustomerSavings = 0;
            let flyerOrdersCount = 0;
            let directOrdersCount = 0;

            orders.forEach(o => {
                switch (o.status) {
                    case "PENDIENTE DE PAGO":
                        statusCounts.pending++;
                        break;
                    case "PAGO EN REVISIÓN":
                        statusCounts.review++;
                        break;
                    case "PAGO CONFIRMADO":
                        statusCounts.confirmed++;
                        grossOnlineSales += (o.total_online_price || 0);
                        totalCustomerSavings += (o.total_savings || 0);
                        break;
                    case "LISTO PARA RETIRAR":
                        statusCounts.ready++;
                        grossOnlineSales += (o.total_online_price || 0);
                        totalCustomerSavings += (o.total_savings || 0);
                        break;
                    case "RETIRADO":
                        statusCounts.completed++;
                        grossOnlineSales += (o.total_online_price || 0);
                        totalCustomerSavings += (o.total_savings || 0);
                        break;
                    case "CANCELADO":
                        statusCounts.cancelled++;
                        break;
                }

                if (o.source_campaign === "flyer") {
                    flyerOrdersCount++;
                } else {
                    directOrdersCount++;
                }
            });

            // 2. Conteo de eventos del embudo comercial
            const funnelEvents = {
                qr_scans_flyer: 0,
                product_views: 0,
                cart_additions: 0,
                checkout_started: 0,
                orders_created: orders.length,
                receipts_submitted: 0
            };

            events.forEach(e => {
                if (e.event === "qr_flyer_visit") funnelEvents.qr_scans_flyer++;
                if (e.event === "product_viewed") funnelEvents.product_views++;
                if (e.event === "product_added_to_cart") funnelEvents.cart_additions++;
                if (e.event === "checkout_started") funnelEvents.checkout_started++;
                if (e.event === "receipt_upload_success") funnelEvents.receipts_submitted++;
            });

            // Si es un entorno de demostración fresco y los eventos de sesión son menores que las órdenes:
            // Asegurar coherencia visual de piso mínima
            if (funnelEvents.qr_scans_flyer === 0 && flyerOrdersCount > 0) {
                funnelEvents.qr_scans_flyer = flyerOrdersCount;
            }
            if (funnelEvents.receipts_submitted === 0) {
                funnelEvents.receipts_submitted = orders.filter(o => o.receipt !== null).length;
            }

            // 3. Productos con stock bajo
            const products = AdminProductService.getProducts();
            const lowStockProducts = products.filter(p => p.stock <= 5);

            return {
                is_demo_mock: true,
                total_orders: orders.length,
                status_counts: statusCounts,
                gross_online_sales: grossOnlineSales,
                total_customer_savings: totalCustomerSavings,
                flyer_orders_count: flyerOrdersCount,
                direct_orders_count: directOrdersCount,
                low_stock_count: lowStockProducts.length,
                low_stock_products: lowStockProducts,
                funnel: {
                    flyer_scans: Math.max(funnelEvents.qr_scans_flyer, flyerOrdersCount),
                    product_views: Math.max(funnelEvents.product_views, orders.length * 2),
                    cart_adds: Math.max(funnelEvents.cart_additions, orders.length),
                    checkout_starts: Math.max(funnelEvents.checkout_started, orders.length),
                    orders_created: orders.length,
                    receipts_uploaded: funnelEvents.receipts_submitted,
                    orders_confirmed: statusCounts.confirmed + statusCounts.ready + statusCounts.completed,
                    orders_completed: statusCounts.completed
                }
            };
        } catch (e) {
            console.error("Error al calcular analítica:", e);
            return {
                is_demo_mock: true,
                total_orders: 0,
                status_counts: { pending: 0, review: 0, confirmed: 0, ready: 0, completed: 0, cancelled: 0 },
                gross_online_sales: 0,
                total_customer_savings: 0,
                flyer_orders_count: 0,
                direct_orders_count: 0,
                low_stock_count: 0,
                low_stock_products: [],
                funnel: { flyer_scans: 0, product_views: 0, cart_adds: 0, checkout_starts: 0, orders_created: 0, receipts_uploaded: 0, orders_confirmed: 0, orders_completed: 0 }
            };
        }
    }

    return {
        getMetrics
    };
})();
