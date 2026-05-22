import { getXml, postXml, putXml, deleteXml } from '@/service/api';
import { getLangText, extractId as safeId } from '@/service/prestashopUtils';
import { getProductTaxRate } from '@/service/price';

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

/**
 * Loads full product details including variants, combinations, and initial options.
 */
export async function getFullProductDetails(productId) {
    const product = await getProduct(productId);
    if (!product) return null;

    const taxRate = await getProductTaxRate(productId);
    
    const allCombinations = await getCombinations(productId);
    let structuredVariants = [];
    let defaultSelectedOptions = {};

    if (allCombinations.length > 0) {
        const optionValuesIds = new Set();
        for (let i = 0; i < allCombinations.length; i++) {
            let combValues = allCombinations[i].associations?.product_option_values?.product_option_value;
            if (!combValues) continue;
            if (Array.isArray(combValues)) {
                for (let j = 0; j < combValues.length; j++) optionValuesIds.add(safeId(combValues[j].id));
            } else {
                optionValuesIds.add(safeId(combValues.id));
            }
        }

        if (optionValuesIds.size > 0) {
            const filterIds = `[${Array.from(optionValuesIds).join('|')}]`;
            const rawValues = await getProductOptionValues(filterIds);
            const values = Array.isArray(rawValues) ? rawValues : (rawValues ? [rawValues] : []);

            const optionGroupsIds = new Set();
            for (let i = 0; i < values.length; i++) {
                if (values[i]) {
                    optionGroupsIds.add(safeId(values[i].id_attribute_group));
                }
            }

            const filterGroupIds = `[${Array.from(optionGroupsIds).join('|')}]`;
            const rawGroups = await getProductOptions(filterGroupIds);
            const groups = Array.isArray(rawGroups) ? rawGroups : (rawGroups ? [rawGroups] : []);

            for (let i = 0; i < groups.length; i++) {
                let group = groups[i];
                if (!group) continue;

                let groupValues = values.filter(v => v && safeId(v.id_attribute_group) === safeId(group.id));
                structuredVariants.push({
                    id: safeId(group.id),
                    name: getLangText(group.name),
                    values: groupValues.map(v => ({ id: safeId(v.id), name: getLangText(v.name) }))
                });
            }

            // Initialisation intelligente avec la première déclinaison existante et valide du produit
            if (allCombinations.length > 0) {
                const firstComb = allCombinations[0];
                const combValues = firstComb.associations?.product_option_values?.product_option_value;
                const firstCombValueIds = Array.isArray(combValues)
                    ? combValues.map(v => safeId(v.id))
                    : [safeId(combValues.id)];

                for (let i = 0; i < structuredVariants.length; i++) {
                    let v = structuredVariants[i];
                    if (v && v.values && v.values.length > 0) {
                        const matchingVal = v.values.find(val => firstCombValueIds.includes(String(val.id)));
                        if (matchingVal) {
                            defaultSelectedOptions[v.name] = matchingVal.id;
                        } else {
                            defaultSelectedOptions[v.name] = v.values[0].id;
                        }
                    }
                }
            } else {
                for (let i = 0; i < structuredVariants.length; i++) {
                    let v = structuredVariants[i];
                    if (v && v.values && v.values.length > 0) {
                        defaultSelectedOptions[v.name] = safeId(v.values[0].id);
                    }
                }
            }
        }
    }

    return {
        product,
        taxRate,
        combinations: allCombinations,
        variants: structuredVariants,
        defaultSelectedOptions
    };
}

/**
 * Finds the correct image ID for a selected combination.
 */
export function getCombinationImageId(defaultImageId, productCombinations, selectedOptions) {
    let imageIdToFetch = defaultImageId;

    if (productCombinations && productCombinations.length > 0) {
        const currentSelectedValues = [];
        for (const key of Object.keys(selectedOptions)) {
            if (selectedOptions[key]) {
                currentSelectedValues.push(String(selectedOptions[key]));
            }
        }

        let matchingComb = null;
        for (let i = 0; i < productCombinations.length; i++) {
            const comb = productCombinations[i];
            const combValues = comb.associations?.product_option_values?.product_option_value;
            if (!combValues) continue;

            const combValueIds = Array.isArray(combValues) ? combValues.map(v => safeId(v.id)) : [safeId(combValues.id)];

            if (combValueIds.every(id => currentSelectedValues.includes(id))) {
                matchingComb = comb;
                break;
            }
        }

        if (matchingComb && matchingComb.associations && matchingComb.associations.images && matchingComb.associations.images.image) {
            const imgData = matchingComb.associations.images.image;
            const specificImageId = safeId(Array.isArray(imgData) ? imgData[0].id : imgData.id || imgData);
            if (specificImageId) {
                imageIdToFetch = specificImageId;
            }
        }
    }
    return imageIdToFetch;
}

/**
 * Determines which values are available for a given variant based on the current selections.
 */
export function getAvailableValuesForVariant(variant, allVariants, productCombinations, selectedOptions) {
    if (!variant || !variant.values) return [];
    if (!productCombinations || productCombinations.length === 0) return variant.values;

    return variant.values.filter(val => {
        return productCombinations.some(comb => {
            const combValues = comb.associations?.product_option_values?.product_option_value;
            if (!combValues) return false;
            
            const combValueIds = Array.isArray(combValues)
                ? combValues.map(v => safeId(v.id))
                : [safeId(combValues.id)];

            // Le valueId recherché doit être présent
            if (!combValueIds.includes(String(val.id))) return false;

            // Et toutes les autres sélections déjà faites doivent être compatibles
            for (const v of allVariants) {
                if (v.name === variant.name) continue;

                // Si ce groupe de déclinaison n'est pas du tout défini/utilisé dans cette combinaison, on ignore sa sélection
                const isGroupUsed = v.values.some(value => combValueIds.includes(String(value.id)));
                if (!isGroupUsed) continue;

                const selectedValId = selectedOptions[v.name];
                if (selectedValId && !combValueIds.includes(String(selectedValId))) {
                    return false;
                }
            }

            return true;
        });
    });
}
