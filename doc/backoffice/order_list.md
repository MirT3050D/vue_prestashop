# Vue Back-office : Liste des Commandes (`OrderListView.vue`)

Cette vue permet de lister l'ensemble des commandes passées sur la boutique et de changer leur état d'expédition de façon interactive.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Récupération Croisée (Commandes + Paniers Actifs)** :
    *   La vue interroge les commandes PrestaShop (`orders`) ainsi que les paniers en cours d'écriture (`carts`).
    *   Elle élimine les paniers convertis en commandes et affiche les paniers actifs sous la mention `PANIER #ID` pour permettre aux administrateurs de voir les ventes en cours de constitution.
2.  **Changement d'État Sécurisé** :
    *   La modification du statut se fait par sélection dans une liste déroulante (ex: Livraison en cours, Livré, Annulé).
    *   **Contraintes d'état** :
        *   Une commande déjà marquée comme "Livrée" ne peut plus être modifiée.
        *   Seules les commandes au statut "Paiement accepté" peuvent être basculées vers le statut "Annulé".
3.  **Détails de Commande Imbriqués** :
    *   Pour chaque ligne du tableau, un composant accordéon `Dropdown` affiche la liste des articles achetés avec les calculs unitaires HT et TTC.

---

## 🛠️ Extraits de Code Clés

Voici les filtres d'états et le déclencheur de mise à jour implémentés dans `src/view/backoffice/OrderListView.vue` :

```javascript
async function onStatusChange(orderId, newStateId) {
  if (!newStateId) return;

  const orderToUpdate = orders.value.find(o => String(o.id) === String(orderId));
  if (!orderToUpdate || orderToUpdate.isCart) return;

  const deliveredId = getStateIdByNameLower('livré');
  const canceledId = getStateIdByNameLower('annulé');
  const paidId = getStateIdByNameLower('paiement accepté');

  // Une commande livrée reste figée pour des raisons de conformité
  if (deliveredId && normalizeId(orderToUpdate.current_state) === deliveredId && normalizeId(newStateId) !== deliveredId) {
    alert('Cette commande est déjà livrée. Changement impossible.');
    return;
  }

  // Seules les commandes payées peuvent être annulées pour éviter les bugs comptables
  if (canceledId && normalizeId(newStateId) === canceledId) {
    if (!paidId || normalizeId(orderToUpdate.current_state) !== paidId) {
      alert('Seules les commandes payées peuvent être annulées.');
      return;
    }
  }

  isUpdating.value[orderId] = true;
  try {
    // Appel du service pour insérer l'état dans l'historique PrestaShop
    await updateOrderStatus(orderId, newStateId);
    
    // Rétroaction locale instantanée
    orderToUpdate.current_state = newStateId;
  } catch (e) {
    alert(`Erreur de mise à jour : ${e.message}`);
  } finally {
    isUpdating.value[orderId] = false;
  }
}
```
