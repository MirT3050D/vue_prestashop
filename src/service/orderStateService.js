
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
 * Fetches all order states.
 */
export async function getOrderStates(params = 'display=full') {
    const response = await getXml(`/order_states?${params}`);
    return normalizeArray(response?.prestashop?.order_states, 'order_state');
}

/**
 * Fetches a single order state.
 */
export async function getOrderState(id) {
    const response = await getXml(`/order_states/${id}`);
    return response?.prestashop?.order_state || null;
}

/**
 * Creates a new order state.
 */
export async function createOrderState(payload) {
    const response = await postXml('/order_states', payload);
    return response?.prestashop?.order_state || response;
}

/**
 * Updates an order state.
 */
export async function updateOrderState(id, payload) {
    const response = await putXml(`/order_states/${id}`, payload);
    return response?.prestashop?.order_state || response;
}

/**
 * Deletes an order state.
 */
export async function deleteOrderState(id) {
    return await deleteXml(`/order_states/${id}`);
}
