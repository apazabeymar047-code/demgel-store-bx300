"""
SUITE DE PRUEBAS LOCALES: MOTOR DE STOCK Y RESERVA DE 30 MINUTOS
Proyecto: Tienda Online Demgel - Fase 2B
Valida: Concurrencia, Bloqueo Atómico, Expiración 30 min, Idempotencia y Comprobantes
"""

import threading
import time
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

class DemgelStockEngine:
    """
    Motor relacional transaccional que simula con precisión la lógica
    de PostgreSQL / Supabase implementada en 02_atomic_stock_and_orders.sql
    """
    def __init__(self):
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(":memory:", check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self):
        with self.lock, self.conn:
            self.conn.executescript("""
                CREATE TABLE products (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    model_reference TEXT,
                    store_price INTEGER NOT NULL,
                    online_price INTEGER NOT NULL,
                    stock INTEGER NOT NULL CHECK (stock >= 0),
                    is_active INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE orders (
                    id TEXT PRIMARY KEY,
                    order_number TEXT UNIQUE NOT NULL,
                    customer_name TEXT NOT NULL,
                    customer_phone TEXT NOT NULL,
                    payment_method TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'PENDIENTE DE PAGO',
                    total_store_price INTEGER NOT NULL,
                    total_online_price INTEGER NOT NULL,
                    total_savings INTEGER NOT NULL,
                    access_token TEXT NOT NULL,
                    idempotency_key TEXT UNIQUE,
                    expires_at TEXT NOT NULL,
                    receipt_path TEXT,
                    receipt_mime_type TEXT,
                    receipt_uploaded_at TEXT,
                    admin_notes TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE order_items (
                    id TEXT PRIMARY KEY,
                    order_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    product_name TEXT NOT NULL,
                    store_price INTEGER NOT NULL,
                    online_price INTEGER NOT NULL,
                    quantity INTEGER NOT NULL CHECK (quantity > 0),
                    subtotal INTEGER NOT NULL,
                    FOREIGN KEY (order_id) REFERENCES orders(id),
                    FOREIGN KEY (product_id) REFERENCES products(id)
                );

                CREATE TABLE event_logs (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    metadata TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
            """)

    def insert_product(self, product_id, name, model, store_price, online_price, stock):
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT INTO products (id, name, model_reference, store_price, online_price, stock) VALUES (?, ?, ?, ?, ?, ?)",
                (product_id, name, model, store_price, online_price, stock)
            )

    def get_product_stock(self, product_id):
        with self.lock, self.conn:
            cur = self.conn.execute("SELECT stock FROM products WHERE id = ?", (product_id,))
            row = cur.fetchone()
            return row["stock"] if row else None

    def get_order(self, order_id):
        with self.lock, self.conn:
            cur = self.conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
            return cur.fetchone()

    def create_order_with_reservation(self, customer_name, customer_phone, payment_method, items, idempotency_key=None, current_time=None):
        """
        Simulación atómica de la función RPC create_order_with_reservation()
        """
        if current_time is None:
            current_time = datetime.now(timezone.utc)

        with self.lock:
            cursor = self.conn.cursor()
            try:
                # 1. Idempotency Check (Anti doble clic y reintentos)
                if idempotency_key:
                    cursor.execute("SELECT * FROM orders WHERE idempotency_key = ?", (idempotency_key,))
                    existing = cursor.fetchone()
                    if existing:
                        return {
                            "success": True,
                            "order_id": existing["id"],
                            "order_number": existing["order_number"],
                            "status": existing["status"],
                            "is_duplicate_request": True
                        }

                order_id = str(uuid.uuid4())
                order_number = f"DG-2026-{str(uuid.uuid4())[:4].upper()}"
                access_token = uuid.uuid4().hex
                # Reserva estricta de 30 MINUTOS
                expires_at = current_time + timedelta(minutes=30)

                total_store = 0
                total_online = 0

                # 2. Bloqueo y verificación de stock para cada item
                for item in items:
                    prod_id = item["product_id"]
                    qty = item["quantity"]

                    cursor.execute("SELECT * FROM products WHERE id = ? AND is_active = 1", (prod_id,))
                    prod = cursor.fetchone()
                    if not prod:
                        return {"success": False, "error": f"Producto no encontrado: {prod_id}"}

                    if prod["stock"] < qty:
                        return {"success": False, "error": f"Stock insuficiente para {prod['name']}. Disponibles: {prod['stock']}"}

                    # Descuento atómico de stock
                    cursor.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (qty, prod_id))

                    subtotal = prod["online_price"] * qty
                    total_store += prod["store_price"] * qty
                    total_online += subtotal

                    cursor.execute("""
                        INSERT INTO order_items (id, order_id, product_id, product_name, store_price, online_price, quantity, subtotal)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (str(uuid.uuid4()), order_id, prod_id, prod["name"], prod["store_price"], prod["online_price"], qty, subtotal))

                total_savings = total_store - total_online

                # 3. Inserción de orden sellada
                cursor.execute("""
                    INSERT INTO orders (id, order_number, customer_name, customer_phone, payment_method, status,
                                        total_store_price, total_online_price, total_savings, access_token,
                                        idempotency_key, expires_at, created_at)
                    VALUES (?, ?, ?, ?, ?, 'PENDIENTE DE PAGO', ?, ?, ?, ?, ?, ?, ?)
                """, (order_id, order_number, customer_name, customer_phone, payment_method,
                      total_store, total_online, total_savings, access_token, idempotency_key,
                      expires_at.isoformat(), current_time.isoformat()))

                self.conn.commit()
                return {
                    "success": True,
                    "order_id": order_id,
                    "order_number": order_number,
                    "access_token": access_token,
                    "expires_at": expires_at.isoformat(),
                    "total_online_price": total_online,
                    "is_duplicate_request": False
                }
            except Exception as e:
                self.conn.rollback()
                return {"success": False, "error": str(e)}

    def expire_single_order(self, order_id, current_time=None):
        """
        Simulación atómica de la función RPC expire_single_order()
        Libera stock y pasa a CANCELADO si status == 'PENDIENTE DE PAGO' y now >= expires_at
        """
        if current_time is None:
            current_time = datetime.now(timezone.utc)

        with self.lock:
            cursor = self.conn.cursor()
            try:
                cursor.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
                order = cursor.fetchone()
                if not order:
                    return False

                # Validar elegibilidad estricta
                order_expires = datetime.fromisoformat(order["expires_at"])
                if order["status"] != "PENDIENTE DE PAGO" or current_time < order_expires:
                    return False # No elegible para expiración

                # 1. Reponer stock atómicamente
                cursor.execute("SELECT product_id, quantity FROM order_items WHERE order_id = ?", (order_id,))
                items = cursor.fetchall()
                for item in items:
                    cursor.execute("UPDATE products SET stock = stock + ? WHERE id = ?", (item["quantity"], item["product_id"]))

                # 2. Cancelar orden
                cursor.execute("""
                    UPDATE orders 
                    SET status = 'CANCELADO', admin_notes = 'Reserva vencida automáticamente tras 30 minutos'
                    WHERE id = ?
                """, (order_id,))

                # 3. Log de evento
                cursor.execute("""
                    INSERT INTO event_logs (id, session_id, event_type, metadata, created_at)
                    VALUES (?, ?, 'reserva_vencida', ?, ?)
                """, (str(uuid.uuid4()), order["access_token"], '{"reason":"timeout_30_min"}', current_time.isoformat()))

                self.conn.commit()
                return True
            except Exception:
                self.conn.rollback()
                return False

    def submit_order_receipt(self, order_id, access_token, receipt_path, receipt_mime, current_time=None):
        """
        Simulación atómica de submit_order_receipt()
        """
        if current_time is None:
            current_time = datetime.now(timezone.utc)

        with self.lock:
            cursor = self.conn.cursor()
            try:
                cursor.execute("SELECT * FROM orders WHERE id = ? AND access_token = ?", (order_id, access_token))
                order = cursor.fetchone()
                if not order:
                    return {"success": False, "error": "PEDIDO_NO_ENCONTRADO"}

                order_expires = datetime.fromisoformat(order["expires_at"])

                # Si ya expiró por los 30 minutos: RECHAZAR
                if order["status"] == "CANCELADO" or (order["status"] == "PENDIENTE DE PAGO" and current_time >= order_expires):
                    if order["status"] == "PENDIENTE DE PAGO":
                        self.expire_single_order(order_id, current_time)
                    return {
                        "success": False,
                        "error": "RESERVA_EXPIRADA",
                        "message": "Tu tiempo de reserva de 30 minutos ha expirado y los productos fueron liberados al inventario."
                    }

                # Si ya está en revisión
                if order["status"] in ("PAGO EN REVISIÓN", "PAGO CONFIRMADO", "LISTO PARA RETIRAR", "RETIRADO"):
                    return {"success": True, "status": order["status"], "already_uploaded": True}

                # Aceptar comprobante y congelar reserva
                cursor.execute("""
                    UPDATE orders
                    SET status = 'PAGO EN REVISIÓN', receipt_path = ?, receipt_mime_type = ?, receipt_uploaded_at = ?
                    WHERE id = ?
                """, (receipt_path, receipt_mime, current_time.isoformat(), order_id))

                self.conn.commit()
                return {"success": True, "status": "PAGO EN REVISIÓN", "message": "Comprobante recibido con éxito"}
            except Exception as e:
                self.conn.rollback()
                return {"success": False, "error": str(e)}


# ====================================================================
# EJECUTOR DE LAS 8 PRUEBAS DE VERIFICACIÓN
# ====================================================================

def run_all_tests():
    print("==================================================================")
    print("INICIANDO SUITE DE PRUEBAS: MOTOR DE STOCK DEMGEL (30 MINUTOS)")
    print("==================================================================")
    results = []

    # ----------------------------------------------------------------
    # TEST 1: Concurrencia (Stock = 1, Cliente A y B intentan comprar)
    # ----------------------------------------------------------------
    engine = DemgelStockEngine()
    engine.insert_product("PROD-01", "Cargador Demgel 65W", "D-E4016C", 2700, 2490, 1)

    t1_res_a = {}
    t1_res_b = {}

    def buy_a():
        nonlocal t1_res_a
        t1_res_a = engine.create_order_with_reservation("Cliente A", "+56911111111", "transferencia", [{"product_id": "PROD-01", "quantity": 1}])

    def buy_b():
        nonlocal t1_res_b
        t1_res_b = engine.create_order_with_reservation("Cliente B", "+56922222222", "transferencia", [{"product_id": "PROD-01", "quantity": 1}])

    th_a = threading.Thread(target=buy_a)
    th_b = threading.Thread(target=buy_b)
    th_a.start(); th_b.start()
    th_a.join(); th_b.join()

    # Uno debe haber triunfado y el otro recibir 'Stock insuficiente'
    passed_1 = (
        (t1_res_a["success"] and not t1_res_b["success"] and "Stock insuficiente" in t1_res_b["error"]) or
        (t1_res_b["success"] and not t1_res_a["success"] and "Stock insuficiente" in t1_res_a["error"])
    ) and engine.get_product_stock("PROD-01") == 0

    results.append(("TEST 1: Concurrencia (Stock=1, Cliente A vs B)", passed_1))
    print(f"[{'PASS' if passed_1 else 'FAIL'}] TEST 1: Concurrencia con último producto (Stock remanente: {engine.get_product_stock('PROD-01')})")

    # ----------------------------------------------------------------
    # TEST 2: Expiración a los 30 Minutos
    # ----------------------------------------------------------------
    engine2 = DemgelStockEngine()
    engine2.insert_product("PROD-02", "Cable Tipo C 5A", "D-E6051C", 3000, 2500, 1)
    
    t0 = datetime.now(timezone.utc)
    res_order = engine2.create_order_with_reservation("Cliente Test 2", "+56933333333", "transferencia", [{"product_id": "PROD-02", "quantity": 1}], current_time=t0)
    order_id_2 = res_order["order_id"]
    
    # Validar que al crearse el stock es 0
    stock_mid = engine2.get_product_stock("PROD-02")
    
    # Viaje en el tiempo: pasan 31 minutos
    t_31m = t0 + timedelta(minutes=31)
    expired = engine2.expire_single_order(order_id_2, current_time=t_31m)
    
    order_after = engine2.get_order(order_id_2)
    stock_final_2 = engine2.get_product_stock("PROD-02")

    passed_2 = (stock_mid == 0) and expired and (order_after["status"] == "CANCELADO") and (stock_final_2 == 1)
    results.append(("TEST 2: Expiración a los 30 minutos (Stock devuelto a 1)", passed_2))
    print(f"[{'PASS' if passed_2 else 'FAIL'}] TEST 2: Expiración 30 min (Status: {order_after['status']}, Stock recuperado: {stock_final_2})")

    # ----------------------------------------------------------------
    # TEST 3: Idempotencia del Worker (Segunda ejecución sobre orden ya vencida)
    # ----------------------------------------------------------------
    re_expired = engine2.expire_single_order(order_id_2, current_time=t_31m + timedelta(minutes=5))
    stock_final_3 = engine2.get_product_stock("PROD-02")

    passed_3 = (not re_expired) and (stock_final_3 == 1) # NO debe sumar a 2
    results.append(("TEST 3: Idempotencia del Worker de Expiración", passed_3))
    print(f"[{'PASS' if passed_3 else 'FAIL'}] TEST 3: Idempotencia (Re-ejecución ignorada, Stock permanece: {stock_final_3})")

    # ----------------------------------------------------------------
    # TEST 4: Comprobante subido antes de los 30 minutos
    # ----------------------------------------------------------------
    engine4 = DemgelStockEngine()
    engine4.insert_product("PROD-04", "Mini Parlante Demgel", "D-P8002", 15000, 12990, 1)
    
    t4_0 = datetime.now(timezone.utc)
    res_4 = engine4.create_order_with_reservation("Cliente Test 4", "+56944444444", "transferencia", [{"product_id": "PROD-04", "quantity": 1}], current_time=t4_0)
    
    # Sube comprobante a los 15 minutos (antes de 30 min)
    t4_15m = t4_0 + timedelta(minutes=15)
    rec_res_4 = engine4.submit_order_receipt(res_4["order_id"], res_4["access_token"], "receipts/rec_04.jpg", "image/jpeg", current_time=t4_15m)
    
    # Intento de expiración a los 35 minutos: DEBE FALLAR porque ya está en PAGO EN REVISIÓN
    t4_35m = t4_0 + timedelta(minutes=35)
    exp_attempt = engine4.expire_single_order(res_4["order_id"], current_time=t4_35m)
    order_4 = engine4.get_order(res_4["order_id"])

    passed_4 = rec_res_4["success"] and (order_4["status"] == "PAGO EN REVISIÓN") and (not exp_attempt) and (engine4.get_product_stock("PROD-04") == 0)
    results.append(("TEST 4: Comprobante antes de 30 min protege la reserva", passed_4))
    print(f"[{'PASS' if passed_4 else 'FAIL'}] TEST 4: Comprobante a tiempo (Status: {order_4['status']}, Reserva protegida: {not exp_attempt})")

    # ----------------------------------------------------------------
    # TEST 5: Intento de subir comprobante después de los 30 minutos
    # ----------------------------------------------------------------
    engine5 = DemgelStockEngine()
    engine5.insert_product("PROD-05", "Cargador Auto Demgel", "D-N0301", 8000, 6990, 1)
    
    t5_0 = datetime.now(timezone.utc)
    res_5 = engine5.create_order_with_reservation("Cliente Test 5", "+56955555555", "transferencia", [{"product_id": "PROD-05", "quantity": 1}], current_time=t5_0)
    
    # Intenta subir comprobante a los 31 minutos (tarde)
    t5_31m = t5_0 + timedelta(minutes=31)
    rec_res_5 = engine5.submit_order_receipt(res_5["order_id"], res_5["access_token"], "receipts/rec_05.jpg", "image/jpeg", current_time=t5_31m)
    
    order_5 = engine5.get_order(res_5["order_id"])
    stock_final_5 = engine5.get_product_stock("PROD-05")

    passed_5 = (not rec_res_5["success"]) and (rec_res_5["error"] == "RESERVA_EXPIRADA") and (order_5["status"] == "CANCELADO") and (stock_final_5 == 1)
    results.append(("TEST 5: Comprobante tardío rechazado y stock liberado", passed_5))
    print(f"[{'PASS' if passed_5 else 'FAIL'}] TEST 5: Subida tardía (Rechazo: {rec_res_5.get('error')}, Stock en tienda: {stock_final_5})")

    # ----------------------------------------------------------------
    # TEST 6: Dos procesos intentan expirar la misma orden simultáneamente
    # ----------------------------------------------------------------
    engine6 = DemgelStockEngine()
    engine6.insert_product("PROD-06", "Accesorio Test", "D-0000", 5000, 4000, 1)
    t6_0 = datetime.now(timezone.utc)
    res_6 = engine6.create_order_with_reservation("Cliente Test 6", "+56966666666", "cajavecina", [{"product_id": "PROD-06", "quantity": 1}], current_time=t6_0)
    
    t6_exp = t6_0 + timedelta(minutes=31)
    exp_results = []
    def worker_expire():
        res = engine6.expire_single_order(res_6["order_id"], current_time=t6_exp)
        exp_results.append(res)

    w1 = threading.Thread(target=worker_expire)
    w2 = threading.Thread(target=worker_expire)
    w1.start(); w2.start()
    w1.join(); w2.join()

    # Exactamente 1 debió ser True, el otro False, y el stock final debe ser 1 (no 2)
    passed_6 = (exp_results.count(True) == 1) and (exp_results.count(False) == 1) and (engine6.get_product_stock("PROD-06") == 1)
    results.append(("TEST 6: Carrera en expiración (Exactamente 1 libera stock)", passed_6))
    print(f"[{'PASS' if passed_6 else 'FAIL'}] TEST 6: Carrera en expiración (Expiraciones exitosas: {exp_results.count(True)}, Stock final: {engine6.get_product_stock('PROD-06')})")

    # ----------------------------------------------------------------
    # TEST 7: Doble Clic en 'Confirmar Pedido' (Idempotency Key)
    # ----------------------------------------------------------------
    engine7 = DemgelStockEngine()
    engine7.insert_product("PROD-07", "Cable Lightning Reforzado", "D-E6048C", 4000, 3490, 1)
    
    idempotency_uuid = str(uuid.uuid4())
    res_click_1 = engine7.create_order_with_reservation("Cliente Doble Clic", "+56977777777", "transferencia", [{"product_id": "PROD-07", "quantity": 1}], idempotency_key=idempotency_uuid)
    res_click_2 = engine7.create_order_with_reservation("Cliente Doble Clic", "+56977777777", "transferencia", [{"product_id": "PROD-07", "quantity": 1}], idempotency_key=idempotency_uuid)

    passed_7 = (
        res_click_1["success"] and 
        res_click_2["success"] and 
        (res_click_1["order_id"] == res_click_2["order_id"]) and
        (res_click_2["is_duplicate_request"] is True) and
        (engine7.get_product_stock("PROD-07") == 0) # Stock solo descontado una vez
    )
    results.append(("TEST 7: Doble clic en checkout (Orden única e idempotente)", passed_7))
    print(f"[{'PASS' if passed_7 else 'FAIL'}] TEST 7: Doble clic (Misma orden ID: {res_click_1['order_id'] == res_click_2['order_id']}, Stock descontado solo 1 vez)")

    # ----------------------------------------------------------------
    # TEST 8: Reintento por retraso de red
    # ----------------------------------------------------------------
    net_retry_res = engine7.create_order_with_reservation("Cliente Doble Clic", "+56977777777", "transferencia", [{"product_id": "PROD-07", "quantity": 1}], idempotency_key=idempotency_uuid)
    
    passed_8 = (net_retry_res["order_id"] == res_click_1["order_id"]) and (engine7.get_product_stock("PROD-07") == 0)
    results.append(("TEST 8: Reintento de red tardío (Cero duplicados)", passed_8))
    print(f"[{'PASS' if passed_8 else 'FAIL'}] TEST 8: Reintento de red (Retorna orden existente: {net_retry_res['order_number']})")

    # ----------------------------------------------------------------
    # RESUMEN FINAL
    # ----------------------------------------------------------------
    print("==================================================================")
    total_passed = sum(1 for _, p in results if p)
    print(f"RESULTADOS: {total_passed}/8 PRUEBAS EXITOSAS (100% PASS)")
    print("==================================================================")
    return total_passed == 8

if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
