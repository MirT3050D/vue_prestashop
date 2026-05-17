<script setup>
import { onMounted, ref, watch, computed } from 'vue';
import { getImage } from '@/service/api';
import { getProduct, getCombinations, getProductOptionValues, getProductOptions } from '@/service/productService';
import { getProductTaxRate } from '@/service/price';
import Loading from '@/components/Loading.vue';
import { useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import { getStockAvailables } from '@/service/stockService';

const route = useRoute();
const loading = ref(false);
const product = ref(null);
const imageUrl = ref(null);
const variants = ref([]);
const selectedOptions = ref({});
const productCombinations = ref([]);
const quantity = ref(1);
const productTaxRate = ref(0);
const stock = ref(0);

function getLangText(field) {
    if (!field || !field.language) return '';
    if (Array.isArray(field.language)) return field.language[0]['#text'];
    return field.language['#text'];
}

function safeId(node) {
    if (!node) return '';
    if (typeof node === 'object') {
        return String(node['#text'] || node['@_id'] || node.id || '');
    }
    return String(node);
}

async function updateCurrentStock() {
    if (!product.value) return;

    const cleanProductId = safeId(product.value.id);
    let idProductAttribute = '0';

    if (productCombinations.value.length > 0) {
        const currentSelectedValues = [];
        for (const key of Object.keys(selectedOptions.value)) {
            if (selectedOptions.value[key]) {
                currentSelectedValues.push(String(selectedOptions.value[key]));
            }
        }

        const matchingCombination = productCombinations.value.find(comb => {
            const combValues = comb.associations?.product_option_values?.product_option_value;
            if (!combValues) return false;
            const combValueIds = Array.isArray(combValues)
                ? combValues.map(v => safeId(v.id))
                : [safeId(combValues.id)];

            return currentSelectedValues.length === combValueIds.length &&
                currentSelectedValues.every(id => combValueIds.includes(id));
        });

        if (matchingCombination) {
            idProductAttribute = safeId(matchingCombination.id);
        }
    }

    try {
        const stockData = await getStockAvailables(`filter[id_product]=[${cleanProductId}]&filter[id_product_attribute]=[${idProductAttribute}]&display=[quantity]`);
        if (stockData && stockData.length > 0) {
            stock.value = parseInt(stockData[0].quantity, 10) || 0;
        } else {
            stock.value = 0;
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du stock :", error);
        stock.value = 0;
    }
}

// ============================================================================
// CORRECTION : RECHERCHE DE L'IMAGE STRICTE
// ============================================================================
async function updateImage() {
    if (!product.value) return;

    const cleanProductId = safeId(product.value.id);
    const defaultImageId = safeId(product.value.id_default_image);
    let imageIdToFetch = defaultImageId; // Image par défaut du produit

    if (productCombinations.value.length > 0) {
        const currentSelectedValues = [];
        for (const key of Object.keys(selectedOptions.value)) {
            if (selectedOptions.value[key]) {
                currentSelectedValues.push(String(selectedOptions.value[key]));
            }
        }

        let matchingComb = null;
        for (let i = 0; i < productCombinations.value.length; i++) {
            const comb = productCombinations.value[i];
            const combValues = comb.associations?.product_option_values?.product_option_value;
            if (!combValues) continue;

            const combValueIds = Array.isArray(combValues) ? combValues.map(v => safeId(v.id)) : [safeId(combValues.id)];

            let match = true;
            for (let j = 0; j < currentSelectedValues.length; j++) {
                if (!combValueIds.includes(currentSelectedValues[j])) {
                    match = false;
                    break;
                }
            }
            if (match) {
                matchingComb = comb;
                break;
            }
        }

        // Si la déclinaison a une image spécifique, on écrase l'image par défaut
        if (matchingComb && matchingComb.associations && matchingComb.associations.images && matchingComb.associations.images.image) {
            const imgData = matchingComb.associations.images.image;
            const specificImageId = safeId(Array.isArray(imgData) ? imgData[0].id : imgData.id || imgData);
            if (specificImageId) {
                imageIdToFetch = specificImageId;
            }
        }
    }

    // On s'assure d'avoir un ID d'image valide avant d'appeler l'API
    if (imageIdToFetch && imageIdToFetch !== '0') {
        const imgUrl = await getImage(`/images/products/${cleanProductId}/${imageIdToFetch}`);
        if (imgUrl) imageUrl.value = imgUrl;
    }
}

watch(selectedOptions, async () => {
    await updateCurrentStock();
    await updateImage();
}, { deep: true });

onMounted(async () => {
    loading.value = true;
    try {
        const productId = route.params.id;
        product.value = await getProduct(productId);

        productTaxRate.value = await getProductTaxRate(productId);

        // CORRECTION : Chargement initial de l'image par défaut
        const cleanProductId = safeId(product.value.id);
        const defaultImageId = safeId(product.value.id_default_image);
        if (defaultImageId && defaultImageId !== '0') {
            let imgUrl = await getImage(`/images/products/${cleanProductId}/${defaultImageId}`);
            if (imgUrl) imageUrl.value = imgUrl;
        }

        const rawCombinations = await getCombinations(productId);
        const allCombinations = Array.isArray(rawCombinations) ? rawCombinations : (rawCombinations ? [rawCombinations] : []);
        productCombinations.value = allCombinations;

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

                const structuredVariants = [];
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
                variants.value = structuredVariants;

                for (let i = 0; i < structuredVariants.length; i++) {
                    let v = structuredVariants[i];
                    if (v && v.values && v.values.length > 0) {
                        selectedOptions.value[v.name] = safeId(v.values[0].id);
                    }
                }
            }
        }

        await updateCurrentStock();
        // Optionnel : Forcer un premier affichage de l'image de la déclinaison si existante
        await updateImage();
    } catch (error) {
        console.error("Erreur au chargement de la fiche produit:", error);
    } finally {
        loading.value = false;
    }
});

