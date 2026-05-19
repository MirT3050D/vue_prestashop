# Service : Calculateur Financier (`price.js`)

Ce service centralise les calculs de TVA, de taxes et de conversions HT/TTC basés sur la configuration de la boutique PrestaShop.

---

## ⚙️ Rôle et Fonctionnement

*   **Résolution récursive de la taxe (`getProductTaxRate`)** :
    *   PrestaShop lie un produit à un groupe de règles de taxes (`id_tax_rules_group`).
    *   Pour trouver le taux applicable (ex: 20%), le script récupère d'abord les règles associées à ce groupe, en extrait l'ID de la taxe principale (`id_tax`), puis charge la fiche de la taxe pour en lire le taux réel (`rate`).
*   **Mécanisme de Cache en mémoire** :
    *   La résolution récursive des taxes nécessite plusieurs requêtes HTTP consécutives. 
    *   Le service intègre une structure de cache (`new Map()`) pour mémoriser les taux par ID produit et par ID groupe de taxe afin de ne faire les appels réseau qu'une seule fois par session.
*   **Conversion de Prix (`calculateTtc`)** : Convertit un prix HT en TTC selon le taux de taxe et arrondit le résultat à deux décimales.

---

## 🛠️ Code Principal

Voici l'implémentation de la logique de calcul fiscale dans `src/service/price.js` :

```javascript
import { getXml } from '@/service/api';

// Cache en mémoire pour accélérer la résolution des taxes
const cache = new Map();

function getNodeText(value) {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'object') return value['#text'] ?? null;
    return null;
}

// Récupère le taux de taxe affecté à un groupe de règle fiscale
async function getTaxRateForGroup(taxRulesGroupId) {
    if (!taxRulesGroupId || taxRulesGroupId === '0') return 0;

    const groupKey = String(taxRulesGroupId);
    const cached = cache.get(`group:${groupKey}`);
    if (cached != null) return cached;

    try {
        const rules = await getTaxRules(`filter[id_tax_rules_group]=[${taxRulesGroupId}]&display=[id,id_tax]`);
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

// Récupère le taux de TVA d'un produit (avec cache)
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

// Convertit le HT en TTC avec arrondi à 2 décimales
export function calculateTtc(priceHt, taxRate = 0) {
    const base = Number(priceHt) || 0;
    const rate = Number(taxRate) || 0;
    return Math.round(base * (1 + rate / 100) * 100) / 100;
}
```
