"""
SUITE DE AUDITORÍA ESTÁTICA DE SQL Y SUPABASE - FASE 2F
Verifica la integridad de:
- supabase/migrations/
- supabase/complete_schema.sql
- Estructura de tablas, constraints, RLS, RPCs, Storage y Grants
"""

import os
import re
import unittest

class TestSqlAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        cls.supabase_dir = os.path.join(cls.base_dir, "supabase")
        cls.migrations_dir = os.path.join(cls.supabase_dir, "migrations")
        cls.complete_sql_path = os.path.join(cls.supabase_dir, "complete_schema.sql")

        with open(cls.complete_sql_path, "r", encoding="utf-8") as f:
            cls.complete_sql = f.read()

        cls.combined_migrations = ""
        for mf in sorted(os.listdir(cls.migrations_dir)):
            with open(os.path.join(cls.migrations_dir, mf), "r", encoding="utf-8") as f:
                cls.combined_migrations += "\n-- FILE: " + mf + "\n" + f.read()

    # 1. TABLAS
    def test_tables_match(self):
        expected_tables = ["categories", "products", "orders", "order_items", "store_config", "event_logs", "admin_users"]
        complete_tables = re.findall(r"CREATE TABLE IF NOT EXISTS public\.(\w+)", self.complete_sql)
        mig_tables = re.findall(r"CREATE TABLE IF NOT EXISTS public\.(\w+)", self.combined_migrations)
        self.assertEqual(complete_tables, expected_tables)
        self.assertEqual(mig_tables, expected_tables)

    # 2. CONSTRAINTS CRÍTICOS EN PRODUCTOS
    def test_products_constraints(self):
        # online_price <= store_price
        self.assertIn("online_price <= store_price", self.complete_sql)
        # stock >= 0
        self.assertIn("stock >= 0", self.complete_sql)
        # store_price >= 0
        self.assertIn("store_price >= 0", self.complete_sql)

    # 3. CONSTRAINTS CRÍTICOS EN ORDERS
    def test_orders_constraints(self):
        # 6 Estados oficiales exactos
        expected_status_check = "CHECK (status IN ('PENDIENTE DE PAGO', 'PAGO EN REVISIÓN', 'PAGO CONFIRMADO', 'LISTO PARA RETIRAR', 'RETIRADO', 'CANCELADO'))"
        self.assertIn("PENDIENTE DE PAGO", self.complete_sql)
        self.assertIn("PAGO EN REVISIÓN", self.complete_sql)
        self.assertIn("PAGO CONFIRMADO", self.complete_sql)
        self.assertIn("LISTO PARA RETIRAR", self.complete_sql)
        self.assertIn("RETIRADO", self.complete_sql)
        self.assertIn("CANCELADO", self.complete_sql)
        self.assertNotIn("'EXPIRADO'", self.complete_sql) # NO debe haber estado EXPIRADO
        # Totales >= 0
        self.assertIn("total_store_price >= 0", self.complete_sql)
        self.assertIn("total_online_price >= 0", self.complete_sql)
        self.assertIn("total_savings >= 0", self.complete_sql)

    # 4. CONSTRAINTS CRÍTICOS EN ORDER_ITEMS
    def test_order_items_constraints(self):
        # quantity > 0
        self.assertIn("quantity INTEGER NOT NULL CHECK (quantity > 0)", self.complete_sql)
        # subtotal >= 0
        self.assertIn("subtotal INTEGER NOT NULL CHECK (subtotal >= 0)", self.complete_sql)

    # 5. RPC FUNCTIONS
    def test_rpc_functions_exist(self):
        expected_funcs = [
            "generate_order_number",
            "create_order_with_reservation",
            "expire_single_order",
            "expire_all_pending_orders",
            "submit_order_receipt",
            "is_admin"
        ]
        complete_funcs = re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)", self.complete_sql)
        for fn in expected_funcs:
            self.assertIn(fn, complete_funcs)

    # 6. ATOMICIDAD Y LOCK EN CREATE ORDER
    def test_create_order_atomic_locks(self):
        # FOR UPDATE en products dentro de create_order_with_reservation
        self.assertIn("FOR UPDATE", self.complete_sql)
        # Server-side price calculation
        self.assertIn("v_product.online_price * v_item.quantity", self.complete_sql)
        # 30 minutes interval
        self.assertIn("interval '30 minutes'", self.complete_sql)

    # 7. IDEMPOTENCIA
    def test_idempotency_support(self):
        # idempotency_key UNIQUE en tabla orders
        self.assertIn("idempotency_key TEXT UNIQUE", self.complete_sql)
        # Verificación en RPC
        self.assertIn("WHERE idempotency_key = trim(p_idempotency_key)", self.complete_sql)
        self.assertIn("'is_duplicate_request', true", self.complete_sql)

    # 8. EXPIRACIÓN ATÓMICA
    def test_expiration_logic(self):
        # FOR UPDATE SKIP LOCKED
        self.assertIn("FOR UPDATE SKIP LOCKED", self.complete_sql)
        # Retorno de stock a products
        self.assertIn("p.stock + oi.quantity", self.complete_sql)
        # Cambio a CANCELADO
        self.assertIn("SET status = 'CANCELADO'", self.complete_sql)

    # 9. RLS POLICIES
    def test_rls_enabled_on_all_tables(self):
        expected_tables = ["categories", "products", "orders", "order_items", "store_config", "event_logs", "admin_users"]
        for tbl in expected_tables:
            self.assertIn(f"ALTER TABLE public.{tbl} ENABLE ROW LEVEL SECURITY;", self.complete_sql)

    # 10. STORAGE BUCKETS
    def test_storage_buckets_setup(self):
        # product-images public = true
        self.assertIn("'product-images', true", self.complete_sql)
        # receipts public = false
        self.assertIn("'receipts', false", self.complete_sql)

    # 11. RPC GET_ORDER_BY_TOKEN
    def test_get_order_by_token_rpc(self):
        self.assertIn("get_order_by_token", self.complete_sql)
        self.assertIn("expire_single_order(p_order_id)", self.complete_sql)

    # 12. SECURITY DEFINER SEARCH PATH
    def test_security_definer_search_path(self):
        # Todas las funciones con SECURITY DEFINER deben tener SET search_path = public, pg_temp
        sec_def_matches = re.findall(r"SECURITY DEFINER\s+SET search_path = public, pg_temp", self.complete_sql)
        self.assertGreaterEqual(len(sec_def_matches), 5)

    # 13. GRANTS Y MÍNIMO PRIVILEGIO
    def test_grants_and_revokes(self):
        self.assertIn("REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;", self.complete_sql)
        self.assertIn("GRANT EXECUTE ON FUNCTION public.create_order_with_reservation TO anon, authenticated;", self.complete_sql)
        self.assertIn("REVOKE EXECUTE ON FUNCTION public.expire_all_pending_orders FROM PUBLIC, anon, authenticated;", self.complete_sql)

    # 14. TELEGRAM STATUS ANTI-RACE CONDITION
    def test_telegram_status_sending_state(self):
        self.assertIn("'pending', 'sending', 'sent', 'failed'", self.complete_sql)

    # 15. DEPLOYMENT GUIDE INTEGRITY
    def test_deployment_guide_no_secrets(self):
        guide_path = os.path.join(self.base_dir, "DEPLOYMENT_GUIDE.md")
        with open(guide_path, "r", encoding="utf-8") as f:
            guide = f.read()
        # Verificar que no contenga credenciales reales
        self.assertNotIn("eyJh", guide)
        self.assertNotIn("sbp_", guide)
        self.assertIn("SUPABASE_ANON_KEY", guide)
        # Comprobar que receipts es 100% privado en la guía
        self.assertIn("100% PRIVADO", guide)

if __name__ == "__main__":
    unittest.main()
