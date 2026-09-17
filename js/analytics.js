/**
 * ANALÍTICA LOCAL Y SEGUIMIENTO DE CAMPAÑAS (QR)
 * FASE 2C / 2D: Capa de eventos comerciales para seguimiento del embudo
 */

const DemgelAnalytics = (function() {
    const STORAGE_KEY_CAMPAIGN = "demgel_campaign_source";
    const STORAGE_KEY_EVENTS = "demgel_local_events";
    const SESSION_KEY_VISIT_LOGGED = "demgel_visit_logged";
    const SESSION_KEY_VIEWED_PRODS = "demgel_viewed_prods";

    function initCampaignTracking() {
        const urlParams = new URLSearchParams(window.location.search);
        const source = urlParams.get("source");
        if (source) {
            sessionStorage.setItem(STORAGE_KEY_CAMPAIGN, source.toLowerCase().trim());
        }
    }

    function getCampaignSource() {
        return sessionStorage.getItem(STORAGE_KEY_CAMPAIGN) || "direct";
    }

    function logEvent(eventType, metadata = {}) {
        const campaign = getCampaignSource();
        const payload = {
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            event_type: eventType,
            campaign_source: campaign,
            metadata: metadata,
            timestamp: new Date().toISOString()
        };

        try {
            const raw = localStorage.getItem(STORAGE_KEY_EVENTS);
            const events = raw ? JSON.parse(raw) : [];
            events.push(payload);
            if (events.length > 80) events.shift(); // Mantener hasta 80 eventos
            localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(events));
        } catch (e) {
            console.warn("Storage no disponible para analítica:", e);
        }

        // Envío asíncrono no sensible a Supabase event_logs
        if (typeof DemgelSupabase !== "undefined" && DemgelSupabase.logEvent) {
            try {
                let sessId = sessionStorage.getItem("demgel_session_id");
                if (!sessId) {
                    sessId = "sess_" + (crypto.randomUUID ? crypto.randomUUID().substring(0, 8) : Math.random().toString(36).substring(2, 10));
                    sessionStorage.setItem("demgel_session_id", sessId);
                }
                DemgelSupabase.logEvent(sessId, eventType, {
                    campaign_source: campaign,
                    ...metadata
                });
            } catch (err) {}
        }

        console.log(`[Demgel Analytics] ${eventType}:`, payload);
    }


    function trackVisit(pageName) {
        if (!sessionStorage.getItem(SESSION_KEY_VISIT_LOGGED)) {
            sessionStorage.setItem(SESSION_KEY_VISIT_LOGGED, "true");
            logEvent("visita", {
                page: pageName,
                referrer: document.referrer || "direct",
                screen_width: window.innerWidth
            });
        }
    }

    function trackProductView(product) {
        if (!product) return;
        let viewed = [];
        try {
            viewed = JSON.parse(sessionStorage.getItem(SESSION_KEY_VIEWED_PRODS) || "[]");
        } catch (e) {}

        if (!viewed.includes(product.id)) {
            viewed.push(product.id);
            sessionStorage.setItem(SESSION_KEY_VIEWED_PRODS, JSON.stringify(viewed));
            logEvent("producto_visto", {
                product_id: product.id,
                name: product.name,
                model: product.model_reference,
                online_price: product.online_price,
                store_price: product.store_price
            });
        }
    }

    function trackAddToCart(product, quantity = 1) {
        logEvent("carrito_agregado", {
            product_id: product.id,
            name: product.name,
            quantity: quantity,
            online_price: product.online_price
        });
    }

    function trackCheckoutStarted(cartSummary) {
        logEvent("checkout_started", {
            total_items: cartSummary.totalItems,
            total_online: cartSummary.totalOnline,
            total_savings: cartSummary.totalSavings
        });
    }

    function trackPaymentMethodSelected(method) {
        logEvent("payment_method_selected", { method: method });
    }

    function trackCustomerCompleted(customerPhone) {
        logEvent("checkout_customer_completed", {
            phone_hash: btoa(customerPhone).substring(0, 10)
        });
    }

    function trackOrderCreated(order) {
        logEvent("order_created", {
            order_id: order.id,
            order_number: order.order_number,
            total_online: order.total_online_price,
            total_savings: order.total_savings,
            expires_at: order.expires_at,
            campaign: order.source_campaign
        });
    }

    function trackReceiptUploadStarted(orderId) {
        logEvent("receipt_upload_started", { order_id: orderId });
    }

    function trackReceiptUploaded(order) {
        logEvent("receipt_uploaded", {
            order_id: order.id,
            order_number: order.order_number,
            file_type: order.receipt ? order.receipt.fileType : null
        });
    }

    function trackOrderExpired(order) {
        logEvent("order_expired", {
            order_id: order.id,
            order_number: order.order_number,
            reason: "timeout_30_min"
        });
    }

    function trackOrderCancelled(order, reason) {
        logEvent("order_cancelled", {
            order_id: order.id,
            order_number: order.order_number,
            reason: reason
        });
    }

    return {
        initCampaignTracking,
        getCampaignSource,
        trackVisit,
        trackProductView,
        trackAddToCart,
        trackCheckoutStarted,
        trackPaymentMethodSelected,
        trackCustomerCompleted,
        trackOrderCreated,
        trackReceiptUploadStarted,
        trackReceiptUploaded,
        trackOrderExpired,
        trackOrderCancelled
    };
})();
