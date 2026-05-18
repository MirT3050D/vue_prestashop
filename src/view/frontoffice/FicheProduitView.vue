<script setup>
import { onMounted, ref, watch, computed } from 'vue';
import { getImage } from '@/service/api';
import { getProduct, getCombinations, getProductOptionValues, getProductOptions } from '@/service/productService';
import { getProductTaxRate } from '@/service/price';
import Loading from '@/components/Loading.vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { getStockAvailables } from '@/service/stockService';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const cartSuccessMessage = ref('');
const showCartNotification = ref(false);
const product = ref(null);
const imageUrl = ref(null);
const variants = ref([]);
const selectedOptions = ref({});
const productCombinations = ref([]);
const lastSelectedOptions = ref({});
const quantity = ref(1);
const productTaxRate = ref(0);
const stock = ref(0);
const cartQuantity = ref(0);

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
    const idProductAttribute = getSelectedAttributeId();

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

            if (combValueIds.every(id => currentSelectedValues.includes(id))) {
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

function isOptionValueAvailable(groupName, valueId) {
    if (productCombinations.value.length === 0) return true;

    return productCombinations.value.some(comb => {
        const combValues = comb.associations?.product_option_values?.product_option_value;
        if (!combValues) return false;
        
        const combValueIds = Array.isArray(combValues)
            ? combValues.map(v => safeId(v.id))
            : [safeId(combValues.id)];

        // Le valueId recherché doit être présent
        if (!combValueIds.includes(String(valueId))) return false;

        // Et toutes les autres sélections déjà faites doivent être compatibles
        for (const variant of variants.value) {
            if (variant.name === groupName) continue;

            // Si ce groupe de déclinaison n'est pas du tout défini/utilisé dans cette combinaison, on ignore sa sélection
            const isGroupUsed = variant.values.some(val => combValueIds.includes(String(val.id)));
            if (!isGroupUsed) continue;

            const selectedValId = selectedOptions.value[variant.name];
            if (selectedValId && !combValueIds.includes(String(selectedValId))) {
                return false;
            }
        }

        return true;
    });
}

function getAvailableValues(variant) {
    if (!variant || !variant.values) return [];
    return variant.values.filter(val => isOptionValueAvailable(variant.name, val.id));
}

watch(selectedOptions, async (newVal) => {
    if (productCombinations.value.length > 0) {
        // Vérifier si la combinaison complète sélectionnée est valide
        const hasMatch = productCombinations.value.some(comb => {
            const combValues = comb.associations?.product_option_values?.product_option_value;
            if (!combValues) return false;
            const combValueIds = Array.isArray(combValues)
                ? combValues.map(v => safeId(v.id))
                : [safeId(combValues.id)];

            return variants.value.every(variant => {
                const selectedValId = newVal[variant.name];
                if (!selectedValId) return true;

                // Si le groupe n'est pas utilisé par la combinaison, sa sélection n'invalide pas le match
                const isGroupUsed = variant.values.some(val => combValueIds.includes(String(val.id)));
                if (!isGroupUsed) return true;

                return combValueIds.includes(String(selectedValId));
            });
        });

        if (!hasMatch) {
            // Trouver quelle option a été modifiée par l'utilisateur
            let changedKey = null;
            for (const key of Object.keys(newVal)) {
                if (newVal[key] !== lastSelectedOptions.value[key]) {
                    changedKey = key;
                    break;
                }
            }

            if (changedKey) {
                const newValId = newVal[changedKey];
                const matchingComb = productCombinations.value.find(comb => {
                    const combValues = comb.associations?.product_option_values?.product_option_value;
                    if (!combValues) return false;
                    const combValueIds = Array.isArray(combValues)
                        ? combValues.map(v => safeId(v.id))
                        : [safeId(combValues.id)];
                    return combValueIds.includes(String(newValId));
                });

                if (matchingComb) {
                    const combValues = matchingComb.associations?.product_option_values?.product_option_value;
                    const combValueIds = Array.isArray(combValues)
                        ? combValues.map(v => safeId(v.id))
                        : [safeId(combValues.id)];

                    for (const variant of variants.value) {
                        if (variant.name === changedKey) continue;

                        // Si le groupe n'est pas utilisé par cette combinaison, on ne touche pas à sa sélection
                        const isGroupUsed = variant.values.some(val => combValueIds.includes(String(val.id)));
                        if (!isGroupUsed) continue;

                        const compatibleVal = variant.values.find(val => combValueIds.includes(String(val.id)));
                        if (compatibleVal) {
                            selectedOptions.value[variant.name] = compatibleVal.id;
                        }
                    }
                }
            }
        }
    }

    lastSelectedOptions.value = { ...selectedOptions.value };
    await updateCurrentStock();
    await updateImage();
    refreshCartQuantity();

    if (maxAddable.value > 0 && quantity.value > maxAddable.value) {
        quantity.value = maxAddable.value;
    }
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
                                selectedOptions.value[v.name] = matchingVal.id;
                            } else {
                                selectedOptions.value[v.name] = v.values[0].id;
                            }
                        }
                    }
                } else {
                    for (let i = 0; i < structuredVariants.length; i++) {
                        let v = structuredVariants[i];
                        if (v && v.values && v.values.length > 0) {
                            selectedOptions.value[v.name] = safeId(v.values[0].id);
                        }
                    }
                }
                lastSelectedOptions.value = { ...selectedOptions.value };
            }
        }

        await updateCurrentStock();
        // Optionnel : Forcer un premier affichage de l'image de la déclinaison si existante
        await updateImage();
        refreshCartQuantity();
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

