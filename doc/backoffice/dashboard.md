# Vue Back-office : Tableau de bord (`DashboardView.vue`)

Cette vue affiche le tableau de bord d'administration avec des indicateurs clés de performance (KPIs) financiers et opérationnels calculés à la volée.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Exclusion des Commandes Annulées** :
    *   Toutes les statistiques excluent systématiquement les commandes dont l'état courant est égal à `6` (PS_OS_CANCELED / Annulé).
2.  **Calcul de la valorisation du stock ("Prix d'achat total")** :
    *   Ce KPI représente le prix d'achat de l'intégralité des produits entrés en stock, vendus ou non.
    *   Formule : `(Quantité en Stock Actuelle + Quantité Vendue) * Prix d'Achat (wholesale_price)`.
3.  **Calcul du "Bénéfice total"** :
    *   Formule : `Ventes HT - Prix d'achat total`.
4.  **Parallélisation des appels API** :
    *   Pour éviter les temps de chargement trop longs, la méthode `fetchData` lance en parallèle la récupération des commandes (`orders`), des produits (`products`) et des stocks disponibles (`stock_availables`) via un `Promise.all`.

---

## 🛠️ Extraits de Code Clés

### Calcul du Prix d'Achat Global & Bénéfice Total Stock
Voici les propriétés calculées Vue (`computed`) réalisant ces agrégats dans `src/view/backoffice/DashboardView.vue` :

```javascript
const totalStockPurchaseHt = computed(function () {
  const wholesalePriceById = {};
  for (let i = 0; i < allProducts.value.length; i++) {
    const p = allProducts.value[i];
    const pid = extractText(p.id);
    wholesalePriceById[pid] = toNumber(extractText(p.wholesale_price));
  }

  const stockQtyById = {};
  for (let i = 0; i < allStocks.value.length; i++) {
    const s = allStocks.value[i];
    const pid = extractText(s.id_product);
    const attrId = extractText(s.id_product_attribute) || '0';
    if (attrId === '0') {
      stockQtyById[pid] = toNumber(extractText(s.quantity));
    }
  }

  const soldQtyById = {};
  for (let i = 0; i < filteredOrders.value.length; i++) {
    const o = filteredOrders.value[i];
    const rows = getOrderRows(o);
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      const pid = extractText(row.product_id);
      if (pid) {
        const qty = toNumber(row.product_quantity);
        soldQtyById[pid] = (soldQtyById[pid] || 0) + qty;
      }
    }
  }

  let total = 0;
  for (let i = 0; i < allProducts.value.length; i++) {
    const p = allProducts.value[i];
    const pid = extractText(p.id);
    const wholesalePrice = wholesalePriceById[pid] || 0;
    const stockQty = stockQtyById[pid] || 0;
    const soldQty = soldQtyById[pid] || 0;
    total += wholesalePrice * (stockQty + soldQty);
  }

  return total;
});

const totalStockProfit = computed(function () {
  return totalSalesHt.value - totalStockPurchaseHt.value;
});
```
