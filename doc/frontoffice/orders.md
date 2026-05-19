# Vue Front-office : Historique Client (`OrdersView.vue`)

Cette vue présente l'historique personnel des achats d'un client connecté.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Restriction d'Accès** :
    *   Si le visiteur navigue sous la session Anonyme (ID 1) ou n'est pas connecté, la page lui affiche un écran de verrouillage l'invitant à s'identifier.
2.  **Résolution des Noms d'États & Couleurs** :
    *   Interroge l'API `/order_states` pour récupérer les libellés multilingues (ex: Paiement accepté, Livré, Annulé) et les codes couleur CSS associés configurés dans PrestaShop.
3.  **Tri Chronologique** :
    *   Les commandes du client sont triées par ID décroissant pour présenter les achats les plus récents en tête de liste.

---

## 🛠️ Extraits de Code Clés

Voici le script de résolution des états et couleurs de commande dans `src/view/frontoffice/OrdersView.vue` :

```javascript
const stateLabels = computed(() => {
    const labels = new Map();

    for (const state of orderStates.value) {
        const langNode = state?.name?.language;
        let label = '';

        if (Array.isArray(langNode)) {
            label = extractText(langNode[0]);
        } else {
            label = extractText(langNode);
        }

        labels.set(String(extractText(state.id)), label || 'Inconnu');
    }

    return labels;
});

const stateColors = computed(() => {
    const colors = new Map();

    for (const state of orderStates.value) {
        colors.set(String(extractText(state.id)), state.color || '#9ca3af');
    }

    return colors;
});

function getOrderStateLabel(stateId) {
    return stateLabels.value.get(String(extractText(stateId))) || 'Inconnu';
}

function getOrderStateColor(stateId) {
    return stateColors.value.get(String(extractText(stateId))) || '#9ca3af';
}
```
