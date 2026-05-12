<script setup>
const props = defineProps(['image', 'name', 'price', 'promo']) 
</script>
<template>
    <div class="product-card">
        <div class="image-container">
            <img :src="image" :alt="name">
            <span v-if="promo !== null" class="promo-badge">{{ promo }}</span>
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