<script setup>

import { onMounted, ref, watch } from 'vue';
import { getImage } from '@/service/api';
import { getProducts } from '@/service/productService';
import { getCategories } from '@/service/categoryService';
import Loading from '@/components/Loading.vue';
import ProductBloc from '@/components/frontoffice/ProductBloc.vue';

const loading = ref(false);
const products = ref([]);
const categories = ref([]);

// États de recherche
const searchName = ref('');
const searchCategory = ref('');
const minPrice = ref('');
const maxPrice = ref('');

// --- CHARGEMENT DES PRODUITS AVEC FILTRES API ---
async function loadProducts() {
    try {
        loading.value = true;

        // Construction des filtres PrestaShop
        let params = "display=full";

        if (searchName.value) {
            params += "&filter[name]=%" + searchName.value + "%";
        }

        if (searchCategory.value) {
            params += "&filter[id_category_default]=" + searchCategory.value;
        }

        // Filtre de prix (format: [min,max])
        if (minPrice.value || maxPrice.value) {
            let min = minPrice.value || 0;
            let max = maxPrice.value || 999999;
            params += "&filter[price]=[" + min + "," + max + "]";
        }

        const productList = await getProducts(params);
        products.value = productList;
        console.log("product list", productList[0]);
        console.log("product value", products.value);

        // Charger les images et les badges pour les produits trouvés
        for (let i = 0; i < products.value.length; i++) {
            let product = products.value[i];
            console.log("product ", i, "=", product, " = ", products.value[i]);

            // Image
            const defaultImg = product.id_default_image;
            if (defaultImg) {
                let imageApiUrl = null;
                if (typeof defaultImg === 'object' && defaultImg["@_xlink:href"]) {
                    imageApiUrl = defaultImg["@_xlink:href"].replace(/http:\/\/localhost:\d+\/prestashop[^/]*\/api/, "").replace("?output_format=XML", "");
                } else {
                    let imgId = typeof defaultImg === 'object' ? defaultImg['#text'] : defaultImg;
                    if (imgId && imgId !== '0') {
                        imageApiUrl = `/images/products/${product.id}/${imgId}`;
                    }
                }
                if (imageApiUrl) {
                    products.value[i].image = await getImage(imageApiUrl);
                }
            }

            // Badge HOT/NEW
            let badge = null;
            console.log("product", product);
            console.log("product.available_date", product.available_date);
            if (product.available_date != null) {
                console.log("misy");
                let now = new Date();
                let addedDate = new Date(product.available_date.replace(' ', 'T'));
                let diffDays = (now - addedDate) / (1000 * 60 * 60 * 24);
                if (diffDays <= 1) badge = 'HOT';
                else if (diffDays <= 7) badge = 'NEW';
            }
            products.value[i].badge = badge;
        }

        loading.value = false;
    }
    catch (error) {
        console.log("Erreur lors du filtrage API:", error);
        products.value = [];
        loading.value = false;
    }
}

// --- SURVEILLANCE DES FILTRES ---
// On utilise un petit délai (debounce) pour ne pas saturer l'API
let searchTimeout = null;
watch([searchName, searchCategory, minPrice, maxPrice], () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadProducts, 500);
});

onMounted(async () => {
    try {
        // Charger les catégories une seule fois
        const catList = await getCategories("display=[id,name]");
        categories.value = catList;

        // Charger tous les produits au démarrage
        await loadProducts();
    } catch (e) {
        console.error(e);
    }
});
</script>

<template>
    <div class="home-container">
        <div v-if="loading && products.length === 0" class="loading-wrapper">
            <Loading :is-loading="loading"></Loading>
        </div>

        <template v-else>
            <header class="page-header">
                <h1 class="title">Boutique Exclusive</h1>
                <p class="subtitle">Trouvez le produit parfait parmi notre sélection</p>
            </header>

            <!-- BARRE DE RECHERCHE MULTICRITÈRE (API) -->
            <section class="search-section">
                <div class="search-bar">
                    <div class="input-group">
                        <label>Rechercher</label>
                        <input type="text" v-model="searchName" placeholder="Nom du produit...">
                    </div>

                    <div class="input-group">
                        <label>Catégorie</label>
                        <select v-model="searchCategory">
                            <option value="">Toutes les catégories</option>
                            <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                                {{ cat.name.language['#text'] }}
                            </option>
                        </select>
                    </div>

                    <div class="input-group price-range">
                        <label>Prix (Min - Max)</label>
                        <div class="range-inputs">
                            <input type="number" v-model="minPrice" placeholder="Min">
                            <input type="number" v-model="maxPrice" placeholder="Max">
                        </div>
                    </div>
                </div>
                <div class="results-info">
                    <span v-if="loading" class="searching-tag">Recherche en cours...</span>
                    <p class="results-count" v-else>
                        {{ products.length }} produit(s) trouvé(s)
                    </p>
                </div>
            </section>

            <div class="products-grid" v-if="products.length > 0">
                <RouterLink v-for="produit in products" :key="produit.id" :to="`/produit/${produit.id}`"
                    class="product-link">
                    <ProductBloc :image="produit.image" :name="produit.name.language['#text']" :price="produit.price"
                        :badge="produit.badge">
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

/* SEARCH SECTION */
.search-section {
    background: white;
    padding: 30px;
    border-radius: 20px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
    margin-bottom: 50px;
}

.search-bar {
    display: flex;
    gap: 25px;
    flex-wrap: wrap;
    align-items: flex-end;
}

.input-group {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.input-group label {
    font-size: 0.85rem;
    font-weight: 700;
    color: #2f3542;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.input-group input,
.input-group select {
    padding: 12px 16px;
    border: 2px solid #f1f2f6;
    border-radius: 12px;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.2s;
    background: #f8f9fa;
}

.input-group input:focus,
.input-group select:focus {
    border-color: #2ed573;
}

.range-inputs {
    display: flex;
    gap: 10px;
}

.range-inputs input {
    width: 100%;
}

.results-info {
    margin-top: 25px;
    display: flex;
    align-items: center;
    gap: 15px;
}

.searching-tag {
    background: #e3faf3;
    color: #2ed573;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 700;
    animation: pulse 1.5s infinite;
}

@keyframes pulse {
    0% {
        opacity: 0.6;
    }

    50% {
        opacity: 1;
    }

    100% {
        opacity: 0.6;
    }
}

.results-count {
    font-size: 0.9rem;
    color: #a4b0be;
    font-weight: 600;
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