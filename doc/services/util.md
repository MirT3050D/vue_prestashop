# Service : Utilitaires & Mise en Page (`util.js`)

Ce service contient les fonctions d'assistance (helpers) partagées et de configuration de mise en page réactive pour les différents tableaux de l'application.

---

## ⚙️ Rôle et Fonctionnement

*   **Gestion des colonnes personnalisées (`getColumnForList`)** :
    *   Les utilisateurs du back-office peuvent choisir quelles colonnes afficher pour chaque tableau (Produits, Commandes, Clients, etc.).
    *   Cette sélection est lue et enregistrée dans le `localStorage` du navigateur.
    *   Si aucune sélection n'a été faite, le service applique la configuration par défaut (`getDefaultColumnName`).

---

## 🛠️ Code Principal

Voici l'implémentation de la configuration dynamique des colonnes de tableau dans `src/service/util.js` :

```javascript
import { ref } from "vue";

// Retourne la liste des colonnes actives pour un module donné (sauvegarde persistée dans localStorage)
export function getColumnForList(module) {
    const local_storage_name = String(module).concat("_column");
    const retour = ref(null);
    const storedValue = localStorage.getItem(local_storage_name);
    
    if (storedValue != null) {
        try {
            retour.value = JSON.parse(storedValue);
        } catch (error) {
            retour.value = storedValue;
        }
    }

    if (typeof retour.value === "string" && retour.value.includes(",")) {
        retour.value = retour.value.split(",").map((item) => item.trim());
    }

    // Si aucune colonne n'est encore configurée, on prend les colonnes par défaut
    if (retour.value == null) {
        retour.value = getDefaultColumnName(module);
        localStorage.setItem(local_storage_name, JSON.stringify(retour.value));
    }
    
    return retour.value;
}

// Renvoie la structure par défaut des colonnes d'un module
export function getDefaultColumnName(module) {
    const key = String(module).toLowerCase();
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
        ]
        // ... autres modules
    };

    return defaults[key] || [];
}
```
