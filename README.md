# PrestaShop Vue Client

Ce projet est un client web moderne bâti avec Vue 3 et Vite, connecté au Webservice REST de PrestaShop.

---

## 📖 Documentation du Projet

Retrouvez ci-dessous la liste complète des guides d'explication de l'application, classés par domaine :

1.  **[Architecture Globale](file:///home/rahaj/projet/vue/doc/architecture.md)** : Fonctionnement du routage (`Vue Router`), de la passerelle proxy API (`Vite Proxy`), et du service de conversion JSON <-> XML.
2.  **[Services Applicatifs (`Services Index`)](file:///home/rahaj/projet/vue/doc/services.md)** : Index détaillé des connecteurs d'API (Authentification, Clients, Paniers, Commandes, Gestion de stocks et Taxes).
3.  **[Workflows d'Importation (`Imports Index`)](file:///home/rahaj/projet/vue/doc/imports_workflow.md)** : Fonctionnement des routines d'import de CSV (Produits, Déclinaisons, Images, Commandes d'historique).
4.  **[Composants Communs & Widgets (`Components Index`)](file:///home/rahaj/projet/vue/doc/components.md)** : Documentation des éléments d'interface réutilisables, formulaires de connexion et graphiques.
5.  **[Vues d'Administration (`Back-office Index`)](file:///home/rahaj/projet/vue/doc/backoffice.md)** : Description du tableau de bord (KPIs), de l'historique des commandes d'administration, de la mise à jour rapide des stocks et de la traçabilité des mouvements.
6.  **[Vues Publiques (`Front-office Index`)](file:///home/rahaj/projet/vue/doc/frontoffice.md)** : Description du tunnel de commande (Checkout), de la sélection intelligente des déclinaisons, de la fusion de paniers orphelins et des badges promotionnels temporels.
7.  **[Sécurité & Réinitialisation de Base](file:///home/rahaj/projet/vue/doc/database_reset.md)** : Règles de protection de la base de données et ordre de purge séquentiel des tables.

---

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```
