// Importation des utilitaires d'API pour exécuter les requêtes REST
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

/**
 * Assure la conversion d'un nœud XML PrestaShop en tableau JavaScript standard.
 * 
 * @param {Object} node L'objet racine retourné par l'API (ex: response.prestashop.order_states)
 * @param {string} singularKey Le nom de l'enfant (ex: 'order_state')
 */
function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

/**
 * Récupère la liste de tous les statuts possibles pour une commande (Order States).
 * Ces statuts définissent le cycle de vie d'une commande (ex: En attente, Payé, Expédié, Livré).
 * 
 * @param {string} params Les paramètres de la requête (par défaut on demande toutes les infos avec display=full)
 */
export async function getOrderStates(params = 'display=full') {
    const response = await getXml(`/order_states?${params}`);
    return normalizeArray(response?.prestashop?.order_states, 'order_state');
}

/**
 * Récupère les détails d'un statut de commande spécifique.
 * Très utile pour connaître la configuration d'un statut (ex: Envoie-t-il un email ? Est-ce une erreur ?)
 * 
 * @param {string|number} id L'identifiant du statut
 */
export async function getOrderState(id) {
    const response = await getXml(`/order_states/${id}`);
    return response?.prestashop?.order_state || null;
}

/**
 * Crée un nouveau statut de commande personnalisé dans la base de données.
 * 
 * @param {string|Object} payload Le document XML décrivant le nouveau statut (couleur, nom, comportement)
 */
export async function createOrderState(payload) {
    const response = await postXml('/order_states', payload);
    return response?.prestashop?.order_state || response;
}

/**
 * Met à jour un statut existant (ex: pour changer la couleur associée au badge "Livré").
 * 
 * @param {string|number} id L'ID du statut à modifier
 * @param {string|Object} payload Le nouveau XML
 */
export async function updateOrderState(id, payload) {
    const response = await putXml(`/order_states/${id}`, payload);
    return response?.prestashop?.order_state || response;
}

/**
 * Supprime un statut de commande.
 * ATTENTION: Dans PrestaShop, supprimer un statut utilisé par des commandes existantes va corrompre ces commandes.
 * 
 * @param {string|number} id L'ID du statut
 */
export async function deleteOrderState(id) {
    return await deleteXml(`/order_states/${id}`);
}
