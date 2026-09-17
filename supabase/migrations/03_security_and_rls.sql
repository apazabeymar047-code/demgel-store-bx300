-- ====================================================================
-- FASE 2A: 03_security_and_rls.sql
-- Proyecto: Tienda Online Demgel
-- Propósito: Políticas de Seguridad RLS (Row Level Security) y control de roles
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. FUNCIÓN DE SEGURIDAD: is_admin()
-- Valida si el usuario actual autenticado posee privilegios de administrador
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    -- 1. Comprobar si el token JWT contiene el rol admin en app_metadata
    IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
        RETURN true;
    END IF;

    -- 2. Comprobar si el UID del usuario existe en la tabla admin_users
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

-- --------------------------------------------------------------------
-- 2. HABILITACIÓN DE RLS EN TODAS LAS TABLAS
-- --------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 3. POLÍTICAS: categories
-- Público: Solo lectura de categorías activas
-- Admin: Control total
-- --------------------------------------------------------------------
CREATE POLICY "Public categories read"
    ON public.categories FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admin categories control"
    ON public.categories FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------
-- 4. POLÍTICAS: products
-- Público: Solo lectura de productos activos
-- Admin: Control total (crear, editar precios, stock, desactivar)
-- --------------------------------------------------------------------
CREATE POLICY "Public products read"
    ON public.products FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admin products control"
    ON public.products FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------
-- 5. POLÍTICAS: orders
-- Público: Lectura restringida únicamente con su access_token secreto
-- Escritura pública directa bloqueada (solo vía funciones RPC con SECURITY DEFINER)
-- Admin: Control total
-- --------------------------------------------------------------------
CREATE POLICY "Client reads own order with token"
    ON public.orders FOR SELECT
    USING (
        access_token = current_setting('request.headers', true)::json->>'x-order-token'
        OR access_token = nullif(current_setting('app.current_order_token', true), '')
        OR public.is_admin()
    );

CREATE POLICY "Admin orders control"
    ON public.orders FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------
-- 6. POLÍTICAS: order_items
-- Lectura protegida asociada a la orden
-- Admin: Control total
-- --------------------------------------------------------------------
CREATE POLICY "Client reads own order items"
    ON public.order_items FOR SELECT
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

CREATE POLICY "Admin order items control"
    ON public.order_items FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------
-- 7. POLÍTICAS: store_config
-- Público: Lectura de datos bancarios, CajaVecina e info de retiro
-- Admin: Modificación de parámetros
-- --------------------------------------------------------------------
CREATE POLICY "Public store_config read"
    ON public.store_config FOR SELECT
    USING (key IN ('bank_details', 'cajavecina_instructions', 'store_info'));

CREATE POLICY "Admin store_config control"
    ON public.store_config FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------
-- 8. POLÍTICAS: event_logs
-- Público anónimo: Puede insertar logs de analítica comercial (antispam)
-- Admin: Consulta de métricas
-- --------------------------------------------------------------------
CREATE POLICY "Public event_logs insert"
    ON public.event_logs FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Admin event_logs read"
    ON public.event_logs FOR SELECT
    USING (public.is_admin());

-- --------------------------------------------------------------------
-- 9. POLÍTICAS: admin_users
-- Exclusivo para administradores
-- --------------------------------------------------------------------
CREATE POLICY "Admin users self read"
    ON public.admin_users FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Admin users control"
    ON public.admin_users FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------
-- 10. PERMISOS EXPLÍCITOS (PRINCIPIO DE MÍNIMO PRIVILEGIO)
-- Bloquea manipulación directa y canaliza mutaciones por RPCs seguras
-- --------------------------------------------------------------------

-- Revocar modificaciones directas en tablas críticas
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.categories FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_config FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.event_logs FROM anon, authenticated;

-- Otorgar lecturas públicas autorizadas
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.store_config TO anon, authenticated;
GRANT INSERT ON public.event_logs TO anon, authenticated;

-- Otorgar permisos de ejecución en RPCs de cliente
GRANT EXECUTE ON FUNCTION public.create_order_with_reservation TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_order_receipt TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_by_token TO anon, authenticated;

-- Funciones administrativas/worker: restringidas a service_role
REVOKE EXECUTE ON FUNCTION public.expire_single_order FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_all_pending_orders FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_single_order TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_all_pending_orders TO service_role;

