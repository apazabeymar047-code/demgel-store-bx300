/**
 * DATOS MOCK - CATÁLOGO DE PRODUCTOS DEMGEL
 * FASE 2C: Solo para visualización y pruebas de interfaz frontend.
 * NOTA: Los precios y datos definitivos se configurarán en la base de datos real.
 * Modelos identificados en empaques reales Demgel.
 */

let DEMGEL_CATEGORIES_BASE = [
    { id: "todos", name: "Todos", slug: "todos", icon: "fa-border-all", is_active: true },
    { id: "cargadores", name: "Cargadores", slug: "cargadores", icon: "fa-plug", is_active: true },
    { id: "cables", name: "Cables", slug: "cables", icon: "fa-bolt", is_active: true },
    { id: "auto", name: "Accesorios para Auto", slug: "auto", icon: "fa-car", is_active: true },
    { id: "parlantes", name: "Mini Parlantes", slug: "parlantes", icon: "fa-volume-high", is_active: true },
    { id: "otros", name: "Otros Accesorios", slug: "otros", icon: "fa-box-open", is_active: true },
    { id: "tvbox", name: "TV BOX", slug: "tvbox", icon: "fa-tv", is_active: true }
];

function getActiveCategoriesList() {
    try {
        const raw = localStorage.getItem("demgel_mock_categories");
        if (raw) {
            let list = JSON.parse(raw);
            if (Array.isArray(list) && list.length > 0) {
                // Fusionar categorías base que puedan faltar en el almacenamiento del cliente
                DEMGEL_CATEGORIES_BASE.forEach(defCat => {
                    if (!list.some(c => c.slug === defCat.slug || c.id === defCat.id)) {
                        list.push(defCat);
                    }
                });
                return list.filter(c => c.is_active !== false);
            }
        }
    } catch (e) {
        console.warn("Error al cargar categorías de localStorage:", e);
    }
    return DEMGEL_CATEGORIES_BASE;
}

let DEMGEL_CATEGORIES = getActiveCategoriesList();

