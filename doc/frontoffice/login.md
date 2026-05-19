# Vue Front-office : Connexion Client (`LoginFrontView.vue`)

Cette vue propose le formulaire de connexion standard destiné aux clients de la boutique.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Vérification de Session HTML** :
    *   Le script appelle `loginFront(email, password)` pour soumettre les données. Comme PrestaShop ne renvoie pas de JSON natif de connexion par Webservice, le script examine le document HTML de réponse. 
    *   Si le texte contient des marqueurs d'erreur de formulaire (`authentication` et `alert-danger`), la connexion est interrompue.
2.  **Hydratation du profil WebService** :
    *   Une fois la session validée sur le serveur, le script interroge `/customers` avec le filtre `filter[email]` pour extraire le modèle de données client (ID, nom, prénom, genre).
    *   Stocke ces informations dans `localStorage` sous la clé `customer` pour personnaliser l'interface utilisateur globale (affichage du nom client dans le bandeau).

---

## 🛠️ Extraits de Code Clés

Voici le traitement d'authentification et de recherche de fiche client dans `src/view/frontoffice/LoginFrontView.vue` :

```javascript
async function handleLogin(credentials) {
    loading.value = true;
    error.value = '';

    try {
        // 1. Appel du contrôleur d'authentification natif PrestaShop
        const loginResponse = await loginFront(credentials.email, credentials.password);

        // 2. Détection d'échec dans le rendu HTML retourné
        const responseText = typeof loginResponse.data === 'string' ? loginResponse.data : '';
        const isLoginFailed = responseText.includes('authentication') && responseText.includes('alert-danger');

        if (isLoginFailed) {
            error.value = 'Email ou mot de passe incorrect.';
            loading.value = false;
            return;
        }

        // 3. Récupération des informations structurées par le WebService
        let customerData = null;
        try {
            const customers = await getCustomers(`display=full&filter[email]=[${credentials.email}]`);

            if (customers.length > 0) {
                let c = customers[0];
                customerData = {
                    id: c.id,
                    email: c.email['#text'] || c.email || credentials.email,
                    firstname: c.firstname['#text'] || c.firstname || '',
                    lastname: c.lastname['#text'] || c.lastname || '',
                    id_gender: c.id_gender,
                    active: c.active
                };
            }
        } catch (apiError) {
            // Reconfiguration de secours minimale
            customerData = { email: credentials.email };
        }

        // 4. Persistence locale
        const token = 'customer_' + Date.now();
        localStorage.setItem('customer_token', JSON.stringify(token));
        localStorage.setItem('customer', JSON.stringify(customerData));
        window.dispatchEvent(new Event('customer-updated'));

        router.push('/catalogue');
    } catch (err) {
        error.value = 'Une erreur est survenue lors de la connexion.';
    } finally {
        loading.value = false;
    }
}
```
