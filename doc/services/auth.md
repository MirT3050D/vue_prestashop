# Service : Authentification (`authService.js`)

Ce service gère la validation et la connexion des utilisateurs.

---

## ⚙️ Rôle et Fonctionnement

Contrairement aux autres services qui utilisent les requêtes Webservice API authentifiées par clé, l'authentification client du front-office (`loginFront`) simule une soumission de formulaire directement vers le contrôleur d'authentification natif de PrestaShop. 

*   **Identifiants URL-encoded** : Les paramètres `email`, `password` et `submitLogin` sont encodés et transmis via la méthode POST.
*   **Options de requête spécifiques** : Le service utilise des en-têtes personnalisés pour contourner le traitement XML habituel (`skipXmlDefaults: true`) afin d'obtenir le document HTML de session natif de PrestaShop.

---

## 🛠️ Code Principal

Voici l'implémentation de l'authentification client dans `src/service/authService.js` :

```javascript
import { postXml } from './api';

/**
 * Authentifie un utilisateur via le contrôleur d'authentification standard de PrestaShop.
 * Note: Cette méthode utilise le front-office, pas le WebService API directement.
 */
export async function loginFront(email, password) {
    const formData = new URLSearchParams();
    formData.append('email', email);
    formData.append('password', password);
    formData.append('submitLogin', '1');

    return await postXml(
        '/ps_front/index.php?controller=authentication',
        formData.toString(),
        {
            skipXmlDefaults: true,
            skipAuth: true,
            skipBaseUrl: true,
            skipApiParams: true,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'text/html'
            },
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 400;
            },
            params: {}
        }
    );
}
```
