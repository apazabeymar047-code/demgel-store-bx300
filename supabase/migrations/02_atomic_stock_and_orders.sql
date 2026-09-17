-- ====================================================================
-- FASE 2A/2B: 02_atomic_stock_and_orders.sql
-- Proyecto: Tienda Online Demgel
-- Propósito: Funciones atómicas de concurrencia, stock y reserva de 30 min.
-- Actualización Fase 2B: Idempotencia en creación (anti doble clic) y control de eventos
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. SECUENCIA Y GENERADOR DE NÚMERO DE PEDIDO
-- Formato: DG-YYYY-0001
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 2. RPC: create_order_with_reservation
-- Crea la orden, valida precios en servidor y reserva stock por 30 MINUTOS
-- Soporta p_idempotency_key para proteger contra doble clic y reintentos
-- --------------------------------------------------------------------
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
    -- 1. Control de Idempotencia: Si la llave ya fue procesada, devolver la orden existente
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

    -- 2. Validar parámetros mínimos
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

    -- 3. Generar datos iniciales
    v_order_id := gen_random_uuid();
    v_order_number := public.generate_order_number();
    v_access_token := encode(extensions.gen_random_bytes(16), 'hex');
    v_expires_at := now() + interval '30 minutes';


    -- 4. Procesar cada producto con bloqueo a nivel de fila (Anti-Race Condition)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER)
    LOOP
        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
        END IF;

        -- Bloqueo exclusivo: si otro usuario está comprando simultáneamente, se procesa en orden atómico
        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_item.product_id AND is_active = true
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado o inactivo: %', v_item.product_id;
        END IF;

        -- Validar stock suficiente
        IF v_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para "%". Disponibles: %', v_product.name, v_product.stock;
        END IF;

        -- Descontar stock atómicamente
        UPDATE public.products
        SET stock = stock - v_item.quantity,
            updated_at = now()
        WHERE id = v_product.id;

        -- Cálculos de precio SERVER-SIDE (el cliente no puede alterar valores)
        v_item_subtotal := v_product.online_price * v_item.quantity;
        v_total_store := v_total_store + (v_product.store_price * v_item.quantity);
        v_total_online := v_total_online + v_item_subtotal;

        -- Registrar ítem de orden
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

    -- 5. Calcular ahorro final
    v_total_savings := v_total_store - v_total_online;

    -- 6. Insertar cabecera de orden sellada por 30 MINUTOS
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

    -- 7. Registrar evento comercial inicial
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

    -- Retornar resultado estructurado
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

-- --------------------------------------------------------------------
-- 3. RPC: expire_single_order
-- Libera stock y cancela la orden transaccionalmente (Idempotente)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_single_order(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    -- Bloquear orden para evitar doble procesamiento concurrente
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND status = 'PENDIENTE DE PAGO'
      AND expires_at <= now()
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN false; -- Ya no aplica o ya fue procesada por otro proceso
    END IF;

    -- 1. Devolver stock a la tabla products en la misma transacción
    UPDATE public.products p
    SET stock = p.stock + oi.quantity,
        updated_at = now()
    FROM public.order_items oi
    WHERE oi.order_id = v_order.id
      AND p.id = oi.product_id;

    -- 2. Cambiar estado a CANCELADO con nota de auditoría
    UPDATE public.orders
    SET status = 'CANCELADO',
        admin_notes = coalesce(admin_notes || ' | ', '') || 'Reserva vencida automáticamente tras cumplirse los 30 minutos',
        updated_at = now()
    WHERE id = v_order.id;

    -- 3. Registrar evento RESERVA VENCIDA una sola vez
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

-- --------------------------------------------------------------------
-- 4. RPC: expire_all_pending_orders
-- Procesa por lotes todas las órdenes vencidas (Worker / Cron)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 5. RPC: submit_order_receipt
-- Valida que la orden esté vigente antes de los 30 min y congela la reserva
-- --------------------------------------------------------------------
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
    -- Bloqueo de orden para validación segura
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND access_token = p_access_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'PEDIDO_NO_ENCONTRADO');
    END IF;

    -- Caso Borde: Ya cancelado o vencido (> 30 minutos)
    IF v_order.status = 'CANCELADO' OR (v_order.status = 'PENDIENTE DE PAGO' AND v_order.expires_at <= now()) THEN
        -- Si aún no se corrió el worker de expiración, se ejecuta de inmediato para liberar stock
        IF v_order.status = 'PENDIENTE DE PAGO' THEN
            PERFORM public.expire_single_order(v_order.id);
        END IF;
        
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'RESERVA_EXPIRADA',
            'message', 'Tu tiempo de reserva de 30 minutos ha expirado y los productos fueron liberados al inventario.'
        );
    END IF;

    -- Si ya tenía comprobante en revisión o pago confirmado, no duplicar
    IF v_order.status IN ('PAGO EN REVISIÓN', 'PAGO CONFIRMADO', 'LISTO PARA RETIRAR', 'RETIRADO') THEN
        RETURN jsonb_build_object('success', true, 'status', v_order.status, 'already_uploaded', true);
    END IF;

    -- Guardar comprobante y blindar la reserva pasando a PAGO EN REVISIÓN
    UPDATE public.orders
    SET status = 'PAGO EN REVISIÓN',
        receipt_path = p_receipt_path,
        receipt_mime_type = p_receipt_mime,
        receipt_uploaded_at = now(),
        telegram_status = 'pending', -- Listo para ser despachado a Telegram en la fase final
        updated_at = now()
    WHERE id = v_order.id;

    -- Registrar evento COMPROBANTE RECIBIDO
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

-- --------------------------------------------------------------------
-- 6. RPC: get_order_by_token
-- Consulta segura de pedido validando exactamente ID y access_token
-- Ejecuta automáticamente verificación de expiración de 30 minutos
-- Exposición mínima de datos: No expone tokens internos ni pedidos ajenos
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_order_by_token(
    p_order_id UUID,
    p_access_token TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_items JSONB;
BEGIN
    -- 1. Chequeo automático de expiración al consultar
    PERFORM public.expire_single_order(p_order_id);

    -- 2. Obtener orden validando exactamente id y access_token
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

    -- 3. Obtener ítems asociados
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
