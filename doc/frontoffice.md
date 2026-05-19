# Espace Client (Front-office Views)

Ce document répertorie et lie les guides d'explications et extraits de code pour chaque vue publique (front-office) de l'application située dans `vue/src/view/frontoffice/`.

---

## 🗂️ Liste des Vues du Front-office

Veuillez consulter la documentation dédiée à chaque vue pour comprendre sa structure, ses règles d'interface, et voir ses extraits de code associés :

1.  **[Tunnel de Commande (`CheckoutView.vue`)](file:///home/rahaj/projet/vue/doc/frontoffice/checkout.md)** : Saisie d'adresse de facturation, vérification de stock final, création du panier/commande API et décrémentation d'inventaire avec traçabilité customisée.
2.  **[Fiche Produit (`FicheProduitView.vue`)](file:///home/rahaj/projet/vue/doc/frontoffice/fiche_produit.md)** : Résolution d'attributs de déclinaisons, vérification dynamique de compatibilité d'options, chargement d'image dédiée et limites de stock à l'ajout.
3.  **[Accueil & Catalogue (`HomeView.vue`)](file:///home/rahaj/projet/vue/doc/frontoffice/home.md)** : Liste des articles, barre de recherche avec debounce, badges promotionnels dynamiques (`HOT`, `NEW`, `À VENIR`) calculés par rapport aux dates de disponibilité.
4.  **[Connexion Client (`LoginFrontView.vue`)](file:///home/rahaj/projet/vue/doc/frontoffice/login.md)** : Rendu d'authentification, parsing de code d'erreur HTML et hydratation du profil client Webservice.
5.  **[Historique Client (`OrdersView.vue`)](file:///home/rahaj/projet/vue/doc/frontoffice/orders.md)** : Visualisation des commandes passées triées par ordre chronologique décroissant et décodage dynamique des badges d'états d'envoi.
6.  **[Gestion du Panier (`PanierView.vue`)](file:///home/rahaj/projet/vue/doc/frontoffice/panier.md)** : Calculateur de prix TTC avec taxes, fusion automatique de paniers abandonnés, ajustement de quantité unitaire et vidage propre.
7.  **[Sélection de Profil (`UserSelectionView.vue`)](file:///home/rahaj/projet/vue/doc/frontoffice/user_selection.md)** : Matrice de connexion rapide pour le développement et fusion automatique de paniers d'invités (anonymes) vers les comptes de destination.
