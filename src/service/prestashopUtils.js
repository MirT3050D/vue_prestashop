/**
 * prestashopUtils.js
 * 
 * Service utilitaire partagé pour le parsing des réponses XML PrestaShop.
 * Centralise toutes les fonctions dupliquées dans les vues.
 */

/**
 * Extrait le texte d'un nœud XML PrestaShop.
 * Gère les cas : objet avec #text, string, number, null/undefined.
 * Très utile car "fast-xml-parser" renvoie souvent des structures imprévisibles.
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
 * Alias sécurisé de extractText, pour compatibilité avec d'anciens composants.
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
 * Normalise un ID en string pour s'assurer qu'il peut être utilisé dans des URLs.
 */
export function normalizeId(id) {
    if (id && typeof id === 'object') return String(id['#text'] ?? id);
    return String(id ?? '');
}

/**
 * Convertit une valeur en nombre de façon robuste.
 * (gère les virgules comme séparateur décimal, ce qui est fréquent en saisie française).
 */
export function toNumber(v) {
    if (v == null) return 0;
    const valueAsString = String(v).replace(',', '.');
    const parsedNumber = parseFloat(valueAsString);
    return Number.isFinite(parsedNumber) ? parsedNumber : 0;
}

/**
 * Extrait le texte multilingue d'un champ PrestaShop (language node).
 * PrestaShop renvoie souvent: { language: { '@_id': '1', '#text': 'T-Shirt' } }
 */
export function getLangText(field) {
    if (!field || !field.language) return '';
    if (Array.isArray(field.language)) return field.language[0]['#text'] || '';
    return field.language['#text'] || '';
}

/**
 * Extrait le texte multilingue avec des fallbacks (Solution de secours).
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
 * Si PrestaShop ne renvoie qu'un produit, c'est un objet. S'il en renvoie deux, c'est un Array.
 * Cette fonction enveloppe l'objet unique dans un Array pour utiliser .map() ou .forEach().
 */
export function normalizeArray(node) {
    if (!node) return [];
    return Array.isArray(node) ? node : [node];
}

/**
 * Extrait de façon sécurisée les lignes de produits d'une commande (order_rows).
 */
export function getOrderRows(order) {
    if (!order || !order.associations || !order.associations.order_rows) return [];
    return normalizeArray(order.associations.order_rows.order_row);
}

/**
 * Extrait de façon sécurisée les lignes de produits d'un panier (cart_rows).
 */
export function getCartRows(cart) {
    const assoc = cart?.associations;
    if (!assoc || !assoc.cart_rows) return [];
    const rawRows = assoc.cart_rows.cart_row || assoc.cart_rows;
    return Array.isArray(rawRows) ? rawRows : (rawRows && typeof rawRows === 'object' ? [rawRows] : []);
}

/**
 * Formate un nombre en montant monétaire avec toujours 2 décimales (ex: 15.00).
 */
export function formatMoney(value) {
    const amount = Number(value) || 0;
    return amount.toFixed(2);
}

/**
 * Formate une date brute (ISO ou SQL) en chaîne locale française (ex: 12 janvier 2024).
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
 * Extrait dynamiquement les éléments d'une collection XML PrestaShop.
 * Utilisé par les hooks génériques ou les Tableaux de bord.
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
 * Extrait l'ID d'un élément de collection dynamique.
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
 * Nettoie le texte entré par l'utilisateur (espaces en trop) et extrait la valeur si c'est un objet XML.
 */
export function normalizeFormText(value) {
    return extractText(value).trim();
}

/**
 * Rapatrie le nom de la catégorie depuis un dictionnaire de Cache (Map).
 * Retourne "Sans categorie" si non trouvé.
 */
export function getCategoryName(categoryId, categoryMap) {
    if (!categoryId) return 'Sans categorie';
    return categoryMap[categoryId] || 'Sans categorie';
}
