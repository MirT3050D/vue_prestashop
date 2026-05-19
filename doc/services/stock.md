# Service : Stocks & Mouvements (`stockService.js`)

Ce service assure le contrôle de l'inventaire physique des produits simples et des déclinaisons, ainsi que la traçabilité des flux (entrées et sorties).

---

## ⚙️ Rôle et Fonctionnement

*   **Lecture des Stocks (`getStockAvailables`)** : Récupère les quantités disponibles associées aux produits ou déclinaisons.
*   **Mise à jour & Ajustement (`updateProductStock`)** :
    *   Recherche l'enregistrement correspondant dans `stock_availables` (la table PrestaShop gérant les quantités virtuelles visibles par le client).
    *   Calcule le delta (`Nouvelle Quantité - Ancienne Quantité`) pour en déduire le sens du mouvement (entrée `+1` ou sortie `-1`).
    *   Met à jour la quantité et génère instantanément une fiche de mouvement de stock (`stock_mvt`) rattachée à l'employé connecté pour assurer une traçabilité totale en back-office.

---

## 🛠️ Code Principal

Voici l'implémentation de la modification de stock et de la traçabilité dans `src/service/stockService.js` :

```javascript
import { getXml, putXml, postXml } from '@/service/api';

// Récupère les stocks disponibles dans PrestaShop
export async function getStockAvailables(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/stock_availables${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.stock_availables, 'stock_available');
}

// Fonction centrale de mise à jour de stock avec écriture du mouvement historique
export async function updateProductStock(productId, attributeId, newQuantity, employeeId = 1) {
    try {
        const stockList = await getStockAvailables(`filter[id_product]=[${productId}]&filter[id_product_attribute]=[${attributeId}]&display=full`);

        if (stockList && stockList.length > 0) {
            const stockToUpdate = stockList[0];
            const stockId = stockToUpdate.id['#text'] || stockToUpdate.id;

            const oldQuantity = parseInt(stockToUpdate.quantity['#text'] || stockToUpdate.quantity, 10) || 0;
            const delta = newQuantity - oldQuantity;

            if (delta === 0) return true; // Aucun ajustement requis

            // 1. Mise à jour de la quantité physique
            stockToUpdate.quantity = newQuantity;
            await putXml(`/stock_availables/${stockId}`, { prestashop: { stock_available: stockToUpdate } });

            // 2. Traçage du mouvement historique
            const sign = delta > 0 ? 1 : -1;
            const physicalQuantity = Math.abs(delta);
            const reasonId = delta > 0 ? 11 : 12; // Codes 11/12 = Ajustement employé +/-

            const now = new Date();
            const dateAdd = now.toISOString().slice(0, 19).replace('T', ' ');

            const movementXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <stock_mvt>
        <id_product>${productId}</id_product>
        <id_product_attribute>${attributeId}</id_product_attribute>
        <id_employee>${employeeId}</id_employee>
        <id_stock>0</id_stock>
        <id_stock_mvt_reason>${reasonId}</id_stock_mvt_reason>
        <physical_quantity>${physicalQuantity}</physical_quantity>
        <sign>${sign}</sign>
        <price_te>0.000000</price_te>
        <date_add>${dateAdd}</date_add>
    </stock_mvt>
</prestashop>`;

            await postXml('/stock_movements', movementXml);
            return true;
        }
        return false;
    } catch (error) {
        console.error("Erreur de mise à jour de stock :", error);
        return false;
    }
}
```
