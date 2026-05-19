# Service : Catégories (`categoryService.js`)

Ce service fournit l'interface de requêtage pour manipuler la structure des catégories de la boutique.

---

## ⚙️ Rôle et Fonctionnement

*   **CRUD Catégories** : Gère la création (`createCategory`), la mise à jour (`updateCategory`), la récupération (`getCategories`, `getCategory`), et la suppression (`deleteCategory`) d'enregistrements de catégories.
*   **Encapsulation des données** : Comme pour les autres services CRUD, il standardise le format de sortie à l'aide de la fonction utilitaire `normalizeArray` afin de toujours renvoyer des listes (tableaux) exploitables au niveau des templates Vue.

---

## 🛠️ Code Principal

Voici l'implémentation de la gestion des catégories dans `src/service/categoryService.js` :

```javascript
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

// Récupère l'ensemble des catégories
export async function getCategories(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/categories${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.categories, 'category');
}

// Récupère une catégorie précise par son ID
export async function getCategory(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/categories/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.category || null;
}

// Crée une catégorie
export async function createCategory(payload) {
    const response = await postXml('/categories', payload);
    return response?.prestashop?.category || response;
}

// Met à jour une catégorie
export async function updateCategory(id, payload) {
    const response = await putXml(`/categories/${id}`, payload);
    return response?.prestashop?.category || response;
}

// Supprime une catégorie de la base PrestaShop
export async function deleteCategory(id) {
    return await deleteXml(`/categories/${id}`);
}
```
