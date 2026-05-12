<script setup>
import { onMounted, ref } from 'vue';
import { getXml, getImage } from '@/service/api';
import Loading from '@/components/Loading.vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const loading = ref(false);
const product = ref(null);
const imageUrl = ref(null);

onMounted(async () => {
    try {
        loading.value = true;
        const id = route.params.id;

        // Récupération des données du produit
        const data = await getXml(`products/${id}`);
        product.value = data["prestashop"]["product"];

        // Récupération de l'image principale
        if (product.value.id_default_image && product.value.id_default_image["@_xlink:href"]) {
            let imageApiUrl = product.value.id_default_image["@_xlink:href"];
            imageApiUrl = imageApiUrl.replace("http://localhost:8081/prestashop_edition_classic_version_8.2.6/api", "");
            imageApiUrl = imageApiUrl.replace("?output_format=XML", "");
            imageUrl.value = await getImage(imageApiUrl);
        }

        loading.value = false;
    } catch (error) {
        console.log(error);
        loading.value = false;
    }
});
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
                        <img v-if="imageUrl" :src="imageUrl" :alt="product.name?.language?.['#text']" class="product-image">
                        <div v-else class="image-placeholder">Pas d'image disponible</div>
                    </div>
                </div>

                <!-- Colonne informations -->
                <div class="product-info">
                    <h1 class="product-name">{{ product.name?.language?.['#text'] }}</h1>

                    <div class="product-price-block">
                        <span class="product-price">{{ product.price }} €</span>
                        <span class="price-label">TTC</span>
                    </div>

                    <div class="product-description" v-if="product.description?.language?.['#text']">
                        <h2 class="description-title">Description</h2>
                        <!-- La description PrestaShop est en HTML, on l'affiche directement -->
                        <div class="description-content" v-html="product.description.language['#text']"></div>
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
    top: 84px; /* sous la navbar */
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