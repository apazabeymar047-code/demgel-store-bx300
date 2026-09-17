# GUÍA DE ARQUITECTURA Y DESPLIEGUE: TIENDA DEMGEL
**Estado:** Documentación Técnica de Fase 2A (Preparada para Conexión Posterior)

---

## 1. RESUMEN DE LA INFRAESTRUCTURA PREPARADA

Toda la lógica de datos, seguridad transaccional, cálculo de precios en servidor y control de stock ha quedado encapsulada en la carpeta `supabase/`:

```
c:\Users\Administrator\Desktop\WEB DEMGEL BX 300\
├── DEPLOYMENT_GUIDE.md              <-- Esta guía completa
└── supabase/
    ├── complete_schema.sql          <-- Script consolidado para ejecución directa
    └── migrations/
        ├── 01_schema_and_tables.sql       <-- Tablas, constraints e índices
        ├── 02_atomic_stock_and_orders.sql <-- RPC: stock atómico, reserva 30m, comprobantes
        ├── 03_security_and_rls.sql        <-- RLS, función is_admin(), políticas de acceso
        ├── 04_storage_buckets_setup.sql   <-- Buckets 'product-images' y 'receipts'
        └── 05_initial_seed_config.sql     <-- Categorías iniciales y plantillas de configuración
```

---

## 2. CÓMO SE CONECTARÁ SUPABASE EN LA FASE FINAL DE DESPLIEGUE

Cuando se apruebe la fase de despliegue y se disponga del proyecto en Supabase, el proceso será:

### Paso 1: Ejecución del Esquema en Supabase
1. Abrir el panel web de Supabase del proyecto creado.
2. Ir a la pestaña **SQL Editor** (en el menú lateral izquierdo).
3. Abrir el archivo [complete_schema.sql](file:///c:/Users/Administrator/Desktop/WEB%20DEMGEL%20BX%20300/supabase/complete_schema.sql).
4. Copiar todo el contenido, pegarlo en el editor y presionar **RUN**.
5. *Resultado:* Se crearán automáticamente las 7 tablas, todos los índices, las funciones RPC transaccionales, las políticas RLS y los dos buckets de Storage.

### Paso 2: Configuración del Primer Administrador
Para otorgar acceso administrativo al panel `/admin`:
1. Ir a **Authentication > Users** en Supabase y crear el usuario administrador con su email y contraseña.
2. Ir a **SQL Editor** y ejecutar:
   ```sql
   INSERT INTO public.admin_users (user_id, email)
   VALUES ('<USER_ID_OBTENIDO>', 'tu-email-admin@demgel.cl');
   ```

### Paso 3: Configuración de Variables en el Frontend
En el archivo de configuración del frontend (que se construirá en las siguientes fases), se definirán únicamente las credenciales públicas:
```javascript
const SUPABASE_URL = "https://tu-proyecto.supabase.co";
const SUPABASE_ANON_KEY = "tu-anon-key-publica";
```

---

## 3. CÓMO SE CONECTARÁ TELEGRAM EN LA FASE FINAL DE DESPLIEGUE

El despacho físico de fotos y PDFs se ejecutará mediante una **Supabase Edge Function** (`notify-telegram`) para no exponer ningún secreto al navegador.

### Paso 1: Creación del Bot y Chat ID
1. En Telegram, hablar con `@BotFather`, crear el bot y obtener el `TELEGRAM_BOT_TOKEN`.
2. Crear o usar un canal/chat privado con el bot, hablarle y obtener el `TELEGRAM_CHAT_ID`.

### Paso 2: Asignación de Secretos en Supabase
Desde la consola o terminal de Supabase se asignarán las variables de entorno privadas:
```bash
supabase secrets set TELEGRAM_BOT_TOKEN="123456789:ABCdef..."
supabase secrets set TELEGRAM_CHAT_ID="-100xxxxxxxxxx"
```

### Paso 3: Activación del Webhook de Storage
Se configurará un Webhook en Supabase Storage sobre el bucket `receipts`:
* **Evento:** `INSERT` de nuevos archivos.
* **Destino:** URL de la Edge Function `notify-telegram`.
* **Acción:** La función toma el binario (JPG/PNG o PDF) y ejecuta `sendPhoto` o `sendDocument` directamente hacia el chat de Telegram.

---

## 4. MATRIZ DE TABLAS Y REGLAS DE SEGURIDAD

| Tabla | Acceso Público (Anon) | Acceso Administrativo | Regla Crítica |
| :--- | :--- | :--- | :--- |
| `categories` | Solo lectura (`is_active = true`) | Control Total | Organiza las 5 categorías iniciales |
| `products` | Solo lectura (`is_active = true`) | Control Total | El frontend **no** puede alterar precios ni stock |
| `orders` | Lectura solo con `access_token` único | Control Total | Reserva estricta de **30 minutos**. Cero buscador público por teléfono |
| `order_items` | Lectura de ítems del propio pedido | Control Total | Registros inmutables con precio histórico congelado |
| `store_config` | Lectura pública de bancos y horarios | Control Total | Permite editar cuentas bancarias sin tocar código |
| `event_logs` | Inserción anónima permitida | Solo lectura | Analítica de visitas, productos vistos y antispam |
| `admin_users` | Bloqueado al 100% | Control Total | Lista blanca de administradores autenticados |

---

## 5. BUCKETS DE STORAGE DEFINIDOS

1. **`product-images` (Público):**
   * Límite: 5 MB por archivo.
   * Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`.
   * Propósito: Fotos del catálogo, cables, cargadores, mini parlantes.
2. **`receipts` (100% PRIVADO):**
   * Límite: 10 MB por archivo.
   * Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
   * Propósito: Comprobantes bancarios y de CajaVecina subidos por clientes. Ningún tercero puede leerlos; solo accesibles por el Administrador y la Edge Function de Telegram.
