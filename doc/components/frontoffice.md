# Composants du Front-office (`vue/src/components/frontoffice/`)

Ces composants gèrent l'affichage visuel des fiches articles du catalogue et les lignes d'achats du panier client.

---

## 🛍️ Liste des Composants Clients

### 1. Carte Article (`ProductBloc.vue`)
Représente une carte produit carrée dans la grille d'accueil du catalogue de vente.
*   **Props** :
    *   `image` : URL de l'image de couverture.
    *   `name` : Nom du produit.
    *   `priceHt` / `priceTtc` : Tarifs en euros HT et TTC.
    *   `badge` : Badge textuel temporel (`HOT`, `NEW`, `À VENIR`).
*   **Règles visuelles** :
    *   Propose un zoom d'image progressif au survol (`scale(1.05)`).
    *   Applique un gradient linéaire de fond adapté pour chaque badge (Rouge pour `HOT`, Vert pour `NEW`).

---

### 2. Ligne de Panier (`ProductPanier.vue`)
Représente une ligne produit détaillée au sein du panier de commande client.
*   **Props** :
    *   `image`, `nom`, `description_courte`.
    *   `prixHt` / `prixTtc` : Tarifs unitaires.
    *   `quantite` : Nombre d'unités ajoutées.
*   **Fonctionnement interne** :
    *   Calcule de manière autonome les totaux de lignes HT et TTC via des propriétés calculées (`totalLigne` et `totalLigneHt`).
    *   Émet l'événement `update:quantite` lors des clics sur les boutons `-` et `+` pour demander une mise à jour.
    *   Émet l'événement `supprimer` lors du clic sur le bouton poubelle.
