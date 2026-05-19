# Vue Front-office : Sélection de Profil (`UserSelectionView.vue`)

Cette vue sert de portail d'accueil pour le développement, permettant de sélectionner rapidement un profil client existant ou de naviguer de façon anonyme.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Récupération des profils clients** :
    *   Exécute un appel Webservice sur `/customers` trié par ID décroissant pour lister les derniers profils configurés (hors ID 1, qui est le compte de repli anonyme).
2.  **Connexion Anonyme vs Client** :
    *   **Utilisateur Anonyme** : Assigne les coordonnées par défaut de l'invité PrestaShop (ID 1, e-mail `anonymous@psgdpr.com`).
    *   **Utilisateur Nominatif** : Assigne l'identifiant et les informations de facturation du client sélectionné.
3.  **Fusion du panier invité (Anonyme → Client)** :
    *   Si un panier contenait des articles sous la session de l'invité Anonyme (ID 1) au moment où le client clique sur un profil nominatif, le script fusionne automatiquement les articles locaux vers le panier persisté de l'utilisateur cible. Il vide ensuite le panier invité (`panier_1`) et redirige directement vers l'étape de finalisation de commande (`checkout`).

---

## 🛠️ Extraits de Code Clés

Voici la logique de connexion et de fusion de panier implémentée dans `src/view/frontoffice/UserSelectionView.vue` :

```javascript
function selectUser(user) {
  let shouldRedirectToCheckout = false;

  // Déterminer l'ID du client actuel avant de se connecter au nouveau
  const currentCustomerJson = localStorage.getItem('customer');
  let isCurrentlyAnonymous = false;
  if (currentCustomerJson) {
    try {
      const currentCustomer = JSON.parse(currentCustomerJson);
      if (Number(currentCustomer?.id) === 1) isCurrentlyAnonymous = true;
    } catch (e) {}
  }

  if (user != null) {
    // Si on passe d'Anonyme (ID 1) à Client nominatif, on fusionne les paniers locaux
    if (isCurrentlyAnonymous && Number(user.id) !== 1) {
      const anonymousCartJson = localStorage.getItem('panier_1');
      if (anonymousCartJson) {
        try {
          const anonymousCart = JSON.parse(anonymousCartJson);
          if (Array.isArray(anonymousCart) && anonymousCart.length > 0) {
            shouldRedirectToCheckout = true;
            const targetKey = `panier_${user.id}`;
            let targetCart = JSON.parse(localStorage.getItem(targetKey) || '[]');

            // Fusionner les articles de l'Anonyme (1) dans le panier de l'utilisateur cible
            for (const item of anonymousCart) {
              const existing = targetCart.find(
                (t) => String(t.id_product) === String(item.id_product) && String(t.id_product_attribute) === String(item.id_product_attribute)
              );
              if (existing) {
                existing.quantity = Number(existing.quantity) + Number(item.quantity);
              } else {
                targetCart.push(item);
              }
            }

            localStorage.setItem(targetKey, JSON.stringify(targetCart));
            localStorage.setItem('panier_1', JSON.stringify([])); // Vider le panier invité
          }
        } catch (e) {
          console.error("Erreur de fusion du panier invité:", e);
        }
      }
    }

    // Connexion Client nominatif
    let customerData = { id: user.id, firstname: user.firstname, lastname: user.lastname, email: user.email };
    localStorage.setItem('customer', JSON.stringify(customerData));
    localStorage.setItem('customer_token', JSON.stringify("dev_token_" + user.id));
  } else {
    // Connexion Anonyme par défaut (ID 1)
    let customerData = { id: 1, firstname: 'Anonymous', lastname: 'Anonymous', email: 'anonymous@psgdpr.com' };
    localStorage.setItem('customer', JSON.stringify(customerData));
    localStorage.setItem('customer_token', JSON.stringify("dev_token_1"));
  }

  window.dispatchEvent(new Event('customer-updated'));

  // Redirection contextuelle
  if (shouldRedirectToCheckout) {
    router.push({ name: 'checkout' });
  } else {
    router.push({ name: 'homeFrontoffice' });
  }
}
```