const calculatedPriceHt = computed(() => {
    if (!product.value) return 0;
    return parseFloat(product.value.price) || 0;
});

function getCartStorageKey() {
    const customerJson = localStorage.getItem('customer');
    if (customerJson) {
        try {
            const customerData = JSON.parse(customerJson);
            if (customerData?.id) return `panier_${customerData.id}`;
        } catch (e) {
            console.error("Erreur parse customer:", e);
        }
    }
    return 'panier_guest';
}

function getSelectedAttributeId() {
    if (productCombinations.value.length === 0) return '0';

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

        return combValueIds.every(id => currentSelectedValues.includes(id));
    });

    return matchingCombination ? safeId(matchingCombination.id) : '0';
}

function getExistingCartQuantity(productId, attributeId) {
    const storageKey = getCartStorageKey();
    let cart = [];
    try {
        const cartJson = localStorage.getItem(storageKey);
        if (cartJson) {
            cart = JSON.parse(cartJson);
        }
    } catch (e) {
        console.error("Erreur lecture panier local:", e);
    }

    const existingItem = cart.find(item =>
        String(item.id_product) === String(productId) &&
        String(item.id_product_attribute) === String(attributeId)
    );

    return existingItem ? Number(existingItem.quantity) || 0 : 0;
}

function refreshCartQuantity() {
    if (!product.value) return;
    const cleanProductId = safeId(product.value.id);
    const idProductAttribute = getSelectedAttributeId();
    cartQuantity.value = getExistingCartQuantity(cleanProductId, idProductAttribute);
}

const maxAddable = computed(() => {
    return Math.max(stock.value - cartQuantity.value, 0);
});

