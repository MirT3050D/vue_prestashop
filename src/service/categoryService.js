
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

/**
 * Normalizes PrestaShop resource nodes to always return an array.
 */
function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

/**
 * Fetches categories.
 */
export async function getCategories(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/categories${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.categories, 'category');
}

/**
 * Fetches a single category.
 */
export async function getCategory(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/categories/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.category || null;
}

/**
 * Creates a new category.
 */
export async function createCategory(payload) {
    const response = await postXml('/categories', payload);
    return response?.prestashop?.category || response;
}

/**
 * Updates a category.
 */
export async function updateCategory(id, payload) {
    const response = await putXml(`/categories/${id}`, payload);
    return response?.prestashop?.category || response;
}

/**
 * Deletes a category.
 */
export async function deleteCategory(id) {
    return await deleteXml(`/categories/${id}`);
}
