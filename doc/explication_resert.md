# Explication de l'integration du reset dans Vue

Cette fonctionnalite a ete integree dans l'application Vue pour fournir un point d'entree simple vers la reinitialisation des donnees PrestaShop.

## Objectif

L'objectif est de proposer une page dediee au reset, accessible depuis l'interface Vue, afin de lancer les suppressions via l'API WebService PrestaShop sans utiliser de `truncate`.

## Integration dans l'application

- Une nouvelle vue a ete ajoutee pour afficher l'interface de reset.
- La route `/reset` permet d'ouvrir cette page directement dans l'application.
- Le menu lateral a ete mis a jour pour ajouter un acces rapide au reset.
- La liste des entites a nettoyer a ete centralisee dans un fichier de configuration dedie.

## Fonctionnement de la page

La page de reset permet de :

- selectionner les tables ou entites a reinitialiser ;
- garder ou exclure certaines entites sensibles, comme l'admin et la categorie racine ;
- confirmer l'action avant execution ;
- envoyer les suppressions une par une via les endpoints REST PrestaShop.

## Tables prevues

L'interface couvre principalement :

- commandes ;
- details de commande ;
- paniers ;
- clients ;
- adresses ;
- produits ;
- categories ;
- fabricants, fournisseurs et alias en option.

## Fichiers relies

- `src/view/ResetView.vue` : page de reset.
- `src/service/resetTargets.js` : liste des entites a traiter.
- `src/router/index.js` : ajout de la route `/reset`.
- `src/App.vue` : ajout du lien dans la navigation.

## Remarque importante

Le reset est pense pour etre trace et progressif. Chaque suppression passe par l'API officielle PrestaShop, ce qui permet de garder un meilleur controle sur les donnees supprimees et d'eviter les operations destructives globales.