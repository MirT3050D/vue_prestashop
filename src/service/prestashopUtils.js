/**
 * prestashopUtils.js
 * 
 * Service utilitaire partagé pour le parsing des réponses XML PrestaShop.
 * Centralise toutes les fonctions dupliquées dans les vues.
 */

/**
 * Extrait le texte d'un nœud XML PrestaShop.
 * Gère les cas : objet avec #text, string, number, null/undefined.
 */
export function extractText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        if (typeof value['#text'] !== 'undefined') return String(value['#text']);
        if (typeof value['@_id'] !== 'undefined') return String(value['@_id']);
        if (typeof value.id !== 'undefined') return String(value.id);
        const values = Object.values(value);
        if (values.length === 1 && typeof values[0] !== 'object') return String(values[0]);
        return '';
    }
    return String(value);
}

/**
 * Alias sécurisé de extractText, pour compatibilité.
 */
export function safeValue(node) {
    if (node === undefined || node === null) return '';
    if (typeof node === 'object') {
        return String(node['#text'] || node.id || node['@_id'] || '');
    }
    const str = String(node);
    return str === 'undefined' ? '' : str;
}

/**
 * Extrait un ID depuis un nœud XML (gère #text, @_id, id, @id).
 */
export function extractId(node) {
    if (!node) return '0';
    if (typeof node === 'object') return String(node['#text'] || node['@_id'] || node.id || '0');
    return String(node);
}

/**
 * Normalise un ID en string.
 */
export function normalizeId(id) {
    if (id && typeof id === 'object') return String(id['#text'] ?? id);
    return String(id ?? '');
}

/**
 * Convertit une valeur en nombre (gère les virgules comme séparateur décimal).
 */
export function toNumber(v) {
    if (v == null) return 0;
    const valueAsString = String(v).replace(',', '.');
    const parsedNumber = parseFloat(valueAsString);
    return Number.isFinite(parsedNumber) ? parsedNumber : 0;
}

/**
 * Extrait le texte multilingue d'un champ PrestaShop (language node).
 */
export function getLangText(field) {
    if (!field || !field.language) return '';
    if (Array.isArray(field.language)) return field.language[0]['#text'] || '';
    return field.language['#text'] || '';
}

/**
 * Extrait le texte multilingue avec fallbacks.
 * Gère : string, number, array, object avec #text/language.
 */
export function getLanguageText(node) {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) {
        const first = node[0];
        if (first && typeof first === 'object' && first['#text']) return String(first['#text']);
        if (first) return String(first);
        return '';
    }
    if (typeof node === 'object') {
        if (node['#text']) return String(node['#text']);
        if (node.language) return getLangText({ language: node.language });
        return '';
    }
    return '';
}

/**
 * Garantit qu'un nœud est un tableau (normalise les réponses XML single-item).
 */
export function normalizeArray(node) {
    if (!node) return [];
    return Array.isArray(node) ? node : [node];
}

/**
 * Extrait les lignes d'une commande (order_rows).
 */
export function getOrderRows(order) {
    if (!order || !order.associations || !order.associations.order_rows) return [];
    return normalizeArray(order.associations.order_rows.order_row);
}

/**
 * Extrait les lignes d'un panier (cart_rows).
 */
export function getCartRows(cart) {
    const assoc = cart?.associations;
    if (!assoc || !assoc.cart_rows) return [];
    const rawRows = assoc.cart_rows.cart_row || assoc.cart_rows;
    return Array.isArray(rawRows) ? rawRows : (rawRows && typeof rawRows === 'object' ? [rawRows] : []);
}

/**
 * Formate un nombre en montant monétaire (2 décimales).
 */
export function formatMoney(value) {
    const amount = Number(value) || 0;
    return amount.toFixed(2);
}

/**
 * Formate une date en chaîne locale française.
 */
export function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Extrait les items d'une collection XML PrestaShop.
 */
export function getCollectionItems(payload, target) {
    if (!payload || !payload.prestashop) return [];
    const collection = payload.prestashop[target.collectionKey];
    if (!collection) return [];
    const items = collection[target.itemKey];
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
}

/**
 * Extrait l'ID d'un item de collection (gère @_id, id, @id).
 */
export function extractItemId(item) {
    if (!item) return null;
    if (item['@_id']) return item['@_id'];
    if (item.id) {
        if (typeof item.id === 'object' && item.id['#text']) return item.id['#text'];
        return item.id;
    }
    if (item['@id']) return item['@id'];
    return null;
}

/**
 * Normalise le texte d'un formulaire (extractText + trim).
 */
export function normalizeFormText(value) {
    return extractText(value).trim();
}

/**
 * Extrait le nom de catégorie depuis un map.
 */
export function getCategoryName(categoryId, categoryMap) {
    if (!categoryId) return 'Sans categorie';
    return categoryMap[categoryId] || 'Sans categorie';
}
