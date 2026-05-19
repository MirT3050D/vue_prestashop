# Vue Back-office : Nettoyage & Purges (`ResetView.vue`)

Cette vue expose l'interface graphique de purge de la base de données permettant de repartir sur un catalogue ou historique propre.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Sélection Granulaire** :
    *   Présente une liste de toutes les tables PrestaShop disponibles au nettoyage sous forme de cases à cocher avec leurs statuts (sélectionnée par défaut ou non).
2.  **Mot de passe de confirmation** :
    *   Pour éviter les purges accidentelles, le bouton de lancement reste verrouillé tant que l'utilisateur n'a pas explicitement écrit le mot-clé de sécurité `RESET` en majuscules dans le champ de confirmation.
3.  **Appels API Unitaires Paginés** :
    *   La vue interroge l'API PrestaShop par paquets de 100 éléments (`limit=offset,limit`).
    *   Elle exclut automatiquement les identifiants systèmes systèmes configurés dans `skipIds` pour ne pas supprimer les catégories principales ou la taxe globale d'accueil de la base.
    *   Envoie une requête `DELETE` spécifique pour chaque identifiant.

---

## 🛠️ Extraits de Code Clés

Voici la boucle d'exécution de purge unitaire et l'extraction paginée écrites dans `src/view/backoffice/ResetView.vue` :

```javascript
async function fetchIdsForTarget(target) {
  const pageSize = 100;
  const uniqueIds = new Set();
  let offset = 0;

  while (true) {
    // Récupère uniquement les IDs pour minimiser la consommation de bande passante
    const payload = await getXml(`${target.endpoint}?display=[id]&limit=${offset},${pageSize}`);
    const items = getCollectionItems(payload, target);

    if (!items.length) break;

    items.forEach((item) => {
      const itemId = extractItemId(item);
      // Exclut les ID sensibles (ex: Catégorie Accueil ID 2 ou Client Admin ID 1)
      if (itemId != null && !target.skipIds.includes(Number(itemId))) {
        uniqueIds.add(String(itemId));
      }
    });

    if (items.length < pageSize) break;
    offset += pageSize;
  }
  return [...uniqueIds];
}

async function resetTarget(target) {
  const ids = await fetchIdsForTarget(target);
  if (!ids.length) {
    addLog('success', `${target.label}: aucune ligne a supprimer.`);
    return;
  }

  addLog('info', `${target.label}: ${ids.length} element(s) a supprimer.`);

  for (const id of ids) {
    try {
      // Suppression unitaire
      await deleteXml(`${target.endpoint}/${id}`);
      addLog('success', `${target.label}: suppression de l'identifiant ${id}.`);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        addLog('info', `${target.label}: l'identifiant ${id} est deja supprime.`);
      } else {
        addLog('error', `${target.label}: echec suppression ${id} (${e.message}).`);
      }
    }
  }
}
```
