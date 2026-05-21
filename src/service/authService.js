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

/**
 * Initialise les identifiants par défaut du backoffice dans localStorage.
 */
export function initDefaultCredentials() {
    if (!localStorage.getItem('admin_email')) {
        localStorage.setItem('admin_email', 'admin');
    }
    if (!localStorage.getItem('admin_password')) {
        localStorage.setItem('admin_password', 'admin');
    }
}

/**
 * Authentifie un utilisateur backoffice via localStorage.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function authenticateBackoffice(email, password) {
    return new Promise(function (resolve) {
        setTimeout(function () {
            const storedEmail = localStorage.getItem('admin_email');
            const storedPassword = localStorage.getItem('admin_password');

            if (email === storedEmail && password === storedPassword) {
                localStorage.setItem('token', 'admin-token-123');
                resolve({ success: true });
            } else {
                resolve({ success: false, error: 'Email ou mot de passe incorrect.' });
            }
        }, 800);
    });
}

/**
 * Définit le token d'authentification.
 */
export function setToken(token) {
    localStorage.setItem('token', token);
}

/**
 * Récupère le token d'authentification.
 */
export function getToken() {
    return localStorage.getItem('token');
}

/**
 * Stocke le client courant dans localStorage.
 */
export function setCurrentCustomer(customer) {
    localStorage.setItem('customer', JSON.stringify(customer));
    window.dispatchEvent(new Event('customer-changed'));
}

/**
 * Récupère le client courant depuis localStorage.
 * @returns {Object|null}
 */
export function getCurrentCustomer() {
    const json = localStorage.getItem('customer');
    if (!json) return null;
    try {
        return JSON.parse(json);
    } catch (e) {
        return null;
    }
}

/**
 * Déconnexion : supprime token et customer.
 */
export function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('customer');
}
