/**
 * APLICACIÓN PRINCIPAL DEL PANEL ADMINISTRATIVO (ADMIN APP)
 * FASE 2E: Orquestador de vistas, modales y acciones operativas
 */

document.addEventListener("DOMContentLoaded", () => {
    initAdminApp();
});

let currentSelectedOrderId = null;

function initAdminApp() {
    setupHashRouting();
    setupModals();
    setupOrderFilters();
    setupProductFilters();
    setupConfigForm();
    updateProductCategorySelects();

    // Cargar vista inicial según hash o por defecto #dashboard
    const currentHash = window.location.hash || "#dashboard";
    navigateToView(currentHash);
}

// ── 1. Enrutamiento por Hash ──
function setupHashRouting() {
    window.addEventListener("hashchange", () => {
        const hash = window.location.hash || "#dashboard";
        navigateToView(hash);
    });

    const tabBtns = document.querySelectorAll(".admin-tab-btn");
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetHash = btn.getAttribute("data-target");
            window.location.hash = targetHash;
        });
    });
}

function navigateToView(hash) {
    const viewId = hash.replace("#", "");
    const tabBtns = document.querySelectorAll(".admin-tab-btn");
    const views = document.querySelectorAll(".admin-view");

    tabBtns.forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-target") === hash);
    });

    views.forEach(v => {
        v.classList.toggle("active", v.id === `view-${viewId}`);
    });

    // Cargar datos específicos según la vista activa
    switch (viewId) {
        case "dashboard":
            renderDashboardView();
            break;
        case "pedidos":
            renderOrdersView();
            break;
        case "productos":
            renderProductsView();
            break;
        case "categorias":
            renderCategoriesView();
            break;
        case "configuracion":
            renderConfigView();
            break;
        case "analitica":
            renderAnalyticsView();
            break;
        case "historial":
            renderHistoryView();
            break;
        default:
            renderDashboardView();
    }
}

