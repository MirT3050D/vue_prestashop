# stockMovementService.js — Explications détaillées (Service)

## 1. Résolution des informations de stock

**Explication :**
La fonction `getMovementStockInfo` récupère les informations de stock associées à un mouvement à partir de la liste des stocks disponibles.

**Code :**
```js
export function getMovementStockInfo(mvt, stockAvailables) { /* ... */ }
```

---

## 2. Décodage des noms produits et variantes

**Explication :**
Les fonctions `getMovementProductName` et `getMovementVariantName` extraient le nom du produit et de la déclinaison associés à un mouvement, en gérant les cas particuliers (import legacy, etc.).

**Code :**
```js
export function getMovementProductName(mvt, products, stockAvailables) { /* ... */ }
export function getMovementVariantName(mvt, combinations, stockAvailables) { /* ... */ }
```

---

## 3. Filtrage des mouvements

**Explication :**
La fonction `filterMovements` filtre les mouvements selon l'article, la date, etc.

**Code :**
```js
export function filterMovements(movements, selectedProductId, startDate, endDate, stockAvailables) { /* ... */ }
```
