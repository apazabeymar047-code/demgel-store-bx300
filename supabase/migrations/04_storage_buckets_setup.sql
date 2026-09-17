-- ====================================================================
-- FASE 2A: 04_storage_buckets_setup.sql
-- Proyecto: Tienda Online Demgel
-- Propósito: Configuración de buckets y políticas de Supabase Storage
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. CREACIÓN DE BUCKETS
-- Bucket 1: 'product-images' (PÚBLICO para catálogo)
-- Bucket 2: 'receipts' (100% PRIVADO para comprobantes de pago)
-- --------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    (
        'product-images',
        'product-images',
        true,
        5242880, -- 5 MB máximo por foto de producto
        ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    ),
    (
        'receipts',
        'receipts',
        false, -- PRIVADO: ninguna persona puede ver comprobantes ajenos
        10485760, -- 10 MB máximo por foto o PDF
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
    )
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- --------------------------------------------------------------------
-- 2. POLÍTICAS DE ACCESO PARA: product-images (PÚBLICO)
-- --------------------------------------------------------------------

CREATE POLICY "Public read product images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'product-images');

CREATE POLICY "Admin manage product images"
    ON storage.objects FOR ALL
    USING (bucket_id = 'product-images' AND public.is_admin())
    WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

-- --------------------------------------------------------------------
-- 3. POLÍTICAS DE ACCESO PARA: receipts (PRIVADO)
-- Lectura pública BLOQUEADA.
-- Solo clientes pueden subir el comprobante de su orden.
-- Solo el Administrador o la Edge Function (Service Role) pueden descargarlo.
-- --------------------------------------------------------------------

CREATE POLICY "Clients can upload receipts"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'receipts'
        AND (
            -- Limitar subida a archivos de imagen o PDF
            storage.extension(name) IN ('jpg', 'jpeg', 'png', 'webp', 'pdf')
        )
    );

CREATE POLICY "Admin and backend read receipts"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'receipts' 
        AND public.is_admin()
    );

CREATE POLICY "Admin delete receipts"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'receipts' 
        AND public.is_admin()
    );
