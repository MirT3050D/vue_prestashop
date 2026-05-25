// Importation des méthodes standardisées de requêtes HTTP
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

/**
 * Normalise les nœuds de ressources PrestaShop pour s'assurer de toujours retourner un tableau.
 * Si l'API retourne un seul objet au lieu d'une liste, cette fonction l'encapsule dans un tableau `[objet]`.
 * 
 * @param {Object} node Le nœud XML parsé (ex: response.prestashop.addresses)
 * @param {string} singularKey La clé de l'entité unique (ex: 'address')
 */
function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

/**
 * Récupère la liste de toutes les adresses enregistrées dans la boutique.
 * 
 * @param {string|Object} params Paramètres de filtrage optionnels pour l'URL
 */
export async function getAddresses(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/addresses${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.addresses, 'address');
}

/**
 * Récupère uniquement les adresses liées à un client spécifique.
 * Très utilisé lors du tunnel de commande (Checkout) pour proposer les adresses enregistrées.
 * 
 * @param {string|number} customerId L'ID du client ciblé
 */
export async function getCustomerAddresses(customerId) {
    // Applique un filtre natif PrestaShop sur la ressource addresses
    return await getAddresses(`display=full&filter[id_customer]=[${customerId}]`);
}

/**
 * Récupère les détails d'une seule adresse spécifique (pour l'éditer par exemple).
 * 
 * @param {string|number} id L'ID de l'adresse
 * @param {string|Object} params Paramètres optionnels
 */
export async function getAddress(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/addresses/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.address || null;
}

/**
 * Crée une nouvelle adresse dans la base de données.
 * 
 * @param {string|Object} payload Le document XML contenant les infos de l'adresse
 */
export async function createAddress(payload) {
    const response = await postXml('/addresses', payload);
    return response?.prestashop?.address || response;
}

/**
 * Met à jour une adresse existante.
 * 
 * @param {string|number} id L'ID de l'adresse à modifier
 * @param {string|Object} payload Le document XML mis à jour
 */
export async function updateAddress(id, payload) {
    const response = await putXml(`/addresses/${id}`, payload);
    return response?.prestashop?.address || response;
}

/**
 * Supprime (soft ou hard delete selon configuration PrestaShop) une adresse de la base.
 * 
 * @param {string|number} id L'ID de l'adresse à supprimer
 */
export async function deleteAddress(id) {
    return await deleteXml(`/addresses/${id}`);
}