function addToCart() {
    if (!product.value) return;

    const cleanProductId = safeId(product.value.id);
    const idProductAttribute = getSelectedAttributeId();

    const existingQty = getExistingCartQuantity(cleanProductId, idProductAttribute);
    const remaining = Math.max(stock.value - existingQty, 0);

    if (remaining <= 0) {
        cartSuccessMessage.value = "Stock insuffisant : ce produit est deja au maximum dans votre panier.";
        showCartNotification.value = true;
        setTimeout(() => {
            showCartNotification.value = false;
        }, 4000);
        return;
    }

    if (quantity.value > remaining) {
        cartSuccessMessage.value = `Stock insuffisant : vous pouvez ajouter au maximum ${remaining} unite(s).`;
        showCartNotification.value = true;
        setTimeout(() => {
            showCartNotification.value = false;
        }, 4000);
        return;
    }

    const storageKey = getCartStorageKey();
    let cart = [];
    try {
        const cartJson = localStorage.getItem(storageKey);
        if (cartJson) {
            cart = JSON.parse(cartJson);
        }
    } catch (e) {
        console.error("Erreur lecture panier local:", e);
    }

    const existingIndex = cart.findIndex(item => 
        String(item.id_product) === String(cleanProductId) && 
        String(item.id_product_attribute) === String(idProductAttribute)
    );

    if (existingIndex > -1) {
        cart[existingIndex].quantity += quantity.value;
    } else {
        cart.push({
            id_product: String(cleanProductId),
            id_product_attribute: String(idProductAttribute),
            quantity: quantity.value,
            name: getLangText(product.value.name),
            price: Number(product.value.price) || 0,
            taxRate: productTaxRate.value,
            image: imageUrl.value
        });
    }

    localStorage.setItem(storageKey, JSON.stringify(cart));

    cartQuantity.value = existingQty + quantity.value;

    // Déclencher la notification de succès
    cartSuccessMessage.value = `"${getLangText(product.value.name)}" a été ajouté au panier !`;
    showCartNotification.value = true;

    // Masquer automatiquement après 4 secondes
    setTimeout(() => {
        showCartNotification.value = false;
    }, 4000);
}
</script>
<template>
    <!-- Notification Toast pour l'ajout au panier -->
    <div v-if="showCartNotification" class="toast-notification">
        <div class="toast-content">
            <Icon icon="solar:check-circle-bold" class="toast-icon success" />
            <div class="toast-text">
                <p class="toast-message">{{ cartSuccessMessage }}</p>
                <div class="toast-actions">
                    <router-link to="/panier" class="toast-btn view-cart-btn">Voir le panier</router-link>
                    <button @click="showCartNotification = false" class="toast-btn close-toast-btn">Fermer</button>
                </div>
            </div>
        </div>
    </div>

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
                    <span class="price-amount">{{ calculatedPriceTtc.toFixed(2) }} € <span class="price-badge">TTC</span></span>
                    <span class="price-amount-ht">{{ calculatedPriceHt.toFixed(2) }} € <span class="price-badge">HT</span></span>
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
                    <div v-for="variant in variants" :key="variant.id" class="variant-group" v-show="getAvailableValues(variant).length > 0">
                        <label class="variant-label">{{ variant.name }}</label>
                        <select v-model="selectedOptions[variant.name]" class="variant-select">
                            <option v-for="val in getAvailableValues(variant)" :key="val.id" :value="val.id">
                                {{ val.name }}
                            </option>
                        </select>
                    </div>
                </div>

                <div class="actions-container">
                    <div class="quantity-selector">
                        <button @click="quantity > 1 ? quantity-- : null" class="qty-btn"
                            :disabled="stock === 0 || maxAddable === 0">-</button>
                        <input type="number" v-model.number="quantity" min="1" :max="maxAddable > 0 ? maxAddable : 1" class="qty-input"
                            :disabled="stock === 0 || maxAddable === 0" />
                        <button @click="quantity < maxAddable ? quantity++ : null" class="qty-btn"
                            :disabled="stock === 0 || maxAddable === 0 || quantity >= maxAddable">+</button>
                    </div>

                    <button @click="addToCart" class="add-to-cart-btn" :disabled="stock === 0 || maxAddable === 0 || quantity > maxAddable">
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

.price-amount-ht {
    font-size: 1.1rem;
    font-weight: 700;
    color: #9aa1af;
}

.price-badge {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: inherit;
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
    appearance: textfield;
}

.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    appearance: none;
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

/* === TOAST NOTIFICATION DE PANIER PREMIUM === */
.toast-notification {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 1000;
    max-width: 380px;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(12px) saturate(180%);
    -webkit-backdrop-filter: blur(12px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 18px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08), 
                inset 0 1px 0 rgba(255, 255, 255, 0.6);
    padding: 16px 20px;
    animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    box-sizing: border-box;
}

.toast-content {
    display: flex;
    gap: 14px;
    align-items: flex-start;
}

.toast-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
    margin-top: 2px;
}

.toast-icon.success {
    color: #2ed573;
}

.toast-text {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-grow: 1;
}

.toast-message {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #2f3542;
    line-height: 1.4;
}

.toast-actions {
    display: flex;
    gap: 12px;
    align-items: center;
}

.toast-btn {
    border: none;
    font-size: 0.85rem;
    font-weight: 700;
    padding: 8px 14px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    text-align: center;
}

.view-cart-btn {
    background: linear-gradient(135deg, #2ed573, #26af5f);
    color: white;
    box-shadow: 0 4px 10px rgba(46, 213, 115, 0.2);
}

.view-cart-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(46, 213, 115, 0.3);
}

.close-toast-btn {
    background: #f1f2f6;
    color: #57606f;
}

.close-toast-btn:hover {
    background: #e4e7eb;
    color: #2f3542;
}

@keyframes slideInRight {
    from {
        opacity: 0;
        transform: translateX(40px) scale(0.95);
    }
    to {
        opacity: 1;
        transform: translateX(0) scale(1);
    }
}
</style>