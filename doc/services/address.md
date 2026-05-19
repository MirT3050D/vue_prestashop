# Service : Adresses (`addressService.js`)

Ce service fournit les méthodes d'accès et d'écriture pour la gestion des adresses postales des clients dans PrestaShop.

---

## ⚙️ Rôle et Fonctionnement

*   **CRUD Complet** : Gère la création (`createAddress`), la lecture (`getAddresses`, `getAddress`), la mise à jour (`updateAddress`) et la suppression (`deleteAddress`) de fiches adresses.
*   **Filtre Client (`getCustomerAddresses`)** : Permet de cibler uniquement les adresses appartenant à un identifiant client donné pour les proposer dans le récapitulatif du tunnel d'achat.
*   **Normalisation** : Utilise une fonction utilitaire interne `normalizeArray` pour garantir que les retours d'API contenant une seule adresse soient toujours encapsulés dans un tableau JavaScript (`Array`), simplifiant ainsi les boucles de rendu Vue.js (`v-for`).

---

## 🛠️ Code Principal

Voici l'implémentation de la gestion des adresses dans `src/service/addressService.js` :

```javascript
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

// Récupère toutes les adresses selon des paramètres optionnels
export async function getAddresses(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/addresses${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.addresses, 'address');
}

// Filtre les adresses d'un client spécifique
export async function getCustomerAddresses(customerId) {
    return await getAddresses(`display=full&filter[id_customer]=[${customerId}]`);
}

// Crée une nouvelle adresse
export async function createAddress(payload) {
    const response = await postXml('/addresses', payload);
    return response?.prestashop?.address || response;
}

// Met à jour une adresse existante
export async function updateAddress(id, payload) {
    const response = await putXml(`/addresses/${id}`, payload);
    return response?.prestashop?.address || response;
}

// Supprime une adresse
export async function deleteAddress(id) {
    return await deleteXml(`/addresses/${id}`);
}
```
