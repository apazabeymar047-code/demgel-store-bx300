-- ====================================================================
-- FASE 2A: 05_initial_seed_config.sql
-- Proyecto: Tienda Online Demgel
-- Propósito: Estructura base de categorías y configuración inicial editable
-- NOTA: NO contiene datos ficticios de clientes ni cuentas bancarias inventadas.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. CATEGORÍAS INICIALES DEL CATÁLOGO DEMGEL
-- --------------------------------------------------------------------
INSERT INTO public.categories (name, slug, icon, display_order, is_active)
VALUES
    ('Cargadores', 'cargadores', 'fa-plug', 1, true),
    ('Cables', 'cables', 'fa-bolt', 2, true),
    ('Accesorios para Auto', 'accesorios-auto', 'fa-car', 3, true),
    ('Mini Parlantes', 'mini-parlantes', 'fa-volume-high', 4, true),
    ('Otros Accesorios', 'otros-accesorios', 'fa-box-open', 5, true)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    display_order = EXCLUDED.display_order;

-- --------------------------------------------------------------------
-- 2. ESTRUCTURA CONFIGURABLE DE PAGOS Y RETIRO EN TIENDA
-- (Campos vacíos listos para ser completados desde el panel administrativo)
-- --------------------------------------------------------------------

INSERT INTO public.store_config (key, value)
VALUES
    (
        'bank_details',
        '{
            "bank_name": "",
            "account_type": "",
            "account_number": "",
            "rut": "",
            "holder_name": "",
            "email": "",
            "instructions": "Realiza la transferencia por el monto exacto y adjunta el comprobante antes de los 30 minutos para asegurar tu reserva."
        }'::jsonb
    ),
    (
        'cajavecina_instructions',
        '{
            "account_number": "",
            "rut": "",
            "holder_name": "",
            "instructions": "Acércate a tu CajaVecina más cercana, solicita depósito a la cuenta indicada e ingresa el comprobante emitido."
        }'::jsonb
    ),
    (
        'store_info',
        '{
            "store_name": "Tienda Oficial Demgel",
            "pickup_address": "Retiro presencial en local físico",
            "pickup_hours": "Lunes a Sábado",
            "support_whatsapp": "+56 9 8435 3461"
        }'::jsonb
    )
ON CONFLICT (key) DO NOTHING;
