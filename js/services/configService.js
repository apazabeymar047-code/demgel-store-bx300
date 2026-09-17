/**
 * SERVICIO DE CONFIGURACIÓN DE TIENDA (CONFIG SERVICE)
 * FASE 2D: Valores placeholder listos para ser reemplazados por Supabase store_config
 * NOTA: NO contiene datos bancarios inventados ni cuentas reales.
 */

const DemgelConfigService = (function() {
    let currentConfig = {
        bank_details: {
            bank_name: "Pendiente de configuración",
            account_type: "Pendiente de configuración",
            account_number: "Pendiente de configuración",
            rut: "Pendiente de configuración",
            holder_name: "Pendiente de configuración",
            email: "Pendiente de configuración",
            instructions: "Realiza la transferencia bancaria por el TOTAL EXACTO DE TU PEDIDO. Tu reserva de 30 minutos estará activa mientras transfieres y adjuntas el comprobante."
        },
        cajavecina_instructions: {
            instructions: "Datos de CajaVecina pendientes de configuración.",
            step_by_step: [
                "1. Acércate a cualquier punto CajaVecina o BancoEstado Express.",
                "2. Indica depósito a la cuenta oficial de Demgel.",
                "3. Conserva el voucher impreso emitido por la máquina.",
                "4. Toma una fotografía nítida del voucher y súbela en la pantalla de tu pedido."
            ]
        },
        store_info: {
            store_name: "Tienda Oficial Demgel",
            pickup_address: "Retiro presencial en local físico",
            pickup_hours: "Lunes a Sábado",
            support_whatsapp: "+56 9 8435 3461"
        }
    };

    async function loadConfig() {
        // Cargar desde Admin Panel local si existe
        try {
            const rawAdmin = localStorage.getItem("demgel_admin_config");
            if (rawAdmin) {
                const parsed = JSON.parse(rawAdmin);
                if (parsed.transfer_config) {
                    currentConfig.bank_details = { ...currentConfig.bank_details, ...parsed.transfer_config };
                }
                if (parsed.store_config) {
                    currentConfig.store_info = { ...currentConfig.store_info, ...parsed.store_config };
                }
            }
        } catch (e) {
            console.warn("Error al cargar demgel_admin_config de localStorage:", e);
        }

        if (typeof DemgelSupabase !== "undefined") {
            try {
                const remote = await DemgelSupabase.getStoreConfig();
                if (remote) {
                    if (remote.bank_details) currentConfig.bank_details = { ...currentConfig.bank_details, ...remote.bank_details };
                    if (remote.cajavecina_instructions) currentConfig.cajavecina_instructions = { ...currentConfig.cajavecina_instructions, ...remote.cajavecina_instructions };
                    if (remote.store_info) currentConfig.store_info = { ...currentConfig.store_info, ...remote.store_info };
                }
            } catch (e) {
                console.warn("No se pudo cargar store_config de Supabase:", e);
            }
        }
        return currentConfig;
    }

    function getBankDetails() {
        return currentConfig.bank_details;
    }

    function getCajaVecinaInstructions() {
        return currentConfig.cajavecina_instructions;
    }

    function getStoreInfo() {
        return currentConfig.store_info;
    }

    return {
        loadConfig,
        getBankDetails,
        getCajaVecinaInstructions,
        getStoreInfo
    };
})();

