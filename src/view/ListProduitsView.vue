<script setup>

import List from '@/components/List.vue';
import Loading from '@/components/Loading.vue';
import { getProducts } from '@/service/productService';
import { getColumnForList } from '@/service/util';
import { ref, onMounted } from 'vue';
import { getProductTaxRate, calculateTtc } from '@/service/price';

const product_columns = ref(null);
const raw_data = ref(null);
const data = ref(null);
const loading = ref(false);

function getLanguageValue(field) {
    if (field == null) {
        return null;
    }

    if (typeof field === 'string' || typeof field === 'number') {
        return field;
    }

    const languageNode = field.language;
    if (Array.isArray(languageNode)) {
        return languageNode[0]?.['#text'] ?? languageNode[0] ?? null;
    }

    if (languageNode && typeof languageNode === 'object') {
        return languageNode['#text'] ?? null;
    }

    return field['#text'] ?? null;
}

function getNodeText(field) {
    if (field == null) {
        return null;
    }

    if (typeof field === 'string' || typeof field === 'number') {
        return field;
    }

    return field['#text'] ?? null;
}

function formatProduct(product, price, priceTtc) {
    const imageHref = product.id_default_image?.['@_xlink:href'] ?? null;
    const categoryId = getNodeText(product.id_category_default);

    return {
        id_product: product.id ?? null,
        image: imageHref,
        name: getLanguageValue(product.name),
        reference: product.reference ?? null,
        category: categoryId,
        price_tax_excluded: price,
        price_tax_included: priceTtc,
        quantity: product.quantity ?? null,
        active: product.active ?? null
    };
}


onMounted(async () => {
    loading.value = true;
    try {
        product_columns.value = getColumnForList('product');
        raw_data.value = await getProducts('display=full');

        // Build formatted products and compute TTC per product
        data.value = await Promise.all(raw_data.value.map(async (product) => {
            const price = Number(product.price ?? 0);
            let taxRate = 0;
            try {
                taxRate = await getProductTaxRate(product.id);
            } catch (e) {
                taxRate = 0;
            }
            const priceTtc = calculateTtc(price, taxRate);
            return formatProduct(product, price, priceTtc);
        }));
    } catch (err) {
        console.error("Error loading products:", err);
        data.value = [];
    } finally {
        loading.value = false;
    }
})


</script>
<template>
    <List :columns="product_columns" module="Produit" :data="data"></List>
    <Loading :is-loading="loading"></Loading>
</template>
<style></style>