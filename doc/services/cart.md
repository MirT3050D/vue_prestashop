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
}
```
