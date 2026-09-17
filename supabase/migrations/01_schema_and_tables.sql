-- ====================================================================
-- FASE 2A/2B: 01_schema_and_tables.sql
-- Proyecto: Tienda Online Demgel
-- Propósito: Definición del esquema base, tablas, constraints e índices.
-- Actualización Fase 2B: Soporte de idempotency_key contra doble clic/reintentos
-- ====================================================================

-- Habilitar extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 1. TABLA: categories
-- Categorías de catálogo (Cargadores, Cables, Auto, Parlantes, Otros)
-- --------------------------------------------------------------------
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

-- Índices para categories
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories (slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories (is_active, display_order);

-- --------------------------------------------------------------------
-- 2. TABLA: products
-- Catálogo oficial Demgel con doble lista de precios y stock protegido
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    model_reference TEXT, -- Código físico (ej: D-E4016C, D-P8002)
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    store_price INTEGER NOT NULL CHECK (store_price >= 0),
    online_price INTEGER NOT NULL CHECK (online_price >= 0 AND online_price <= store_price),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    main_image TEXT NOT NULL, -- URL en bucket público 'product-images'
    gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    is_online_offer BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para products
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products (slug);
CREATE INDEX IF NOT EXISTS idx_products_offers ON public.products (is_online_offer, is_active);
CREATE INDEX IF NOT EXISTS idx_products_model ON public.products (model_reference);

-- --------------------------------------------------------------------
-- 3. TABLA: orders
-- Cabecera del pedido con reserva estricta de 30 MINUTOS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE, -- Ej: DG-2026-0001
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL, -- WhatsApp del cliente
    customer_email TEXT,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('transferencia', 'cajavecina')),
    status TEXT NOT NULL DEFAULT 'PENDIENTE DE PAGO' 
        CHECK (status IN ('PENDIENTE DE PAGO', 'PAGO EN REVISIÓN', 'PAGO CONFIRMADO', 'LISTO PARA RETIRAR', 'RETIRADO', 'CANCELADO')),
    total_store_price INTEGER NOT NULL CHECK (total_store_price >= 0),
    total_online_price INTEGER NOT NULL CHECK (total_online_price >= 0),
    total_savings INTEGER NOT NULL CHECK (total_savings >= 0),
    source_campaign TEXT NOT NULL DEFAULT 'direct', -- ej: 'flyer', 'instagram'
    access_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'), -- Token secreto para acceso del cliente
    idempotency_key TEXT UNIQUE, -- Llave de idempotencia contra doble clic y reintentos de red
    
    -- Control estricto de reserva: 30 MINUTOS
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
    
    -- Control del comprobante
    receipt_path TEXT, -- Ruta en bucket privado 'receipts'
    receipt_uploaded_at TIMESTAMPTZ,
    receipt_mime_type TEXT,
    
    -- Control de notificación Telegram (Idempotencia y Anti-Race Condition)
    telegram_status TEXT NOT NULL DEFAULT 'pending' CHECK (telegram_status IN ('pending', 'sending', 'sent', 'failed')),
    telegram_message_id TEXT,
    telegram_sent_at TIMESTAMPTZ,
    expiration_notified BOOLEAN NOT NULL DEFAULT false, -- Notificar 'RESERVA VENCIDA' solo 1 vez
    
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para orders
CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS idx_orders_token ON public.orders (access_token);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON public.orders (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_expires ON public.orders (expires_at, status);
CREATE INDEX IF NOT EXISTS idx_orders_campaign ON public.orders (source_campaign);

-- --------------------------------------------------------------------
-- 4. TABLA: order_items
-- Detalle inmutable de artículos vendidos en cada orden
-- --------------------------------------------------------------------
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

-- Índices para order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items (product_id);

-- --------------------------------------------------------------------
-- 5. TABLA: store_config
-- Configuración administrativa editable (Bancos, CajaVecina, Horarios)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------
-- 6. TABLA: event_logs
-- Registro de eventos comerciales y analítica (antispam)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'visita', 'producto_visto', 'carrito_agregado', etc.
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para event_logs
CREATE INDEX IF NOT EXISTS idx_event_logs_type ON public.event_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_session ON public.event_logs (session_id, event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_date ON public.event_logs (created_at);

-- --------------------------------------------------------------------
-- 7. TABLA: admin_users
-- Control de usuarios administradores autorizados
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE, -- Referencia a auth.users(id)
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_uid ON public.admin_users (user_id);
