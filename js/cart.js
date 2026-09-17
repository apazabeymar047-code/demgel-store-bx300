/**
 * GESTOR DE CARRITO Y SLIDE-OVER DRAWER
 * FASE 2C: Carrito con persistencia en localStorage, cálculo dual de precios y control de stock
 */

const DemgelCart = (function() {
    const STORAGE_KEY = "demgel_cart_items";
    let items = [];

    // 1. Inicialización y carga de LocalStorage
    function init() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                items = JSON.parse(raw);
                // Validar que los productos aún existan en el catálogo
                items = items.filter(item => {
                    const prod = getProductById(item.productId);
                    return prod && prod.is_active !== false;
                });
            }
        } catch (e) {
            console.error("Error al cargar carrito:", e);
            items = [];
        }
        save();
        render();
        setupEventListeners();
    }

    // 2. Guardar en localStorage y actualizar UI
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (e) {
            console.error("Error al guardar carrito:", e);
        }
        updateBadges();
        document.dispatchEvent(new CustomEvent("demgel:cart_updated", { detail: getSummary() }));
    }

    // 3. Operaciones del Carrito
    function addItem(productId, quantity = 1) {
        const product = getProductById(productId);
        if (!product) return { success: false, error: "Producto no encontrado" };

        const existingIndex = items.findIndex(i => i.productId === productId);
        let currentQtyInCart = existingIndex >= 0 ? items[existingIndex].quantity : 0;
        let newQty = currentQtyInCart + quantity;

        // Validar stock disponible
        if (newQty > product.stock) {
            alert(`Solo quedan ${product.stock} unidades disponibles de este producto.`);
            return { success: false, error: "Stock insuficiente" };
        }

        if (existingIndex >= 0) {
            items[existingIndex].quantity = newQty;
        } else {
            items.push({
                productId: productId,
                quantity: quantity
            });
        }

        save();
        render();
        showToast(product, quantity);

        // Rastrear evento analítico
        DemgelAnalytics.trackAddToCart(product, quantity);

        return { success: true };
    }

    let toastTimeout = null;

    function showToast(product, quantityAdded) {
        const toast = document.getElementById("cart-toast");
        const body = document.getElementById("cart-toast-body");
        if (!toast || !body) return;

        body.innerHTML = `
            <div class="toast-header-row">
                <div class="toast-check-icon"><i class="fas fa-check"></i></div>
                <div class="toast-title-text">
                    <strong>¡Añadido al Carrito!</strong>
                    <span>Reserva asegurada por 30 minutos</span>
                </div>
                <button class="toast-close-btn" onclick="DemgelCart.closeToast()"><i class="fas fa-times"></i></button>
            </div>
            <div class="toast-product-row">
                <img src="${product.image}" alt="${product.name}" class="toast-prod-img">
                <div class="toast-prod-info">
                    <div class="toast-prod-title">${product.name}</div>
                    <div class="toast-prod-price">${formatCLP(product.online_price)} <span class="toast-qty-badge">x${quantityAdded}</span></div>
                </div>
            </div>
            <div class="toast-actions-row">
                <button class="btn-toast-secondary" onclick="DemgelCart.openDrawer(); DemgelCart.closeToast();">
                    <i class="fas fa-shopping-bag"></i> Ver Carrito
                </button>
                <a href="checkout.html" class="btn-toast-primary">
                    <i class="fas fa-bolt"></i> Ir a Pagar
                </a>
            </div>
        `;

        toast.classList.add("active");

        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            closeToast();
        }, 5000);
    }

    function closeToast() {
        const toast = document.getElementById("cart-toast");
        if (toast) toast.classList.remove("active");
    }

    function removeItem(productId) {
        items = items.filter(i => i.productId !== productId);
        save();
        render();
    }

    function updateQuantity(productId, quantity) {
        const product = getProductById(productId);
        if (!product) return;

        if (quantity <= 0) {
            removeItem(productId);
            return;
        }

        if (quantity > product.stock) {
            alert(`Stock máximo alcanzado (${product.stock} disponibles)`);
            quantity = product.stock;
        }

        const item = items.find(i => i.productId === productId);
        if (item) {
            item.quantity = quantity;
            save();
            render();
        }
    }

    function clearCart() {
        items = [];
        save();
        render();
    }

    // 4. Cálculos y Resumen
    function getSummary() {
        let totalItems = 0;
        let totalOnline = 0;
        let totalStore = 0;

        items.forEach(item => {
            const prod = getProductById(item.productId);
            if (prod) {
                totalItems += item.quantity;
                totalOnline += prod.online_price * item.quantity;
                totalStore += prod.store_price * item.quantity;
            }
        });

        const totalSavings = totalStore - totalOnline;

        return {
            items: items,
            totalItems: totalItems,
            totalOnline: totalOnline,
            totalStore: totalStore,
            totalSavings: totalSavings
        };
    }

    // 5. Renderizado del Drawer Lateral
    function render() {
        const container = document.getElementById("cart-drawer-items");
        const emptyState = document.getElementById("cart-drawer-empty");
        const footer = document.getElementById("cart-drawer-footer");
        const summary = getSummary();

        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = "";
            if (emptyState) emptyState.style.display = "flex";
            if (footer) footer.style.display = "none";
            return;
        }

        if (emptyState) emptyState.style.display = "none";
        if (footer) footer.style.display = "block";

        let html = "";
        items.forEach(item => {
            const prod = getProductById(item.productId);
            if (!prod) return;

            const subtotal = prod.online_price * item.quantity;
            const subtotalStore = prod.store_price * item.quantity;

            html += `
                <div class="cart-item" data-id="${prod.id}">
                    <div class="cart-item__img-wrap">
                        <img src="${prod.image}" alt="${prod.name}" class="cart-item__img">
                    </div>
                    <div class="cart-item__info">
                        <div class="cart-item__header">
                            <h4 class="cart-item__name">${prod.name}</h4>
                            <button class="cart-item__remove" onclick="DemgelCart.removeItem('${prod.id}')" aria-label="Eliminar">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                        <div class="cart-item__model">${prod.model_reference ? 'Ref: ' + prod.model_reference : ''}</div>
                        <div class="cart-item__prices">
                            <span class="cart-item__price-online">${formatCLP(prod.online_price)}</span>
                            <span class="cart-item__price-store">${formatCLP(prod.store_price)}</span>
                        </div>
                        <div class="cart-item__footer">
                            <div class="cart-qty-control">
                                <button class="cart-qty-btn" onclick="DemgelCart.updateQuantity('${prod.id}', ${item.quantity - 1})" aria-label="Disminuir">-</button>
                                <span class="cart-qty-val">${item.quantity}</span>
                                <button class="cart-qty-btn" onclick="DemgelCart.updateQuantity('${prod.id}', ${item.quantity + 1})" aria-label="Aumentar">+</button>
                            </div>
                            <div class="cart-item__subtotal">
                                ${formatCLP(subtotal)}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Actualizar totales y ahorro
        const elTotalOnline = document.getElementById("cart-total-online");
        const elTotalStore = document.getElementById("cart-total-store");
        const elTotalSavings = document.getElementById("cart-total-savings");

        if (elTotalOnline) elTotalOnline.textContent = formatCLP(summary.totalOnline);
        if (elTotalStore) elTotalStore.textContent = formatCLP(summary.totalStore);
        if (elTotalSavings) elTotalSavings.textContent = formatCLP(summary.totalSavings);
    }

    function updateBadges() {
        const summary = getSummary();
        const badges = document.querySelectorAll(".cart-counter-badge");
        badges.forEach(badge => {
            badge.textContent = summary.totalItems;
            badge.style.display = summary.totalItems > 0 ? "flex" : "none";
        });
    }

    // 6. Control Visual del Drawer
    function openDrawer() {
        const drawer = document.getElementById("cart-drawer");
        const overlay = document.getElementById("cart-drawer-overlay");
        if (drawer && overlay) {
            drawer.classList.add("open");
            overlay.classList.add("open");
            document.body.style.overflow = "hidden";
        }
    }

    function closeDrawer() {
        const drawer = document.getElementById("cart-drawer");
        const overlay = document.getElementById("cart-drawer-overlay");
        if (drawer && overlay) {
            drawer.classList.remove("open");
            overlay.classList.remove("open");
            document.body.style.overflow = "";
        }
    }

    function toggleDrawer() {
        const drawer = document.getElementById("cart-drawer");
        if (drawer && drawer.classList.contains("open")) {
            closeDrawer();
        } else {
            openDrawer();
        }
    }

    function setupEventListeners() {
        const closeBtn = document.getElementById("cart-drawer-close");
        const overlay = document.getElementById("cart-drawer-overlay");
        const checkoutBtn = document.getElementById("cart-checkout-btn");

        if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
        if (overlay) overlay.addEventListener("click", closeDrawer);

        if (checkoutBtn) {
            checkoutBtn.addEventListener("click", () => {
                const summary = getSummary();
                if (summary.totalItems === 0) {
                    alert("Tu carrito está vacío. Agrega al menos un producto para continuar.");
                    return;
                }
                DemgelAnalytics.trackCheckoutStarted(summary);
                window.location.href = "checkout.html";
            });
        }

        document.addEventListener("demgel:catalog_loaded", () => {
            render();
        });
    }


    return {
        init,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        getSummary,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        showToast,
        closeToast
    };
})();
