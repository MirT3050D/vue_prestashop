
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
 * Fetches addresses.
 */
export async function getAddresses(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/addresses${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.addresses, 'address');
}

/**
 * Fetches addresses for a specific customer.
 */
export async function getCustomerAddresses(customerId) {
    return await getAddresses(`display=full&filter[id_customer]=[${customerId}]`);
}

/**
 * Fetches a single address.
 */
export async function getAddress(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/addresses/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.address || null;
}

/**
 * Creates a new address.
 */
export async function createAddress(payload) {
    const response = await postXml('/addresses', payload);
    return response?.prestashop?.address || response;
}

/**
 * Updates an address.
 */
export async function updateAddress(id, payload) {
    const response = await putXml(`/addresses/${id}`, payload);
    return response?.prestashop?.address || response;
}

/**
 * Deletes an address.
 */
export async function deleteAddress(id) {
    return await deleteXml(`/addresses/${id}`);
}
