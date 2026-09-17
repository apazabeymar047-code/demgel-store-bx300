/**
 * SERVICIO ADMINISTRATIVO DE CONFIGURACIÓN (ADMIN CONFIG SERVICE)
 * FASE 2E: Gestión de parámetros de tienda con marcadores limpios
 * NOTA: Todos los valores no confirmados permanecen como "Pendiente de configuración".
 * Diseñado como adaptador desacoplado para ser reemplazado posteriormente por Supabase store_config.
 */

const AdminConfigService = (function() {
    const STORAGE_KEY_ADMIN_CONFIG = "demgel_admin_config";

    const DEFAULT_CONFIG = {
        transfer_config: {
            bank_name: "Pendiente de configuración",
            account_type: "Pendiente de configuración",
            account_number: "Pendiente de configuración",
            rut: "Pendiente de configuración",
            holder_name: "Pendiente de configuración",
            email: "Pendiente de configuración",
            instructions: "Realiza la transferencia bancaria por el TOTAL EXACTO DE TU PEDIDO. Tu reserva de 30 minutos estará activa mientras transfieres y adjuntas el comprobante."
        },
        cajavecina_config: {
            instructions: "Pendiente de configuración",
            step_by_step: [
                "1. Acércate a cualquier punto CajaVecina o BancoEstado Express.",
                "2. Indica depósito a la cuenta oficial de Demgel.",
                "3. Conserva el voucher impreso emitido por la máquina.",
                "4. Toma una fotografía nítida del voucher y súbela en la pantalla de tu pedido."
            ]
        },
        store_config: {
            store_name: "Tienda Oficial Demgel",
            pickup_address: "Pendiente de configuración",
            pickup_hours: "Pendiente de configuración",
            pickup_instructions: "Pendiente de configuración",
            support_whatsapp: "+56 9 8435 3461"
        }
    };

    function getConfig() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ADMIN_CONFIG);
            if (!raw) {
                localStorage.setItem(STORAGE_KEY_ADMIN_CONFIG, JSON.stringify(DEFAULT_CONFIG));
                return DEFAULT_CONFIG;
            }
            return JSON.parse(raw);
        } catch (e) {
            return DEFAULT_CONFIG;
        }
    }

    function saveConfig(updatedConfig) {
        try {
            localStorage.setItem(STORAGE_KEY_ADMIN_CONFIG, JSON.stringify(updatedConfig));
            if (typeof AdminOrderService !== "undefined" && AdminOrderService.logAdminEvent) {
                AdminOrderService.logAdminEvent("CONFIG_UPDATED", null, {
                    updated_by: "Admin Demo",
                    timestamp: new Date().toISOString()
                });
            }
            return { success: true, message: "Configuración guardada correctamente en almacenamiento local." };
        } catch (e) {
            console.error("Error al guardar configuración:", e);
            return { success: false, error: "SAVE_ERROR", message: "Error al guardar configuración." };
        }
    }

    return {
        getConfig,
        saveConfig
    };
})();
