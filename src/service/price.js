// Outil central d'appels API
import { getXml } from '@/service/api';

// Cache mémoire pour éviter de demander le taux de taxe à PrestaShop pour chaque produit
const cache = new Map();

/**
 * Normalise les nœuds de ressources PrestaShop pour toujours retourner un tableau.
 * Résout le problème classique: 1 item = Object, 2 items = Array.
 */
function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

/**
 * Extrait brutalement la valeur textuelle d'un nœud XML.
 */
function getNodeText(value) {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'object') return value['#text'] ?? null;
    return null;
}

/**
 * Récupère toutes les Taxes brutes (ex: TVA 20%, TVA 5.5%).
 */
export async function getTaxes(params = 'display=full') {
    const response = await getXml(`/taxes?${params}`);
    return normalizeArray(response?.prestashop?.taxes, 'tax');
}

/**
 * Récupère toutes les Règles de Taxes (Liaison entre la taxe, le pays, etc.).
 */
export async function getTaxRules(params = 'display=full') {
    const response = await getXml(`/tax_rules?${params}`);
    return normalizeArray(response?.prestashop?.tax_rules, 'tax_rule');
}

/**
 * Calcule le taux de taxe applicable pour un "Groupe de règles de taxes" (Tax Rule Group).
 * PrestaShop ne donne pas la taxe sur le produit directement, il donne l'ID du groupe de taxes.
 * Il faut chercher dans le groupe quelle est la taxe par défaut.
 * Le résultat est mis en cache (Map) pour accélérer le processus.
 */
async function getTaxRateForGroup(taxRulesGroupId) {
    if (!taxRulesGroupId || taxRulesGroupId === '0') return 0;

    const groupKey = String(taxRulesGroupId);
    // Vérification du Cache
    const cached = cache.get(`group:${groupKey}`);
    if (cached != null) return cached;

    try {
        // 1. Cherche la règle associée à ce groupe
        const rules = await getTaxRules(`filter[id_tax_rules_group]=[${taxRulesGroupId}]&display=[id,id_tax]`);
        if (rules.length === 0) return 0;

        // 2. Trouve l'ID de la taxe finale
        const taxId = getNodeText(rules[0].id_tax);
        // 3. Cherche le pourcentage (rate) de cette taxe
        const taxResp = await getXml(`/taxes/${taxId}?display=[rate]`);
        const rate = Number(getNodeText(taxResp?.prestashop?.tax?.rate) || 0);
        
        const normalizedRate = Number.isFinite(rate) ? rate : 0;
        // Met en cache pour la suite
        cache.set(`group:${groupKey}`, normalizedRate);
        return normalizedRate;
    } catch (error) {
        return 0; // Fallback sécuritaire (TTC = HT)
    }
}

/**
 * Fonction publique la plus utilisée du fichier.
 * On lui donne un ID produit, elle renvoie son Taux de TVA (ex: 20).
 * Va chercher le produit, lit son 'id_tax_rules_group', puis délègue le travail.
 */
export async function getProductTaxRate(productId) {
    if (!productId) return 0;

    const productKey = String(productId);
    const cached = cache.get(productKey);
    if (cached != null) return cached;

    try {
        // Interroge l'API pour connaître la règle de taxe du produit
        const productResp = await getXml(`/products/${productId}?display=[id,id_tax_rules_group]`);
        const taxRulesGroupId = getNodeText(productResp?.prestashop?.product?.id_tax_rules_group) || '0';
        // Calcule le taux final
        const rate = await getTaxRateForGroup(taxRulesGroupId);
        
        // Sauvegarde dans le cache produit
        cache.set(productKey, rate);
        return rate;
    } catch (error) {
        return 0;
    }
}

/**
 * Calcul mathématique classique pour passer du HT au TTC.
 * Formule: HT * (1 + (TVA / 100))
 * Utilise Math.round pour éviter les erreurs de virgule flottante en Javascript (0.1 + 0.2 = 0.30000004).
 */
export function calculateTtc(priceHt, taxRate = 0) {
    const base = Number(priceHt) || 0;
    const rate = Number(taxRate) || 0;
    return Math.round(base * (1 + rate / 100) * 100) / 100;
}