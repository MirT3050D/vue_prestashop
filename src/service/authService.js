import { postXml } from './api';

/**
 * Authentifie un utilisateur via le contrôleur d'authentification standard de PrestaShop.
 * Note: Cette méthode utilise le front-office, pas le WebService API directement.
 * 
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<Object>} La réponse brute du serveur (HTML)
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
