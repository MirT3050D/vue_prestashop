# Vue Front-office : Accueil & Catalogue (`HomeView.vue`)

Cette vue sert de page d'accueil du catalogue de vente. Elle liste les produits de la boutique avec une recherche multicritère et des badges promotionnels temporels.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Filtrage Multicritère API (avec Debounce)** :
    *   Permet de filtrer en temps réel par : Nom (recherche partielle), Catégorie par défaut et tranche de prix (Min et Max).
    *   **Debounce** : Un délai de `500 ms` est appliqué aux saisies de l'utilisateur pour regrouper les frappes et éviter de multiplier inutilement les requêtes HTTP vers l'API.
2.  **Badges Temporels Dynamiques** :
    *   Le script calcule la différence en jours entre la date actuelle et la date de disponibilité (`available_date`) du produit pour lui attribuer un statut :
        *   `À VENIR` : Si le produit possède une date de disponibilité dans le futur.
        *   `HOT` : Si le produit a été rendu disponible depuis moins de 24 heures.
        *   `NEW` : Si le produit a été rendu disponible entre 1 et 7 jours.

---

## 🛠️ Extraits de Code Clés

Voici le mécanisme de calcul et d'affichage des badges dynamiques dans `src/view/frontoffice/HomeView.vue` :

```javascript
// Analyse de la date de disponibilité pour attribuer les badges promotionnels
let badge = null;

if (product.available_date && product.available_date !== '0000-00-00') {
    let dateString = typeof product.available_date === 'object'
        ? product.available_date['#text']
        : product.available_date;

    if (dateString && dateString !== '0000-00-00') {
        let now = new Date();
        let addedDate = new Date(dateString.replace(' ', 'T'));

        if (!isNaN(addedDate.getTime())) {
            let diffDays = (now - addedDate) / (1000 * 60 * 60 * 24);

            // 1. Date dans le futur
            if (diffDays < 0) {
                badge = 'À VENIR';
            }
            // 2. Dispo depuis moins de 24h
            else if (diffDays >= 0 && diffDays <= 1) {
                badge = 'HOT';
            }
            // 3. Dispo entre 1 et 7 jours
            else if (diffDays > 1 && diffDays <= 7) {
                badge = 'NEW';
            }
        }
    }
}
product.badge = badge;
```
