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
