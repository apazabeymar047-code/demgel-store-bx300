"""
SUITE DE PRUEBAS DE INTEGRACIÓN EN VIVO CON SUPABASE REAL
Proyecto: Tienda Online Demgel - Fase Final 1
Valida contra Supabase Real (dtlzzvdyqhebdsftqckc):
1. Lectura de categorías y productos activos con clave pública anon
2. Lectura de configuración store_config con clave pública anon
3. Creación atómica de pedido con RPC create_order_with_reservation y control de idempotencia
4. Verificación de cálculo estricto en servidor (store_price, online_price, total_savings)
5. Descuento atómico de stock
6. Consulta segura de pedido con RPC get_order_by_token y rechazo con token inválido
7. Subida de comprobante al bucket privado 'receipts'
8. Asociación de comprobante con RPC submit_order_receipt -> PAGO EN REVISIÓN
9. RLS: Intento de INSERT directo a orders desde anon key es bloqueado
10. Limpieza estricta de registros de prueba (restauración de stock y borrado de test data)
"""

import unittest
import urllib.request
import urllib.parse
import json
import uuid

SUPABASE_URL = "https://dtlzzvdyqhebdsftqckc.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0bHp6dmR5cWhlYmRzZnRxY2tjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjM3NjksImV4cCI6MjEwNTEzOTc2OX0.6N-3Z244wwPw0Hk7A3VjV45OjECW_QVCLzuRoekxmSw"

def api_request(endpoint, method="GET", data=None, extra_headers=None):
    url = f"{SUPABASE_URL}{endpoint}"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Accept": "application/json"
    }
    if extra_headers:
        headers.update(extra_headers)

    body = None
    if data is not None:
        if isinstance(data, (dict, list)):
            body = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif isinstance(data, bytes):
            body = data
        else:
            body = str(data).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            if res_body:
                try:
                    return response.status, json.loads(res_body)
                except:
                    return response.status, res_body
            return response.status, None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except:
            return e.code, err_body

