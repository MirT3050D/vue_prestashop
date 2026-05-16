import { getXml } from '@/service/api';

const cache = new Map();

function getNodeText(value) {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'object') return value['#text'] ?? null;
    return null;
}

async function getTaxRateForGroup(taxRulesGroupId) {
    if (!taxRulesGroupId || taxRulesGroupId === '0') return 0;

    const groupKey = String(taxRulesGroupId);
    const cached = cache.get(`group:${groupKey}`);
    if (cached != null) return cached;

    try {
        const rulesResp = await getXml(`/tax_rules?filter[id_tax_rules_group]=[${taxRulesGroupId}]&display=[id,id_tax]`);
        const rulesNode = rulesResp?.prestashop?.tax_rules?.tax_rule;
        const rules = Array.isArray(rulesNode) ? rulesNode : (rulesNode ? [rulesNode] : []);
        if (rules.length === 0) return 0;

        const taxId = getNodeText(rules[0].id_tax);
        const taxResp = await getXml(`/taxes/${taxId}?display=[rate]`);
        const rate = Number(getNodeText(taxResp?.prestashop?.tax?.rate) || 0);
        const normalizedRate = Number.isFinite(rate) ? rate : 0;
        cache.set(`group:${groupKey}`, normalizedRate);
        return normalizedRate;
    } catch (error) {
        return 0;
    }
}

export async function getProductTaxRate(productId) {
    if (!productId) return 0;

    const productKey = String(productId);
    const cached = cache.get(productKey);
    if (cached != null) return cached;

    try {
        const productResp = await getXml(`/products/${productId}?display=[id,id_tax_rules_group]`);
        const taxRulesGroupId = getNodeText(productResp?.prestashop?.product?.id_tax_rules_group) || '0';
        const rate = await getTaxRateForGroup(taxRulesGroupId);
        cache.set(productKey, rate);
        return rate;
    } catch (error) {
        return 0;
    }
}

export function calculateTtc(priceHt, taxRate = 0) {
    const base = Number(priceHt) || 0;
    const rate = Number(taxRate) || 0;
    return Math.round(base * (1 + rate / 100) * 100) / 100;
}