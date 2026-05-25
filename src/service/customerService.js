// Importation des utilitaires d'appels réseau
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

/**
 * Uniformise les retours de l'API PrestaShop sous forme de tableau.
 * PrestaShop renvoie parfois un objet unique au lieu d'une liste (ex: un seul client trouvé = Objet).
 * 
 * @param {Object} node L'objet parsé depuis le XML (ex: response.prestashop.customers)
 * @param {string} singularKey Le nom du nœud contenant la ressource (ex: 'customer')
 */
function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

/**
 * Récupère la base de données de tous les clients inscrits.
 * 
 * @param {string|Object} params Filtres éventuels (ex: rechercher par email avec filter[email]=[test@test.com])
 */
export async function getCustomers(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/customers${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.customers, 'customer');
}

/**
 * Récupère la fiche détaillée d'un client spécifique (Nom, prénom, groupes, clés de sécurité...).
 * 
 * @param {string|number} id L'ID du client (id_customer)
 * @param {string|Object} params Paramètres optionnels
 */
export async function getCustomer(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/customers/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.customer || null;
}

/**
 * Crée un nouveau compte client (Inscription / Register).
 * 
 * @param {string|Object} payload Le document XML contenant les données d'inscription (email, mot de passe hashé, etc.)
 */
export async function createCustomer(payload) {
    const response = await postXml('/customers', payload);
    return response?.prestashop?.customer || response;
}

/**
 * Met à jour la fiche d'un client (Modification du profil, changement de mot de passe...).
 * 
 * @param {string|number} id L'ID du client
 * @param {string|Object} payload Le document XML contenant la mise à jour
 */
export async function updateCustomer(id, payload) {
    const response = await putXml(`/customers/${id}`, payload);
    return response?.prestashop?.customer || response;
}

/**
 * Supprime un compte client (Rarement utilisé en E-commerce à cause des liaisons avec les commandes,
 * PrestaShop utilise plutôt le concept de client "Deleted/Opt-out" ou d'anonymisation RGPD).
 * 
 * @param {string|number} id L'ID du client à effacer
 */
export async function deleteCustomer(id) {
    return await deleteXml(`/customers/${id}`);
}
