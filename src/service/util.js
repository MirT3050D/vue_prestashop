import { ref } from "vue";

/**
 * Récupère la liste des colonnes affichables pour une page (module) spécifique.
 * Le système est persistant : si l'utilisateur cache une colonne, ce choix est 
 * sauvegardé dans le navigateur (localStorage).
 */
export function getColumnForList(module) {
    // Clé unique de sauvegarde par module (ex: "product_column")
    const local_storage_name = String(module).concat("_column");
    const retour = ref(null); // Variable réactive Vue 3
    
    // 1. Tente de lire les préférences sauvegardées de l'utilisateur
    const storedValue = localStorage.getItem(local_storage_name);
    if (storedValue != null) {
        try {
            // Essaie de parser si c'est un tableau JSON: ["id_product", "name"]
            retour.value = JSON.parse(storedValue);
        } catch (error) {
            // Si c'est juste du texte, on le garde tel quel
            retour.value = storedValue;
        }
    }

    // 2. Formatage : Si c'est une chaîne séparée par des virgules (ex: "id_product, name")
    // on la transforme en véritable tableau ["id_product", "name"]
    if (typeof retour.value === "string" && retour.value.includes(",")) {
        retour.value = retour.value.split(",").map((item) => item.trim());
    }

    // 3. Fallback : Si l'utilisateur n'a aucune préférence (1ère visite)
    if (retour.value == null) {
        // Charge la liste par défaut définie en dur
        retour.value = getDefaultColumnName(module);
        // Et la sauvegarde immédiatement pour les prochaines visites
        localStorage.setItem(local_storage_name, JSON.stringify(retour.value));
    }
    
    console.log("liste des colonnes de", module, " sont :", retour.value);
    return retour.value;
}

/**
 * Dictionnaire contenant les configurations par défaut des tableaux de données.
 * Chaque clé correspond à une entité, et contient la liste des colonnes visibles initialement.
 */
export function getDefaultColumnName(module) {
    const key = String(module).toLowerCase();
    
    // Définition exhaustive des colonnes par défaut pour chaque vue
    const defaults = {
        product: [
            "id_product",
            "image",
            "name",
            "reference",
            "category",
            "price_tax_excluded",
            "price_tax_included",
            "quantity",
            "active",
        ],
        category: [
            "id_category",
            "name",
            "description",
            "products_count",
            "active",
            "position",
        ],
        order: [
            "id_order",
            "reference",
            "customer",
            "total_paid_tax_incl",
            "payment",
            "current_state",
            "date_add",
            "country_name",
        ],
        customer: [
            "id_customer",
            "firstname",
            "lastname",
            "email",
            "total_spent",
            "active",
            "date_add",
            "connect",
        ],
        carrier: [
            "id_carrier",
            "name",
            "logo",
            "delay",
            "active",
            "is_free",
            "position",
        ],
        supplier: [
            "id_supplier",
            "logo",
            "name",
            "products_count",
            "active",
        ],
        manufacturer: [
            "id_manufacturer",
            "logo",
            "name",
            "addresses_count",
            "products_count",
            "active",
        ],
        cart_rule: [
            "id_cart_rule",
            "name",
            "priority",
            "code",
            "quantity",
            "date_to",
            "active",
        ],
        attribute_group: [
            "id_attribute_group",
            "name",
            "values",
            "position",
        ],
        attribute: [
            "id_attribute",
            "value",
            "color",
            "position",
        ],
    };

    // Renvoie la liste trouvée, ou un tableau vide si le module est inconnu
    if (defaults[key]) {
        return defaults[key];
    }

    return [];
}