let DEMGEL_PRODUCTS = [
    {
        id: "prod-d-e6048c",
        model_reference: "D-E6048C",
        name: "Cargador Demgel Carga Rápida 4.8A AUTO-ID + Cable",
        category: "cargadores",
        category_name: "Cargadores",
        store_price: 8990,
        online_price: 7490,
        stock: 18,
        is_active: true,
        is_featured: true,
        is_online_offer: true,
        image: "assets/products/D-E6048C.jpg",
        gallery: [
            "assets/products/D-E6048C.jpg"
        ],
        description: "Cargador de pared de carga rápida con doble puerto USB y tecnología inteligente AUTO-ID. Incluye cable de 1000mm.",
        specifications: {
            "Modelo": "D-E6048C",
            "Capacidad": "4.8A Carga Rápida",
            "Tecnología": "AUTO-ID Inteligente",
            "Cable": "1000mm de longitud",
            "Garantía": "Garantía oficial Demgel en tienda"
        }
    },
    {
        id: "prod-d-e4016c",
        model_reference: "D-E4016C",
        name: "Cable Demgel Carga Rápida USB-A a Tipo-C",
        category: "cables",
        category_name: "Cables",
        store_price: 4990,
        online_price: 3990,
        stock: 25,
        is_active: true,
        is_featured: true,
        is_online_offer: true,
        image: "assets/products/D-E4016C.jpg",
        gallery: [
            "assets/products/D-E4016C.jpg"
        ],
        description: "Cable de datos y carga rápida diseñado para alta conectividad, durabilidad y elasticidad sin grietas.",
        specifications: {
            "Modelo": "D-E4016C",
            "Conector": "USB-A a Tipo-C",
            "Características": "Carga rápida sin calefacción",
            "Calidad": "Cuerpo de alta elasticidad y resistencia"
        }
    },
    {
        id: "prod-d-e6051c",
        model_reference: "D-E6051C",
        name: "Cargador de Viaje Demgel 4.8A Turbo Carga Rápida",
        category: "cargadores",
        category_name: "Cargadores",
        store_price: 6990,
        online_price: 5490,
        stock: 20,
        is_active: true,
        is_featured: true,
        is_online_offer: true,
        image: "assets/products/D-E6051C.jpg",
        gallery: [
            "assets/products/D-E6051C.jpg"
        ],
        description: "Cargador de viaje compacto de 4.8A TURBO con chip inteligente incorporado y seguridad inteligente AUTO-ID.",
        specifications: {
            "Modelo": "D-E6051C",
            "Entrada": "AC110-240V 50/60Hz",
            "Salida": "DC5V 4.8A Turbo",
            "Tecnología": "Chip Inteligente AUTO-ID"
        }
    },
    {
        id: "prod-d-d0004c",
        model_reference: "D-D0004C",
        name: "Cargador para Auto Demgel Doble USB 4.8A AUTO-ID",
        category: "auto",
        category_name: "Accesorios para Auto",
        store_price: 7990,
        online_price: 6490,
        stock: 12,
        is_active: true,
        is_featured: true,
        is_online_offer: true,
        image: "assets/products/D-D0004C.jpg",
        gallery: [
            "assets/products/D-D0004C.jpg"
        ],
        description: "Cargador para auto de alta potencia con doble puerto USB y tecnología AUTO-ID. Incluye cable de 1000mm.",
        specifications: {
            "Modelo": "D-D0004C",
            "Potencia": "4.8A Carga Rápida y Segura",
            "Puertos": "Doble USB",
            "Cable": "1000mm de longitud incluido"
        }
    },
    {
        id: "prod-d-p8002",
        model_reference: "D-P8002",
        name: "Mini Parlante Bluetooth Demgel RGB 3 Inch",
        category: "parlantes",
        category_name: "Mini Parlantes",
        store_price: 16990,
        online_price: 13990,
        stock: 10,
        is_active: true,
        is_featured: true,
        is_online_offer: true,
        image: "assets/products/D-P8002.jpg",
        gallery: [
            "assets/products/D-P8002.jpg"
        ],
        description: "Sistema de altavoz multimedia de 3 pulgadas con luz RGB, Bluetooth, radio FM, puerto USB, aux y tarjeta TF.",
        specifications: {
            "Modelo": "D-P8002",
            "Tamaño": "3 Pulgadas (3 INCH)",
            "Iluminación": "Luz RGB Multimedia System",
            "Conexiones": "Bluetooth, FM, USB, AUX, Micro SD"
        }
    },
    {
        id: "prod-d-n0301",
        model_reference: "D-N0301",
        name: "Demgel TV BOX 8K 2+16G Memoria",
        category: "tvbox",
        category_name: "TV BOX",
        store_price: 24990,
        online_price: 19990,
        stock: 15,
        is_active: true,
        is_featured: true,
        is_online_offer: true,
        image: "assets/products/D-N0301.jpg",
        gallery: [
            "assets/products/D-N0301.jpg"
        ],
        description: "TV Box 8K UCD con 2GB de memoria RAM y 16GB de almacenamiento. WiFi 2.4G, Bluetooth 5.4 y CPU H3 Quad-Core.",
        specifications: {
            "Modelo": "D-N0301",
            "Resolución": "8K UCD 3840x2160",
            "Memoria": "2GB RAM + 16GB ROM",
            "Procesador": "CPU H3",
            "Conectividad": "WiFi 2.4G & Bluetooth 5.4"
        }
    },
    {
        id: "prod-d-e4012cc",
        model_reference: "D-E4012CC",
        name: "Cable Demgel Carga Rápida 65W Tipo-C a Tipo-C",
        category: "cables",
        category_name: "Cables",
        store_price: 6990,
        online_price: 5490,
        stock: 15,
        is_active: true,
        is_featured: true,
        is_online_offer: true,
        image: "assets/products/D-E4012CC.jpg",
        gallery: [
            "assets/products/D-E4012CC.jpg"
        ],
        description: "Cable de carga ultra rápida 65W Tipo-C a Tipo-C con chip inteligente y diseño duradero sin roturas.",
        specifications: {
            "Modelo": "D-E4012CC",
            "Potencia": "65W Carga Rápida",
            "Conectores": "Tipo-C a Tipo-C",
            "Chip": "Chip Inteligente con protección"
        }
    }
];

