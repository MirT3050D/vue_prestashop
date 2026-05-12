<script setup>
import { onMounted, ref } from 'vue';
import { getXml, getImage } from '@/service/api';
import Loading from '@/components/Loading.vue';
import ProductBloc from '@/components/frontoffice/ProductBloc.vue';
const loading = ref(false);
const products = ref(null);
onMounted(async () => {
    try {
        loading.value = true;
        products.value = await getXml("products?display=full");
        products.value = products.value["prestashop"]["products"]["product"];
        for (let i = 0; i < products.value.length; i++) {
            let product = products.value[i];
            if (product.id_default_image && product.id_default_image["@_xlink:href"]) {
                let imageUrl = product.id_default_image["@_xlink:href"];
                imageUrl = imageUrl.replace("http://localhost:8081/prestashop_edition_classic_version_8.2.6/api", "");
                imageUrl = imageUrl.replace("?output_format=XML", "");

                // Utilisation de la nouvelle fonction getImage() au lieu de getXml()
                products.value[i].image = await getImage(imageUrl);
            }
        }
        console.log(products);
        loading.value = false;
    }
    catch (error) {
        console.log(error);
    }
}) 
</script>
<template>
    <div class="home-container">
        <div v-if="loading" class="loading-wrapper">
            <Loading :is-loading="loading"></Loading>
        </div>

        <template v-else>
            <header class="page-header">
                <h1 class="title">Découvrez Nos Produits</h1>
                <p class="subtitle">Une sélection exclusive rien que pour vous</p>
            </header>

            <div class="products-grid" v-if="products && products.length > 0">
                <RouterLink v-for="produit in products" :key="produit.id" :to="`/produit/${produit.id}`"
                    class="product-link">
                    <ProductBloc :image="produit.image" :name="produit.name.language['#text']" :price="produit.price">
                    </ProductBloc>
                </RouterLink>
            </div>

            <div v-else class="empty-state">
                <p>Aucun produit disponible pour le moment.</p>
            </div>
        </template>
    </div>
</template>

<style scoped>
.home-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 60px 20px;
    font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background-color: #f8f9fa;
    /* Fond gris très clair pour faire ressortir les cartes blanches */
    min-height: 100vh;
}

.loading-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 50vh;
}

.page-header {
    text-align: center;
    margin-bottom: 60px;
}

.title {
    font-size: 2.8rem;
    font-weight: 800;
    color: #2f3542;
    margin-bottom: 12px;
    letter-spacing: -1px;
}

.subtitle {
    font-size: 1.2rem;
    color: #747d8c;
    font-weight: 400;
}

.products-grid {
    display: grid;
    /* Crée automatiquement autant de colonnes que possible (minimum 280px de large) */
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 40px 30px;
    /* Espace entre les lignes et les colonnes */
    justify-items: center;
}

.product-link {
    text-decoration: none;
    color: inherit;
    display: block;
    width: 100%;
}

.empty-state {
    text-align: center;
    padding: 80px 20px;
    color: #a4b0be;
    font-size: 1.2rem;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}

/* Responsive design pour les petits écrans */
@media (max-width: 768px) {
    .title {
        font-size: 2.2rem;
    }

    .home-container {
        padding: 40px 15px;
    }
}
</style>