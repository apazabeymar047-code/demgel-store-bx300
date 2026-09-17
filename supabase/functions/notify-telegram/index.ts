import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req: Request) => {
  // Manejo de Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Variables de entorno Supabase no configuradas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Leer cuerpo de la solicitud
    const body = await req.json().catch(() => ({}));
    const orderId = body.order_id;
    const accessToken = body.access_token;

    if (!orderId) {
      return new Response(
        JSON.stringify({ success: false, error: "order_id es obligatorio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Reclamación atómica de la orden (Protección anti-duplicados: pending/failed -> sending)
    const { data: claimData, error: claimError } = await supabase.rpc("claim_order_for_telegram", {
      p_order_id: orderId
    });

    if (claimError) {
      console.error("Error en claim_order_for_telegram:", claimError);
      return new Response(
        JSON.stringify({ success: false, error: "Error al reclamar orden para envío", details: claimError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Si no retornó filas, ya está en proceso de envío ('sending') o ya fue despachado ('sent')
    if (!claimData || claimData.length === 0) {
      // Consultar estado actual
      const { data: currentOrder } = await supabase
        .from("orders")
        .select("telegram_status, order_number")
        .eq("id", orderId)
        .single();

      const currentStatus = currentOrder ? currentOrder.telegram_status : "desconocido";
      return new Response(
        JSON.stringify({
          success: currentStatus === "sent",
          already_processed: true,
          telegram_status: currentStatus,
          message: `El comprobante ya se encuentra en estado '${currentStatus}'. No se genera duplicado.`
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const order = claimData[0];

    // 2. Obtener credenciales de Telegram desde configuración segura en base de datos
    const { data: configData, error: configError } = await supabase.rpc("get_telegram_config");
    let botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    let chatId = Deno.env.get("TELEGRAM_CHAT_ID");

    if (configData && configData.length > 0) {
      botToken = botToken || configData[0].bot_token;
      chatId = chatId || configData[0].chat_id;
    }

    if (!botToken || !chatId) {
      await supabase.rpc("mark_telegram_result", {
        p_order_id: orderId,
        p_success: false,
        p_message_id: null,
        p_error: "Credenciales de Telegram no configuradas"
      });
      return new Response(
        JSON.stringify({ success: false, error: "Credenciales de Telegram no encontradas en servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Descargar comprobante desde el bucket privado 'receipts'
    if (!order.receipt_path) {
      await supabase.rpc("mark_telegram_result", {
        p_order_id: orderId,
        p_success: false,
        p_message_id: null,
        p_error: "La orden no tiene comprobante asociado"
      });
      return new Response(
        JSON.stringify({ success: false, error: "La orden no registra ruta de comprobante" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: fileBlob, error: downloadError } = await supabase
      .storage
      .from("receipts")
      .download(order.receipt_path);

    if (downloadError || !fileBlob) {
      console.error("Error al descargar archivo desde Storage privado:", downloadError);
      await supabase.rpc("mark_telegram_result", {
        p_order_id: orderId,
        p_success: false,
        p_message_id: null,
        p_error: "Error al descargar comprobante de storage: " + (downloadError?.message ?? "")
      });
      return new Response(
        JSON.stringify({ success: false, error: "No se pudo recuperar el comprobante desde almacenamiento privado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Armar mensaje estructurado de Telegram
    const formattedDate = new Date(order.created_at).toLocaleString("es-CL", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const caption = [
      "🔔 NUEVO COMPROBANTE DE PAGO DEMGEL",
      "━━━━━━━━━━━━━━━━━━━",
      `📦 Pedido: ${order.order_number}`,
      `👤 Cliente: ${order.customer_name}`,
      `📱 WhatsApp: ${order.customer_phone}`,
      `💰 Total: $${Number(order.total_online_price).toLocaleString("es-CL")}`,
      `📊 Estado: ${order.status}`,
      `📅 Fecha: ${formattedDate}`,
      `🔑 Ref: ${order.id}`,
      "━━━━━━━━━━━━━━━━━━━",
      "Por favor verificar la transferencia en la cuenta bancaria antes de confirmar."
    ].join("\n");

    const mimeType = (order.receipt_mime_type || "").toLowerCase();
    const isPdf = mimeType.includes("pdf") || order.receipt_path.toLowerCase().endsWith(".pdf");
    const fileName = order.receipt_path.split("/").pop() || (isPdf ? "comprobante.pdf" : "comprobante.jpg");

    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("caption", caption);

    let telegramUrl = "";
    if (isPdf) {
      telegramUrl = `https://api.telegram.org/bot${botToken}/sendDocument`;
      formData.append("document", new File([fileBlob], fileName, { type: "application/pdf" }));
    } else {
      telegramUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
      formData.append("photo", new File([fileBlob], fileName, { type: mimeType || "image/jpeg" }));
    }

    // 5. Enviar a Telegram Bot API
    const tgResponse = await fetch(telegramUrl, {
      method: "POST",
      body: formData
    });

    const tgResult = await tgResponse.json().catch(() => ({ ok: false, description: "Respuesta no JSON de Telegram" }));

    if (tgResponse.ok && tgResult.ok) {
      const messageId = tgResult.result?.message_id ? tgResult.result.message_id.toString() : null;

      // 6. Éxito: Marcar telegram_status = 'sent'
      await supabase.rpc("mark_telegram_result", {
        p_order_id: orderId,
        p_success: true,
        p_message_id: messageId,
        p_error: null
      });

      return new Response(
        JSON.stringify({
          success: true,
          telegram_status: "sent",
          message_id: messageId,
          order_number: order.order_number
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // 7. Error en Telegram: Marcar telegram_status = 'failed' (sin cancelar orden ni liberar stock)
      const errorDescription = tgResult.description || `HTTP ${tgResponse.status}`;
      console.error("Error devuelto por Telegram Bot API:", errorDescription);

      await supabase.rpc("mark_telegram_result", {
        p_order_id: orderId,
        p_success: false,
        p_message_id: null,
        p_error: errorDescription
      });

      return new Response(
        JSON.stringify({
          success: false,
          telegram_status: "failed",
          error: errorDescription,
          order_number: order.order_number
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    console.error("Excepción general en Edge Function notify-telegram:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Error interno de servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
