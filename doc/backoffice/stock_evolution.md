# Vue Back-office : Historique des Mouvements de Stock (`StockEvolution.vue`)

Cette vue présente une chronologie filtrable et détaillée de tous les mouvements d'inventaire physiques enregistrés dans PrestaShop.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Récupération de l'Historique (`stock_movements`)** :
    *   Charge l'intégralité des lignes de mouvements de stock. Les trie par date d'insertion décroissante pour afficher les événements les plus récents en premier.
2.  **Résolution des Références Croisées** :
    *   PrestaShop stocke uniquement l'ID du produit ou de la déclinaison dans la fiche mouvement. La vue résout ces IDs par rapport aux listes de produits et déclinaisons chargées en cache mémoire pour afficher le nom compréhensible de l'article (ex: "T-Shirt Rouge L").
3.  **Filtres Avancés (Article & Dates)** :
    *   L'utilisateur peut filtrer les mouvements sur un produit spécifique.
    *   Deux sélecteurs de dates (`Du` et `Au`) permettent de cibler un intervalle précis. La date de début est réglée à `00:00:00` et la date de fin à `23:59:59` pour inclure la totalité des mouvements des journées charnières.
4.  **Signalisation des Flux (Code Couleur)** :
    *   Les entrées physiques de stock (bouton d'ajustement positif ou import initial) apparaissent avec un indicateur vert (`🟢 Entrée`).
    *   Les sorties physiques (bouton d'ajustement négatif ou livraison de commande client) apparaissent avec un indicateur rouge (`🔴 Sortie`).

---

## 🛠️ Extraits de Code Clés

Voici le mécanisme de filtrage dynamique par article et par intervalle temporel dans `src/view/backoffice/StockEvolution.vue` :

```javascript
const filteredMovements = computed(() => {
    let result = movements.value;

    // 1. Filtrage par produit
    if (selectedProductId.value !== 'all') {
        result = result.filter(mvt => {
            let mvtId = safeValue(mvt.id_product);
            if (!mvtId || mvtId === '0') {
                const stockInfo = getMovementStockInfo(mvt);
                mvtId = stockInfo ? safeValue(stockInfo.id_product) : '';
            }
            if ((!mvtId || mvtId === '0') && isLegacyImportMovement(mvt)) {
                mvtId = safeValue(mvt.id_order);
            }
            return String(mvtId) === String(selectedProductId.value);
        });
    }

    // 2. Filtrage "Date de début" (Du) dès minuit
    if (startDate.value) {
        const start = new Date(startDate.value);
        start.setHours(0, 0, 0, 0);
        result = result.filter(mvt => {
            const mvtDate = new Date(safeValue(mvt.date_add));
            return mvtDate >= start;
        });
    }

    // 3. Filtrage "Date de fin" (Au) jusqu'à la dernière milliseconde de la journée
    if (endDate.value) {
        const end = new Date(endDate.value);
        end.setHours(23, 59, 59, 999);
        result = result.filter(mvt => {
            const mvtDate = new Date(safeValue(mvt.date_add));
            return mvtDate <= end;
        });
    }

    return result;
});
```
