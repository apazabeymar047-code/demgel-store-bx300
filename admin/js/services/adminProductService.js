/**
 * SERVICIO ADMINISTRATIVO DE PRODUCTOS Y STOCK (ADMIN PRODUCT SERVICE)
 * FASE 2E: Gestión de catálogo, validación estricta de precios y control de inventario
 * Diseñado como adaptador desacoplado para ser reemplazado posteriormente por Supabase.
 */

const AdminProductService = (function() {
    const STORAGE_KEY_PRODUCTS = "demgel_mock_products";
    const STORAGE_KEY_STOCK = "demgel_mock_stock";

    // 1. Inicializar catálogo si no existe en localStorage
    function initProducts() {
        try {
            if (!localStorage.getItem(STORAGE_KEY_PRODUCTS)) {
                // Clonar desde DEMGEL_PRODUCTS de data.js
                const initialList = (typeof DEMGEL_PRODUCTS !== "undefined" ? DEMGEL_PRODUCTS : []).map(p => ({
                    ...p,
                    is_active: typeof p.is_active === "boolean" ? p.is_active : true,
                    is_deal: typeof p.is_deal === "boolean" ? p.is_deal : false,
                    is_featured: typeof p.is_featured === "boolean" ? p.is_featured : false
                }));
                localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(initialList));
            }
        } catch (e) {
            console.warn("No se pudo inicializar productos admin en localStorage:", e);
        }
    }

    // 2. Sincronizar stock con el motor de reservas
    function getLiveStock(productId, fallbackStock) {
        try {
            const stockMap = JSON.parse(localStorage.getItem(STORAGE_KEY_STOCK) || "{}");
            if (typeof stockMap[productId] === "number") {
                return stockMap[productId];
            }
            return fallbackStock;
        } catch (e) {
            return fallbackStock;
        }
    }

    // 3. Obtener todos los productos con filtros
    function getProducts(filters = {}) {
        initProducts();
        try {
            let products = JSON.parse(localStorage.getItem(STORAGE_KEY_PRODUCTS) || "[]");

            // Sincronizar con stock en tiempo real
            products = products.map(p => {
                const liveStock = getLiveStock(p.id, p.stock);
                let stockStatus = "normal";
                if (liveStock === 0) stockStatus = "out_of_stock";
                else if (liveStock <= 5) stockStatus = "low_stock";

                const savings = Math.max(0, p.store_price - p.online_price);
                const discountPct = p.store_price > 0 ? Math.round((savings / p.store_price) * 100) : 0;

                return {
                    ...p,
                    stock: liveStock,
                    stock_status: stockStatus,
                    savings: savings,
                    discount_pct: discountPct
                };
            });

            // Filtro por categoría flexible
            if (filters.category && filters.category !== "all") {
                const targetCat = filters.category.toString().toLowerCase().trim();
                products = products.filter(p => {
                    if (!p.category) return false;
                    const pCat = p.category.toString().toLowerCase().trim();
                    const pCatName = (p.category_name || "").toString().toLowerCase().trim();
                    
                    if (pCat === targetCat || pCatName === targetCat) return true;
                    
                    // Sinonimia para auto / vehículo / accesorios-para-auto
                    const isAutoTarget = targetCat.includes("auto") || targetCat.includes("vehicul");
                    const isAutoProduct = pCat.includes("auto") || pCat.includes("vehicul") || pCatName.includes("auto") || pCatName.includes("vehicul");
                    if (isAutoTarget && isAutoProduct) return true;

                    return false;
                });
            }

            // Filtro por estado de stock (normal, low_stock, out_of_stock)
            if (filters.stock_status && filters.stock_status !== "all") {
                products = products.filter(p => p.stock_status === filters.stock_status);
            }

            // Filtro por búsqueda de texto
            if (filters.search && filters.search.trim() !== "") {
                const q = filters.search.toLowerCase().trim();
                products = products.filter(p =>
                    p.name.toLowerCase().includes(q) ||
                    (p.model_reference && p.model_reference.toLowerCase().includes(q))
                );
            }

            return products;
        } catch (e) {
            console.error("Error al obtener productos:", e);
            return [];
        }
    }

    // 4. Obtener producto por ID
    function getProductById(productId) {
        initProducts();
        const products = getProducts();
        return products.find(p => p.id === productId) || null;
    }

    // 5. Actualizar producto con validación estricta
    // Reglas:
    // - online_price <= store_price (NUNCA online_price > store_price)
    // - stock >= 0 (NUNCA stock negativo)
    // - cálculo automático de descuento y ahorro
    function updateProduct(productId, updateData) {
        initProducts();
        try {
            let products = JSON.parse(localStorage.getItem(STORAGE_KEY_PRODUCTS) || "[]");
            const idx = products.findIndex(p => p.id === productId);
            if (idx === -1) {
                return { success: false, error: "PRODUCT_NOT_FOUND", message: "Producto no encontrado." };
            }

            const current = products[idx];

            const newName = updateData.name !== undefined ? updateData.name.trim() : current.name;
            const newDesc = updateData.description !== undefined ? updateData.description.trim() : current.description;
            const newStorePrice = updateData.store_price !== undefined ? parseInt(updateData.store_price, 10) : current.store_price;
            const newOnlinePrice = updateData.online_price !== undefined ? parseInt(updateData.online_price, 10) : current.online_price;
            const newStock = updateData.stock !== undefined ? parseInt(updateData.stock, 10) : current.stock;
            const newCategory = updateData.category !== undefined ? updateData.category : current.category;
            const isDeal = updateData.is_deal !== undefined ? Boolean(updateData.is_deal) : current.is_deal;
            const isFeatured = updateData.is_featured !== undefined ? Boolean(updateData.is_featured) : current.is_featured;
            const isActive = updateData.is_active !== undefined ? Boolean(updateData.is_active) : current.is_active;

            // Validación 1: Precios válidos y positivos
            if (isNaN(newStorePrice) || newStorePrice <= 0 || isNaN(newOnlinePrice) || newOnlinePrice <= 0) {
                return {
                    success: false,
                    error: "PRECIO_INVALIDO",
                    message: "Los precios deben ser valores numéricos mayores a cero."
                };
            }

            // Validación 2: REGLA DE NEGOCIO OBLIGATORIA: online_price <= store_price
            if (newOnlinePrice > newStorePrice) {
                return {
                    success: false,
                    error: "PRECIO_ONLINE_MAYOR",
                    message: `El precio online ($${newOnlinePrice.toLocaleString("es-CL")}) no puede ser superior al precio de tienda ($${newStorePrice.toLocaleString("es-CL")}).`
                };
            }

            // Validación 3: REGLA DE NEGOCIO OBLIGATORIA: stock >= 0
            if (isNaN(newStock) || newStock < 0) {
                return {
                    success: false,
                    error: "STOCK_NEGATIVO",
                    message: "El stock no puede ser un valor negativo."
                };
            }

            // Cálculo automático de ahorro y porcentaje
            const savings = newStorePrice - newOnlinePrice;
            const discountPct = newStorePrice > 0 ? Math.round((savings / newStorePrice) * 100) : 0;

            const updatedProduct = {
                ...current,
                name: newName,
                description: newDesc,
                store_price: newStorePrice,
                online_price: newOnlinePrice,
                stock: newStock,
                category: newCategory,
                is_deal: isDeal,
                is_featured: isFeatured,
                is_active: isActive,
                savings: savings,
                discount_pct: discountPct
            };

            products[idx] = updatedProduct;
            localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));

            // Sincronizar con el mapa de stock general
            const stockMap = JSON.parse(localStorage.getItem(STORAGE_KEY_STOCK) || "{}");
            stockMap[productId] = newStock;
            localStorage.setItem(STORAGE_KEY_STOCK, JSON.stringify(stockMap));

            // Registrar evento de auditoría
            if (typeof AdminOrderService !== "undefined" && AdminOrderService.logAdminEvent) {
                AdminOrderService.logAdminEvent("PRODUCT_UPDATED", productId, {
                    product_name: newName,
                    store_price: newStorePrice,
                    online_price: newOnlinePrice,
                    stock: newStock,
                    discount_pct: discountPct
                });
            }

            return {
                success: true,
                product: updatedProduct,
                message: `Producto "${newName}" actualizado correctamente.`
            };
        } catch (e) {
            console.error("Error al actualizar producto:", e);
            return { success: false, error: "UPDATE_ERROR", message: "Error interno al actualizar producto." };
        }
    }

    // 6. Crear un nuevo producto
    function createProduct(productData) {
        initProducts();
        try {
            let products = JSON.parse(localStorage.getItem(STORAGE_KEY_PRODUCTS) || "[]");

            const modelRef = (productData.model_reference || "").trim().toUpperCase() || `D-P${Math.floor(1000 + Math.random() * 9000)}`;
            const newId = `prod-${modelRef.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

            const name = (productData.name || "Nuevo Producto Demgel").trim();
            const description = (productData.description || "Producto garantizado por Tienda Demgel.").trim();
            const category = productData.category || "cargadores";
            const storePrice = parseInt(productData.store_price, 10) || 0;
            const onlinePrice = parseInt(productData.online_price, 10) || 0;
            const stock = parseInt(productData.stock, 10) || 0;
            const image = productData.image || "assets/products/D-E6048C.jpg";

            if (onlinePrice > storePrice) {
                return {
                    success: false,
                    error: "PRECIO_ONLINE_MAYOR",
                    message: "El precio online no puede ser superior al precio de tienda."
                };
            }

            const savings = Math.max(0, storePrice - onlinePrice);
            const discountPct = storePrice > 0 ? Math.round((savings / storePrice) * 100) : 0;

            const newProduct = {
                id: newId,
                model_reference: modelRef,
                name: name,
                category: category,
                category_name: category.charAt(0).toUpperCase() + category.slice(1),
                store_price: storePrice,
                online_price: onlinePrice,
                stock: stock,
                is_active: productData.is_active !== undefined ? Boolean(productData.is_active) : true,
                is_featured: Boolean(productData.is_featured),
                is_online_offer: true,
                is_deal: Boolean(productData.is_deal),
                image: image,
                gallery: [image],
                description: description,
                specifications: {
                    "Modelo": modelRef,
                    "Garantía": "Garantía oficial Demgel en tienda"
                },
                savings: savings,
                discount_pct: discountPct
            };

            // Prepend new product
            products.unshift(newProduct);
            localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));

            // Actualizar stockMap
            const stockMap = JSON.parse(localStorage.getItem(STORAGE_KEY_STOCK) || "{}");
            stockMap[newId] = stock;
            localStorage.setItem(STORAGE_KEY_STOCK, JSON.stringify(stockMap));

            return {
                success: true,
                product: newProduct,
                message: `Producto "${name}" (${modelRef}) creado y publicado en la tienda.`
            };
        } catch (e) {
            console.error("Error al crear producto:", e);
            return { success: false, error: "CREATE_ERROR", message: "Error interno al crear producto." };
        }
    }

    return {
        initProducts,
        getProducts,
        getProductById,
        updateProduct,
        createProduct
    };
})();
