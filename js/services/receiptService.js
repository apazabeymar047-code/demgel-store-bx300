/**
 * SERVICIO DE COMPROBANTES DE PAGO (RECEIPT SERVICE)
 * FASE 2D: Validación estricta de MIME, tamaño máximo 10 MB, preview y simulación de carga
 */

const DemgelReceiptService = (function() {
    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
    const ALLOWED_MIME_TYPES = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "application/pdf"
    ];

    // 1. Validar archivo antes de procesar
    function validateFile(file) {
        if (!file) {
            return { valid: false, error: "NO_FILE", message: "Por favor selecciona un archivo." };
        }

        // Validar tamaño
        if (file.size > MAX_FILE_SIZE_BYTES) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            return {
                valid: false,
                error: "FILE_TOO_LARGE",
                message: `El archivo supera el tamaño máximo de 10 MB (Tamaño actual: ${sizeMB} MB). Por favor elige una imagen o PDF más liviano.`
            };
        }

        // Validar extensión y MIME
        const mime = file.type.toLowerCase();
        const ext = file.name.split(".").pop().toLowerCase();
        const isAllowedExt = ["jpg", "jpeg", "png", "webp", "pdf"].includes(ext);
        const isAllowedMime = ALLOWED_MIME_TYPES.includes(mime);

        if (!isAllowedExt && !isAllowedMime) {
            return {
                valid: false,
                error: "INVALID_FORMAT",
                message: "Formato no compatible. Solo se permiten imágenes (JPG, PNG, WEBP) o documentos PDF."
            };
        }

        return { valid: true, isPdf: mime === "application/pdf" || ext === "pdf" };
    }

    // 2. Generar Previsualización (Base64 para imágenes, Metadatos para PDF)
    function generatePreview(file, callback) {
        const validation = validateFile(file);
        if (!validation.valid) {
            callback(validation, null);
            return;
        }

        const isPdf = validation.isPdf;

        if (isPdf) {
            callback(null, {
                isPdf: true,
                fileName: file.name,
                fileSize: formatBytes(file.size),
                fileType: "application/pdf",
                previewUrl: null
            });
        } else {
            const reader = new FileReader();
            reader.onload = function(e) {
                callback(null, {
                    isPdf: false,
                    fileName: file.name,
                    fileSize: formatBytes(file.size),
                    fileType: file.type || "image/jpeg",
                    previewUrl: e.target.result
                });
            };
            reader.onerror = function() {
                callback({ valid: false, error: "READ_ERROR", message: "Error al leer el archivo en el dispositivo." }, null);
            };
            reader.readAsDataURL(file);
        }
    }

    // 3. Procesamiento y envío de comprobante (Storage privado + RPC)
    async function processAndSubmitReceipt(orderId, accessToken, receiptData, rawFile = null) {
        DemgelAnalytics.trackReceiptUploadStarted(orderId);

        const fileToUpload = rawFile || (receiptData && receiptData.rawFile);

        if (typeof DemgelSupabase !== "undefined" && fileToUpload) {
            try {
                const uploadRes = await DemgelSupabase.uploadReceiptFile(orderId, fileToUpload);
                if (uploadRes && uploadRes.success) {
                    receiptData.storagePath = uploadRes.path;
                } else {
                    console.warn("Supabase Storage RLS upload omitido/fallback, continuando con Telegram:", uploadRes ? uploadRes.error : "");
                }
            } catch (err) {
                console.warn("Excepción al intentar subir a Supabase Storage:", err);
            }
        }

        const result = await DemgelOrderService.submitReceipt(orderId, accessToken, receiptData);

        return result;
    }



    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    return {
        validateFile,
        generatePreview,
        processAndSubmitReceipt,
        formatBytes
    };
})();
