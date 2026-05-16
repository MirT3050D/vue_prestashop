import { getXml } from './api';

/**
 * Récupère les stocks disponibles avec filtres optionnels.
 * 
 * @param {string|Object} params Paramètres display, filter, limit, etc.
 * @returns {Promise<Array>} Liste des stocks normalisée
 */
export async function getStockAvailables(params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const data = await getXml(`/stock_availables${query ? '?' + query : ''}`);
    const stocks = data?.prestashop?.stock_availables?.stock_available || [];
    return Array.isArray(stocks) ? stocks : [stocks];
}
