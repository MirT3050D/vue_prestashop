
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
 * Fetches all customers.
 */
export async function getCustomers(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/customers${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.customers, 'customer');
}

/**
 * Fetches a single customer.
 */
export async function getCustomer(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/customers/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.customer || null;
}

/**
 * Creates a new customer.
 */
export async function createCustomer(payload) {
    const response = await postXml('/customers', payload);
    return response?.prestashop?.customer || response;
}

/**
 * Updates a customer.
 */
export async function updateCustomer(id, payload) {
    const response = await putXml(`/customers/${id}`, payload);
    return response?.prestashop?.customer || response;
}

/**
 * Deletes a customer.
 */
export async function deleteCustomer(id) {
    return await deleteXml(`/customers/${id}`);
}
