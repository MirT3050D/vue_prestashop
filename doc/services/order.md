# Service : Commandes & États (`orderService.js` & `orderStateService.js`)

Ces services interopèrent pour gérer le cycle de vie des ventes (commandes, facturation, suivi et changement d'état).

---

## ⚙️ Rôle et Fonctionnement

*   **Gestion des Commandes** : Permet la création (`createOrder`), la mise à jour (`updateOrder`) et le listing complet des commandes.
*   **Changement d'État par l'Historique (`updateOrderStatus`)** :
    *   PrestaShop requiert la création d'un enregistrement dans `/order_histories` pour changer proprement l'état d'une commande (ex: passage de "Paiement accepté" à "Livré"). Faire un PUT direct sur la commande perturbe les modules natifs et les envois de mails.
    *   **Endpoint Personnalisé (`/custom_order_state`)** : Pour forcer des états complexes et contourner les blocages du webservice natif lors de l'intégration des commandes historiques CSV, le service envoie une requête POST spécifique vers un contrôleur personnalisé du site.

---

## 🛠️ Code Principal

Voici l'implémentation de la logique de mise à jour d'état de commande issue de `src/service/orderService.js` :

```javascript
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

// Récupère l'ensemble des commandes
export async function getOrders(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/orders${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.orders, 'order');
}

// Récupère les états disponibles dans PrestaShop
export async function getOrderStates(params = 'display=full') {
    const response = await getXml(`/order_states?${params}`);
    return normalizeArray(response?.prestashop?.order_states, 'order_state');
}

// Met à jour l'état d'une commande via la création d'un historique
export async function updateOrderStatus(orderId, newStateId, options = {}) {
    const stateId = String(newStateId);
    
    // Les états Livré (5) et Annulé (6) utilisent le contrôleur d'écriture personnalisé
    const useCustomEndpoint = stateId === '5' || stateId === '6';

    if (useCustomEndpoint) {
        const { employeeId = 0, date = '' } = options;
        const payload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <manual_order_state>
        <id_order>${orderId}</id_order>
        <id_order_state>${newStateId}</id_order_state>
        <id_employee>${employeeId}</id_employee>
        <date>${date}</date>
    </manual_order_state>
</prestashop>`;

        return await postXml('/custom_order_state', payload);
    }

    // Processus de changement d'état classique PrestaShop
    const payload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <order_history>
        <id_order>${orderId}</id_order>
        <id_order_state>${newStateId}</id_order_state>
    </order_history>
</prestashop>`;

    return await postXml('/order_histories', payload);
```

---

## 🚀 Fonctionnalités avancées (Détails des commandes)

Lorsqu'on récupère une commande complète (avec `display=full`), l'API PrestaShop inclut tous les produits achetés sous forme de liste brute. Il est parfois difficile de parser cette liste proprement.

Pour vous simplifier la vie, la fonction `getOrderRows(order)` du service `prestashopUtils.js` gère automatiquement la normalisation des détails de la commande.

### Extraire les produits (lignes de commande)
Si vous voulez afficher la liste des produits dans une vue de commandes (comme dans `OrdersView.vue` ou `OrderListView.vue`), voici comment faire :

**Exemple d'utilisation :**
```javascript
import { getOrderRows, extractText } from '@/service/prestashopUtils';

// order est un objet commande issu de getOrders()
const products = getOrderRows(order);

// products est maintenant un tableau (Array) propre, même s'il n'y a qu'un seul produit
products.forEach(row => {
    const nomProduit = extractText(row.product_name);
    const quantite = extractText(row.product_quantity);
    const prix = extractText(row.unit_price_tax_incl);
    
    console.log(`Produit: ${nomProduit}, Qté: ${quantite}, Prix unitaire: ${prix}`);
});
```

Cette méthode est très utile pour implémenter des fonctionnalités comme **"Voir détails de la commande"** ou pour **dupliquer une ancienne commande** dans le panier actuel !
