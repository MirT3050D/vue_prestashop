<script setup>
const props = defineProps(['image', 'name', 'price', 'promo', 'badge']) 
</script>
<template>
    <div class="product-card">
        <div class="image-container">
            <img :src="image" :alt="name">
            <span v-if="promo !== null" class="promo-badge">{{ promo }}</span>
            <!-- Nouveau Badge HOT/NEW -->
            <span v-if="badge" :class="['status-badge', badge.toLowerCase()]">{{ badge }}</span>
        </div>
        <div class="product-info">
            <h3 class="product-name">{{ name }}</h3>
            <p class="product-price">{{ price }}</p>
        </div>
    </div>
</template>

<style scoped>
.product-card {
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    max-width: 300px;
    font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.product-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}

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
    object-fit: cover;
    transition: transform 0.3s ease;
}

.product-card:hover .image-container img {
    transform: scale(1.05);
}

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
    color: #2ed573;
}
</style>