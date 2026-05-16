
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

/**
 * Normalizes PrestaShop resource nodes to always return an array.
 * @param {Object} node The resource node (e.g., response.prestashop.products)
 * @param {string} singularKey The singular key (e.g., 'product')
 */
function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

/**
 * Fetches products from the API.
 * @param {string} params Query parameters (e.g., 'display=full&filter[id_category_default]=2')
 */
export async function getProducts(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/products${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.products, 'product');
}

/**
 * Fetches a single product by ID.
 * @param {number|string} id 
 * @param {string} params 
 */
export async function getProduct(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/products/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.product || null;
}

/**
 * Creates a new product.
 * @param {string|Object} payload 
 */
export async function createProduct(payload) {
    return await postXml('/products', payload);
}

/**
 * Updates a product.
 * @param {number|string} id 
 * @param {string|Object} payload 
 */
export async function updateProduct(id, payload) {
    return await putXml(`/products/${id}`, payload);
}

/**
 * Deletes a product.
 * @param {number|string} id 
 */
export async function deleteProduct(id) {
    return await deleteXml(`/products/${id}`);
}

/**
 * Fetches combinations for a specific product.
 */
export async function getCombinations(productId) {
    const response = await getXml(`/combinations?display=full&filter[id_product]=[${productId}]`);
    return normalizeArray(response?.prestashop?.combinations, 'combination');
}

/**
 * Fetches product option values by IDs (pipe-separated).
 */
export async function getProductOptionValues(ids) {
    const response = await getXml(`/product_option_values?display=full&filter[id]=[${ids}]`);
    return normalizeArray(response?.prestashop?.product_option_values, 'product_option_value');
}

/**
 * Fetches product options by IDs (pipe-separated).
 */
export async function getProductOptions(ids) {
    const response = await getXml(`/product_options?display=full&filter[id]=[${ids}]`);
    return normalizeArray(response?.prestashop?.product_options, 'product_option');
}
