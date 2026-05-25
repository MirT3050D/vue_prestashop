<script setup>
// ============================================================================
// DÉFINITION DES PROPRIÉTÉS (PROPS)
// ============================================================================
// Ce composant reçoit toutes les informations d'un produit pour l'afficher sous forme de "Tuile" (Carte).
const props = defineProps([
    'image',    // URL de l'image de couverture du produit
    'name',     // Nom du produit
    'priceHt',  // Prix Hors Taxes
    'priceTtc', // Prix Toutes Taxes Comprises (Prix de vente)
    'promo',    // (Optionnel) Pourcentage de promotion (ex: "-20%")
    'badge'     // (Optionnel) Étiquette spéciale (ex: "HOT", "NEW")
])
</script>

<template>
    <!-- Carte Produit (Tuile) cliquable -->
    <div class="product-card">
        <!-- Zone supérieure : Image et Badges -->
        <div class="image-container">
            <img :src="image" :alt="name">
            <!-- Badge de promotion en haut à droite (Rouge) -->
            <span v-if="promo !== null" class="promo-badge">{{ promo }}</span>
            <!-- Badge de nouveauté en haut à gauche (Gradients de couleurs selon HOT ou NEW) -->
            <span v-if="badge" :class="['status-badge', badge.toLowerCase()]">{{ badge }}</span>
        </div>
        
        <!-- Zone inférieure : Informations textuelles et Prix -->
        <div class="product-info">
            <h3 class="product-name">{{ name }}</h3>
            <p class="product-price">{{ priceTtc }} € <span class="price-label">TTC</span></p>
            <p class="product-price-ht">{{ priceHt }} € <span class="price-label">HT</span></p>
        </div>
    </div>
</template>

<style scoped>
/* Conteneur principal de la carte produit avec effet de survol (hover) */
.product-card {
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    /* Transition fluide pour l'élévation de la carte au survol */
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    max-width: 300px;
    font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

/* L'effet de "Soulèvement" quand la souris passe dessus */
.product-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}

/* Conteneur de l'image, aspect-ratio 1/1 force une image parfaitement carrée */
.image-container {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    background-color: #f8f9fa;
    overflow: hidden;
}

.image-container img {
    width: 100%;
    height: 100%;
    object-fit: cover; /* Recadre l'image sans l'écraser */
    transition: transform 0.3s ease;
}

/* Zoom léger de l'image au survol de la carte globale */
.product-card:hover .image-container img {
    transform: scale(1.05);
}

/* === STYLE DES BADGES FLOTTANTS SUR L'IMAGE === */
.promo-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    background-color: #ff4757;
    color: white;
    font-size: 0.85rem;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 20px;
    box-shadow: 0 2px 8px rgba(255, 71, 87, 0.4);
}

.status-badge {
    position: absolute;
    top: 12px;
    left: 12px;
    color: white;
    font-size: 0.75rem;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 6px;
    text-transform: uppercase;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.status-badge.hot {
    background: linear-gradient(135deg, #ff4757 0%, #ff6b81 100%);
}

.status-badge.new {
    background: linear-gradient(135deg, #2ed573 0%, #7bed9f 100%);
}

/* === INFORMATIONS TEXTUELLES === */
.product-info {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.product-name {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: #2f3542;
    line-height: 1.4;
}

.product-price {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #2ed573; /* Couleur verte pour le prix principal TTC */
}

.product-price-ht {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #9aa1af; /* Couleur grise et plus petite pour le HT */
}

/* Petite étiquette "TTC" ou "HT" accolée au prix */
.price-label {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: inherit;
}
</style>