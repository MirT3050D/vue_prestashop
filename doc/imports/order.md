# Importation : Commandes Historiques (`orderImport.js`)

Ce service importe l'historique des commandes passées à partir d'un fichier CSV.

---

## ⚙️ Fonctionnement et Règles Métier

1.  **Création/Résolution du Client & Adresse** :
    *   Le client est recherché par son e-mail. S'il n'existe pas, un compte est créé à la volée.
    *   Une adresse de livraison par défaut est associée ou créée pour ce client.
2.  **Parsing Strict des Articles (`parseAchat`)** :
    *   La liste d'achats est extraite d'une syntaxe parenthésée : `[(REFERENCE_PRODUIT;QUANTITE;VARIANTE)]`.
    *   Pour chaque article, la référence produit est recherchée. Si une variante est mentionnée (ex: "Bleu"), la déclinaison correspondante (combination) est récupérée.
    *   Le prix HT du catalogue et le taux de taxe sont extraits pour calculer les montants unitaires de la commande.
3.  **Génération du Panier (`/carts`) puis de la Commande (`/orders`)** :
    *   Crée un panier contenant les lignes d'achats identifiées.
    *   Crée la commande PrestaShop en liant le panier et en affectant la date historique du CSV.
4.  **Mise à Jour de la Date Historique & Forçage d'État** :
    *   Puisque PrestaShop génère automatiquement la date de création au jour courant, un appel standard `PUT` modifie la date de commande vers la date du fichier CSV.
    *   Le statut de la commande est forcé via l'historique d'états.
5.  **Mouvements de Stocks Historiques anti-doublons** :
    *   Pour les commandes marquées à l'état "Livré", un mouvement négatif est enregistré dans `stock_movements`.
    *   **Sécurité** : Pour éviter d'écrire des mouvements doublons ou de décrémenter le stock physique inutilement, le service interroge d'abord l'historique des mouvements de la commande pour s'assurer qu'aucun enregistrement identique n'existe déjà.

---

## 🛠️ Code Principal

Voici le code illustrant la détection des doublons de mouvements de stock historique dans `src/service/orderImport.js` :

```javascript
// Logique d'enregistrement du mouvement historique de stock de la commande avec vérification des doublons
async function logOrderMovement(pId, attributeId, quantity, orderId, employeeId, logCallback, customDate = '') {
    try {
        const dateAdd = customDate ? `${customDate} 12:00:00` : new Date().toISOString().slice(0, 19).replace('T', ' ');
        const attrFilter = attributeId ? attributeId : 0;

        // 1. Récupération de l'ID stock_available correspondant
        const stockList = await getXml(`/stock_availables?filter[id_product]=[${pId}]&filter[id_product_attribute]=[${attrFilter}]&display=full`);
        const stocks = normalizeArray(stockList?.prestashop?.stock_availables);
        if (!stocks.length) return;

        const stockAvailableId = String(stocks[0].id?.['#text'] ?? stocks[0].id ?? '0');

        // 2. Éviter les doublons : vérifier si un mouvement identique existe déjà
        try {
            const existingList = await getXml(`/stock_movements?filter[id_order]=[${orderId}]&display=full`);
            const existingArray = normalizeArray(existingList);

            // Recherche d'un mouvement identique (même stock_available, signe négatif et même quantité)
            const duplicate = existingArray.find(m => {
                const mStockId = String(m.id_stock?.['#text'] ?? m.id_stock ?? '');
                const matchesStock = mStockId === String(stockAvailableId);
                const sign = String(m.sign?.['#text'] ?? m.sign ?? '');
                const qty = Number(m.physical_quantity?.['#text'] ?? m.physical_quantity ?? 0);

                return matchesStock && sign === '-1' && qty === Number(quantity);
            });

            if (duplicate) {
                logCallback('info', `Mouvement existant détecté pour commande ${orderId}, produit ${pId} — saut.`);
                return;
            }
        } catch (e) {
            // Poursuivre si la lecture échoue
        }

        // 3. Envoi du mouvement historique négatif (-quantity)
        const reasonConfig = await getPrestaShopConfig('PS_STOCK_CUSTOMER_ORDER_REASON');
        const reasonId = reasonConfig?.value ?? 3;

        const baseXml = `
            <id_order>${orderId}</id_order>
            <id_product>${pId}</id_product>
            <id_product_attribute>${attrFilter}</id_product_attribute>
            <id_employee>${employeeId}</id_employee>
            <id_stock>${stockAvailableId}</id_stock>
            <id_stock_mvt_reason>${reasonId}</id_stock_mvt_reason>
            <physical_quantity>${quantity}</physical_quantity>
            <sign>-1</sign>
            <price_te>0.000000</price_te>
            <date_add>${dateAdd}</date_add>
        `;
        await postXml('/stock_movements', `<prestashop><stock_mvt>${baseXml}</stock_mvt></prestashop>`);
    } catch (e) {
        logCallback('warn', `Impossible de tracer le mouvement : ${e.message}`);
    }
}
```