// Cargar productos desde memoria local (Admin Panel persistente) si existen
function getActiveProductsList() {
    try {
        const raw = localStorage.getItem("demgel_mock_products");
        if (raw) {
            let stored = JSON.parse(raw);
            if (Array.isArray(stored) && stored.length > 0) {
                let modified = false;
                const originalLen = stored.length;

                // Purgar productos fantasma de Soporte Magnético creados en pruebas locales
                let filtered = stored.filter(p => {
                    const pName = (p.name || "").toLowerCase();
                    const pModel = (p.model_reference || "").toUpperCase();
                    const pId = (p.id || "").toLowerCase();

                    // Eliminar cualquier producto de prueba que contenga "soporte" o "360" o con modelo D-N0301 que no sea la TV Box oficial
                    if (pName.includes("soporte") || pName.includes("360") || (pModel === "D-N0301" && pId !== "prod-d-n0301")) {
                        return false;
                    }
                    return true;
                });

                if (filtered.length !== originalLen) modified = true;

                // Sincronizar imágenes locales HD
                let cleaned = filtered.map(p => {
                    const pName = (p.name || "").toLowerCase();
                    const modelRef = (p.model_reference || "").toUpperCase();

                    let imgPath = p.image;
                    if (modelRef && ["D-E6048C", "D-E4016C", "D-E6051C", "D-D0004C", "D-P8002", "D-N0301", "D-E4012CC"].includes(modelRef)) {
                        imgPath = `assets/products/${modelRef}.jpg`;
                    }

                    // Auto-migrar categoría a TV BOX solo si el NOMBRE del producto incluye TV Box o es el ID oficial de TV Box
                    if ((pName.includes("tv box") || pName.includes("tvbox") || p.id === "prod-d-n0301")) {
                        return { ...p, image: "assets/products/D-N0301.jpg", category: "tvbox", category_name: "TV BOX" };
                    }

                    return { ...p, image: imgPath };
                });

                // Si se realizaron correcciones en productos corruptos en el navegador del usuario, sobreescribir localStorage inmediatamente
                if (modified) {
                    try {
                        localStorage.setItem("demgel_mock_products", JSON.stringify(cleaned));
                    } catch (err) {}
                }

                return cleaned;
            }
        }
    } catch (e) {
        console.warn("Error al cargar productos de localStorage:", e);
    }
    return DEMGEL_PRODUCTS;
}

// Helper para obtener productos por categoría
function getProductsByCategory(categorySlug) {
    const list = getActiveProductsList();
    if (!categorySlug || categorySlug === "todos") {
        return list.filter(p => p.is_active !== false);
    }
    const target = categorySlug.toString().toLowerCase().trim();
    return list.filter(p => {
        if (p.is_active === false) return false;
        const pCat = (p.category || "").toString().toLowerCase().trim();
        const pCatId = (p.category_id || "").toString().toLowerCase().trim();
        const pCatName = (p.category_name || "").toString().toLowerCase().trim();
        const pName = (p.name || "").toString().toLowerCase().trim();

        if (pCat === target || pCatId === target || pCatName === target) return true;

        // Coincidencia flexible para TV BOX
        const isTvTarget = target.includes("tv") || target.includes("box");
        const isTvProduct = (pCat.includes("tv") || pCatName.includes("tv") || pName.includes("tv box") || pName.includes("tvbox")) && !pName.includes("soporte");
        if (isTvTarget && isTvProduct) return true;

        // Sinonimia para auto / vehículo / accesorios-para-auto
        const isAutoTarget = target.includes("auto") || target.includes("vehicul");
        const isAutoProduct = pCat.includes("auto") || pCat.includes("vehicul") || pCatName.includes("auto") || pCatName.includes("vehicul") || pName.includes("soporte");
        if (isAutoTarget && isAutoProduct) return true;

        return false;
    });
}

// Helper para obtener solo ofertas
function getOnlineOffers() {
    const list = getActiveProductsList();
    return list.filter(p => p.is_active !== false && p.is_online_offer);
}

