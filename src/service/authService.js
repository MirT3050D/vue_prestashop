// Importation de la fonction postXml depuis le service API pour effectuer des requêtes HTTP POST
import { postXml } from './api';

/**
 * Authentifie un utilisateur via le contrôleur d'authentification standard de PrestaShop.
 * Note: Cette méthode utilise le front-office, pas le WebService API directement.
 * 
 * @param {string} email - L'adresse email de l'utilisateur
 * @param {string} password - Le mot de passe de l'utilisateur
 * @returns {Promise<Object>} La réponse brute du serveur (HTML)
 */
export async function loginFront(email, password) {
    // Instanciation de URLSearchParams pour formater les données comme un formulaire HTML classique (x-www-form-urlencoded)
    const formData = new URLSearchParams();
    // Ajout de l'email dans les données du formulaire
    formData.append('email', email);
    // Ajout du mot de passe dans les données du formulaire
    formData.append('password', password);
    // Ajout du champ caché requis par PrestaShop pour déclencher l'action de connexion
    formData.append('submitLogin', '1');

    // Exécution de la requête POST vers le front-office de PrestaShop
    return await postXml(
        // L'URL relative du contrôleur d'authentification du front-office
        '/ps_front/index.php?controller=authentication',
        // Conversion de URLSearchParams en chaîne (ex: email=...&password=...)
        formData.toString(),
        {
            // Ignore la configuration XML par défaut car on tape sur une page HTML
            skipXmlDefaults: true,
            // Ne pas envoyer la clé API webservice
            skipAuth: true,
            // Ne pas utiliser l'URL de base webservice
            skipBaseUrl: true,
            // Ignorer les paramètres additionnels (output_format=JSON)
            skipApiParams: true,
            headers: {
                // Définit le type de contenu comme étant un formulaire standard HTML
                'Content-Type': 'application/x-www-form-urlencoded',
                // Indique qu'on attend une page HTML en retour et non du JSON ou XML
                Accept: 'text/html'
            },
            // Autorise jusqu'à 5 redirections (PrestaShop redirige souvent après un login)
            maxRedirects: 5,
            // Considère les codes de statut 2xx et 3xx comme des succès (nécessaire pour les redirections)
            validateStatus: function (status) {
                return status >= 200 && status < 400;
            },
            // Ne passe aucun paramètre d'URL supplémentaire
            params: {}
        }
    );
}

/**
 * Initialise les identifiants par défaut du backoffice dans localStorage.
 * Utile pour le développement ou les environnements de test.
 */
export function initDefaultCredentials() {
    // Vérifie si l'email de l'admin existe déjà dans le localStorage
    if (!localStorage.getItem('admin_email')) {
        // S'il n'y est pas, le définit à la valeur par défaut 'admin'
        localStorage.setItem('admin_email', 'admin');
    }
    // Vérifie si le mot de passe de l'admin existe dans le localStorage
    if (!localStorage.getItem('admin_password')) {
        // S'il n'y est pas, le définit à la valeur par défaut 'admin'
        localStorage.setItem('admin_password', 'admin');
    }
}

/**
 * Authentifie un utilisateur backoffice de manière fictive via les identifiants stockés dans le localStorage.
 * (C'est un mock d'authentification sans appel serveur)
 * 
 * @param {string} email - L'email soumis
 * @param {string} password - Le mot de passe soumis
 * @returns {Promise<{success: boolean, error?: string}>} Un objet indiquant le succès ou la raison de l'échec
 */
export async function authenticateBackoffice(email, password) {
    // Retourne une promesse pour simuler le comportement asynchrone d'une vraie API
    return new Promise(function (resolve) {
        // Ajoute un faux délai réseau de 800 millisecondes
        setTimeout(function () {
            // Récupère l'email enregistré dans le localStorage
            const storedEmail = localStorage.getItem('admin_email');
            // Récupère le mot de passe enregistré dans le localStorage
            const storedPassword = localStorage.getItem('admin_password');

            // Vérifie si les identifiants fournis correspondent à ceux du localStorage
            if (email === storedEmail && password === storedPassword) {
                // Si correct, enregistre un "faux" token pour maintenir la session active
                localStorage.setItem('token', 'admin-token-123');
                // Résout la promesse avec un succès
                resolve({ success: true });
            } else {
                // Si incorrect, résout avec un échec et un message d'erreur approprié
                resolve({ success: false, error: 'Email ou mot de passe incorrect.' });
            }
        }, 800);
    });
}

/**
 * Définit le token d'authentification dans le stockage local du navigateur.
 * @param {string} token - Le jeton d'authentification à stocker
 */
export function setToken(token) {
    // Écrit le token dans le localStorage sous la clé 'token'
    localStorage.setItem('token', token);
}

/**
 * Récupère le token d'authentification courant.
 * @returns {string|null} Le token s'il existe, sinon null
 */
export function getToken() {
    // Lit la clé 'token' depuis le localStorage
    return localStorage.getItem('token');
}

/**
 * Stocke les informations du client actuellement connecté dans le localStorage.
 * Notifie également l'application que le client a changé.
 * 
 * @param {Object} customer - L'objet représentant le client
 */
export function setCurrentCustomer(customer) {
    // Convertit l'objet client en chaîne JSON et l'enregistre dans localStorage
    localStorage.setItem('customer', JSON.stringify(customer));
    // Déclenche un événement global personnalisé pour que les autres composants réagissent au changement de client
    window.dispatchEvent(new Event('customer-changed'));
}

/**
 * Récupère les informations du client actuellement connecté.
 * @returns {Object|null} L'objet client s'il est connecté et valide, sinon null
 */
export function getCurrentCustomer() {
    // Récupère la chaîne JSON représentant le client depuis le localStorage
    const json = localStorage.getItem('customer');
    // Si la clé n'existe pas (client non connecté), retourne null
    if (!json) return null;
    try {
        // Tente de parser la chaîne JSON en objet JavaScript
        return JSON.parse(json);
    } catch (e) {
        // En cas d'erreur de formatage JSON (corrompu), retourne null
        return null;
    }
}

/**
 * Déconnexion : supprime le token de session et les informations du client.
 */
export function logout() {
    // Supprime la clé 'token' du localStorage
    localStorage.removeItem('token');
    // Supprime la clé 'customer' du localStorage
    localStorage.removeItem('customer');
}
