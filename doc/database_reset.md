# Système de Réinitialisation de la Base de Données

Ce document décrit le fonctionnement du module de nettoyage de données de l'application (disponible sous `/admin/reset`).

---

## 🎯 1. Les Cibles de Nettoyage (`resetTargets.js`)

Le fichier `resetTargets.js` dresse la liste ordonnée des tables et ressources PrestaShop à nettoyer. Pour éviter d'altérer le cœur du système PrestaShop, certaines entités critiques (comme la catégorie par défaut "Accueil", la taxe par défaut, ou l'employé administrateur principal) sont protégées grâce à des listes d'exclusion (`skipIds`).

Voici la structure de configuration des cibles définie dans `src/service/resetTargets.js` :

```javascript
export const resetTargets = [
  {
    key: 'orders',
    label: 'Commandes',
    endpoint: '/orders',
    collectionKey: 'orders',
    itemKey: 'order',
    defaultSelected: true,
    skipIds: []
  },
  {
    key: 'customers',
    label: 'Clients',
    endpoint: '/customers',
    collectionKey: 'customers',
    itemKey: 'customer',
    defaultSelected: true,
    skipIds: [1] // Protège le client Administrateur système (ID 1)
  },
  {
    key: 'categories',
    label: 'Categories',
    endpoint: '/categories',
    collectionKey: 'categories',
    itemKey: 'category',
    defaultSelected: true,
    skipIds: [1, 2] // Protège la catégorie racine "Root" (ID 1) et "Accueil" (ID 2)
  },
  {
    key: 'stock_movements',
    label: 'Mouvements de stock',
    endpoint: '/stock_movements',
    collectionKey: 'stock_mvts', // Attention au pluriel spécifique de l'API PrestaShop
    itemKey: 'stock_mvt',
    skipIds: []
  }
  // ... autres entités
];
```

---

## ⚙️ 2. Workflow de Réinitialisation (`resetService.js`)

Le processus de nettoyage est conçu pour respecter l'intégrité référentielle de la base de données :

1.  **Ordre de Traitement** : Le service supprime d'abord les tables dépendantes (comme les commandes, déclinaisons, règles de taxes) avant de s'attaquer aux tables principales (produits, catégories, taxes). Cela prévient les blocages SQL dus aux clés étrangères (Foreign Keys).
2.  **Pagination & Protection** : Lors de la récupération des éléments à supprimer, les IDs exclus via `skipIds` sont éliminés des listes de suppression.
3.  **Suppression Individuelle** : Les requêtes `DELETE` sont envoyées de manière unitaire pour isoler les éventuelles anomalies et générer des retours détaillés à l'interface d'administration.

Voici l'implémentation de la sélection des éléments et de la boucle de suppression dans `src/service/resetService.js` :

```javascript
// Récupère les IDs de la ressource en excluant les skipIds configurés
export async function fetchIdsForTarget(target) {
  const pageSize = 100;
  const uniqueIds = new Set();
  let offset = 0;

  while (true) {
    // Appel GET paginé
    const payload = await getXml(`${target.endpoint}?display=[id]&limit=${offset},${pageSize}`);
    const items = getCollectionItems(payload, target);

    if (!items.length) break;

    items.forEach((item) => {
      const itemId = extractItemId(item);
      // Filtre de sécurité : ignore les IDs présents dans skipIds
      if (itemId != null && !target.skipIds.includes(Number(itemId))) {
        uniqueIds.add(String(itemId));
      }
    });

    if (items.length < pageSize) break;
    offset += pageSize;
  }

  return [...uniqueIds];
}

// Effectue les suppressions unitaires
export async function resetTarget(target, logCallback = () => {}) {
  const ids = await fetchIdsForTarget(target);

  if (!ids.length) {
    logCallback('success', `${target.label}: aucune ligne a supprimer.`);
    return;
  }

  logCallback('info', `${target.label}: ${ids.length} element(s) a supprimer.`);

  for (const id of ids) {
    try {
      // Requête DELETE unitaire vers l'API PrestaShop
      await deleteXml(`${target.endpoint}/${id}`);
      logCallback('success', `${target.label}: suppression de l'identifiant ${id}.`);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        logCallback('info', `${target.label}: l'identifiant ${id} est deja supprime.`);
      } else {
        logCallback('error', `${target.label}: Erreur lors de la suppression de l'identifiant ${id} (${e.message}).`);
      }
    }
  }
}
```
