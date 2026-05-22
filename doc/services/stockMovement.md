# Service : Mouvements de Stock (`stockMovementService.js`)

Ce service spécialisé interagit avec l'API PrestaShop pour lire, créer et analyser l'historique complet des mouvements de stocks (les fameux `stock_movements`). Il est essentiel pour la traçabilité des inventaires.

---

## ⚙️ Rôle et Fonctionnement

*   **Récupération de l'historique** : Extrait la liste des entrées et sorties de stocks physiques.
*   **Identification des raisons (Mvt Reasons)** : Comme pour les états de commandes, ce service gère les ID de motifs de mouvements (ex: ID 3 pour "Commande client", ID 1 pour "Augmentation manuelle").
*   **Suivi détaillé** : Permet au back-office de retracer exactement quel produit a été modifié, quand, et pourquoi.

---

## 📘 Guide d'utilisation des fonctions

### `getStockMovements(params)`
Récupère les mouvements de stock bruts depuis l'API `/stock_movements`. Vous pouvez passer des paramètres de filtres classiques (`filter[id_product]=[1]`).

### `getMvtReasons()`
Récupère la configuration des raisons de mouvements.

### `parseMvtReasons(reasonsData)`
Transforme les raisons de mouvements (XML/JSON de PrestaShop) en un Dictionnaire (`Map`) JavaScript très performant.

**Exemple d'utilisation :**
```javascript
import { getMvtReasons, parseMvtReasons } from '@/service/stockMovementService';

const rawReasons = await getMvtReasons();
const reasonMap = parseMvtReasons(rawReasons);

// reasonMap permet ensuite d'afficher :
// "Commande client" au lieu de juste "Mouvement ID 3" dans le tableau
console.log(reasonMap.get(3)); 
```
