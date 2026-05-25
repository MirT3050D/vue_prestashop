// Importation des utilitaires d'API pour exécuter les requêtes REST
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

/**
 * Assure la conversion d'un nœud XML PrestaShop en tableau JavaScript standard.
 * Évite les erreurs de type "map is not a function" quand l'API renvoie un résultat unique.
 * 
 * @param {Object} node L'objet racine retourné par l'API (ex: response.prestashop.categories)
 * @param {string} singularKey Le nom de l'enfant (ex: 'category')
 */
function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

/**
 * Récupère l'arbre ou la liste des catégories de la boutique.
 * (Par défaut, l'ID 2 est la catégorie "Accueil").
 * 
 * @param {string|Object} params Filtres d'URL (ex: display=full ou filter[id_parent]=[2])
 */
export async function getCategories(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/categories${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.categories, 'category');
}

/**
 * Récupère les données d'une catégorie spécifique (nom, description, id_parent).
 * 
 * @param {string|number} id L'ID de la catégorie à consulter
 * @param {string|Object} params Paramètres optionnels
 */
export async function getCategory(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/categories/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.category || null;
}

/**
 * Crée une nouvelle catégorie dans l'arbre catalogue de PrestaShop.
 * 
 * @param {string|Object} payload Le XML descriptif de la catégorie
 */
export async function createCategory(payload) {
    const response = await postXml('/categories', payload);
    return response?.prestashop?.category || response;
}

/**
 * Met à jour les informations d'une catégorie existante (Renommage, déplacement d'arbre...).
 * 
 * @param {string|number} id L'identifiant de la catégorie
 * @param {string|Object} payload Les nouvelles données formatées en XML
 */
export async function updateCategory(id, payload) {
    const response = await putXml(`/categories/${id}`, payload);
    return response?.prestashop?.category || response;
}

/**
 * Supprime une catégorie. 
 * Attention : Dans PrestaShop, supprimer une catégorie peut orpheliner ses produits s'ils n'ont pas d'autre catégorie par défaut.
 * 
 * @param {string|number} id L'ID de la catégorie
 */
export async function deleteCategory(id) {
    return await deleteXml(`/categories/${id}`);
}
