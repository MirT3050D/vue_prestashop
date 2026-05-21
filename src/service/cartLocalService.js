
import { extractText } from '@/service/prestashopUtils';
import { getProduct } from '@/service/productService';
import { getProductTaxRate, calculateTtc } from '@/service/price';
import { getImage } from '@/service/api';
import { getStockAvailables } from '@/service/stockService';

/**
 * Retourne la clé localStorage du panier pour un client donné.
 */
export function getCartStorageKey(customerId) {
    if (customerId) return `panier_${customerId}`;
    const customerJson = localStorage.getItem('customer');
    if (customerJson) {
        try {
            const customerData = JSON.parse(customerJson);
            if (customerData?.id) return `panier_${customerData.id}`;
        } catch (e) {
            console.error("Erreur parse customer:", e);
        }
    }
    return 'panier_guest';
}

/**
 * Lit le panier depuis le localStorage et retourne un tableau d'items.
 */
export function getCart(customerId) {
    const key = getCartStorageKey(customerId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("Erreur parse panier:", e);
        return [];
    }
}

/**
 * Sauvegarde les items du panier dans le localStorage.
 */
export function saveCart(customerId, items) {
    const key = getCartStorageKey(customerId);
    localStorage.setItem(key, JSON.stringify(items));
}

/**
 * Vide le panier dans le localStorage (tableau vide).
 */
export function clearCart(customerId) {
    const key = getCartStorageKey(customerId);
    localStorage.setItem(key, JSON.stringify([]));
}

/**
 * Enrichit un item du panier avec les détails produit, le taux de taxe et l'image.
 */
export async function enrichCartItem(item) {
    let taxRate = item.taxRate;
    let image = item.image || null;
    let price = item.price;
    let name = item.name;
    let reference = item.reference;

    if (taxRate == null) {
        taxRate = await getProductTaxRate(item.id_product);
    }

    try {
        const product = await getProduct(item.id_product);
        if (product) {
            price = Number(extractText(product.price)) || 0;
            const nameNode = product.name?.language;
            const text = Array.isArray(nameNode) ? nameNode[0]['#text'] : (nameNode?.['#text'] || nameNode);
            name = extractText(text) || 'Produit sans nom';
            reference = extractText(product.reference) || '';

            if (product.id_default_image) {
                let imgId = product.id_default_image;
                if (typeof imgId === 'object' && imgId['#text']) imgId = imgId['#text'];
                if (typeof imgId === 'object' && imgId['@_xlink:href']) {
                    imgId = imgId['@_xlink:href'].split('/').pop();
                }
                const path = `images/products/${item.id_product}/${imgId}`;
                image = await getImage(path);
            }
        }
    } catch (e) { }

    return {
        ...item,
        name: name || `Produit #${item.id_product}`,
        price: price || 0,
        reference: reference || '',
        taxRate: Number(taxRate) || 0,
        image
    };
}

/**
 * Récupère le stock disponible pour un produit/déclinaison.
 * Retourne la quantité en entier.
 */
export async function getItemStock(productId, attributeId) {
    const pId = extractText(productId);
    const attrId = extractText(attributeId) || '0';
    if (!pId) return 0;
    try {
        const stockData = await getStockAvailables(`filter[id_product]=[${pId}]&filter[id_product_attribute]=[${attrId}]&display=[quantity]`);
        if (stockData && stockData.length > 0) {
            return parseInt(extractText(stockData[0].quantity), 10) || 0;
        }
    } catch (e) {
        console.warn('Erreur récupération stock:', e);
    }
    return 0;
}

/**
 * Calcule le total TTC du panier. Retourne une chaîne formatée.
 */
export function computeTotalTtc(items) {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const priceTtc = calculateTtc(item.price || 0, item.taxRate || 0);
        total += priceTtc * (item.quantity || 1);
    }
    return total.toFixed(2);
}

/**
 * Calcule le total HT du panier. Retourne une chaîne formatée.
 */
export function computeTotalHt(items) {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        total += (Number(item.price) || 0) * (item.quantity || 1);
    }
    return total.toFixed(2);
}

/**
 * Fusionne le panier anonyme dans le panier utilisateur.
 * Les items existants voient leur quantité cumulée.
 */
export function mergeAnonymousToUser(anonymousId, userId) {
    const anonItems = getCart(anonymousId);
    if (anonItems.length === 0) return;

    const userItems = getCart(userId);

    for (let i = 0; i < anonItems.length; i++) {
        const anonItem = anonItems[i];
        let found = false;

        for (let j = 0; j < userItems.length; j++) {
            if (String(userItems[j].id_product) === String(anonItem.id_product) &&
                String(userItems[j].id_product_attribute || '0') === String(anonItem.id_product_attribute || '0')) {
                userItems[j].quantity = (userItems[j].quantity || 1) + (anonItem.quantity || 1);
                found = true;
                break;
            }
        }

        if (!found) {
            userItems.push(anonItem);
        }
    }

    saveCart(userId, userItems);
    clearCart(anonymousId);
}

/**
 * Returns the existing quantity of a specific item in the cart.
 */
export function getExistingCartQuantity(productId, attributeId) {
    const cart = getCart(); // uses the default user or guest
    const existingItem = cart.find(item =>
        String(item.id_product) === String(productId) &&
        String(item.id_product_attribute) === String(attributeId)
    );
    return existingItem ? Number(existingItem.quantity) || 0 : 0;
}
