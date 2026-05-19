# Vue Front-office : Gestion du Panier (`PanierView.vue`)

Cette vue permet de modifier les quantités d'articles du panier local, de regrouper d'anciens paniers ou de vider son panier en effaçant les brouillons distants.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Priorité d'affichage API** :
    *   Au chargement, si le client est connecté, le script va d'abord récupérer les paniers non payés (`getUnpaidCarts`) enregistrés sous son ID client PrestaShop. 
    *   Il trie les résultats par ID décroissant pour écraser le stockage local avec le panier actif le plus récent de la base.
2.  **Regroupement des Paniers Abandonnés (Fusion)** :
    *   Si le client possède d'autres paniers abandonnés sur son compte (ex: créés sur d'autres navigateurs), il peut cliquer sur "Récupérer mes anciens paniers". Le service fusionne ces paniers en un seul panier global à l'adresse de facturation du client.
3.  **Vérification de stock unitaire** :
    *   Toute augmentation de quantité déclenche une requête sur `stock_availables` pour interdire le dépassement du stock physique disponible.
4.  **Vidage propre avec suppression API** :
    *   Lorsque l'utilisateur vide son panier, l'application nettoie non seulement le panier local (`localStorage`) mais effectue aussi des requêtes `DELETE` sur l'API pour détruire les paniers orphelins non payés associés à son compte client afin d'éviter qu'ils ne se rechargent au prochain montage de page.

---

## 🛠️ Extraits de Code Clés

Voici le regroupement de paniers abandonnés et le vidage de panier local/distant implémentés dans `src/view/frontoffice/PanierView.vue` :

```javascript
// Regroupement d'anciens paniers abandonnés
async function relancerRegroupement() {
    const customerJson = localStorage.getItem('customer');

    if (customerJson) {
        const customerData = JSON.parse(customerJson);
        isMerging.value = true;
        message.value = "Regroupement de vos anciens paniers en cours...";
        messageType.value = "success";

        try {
            // Fusion des paniers distants non payés
            const nouveauPanier = await mergeUnpaidCarts(customerData.id, getCustomerAddresses(customerData.id));
            if (nouveauPanier) {
                await loadCart();
                message.value = "Vos anciens paniers abandonnés ont été regroupés avec succès !";
                messageType.value = "success";
            } else {
                message.value = "Vous n'avez aucun autre panier abandonné à regrouper.";
                messageType.value = "error";
            }
        } catch (error) {
            message.value = "Impossible de regrouper les paniers pour le moment.";
            messageType.value = "error";
        } finally {
            isMerging.value = false;
        }
    }
}

// Vidage du panier local et nettoyage côté API
function viderPanier() {
    if (confirm("Voulez-vous vraiment vider votre panier ?")) {
        panier.value = [];
        localStorage.setItem(getCartStorageKey(), JSON.stringify([]));

        const customerJson = localStorage.getItem('customer');
        if (customerJson) {
            try {
                const customerData = JSON.parse(customerJson);
                if (customerData?.id) {
                    // Récupère et supprime tous les paniers non payés de l'API
                    getUnpaidCarts(customerData.id).then((carts) => {
                        carts.forEach((cart) => {
                            const cartId = extractText(cart.id);
                            if (cartId) deleteCart(cartId);
                        });
                    });
                }
            } catch (e) {
                console.warn('Erreur nettoyage panier API:', e);
            }
        }
    }
}
```
