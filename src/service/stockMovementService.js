
import { safeValue, getLangText } from '@/service/prestashopUtils';
import { getXml, postXml } from '@/service/api';
import { getProducts } from '@/service/productService';

// ============================================================================
// 1. RÉSOLUTION D'INFORMATIONS DE STOCK
// ============================================================================

export function getMovementStockInfo(mvt, stockAvailables) {
    const stockId = safeValue(mvt.id_stock);
    if (!stockId || stockId === '0') return null;
    return stockAvailables.find(sa => String(safeValue(sa.id)) === String(stockId)) || null;
}

export function isLegacyImportMovement(mvt) {
    return safeValue(mvt.id_stock) === '0' && safeValue(mvt.id_stock_mvt_reason) === '11';
}

// ============================================================================
// 2. DÉCODAGE DES NOMS ET DES DÉCLINAISONS
// ============================================================================

export function getMovementProductName(mvt, products, stockAvailables) {
    let pId = safeValue(mvt.id_product);
    if (!pId || pId === '0') {
        const stockInfo = getMovementStockInfo(mvt, stockAvailables);
        pId = stockInfo ? safeValue(stockInfo.id_product) : '';
    }
    if ((!pId || pId === '0') && isLegacyImportMovement(mvt)) {
        pId = safeValue(mvt.id_order);
    }
    if (pId && pId !== '0') {
        const prod = products.find(p => String(p.id) === String(pId));
        if (prod) return getLangText(prod.name);
        return `Article #${pId}`;
    }
    return 'Article Inconnu';
}

export function getMovementVariantName(mvt, combinations, stockAvailables) {
    let attrId = safeValue(mvt.id_product_attribute);
    if (!attrId || attrId === '0') {
        const stockInfo = getMovementStockInfo(mvt, stockAvailables);
        attrId = stockInfo ? safeValue(stockInfo.id_product_attribute) : '';
    }
    if ((!attrId || attrId === '0') && isLegacyImportMovement(mvt)) {
        attrId = safeValue(mvt.id_supply_order);
    }
    if (!attrId || attrId === '0') return 'Produit simple';

    const comb = combinations.find(c => String(safeValue(c.id)) === String(attrId));
    if (comb && comb.reference) {
        const refText = safeValue(comb.reference);
        const parts = refText.split('_');
        if (parts.length > 1) {
            const variantName = parts.slice(1).join(' ');
            return variantName.charAt(0).toUpperCase() + variantName.slice(1);
        }
        return refText;
    }
    return `Déclinaison #${attrId}`;
}

export function getReasonLabel(reasonId, sign) {
    const id = String(reasonId);
    if (id === '11') return 'Importation initiale / Ajustement';
    if (id === '12') return 'Régularisation négative';
    return String(sign) === '1' ? 'Entrée de marchandises' : 'Sortie de marchandises (Commande)';
}

// ============================================================================
// 3. RÉSOLUTION D'ID PRODUIT ET FILTRAGE
// ============================================================================

export function getMovementProductId(mvt, stockAvailables) {
    let mvtId = safeValue(mvt.id_product);
    if (!mvtId || mvtId === '0') {
        const stockInfo = getMovementStockInfo(mvt, stockAvailables);
        mvtId = stockInfo ? safeValue(stockInfo.id_product) : '';
    }
    if ((!mvtId || mvtId === '0') && isLegacyImportMovement(mvt)) {
        mvtId = safeValue(mvt.id_order);
    }
    return mvtId;
}

export function filterMovements(movements, selectedProductId, startDate, endDate, stockAvailables) {
    let result = movements;

    // 1. Filtre par article
    if (selectedProductId !== 'all') {
        result = result.filter(mvt => {
            const mvtId = getMovementProductId(mvt, stockAvailables);
            return String(mvtId) === String(selectedProductId);
        });
    }

    // 2. Filtre par date de début (Du)
    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0); // Permet d'inclure les mouvements dès minuit
        result = result.filter(mvt => {
            const mvtDate = new Date(safeValue(mvt.date_add));
            return mvtDate >= start;
        });
    }

    // 3. Filtre par date de fin (Au)
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Permet d'inclure les mouvements jusqu'à 23h59
        result = result.filter(mvt => {
            const mvtDate = new Date(safeValue(mvt.date_add));
            return mvtDate <= end;
        });
    }

    return result;
}

// ============================================================================
// 4. CHARGEMENT ET CRÉATION
// ============================================================================

export async function loadAllMovementData() {
    const [rawProducts, responseCombs, responseMvts] = await Promise.all([
        getProducts('display=full'),
        getXml('/combinations?display=full'),
        getXml('/stock_movements?display=full')
    ]);

    const products = rawProducts || [];

    const combsList = responseCombs?.prestashop?.combinations?.combination;
    const combinations = Array.isArray(combsList) ? combsList : (combsList ? [combsList] : []);

    const rawMvts = responseMvts?.prestashop?.stock_movements?.stock_movement
        || responseMvts?.prestashop?.stock_mvts?.stock_mvt;
    let movements = Array.isArray(rawMvts) ? rawMvts : (rawMvts ? [rawMvts] : []);

    const responseStockAvailables = await getXml('/stock_availables?display=full');
    const rawStocks = responseStockAvailables?.prestashop?.stock_availables?.stock_available;
    const stockAvailables = Array.isArray(rawStocks) ? rawStocks : (rawStocks ? [rawStocks] : []);

    movements.sort((a, b) => {
        const dateA = new Date(safeValue(a.date_add)).getTime();
        const dateB = new Date(safeValue(b.date_add)).getTime();
        return dateB - dateA;
    });

    return { products, combinations, movements, stockAvailables };
}

export async function createStockMovement(productId, attributeId, quantity, sign, reasonId) {
    const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const mvtXml = `<?xml version="1.0" encoding="UTF-8"?>
    <prestashop>
        <stock_mvt>
            <id_order><![CDATA[${productId}]]></id_order>
            <id_supply_order><![CDATA[${attributeId || 0}]]></id_supply_order>
            <id_employee><![CDATA[1]]></id_employee>
            <id_stock><![CDATA[0]]></id_stock>
            <id_stock_mvt_reason><![CDATA[${reasonId}]]></id_stock_mvt_reason>
            <physical_quantity><![CDATA[${Math.abs(quantity)}]]></physical_quantity>
            <sign><![CDATA[${sign}]]></sign>
            <price_te><![CDATA[0.000000]]></price_te>
            <date_add><![CDATA[${dateAdd}]]></date_add>
        </stock_mvt>
    </prestashop>`;
    await postXml('/stock_movements', mvtXml);
}
