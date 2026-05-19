# Vue Front-office : Tunnel de Commande (`CheckoutView.vue`)

Cette vue gère le tunnel de commande (Checkout) en validant le panier, l'adresse de livraison, en créant les entités de panier/commande dans PrestaShop et en modifiant les stocks physiques.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Validation finale des stocks** :
    *   Avant de valider la commande, le script réinterroge les quantités de stock réelles en base de données pour chaque article présent dans le panier pour interdire la commande en cas de rupture de stock de dernière minute.
2.  **Création à la volée de l'adresse** :
    *   Si le client possède déjà une adresse, elle est pré-remplie. Sinon, le script crée automatiquement une nouvelle adresse associée au compte client dans PrestaShop.
3.  **Enregistrement du Panier (`/carts`) puis de la Commande (`/orders`)** :
    *   Crée d'abord un panier de commande via l'API.
    *   Valide et enregistre la commande client en associant l'ID panier généré.
4.  **Décrémentation physique & écriture du mouvement de stock** :
    *   Une fois la commande créée, le script décrémente directement les quantités dans `stock_availables`.
    *   **Hack de traçabilité** : Écrit un mouvement dans `stock_movements` en stockant l'ID produit dans le champ `id_order` et l'ID de déclinaison dans le champ `id_supply_order`. Ce hack permet à la vue `StockEvolution.vue` de récupérer les noms d'articles et variantes à la volée sans devoir modifier la structure interne de l'API standard.

---

## 🛠️ Extraits de Code Clés

Voici le script réalisant la mise à jour des stocks et l'écriture de mouvement associé dans `src/view/frontoffice/CheckoutView.vue` :

```javascript
async function forceUpdateStockAvailable(stockAvailable, newQty) {
    const stId = extractText(stockAvailable.id);
    const stProductId = extractText(stockAvailable.id_product);
    let stAttrId = extractText(stockAvailable.id_product_attribute) || '0';

    const stockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <prestashop><stock_available>
        <id><![CDATA[${stId}]]></id>
        <id_product><![CDATA[${stProductId}]]></id_product>
        <id_product_attribute><![CDATA[${stAttrId}]]></id_product_attribute>
        <id_shop><![CDATA[1]]></id_shop>
        <id_shop_group><![CDATA[0]]></id_shop_group>
        <quantity><![CDATA[${newQty}]]></quantity>
        <depends_on_stock><![CDATA[0]]></depends_on_stock>
        <out_of_stock><![CDATA[2]]></out_of_stock>
        <location><![CDATA[]]></location>
    </stock_available></prestashop>`;

    await putXml(`/stock_availables/${stId}`, stockXml);
}

async function decrementStock(pId, attributeId, quantity, orderId) {
    try {
        const attrFilter = attributeId ? attributeId : 0;
        const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${pId}]&filter[id_product_attribute]=[${attrFilter}]&display=full`);
        let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

        if (stockAvailable) {
            if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];
            const oldQty = parseInt(extractText(stockAvailable.quantity), 10) || 0;
            const newQty = oldQty - quantity;

            // Décrémentation physique du stock PrestaShop
            await forceUpdateStockAvailable(stockAvailable, newQty);

            // Traçabilité personnalisée pour l'Historique de Mouvements du Back-office
            const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const baseXml = `
                <id_order><![CDATA[${pId}]]></id_order>
                <id_supply_order><![CDATA[${attrFilter}]]></id_supply_order>
                <id_employee><![CDATA[1]]></id_employee>
                <id_stock><![CDATA[0]]></id_stock>
                <id_stock_mvt_reason><![CDATA[3]]></id_stock_mvt_reason>
                <physical_quantity><![CDATA[${quantity}]]></physical_quantity>
                <sign><![CDATA[0]]></sign>
                <price_te><![CDATA[0.000000]]></price_te>
                <date_add><![CDATA[${dateAdd}]]></date_add>
            `;
            await postXml('/stock_movements', `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop><stock_mvt>${baseXml}</stock_mvt></prestashop>`);
        }
    } catch (e) {
        console.warn(`[checkout] Erreur décrémentation stock : ${e.message}`);
    }
}
```