// ── 2. Renderizado del Dashboard ──
function renderDashboardView() {
    const metrics = AdminAnalyticsService.getMetrics();

    // Actualizar tarjetas de KPI
    const elPending = document.getElementById("kpi-pending-count");
    const elReview = document.getElementById("kpi-review-count");
    const elReady = document.getElementById("kpi-ready-count");
    const elSales = document.getElementById("kpi-sales-total");
    const elSavings = document.getElementById("kpi-savings-total");
    const elLowStock = document.getElementById("kpi-low-stock");
    const elFlyer = document.getElementById("kpi-flyer-count");

    if (elPending) elPending.textContent = metrics.status_counts.pending;
    if (elReview) elReview.textContent = metrics.status_counts.review;
    if (elReady) elReady.textContent = metrics.status_counts.ready;
    if (elSales) elSales.textContent = formatCLP(metrics.gross_online_sales);
    if (elSavings) elSavings.textContent = formatCLP(metrics.total_customer_savings);
    if (elLowStock) elLowStock.textContent = metrics.low_stock_count;
    if (elFlyer) elFlyer.textContent = `${metrics.flyer_orders_count} pedidos`;

    // Cargar tabla de pedidos recientes
    const recentOrders = AdminOrderService.getOrders().slice(0, 5);
    const tbody = document.getElementById("dashboard-recent-orders-tbody");
    if (!tbody) return;

    if (recentOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No hay pedidos registrados todavía en el sistema local.</td></tr>`;
        return;
    }

    let html = "";
    recentOrders.forEach(o => {
        html += `
            <tr>
                <td><strong>${o.order_number}</strong></td>
                <td>${formatDate(o.created_at)}</td>
                <td>${o.customer_name}</td>
                <td><strong>${formatCLP(o.total_online_price)}</strong></td>
                <td>${renderStatusBadgeHtml(o.status)}</td>
                <td>
                    <button class="btn-action" onclick="openOrderDetailModal('${o.id}')">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// ── 3. Renderizado de la Vista de Pedidos ──
function setupOrderFilters() {
    const searchInput = document.getElementById("order-search-input");
    const statusSelect = document.getElementById("order-status-filter");
    const campaignSelect = document.getElementById("order-campaign-filter");

    const triggerFilter = () => {
        renderOrdersView();
    };

    if (searchInput) searchInput.addEventListener("input", triggerFilter);
    if (statusSelect) statusSelect.addEventListener("change", triggerFilter);
    if (campaignSelect) campaignSelect.addEventListener("change", triggerFilter);
}

function renderOrdersView() {
    const searchInput = document.getElementById("order-search-input");
    const statusSelect = document.getElementById("order-status-filter");
    const campaignSelect = document.getElementById("order-campaign-filter");

    const filters = {
        search: searchInput ? searchInput.value : "",
        status: statusSelect ? statusSelect.value : "all",
        source_campaign: campaignSelect ? campaignSelect.value : "all"
    };

    const orders = AdminOrderService.getOrders(filters);
    const tbody = document.getElementById("orders-table-tbody");
    const countBadge = document.getElementById("orders-total-count");

    if (countBadge) countBadge.textContent = `${orders.length} pedidos`;
    if (!tbody) return;

    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:3rem;">No se encontraron pedidos con los filtros seleccionados.</td></tr>`;
        return;
    }

    let html = "";
    orders.forEach(o => {
        // Indicador de comprobante
        let receiptHtml = `<span style="color:var(--text-muted); font-size:0.8rem;"><i class="fas fa-clock"></i> Pendiente</span>`;
        if (o.receipt) {
            receiptHtml = `<span style="color:var(--status-review); font-size:0.8rem; font-weight:700;"><i class="fas fa-check-circle"></i> Adjunto</span>`;
        }

        // Indicador de tiempo / expiración
        let timerHtml = `<span style="color:var(--text-muted); font-size:0.8rem;">-</span>`;
        if (o.status === "PENDIENTE DE PAGO") {
            const distance = new Date(o.expires_at).getTime() - new Date().getTime();
            if (distance > 0) {
                const mins = Math.floor(distance / (1000 * 60));
                timerHtml = `<span style="color:var(--status-pending); font-weight:700; font-size:0.8rem;"><i class="fas fa-stopwatch"></i> ${mins}m rest.</span>`;
            } else {
                timerHtml = `<span style="color:var(--status-cancelled); font-weight:800; font-size:0.8rem;">RESERVA EXPIRADA</span>`;
            }
        } else if (o.status === "CANCELADO" && o.admin_notes && o.admin_notes.includes("RESERVA EXPIRADA")) {
            timerHtml = `<span style="color:var(--status-cancelled); font-weight:700; font-size:0.8rem;">RESERVA EXPIRADA</span>`;
        }

        // Origen
        const isFlyer = o.source_campaign === "flyer";
        const campaignBadge = isFlyer ? 
            `<span class="badge-campaign-flyer"><i class="fas fa-qrcode"></i> Flyer QR</span>` : 
            `<span class="badge-campaign-direct">Directo</span>`;

        html += `
            <tr>
                <td><strong>${o.order_number}</strong></td>
                <td>${formatDate(o.created_at)}</td>
                <td>
                    <div><strong>${o.customer_name}</strong></div>
                    <a href="https://wa.me/${o.customer_phone.replace(/\D/g, '')}" target="_blank" style="color:var(--primary-light); font-size:0.8rem; text-decoration:none;">
                        <i class="fab fa-whatsapp"></i> ${o.customer_phone}
                    </a>
                </td>
                <td><strong>${formatCLP(o.total_online_price)}</strong></td>
                <td>${renderStatusBadgeHtml(o.status)}</td>
                <td>${campaignBadge}</td>
                <td>${receiptHtml}</td>
                <td>${timerHtml}</td>
                <td>
                    <button class="btn-action btn-action--primary" onclick="openOrderDetailModal('${o.id}')">
                        <i class="fas fa-sliders-h"></i> Gestionar
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// ── 4. Detalle y Gestión del Pedido (Modal) ──
function openOrderDetailModal(orderId) {
    currentSelectedOrderId = orderId;
    const order = AdminOrderService.getOrderById(orderId);
    if (!order) return;

    // Poblar datos generales
    document.getElementById("detail-order-number").textContent = order.order_number;
    document.getElementById("detail-created-at").textContent = formatDate(order.created_at);
    document.getElementById("detail-customer-name").textContent = order.customer_name;
    document.getElementById("detail-customer-phone").textContent = order.customer_phone;
    document.getElementById("detail-customer-email").textContent = order.customer_email || "No especificado";
    document.getElementById("detail-payment-method").textContent = order.payment_method === "transferencia" ? "Transferencia Bancaria" : "CajaVecina / Efectivo";
    document.getElementById("detail-source-campaign").textContent = order.source_campaign === "flyer" ? "Flyer Físico (QR)" : "Tráfico Directo";
    document.getElementById("detail-expires-at").textContent = formatDate(order.expires_at);

    // Badge y timeline
    document.getElementById("detail-status-badge").innerHTML = renderStatusBadgeHtml(order.status);
    updateTimelineUI(order.status);

    // Artículos
    const itemsList = document.getElementById("detail-order-items");
    let itemsHtml = "";
    order.items.forEach(it => {
        itemsHtml += `
            <div class="checkout-item-row" style="margin-bottom:0.8rem; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:0.8rem;">
                <img src="${it.image}" alt="${it.product_name}" style="width:50px; height:50px; border-radius:8px; object-fit:cover;">
                <div class="checkout-item-details" style="flex:1; margin-left:12px;">
                    <div style="font-weight:700; font-size:0.92rem;">${it.product_name}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">
                        Cantidad: ${it.quantity} | Ref: ${it.model_reference || 'Oficial'}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:800; color:var(--primary-light);">${formatCLP(it.subtotal)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); text-decoration:line-through;">${formatCLP(it.store_price * it.quantity)}</div>
                </div>
            </div>
        `;
    });
    itemsList.innerHTML = itemsHtml;

    // Totales
    document.getElementById("detail-store-total").textContent = formatCLP(order.total_store_price);
    document.getElementById("detail-savings-total").textContent = formatCLP(order.total_savings);
    document.getElementById("detail-online-total").textContent = formatCLP(order.total_online_price);

    // Visor de Comprobante
    renderReceiptViewer(order.receipt);

    // Notas administrativas
    const notesBox = document.getElementById("detail-admin-notes");
    notesBox.textContent = order.admin_notes || "Sin notas registradas.";

    // Botones de acción según estado
    renderOrderActionButtons(order);

    // Abrir modal
    document.getElementById("modal-order-detail").classList.add("active");
}

function renderReceiptViewer(receipt) {
    const viewerBox = document.getElementById("detail-receipt-viewer");
    if (!receipt) {
        viewerBox.innerHTML = `
            <div style="color:var(--text-muted); padding:1.5rem; font-size:0.9rem;">
                <i class="fas fa-file-invoice" style="font-size:2rem; opacity:0.3; margin-bottom:8px; display:block;"></i>
                El cliente aún no ha adjuntado el comprobante de pago.
            </div>
        `;
        return;
    }

    if (receipt.fileType === "application/pdf" || receipt.isPdf) {
        viewerBox.innerHTML = `
            <div class="receipt-pdf-card-admin">
                <i class="fas fa-file-pdf"></i>
                <div>
                    <strong style="display:block; font-size:1rem; color:#FFF;">${receipt.fileName}</strong>
                    <span style="font-size:0.8rem; color:var(--text-muted);">Documento PDF adjunto (${receipt.fileSize})</span>
                    <span style="display:block; font-size:0.75rem; color:var(--primary-light); margin-top:4px;">
                        <i class="fas fa-shield-alt"></i> Archivo privado listo para futura sincronización con Supabase Storage.
                    </span>
                </div>
            </div>
        `;
    } else {
        viewerBox.innerHTML = `
            <div>
                <img src="${receipt.previewUrl}" alt="Comprobante" class="receipt-img-modal">
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:8px;">
                    ${receipt.fileName} • ${receipt.fileSize}
                </div>
            </div>
        `;
    }
}

function renderOrderActionButtons(order) {
    const actionsWrap = document.getElementById("detail-action-buttons");
    let html = "";

    switch (order.status) {
        case "PENDIENTE DE PAGO":
            html = `
                <button class="btn-action btn-action--primary" onclick="simulateReceiptFromAdmin('${order.id}')">
                    <i class="fas fa-receipt"></i> Simular Comprobante Recibido
                </button>
                <button class="btn-action btn-action--danger" onclick="openCancelModal('${order.id}')">
                    <i class="fas fa-times"></i> Cancelar Pedido
                </button>
            `;
            break;
        case "PAGO EN REVISIÓN":
            html = `
                <button class="btn-action btn-action--success" onclick="handleConfirmPayment('${order.id}')">
                    <i class="fas fa-check-double"></i> CONFIRMAR PAGO
                </button>
                <button class="btn-action btn-action--danger" onclick="openCancelModal('${order.id}')">
                    <i class="fas fa-times"></i> Rechazar / Cancelar
                </button>
            `;
            break;
        case "PAGO CONFIRMADO":
            html = `
                <button class="btn-action btn-action--ready" onclick="handleMarkReady('${order.id}')">
                    <i class="fas fa-store"></i> MARCAR LISTO PARA RETIRAR
                </button>
                <button class="btn-action btn-action--danger" onclick="openCancelModal('${order.id}')">
                    <i class="fas fa-times"></i> Cancelar Pedido
                </button>
            `;
            break;
        case "LISTO PARA RETIRAR":
            html = `
                <button class="btn-action btn-action--success" onclick="handleMarkCompleted('${order.id}')">
                    <i class="fas fa-check-circle"></i> MARCAR COMO RETIRADO
                </button>
            `;
            break;
        case "RETIRADO":
            html = `<span style="color:var(--status-completed); font-weight:700; font-size:0.85rem;"><i class="fas fa-check-double"></i> Pedido entregado y finalizado con éxito.</span>`;
            break;
        case "CANCELADO":
            html = `<span style="color:var(--status-cancelled); font-weight:700; font-size:0.85rem;"><i class="fas fa-ban"></i> Pedido cancelado. Historial y motivo preservados.</span>`;
            break;
    }

    actionsWrap.innerHTML = html;
}

function updateTimelineUI(status) {
    const steps = ["PENDIENTE DE PAGO", "PAGO EN REVISIÓN", "PAGO CONFIRMADO", "LISTO PARA RETIRAR", "RETIRADO"];
    const currentIdx = steps.indexOf(status);

    steps.forEach((st, idx) => {
        const stepEl = document.getElementById(`step-${idx + 1}`);
        if (stepEl) {
            stepEl.classList.toggle("active", idx <= currentIdx);
        }
    });
}

// ── 5. Acciones de Estado del Administrador ──
function handleConfirmPayment(orderId) {
    if (!confirm("¿Deseas CONFIRMAR el pago de este pedido?")) return;
    const res = AdminOrderService.changeOrderStatus(orderId, "PAGO CONFIRMADO", "Pago revisado y verificado en cuenta oficial", "Admin Demo");
    if (res.success) {
        showToast("Pago confirmado exitosamente.");
        openOrderDetailModal(orderId);
        renderOrdersView();
        renderDashboardView();
    } else {
        alert(res.message);
    }
}

function handleMarkReady(orderId) {
    if (!confirm("¿Marcar este pedido como LISTO PARA RETIRAR en tienda?")) return;
    const res = AdminOrderService.changeOrderStatus(orderId, "LISTO PARA RETIRAR", "Productos separados y listos en mostrador", "Admin Demo");
    if (res.success) {
        showToast("Pedido marcado como Listo para Retirar.");
        openOrderDetailModal(orderId);
        renderOrdersView();
        renderDashboardView();
    } else {
        alert(res.message);
    }
}

function handleMarkCompleted(orderId) {
    if (!confirm("¿Confirmar que el cliente ha RETIRADO los productos en tienda?")) return;
    const res = AdminOrderService.changeOrderStatus(orderId, "RETIRADO", "Retiro presencial completado en mostrador", "Admin Demo");
    if (res.success) {
        showToast("Pedido completado y marcado como RETIRADO.");
        openOrderDetailModal(orderId);
        renderOrdersView();
        renderDashboardView();
    } else {
        alert(res.message);
    }
}

function simulateReceiptFromAdmin(orderId) {
    const res = AdminOrderService.changeOrderStatus(orderId, "PAGO EN REVISIÓN", "Comprobante cargado manualmente por administrador", "Admin Demo");
    if (res.success) {
        showToast("Pedido pasado a PAGO EN REVISIÓN.");
        openOrderDetailModal(orderId);
        renderOrdersView();
    } else {
        alert(res.message);
    }
}

// Modal de Cancelación con Motivo Obligatorio
function openCancelModal(orderId) {
    currentSelectedOrderId = orderId;
    document.getElementById("cancel-reason-input").value = "";
    document.getElementById("modal-cancel-order").classList.add("active");
}

function submitCancelOrder() {
    const reason = document.getElementById("cancel-reason-input").value;
    if (!reason || reason.trim().length < 3) {
        alert("Por favor especifica un motivo válido para la cancelación.");
        return;
    }

    const res = AdminOrderService.changeOrderStatus(currentSelectedOrderId, "CANCELADO", reason.trim(), "Admin Demo");
    if (res.success) {
        showToast("Pedido cancelado y stock liberado correctamente.");
        document.getElementById("modal-cancel-order").classList.remove("active");
        openOrderDetailModal(currentSelectedOrderId);
        renderOrdersView();
        renderDashboardView();
    } else {
        alert(res.message);
    }
}

// ── 6. Renderizado y Edición de Productos ──
function setupProductFilters() {
    const searchInput = document.getElementById("product-search-input");
    const categorySelect = document.getElementById("product-category-filter");
    const stockSelect = document.getElementById("product-stock-filter");

    const trigger = () => renderProductsView();

    if (searchInput) searchInput.addEventListener("input", trigger);
    if (categorySelect) categorySelect.addEventListener("change", trigger);
    if (stockSelect) stockSelect.addEventListener("change", trigger);
}

function renderProductsView() {
    const searchInput = document.getElementById("product-search-input");
    const categorySelect = document.getElementById("product-category-filter");
    const stockSelect = document.getElementById("product-stock-filter");

    const filters = {
        search: searchInput ? searchInput.value : "",
        category: categorySelect ? categorySelect.value : "all",
        stock_status: stockSelect ? stockSelect.value : "all"
    };

    const products = AdminProductService.getProducts(filters);
    const tbody = document.getElementById("products-table-tbody");
    if (!tbody) return;

    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:3rem;">No se encontraron productos.</td></tr>`;
        return;
    }

    let html = "";
    products.forEach(p => {
        let stockBadge = `<span class="status-badge-admin badge-completed">${p.stock} un.</span>`;
        if (p.stock === 0) {
            stockBadge = `<span class="status-badge-admin badge-cancelled">Agotado (0)</span>`;
        } else if (p.stock <= 5) {
            stockBadge = `<span class="status-badge-admin badge-pending">Bajo (${p.stock})</span>`;
        }

        const catObj = typeof AdminCategoryService !== "undefined" ? AdminCategoryService.getCategoryBySlug(p.category) : null;
        const catBadge = catObj ? `<span style="font-size:0.85rem; color:var(--primary-light);"><i class="fas ${catObj.icon}"></i> ${catObj.name}</span>` : `<span style="font-size:0.85rem; color:var(--text-muted);">${p.category_name || p.category}</span>`;

        html += `
            <tr>
                <td><img src="${p.image}" alt="${p.name}" style="width:44px; height:44px; border-radius:8px; object-fit:cover;"></td>
                <td>
                    <strong>${p.name}</strong>
                    <div style="font-size:0.78rem; color:var(--text-muted);">${p.model_reference || 'Ref oficial'}</div>
                </td>
                <td>${catBadge}</td>
                <td>${formatCLP(p.store_price)}</td>
                <td><strong style="color:var(--primary-light);">${formatCLP(p.online_price)}</strong></td>
                <td><span style="color:var(--accent-cyan); font-weight:800;">${p.discount_pct}%</span></td>
                <td>${stockBadge}</td>
                <td>
                    ${p.is_deal ? '<span style="font-size:0.75rem; color:#FFB400; margin-right:4px;">★ Oferta</span>' : ''}
                    ${p.is_featured ? '<span style="font-size:0.75rem; color:var(--accent-cyan);">★ Destacado</span>' : ''}
                </td>
                <td>
                    <button class="btn-action" onclick="openProductEditModal('${p.id}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

let activeCreateImageData = null;
let activeEditImageData = null;

// Motor de Auto-Recorte y Normalización de Imagen con HTML5 Canvas (800x800)
function cropAndResizeProductImage(file, previewImgEl, onComplete) {
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const TARGET_SIZE = 800;
            canvas.width = TARGET_SIZE;
            canvas.height = TARGET_SIZE;
            const ctx = canvas.getContext("2d");

            // Fondo limpio oscuro tipo Demgel
            ctx.fillStyle = "#0b0f19";
            ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);

            // Calcular escala centrado contain
            const scale = Math.min(TARGET_SIZE / img.width, TARGET_SIZE / img.height);
            const drawWidth = img.width * scale;
            const drawHeight = img.height * scale;
            const offsetX = (TARGET_SIZE - drawWidth) / 2;
            const offsetY = (TARGET_SIZE - drawHeight) / 2;

            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

            // Convertir a JPEG comprimido HD
            const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.90);
            if (previewImgEl) {
                previewImgEl.src = croppedDataUrl;
            }
            if (onComplete) {
                onComplete(croppedDataUrl);
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function openProductCreateModal() {
    const form = document.getElementById("create-product-form");
    if (form) form.reset();

    activeCreateImageData = null;
    const preview = document.getElementById("create-img-preview");
    if (preview) preview.src = "../assets/products/D-E6048C.jpg";

    updateCreateProductSavingsPreview();
    document.getElementById("modal-create-product").classList.add("active");
}

function openProductEditModal(productId) {
    const product = AdminProductService.getProductById(productId);
    if (!product) return;

    activeEditImageData = null;
    document.getElementById("edit-product-id").value = product.id;
    document.getElementById("edit-product-name").value = product.name;
    document.getElementById("edit-product-desc").value = product.description || "";
    document.getElementById("edit-product-category").value = product.category;
    document.getElementById("edit-product-store-price").value = product.store_price;
    document.getElementById("edit-product-online-price").value = product.online_price;
    document.getElementById("edit-product-stock").value = product.stock;
    document.getElementById("edit-product-deal").checked = Boolean(product.is_deal);
    document.getElementById("edit-product-featured").checked = Boolean(product.is_featured);
    document.getElementById("edit-product-active").checked = Boolean(product.is_active);

    const editPreview = document.getElementById("edit-img-preview");
    if (editPreview) editPreview.src = product.image;

    updateProductSavingsPreview();

    // Listeners para recálculo dinámico
    document.getElementById("edit-product-store-price").oninput = updateProductSavingsPreview;
    document.getElementById("edit-product-online-price").oninput = updateProductSavingsPreview;

    document.getElementById("modal-edit-product").classList.add("active");
}

function updateProductSavingsPreview() {
    const storePrice = parseInt(document.getElementById("edit-product-store-price").value, 10) || 0;
    const onlinePrice = parseInt(document.getElementById("edit-product-online-price").value, 10) || 0;
    const previewEl = document.getElementById("edit-savings-preview");

    if (onlinePrice > storePrice) {
        previewEl.innerHTML = `<span style="color:var(--status-cancelled); font-weight:700;"><i class="fas fa-exclamation-triangle"></i> ERROR: El precio online no puede ser superior al precio de tienda.</span>`;
        return;
    }

    const savings = storePrice - onlinePrice;
    const pct = storePrice > 0 ? Math.round((savings / storePrice) * 100) : 0;
    previewEl.innerHTML = `<span style="color:var(--primary-light); font-weight:700;"><i class="fas fa-tag"></i> Ahorro cliente: ${formatCLP(savings)} (${pct}% de descuento)</span>`;
}

function updateCreateProductSavingsPreview() {
    const storePrice = parseInt(document.getElementById("create-product-store-price").value, 10) || 0;
    const onlinePrice = parseInt(document.getElementById("create-product-online-price").value, 10) || 0;
    const previewEl = document.getElementById("create-savings-preview");
    if (!previewEl) return;

    if (onlinePrice > storePrice) {
        previewEl.innerHTML = `<span style="color:var(--status-cancelled); font-weight:700;"><i class="fas fa-exclamation-triangle"></i> ERROR: El precio online no puede ser superior al precio de tienda.</span>`;
        return;
    }

    const savings = storePrice - onlinePrice;
    const pct = storePrice > 0 ? Math.round((savings / storePrice) * 100) : 0;
    previewEl.innerHTML = `<span style="color:var(--primary-light); font-weight:700;"><i class="fas fa-tag"></i> Ahorro cliente: ${formatCLP(savings)} (${pct}% de descuento)</span>`;
}

function submitProductCreate(e) {
    e.preventDefault();
    const productData = {
        name: document.getElementById("create-product-name").value,
        model_reference: document.getElementById("create-product-model").value,
        description: document.getElementById("create-product-desc").value,
        category: document.getElementById("create-product-category").value,
        store_price: document.getElementById("create-product-store-price").value,
        online_price: document.getElementById("create-product-online-price").value,
        stock: document.getElementById("create-product-stock").value,
        is_deal: document.getElementById("create-product-deal").checked,
        is_featured: document.getElementById("create-product-featured").checked,
        is_active: document.getElementById("create-product-active").checked,
        image: activeCreateImageData || "../assets/products/D-E6048C.jpg"
    };

    const res = AdminProductService.createProduct(productData);
    if (!res.success) {
        alert("Error al crear producto: " + res.message);
        return;
    }

    showToast(res.message);

    // Notificar a Telegram Bot
    if (typeof DemgelTelegramService !== "undefined" && DemgelTelegramService.notifyProductCreatedOrUpdated) {
        DemgelTelegramService.notifyProductCreatedOrUpdated(res.product, true);
    }

    document.getElementById("modal-create-product").classList.remove("active");
    renderProductsView();
    renderDashboardView();
}

function submitProductEdit(e) {
    e.preventDefault();
    const id = document.getElementById("edit-product-id").value;
    const updateData = {
        name: document.getElementById("edit-product-name").value,
        description: document.getElementById("edit-product-desc").value,
        category: document.getElementById("edit-product-category").value,
        store_price: document.getElementById("edit-product-store-price").value,
        online_price: document.getElementById("edit-product-online-price").value,
        stock: document.getElementById("edit-product-stock").value,
        is_deal: document.getElementById("edit-product-deal").checked,
        is_featured: document.getElementById("edit-product-featured").checked,
        is_active: document.getElementById("edit-product-active").checked
    };

    if (activeEditImageData) {
        updateData.image = activeEditImageData;
    }

    const res = AdminProductService.updateProduct(id, updateData);
    if (!res.success) {
        alert("Error de validación: " + res.message);
        return;
    }

    showToast(res.message);

    // Notificar a Telegram Bot
    if (typeof DemgelTelegramService !== "undefined" && DemgelTelegramService.notifyProductCreatedOrUpdated) {
        DemgelTelegramService.notifyProductCreatedOrUpdated(res.product, false);
    }

    document.getElementById("modal-edit-product").classList.remove("active");
    renderProductsView();
    renderDashboardView();
}

// ── 7. Renderizado de Configuración de Tienda ──
function setupConfigForm() {
    const form = document.getElementById("admin-config-form");
    if (!form) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const updated = {
            transfer_config: {
                bank_name: document.getElementById("cfg-bank-name").value,
                account_type: document.getElementById("cfg-account-type").value,
                account_number: document.getElementById("cfg-account-number").value,
                rut: document.getElementById("cfg-rut").value,
                holder_name: document.getElementById("cfg-holder").value,
                email: document.getElementById("cfg-email").value,
                instructions: document.getElementById("cfg-instructions").value
            },
            cajavecina_config: {
                instructions: document.getElementById("cfg-cajavecina-instructions").value
            },
            store_config: {
                store_name: document.getElementById("cfg-store-name").value,
                pickup_address: document.getElementById("cfg-pickup-address").value,
                pickup_hours: document.getElementById("cfg-pickup-hours").value,
                pickup_instructions: document.getElementById("cfg-pickup-instructions").value,
                support_whatsapp: document.getElementById("cfg-support-whatsapp").value
            }
        };

        const res = AdminConfigService.saveConfig(updated);
        showToast(res.message);
    });
}

function renderConfigView() {
    const cfg = AdminConfigService.getConfig();

    // Transferencia
    document.getElementById("cfg-bank-name").value = cfg.transfer_config.bank_name;
    document.getElementById("cfg-account-type").value = cfg.transfer_config.account_type;
    document.getElementById("cfg-account-number").value = cfg.transfer_config.account_number;
    document.getElementById("cfg-rut").value = cfg.transfer_config.rut;
    document.getElementById("cfg-holder").value = cfg.transfer_config.holder_name;
    document.getElementById("cfg-email").value = cfg.transfer_config.email;
    document.getElementById("cfg-instructions").value = cfg.transfer_config.instructions;

    // CajaVecina
    document.getElementById("cfg-cajavecina-instructions").value = cfg.cajavecina_config.instructions;

    // Retiro
    document.getElementById("cfg-store-name").value = cfg.store_config.store_name;
    document.getElementById("cfg-pickup-address").value = cfg.store_config.pickup_address;
    document.getElementById("cfg-pickup-hours").value = cfg.store_config.pickup_hours;
    document.getElementById("cfg-pickup-instructions").value = cfg.store_config.pickup_instructions;
    document.getElementById("cfg-support-whatsapp").value = cfg.store_config.support_whatsapp;
}

// ── 8. Renderizado de Analítica y Embudo Comercial ──
function renderAnalyticsView() {
    const metrics = AdminAnalyticsService.getMetrics();
    const f = metrics.funnel;

    document.getElementById("an-flyer-scans").textContent = f.flyer_scans;
    document.getElementById("an-product-views").textContent = f.product_views;
    document.getElementById("an-cart-adds").textContent = f.cart_adds;
    document.getElementById("an-checkout-starts").textContent = f.checkout_starts;
    document.getElementById("an-orders-created").textContent = f.orders_created;
    document.getElementById("an-receipts-uploaded").textContent = f.receipts_uploaded;
    document.getElementById("an-orders-confirmed").textContent = f.orders_confirmed;
    document.getElementById("an-orders-completed").textContent = f.orders_completed;

    // Calcular y actualizar barras porcentuales del embudo
    const base = Math.max(1, f.flyer_scans);
    setBarWidth("bar-flyer", 100);
    setBarWidth("bar-views", Math.min(100, Math.round((f.product_views / base) * 100)));
    setBarWidth("bar-cart", Math.min(100, Math.round((f.cart_adds / base) * 100)));
    setBarWidth("bar-checkout", Math.min(100, Math.round((f.checkout_starts / base) * 100)));
    setBarWidth("bar-orders", Math.min(100, Math.round((f.orders_created / base) * 100)));
    setBarWidth("bar-receipts", Math.min(100, Math.round((f.receipts_uploaded / base) * 100)));
    setBarWidth("bar-confirmed", Math.min(100, Math.round((f.orders_confirmed / base) * 100)));
    setBarWidth("bar-completed", Math.min(100, Math.round((f.orders_completed / base) * 100)));

    // Comparativa Flyer vs Directo
    document.getElementById("an-flyer-vs-direct").textContent = `${metrics.flyer_orders_count} desde Flyer QR vs ${metrics.direct_orders_count} Tráfico Directo`;
}

function setBarWidth(id, pct) {
    const el = document.getElementById(id);
    if (el) {
        el.style.width = `${Math.max(8, pct)}%`;
        el.textContent = `${pct}%`;
    }
}

// ── 9. Renderizado de Historial y Auditoría ──
function renderHistoryView() {
    const events = AdminOrderService.getAdminEvents();
    const tbody = document.getElementById("history-table-tbody");
    if (!tbody) return;

    if (events.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:3rem;">No hay eventos de auditoría registrados todavía.</td></tr>`;
        return;
    }

    let html = "";
    events.forEach(e => {
        let detailsStr = "";
        if (e.details) {
            detailsStr = Object.entries(e.details)
                .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
                .join(" | ");
        }

        html += `
            <tr>
                <td>${formatDate(e.created_at)}</td>
                <td><span class="status-badge-admin badge-confirmed">${e.event_type}</span></td>
                <td>${e.order_id ? e.order_id.substring(0, 12) + '...' : '-'}</td>
                <td>${e.admin_user}</td>
                <td style="font-size:0.82rem; color:var(--text-muted);">${detailsStr}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// ── 10. Modales y Helpers ──
function setupModals() {
    const closeBtns = document.querySelectorAll(".btn-close-modal, .btn-modal-cancel");
    closeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
        });
    });

    // Botón de Abrir Modal de Creación
    const btnOpenCreate = document.getElementById("btn-open-create-product");
    if (btnOpenCreate) {
        btnOpenCreate.addEventListener("click", openProductCreateModal);
    }

    // Formularios de Creación y Edición
    const createForm = document.getElementById("create-product-form");
    if (createForm) createForm.addEventListener("submit", submitProductCreate);

    const editForm = document.getElementById("edit-product-form");
    if (editForm) editForm.addEventListener("submit", submitProductEdit);

    // Auto-recorte al seleccionar archivo de imagen en Creación
    const createFileInput = document.getElementById("create-product-file");
    if (createFileInput) {
        createFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const preview = document.getElementById("create-img-preview");
                cropAndResizeProductImage(file, preview, (croppedUrl) => {
                    activeCreateImageData = croppedUrl;
                });
            }
        });
    }

    // Auto-recorte al seleccionar archivo de imagen en Edición
    const editFileInput = document.getElementById("edit-product-file");
    if (editFileInput) {
        editFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const preview = document.getElementById("edit-img-preview");
                cropAndResizeProductImage(file, preview, (croppedUrl) => {
                    activeEditImageData = croppedUrl;
                });
            }
        });
    }

    // Recálculos de precios en vivo en creación
    const createStorePriceInput = document.getElementById("create-product-store-price");
    const createOnlinePriceInput = document.getElementById("create-product-online-price");
    if (createStorePriceInput) createStorePriceInput.addEventListener("input", updateCreateProductSavingsPreview);
    if (createOnlinePriceInput) createOnlinePriceInput.addEventListener("input", updateCreateProductSavingsPreview);

    // Botón de Abrir Modal de Categoría
    const btnOpenCategory = document.getElementById("btn-open-create-category");
    if (btnOpenCategory) {
        btnOpenCategory.addEventListener("click", () => openCategoryModal());
    }

    const categoryForm = document.getElementById("create-category-form");
    if (categoryForm) categoryForm.addEventListener("submit", submitCategoryForm);

    const btnConfirmCancel = document.getElementById("btn-confirm-cancel-order");
    if (btnConfirmCancel) btnConfirmCancel.addEventListener("click", submitCancelOrder);
}

// ── 11. Renderizado y Gestión de Categorías ──
function renderCategoriesView() {
    const categories = AdminCategoryService.getCategories();
    const products = AdminProductService.getProducts();
    const grid = document.getElementById("categories-grid");
    if (!grid) return;

    if (categories.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:3rem; color:var(--text-muted);">No hay categorías creadas todavía.</div>`;
        return;
    }

    let html = "";
    categories.forEach(c => {
        if (c.slug === "todos") return; // Saltar 'todos' en gestión

        const prodCount = products.filter(p => p.category === c.slug || p.category === c.name).length;
        const iconClass = c.icon || "fa-tag";

        html += `
            <div class="kpi-card" style="display:flex; flex-direction:column; justify-content:space-between; padding:1.5rem; border: 1px solid var(--glass-border); border-radius: var(--radius-md); background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px);">
                <div>
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                        <div style="width:48px; height:48px; border-radius:12px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); display:flex; align-items:center; justify-content:center; color: var(--primary-light); font-size:1.4rem;">
                            <i class="fas ${iconClass}"></i>
                        </div>
                        <span class="status-badge-admin badge-completed" style="font-size:0.75rem;">${prodCount} productos</span>
                    </div>

                    <h3 style="font-size:1.15rem; font-weight:800; color:#FFF; margin-bottom:4px;">${c.name}</h3>
                    <div style="font-size:0.78rem; color:var(--text-muted); font-family:monospace; margin-bottom:0.8rem;">Slug: /${c.slug}</div>
                    <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.4; margin-bottom:1.2rem;">${c.description || 'Sin descripción asignada.'}</p>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:0.8rem;">
                    <button class="btn-action" onclick="openCategoryModal('${c.slug}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
    updateProductCategorySelects();
}

function openCategoryModal(slug = null) {
    const form = document.getElementById("create-category-form");
    if (form) form.reset();

    const title = document.getElementById("modal-category-title");

    if (slug) {
        const cat = AdminCategoryService.getCategoryBySlug(slug);
        if (!cat) return;

        document.getElementById("category-original-slug").value = cat.slug;
        document.getElementById("category-name-input").value = cat.name;
        document.getElementById("category-slug-input").value = cat.slug;
        document.getElementById("category-icon-input").value = cat.icon || "fa-tag";
        document.getElementById("category-desc-input").value = cat.description || "";

        if (title) title.innerHTML = `<i class="fas fa-edit" style="color:var(--primary-light);"></i> Editar Categoría "${cat.name}"`;
    } else {
        document.getElementById("category-original-slug").value = "";
        if (title) title.innerHTML = `<i class="fas fa-folder-plus" style="color:var(--primary-light);"></i> Publicar Nueva Categoría`;
    }

    document.getElementById("modal-create-category").classList.add("active");
}

function submitCategoryForm(e) {
    e.preventDefault();
    const originalSlug = document.getElementById("category-original-slug").value;
    const data = {
        name: document.getElementById("category-name-input").value,
        slug: document.getElementById("category-slug-input").value,
        icon: document.getElementById("category-icon-input").value,
        description: document.getElementById("category-desc-input").value
    };

    let res;
    if (originalSlug) {
        res = AdminCategoryService.updateCategory(originalSlug, data);
    } else {
        res = AdminCategoryService.createCategory(data);
    }

    if (!res.success) {
        alert("Error: " + res.message);
        return;
    }

    showToast(res.message);

    // Notificar a Telegram
    if (typeof DemgelTelegramService !== "undefined" && DemgelTelegramService.sendTextMessage) {
        const titleMsg = originalSlug ? "✏️ <b>CATEGORÍA ACTUALIZADA EN DEMGEL STORE</b>" : "🏷️ <b>¡NUEVA CATEGORÍA CREADA EN DEMGEL STORE!</b>";
        const textHtml = `
${titleMsg}

🏷️ <b>Nombre:</b> ${res.category.name}
📌 <b>Slug:</b> <code>${res.category.slug}</code>
🎨 <b>Icono:</b> ${res.category.icon}
📝 <b>Descripción:</b> ${res.category.description || 'Sin descripción'}

✨ <i>La tienda pública y el Admin Panel fueron actualizados en tiempo real.</i>
        `.trim();
        DemgelTelegramService.sendTextMessage(textHtml);
    }

    document.getElementById("modal-create-category").classList.remove("active");
    renderCategoriesView();
    updateProductCategorySelects();
}

// Actualizar selectores dinámicos de categoría en los modales de productos
function updateProductCategorySelects() {
    const categories = AdminCategoryService.getCategories();
    const createSelect = document.getElementById("create-product-category");
    const editSelect = document.getElementById("edit-product-category");
    const filterSelect = document.getElementById("product-category-filter");

    let optionsHtml = "";
    categories.forEach(c => {
        if (c.slug === "todos") return;
        optionsHtml += `<option value="${c.slug}">${c.name}</option>`;
    });

    if (createSelect) createSelect.innerHTML = optionsHtml;
    if (editSelect) editSelect.innerHTML = optionsHtml;

    if (filterSelect) {
        filterSelect.innerHTML = `<option value="all">Todas las Categorías</option>` + optionsHtml;
    }
}

function renderStatusBadgeHtml(status) {
    switch (status) {
        case "PENDIENTE DE PAGO":
            return `<span class="status-badge-admin badge-pending"><i class="fas fa-clock"></i> Pendiente</span>`;
        case "PAGO EN REVISIÓN":
            return `<span class="status-badge-admin badge-review"><i class="fas fa-search"></i> En Revisión</span>`;
        case "PAGO CONFIRMADO":
            return `<span class="status-badge-admin badge-confirmed"><i class="fas fa-check"></i> Confirmado</span>`;
        case "LISTO PARA RETIRAR":
            return `<span class="status-badge-admin badge-ready"><i class="fas fa-store"></i> Listo Retiro</span>`;
        case "RETIRADO":
            return `<span class="status-badge-admin badge-completed"><i class="fas fa-check-double"></i> Retirado</span>`;
        case "CANCELADO":
            return `<span class="status-badge-admin badge-cancelled"><i class="fas fa-times"></i> Cancelado</span>`;
        default:
            return `<span class="status-badge-admin">${status}</span>`;
    }
}

function formatDate(isoString) {
    if (!isoString) return "-";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString("es-CL", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch (e) {
        return isoString;
    }
}

function formatCLP(val) {
    return "$" + (val || 0).toLocaleString("es-CL");
}

function showToast(message) {
    let toast = document.getElementById("admin-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "admin-toast";
        toast.className = "toast-notification";
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas fa-info-circle" style="color:var(--primary);"></i> <span>${message}</span>`;
    toast.classList.add("active");
    setTimeout(() => {
        toast.classList.remove("active");
    }, 3200);
}
