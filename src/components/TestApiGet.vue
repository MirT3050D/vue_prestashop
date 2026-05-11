<script setup>
import { getXml } from '@/service/api';
import { onMounted, ref } from 'vue';
import Loading from './Loading.vue';
const loading = ref(false);
const products = ref(null)
const erreur = ref("")
onMounted(async () => {
    try {
        loading.value = true;
        products.value = await getXml('/products?display=full');
        if (products.value != null) {
            loading.value = false;
        }

    } catch (error) {
        erreur.value = error;
    }

})
console.log(products);
</script>
<template>
    <div v-if="products == null">
        <Loading :is-loading= loading ></Loading>
    </div>
    <div v-else>
        Produits : 
        {{ products }}
    </div>
</template>