<script setup>
// Importation de la fonction générique pour faire des requêtes GET à l'API PrestaShop
import { getXml } from '@/service/api';
import { onMounted, ref } from 'vue';
import Loading from './Loading.vue';

// État de chargement
const loading = ref(false);
// Données brutes reçues de l'API
const products = ref(null)
// Stockage de l'erreur éventuelle
const erreur = ref("")

// Dès que le composant est affiché à l'écran, on lance la requête API
onMounted(async () => {
    try {
        loading.value = true;
        // Appel de test sur la route des produits
        products.value = await getXml('/products?display=full');
        if (products.value != null) {
            loading.value = false;
        }

    } catch (error) {
        erreur.value = error;
    }
})

// Affichage dans la console pour débugger le format XML/JSON reçu
console.log(products);
</script>

<template>
    <!-- Si la requête est en cours, affiche l'animation de chargement -->
    <div v-if="products == null">
        <Loading :is-loading="loading"></Loading>
    </div>
    <!-- Une fois chargé, affiche brutalement le JSON reçu (utile pour le développeur) -->
    <div v-else>
        Produits : 
        {{ products }}
    </div>
</template>

<!-- 
  NOTE: Ce composant est un simple outil de "Bac à sable" (Sandbox) pour le développeur.
  Il sert à tester si la connexion à l'API PrestaShop fonctionne correctement.
  Il ne devrait normalement pas être accessible par l'utilisateur final.
-->