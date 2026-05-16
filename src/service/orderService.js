
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
 * Fetches all orders from the PrestaShop API.
 */
export async function getOrders(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/orders${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.orders, 'order');
}

/**
 * Fetches the orders for one customer.
 *
 * @param {string|number} customerId The customer identifier.
 */
export async function getCustomerOrders(customerId) {
    if (!customerId) return [];
    return await getOrders(`display=full&filter[id_customer]=[${customerId}]`);
}

/**
 * Fetches a single order.
 */
export async function getOrder(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/orders/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.order || null;
}

/**
 * Creates a new order.
 */
export async function createOrder(payload) {
    const response = await postXml('/orders', payload);
    return response?.prestashop?.order || response;
}

/**
 * Updates an order.
 */
export async function updateOrder(id, payload) {
    const response = await putXml(`/orders/${id}`, payload);
    return response?.prestashop?.order || response;
}

/**
 * Deletes an order.
 */
export async function deleteOrder(id) {
    return await deleteXml(`/orders/${id}`);
}

/**
 * Fetches all possible order states.
 */
export async function getOrderStates() {
    const response = await getXml('/order_states?display=full');
    return normalizeArray(response?.prestashop?.order_states, 'order_state');
}

/**
 * Updates order status using order history creation.
 * This is the native PrestaShop workflow and avoids full order PUT issues.
 *
 * @param {string} orderId The ID of the order to update.
 * @param {string} newStateId The target order state ID.
 */
export async function updateOrderStatus(orderId, newStateId) {
    const payload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <order_history>
        <id_order>${orderId}</id_order>
        <id_order_state>${newStateId}</id_order_state>
    </order_history>
</prestashop>`;

    return await postXml('/order_histories', payload);
}

/**
 * Alias for updateOrderStatus.
 */
export async function updateOrderStatusByHistory(orderId, newStateId) {
    return await updateOrderStatus(orderId, newStateId);
}

