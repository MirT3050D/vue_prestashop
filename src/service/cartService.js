
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
 * Fetches all carts.
 */
export async function getCarts(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/carts${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.carts, 'cart');
}

/**
 * Fetches a single cart.
 */
export async function getCart(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/carts/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.cart || null;
}

/**
 * Creates a new cart.
 * @param {string|Object} payload XML string or object payload
 */
export async function createCart(payload) {
    const response = await postXml('/carts', payload);
    return response?.prestashop?.cart || response;
}

/**
 * Updates an existing cart.
 */
export async function updateCart(id, payload) {
    const response = await putXml(`/carts/${id}`, payload);
    return response?.prestashop?.cart || response;
}

/**
 * Deletes a cart.
 */
export async function deleteCart(id) {
    return await deleteXml(`/carts/${id}`);
}
