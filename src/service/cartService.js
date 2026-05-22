import { getXml, postXml, putXml, deleteXml } from '@/service/api';
import { extractText } from '@/service/prestashopUtils';

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

import { getOrders } from '@/service/orderService'; // Indispensable pour croiser les données

/**
 * Récupère tous les paniers non convertis en commande pour un client donné.
 */
export async function getUnpaidCarts(customerId) {
    if (!customerId) {
        return [];
    }

    try {
        // 1. Récupération de toutes les commandes du client
        const orders = await getOrders('filter[id_customer]=[' + customerId + ']&display=[id,id_cart]');

        // 2. Extraction des IDs des paniers déjà payés
        const paidCartIds = [];
        for (let i = 0; i < orders.length; i++) {
            const order = orders[i];
            let cartId = null;

            if (order.id_cart && typeof order.id_cart === 'object') {
                cartId = order.id_cart['#text'];
            } else {
                cartId = order.id_cart;
            }

            if (cartId) {
                paidCartIds.push(String(cartId));
            }
        }

        // 3. Récupération de TOUS les paniers de ce client
        const allCarts = await getCarts('filter[id_customer]=[' + customerId + ']&display=full');

        // 4. Filtrage pour exclure les paniers payés
        const unpaidCarts = [];
        for (let j = 0; j < allCarts.length; j++) {
            const cart = allCarts[j];
            let cartId = null;

            if (cart.id && typeof cart.id === 'object') {
                cartId = cart.id['#text'];
            } else {
                cartId = cart.id;
            }

            let isPaid = false;
            for (let k = 0; k < paidCartIds.length; k++) {
                if (paidCartIds[k] === String(cartId)) {
                    isPaid = true;
                }
            }

            if (isPaid === false) {
                unpaidCarts.push(cart);
            }
        }

        return unpaidCarts;

    } catch (error) {
        console.error("Erreur lors de la récupération des paniers non payés :", error);
        return [];
    }
}

/**
 * Regroupe tous les paniers non payés d'un client en un seul et unique panier.
 */
export async function mergeUnpaidCarts(customerId, addressId) {
    const unpaidCarts = await getUnpaidCarts(customerId);

    // S'il n'y a pas plusieurs paniers, fusion inutile
    if (unpaidCarts.length <= 1) {
        return null;
    }

    const mergedProducts = {};

    // Cumul des quantités par produit/déclinaison
    for (let i = 0; i < unpaidCarts.length; i++) {
        const cart = unpaidCarts[i];

        if (cart.associations && cart.associations.cart_rows && cart.associations.cart_rows.cart_row) {
            let rows = cart.associations.cart_rows.cart_row;
            if (!Array.isArray(rows)) {
                rows = [rows];
            }

            for (let j = 0; j < rows.length; j++) {
                const row = rows[j];

                let prodId = null;
                if (row.id_product && typeof row.id_product === 'object') {
                    prodId = row.id_product['#text'];
                } else {
                    prodId = row.id_product;
                }

                let attrId = 0;
                if (row.id_product_attribute) {
                    if (typeof row.id_product_attribute === 'object') {
                        attrId = row.id_product_attribute['#text'] || 0;
                    } else {
                        attrId = row.id_product_attribute;
                    }
                }

                let qty = 0;
                if (row.quantity && typeof row.quantity === 'object') {
                    qty = parseInt(row.quantity['#text'], 10) || 0;
                } else {
                    qty = parseInt(row.quantity, 10) || 0;
                }

                if (prodId) {
                    const productKey = prodId + '_' + attrId;
                    if (mergedProducts[productKey]) {
                        mergedProducts[productKey].quantity += qty;
                    } else {
                        mergedProducts[productKey] = {
                            id_product: prodId,
                            id_product_attribute: attrId,
                            quantity: qty
                        };
                    }
                }
            }
        }
    }

    // Construction du XML pour le panier regroupé
    let cartRowsXml = '';
    const keys = Object.keys(mergedProducts);
    if (keys.length === 0) {
        return null;
    }

    for (let k = 0; k < keys.length; k++) {
        const item = mergedProducts[keys[k]];
        cartRowsXml += '\n' +
            '                <cart_row>\n' +
            '                    <id_product>' + item.id_product + '</id_product>\n' +
            '                    <id_product_attribute>' + item.id_product_attribute + '</id_product_attribute>\n' +
            '                    <id_address_delivery>' + addressId + '</id_address_delivery>\n' +
            '                    <quantity>' + item.quantity + '</quantity>\n' +
            '                </cart_row>';
    }

    const cartXmlPayload = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<prestashop>\n' +
        '    <cart>\n' +
        '        <id_customer>' + customerId + '</id_customer>\n' +
        '        <id_address_delivery>' + addressId + '</id_address_delivery>\n' +
        '        <id_address_invoice>' + addressId + '</id_address_invoice>\n' +
        '        <id_currency>1</id_currency>\n' +
        '        <id_lang>1</id_lang>\n' +
        '        <associations>\n' +
        '            <cart_rows>' + cartRowsXml + '\n' +
        '            </cart_rows>\n' +
        '        </associations>\n' +
        '    </cart>\n' +
        '</prestashop>';

    const newCart = await createCart(cartXmlPayload);

    // Suppression des anciens paniers éparpillés
    for (let m = 0; m < unpaidCarts.length; m++) {
        const oldCart = unpaidCarts[m];
        let oldCartId = null;
        if (oldCart.id && typeof oldCart.id === 'object') {
            oldCartId = oldCart.id['#text'];
        } else {
            oldCartId = oldCart.id;
        }
        if (oldCartId) {
            await deleteCart(oldCartId);
        }
    }

    return newCart;
}

function getRowsFromCart(cart) {
    const assoc = cart?.associations;
    if (!assoc || !assoc.cart_rows) return [];
    const rawRows = assoc.cart_rows.cart_row || assoc.cart_rows;
    return Array.isArray(rawRows) ? rawRows : (rawRows && typeof rawRows === 'object' ? [rawRows] : []);
}

/**
 * Fetches the most recent unpaid cart for a customer and maps it to the local cart format.
 */
export async function syncAndGetLatestCart(customerId) {
    if (!customerId) return [];

    const myUnpaidCarts = await getUnpaidCarts(customerId);

    myUnpaidCarts.sort(function (a, b) {
        let idA = parseInt(extractText(a.id), 10) || 0;
        let idB = parseInt(extractText(b.id), 10) || 0;
        return idB - idA;
    });

    if (myUnpaidCarts.length > 0) {
        let latestCart = myUnpaidCarts[0];
        let rows = getRowsFromCart(latestCart);

        if (rows.length > 0) {
            const mappedItems = [];
            for (let x = 0; x < rows.length; x++) {
                const r = rows[x];
                const idProd = extractText(r.id_product);

                if (idProd) {
                    mappedItems.push({
                        id_product: idProd,
                        id_product_attribute: extractText(r.id_product_attribute) || 0,
                        quantity: parseInt(extractText(r.quantity), 10) || 1
                    });
                }
            }
            return mappedItems;
        }
    }
    return [];
}

/**
 * Deletes all unpaid carts for a customer from the API.
 */
export async function clearAllUnpaidCarts(customerId) {
    if (!customerId) return;
    try {
        const carts = await getUnpaidCarts(customerId);
        for (const cart of carts) {
            const cartId = extractText(cart.id);
            if (cartId) {
                await deleteCart(cartId);
            }
        }
    } catch (e) {
        console.warn('Erreur nettoyage panier API:', e);
    }
}