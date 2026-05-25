<script setup>
// ============================================================================
// IMPORTATIONS
// ============================================================================
import List from '@/components/List.vue';
import Loading from '@/components/Loading.vue';
import { getProducts } from '@/service/productService';
import { getColumnForList } from '@/service/util';
import { ref, onMounted } from 'vue';
import { getProductTaxRate, calculateTtc } from '@/service/price';

// Variables réactives pour stocker l'état
const product_columns = ref(null); // Les colonnes à afficher dans le tableau (ex: ['id', 'name', 'price_tax_excluded'])
const raw_data = ref(null);        // Données XML brutes reçues de PrestaShop
const data = ref(null);            // Données formatées et propres prêtes à être injectées dans le composant List
const loading = ref(false);        // État de chargement

// ============================================================================
// FONCTIONS UTILITAIRES DE NETTOYAGE XML -> JSON
// ============================================================================
/**
 * L'API PrestaShop renvoie souvent les champs traduisibles sous forme d'un tableau de langues.
 * Exemple: name: { language: [{ '@_id': 1, '#text': 'T-Shirt' }, { '@_id': 2, '#text': 'T-Shirt EN' }] }
 * Cette fonction permet de fouiller là-dedans pour n'extraire que le texte simple.
 */
function getLanguageValue(field) {
    if (field == null) {
        return null;
    }
    // Si c'est déjà un texte simple
    if (typeof field === 'string' || typeof field === 'number') {
        return field;
    }

    const languageNode = field.language;
    // Si la langue est un tableau (plusieurs langues configurées sur la boutique)
    if (Array.isArray(languageNode)) {
        return languageNode[0]?.['#text'] ?? languageNode[0] ?? null;
    }

    // Si la langue est un simple objet
    if (languageNode && typeof languageNode === 'object') {
        return languageNode['#text'] ?? null;
    }

    return field['#text'] ?? null;
}

/**
 * Fonction similaire mais pour extraire la valeur texte d'un simple nœud XML.
 */
function getNodeText(field) {
    if (field == null) {
        return null;
    }
    if (typeof field === 'string' || typeof field === 'number') {
        return field;
    }
    return field['#text'] ?? null;
}

/**
 * Prend un produit "brut" de l'API et le transforme en un objet propre et plat.
 * C'est ce format "plat" qui sera ingéré par le composant List.vue.
 */
function formatProduct(product, price, priceTtc) {
    // Extraction prudente des attributs XML (les @_)
    const imageHref = product.id_default_image?.['@_xlink:href'] ?? null;
    const categoryId = getNodeText(product.id_category_default);

    return {
        id_product: product.id ?? null,
        image: imageHref,
        name: getLanguageValue(product.name), // Nettoyage de la langue
        reference: product.reference ?? null,
        category: categoryId,
        price_tax_excluded: price,            // Prix HT
        price_tax_included: priceTtc,         // Prix TTC calculé
        quantity: product.quantity ?? null,
        active: product.active ?? null
    };
}

// ============================================================================
// CYCLE DE VIE
// ============================================================================
onMounted(async () => {
    loading.value = true;
    try {
        // Récupération de la liste des colonnes depuis la configuration (util.js)
        product_columns.value = getColumnForList('product');
        // Récupération de TOUS les produits
        raw_data.value = await getProducts('display=full');

        // Mappage (Formatage) de chaque produit de l'API vers notre format propre
        // On utilise Promise.all car on a besoin de faire une requête asynchrone pour obtenir la taxe de chaque produit.
        data.value = await Promise.all(raw_data.value.map(async (product) => {
            const price = Number(product.price ?? 0); // Sécurisation en nombre
            let taxRate = 0;
            
            // Tentative de récupération du taux de taxe (ex: 20%)
            try {
                taxRate = await getProductTaxRate(product.id);
            } catch (e) {
                taxRate = 0; // Si erreur (pas de règle de taxe), on met 0
            }
            
            // Calcul du prix final TTC
            const priceTtc = calculateTtc(price, taxRate);
            
            // Formatage complet
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
    <!-- Le composant List se charge d'afficher le tableau dynamique -->
    <List :columns="product_columns" module="Produit" :data="data"></List>
    
    <!-- Affiche la roue de chargement le temps que tous les prix TTC soient calculés -->
    <Loading :is-loading="loading"></Loading>
</template>

<style></style>