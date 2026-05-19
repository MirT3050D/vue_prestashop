# Service : Clients (`customerService.js`)

Ce service expose les API Webservice de PrestaShop pour la gestion des clients de la boutique.

---

## ⚙️ Rôle et Fonctionnement

*   **CRUD Clients** : Gère la création (`createCustomer`), la lecture paginée (`getCustomers`), le détail unitaire (`getCustomer`), la mise à jour des informations (`updateCustomer`) et la suppression (`deleteCustomer`).
*   **Intégration** : Utilisé principalement dans l'espace client pour la gestion du profil, lors de la création automatique de comptes clients pendant l'import CSV des commandes et dans le module d'administration du back-office.

---

## 🛠️ Code Principal

Voici l'implémentation de la gestion des clients dans `src/service/customerService.js` :

```javascript
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

// Récupère la liste des clients
export async function getCustomers(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/customers${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.customers, 'customer');
}

// Récupère le détail d'un client par son ID
export async function getCustomer(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/customers/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.customer || null;
}

// Crée une fiche client
export async function createCustomer(payload) {
    const response = await postXml('/customers', payload);
    return response?.prestashop?.customer || response;
}

// Met à jour les informations d'un client
export async function updateCustomer(id, payload) {
    const response = await putXml(`/customers/${id}`, payload);
    return response?.prestashop?.customer || response;
}

// Supprime un client
export async function deleteCustomer(id) {
    return await deleteXml(`/customers/${id}`);
}
```
