-- ====================================================================
-- ESQUEMA COMPLETO CONSOLIDADO: TIENDA ONLINE DEMGEL
-- FASE 2A / 2B - INFRAESTRUCTURA DE DATOS PARA SUPABASE
-- Incluye: Reserva 30 min, Atomicidad, Idempotencia (Anti doble clic)
-- ====================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLAS
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories (slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories (is_active, display_order);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    model_reference TEXT,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    store_price INTEGER NOT NULL CHECK (store_price >= 0),
    online_price INTEGER NOT NULL CHECK (online_price >= 0 AND online_price <= store_price),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    main_image TEXT NOT NULL,
    gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    is_online_offer BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products (slug);
CREATE INDEX IF NOT EXISTS idx_products_offers ON public.products (is_online_offer, is_active);
CREATE INDEX IF NOT EXISTS idx_products_model ON public.products (model_reference);

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('transferencia', 'cajavecina')),
    status TEXT NOT NULL DEFAULT 'PENDIENTE DE PAGO' 
        CHECK (status IN ('PENDIENTE DE PAGO', 'PAGO EN REVISIÓN', 'PAGO CONFIRMADO', 'LISTO PARA RETIRAR', 'RETIRADO', 'CANCELADO')),
    total_store_price INTEGER NOT NULL CHECK (total_store_price >= 0),
    total_online_price INTEGER NOT NULL CHECK (total_online_price >= 0),
    total_savings INTEGER NOT NULL CHECK (total_savings >= 0),
    source_campaign TEXT NOT NULL DEFAULT 'direct',
    access_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    idempotency_key TEXT UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
    receipt_path TEXT,
    receipt_uploaded_at TIMESTAMPTZ,
    receipt_mime_type TEXT,
    telegram_status TEXT NOT NULL DEFAULT 'pending' CHECK (telegram_status IN ('pending', 'sending', 'sent', 'failed')),
    telegram_message_id TEXT,
    telegram_sent_at TIMESTAMPTZ,
    expiration_notified BOOLEAN NOT NULL DEFAULT false,
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS idx_orders_token ON public.orders (access_token);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON public.orders (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_expires ON public.orders (expires_at, status);
CREATE INDEX IF NOT EXISTS idx_orders_campaign ON public.orders (source_campaign);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    product_model TEXT,
    store_price INTEGER NOT NULL CHECK (store_price >= 0),
    online_price INTEGER NOT NULL CHECK (online_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items (product_id);

CREATE TABLE IF NOT EXISTS public.store_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_logs_type ON public.event_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_session ON public.event_logs (session_id, event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_date ON public.event_logs (created_at);

CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_uid ON public.admin_users (user_id);

-- 3. FUNCIONES ATÓMICAS Y RPC
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT AS $$
DECLARE
    v_year TEXT;
    v_seq INTEGER;
BEGIN
    v_year := to_char(now(), 'YYYY');
    v_seq := nextval('public.order_number_seq');
    RETURN 'DG-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.create_order_with_reservation(
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_customer_email TEXT,
    p_payment_method TEXT,
    p_source_campaign TEXT,
    p_items JSONB,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_existing_order public.orders%ROWTYPE;
    v_order_id UUID;
    v_order_number TEXT;
    v_access_token TEXT;
    v_expires_at TIMESTAMPTZ;
    v_item RECORD;
    v_product RECORD;
    v_total_store INTEGER := 0;
    v_total_online INTEGER := 0;
    v_total_savings INTEGER := 0;
    v_item_subtotal INTEGER := 0;
BEGIN
    IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
        SELECT * INTO v_existing_order
        FROM public.orders
        WHERE idempotency_key = trim(p_idempotency_key);
        
        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'order_id', v_existing_order.id,
                'order_number', v_existing_order.order_number,
                'access_token', v_existing_order.access_token,
                'expires_at', v_existing_order.expires_at,
                'total_online_price', v_existing_order.total_online_price,
                'total_store_price', v_existing_order.total_store_price,
                'total_savings', v_existing_order.total_savings,
                'is_duplicate_request', true
            );
        END IF;
    END IF;

    IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
        RAISE EXCEPTION 'El nombre del cliente es obligatorio';
    END IF;
    
    IF p_customer_phone IS NULL OR length(trim(p_customer_phone)) < 6 THEN
        RAISE EXCEPTION 'El teléfono/WhatsApp es obligatorio';
    END IF;
    
    IF p_payment_method NOT IN ('transferencia', 'cajavecina') THEN
        RAISE EXCEPTION 'Método de pago inválido';
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito no puede estar vacío';
    END IF;

    v_order_id := gen_random_uuid();
    v_order_number := public.generate_order_number();
    v_access_token := encode(extensions.gen_random_bytes(16), 'hex');
    v_expires_at := now() + interval '30 minutes';


    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER)
    LOOP
        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
        END IF;

        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_item.product_id AND is_active = true
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado o inactivo: %', v_item.product_id;
        END IF;

        IF v_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para "%". Disponibles: %', v_product.name, v_product.stock;
        END IF;

        UPDATE public.products
        SET stock = stock - v_item.quantity,
            updated_at = now()
        WHERE id = v_product.id;

        v_total_store := v_total_store + (v_product.store_price * v_item.quantity);
        v_total_online := v_total_online + (v_product.online_price * v_item.quantity);
    END LOOP;

    v_total_savings := v_total_store - v_total_online;

    INSERT INTO public.orders (
        id,
        order_number,
        customer_name,
        customer_phone,
        customer_email,
        payment_method,
        status,
        total_store_price,
        total_online_price,
        total_savings,
        source_campaign,
        access_token,
        idempotency_key,
        expires_at
    ) VALUES (
        v_order_id,
        v_order_number,
        trim(p_customer_name),
        trim(p_customer_phone),
        nullif(trim(p_customer_email), ''),
        p_payment_method,
        'PENDIENTE DE PAGO',
        v_total_store,
        v_total_online,
        v_total_savings,
        coalesce(nullif(trim(p_source_campaign), ''), 'direct'),
        v_access_token,
        nullif(trim(p_idempotency_key), ''),
        v_expires_at
    );

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
        v_item_subtotal := v_product.online_price * v_item.quantity;

        INSERT INTO public.order_items (
            order_id,
            product_id,
            product_name,
            product_model,
            store_price,
            online_price,
            quantity,
            subtotal
        ) VALUES (
            v_order_id,
            v_product.id,
            v_product.name,
            v_product.model_reference,
            v_product.store_price,
            v_product.online_price,
            v_item.quantity,
            v_item_subtotal
        );
    END LOOP;


    INSERT INTO public.event_logs (session_id, event_type, metadata)
    VALUES (
        v_access_token,
        'nuevo_pedido',
        jsonb_build_object(
            'order_id', v_order_id,
            'order_number', v_order_number,
            'total', v_total_online,
            'campaign', coalesce(nullif(trim(p_source_campaign), ''), 'direct')
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'access_token', v_access_token,
        'expires_at', v_expires_at,
        'total_online_price', v_total_online,
        'total_store_price', v_total_store,
        'total_savings', v_total_savings,
        'is_duplicate_request', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.expire_single_order(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND status = 'PENDIENTE DE PAGO'
      AND expires_at <= now()
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    UPDATE public.products p
    SET stock = p.stock + oi.quantity,
        updated_at = now()
    FROM public.order_items oi
    WHERE oi.order_id = v_order.id
      AND p.id = oi.product_id;

    UPDATE public.orders
    SET status = 'CANCELADO',
        admin_notes = coalesce(admin_notes || ' | ', '') || 'Reserva vencida automáticamente tras cumplirse los 30 minutos',
        updated_at = now()
    WHERE id = v_order.id;

    INSERT INTO public.event_logs (session_id, event_type, metadata)
    VALUES (
        v_order.access_token,
        'reserva_vencida',
        jsonb_build_object(
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'reason', 'timeout_30_min'
        )
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.expire_all_pending_orders()
RETURNS INTEGER AS $$
DECLARE
    v_order_id UUID;
    v_count INTEGER := 0;
BEGIN
    FOR v_order_id IN 
        SELECT id 
        FROM public.orders 
        WHERE status = 'PENDIENTE DE PAGO' 
          AND expires_at <= now()
    LOOP
        IF public.expire_single_order(v_order_id) THEN
            v_count := v_count + 1;
        END IF;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.submit_order_receipt(
    p_order_id UUID,
    p_access_token TEXT,
    p_receipt_path TEXT,
    p_receipt_mime TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND access_token = p_access_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'PEDIDO_NO_ENCONTRADO');
    END IF;

    IF v_order.status = 'CANCELADO' OR (v_order.status = 'PENDIENTE DE PAGO' AND v_order.expires_at <= now()) THEN
        IF v_order.status = 'PENDIENTE DE PAGO' THEN
            PERFORM public.expire_single_order(v_order.id);
        END IF;
        
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'RESERVA_EXPIRADA',
            'message', 'Tu tiempo de reserva de 30 minutos ha expirado y los productos fueron liberados al inventario.'
        );
    END IF;

    IF v_order.status IN ('PAGO EN REVISIÓN', 'PAGO CONFIRMADO', 'LISTO PARA RETIRAR', 'RETIRADO') THEN
        RETURN jsonb_build_object('success', true, 'status', v_order.status, 'already_uploaded', true);
    END IF;

    UPDATE public.orders
    SET status = 'PAGO EN REVISIÓN',
        receipt_path = p_receipt_path,
        receipt_mime_type = p_receipt_mime,
        receipt_uploaded_at = now(),
        telegram_status = 'pending',
        updated_at = now()
    WHERE id = v_order.id;

    INSERT INTO public.event_logs (session_id, event_type, metadata)
    VALUES (
        v_order.access_token,
        'comprobante_recibido',
        jsonb_build_object(
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'receipt_path', p_receipt_path
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_number', v_order.order_number,
        'status', 'PAGO EN REVISIÓN',
        'message', 'Comprobante recibido con éxito. En revisión por tienda.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_order_by_token(
    p_order_id UUID,
    p_access_token TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_items JSONB;
BEGIN
    PERFORM public.expire_single_order(p_order_id);

    SELECT 
        id, order_number, customer_name, customer_phone, customer_email,
        payment_method, status, total_store_price, total_online_price,
        total_savings, source_campaign, expires_at, receipt_path,
        receipt_uploaded_at, receipt_mime_type, admin_notes, created_at
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND access_token = trim(p_access_token);

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'product_model', oi.product_model,
            'store_price', oi.store_price,
            'online_price', oi.online_price,
            'quantity', oi.quantity,
            'subtotal', oi.subtotal
        )
    ), '[]'::jsonb)
    INTO v_items
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id;

    RETURN jsonb_build_object(
        'order', row_to_json(v_order)::jsonb,
        'items', v_items
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. POLÍTICAS RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
        RETURN true;
    END IF;

    IF EXISTS (
        SELECT 1 
        FROM public.admin_users 
        WHERE user_id = auth.uid()
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public categories read" ON public.categories FOR SELECT USING (is_active = true);
CREATE POLICY "Admin categories control" ON public.categories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Public products read" ON public.products FOR SELECT USING (is_active = true);
CREATE POLICY "Admin products control" ON public.products FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Client reads own order with token" ON public.orders FOR SELECT
USING (
    access_token = current_setting('request.headers', true)::json->>'x-order-token'
    OR access_token = nullif(current_setting('app.current_order_token', true), '')
    OR public.is_admin()
);

CREATE POLICY "Admin orders control" ON public.orders FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Client reads own order items" ON public.order_items FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_items.order_id
          AND (
              o.access_token = current_setting('request.headers', true)::json->>'x-order-token'
              OR public.is_admin()
          )
    )
);

CREATE POLICY "Admin order items control" ON public.order_items FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Public store_config read" ON public.store_config FOR SELECT
USING (key IN ('bank_details', 'cajavecina_instructions', 'store_info'));

CREATE POLICY "Admin store_config control" ON public.store_config FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Public event_logs insert" ON public.event_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin event_logs read" ON public.event_logs FOR SELECT USING (public.is_admin());

CREATE POLICY "Admin users self read" ON public.admin_users FOR SELECT USING (public.is_admin());
CREATE POLICY "Admin users control" ON public.admin_users FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. BUCKETS DE STORAGE
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
    ('receipts', 'receipts', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Public read product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Admin manage product images" ON storage.objects FOR ALL USING (bucket_id = 'product-images' AND public.is_admin()) WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

CREATE POLICY "Clients can upload receipts" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'receipts' AND storage.extension(name) IN ('jpg', 'jpeg', 'png', 'webp', 'pdf'));

CREATE POLICY "Admin and backend read receipts" ON storage.objects FOR SELECT USING (bucket_id = 'receipts' AND public.is_admin());
CREATE POLICY "Admin delete receipts" ON storage.objects FOR DELETE USING (bucket_id = 'receipts' AND public.is_admin());

-- 6. DATOS INICIALES CONFIGURABLES
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

-- 7. PERMISOS EXPLÍCITOS (PRINCIPIO DE MÍNIMO PRIVILEGIO)
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.categories FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_config FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.event_logs FROM anon, authenticated;

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.store_config TO anon, authenticated;
GRANT INSERT ON public.event_logs TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_order_with_reservation TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_order_receipt TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_by_token TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.expire_single_order FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_all_pending_orders FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_single_order TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_all_pending_orders TO service_role;
