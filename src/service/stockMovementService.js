// Utilitaires
import { safeValue, getLangText } from '@/service/prestashopUtils';
import { getXml, postXml } from '@/service/api';
import { getProducts } from '@/service/productService';

// ============================================================================
// 1. RÉSOLUTION D'INFORMATIONS DE STOCK
// ============================================================================

/**
 * Les mouvements de stock PrestaShop (stock_mvt) sont souvent liés à la ressource `stock_available`.
 * Cette fonction retrouve la ligne d'inventaire associée au mouvement.
 */
export function getMovementStockInfo(mvt, stockAvailables) {
    const stockId = safeValue(mvt.id_stock);
    if (!stockId || stockId === '0') return null;
    return stockAvailables.find(sa => String(safeValue(sa.id)) === String(stockId)) || null;
}

/**
 * Détecte si un mouvement est un "Mouvement Legacy" (Ancienne méthode d'importation manuelle).
 * Ces mouvements n'étaient pas liés proprement au `stock_available` (id_stock = 0).
 */
export function isLegacyImportMovement(mvt) {
    const reason = safeValue(mvt.id_stock_mvt_reason);
    // 11 = Import initial, 12 = Régularisation, 3 = Commande
    return safeValue(mvt.id_stock) === '0' && (reason === '11' || reason === '12' || reason === '3');
}

// ============================================================================
// 2. DÉCODAGE DES NOMS ET DES DÉCLINAISONS
// ============================================================================

/**
 * Tente de retrouver le nom humain (ex: T-Shirt Noir) à partir d'un mouvement brut.
 * Processus : Cherche dans id_product -> Cherche dans stock_available -> Cherche dans l'ancienne méthode -> Fait le mapping.
 */
export function getMovementProductName(mvt, products, stockAvailables) {
    let pId = safeValue(mvt.id_product);
    if (!pId || pId === '0') {
        const stockInfo = getMovementStockInfo(mvt, stockAvailables);
        pId = stockInfo ? safeValue(stockInfo.id_product) : '';
    }
    // Si c'est un vieil import mal formaté, l'ID Produit était caché dans id_order
    if ((!pId || pId === '0') && isLegacyImportMovement(mvt)) {
        pId = safeValue(mvt.id_order);
    }
    // Si on a l'ID, on cherche le nom dans le dictionnaire des produits
    if (pId && pId !== '0') {
        const prod = products.find(p => String(p.id) === String(pId));
        if (prod) return getLangText(prod.name);
        return `Article #${pId}`; // Fallback si le produit a été supprimé
    }
    return 'Article Inconnu';
}

/**
 * Tente de retrouver le nom de la déclinaison (ex: Taille L, Couleur Rouge).
 */
export function getMovementVariantName(mvt, combinations, stockAvailables) {
    let attrId = safeValue(mvt.id_product_attribute);
    if (!attrId || attrId === '0') {
        const stockInfo = getMovementStockInfo(mvt, stockAvailables);
        attrId = stockInfo ? safeValue(stockInfo.id_product_attribute) : '';
    }
    // Pour les vieux imports, c'était caché dans id_supply_order
    if ((!attrId || attrId === '0') && isLegacyImportMovement(mvt)) {
        attrId = safeValue(mvt.id_supply_order);
    }
    if (!attrId || attrId === '0') return 'Produit simple';

    // Formate la référence de la combinaison (ex: REF_TailleM -> Taille M)
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

/**
 * Traduit le code de la "Raison du mouvement" en texte clair pour l'interface.
 */
export function getReasonLabel(reasonId, sign) {
    const id = String(reasonId);
    if (id === '11') return 'Importation initiale / Ajustement';
    if (id === '12') return 'Régularisation négative';
    return String(sign) === '1' ? 'Entrée de marchandises' : 'Sortie de marchandises (Commande)';
}

// ============================================================================
// 3. RÉSOLUTION D'ID PRODUIT ET FILTRAGE
// ============================================================================

/**
 * Extrait l'ID Produit de manière fiable, peu importe comment le mouvement a été créé.
 */
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

/**
 * Moteur de filtrage côté client pour la vue "Historique des Mouvements".
 * Filtre par Produit, Date de début, Date de fin.
 */
export function filterMovements(movements, selectedProductId, startDate, endDate, stockAvailables) {
    let result = movements;

    // 1. Filtre par article (Menu déroulant)
    if (selectedProductId !== 'all') {
        result = result.filter(mvt => {
            const mvtId = getMovementProductId(mvt, stockAvailables);
            return String(mvtId) === String(selectedProductId);
        });
    }

    // 2. Filtre par date de début (Du)
    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0); // Permet d'inclure les mouvements dès minuit (00:00:00)
        result = result.filter(mvt => {
            const mvtDate = new Date(safeValue(mvt.date_add));
            return mvtDate >= start;
        });
    }

    // 3. Filtre par date de fin (Au)
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Permet d'inclure les mouvements jusqu'à 23h59:59
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

/**
 * Architecte de la page Historique de Stock.
 * Charge en parallèle (gain de temps) les Produits, les Déclinaisons, les Mouvements, et les Stocks Disponibles.
 * Trie les mouvements du plus récent au plus ancien.
 */
export async function loadAllMovementData() {
    const [rawProducts, responseCombs, responseMvts] = await Promise.all([
        getProducts('display=full'),
        getXml('/combinations?display=full'),
        getXml('/stock_movements?display=full') // Particularité: L'endpoint /stock_movements renvoie du <stock_movement>
    ]);

    const products = rawProducts || [];

    const combsList = responseCombs?.prestashop?.combinations?.combination;
    const combinations = Array.isArray(combsList) ? combsList : (combsList ? [combsList] : []);

    // Gère les variations du nom du nœud XML selon la version de l'API PrestaShop
    const rawMvts = responseMvts?.prestashop?.stock_movements?.stock_movement
        || responseMvts?.prestashop?.stock_mvts?.stock_mvt;
    let movements = Array.isArray(rawMvts) ? rawMvts : (rawMvts ? [rawMvts] : []);

    const responseStockAvailables = await getXml('/stock_availables?display=full');
    const rawStocks = responseStockAvailables?.prestashop?.stock_availables?.stock_available;
    const stockAvailables = Array.isArray(rawStocks) ? rawStocks : (rawStocks ? [rawStocks] : []);

    // Tri par date décroissante
    movements.sort((a, b) => {
        const dateA = new Date(safeValue(a.date_add)).getTime();
        const dateB = new Date(safeValue(b.date_add)).getTime();
        return dateB - dateA;
    });

    return { products, combinations, movements, stockAvailables };
}

/**
 * Crée artificiellement un mouvement de stock (sans toucher au calcul réel de PrestaShop).
 * Utilisé principalement pour des réajustements comptables manuels.
 */
export async function createStockMovement(productId, attributeId, quantity, sign, reasonId) {
    const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const mvtXml = `<?xml version="1.0" encoding="UTF-8"?>
    <prestashop>
        <stock_mvt>
            <id_order><![CDATA[${productId}]]></id_order> <!-- Utilisation détournée par le développeur d'origine -->
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
