# Pipeline d'Importation des Données (CSV / ZIP)

Ce document répertorie et lie les guides d'explications et extraits de code pour chaque processus d'importation de l'application situé dans `vue/src/service/`.

---

## 🗂️ Liste des Importations du Projet

Veuillez consulter la documentation dédiée à chaque flux d'import pour comprendre sa structure, ses contraintes et ses spécificités techniques :

1.  **[Importation des Produits (`productImport.js`)](file:///home/rahaj/projet/vue/doc/imports/product.md)** : Parsing CSV, validation des prix et conversion HT, création automatique de catégories/taxes et mise à jour de la date de disponibilité (PUT).
2.  **[Importation des Déclinaisons (`variantImport.js`)](file:///home/rahaj/projet/vue/doc/imports/variant.md)** : Traitement des produits simples vs déclinés, création d'attributs de variantes, calcul d'impact de prix HT et initialisation du stock.
3.  **[Importation des Images (`imageImport.js`)](file:///home/rahaj/projet/vue/doc/imports/image.md)** : Extraction et lecture d'un ZIP d'images de produits, association par référence et téléversement binaire multipart/form-data.
4.  **[Importation des Commandes Historiques (`orderImport.js`)](file:///home/rahaj/projet/vue/doc/imports/order.md)** : Reconstitution des paniers complexes (`parseAchat`), création de commandes historiques et traçage sécurisé des mouvements de stock sans doublon.
