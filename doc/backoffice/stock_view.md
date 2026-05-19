# Vue Back-office : Grille de Modification de Stock (`StockView.vue`)

Cette vue propose un tableau de contrôle interactif pour consulter et modifier rapidement les niveaux d'inventaire de la boutique.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Indicateurs de Quantité Avancés** :
    *   **Quantité Physique** : Le stock brut configuré dans PrestaShop.
    *   **Quantité Réservée** : Déduite à la volée en comptabilisant les articles présents dans les commandes au statut "Paiement accepté" (ID 2).
    *   **Quantité Disponible** : Le stock réel disponible à la vente (`Physique - Réservée`).
2.  **Filtrage du Produit Simple Parent** :
    *   PrestaShop crée par défaut une ligne globale de stock disponible avec `id_product_attribute = 0` pour chaque produit. Si le produit possède des déclinaisons (Taille, Couleur), cette ligne "0" fausse les calculs de totaux cumulés.
    *   Le script identifie les produits déclinés et filtre ces lignes globales orphelines pour ne garder que les déclinaisons réelles.
3.  **Ajustement de Stock Unitaire** :
    *   L'administrateur peut modifier manuellement la quantité d'une ligne et cliquer sur "Sauvegarder". Le script calcule la différence de quantité et envoie une requête d'écriture de mouvement de stock (`stock_mvt`) avec la raison correspondante (Ajustement Positif ou Négatif).

---

## 🛠️ Extraits de Code Clés

Voici la récupération croisée des commandes payées et le calcul des stocks réservés et filtrés dans `src/view/backoffice/StockView.vue` :

```javascript
// 1. Récupération des commandes payées (Statut 2)
let paidOrders = [];
try {
    paidOrders = await getOrders({ display: 'full', 'filter[current_state]': '[2]' });
} catch (e) {
    paidOrders = [];
}

// 2. Constitution de la carte des articles réservés
const reservedMap = {};
for (let i = 0; i < paidOrders.length; i++) {
    const order = paidOrders[i];
    const rows = order?.associations?.order_rows?.order_row || [];
    const rowList = Array.isArray(rows) ? rows : [rows];

    for (let j = 0; j < rowList.length; j++) {
        const row = rowList[j];
        const productId = extractId(row.product_id);
        const attrId = extractId(row.product_attribute_id) || '0';
        if (!productId) continue;
        const qty = parseInt(extractId(row.product_quantity), 10) || 0;
        const key = `${productId}:${attrId}`;
        reservedMap[key] = (reservedMap[key] || 0) + qty;
    }
}

// 3. Filtrage de la ligne globale 0 si le produit possède des variantes
const productsWithVariants = new Set();
stocksList.forEach(stock => {
    if (extractId(stock.id_product_attribute) !== '0') {
        productsWithVariants.add(extractId(stock.id_product));
    }
});

// Dans la boucle de constitution des lignes :
if (productsWithVariants.has(pId) && attrId === '0') {
    continue; // Ignore la ligne globale doublon
}
```
