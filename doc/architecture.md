# Architecture du Projet

Ce document présente l'architecture globale de l'application **PrestaShop Vue Client** (Interface Vue.js connectée au Webservice PrestaShop).

---

## 📂 Structure des Répertoires

Le projet est structuré comme suit :

*   `vue/src/` : Code source de l'application Vue.js.
    *   `assets/` : Ressources statiques (styles, polices, images).
    *   `components/` : Composants réutilisables (séparés par zone comme `backoffice/` ou génériques).
    *   `router/` : Configuration de Vue Router (`index.js`).
    *   `service/` : Services métier gérant la communication avec les webservices de PrestaShop.
    *   `view/` : Pages principales de l'application.
        *   `backoffice/` : Vues d'administration (Dashboard, gestion de stock, import CSV, réinitialisation).
        *   `frontoffice/` : Vues de la boutique publique (Accueil, Fiche Produit, Panier, Tunnel de commande, Commandes client).

---

## 🛣️ Système de Routage & Authentification

Le fichier `index.js` dans le répertoire router gère le routage de l'application :

1.  **Front-office** :
    *   `/` : `HomeView` (Page d'accueil de la boutique).
    *   `/produit/:id` : `FicheProduitView` (Détails d'un produit).
    *   `/panier` : `PanierView` (Gestion du panier local et API).
    *   `/connexion` : `LoginFrontView` (Identification client).
    *   `/checkout` : `CheckoutView` (Passage de la commande).
    *   `/mes-commandes` : `OrdersView` (Historique des commandes client).
    *   `/selection-profil` : `UserSelectionView` (Sélecteur rapide de profil client).

2.  **Back-office (préfixé par `/admin`)** :
    *   `/admin` : `LoginBackView` (Espace de connexion administrateur).
    *   `/admin/backofficeDashboard` : `DashboardView` (Graphiques et KPIs des ventes).
    *   `/admin/import` : `ImportView` (Interface d'importation CSV).
    *   `/admin/reset` : `ResetView` (Interface de nettoyage de base).
    *   `/admin/orders` : `OrderListView` (Liste et gestion des états de commandes).
    *   `/admin/stocks` : `StockView` (Grille de modification rapide de stock).
    *   `/admin/stock-evolution/:id?` : `StockEvolution` (Visualisation des mouvements de stock).

### 🛡️ Contrôle d'Accès (Router Guards)
Un middleware de navigation (`beforeEach`) intercepte chaque transition. Voici le code implémenté dans `src/router/index.js` :

```javascript
router.beforeEach((to, from, next) => {
  const isAuthenticated = !!localStorage.getItem('token');

  // Si la route est pour le back-office et nécessite une authentification
  if (to.meta.isBackoffice && to.meta.requiresAuth && !isAuthenticated) {
    // Redirige vers la page de login du back-office
    next({ name: 'login' });
  }
  // Si l'utilisateur est authentifié et essaie d'aller sur la page de login
  else if (isAuthenticated && to.name === 'login') {
    // Redirige vers la première page utile du back-office (ex: import)
    next({ name: 'dashboard' });
  }
  // Pour toutes les autres situations, laisser passer
  else {
    next();
  }
});
```

---

## 🔄 Passerelle API & Proxy XML

PrestaShop expose un Webservice REST basé sur le format **XML**. Pour surmonter les restrictions CORS et simplifier les flux de données, le projet intègre :

1.  **Vite Proxy** (`vite.config.js`) :
    *   Redirige `/api_ps/*` vers l'API PrestaShop réelle de manière transparente.
    *   Redirige `/ps_front/*` vers la racine de la boutique PrestaShop pour l'accès aux médias.

2.  **Service Réseau Core** (`api.js`) :
    *   Convertit automatiquement les payloads JSON du front-end en chaînes XML compréhensibles par PrestaShop lors des requêtes HTTP (POST, PUT).
    *   Décode les réponses XML de l'API PrestaShop en objets JSON manipulables en JavaScript à l'aide de bibliothèques de parsing.

Voici comment les requêtes GET et POST sont gérées dans `src/service/api.js` :

```javascript
import axios from 'axios';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false });
const builder = new XMLBuilder({ ignoreAttributes: false });

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL, // Cible '/api_ps' via le proxy Vite
  params: {
    ws_key: import.meta.env.VITE_API_KEY, // Injecte la clé webservice
    output_format: 'JSON' // Optionnel ou forcé en XML selon l'action
  }
});

// Appel GET convertissant le XML retourné en JSON
export async function getXml(url) {
  const response = await apiClient.get(url, { headers: { 'Content-Type': 'application/xml' } });
  return parser.parse(response.data);
}

// Appel POST convertissant l'objet JavaScript JSON en XML avant l'envoi
export async function postXml(url, jsonData) {
  let xmlPayload = '';
  if (typeof jsonData === 'string') {
    xmlPayload = jsonData;
  } else {
    xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>\n` + builder.build(jsonData);
  }
  const response = await apiClient.post(url, xmlPayload, { headers: { 'Content-Type': 'application/xml' } });
  return parser.parse(response.data);
}
```
