/**
 * CONTROLADOR PRINCIPAL DE INTERFAZ Y EXPERIENCIA DE COMPRA
 * FASE 2C: Renderizado de Catálogo, Filtros, Modal de Producto y QR Tracking
 */

document.addEventListener("DOMContentLoaded", () => {
    // 1. Inicializar analítica y capturar campaña (?source=flyer)
    DemgelAnalytics.initCampaignTracking();
    const campaign = DemgelAnalytics.getCampaignSource();
    DemgelAnalytics.trackVisit(window.location.pathname);

    // 2. Inicializar Carrito
    DemgelCart.init();

    // 3. Detectar si viene desde Flyer QR y mostrar banner de bienvenida
    checkCampaignBanner(campaign);

    // 4. Renderizar categorías y productos iniciales
    renderCategories();
    renderProducts("todos");

    // 4.1 Sincronizar con Supabase en tiempo real
    if (typeof syncCatalogWithSupabase === "function") {
        syncCatalogWithSupabase().then(() => {
            renderCategories();
            renderProducts("todos");
        });
    }

    // 5. Configurar eventos de interfaz (header, modal, mobile)
    setupUI();
});

document.addEventListener("demgel:catalog_loaded", () => {
    renderCategories();
    const activeBtn = document.querySelector(".category-pill.active");
    const activeCat = activeBtn ? activeBtn.getAttribute("data-category") : "todos";
    renderProducts(activeCat);
});


// Banner dinámico si el usuario llegó desde Flyer QR
function checkCampaignBanner(campaign) {
    const banner = document.getElementById("qr-campaign-banner");
    if (!banner) return;

    if (campaign && campaign !== "direct") {
        banner.style.display = "block";
        const campaignName = campaign === "flyer" ? "FLYER FÍSICO" : campaign.toUpperCase();
        banner.innerHTML = `
            <div class="container">
                <div class="qr-banner-content">
                    <span class="qr-banner-badge"><i class="fas fa-qrcode"></i> ${campaignName}</span>
                    <p>¡Descuentos Online Exclusivos Activados! Compra más barato que en tienda y retira en el local.</p>
                </div>
            </div>
        `;
    }
}

// Renderizado de botones de categoría (Pill Buttons)
function renderCategories() {
    const container = document.getElementById("categories-bar");
    if (!container) return;

    const list = typeof getActiveCategoriesList === "function" ? getActiveCategoriesList() : DEMGEL_CATEGORIES;

    let html = "";
    list.forEach((cat, index) => {
        const activeClass = index === 0 ? "active" : "";
        const catSlug = cat.slug || cat.id;
        const iconClass = cat.icon ? (cat.icon.startsWith("fa-") ? `fas ${cat.icon}` : cat.icon) : "fas fa-tag";
        html += `
            <button class="category-pill ${activeClass}" data-category="${catSlug}">
                <i class="${iconClass}"></i>
                <span>${cat.name}</span>
            </button>
        `;
    });

    container.innerHTML = html;

    // Resetear scroll al inicio en vista móvil
    try {
        container.scrollLeft = 0;
    } catch (e) {}

    // Eventos de filtrado con centrado suave en móvil
    container.querySelectorAll(".category-pill").forEach(btn => {
        btn.addEventListener("click", () => {
            container.querySelectorAll(".category-pill").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            // Centrar suavemente el botón en pantalla móvil
            try {
                btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            } catch (e) {}

            const catId = btn.getAttribute("data-category");
            renderProducts(catId);
        });
    });
}

// Sincronización en tiempo real entre pestañas y panel de administración
window.addEventListener("storage", (e) => {
    if (e.key === "demgel_mock_categories" || e.key === "demgel_mock_products") {
        renderCategories();
        const activeBtn = document.querySelector(".category-pill.active");
        const activeCat = activeBtn ? activeBtn.getAttribute("data-category") : "todos";
        renderProducts(activeCat);
    }
});

window.addEventListener("demgel:category_updated", () => {
    renderCategories();
});

