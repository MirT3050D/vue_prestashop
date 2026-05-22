# Service : Paniers (`cartService.js`)

Ce service orchestre la création, la lecture et la mise à jour des paniers de la boutique auprès du Webservice PrestaShop, ainsi que la réconciliation des sessions d'achats.

---

## ⚙️ Rôle et Fonctionnement

*   **Persistance API (`/carts`)** : Crée et met à jour des enregistrements de paniers persistés dans PrestaShop qui lient l'ID client aux articles sélectionnés et aux adresses de livraison.
*   **Réconciliation des paniers non payés (`getUnpaidCarts`)** : Interroge les commandes du client pour en déduire la liste de tous ses paniers créés n'ayant jamais été convertis en ventes fermes.
*   **Fusion des paniers (`mergeUnpaidCarts`)** : Parcourt et regroupe tous les paniers orphelins d'un client connecté pour en fusionner les articles dans un panier unifié, tout en nettoyant les anciens paniers obsolètes de la base PrestaShop.

---

## 🛠️ Code Principal

Voici l'implémentation de la gestion et de la fusion des paniers dans `src/service/cartService.js` :

```javascript
import { getXml, postXml, putXml, deleteXml } from '@/service/api';
import { getOrders } from '@/service/orderService';

function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

// Récupère tous les paniers non convertis en commande
export async function getUnpaidCarts(customerId) {
    if (!customerId) return [];

    try {
        const orders = await getOrders('filter[id_customer]=[' + customerId + ']&display=[id,id_cart]');
        const paidCartIds = orders.map(o => String(o.id_cart?.['#text'] || o.id_cart || ''));

        const allCarts = await getCarts('filter[id_customer]=[' + customerId + ']&display=full');
        return allCarts.filter(cart => {
            const cartId = String(cart.id?.['#text'] || cart.id || '');
            return !paidCartIds.includes(cartId);
        });
    } catch (error) {
        console.error("Erreur paniers non payés :", error);
        return [];
    }
}

// Fusionne les paniers non payés d'un client
export async function mergeUnpaidCarts(customerId, addressId) {
    const unpaidCarts = await getUnpaidCarts(customerId);
    if (unpaidCarts.length <= 1) return null;

    const mergedProducts = {};

    for (let i = 0; i < unpaidCarts.length; i++) {
        const cart = unpaidCarts[i];
        if (cart.associations?.cart_rows?.cart_row) {
            let rows = cart.associations.cart_rows.cart_row;
            if (!Array.isArray(rows)) rows = [rows];

            for (let j = 0; j < rows.length; j++) {
                const row = rows[j];
                const prodId = row.id_product?.['#text'] || row.id_product;
                const attrId = row.id_product_attribute?.['#text'] || row.id_product_attribute || 0;
                const qty = parseInt(row.quantity?.['#text'] || row.quantity, 10) || 0;

                if (prodId) {
                    const productKey = prodId + '_' + attrId;
                    if (mergedProducts[productKey]) {
                        mergedProducts[productKey].quantity += qty;
                    } else {
                        mergedProducts[productKey] = { id_product: prodId, id_product_attribute: attrId, quantity: qty };
                    }
                }
            }
        }
    }

    let cartRowsXml = '';
    const keys = Object.keys(mergedProducts);
    for (let k = 0; k < keys.length; k++) {
        const item = mergedProducts[keys[k]];
        cartRowsXml += `
            <cart_row>
                <id_product>${item.id_product}</id_product>
                <id_product_attribute>${item.id_product_attribute}</id_product_attribute>
                <id_address_delivery>${addressId}</id_address_delivery>
                <quantity>${item.quantity}</quantity>
            </cart_row>`;
    }

    const cartXmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
    <prestashop>
        <cart>
            <id_customer>${customerId}</id_customer>
            <id_address_delivery>${addressId}</id_address_delivery>
            <id_address_invoice>${addressId}</id_address_invoice>
            <id_currency>1</id_currency>
            <id_lang>1</id_lang>
            <associations>
                <cart_rows>${cartRowsXml}</cart_rows>
            </associations>
        </cart>
    </prestashop>`;

    const newCart = await postXml('/carts', cartXmlPayload);

    // Suppression des anciens paniers obsolètes
    for (let m = 0; m < unpaidCarts.length; m++) {
        const oldCartId = unpaidCarts[m].id?.['#text'] || unpaidCarts[m].id;
        if (oldCartId) await deleteXml(`/carts/${oldCartId}`);
    }

    return newCart?.prestashop?.cart || newCart;
```

---

## 🚀 Nouvelles fonctions (Refactoring)

Dans le but de simplifier les composants Vue, toute la logique complexe de synchronisation entre le `localStorage` local et l'API PrestaShop a été extraite dans le service.

### 1. `syncAndGetLatestCart(customerId)`
Permet de récupérer le panier le plus récent d'un client (non payé) et le convertit directement dans le format de tableau simple attendu par le panier local de l'application (c'est-à-dire une liste de `cartItems`).

**Exemple d'utilisation :**
```javascript
import { syncAndGetLatestCart } from '@/service/cartService';

const apiCartItems = await syncAndGetLatestCart(customerData.id);
if (apiCartItems && apiCartItems.length > 0) {
    // On remplace le panier local par celui récupéré depuis le compte en ligne
    initialCart = apiCartItems; 
}
```

### 2. `clearAllUnpaidCarts(customerId)`
Permet de nettoyer la base de données PrestaShop en supprimant TOUS les paniers non payés liés à un client. Très utile lorsqu'on veut vider entièrement le panier d'un client (par exemple via le bouton "Vider mon panier").

**Exemple d'utilisation :**
```javascript
import { clearAllUnpaidCarts } from '@/service/cartService';

function viderPanier() {
    // 1. Vider le state / localStorage
    panier.value = [];
    
    // 2. Supprimer les brouillons sur l'API
    if (customerData?.id) {
        clearAllUnpaidCarts(customerData.id);
    }
}
```