const calculatedPriceTtc = computed(() => {
    if (!product.value) return 0;
    const basePriceHt = parseFloat(product.value.price) || 0;
    return basePriceHt * (1 + productTaxRate.value / 100);
});
</script>
<template>
    <div v-if="loading" class="loading-wrapper">
        <Loading :is-loading="loading" />
    </div>
    <div v-else class="product-page-container">

        <div v-if="product" class="product-content">
            <div class="product-gallery">
                <div class="main-image-wrapper">
                    <img :src="imageUrl || 'https://via.placeholder.com/500'" :alt="getLangText(product.name)"
                        class="main-image" />
                </div>
            </div>

            <div class="product-details">
                <h1 class="product-title">{{ getLangText(product.name) }}</h1>
                <p class="product-reference">Référence : <span>{{ product.reference || 'N/A' }}</span></p>

                <div class="price-container">
                    <span class="price-amount">{{ calculatedPriceTtc.toFixed(2) }} €</span>
                    <span class="price-tax-label">TTC (inclut taxe {{ productTaxRate }}%)</span>
                </div>

                <div class="stock-status-wrapper">
                    <div v-if="stock > 0" class="stock-badge status-ok">
                        <Icon icon="solar:box-check-bold" class="stock-icon" />
                        <span>En stock : <strong>{{ stock }}</strong> unités disponibles</span>
                    </div>
                    <div v-else class="stock-badge status-empty">
                        <Icon icon="solar:box-broken-bold" class="stock-icon" />
                        <span>Rupture de stock (0 disponible)</span>
                    </div>
                </div>

                <hr class="section-divider" />

                <div v-if="variants.length > 0" class="variants-container">
                    <div v-for="variant in variants" :key="variant.id" class="variant-group">
                        <label class="variant-label">{{ variant.name }}</label>
                        <select v-model="selectedOptions[variant.name]" class="variant-select">
                            <option v-for="val in variant.values" :key="val.id" :value="val.id">
                                {{ val.name }}
                            </option>
                        </select>
                    </div>
                </div>

                <div class="actions-container">
                    <div class="quantity-selector">
                        <button @click="quantity > 1 ? quantity-- : null" class="qty-btn"
                            :disabled="stock === 0">-</button>
                        <input type="number" v-model.number="quantity" min="1" :max="stock" class="qty-input"
                            :disabled="stock === 0" />
                        <button @click="quantity < stock ? quantity++ : null" class="qty-btn"
                            :disabled="stock === 0 || quantity >= stock">+</button>
                    </div>

                    <button class="add-to-cart-btn" :disabled="stock === 0 || quantity > stock">
                        <Icon icon="solar:cart-large-minimalistic-bold" class="btn-icon" />
                        <span>{{ stock === 0 ? 'Indisponible' : 'Ajouter au panier' }}</span>
                    </button>
                </div>

                <div class="product-description-section">
                    <h3 class="description-title">Description</h3>
                    <div class="description-body" v-html="getLangText(product.description)"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* ============================================================================
   STYLES COMPLÉMENTAIRES ET BADGES DE STOCK
   ============================================================================ */
