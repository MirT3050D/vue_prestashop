# Service : Utilitaires PrestaShop (`prestashopUtils.js`)

Ce service centralise toutes les fonctions de formatage et de parsing indispensables pour manipuler les données brutes renvoyées par l'API XML de PrestaShop. Étant donné que le XML est parfois imprévisible (un seul élément renvoie un objet, plusieurs renvoient un tableau, les textes sont dans `CDATA`), ces utilitaires "nettoient" la donnée.

---

## ⚙️ Rôle et Fonctionnement

*   **Extraction de textes et IDs** : Navigue de manière sécurisée dans les objets XML (ex: `node['#text']` ou `node.id`) pour éviter les erreurs `undefined`.
*   **Normalisation de tableaux** : Force les nœuds uniques à devenir des tableaux (très utile quand l'API renvoie parfois 1 seul produit, parfois 10).
*   **Formatage visuel** : Permet de formater correctement l'argent (`formatMoney`) et les dates (`formatDate`).

---

## 📘 Guide d'utilisation des fonctions

### `extractText(value)`
La fonction la plus utilisée du projet ! PrestaShop renvoie très souvent les textes sous la forme : `{ "#text": "Mon texte" }`. Cette fonction extrait le texte pur, que la valeur soit un objet, un nombre, ou un tableau.

**Exemple :**
```javascript
import { extractText } from '@/service/prestashopUtils';

const nomBrut = product.name; // Peut-être un objet { "#text": "T-Shirt" }
const nomPropre = extractText(nomBrut); // Retourne "T-Shirt"
```

### `normalizeArray(node)`
Si PrestaShop renvoie une seule image, c'est un Objet. S'il y en a deux, c'est un Array. `normalizeArray` force le retour en Array pour pouvoir faire un `.map()` ou `.forEach()` sans erreur.

**Exemple :**
```javascript
import { normalizeArray } from '@/service/prestashopUtils';

// Même s'il n'y a qu'une seule déclinaison, ce sera un tableau de taille 1
const declinaisons = normalizeArray(response.prestashop.combinations);
```

### `getLangText(field)` / `getLanguageText(node)`
PrestaShop gère le multi-langue en renvoyant : `{ language: [ { "@_id": "1", "#text": "Français" }, { "@_id": "2", "#text": "English" } ] }`. Ces fonctions extraient directement le texte de la première langue disponible.

### `formatMoney(value)` et `formatDate(value)`
Utilitaires d'affichage pour les vues (Front-office ou Back-office).

**Exemple :**
```javascript
import { formatMoney, formatDate } from '@/service/prestashopUtils';

console.log(formatMoney(15.5)); // "15.50"
console.log(formatDate("2023-10-01 12:00:00")); // "1 octobre 2023 à 12:00"
```
