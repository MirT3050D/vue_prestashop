# Service : États de Commandes (`orderStateService.js`)

Ce service spécialisé gère la récupération et l'analyse des statuts de commande (ex: "En cours de livraison", "Livré", "Annulé") définis dans PrestaShop. 

---

## ⚙️ Rôle et Fonctionnement

*   **Récupération des statuts** : S'occupe d'interroger le webservice pour lister tous les états de commandes existants.
*   **Parsing / Mapping** : Comme les statuts PrestaShop contiennent souvent plusieurs langues, ce service génère un mapping (`Map`) très rapide permettant de passer d'un ID de statut à son nom textuel ou à sa couleur (très utile pour l'affichage de badges).

---

## 📘 Guide d'utilisation des fonctions

### `getOrderStates()`
Retourne la liste brute (JSON/XML) de tous les `order_states` disponibles sur la boutique.

### `parseOrderStates(statesArray)`
Prend un tableau d'états brut en argument et retourne un objet contenant deux "Dictionnaires" (`Map`) :
1. `nameMap` : Associe l'ID de l'état (clé) au nom textuel de l'état (valeur).
2. `colorMap` : Associe l'ID de l'état (clé) à sa couleur Hexadécimale associée dans PrestaShop.

**Exemple d'utilisation (dans une vue comme `OrdersView.vue`) :**
```javascript
import { getOrderStates, parseOrderStates, getStateName, getStateColor } from '@/service/orderService'; // Ou orderStateService

const rawStates = await getOrderStates();
const { nameMap, colorMap } = parseOrderStates(rawStates);

// Affiche le nom et la couleur de l'état ID 3
console.log(getStateName(3, nameMap)); // "En cours de préparation"
console.log(getStateColor(3, colorMap)); // "#FF8C00"
```
