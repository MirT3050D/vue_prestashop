# Service : Gestion Locale du Panier (`cartLocalService.js`)

Ce service est responsable de la gestion du panier du côté du navigateur (dans le `localStorage`). Contrairement à `cartService.js` qui communique avec l'API PrestaShop, ce service gère le panier temporaire et local de l'utilisateur (qu'il soit connecté ou simple visiteur).

---

## ⚙️ Rôle et Fonctionnement

*   **Persistance Navigateur** : Sauvegarde, récupère et vide les articles du panier dans le `localStorage` pour ne pas les perdre au rechargement de la page.
*   **Enrichissement** (`enrichCartItem`) : Lors de l'ajout d'un produit brut (juste l'ID et la quantité), le service va interroger l'API pour récupérer le nom, le prix, la taxe et l'image exacte de l'article pour un affichage propre dans `PanierView.vue`.
*   **Calculs** : Fournit des fonctions prêtes à l'emploi pour calculer les totaux HT et TTC du panier en cours.
*   **Fusion Anonyme vers Utilisateur** : Permet de basculer un panier commencé en mode "visiteur" vers le compte d'un "client" dès qu'il se connecte.

---

## 📘 Guide d'utilisation des fonctions

### `getCart(customerId)` & `saveCart(customerId, items)`
Récupère ou sauvegarde un tableau d'articles (`cartItems`) dans le navigateur. La clé dépend du client (visiteur ou connecté).

**Exemple :**
```javascript
import { getCart, saveCart } from '@/service/cartLocalService';

// Récupérer le panier actuel
let items = getCart(customer.id);

// Ajouter un produit
items.push({ id_product: "12", quantity: 1 });

// Sauvegarder la nouvelle liste
saveCart(customer.id, items);
```

### `enrichCartItem(item)`
Très utile ! Si vous n'avez que l'ID du produit dans votre panier, cette fonction récupère toutes ses métadonnées (nom, prix HT, taux de taxe, image).

**Exemple :**
```javascript
import { enrichCartItem } from '@/service/cartLocalService';

let simpleItem = { id_product: "5", id_product_attribute: "19", quantity: 2 };
let fullItem = await enrichCartItem(simpleItem);

// fullItem contiendra désormais: { name: "Robe d'été", price: 15.5, image: "url...", taxRate: 20, ... }
```

### `computeTotalHt(items)` & `computeTotalTtc(items)`
Fonctions d'aide pour calculer le montant total du panier, en itérant sur les quantités et les prix. Elles retournent une chaîne de caractères formatée (ex: `"45.90"`).

### `mergeAnonymousToUser(anonymousId, userId)`
Appelée généralement après la connexion réussie d'un client. Si le client a rempli son panier en tant que visiteur, cette fonction transfère tout le contenu dans son "vrai" panier de compte et additionne les quantités en cas de doublons.
