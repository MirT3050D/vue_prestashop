# Service : Produits & Déclinaisons (`productService.js`)

Ce service sert d'interface de requêtage pour extraire et modifier le catalogue de produits (produits simples et déclinaisons de variantes).

---

## ⚙️ Rôle et Fonctionnement

*   **CRUD Produits** : Permet la création (`createProduct`), la modification (`updateProduct`), la suppression (`deleteProduct`) et la récupération d'un ou plusieurs produits (`getProduct`, `getProducts`).
*   **Résolution des Variantes** :
    *   `getCombinations` : Extrait toutes les combinaisons associées à un produit en filtrant par l'identifiant parent.
    *   `getProductOptionValues` / `getProductOptions` : Permet de charger en masse les noms et étiquettes d'options (ex: Taille, Couleur) et leurs valeurs (ex: L, XL, Bleu, Vert) à partir de filtres d'IDs (séparés par un symbole pipe `|`).

---

## 🛠️ Code Principal

Voici l'implémentation de la gestion des produits dans `src/service/productService.js` :

```javascript
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

// Extrait la liste des produits
export async function getProducts(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/products${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.products, 'product');
}

// Extrait un produit par son ID
export async function getProduct(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/products/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.product || null;
}

// Récupère toutes les déclinaisons rattachées à un produit
export async function getCombinations(productId) {
    const response = await getXml(`/combinations?display=full&filter[id_product]=[${productId}]`);
    return normalizeArray(response?.prestashop?.combinations, 'combination');
}

// Récupère en bloc les valeurs d'attributs (ex: ids = '1|2|3')
export async function getProductOptionValues(ids) {
    const response = await getXml(`/product_option_values?display=full&filter[id]=[${ids}]`);
    return normalizeArray(response?.prestashop?.product_option_values, 'product_option_value');
}
```

---

## 🚀 Nouvelles fonctions (Refactoring)

Suite au nettoyage du code de la fiche produit, de nouvelles fonctions avancées ont été ajoutées pour encapsuler toute la logique métier complexe :

### 1. `getFullProductDetails(productId)`
Cette fonction s'occupe de faire TOUS les appels API nécessaires au chargement d'un produit (produit de base, taxes, combinaisons, valeurs d'options) et renvoie un objet structuré, prêt à être utilisé par la Vue.

**Exemple d'utilisation dans un composant :**
```javascript
import { getFullProductDetails } from '@/service/productService';

const details = await getFullProductDetails(route.params.id);
if (details) {
    product.value = details.product;
    productTaxRate.value = details.taxRate;
    productCombinations.value = details.combinations; // Array brut
    variants.value = details.variants; // Tableau structuré (ex: Taille avec L, XL)
    selectedOptions.value = details.defaultSelectedOptions; // Auto-sélection de la première variante dispo
}
```

### 2. `getCombinationImageId(defaultImageId, productCombinations, selectedOptions)`
Permet de trouver automatiquement l'ID de l'image correspondante à la combinaison sélectionnée par l'utilisateur.

**Exemple d'utilisation :**
```javascript
import { getCombinationImageId } from '@/service/productService';

// selectedOptions ressemble à { "Taille": "2", "Couleur": "5" }
const imageId = getCombinationImageId(
    product.id_default_image, 
    productCombinations.value, 
    selectedOptions.value
);

// Ensuite on charge l'image : `/images/products/${productId}/${imageId}`
```

### 3. `getAvailableValuesForVariant(variant, allVariants, productCombinations, selectedOptions)`
Cette fonction retourne uniquement les valeurs (ex: les couleurs) qui sont réellement compatibles avec les autres options déjà sélectionnées (ex: la taille). Elle évite de proposer une variante qui n'existe pas en stock.

**Exemple d'utilisation :**
```javascript
import { getAvailableValuesForVariant } from '@/service/productService';

// S'utilise souvent dans le template Vue pour griser/cacher les boutons
function getAvailableValues(variantGroup) {
    return getAvailableValuesForVariant(
        variantGroup, 
        variants.value, 
        productCombinations.value, 
        selectedOptions.value
    );
}
```