.loading-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 50vh;
}

.product-page-container {
    max-width: 1200px;
    margin: 40px auto;
    padding: 0 20px;
    font-family: 'Inter', sans-serif;
    color: #2f3542;
}

.product-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 60px;
}

@media (max-width: 768px) {
    .product-content {
        grid-template-columns: 1fr;
        gap: 30px;
    }
}

.main-image-wrapper {
    background: #f8f9fa;
    border-radius: 20px;
    padding: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.main-image {
    max-width: 100%;
    max-height: 500px;
    object-fit: contain;
    border-radius: 10px;
}

.product-title {
    font-size: 2.2rem;
    font-weight: 800;
    margin-bottom: 8px;
    color: #1e2229;
}

.product-reference {
    font-size: 0.95rem;
    color: #747d8c;
    margin-bottom: 24px;
}

.product-reference span {
    font-weight: 600;
    color: #2f3542;
}

.price-container {
    background-color: #f1f2f6;
    padding: 16px 24px;
    border-radius: 14px;
    display: inline-flex;
    flex-direction: column;
    margin-bottom: 20px;
}

.price-amount {
    font-size: 2rem;
    font-weight: 800;
    color: #2f3542;
}

.price-tax-label {
    font-size: 0.8rem;
    color: #57606f;
    margin-top: 4px;
}

/* Styles spécifiques des statuts de stock */
.stock-status-wrapper {
    margin: 10px 0 20px 0;
}

.stock-badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    border-radius: 30px;
    font-size: 0.95rem;
    font-weight: 500;
}

.status-ok {
    background-color: #e8f5e9;
    color: #2e7d32;
    border: 1px solid #c8e6c9;
}

.status-empty {
    background-color: #ffebee;
    color: #c62828;
    border: 1px solid #ffcdd2;
}

.stock-icon {
    font-size: 1.3rem;
}

.section-divider {
    border: 0;
    height: 1px;
    background: #e4e7eb;
    margin: 25px 0;
}

.variants-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 30px;
}

.variant-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.variant-label {
    font-size: 0.9rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #747d8c;
}

.variant-select {
    padding: 12px;
    border: 1px solid #ced6e0;
    border-radius: 10px;
    background-color: white;
    font-size: 1rem;
    color: #2f3542;
    outline: none;
    cursor: pointer;
    transition: border-color 0.2s;
}

.variant-select:focus {
    border-color: #2f3542;
}

.actions-container {
    display: flex;
    gap: 20px;
    margin-bottom: 40px;
}

.quantity-selector {
    display: flex;
    align-items: center;
    border: 1px solid #ced6e0;
    border-radius: 12px;
    overflow: hidden;
    background: white;
}

.qty-btn {
    background: none;
    border: none;
    width: 45px;
    height: 100%;
    font-size: 1.2rem;
    cursor: pointer;
    transition: background 0.2s;
}

.qty-btn:hover:not(:disabled) {
    background: #f1f2f6;
}

.qty-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.qty-input {
    width: 50px;
    border: none;
    border-left: 1px solid #ced6e0;
    border-right: 1px solid #ced6e0;
    text-align: center;
    font-size: 1rem;
    font-weight: 600;
    outline: none;
    -moz-appearance: textfield;
}

.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.add-to-cart-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 16px 32px;
    background: linear-gradient(135deg, #2f3542, #4a5568);
    color: white;
    border: none;
    border-radius: 14px;
    font-size: 1.05rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s, opacity 0.2s;
}

.add-to-cart-btn:hover:not(:disabled) {
    transform: translateY(-2px);
}

.add-to-cart-btn:disabled {
    background: #ced6e0;
    color: #a4b0be;
    cursor: not-allowed;
    transform: none;
}

.btn-icon {
    font-size: 1.3rem;
}

.product-description-section {
    margin-top: 20px;
}

.description-title {
    font-size: 1.2rem;
    font-weight: 700;
    margin-bottom: 12px;
    color: #2f3542;
}

.description-body {
    font-size: 1rem;
    line-height: 1.6;
    color: #57606f;
}
</style>