// Helper para obtener producto por ID (soporta UUID, slug o modelo)
function getProductById(id) {
    if (!id) return null;
    const list = getActiveProductsList();
    return list.find(p => 
        p.id === id || 
        p.slug === id || 
        p.model_reference === id ||
        (id === "prod-d-e4016c" && p.model_reference === "D-E4016C") ||
        (id === "prod-d-e6051c" && p.model_reference === "D-E6051C") ||
        (id === "prod-d-e6048c" && p.model_reference === "D-E6048C") ||
        (id === "prod-d-e4012cc" && p.model_reference === "D-E4012CC") ||
        (id === "prod-d-d0004c" && p.model_reference === "D-D0004C") ||
        (id === "prod-d-p8002" && p.model_reference === "D-P8002") ||
        (id === "prod-d-n0301" && p.model_reference === "D-N0301")
    );
}

// Sincronización asíncrona con Supabase real (Híbrido Resiliente)
async function syncCatalogWithSupabase() {
    if (typeof DemgelSupabase !== "undefined") {
        try {
            const [remoteCats, remoteProds] = await Promise.all([
                DemgelSupabase.getCategories(),
                DemgelSupabase.getProducts()
            ]);

            if (remoteCats && remoteCats.length > 0) {
                const localActive = getActiveCategoriesList();
                const mergedMap = new Map();
                
                // Preservar categorías locales activas
                localActive.forEach(c => {
                    const key = c.slug || c.id;
                    mergedMap.set(key, { ...c, id: key });
                });

                // Fusionar categorías desde Supabase
                remoteCats.forEach(c => {
                    const key = c.slug || c.id;
                    if (!mergedMap.has(key)) {
                        mergedMap.set(key, {
                            id: key,
                            slug: key,
                            name: c.name,
                            icon: c.icon || "fa-tag",
                            uuid: c.id
                        });
                    }
                });

                DEMGEL_CATEGORIES = Array.from(mergedMap.values());
            }

            if (remoteProds && remoteProds.length > 0) {
                const localProds = getActiveProductsList();
                const prodMap = new Map();

                // Preservar productos locales (incluyendo TV BOX D-N0301)
                localProds.forEach(p => {
                    prodMap.set(p.id, p);
                });

                // Fusionar productos de Supabase
                remoteProds.forEach(p => {
                    const pName = (p.name || "").toLowerCase();
                    let modelRef = (p.model_reference || p.model || "").toUpperCase();

                    // Evitar que Soporte Magnético absorba modelo o categoría de TV BOX desde Supabase
                    if (pName.includes("soporte") || pName.includes("auto 360")) {
                        modelRef = "D-D0004C";
                        p.category = "auto";
                        p.category_name = "Accesorios para Auto";
                    }

                    let imgPath = p.image || p.main_image;
                    if (modelRef && ["D-E6048C", "D-E4016C", "D-E6051C", "D-D0004C", "D-P8002", "D-N0301", "D-E4012CC"].includes(modelRef)) {
                        imgPath = `assets/products/${modelRef}.jpg`;
                    }
                    
                    let catSlug = (p.category && p.category.slug) ? p.category.slug : p.category;
                    if ((modelRef === "D-N0301" || pName.includes("tv box")) && !pName.includes("soporte")) {
                        catSlug = "tvbox";
                    } else if (pName.includes("soporte") || pName.includes("auto 360")) {
                        catSlug = "auto";
                    }

                    const formattedRemote = {
                        ...p,
                        model_reference: modelRef,
                        category: catSlug,
                        image: imgPath,
                        gallery: [imgPath]
                    };

                    if (!prodMap.has(p.id)) {
                        prodMap.set(p.id, formattedRemote);
                    }
                });

                DEMGEL_PRODUCTS = Array.from(prodMap.values());
            }

            document.dispatchEvent(new CustomEvent("demgel:catalog_loaded", {
                detail: { categories: DEMGEL_CATEGORIES, products: DEMGEL_PRODUCTS }
            }));
        } catch (e) {
            console.warn("Error al sincronizar catálogo con Supabase, usando catálogo base:", e);
        }
    }
    return { categories: DEMGEL_CATEGORIES, products: DEMGEL_PRODUCTS };
}

// Formateador de moneda chilena
function formatCLP(amount) {
    return "$" + (amount || 0).toLocaleString("es-CL");
}

