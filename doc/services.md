# Guide des Services Métier

Ce document répertorie et lie les guides d'explications et extraits de code pour chaque service de l'application situé dans `vue/src/service/`.

---

## 🗂️ Liste des Services du Projet

Veuillez consulter la documentation dédiée à chaque service pour comprendre son rôle, son fonctionnement, et voir ses extraits de code illustratifs :

1.  **[API Core (`api.js`)](file:///home/rahaj/projet/vue/doc/services/api.md)** : Gestion de la couche réseau standardisée, conversion JSON ↔ XML et authentification Webservice REST.
2.  **[Authentification (`authService.js`)](file:///home/rahaj/projet/vue/doc/services/auth.md)** : Connexion client front-office via simulation de requête vers le contrôleur PrestaShop.
3.  **[Adresses (`addressService.js`)](file:///home/rahaj/projet/vue/doc/services/address.md)** : CRUD d'adresses clients et filtrage.
4.  **[Paniers (`cartService.js`)](file:///home/rahaj/projet/vue/doc/services/cart.md)** : Synchronisation des paniers d'achats avec PrestaShop et fusion intelligente de sessions non payées.
5.  **[Catégories (`categoryService.js`)](file:///home/rahaj/projet/vue/doc/services/category.md)** : Gestion de l'arborescence des catégories de produits.
6.  **[Clients (`customerService.js`)](file:///home/rahaj/projet/vue/doc/services/customer.md)** : Profils clients et gestion des comptes.
7.  **[Commandes & États (`orderService.js`)](file:///home/rahaj/projet/vue/doc/services/order.md)** : Cycle de vie des commandes, historique des statuts, et contrôleur d'écriture d'état forcé.
8.  **[Calculateur Financier (`price.js`)](file:///home/rahaj/projet/vue/doc/services/price.md)** : Calcul de la TVA, taxes en cascade, arrondis et cache mémoire.
9.  **[Produits & Déclinaisons (`productService.js`)](file:///home/rahaj/projet/vue/doc/services/product.md)** : Chargement de fiches produits, résolution des variantes et options d'attributs.
10. **[Stocks & Mouvements (`stockService.js`)](file:///home/rahaj/projet/vue/doc/services/stock.md)** : Ajustement des stocks virtuels et traçage des mouvements historiques de stock (`stock_movements`).
11. **[Utilitaires de Colonnes (`util.js`)](file:///home/rahaj/projet/vue/doc/services/util.md)** : Configuration de l'affichage dynamique et persistance des grilles en local.
