
import { getXml, putXml } from '@/service/api';

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
 * Updates the status of a specific order.
 * PrestaShop requires the full order resource for PUT requests.
 * We fetch the complete order, update current_state, and send back.
 * 
 * @param {string} orderId The ID of the order to update.
 * @param {string} newStateId The ID of the new order state.
 */
export async function updateOrderStatus(orderId, newStateId) {
    // 1. Get the existing full order data
    const orderData = await getXml(`/orders/${orderId}`);
    const order = orderData?.prestashop?.order;
    
    if (!order) {
        throw new Error(`Commande ${orderId} introuvable.`);
    }

    // 2. Update the current_state
    order.current_state = newStateId;
    
    // 3. Clean up read-only / problematic fields that PrestaShop rejects on PUT
    delete order.associations;
    delete order.id_shop;
    delete order.id_shop_group;

    // 4. Send the PUT request with the full order payload
    const updatePayload = {
        prestashop: {
            order: order
        }
    };
    
    return await putXml(`/orders/${orderId}`, updatePayload);
}