// Renderizado de tarjetas de producto premium Demgel
function renderProducts(categorySlug) {
    const grid = document.getElementById("products-grid");
    if (!grid) return;

    const products = getProductsByCategory(categorySlug);

    if (products.length === 0) {
        grid.innerHTML = `
            <div class="no-products-msg">
                <i class="fas fa-box-open"></i>
                <p>No hay productos disponibles en esta categoría actualmente.</p>
            </div>
        `;
        return;
    }

    let html = "";
    products.forEach(p => {
        const savings = p.store_price - p.online_price;
        const discountPercent = Math.round((savings / p.store_price) * 100);

        html += `
            <div class="product-card glass-effect animate-up" data-id="${p.id}">
                <!-- Badge Superior -->
                <div class="product-card__badges">
                    <span class="badge-online-offer"><i class="fas fa-bolt"></i> OFERTA</span>
                    ${discountPercent > 0 ? `<span class="badge-discount">-${discountPercent}%</span>` : ''}
                </div>

                <!-- Imagen del Producto -->
                <div class="product-card__img-wrap" onclick="openProductModal('${p.id}')">
                    <img src="${p.image}" alt="${p.name}" class="product-card__img" loading="lazy">
                </div>

                <!-- Contenido -->
                <div class="product-card__content">
                    <div class="product-card__meta">
                        <span class="product-card__category">${p.category_name}</span>
                        ${p.model_reference ? `<span class="product-card__model">Ref: ${p.model_reference}</span>` : ''}
                    </div>

                    <h3 class="product-card__title" onclick="openProductModal('${p.id}')">${p.name}</h3>

                    <!-- Bloque de Precios con Ahorro Claro -->
                    <div class="product-card__pricing">
                        <div class="price-row">
                            <span class="price-store-label">Tienda:</span>
                            <span class="price-store">${formatCLP(p.store_price)}</span>
                        </div>
                        <div class="price-online-row">
                            <span class="price-online-label">Online:</span>
                            <span class="price-online">${formatCLP(p.online_price)}</span>
                        </div>
                        <div class="savings-chip">
                            <i class="fas fa-arrow-down"></i> Ahorras ${formatCLP(savings)}
                        </div>
                    </div>

                    <!-- Stock e Indicador -->
                    <div class="product-card__stock">
                        <span class="stock-dot"></span>
                        <span>${p.stock > 0 ? `${p.stock} en tienda` : 'Agotado'}</span>
                    </div>

                    <!-- Botones de Acción -->
                    <div class="product-card__actions">
                        <button class="btn-primary btn-add-cart" onclick="DemgelCart.addItem('${p.id}', 1)">
                            <i class="fas fa-cart-plus"></i> Añadir
                        </button>
                        <button class="btn-quick-buy" onclick="quickBuy('${p.id}')" title="Comprar y retirar">
                            Comprar Ahora
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
}

// Acción de compra rápida (agrega y lleva directo a checkout)
function quickBuy(productId) {
    const res = DemgelCart.addItem(productId, 1);
    if (res.success) {
        window.location.href = "checkout.html";
    }
}

// Modal de Detalle de Producto
function openProductModal(productId) {
    const product = getProductById(productId);
    if (!product) return;

    DemgelAnalytics.trackProductView(product);

    const modal = document.getElementById("product-modal");
    const body = document.getElementById("product-modal-body");
    if (!modal || !body) return;

    const savings = product.store_price - product.online_price;
    const discountPercent = Math.round((savings / product.store_price) * 100);

    // Renderizar especificaciones confirmadas
    let specsHtml = "";
    if (product.specifications && Object.keys(product.specifications).length > 0) {
        specsHtml = `<div class="modal-specs-grid">`;
        for (const [key, value] of Object.entries(product.specifications)) {
            specsHtml += `
                <div class="spec-row">
                    <span class="spec-label">${key}:</span>
                    <span class="spec-value">${value}</span>
                </div>
            `;
        }
        specsHtml += `</div>`;
    }

    body.innerHTML = `
        <div class="modal-product-layout">
            <div class="modal-gallery">
                <div class="modal-main-img-wrap">
                    <img src="${product.image}" alt="${product.name}" id="modal-main-img" class="modal-main-img">
                </div>
            </div>

            <div class="modal-product-info">
                <div class="modal-badges">
                    <span class="badge-online-offer"><i class="fas fa-bolt"></i> OFERTA ONLINE</span>
                    <span class="badge-pickup"><i class="fas fa-store"></i> RETIRO EN TIENDA</span>
                </div>

                <h2 class="modal-title">${product.name}</h2>
                <div class="modal-model">Referencia: <strong>${product.model_reference || 'Oficial Demgel'}</strong></div>

                <div class="modal-pricing-box">
                    <div class="modal-price-store">Precio normal en tienda: <span>${formatCLP(product.store_price)}</span></div>
                    <div class="modal-price-online">Precio exclusivo online: <strong>${formatCLP(product.online_price)}</strong></div>
                    <div class="modal-savings-tag"><i class="fas fa-piggy-bank"></i> Ahorras ${formatCLP(savings)} (-${discountPercent}%)</div>
                </div>

                <p class="modal-desc">${product.description}</p>

                <div class="modal-section-title"><i class="fas fa-microchip"></i> Ficha Técnica Confirmada</div>
                ${specsHtml}

                <div class="modal-stock-status">
                    <i class="fas fa-check-circle"></i> ${product.stock} unidades en bodega listas para retiro inmediato
                </div>

                <div class="modal-buy-actions">
                    <div class="modal-qty-selector">
                        <button class="qty-btn" onclick="adjustModalQty(-1)">-</button>
                        <span id="modal-qty-display">1</span>
                        <button class="qty-btn" onclick="adjustModalQty(1)">+</button>
                    </div>
                    <button class="btn-primary modal-add-btn" onclick="addModalProduct('${product.id}')">
                        <i class="fas fa-cart-plus"></i> Agregar al Carrito
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.classList.add("open");
    document.body.style.overflow = "hidden";
}

let modalCurrentQty = 1;
function adjustModalQty(delta) {
    modalCurrentQty = Math.max(1, modalCurrentQty + delta);
    const display = document.getElementById("modal-qty-display");
    if (display) display.textContent = modalCurrentQty;
}

function addModalProduct(productId) {
    DemgelCart.addItem(productId, modalCurrentQty);
    closeProductModal();
    modalCurrentQty = 1;
}

function closeProductModal() {
    const modal = document.getElementById("product-modal");
    if (modal) {
        modal.classList.remove("open");
        document.body.style.overflow = "";
    }
}

// Configuración de UI General (Header scroll, Menú móvil, Modales)
function setupUI() {
    // Header scrolled blur
    const header = document.getElementById("main-header");
    window.addEventListener("scroll", () => {
        if (window.scrollY > 40) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }
    });

    // Botones de Carrito en Header y Móvil
    const cartBtns = document.querySelectorAll(".nav-cart-btn, .mobile-cart-btn");
    cartBtns.forEach(btn => {
        btn.addEventListener("click", DemgelCart.toggleDrawer);
    });

    // Menú Hamburguesa Móvil
    const hamburger = document.getElementById("mobile-menu-btn");
    const mobileMenu = document.getElementById("mobile-menu");
    if (hamburger && mobileMenu) {
        hamburger.addEventListener("click", () => {
            mobileMenu.classList.toggle("open");
            hamburger.classList.toggle("active");
        });
        mobileMenu.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                mobileMenu.classList.remove("open");
                hamburger.classList.remove("active");
            });
        });
    }

    // Modal Close button & Outside tap
    const modalClose = document.getElementById("product-modal-close");
    const modal = document.getElementById("product-modal");
    if (modalClose) modalClose.addEventListener("click", closeProductModal);
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeProductModal();
        });
    }
}
