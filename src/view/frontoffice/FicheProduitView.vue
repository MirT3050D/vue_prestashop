<script setup>
import { onMounted, ref } from 'vue';
import { getXml, getImage, postXml } from '@/service/api';
import { getProductTaxRate } from '@/service/price';
import Loading from '@/components/Loading.vue';
import { useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';

const route = useRoute();
const loading = ref(false);
const product = ref(null);
const imageUrl = ref(null);
const variants = ref([]);
const selectedOptions = ref({});
const productCombinations = ref([]);
const quantity = ref(1);
const productTaxRate = ref(0);

function getLangText(field) {
    if (!field || !field.language) return '';
    if (Array.isArray(field.language)) return field.language[0]['#text'];
    return field.language['#text'];
}

async function updateImage() {
    if (productCombinations.value.length === 0) return;

    // Obtenir la liste des valeurs d'options actuellement sélectionnées
    let currentSelectedValues = [];
    let keys = Object.keys(selectedOptions.value);
    for (let i = 0; i < keys.length; i++) {
        currentSelectedValues.push(String(selectedOptions.value[keys[i]]));
    }

    // Trouver la combinaison correspondante
    let matchedCombination = null;

    for (let i = 0; i < productCombinations.value.length; i++) {
        let comb = productCombinations.value[i];
        if (comb.associations && comb.associations.product_option_values) {
            let optValuesContainer = comb.associations.product_option_values;
            let optValues = optValuesContainer.product_option_value || optValuesContainer;
            if (!Array.isArray(optValues)) optValues = [optValues];

            // On extrait les IDs des options de cette combinaison
            let combValues = [];
            for (let j = 0; j < optValues.length; j++) {
                if (optValues[j] && optValues[j].id) {
                    combValues.push(String(optValues[j].id));
                }
            }

            // Vérifier si toutes les valeurs sélectionnées sont dans cette combinaison
            let isMatch = true;
            for (let k = 0; k < currentSelectedValues.length; k++) {
                let matchFound = false;
                for (let l = 0; l < combValues.length; l++) {
                    if (combValues[l] == currentSelectedValues[k]) {
                        matchFound = true;
                        break;
                    }
                }
                if (!matchFound) {
                    isMatch = false;
                    break;
                }
            }

            if (isMatch) {
                matchedCombination = comb;
                break;
            }
        }
    }

    // Si on a trouvé la bonne combinaison, on récupère son image
    if (matchedCombination && matchedCombination.associations && matchedCombination.associations.images) {
        let imagesContainer = matchedCombination.associations.images;
        let images = imagesContainer.image || imagesContainer;
        if (!Array.isArray(images)) images = [images];

        if (images.length > 0 && images[0].id) {
            let imageId = images[0].id;
            let imageApiUrl = `images/products/${product.value.id}/${imageId}`;
            imageUrl.value = await getImage(imageApiUrl);
        }
    }
}

onMounted(async () => {
    try {
        loading.value = true;
        const id = route.params.id;

        // Récupération des données du produit
        const data = await getXml(`products/${id}`);
        product.value = data["prestashop"]["product"];
        productTaxRate.value = await getProductTaxRate(id);

        // Récupération de toutes les combinaisons du produit pour les images dynamiques
        try {
            const combData = await getXml(`combinations?display=full&filter[id_product]=[${id}]`);
            if (combData && combData.prestashop && combData.prestashop.combinations) {
                let combsContainer = combData.prestashop.combinations;
                let combs = combsContainer.combination || combsContainer;
                if (!Array.isArray(combs)) combs = [combs];
                productCombinations.value = combs;
            }
        } catch (e) {
            console.log("Erreur lors de la récupération des combinaisons", e);
        }

        // Récupération de l'image principale
        const defaultImg = product.value.id_default_image;
        if (defaultImg) {
            let imageApiUrl = null;
            
            if (typeof defaultImg === 'object' && defaultImg["@_xlink:href"]) {
                // Case 1: Object with xlink:href (standard PrestaShop format)
                imageApiUrl = defaultImg["@_xlink:href"];
                imageApiUrl = imageApiUrl.replace(/http:\/\/localhost:\d+\/prestashop[^/]*\/api/, "");
                imageApiUrl = imageApiUrl.replace("?output_format=XML", "");
            } else {
                // Case 2: Simple ID (number/string) or object with #text
                let imgId = defaultImg;
                if (typeof defaultImg === 'object' && defaultImg['#text']) {
                    imgId = defaultImg['#text'];
                }
                if (imgId && imgId !== '' && imgId !== '0') {
                    imageApiUrl = `/images/products/${product.value.id}/${imgId}`;
                }
            }
            
            if (imageApiUrl) {
                imageUrl.value = await getImage(imageApiUrl);
            }
        }

        // Récupération des variantes (combinaisons)
        if (product.value.associations && product.value.associations.product_option_values) {
            let optionValueContainer = product.value.associations.product_option_values;

            // L'API PrestaShop peut renvoyer une chaîne vide s'il n'y a pas de valeurs
            if (optionValueContainer && optionValueContainer !== "") {
                let optionValueIds = optionValueContainer.product_option_value || optionValueContainer;
                if (!Array.isArray(optionValueIds)) optionValueIds = [optionValueIds];

                // On s'assure qu'on a bien des objets avec un id
                let validOptionValueIds = [];
                let idsArray = [];
                for (let i = 0; i < optionValueIds.length; i++) {
                    let v = optionValueIds[i];
                    if (v && v.id) {
                        validOptionValueIds.push(v);
                        idsArray.push(v.id);
                    }
                }
                optionValueIds = validOptionValueIds;

                const ids = idsArray.join('|');
                if (ids) {
                    const valuesData = await getXml(`product_option_values?display=full&filter[id]=[${ids}]`);
                    if (valuesData && valuesData.prestashop && valuesData.prestashop.product_option_values) {
                        let valuesContainer = valuesData.prestashop.product_option_values;
                        let values = valuesContainer.product_option_value || valuesContainer;
                        if (!Array.isArray(values)) values = [values];

                        let groupIdsArray = [];
                        for (let i = 0; i < values.length; i++) {
                            let rawGroupId = values[i].id_attribute_group;
                            let groupId = (typeof rawGroupId === 'object') ? rawGroupId['#text'] : rawGroupId;
                            if (!groupIdsArray.includes(groupId)) {
                                groupIdsArray.push(groupId);
                            }
                        }

                        const groupIds = groupIdsArray.join('|');
                        if (groupIds) {
                            const groupsData = await getXml(`product_options?display=full&filter[id]=[${groupIds}]`);
                            if (groupsData && groupsData.prestashop && groupsData.prestashop.product_options) {
                                let groupsContainer = groupsData.prestashop.product_options;
                                let groups = groupsContainer.product_option || groupsContainer;
                                if (!Array.isArray(groups)) groups = [groups];

                                // Construction de l'objet variants avec des boucles classiques
                                let allVariants = [];
                                for (let i = 0; i < groups.length; i++) {
                                    let group = groups[i];

                                    // Trouver les valeurs qui correspondent à ce groupe
                                    let groupValues = [];
                                    for (let j = 0; j < values.length; j++) {
                                        let v = values[j];
                                        let vGroupId = (typeof v.id_attribute_group === 'object') ? v.id_attribute_group['#text'] : v.id_attribute_group;

                                        if (vGroupId == group.id) {
                                            groupValues.push({
                                                id: v.id,
                                                name: getLangText(v.name)
                                            });
                                        }
                                    }

                                    allVariants.push({
                                        id: group.id,
                                        name: getLangText(group.public_name) || getLangText(group.name),
                                        values: groupValues
                                    });
                                }

                                // Filtrage pour ne garder QUE Taille et Couleur
                                let finalVariants = [];
                                const allowedNames = ['taille', 'couleur', 'size', 'color'];

                                for (let i = 0; i < allVariants.length; i++) {
                                    let variant = allVariants[i];
                                    let variantName = variant.name.toLowerCase();

                                    let isAllowed = false;
                                    for (let j = 0; j < allowedNames.length; j++) {
                                        if (variantName.includes(allowedNames[j])) {
                                            isAllowed = true;
                                            break;
                                        }
                                    }

                                    if (isAllowed) {
                                        finalVariants.push(variant);
                                    }
                                }
                                variants.value = finalVariants;

                                // Initialiser les valeurs sélectionnées par défaut
                                for (let i = 0; i < finalVariants.length; i++) {
                                    let variant = finalVariants[i];
                                    if (variant.values && variant.values.length > 0) {
                                        // On prend la première valeur par défaut
                                        selectedOptions.value[variant.id] = variant.values[0].id;
                                    }
                                }

                                // Mettre à jour l'image pour correspondre à la sélection initiale
                                await updateImage();
                            }
                        }
                    }
                }
            }
        }

        loading.value = false;
    } catch (error) {
        console.log(error);
        loading.value = false;
    }
});
onMounted(() => {
    if (localStorage.getItem("panier") == null) {
        localStorage.setItem("panier", JSON.stringify([]));
    }
})

function getCurrentCombinationId() {
    if (variants.value.length === 0) {
        return 0;
    }

    // Récupérer les valeurs sélectionnées sans utiliser .map()
    let currentSelectedValues = [];
    let optionKeys = Object.keys(selectedOptions.value);
    for (let i = 0; i < optionKeys.length; i++) {
        let key = optionKeys[i];
        let val = selectedOptions.value[key];
        currentSelectedValues.push(String(val));
    }

    for (let i = 0; i < productCombinations.value.length; i++) {
        let comb = productCombinations.value[i];
        
        if (comb.associations && comb.associations.product_option_values) {
            let optValuesContainer = comb.associations.product_option_values;
            let optValues = optValuesContainer.product_option_value || optValuesContainer;
            
            if (!Array.isArray(optValues)) {
                optValues = [optValues];
            }

            let combValues = [];
            for (let j = 0; j < optValues.length; j++) {
                let valObj = optValues[j];
                if (valObj && valObj.id) {
                    combValues.push(String(valObj.id));
                }
            }

            // Vérifier si les sélections correspondent exactement sans utiliser .includes()
            if (currentSelectedValues.length === combValues.length) {
                let isMatch = true;
                for (let k = 0; k < currentSelectedValues.length; k++) {
                    let valueToFind = currentSelectedValues[k];
                    let found = false;
                    for (let l = 0; l < combValues.length; l++) {
                        if (combValues[l] === valueToFind) {
                            found = true;
                            break;
                        }
                    }
                    if (found === false) {
                        isMatch = false;
                        break;
                    }
                }

                if (isMatch === true) {
                    return comb.id;
                }
            }
        }
    }
    return 0;
}

function putInCart() {
    if (!product.value) {
        return;
    }

    const id_product = product.value.id;
    const id_product_attribute = getCurrentCombinationId();

    let cart = [];
    let cartJson = localStorage.getItem("panier");
    if (cartJson) {
        try {
            cart = JSON.parse(cartJson);
        } catch (e) {
            cart = [];
        }
    }

    // Chercher si le produit avec la même variante existe déjà avec une boucle for
    let existingIndex = -1;
    for (let i = 0; i < cart.length; i++) {
        let item = cart[i];
        if (item.id_product == id_product && item.id_product_attribute == id_product_attribute) {
            existingIndex = i;
            break;
        }
    }

    if (existingIndex !== -1) {
        cart[existingIndex].quantity = cart[existingIndex].quantity + quantity.value;
    } else {
        let newItem = {
            id_product: id_product,
            id_product_attribute: id_product_attribute,
            quantity: quantity.value,
            name: getLangText(product.value.name),
            price: parseFloat(product.value.price),
            taxRate: productTaxRate.value,
            image: imageUrl.value
        };
        cart.push(newItem);
    }

    localStorage.setItem("panier", JSON.stringify(cart));
    alert("Produit ajouté au panier !");
}

async function createCart(customerId, productId, quantity = 1, productAttributeId = 0) {
    const payload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <id_customer>${customerId}</id_customer>
    <id_address_delivery>1</id_address_delivery>
    <id_address_invoice>1</id_address_invoice>
    <associations>
      <cart_rows>
        <cart_row>
          <id_product>${productId}</id_product>
          <id_product_attribute>${productAttributeId}</id_product_attribute>
          <quantity>${quantity}</quantity>
        </cart_row>
      </cart_rows>
    </associations>
  </cart>
</prestashop>`

    try {
        const result = await postXml('/api/carts', payload)
        console.log('Cart créé :', result)
        return result
    } catch (error) {
        console.error('Erreur création cart :', error.response?.data || error.message)
        throw error
    }
}

</script>

<template>
    <div class="fiche-container">
        <div v-if="loading" class="loading-wrapper">
            <Loading :is-loading="loading"></Loading>
        </div>

        <template v-else>
            <div v-if="product" class="product-sheet">

                <!-- Colonne image -->
                <div class="product-gallery">
                    <div class="image-wrapper">
                        <img v-if="imageUrl" :src="imageUrl" :alt="getLangText(product.name)" class="product-image">
                        <div v-else class="image-placeholder">Pas d'image disponible</div>
                    </div>
                </div>

                <!-- Colonne informations -->
                <div class="product-info">
                    <h1 class="product-name">{{ getLangText(product.name) }}</h1>

                    <div class="product-price-block">
                        <span class="product-price">{{ parseFloat(product.price).toFixed(2) }} €</span>
                        <span class="price-label">HT</span>
                    </div>

                    <!-- Affichage des Variantes -->
                    <div v-if="variants.length > 0" class="product-variants">
                        <div v-for="variant in variants" :key="variant.id" class="variant-group">
                            <label class="variant-label">{{ variant.name }} :</label>
                            <select class="variant-select" v-model="selectedOptions[variant.id]" @change="updateImage">
                                <option v-for="val in variant.values" :key="val.id" :value="val.id">
                                    {{ val.name }}
                                </option>
                            </select>
                        </div>
                    </div>

                    <!-- Actions : Quantité et Paiement -->
                    <div class="product-actions">
                        <div class="quantity-block">
                            <label class="variant-label">Quantité :</label>
                            <div class="quantity-selector">
                                <button class="qty-btn" @click="quantity > 1 ? quantity-- : null" title="Diminuer">
                                    <Icon icon="lucide:minus" />
                                </button>
                                <input type="number" v-model="quantity" min="1" class="qty-input">
                                <button class="qty-btn" @click="quantity++" title="Augmenter">
                                    <Icon icon="lucide:plus" />
                                </button>
                            </div>
                        </div>

                        <button class="add-to-cart-btn" @click="putInCart">
                            <Icon icon="lucide:shopping-cart" class="btn-icon" />
                            Ajouter au panier
                        </button>
                    </div>

                    <div class="product-description" v-if="getLangText(product.description)">
                        <h2 class="description-title">Description</h2>
                        <div class="description-content" v-html="getLangText(product.description)"></div>
                    </div>

                    <div class="product-description" v-else>
                        <p class="no-description">Aucune description disponible.</p>
                    </div>
                </div>

            </div>

            <div v-else class="empty-state">
                <p>Produit introuvable.</p>
            </div>
        </template>
    </div>
</template>

<style scoped>
.fiche-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 50px 24px;
    font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    min-height: 100vh;
}

.loading-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 50vh;
}

/* === LAYOUT 2 COLONNES === */
.product-sheet {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 60px;
    align-items: start;
}

@media (max-width: 768px) {
    .product-sheet {
        grid-template-columns: 1fr;
        gap: 32px;
    }
}

/* === IMAGE === */
.product-gallery {
    position: sticky;
    top: 84px;
    /* sous la navbar */
}

.image-wrapper {
    border-radius: 20px;
    overflow: hidden;
    background-color: #f0f1f3;
    aspect-ratio: 1 / 1;
    box-shadow: 0 8px 32px rgba(47, 53, 66, 0.12);
}

.product-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.4s ease;
}

.product-image:hover {
    transform: scale(1.03);
}

.image-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #a4b0be;
    font-size: 0.95rem;
}

/* === INFORMATIONS === */
.product-info {
    display: flex;
    flex-direction: column;
    gap: 28px;
}

.product-name {
    font-size: 2rem;
    font-weight: 800;
    color: #2f3542;
    margin: 0;
    line-height: 1.25;
    letter-spacing: -0.5px;
}

.product-price-block {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 18px 24px;
    background: linear-gradient(135deg, rgba(46, 213, 115, 0.12), rgba(46, 213, 115, 0.04));
    border-radius: 14px;
    border: 1px solid rgba(46, 213, 115, 0.2);
}

.product-price {
    font-size: 2.2rem;
    font-weight: 800;
    color: #2ed573;
    letter-spacing: -1px;
}

.price-label {
    font-size: 0.9rem;
    color: #747d8c;
    font-weight: 500;
}

/* === VARIANTES === */
.product-variants {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 0;
    border-top: 1px solid #f1f2f6;
    border-bottom: 1px solid #f1f2f6;
}

.variant-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.variant-label {
    font-size: 0.95rem;
    font-weight: 600;
    color: #2f3542;
}

.variant-select {
    padding: 12px 16px;
    border: 1px solid #ced6e0;
    border-radius: 10px;
    background-color: #ffffff;
    font-size: 1rem;
    color: #2f3542;
    cursor: pointer;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.variant-select:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

/* === ACTIONS === */
.product-actions {
    display: flex;
    flex-direction: column;
    gap: 24px;
    margin-top: 10px;
    padding-bottom: 30px;
    border-bottom: 1px solid #f1f2f6;
}

.quantity-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.quantity-selector {
    display: flex;
    align-items: center;
    background: #f8f9fa;
    border: 1px solid #ced6e0;
    border-radius: 12px;
    width: fit-content;
    overflow: hidden;
}

.qty-btn {
    padding: 10px 18px;
    border: none;
    background: transparent;
    font-size: 1.2rem;
    color: #2f3542;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.qty-btn:hover {
    background: #e1e4e8;
}

.qty-input {
    width: 60px;
    border: none;
    background: transparent;
    text-align: center;
    font-size: 1.1rem;
    font-weight: 600;
    color: #2f3542;
    outline: none;
    appearance: none;
    -moz-appearance: textfield;
}

.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.add-to-cart-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 18px 32px;
    background: linear-gradient(135deg, #2f3542, #4a5568);
    color: white;
    border: none;
    border-radius: 14px;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    box-shadow: 0 4px 15px rgba(47, 53, 66, 0.2);
}

.add-to-cart-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(47, 53, 66, 0.3);
}

.add-to-cart-btn:active {
    transform: translateY(0);
}

.btn-icon {
    font-size: 1.3rem;
}

/* === DESCRIPTION === */
.description-title {
    font-size: 1rem;
    font-weight: 700;
    color: #747d8c;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 0 0 14px 0;
}

.description-content {
    font-size: 1rem;
    line-height: 1.75;
    color: #4a5568;
}

/* Reset du HTML injecté par PrestaShop */
.description-content :deep(p) {
    margin: 0 0 12px 0;
}

.no-description {
    color: #a4b0be;
    font-style: italic;
}

/* === EMPTY STATE === */
.empty-state {
    text-align: center;
    padding: 80px 20px;
    color: #a4b0be;
    font-size: 1.2rem;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}
</style>