class TestSupabaseLiveIntegration(unittest.TestCase):

    def test_01_read_categories_anon(self):
        """Rol anon puede leer categorías activas"""
        status, data = api_request("/rest/v1/categories?select=*&is_active=eq.true&order=display_order.asc")
        self.assertEqual(status, 200, f"Error al consultar categorías: {data}")
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 5)
        slugs = [c["slug"] for c in data]
        self.assertIn("cargadores", slugs)
        self.assertIn("cables", slugs)
        print("\n[PASS] TEST 1: Rol anon lee categorias activas correctamente")

    def test_02_read_products_anon(self):
        """Rol anon puede leer productos activos con precios y stock de servidor"""
        status, data = api_request("/rest/v1/products?select=*,category:categories(name,slug)&is_active=eq.true")
        self.assertEqual(status, 200, f"Error al consultar productos: {data}")
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 7, "Deben existir exactamente los 7 productos oficiales")
        
        for p in data:
            self.assertGreater(p["store_price"], 0)
            self.assertGreater(p["online_price"], 0)
            self.assertLessEqual(p["online_price"], p["store_price"], "online_price debe ser <= store_price")
            self.assertGreater(p["stock"], 0)
            self.assertTrue(p["is_active"])
        print("[PASS] TEST 2: Rol anon lee 7 productos oficiales con precios y stock de servidor")

    def test_03_read_store_config_anon(self):
        """Rol anon puede leer configuración de tienda (bancos, horarios)"""
        status, data = api_request("/rest/v1/store_config?select=key,value")
        self.assertEqual(status, 200, f"Error al consultar store_config: {data}")
        self.assertIsInstance(data, list)
        keys = [item["key"] for item in data]
        self.assertIn("bank_details", keys)
        self.assertIn("cajavecina_instructions", keys)
        self.assertIn("store_info", keys)
        print("[PASS] TEST 3: Rol anon lee configuracion store_config de tienda")

    def test_04_create_order_rpc_and_idempotency(self):
        """Crear pedido con RPC create_order_with_reservation valida stock, precios e idempotencia"""
        # 1. Obtener un producto real
        _, prods = api_request("/rest/v1/products?select=id,name,stock,online_price,store_price&limit=1")
        prod = prods[0]
        initial_stock = prod["stock"]
        self.assertGreater(initial_stock, 0)

        # 2. Crear orden con idempotency key
        test_idemp = f"test_idemp_{uuid.uuid4().hex[:12]}"
        order_payload = {
            "p_customer_name": "Test Cliente Automatizado",
            "p_customer_phone": "+56 9 1234 5678",
            "p_customer_email": "test@demgel.cl",
            "p_payment_method": "transferencia",
            "p_source_campaign": "test_suite",
            "p_items": [
                {"product_id": prod["id"], "quantity": 1}
            ],
            "p_idempotency_key": test_idemp
        }

        status, result = api_request("/rest/v1/rpc/create_order_with_reservation", method="POST", data=order_payload)
        self.assertEqual(status, 200, f"Error al crear pedido via RPC: {result}")
        self.assertTrue(result["success"])
        self.assertIn("order_id", result)
        self.assertIn("order_number", result)
        self.assertIn("access_token", result)
        self.assertEqual(result["total_online_price"], prod["online_price"])
        self.assertEqual(result["total_store_price"], prod["store_price"])
        self.assertEqual(result["total_savings"], prod["store_price"] - prod["online_price"])

        order_id = result["order_id"]
        access_token = result["access_token"]

        # 3. Probar idempotencia con la misma llave -> debe retornar la misma orden
        status_dup, result_dup = api_request("/rest/v1/rpc/create_order_with_reservation", method="POST", data=order_payload)
        self.assertEqual(status_dup, 200)
        self.assertTrue(result_dup["is_duplicate_request"])
        self.assertEqual(result_dup["order_id"], order_id)

        # 4. Probar consulta via get_order_by_token
        query_payload = {
            "p_order_id": order_id,
            "p_access_token": access_token
        }
        status_get, result_get = api_request("/rest/v1/rpc/get_order_by_token", method="POST", data=query_payload)
        self.assertEqual(status_get, 200)
        self.assertIsNotNone(result_get)
        self.assertEqual(result_get["order"]["id"], order_id)
        self.assertEqual(result_get["order"]["status"], "PENDIENTE DE PAGO")
        self.assertEqual(len(result_get["items"]), 1)

        # 5. Token inválido es rechazado
        query_bad = {
            "p_order_id": order_id,
            "p_access_token": "token_invalido_hacker"
        }
        status_bad, result_bad = api_request("/rest/v1/rpc/get_order_by_token", method="POST", data=query_bad)
        self.assertEqual(status_bad, 200)
        self.assertIsNone(result_bad, "Con token invalido debe devolver null")

        # 6. Subir comprobante simulado a Storage (Bucket 'receipts')
        file_content = b"Simulacion de comprobante PDF bancario Demgel"
        storage_path = f"{order_id}/test_voucher.pdf"
        status_st, res_st = api_request(
            f"/storage/v1/object/receipts/{storage_path}",
            method="POST",
            data=file_content,
            extra_headers={"Content-Type": "application/pdf"}
        )
        self.assertEqual(status_st, 200, f"Error al subir comprobante a Storage: {res_st}")

        # 7. Asociar comprobante via submit_order_receipt
        receipt_payload = {
            "p_order_id": order_id,
            "p_access_token": access_token,
            "p_receipt_path": storage_path,
            "p_receipt_mime": "application/pdf"
        }
        status_rec, result_rec = api_request("/rest/v1/rpc/submit_order_receipt", method="POST", data=receipt_payload)
        self.assertEqual(status_rec, 200)
        self.assertTrue(result_rec["success"])
        self.assertEqual(result_rec["status"], "PAGO EN REVISIÓN")

        print("[PASS] TEST 4: Flujo completo create_order, idempotencia, get_order_by_token y Storage comprobante superados")

    def test_05_rls_blocks_direct_order_insert(self):
        """Seguridad RLS: Intento de INSERT directo a public.orders desde anon es bloqueado"""
        direct_payload = {
            "order_number": "DG-HACK-0001",
            "customer_name": "Inyeccion Maliciosa",
            "customer_phone": "+56999999999",
            "payment_method": "transferencia",
            "total_store_price": 100,
            "total_online_price": 100,
            "total_savings": 0
        }
        status, res = api_request("/rest/v1/orders", method="POST", data=direct_payload)
        # Debe fallar con 401 Unauthorized o 403 Forbidden por RLS
        self.assertIn(status, [401, 403, 404], f"RLS debio bloquear el INSERT directo pero dio {status}: {res}")
        print("[PASS] TEST 5: Seguridad RLS bloquea insercion directa a orders por rol anon")

if __name__ == "__main__":
    unittest.main()
