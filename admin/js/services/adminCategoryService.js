/**
 * SERVICIO ADMINISTRATIVO DE CATEGORÍAS (ADMIN CATEGORY SERVICE)
 * Gestión persistente de categorías con iconos FontAwesome, slug y orden visual.
 */

const AdminCategoryService = (function() {
    const STORAGE_KEY_CATEGORIES = "demgel_mock_categories";

    const DEFAULT_CATEGORIES = [
        { id: "todos", name: "Todos", slug: "todos", icon: "fa-border-all", description: "Todos los productos", is_active: true },
        { id: "cargadores", name: "Cargadores", slug: "cargadores", icon: "fa-plug", description: "Cargadores de pared y viaje TURBO AUTO-ID", is_active: true },
        { id: "cables", name: "Cables", slug: "cables", icon: "fa-bolt", description: "Cables de carga rápida Tipo-C, Lightning y USB", is_active: true },
        { id: "auto", name: "Accesorios para Auto", slug: "auto", icon: "fa-car", description: "Cargadores de cigarrera y soportes para vehículos", is_active: true },
        { id: "parlantes", name: "Mini Parlantes", slug: "parlantes", icon: "fa-volume-high", description: "Parlantes bluetooth portátiles con luces RGB", is_active: true },
        { id: "otros", name: "Otros Accesorios", slug: "otros", icon: "fa-box-open", description: "TV Box 8K, adaptadores y accesorios varios", is_active: true }
    ];

    function initCategories() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
            if (!raw) {
                localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
            } else {
                // Actualizar nombres existentes si usan la versión previa
                let list = JSON.parse(raw);
                let changed = false;
                list = list.map(c => {
                    if (c.id === "auto" || c.slug === "auto" || c.slug === "accesorios-auto" || c.slug === "accesorios-para-auto") {
                        if (c.name !== "Accesorios para Auto") {
                            changed = true;
                            return { ...c, name: "Accesorios para Auto" };
                        }
                    }
                    return c;
                });
                if (changed) {
                    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(list));
                }
            }
        } catch (e) {
            console.warn("No se pudo inicializar categorías en localStorage:", e);
        }
    }

    function getCategories() {
        initCategories();
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            console.error("Error al obtener categorías:", e);
        }
        return DEFAULT_CATEGORIES;
    }

    function getCategoryBySlug(slug) {
        if (!slug) return null;
        const list = getCategories();
        const s = slug.toString().toLowerCase().trim();
        return list.find(c => 
            c.slug.toLowerCase() === s || 
            c.id.toLowerCase() === s || 
            c.name.toLowerCase() === s ||
            (s.includes("auto") && (c.slug === "auto" || c.slug === "accesorios-para-auto" || c.slug === "accesorios-auto")) ||
            (s.includes("vehiculo") && c.slug === "auto")
        ) || null;
    }

    function createCategory(data) {
        initCategories();
        try {
            const list = getCategories();
            const name = (data.name || "Nueva Categoría").trim();
            const rawSlug = (data.slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-')).trim();
            const slug = rawSlug || `cat-${Date.now()}`;
            const icon = data.icon || "fa-tag";
            const description = (data.description || "").trim();

            if (list.some(c => c.slug === slug)) {
                return { success: false, error: "SLUG_DUPLICADO", message: `La categoría con identificador "${slug}" ya existe.` };
            }

            const newCategory = {
                id: slug,
                slug: slug,
                name: name,
                icon: icon,
                description: description,
                is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
                created_at: new Date().toISOString()
            };

            list.push(newCategory);
            localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(list));

            try {
                window.dispatchEvent(new CustomEvent("demgel:category_updated", { detail: { category: newCategory } }));
            } catch (evErr) {}

            return {
                success: true,
                category: newCategory,
                message: `Categoría "${name}" creada exitosamente.`
            };
        } catch (e) {
            console.error("Error al crear categoría:", e);
            return { success: false, error: "CREATE_ERROR", message: "Error interno al crear categoría." };
        }
    }

    function updateCategory(slug, updateData) {
        initCategories();
        try {
            let list = getCategories();
            const idx = list.findIndex(c => c.slug === slug || c.id === slug);
            if (idx === -1) {
                return { success: false, error: "NOT_FOUND", message: "Categoría no encontrada." };
            }

            const current = list[idx];
            const updated = {
                ...current,
                name: updateData.name !== undefined ? updateData.name.trim() : current.name,
                icon: updateData.icon !== undefined ? updateData.icon.trim() : current.icon,
                description: updateData.description !== undefined ? updateData.description.trim() : current.description,
                is_active: updateData.is_active !== undefined ? Boolean(updateData.is_active) : current.is_active
            };

            list[idx] = updated;
            localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(list));

            return {
                success: true,
                category: updated,
                message: `Categoría "${updated.name}" actualizada correctamente.`
            };
        } catch (e) {
            console.error("Error al actualizar categoría:", e);
            return { success: false, error: "UPDATE_ERROR", message: "Error al actualizar categoría." };
        }
    }

    return {
        getCategories,
        getCategoryBySlug,
        createCategory,
        updateCategory
    };
})();
