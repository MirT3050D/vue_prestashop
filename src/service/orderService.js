
import { getXml, postXml } from '@/service/api';

/**
 * Fetches all orders from the PrestaShop API.
 */
export async function getOrders() {
    const response = await getXml('/orders?display=full');
    if (!response?.prestashop?.orders?.order) {
        return [];
    }
    let orders = response.prestashop.orders.order;
    return Array.isArray(orders) ? orders : [orders];
}

/**
 * Fetches the orders for one customer.
 *
 * @param {string|number} customerId The customer identifier.
 */
export async function getCustomerOrders(customerId) {
    if (!customerId) {
        return [];
    }

    const response = await getXml(`/orders?display=full&filter[id_customer]=[${customerId}]`);
    if (!response?.prestashop?.orders?.order) {
        return [];
    }

    let orders = response.prestashop.orders.order;
    return Array.isArray(orders) ? orders : [orders];
}

/**
 * Fetches all possible order states.
 */
export async function getOrderStates() {
    const response = await getXml('/order_states?display=full');
    if (!response?.prestashop?.order_states?.order_state) {
        return [];
    }
    let states = response.prestashop.order_states.order_state;
    return Array.isArray(states) ? states : [states];
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
 * Updates order status using order history creation.
 * This is the native PrestaShop workflow and avoids full order PUT issues.
 *
 * @param {string} orderId The ID of the order to update.
 * @param {string} newStateId The target order state ID.
 */
export async function updateOrderStatusByHistory(orderId, newStateId) {
    return await updateOrderStatus(orderId, newStateId);
}

