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
        { id: "otros", name: "Otros Accesorios", slug: "otros", icon: "fa-box-open", description: "Adaptadores y accesorios varios", is_active: true },
        { id: "tvbox", name: "TV BOX", slug: "tvbox", icon: "fa-tv", description: "Convertidores Smart TV 8K y decodificadores", is_active: true }
    ];

    function initCategories() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
            if (!raw) {
                localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
            }
        } catch (e) {
            console.warn("No se pudo inicializar categorías en localStorage:", e);
        }
    }

    function getCategories() {
        initCategories();
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
            const deletedList = JSON.parse(localStorage.getItem("demgel_deleted_categories") || "[]").map(s => s.toLowerCase());
            let list = raw ? JSON.parse(raw) : [...DEFAULT_CATEGORIES];
            
            return list.filter(c => {
                if (!c || c.is_active === false) return false;
                const cSlug = (c.slug || "").toLowerCase();
                const cId = (c.id || "").toLowerCase();
                const cName = (c.name || "").toLowerCase();
                return !deletedList.includes(cSlug) && !deletedList.includes(cId) && !deletedList.includes(cName);
            });
        } catch (e) {
            console.error("Error al obtener categorías:", e);
        }
        return DEFAULT_CATEGORIES;
    }

    function getCategoryBySlug(slug) {
        if (!slug) return null;
        const list = getCategories();
        const s = slug.toString().toLowerCase().trim();
        return list.find(c => {
            const cSlug = (c.slug || "").toLowerCase();
            const cId = (c.id || "").toLowerCase();
            const cName = (c.name || "").toLowerCase();
            return cSlug === s || cId === s || cName === s ||
                (s.includes("auto") && (cSlug.includes("auto") || cId.includes("auto"))) ||
                (s.includes("parlante") && (cSlug.includes("parlante") || cId.includes("parlante"))) ||
                (s.includes("tvbox") && (cSlug.includes("tvbox") || cId.includes("tvbox"))) ||
                (s.includes("otros") && (cSlug.includes("otros") || cId.includes("otros")));
        }) || null;
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

            if (list.some(c => (c.slug || "").toLowerCase() === slug.toLowerCase())) {
                return { success: false, error: "SLUG_DUPLICADO", message: `La categoría con identificador "${slug}" ya existe.` };
            }

            // Si estaba en la lista de eliminadas, removerla de la lista negra
            let deletedList = JSON.parse(localStorage.getItem("demgel_deleted_categories") || "[]");
            deletedList = deletedList.filter(s => (s || "").toLowerCase() !== slug.toLowerCase() && (s || "").toLowerCase() !== name.toLowerCase());
            localStorage.setItem("demgel_deleted_categories", JSON.stringify(deletedList));

            const newCategory = {
                id: slug,
                slug: slug,
                name: name,
                icon: icon,
                description: description,
                is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
                created_at: new Date().toISOString()
            };

            // Asegurar que leemos el raw array para añadir la nueva categoría
            let rawList = JSON.parse(localStorage.getItem(STORAGE_KEY_CATEGORIES) || "[]");
            if (rawList.length === 0) rawList = [...DEFAULT_CATEGORIES];

            // Reemplazar o añadir
            const existingIdx = rawList.findIndex(c => (c.slug || "").toLowerCase() === slug.toLowerCase());
            if (existingIdx !== -1) {
                rawList[existingIdx] = newCategory;
            } else {
                rawList.push(newCategory);
            }

            localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(rawList));

            try {
                window.dispatchEvent(new Event("storage"));
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
            let rawList = JSON.parse(localStorage.getItem(STORAGE_KEY_CATEGORIES) || "[]");
            if (rawList.length === 0) rawList = [...DEFAULT_CATEGORIES];

            const targetLower = slug.toString().toLowerCase();
            const idx = rawList.findIndex(c => (c.slug || "").toLowerCase() === targetLower || (c.id || "").toLowerCase() === targetLower);
            if (idx === -1) {
                return { success: false, error: "NOT_FOUND", message: "Categoría no encontrada." };
            }

            const current = rawList[idx];
            const updated = {
                ...current,
                name: updateData.name !== undefined ? updateData.name.trim() : current.name,
                icon: updateData.icon !== undefined ? updateData.icon.trim() : current.icon,
                description: updateData.description !== undefined ? updateData.description.trim() : current.description,
                is_active: updateData.is_active !== undefined ? Boolean(updateData.is_active) : current.is_active
            };

            rawList[idx] = updated;
            localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(rawList));

            try {
                window.dispatchEvent(new Event("storage"));
                window.dispatchEvent(new CustomEvent("demgel:category_updated", { detail: { category: updated } }));
            } catch (evErr) {}

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

    function deleteCategory(slug) {
        initCategories();
        try {
            const targetLower = slug.toString().toLowerCase().trim();
            if (targetLower === "todos") {
                return { success: false, error: "CANNOT_DELETE_TODOS", message: "La categoría principal 'Todos' no se puede eliminar." };
            }

            let rawList = JSON.parse(localStorage.getItem(STORAGE_KEY_CATEGORIES) || "[]");
            if (rawList.length === 0) rawList = [...DEFAULT_CATEGORIES];

            const catToDelete = getCategoryBySlug(slug) || { id: slug, slug: slug, name: slug };

            // Filtrar eliminando por slug, id y nombre (sin importar variaciones de mayúsculas/minúsculas o alias)
            const updatedList = rawList.filter(c => {
                const cSlug = (c.slug || "").toLowerCase();
                const cId = (c.id || "").toLowerCase();
                const cName = (c.name || "").toLowerCase();
                
                if (cSlug === targetLower || cId === targetLower || cName === targetLower) return false;
                if (catToDelete) {
                    if (cSlug === (catToDelete.slug || "").toLowerCase()) return false;
                    if (cId === (catToDelete.id || "").toLowerCase()) return false;
                    if (cName === (catToDelete.name || "").toLowerCase()) return false;
                }
                return true;
            });

            localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(updatedList));

            // Agregar a la lista negra permanente
            let deletedList = JSON.parse(localStorage.getItem("demgel_deleted_categories") || "[]");
            [targetLower, catToDelete.slug, catToDelete.id, catToDelete.name].forEach(item => {
                if (item) {
                    const itemLower = item.toString().toLowerCase().trim();
                    if (!deletedList.includes(itemLower)) deletedList.push(itemLower);
                }
            });
            localStorage.setItem("demgel_deleted_categories", JSON.stringify(deletedList));

            // Intentar desactivar en Supabase si el cliente Supabase está presente
            if (typeof DemgelSupabase !== "undefined" && DemgelSupabase.SUPABASE_URL) {
                try {
                    const SUPABASE_URL = "https://dtlzzvdyqhebdsftqckc.supabase.co";
                    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0bHp6dmR5cWhlYmRzZnRxY2tjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjM3NjksImV4cCI6MjEwNTEzOTc2OX0.6N-3Z244wwPw0Hk7A3VjV45OjECW_QVCLzuRoekxmSw";
                    fetch(`${SUPABASE_URL}/rest/v1/categories?slug=eq.${catToDelete.slug || slug}`, {
                        method: "PATCH",
                        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
                        body: JSON.stringify({ is_active: false })
                    }).catch(() => {});
                } catch (e) {}
            }

            try {
                window.dispatchEvent(new Event("storage"));
                window.dispatchEvent(new CustomEvent("demgel:category_updated", { detail: { deletedSlug: slug } }));
            } catch (evErr) {}

            return {
                success: true,
                category: catToDelete,
                message: `Categoría "${catToDelete.name}" eliminada correctamente.`
            };
        } catch (e) {
            console.error("Error al eliminar categoría:", e);
            return { success: false, error: "DELETE_ERROR", message: "Error interno al eliminar la categoría." };
        }
    }

    return {
        getCategories,
        getCategoryBySlug,
        createCategory,
        updateCategory,
        deleteCategory
    };
})();
