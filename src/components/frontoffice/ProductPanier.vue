<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps({
    image: { type: String, default: '' },
    description_courte: { type: String, default: '' },
    prixTtc: { type: [Number, String], default: 0 },
    prixHt: { type: [Number, String], default: 0 },
    nom: { type: String, default: '' },
    quantite: { type: Number, default: 1 }
})

const emit = defineEmits(['update:quantite', 'supprimer'])

const totalLigne = computed(() => {
    return (parseFloat(props.prixTtc) * props.quantite).toFixed(2)
})

const totalLigneHt = computed(() => {
    return (parseFloat(props.prixHt) * props.quantite).toFixed(2)
})

function incrementer() {
    emit('update:quantite', props.quantite + 1)
}

function decrementer() {
    if (props.quantite > 1) {
        emit('update:quantite', props.quantite - 1)
    }
}

function supprimer() {
    emit('supprimer')
}
</script>

<template>
    <div class="panier-item">
        <!-- Image produit -->
        <div class="panier-item__image">
            <img v-if="image" :src="image" :alt="nom" />
            <div v-else class="panier-item__image-placeholder">
                <Icon icon="lucide:package" />
            </div>
        </div>

        <!-- Infos produit -->
        <div class="panier-item__details">
            <h3 class="panier-item__nom">{{ nom }}</h3>
            <p class="panier-item__description" v-if="description_courte" v-html="description_courte"></p>
            <p class="panier-item__prix-unitaire">{{ parseFloat(prixTtc).toFixed(2) }} € / unité <span class="price-label">TTC</span></p>
            <p class="panier-item__prix-unitaire-ht">{{ parseFloat(prixHt).toFixed(2) }} € / unité <span class="price-label">HT</span></p>
        </div>

        <!-- Quantité -->
        <div class="panier-item__quantite">
            <span class="panier-item__quantite-label">Quantité</span>
            <div class="panier-item__quantite-controls">
                <button class="qty-btn" @click="decrementer" :disabled="quantite <= 1" title="Diminuer">
                    <Icon icon="lucide:minus" />
                </button>
                <span class="qty-value">{{ quantite }}</span>
                <button class="qty-btn" @click="incrementer" title="Augmenter">
                    <Icon icon="lucide:plus" />
                </button>
            </div>
        </div>

        <!-- Total ligne -->
        <div class="panier-item__total">
            <span class="panier-item__total-label">Total</span>
            <span class="panier-item__total-prix">{{ totalLigne }} € <span class="price-label">TTC</span></span>
            <span class="panier-item__total-prix-ht">{{ totalLigneHt }} € <span class="price-label">HT</span></span>
        </div>

        <!-- Supprimer -->
        <button class="panier-item__supprimer" @click="supprimer" title="Supprimer du panier">
            <Icon icon="lucide:trash-2" />
        </button>
    </div>
</template>

<style scoped>
.panier-item {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 24px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    position: relative;
}

.panier-item:hover {
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.1);
}

/* === IMAGE === */
.panier-item__image {
    flex-shrink: 0;
    width: 110px;
    height: 110px;
    border-radius: 12px;
    overflow: hidden;
    background-color: #f0f1f3;
}

.panier-item__image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
}

.panier-item:hover .panier-item__image img {
    transform: scale(1.05);
}

.panier-item__image-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    background: linear-gradient(135deg, #f0f1f3, #e4e7eb);
    color: #a4b0be;
}

/* === DETAILS === */
.panier-item__details {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.panier-item__nom {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #2f3542;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.panier-item__description {
    margin: 0;
    font-size: 0.85rem;
    color: #747d8c;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.panier-item__description :deep(p) {
    margin: 0;
}

.panier-item__prix-unitaire {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 500;
    color: #a4b0be;
}

.panier-item__prix-unitaire-ht {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #9aa1af;
}

/* === QUANTITE === */
.panier-item__quantite {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.panier-item__quantite-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #a4b0be;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.panier-item__quantite-controls {
    display: flex;
    align-items: center;
    background: #f8f9fa;
    border: 1px solid #e4e7eb;
    border-radius: 10px;
    overflow: hidden;
}

.qty-btn {
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    font-size: 1.1rem;
    font-weight: 600;
    color: #2f3542;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.qty-btn:hover:not(:disabled) {
    background: #e1e4e8;
}

.qty-btn:disabled {
    color: #ced6e0;
    cursor: not-allowed;
}

.qty-value {
    min-width: 40px;
    text-align: center;
    font-size: 1rem;
    font-weight: 700;
    color: #2f3542;
    border-left: 1px solid #e4e7eb;
    border-right: 1px solid #e4e7eb;
    padding: 6px 0;
}

/* === TOTAL === */
.panier-item__total {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    flex-shrink: 0;
    min-width: 100px;
}

.panier-item__total-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #a4b0be;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.panier-item__total-prix {
    font-size: 1.3rem;
    font-weight: 800;
    color: #2ed573;
    letter-spacing: -0.5px;
}

.panier-item__total-prix-ht {
    font-size: 0.95rem;
    font-weight: 700;
    color: #9aa1af;
}

.price-label {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: inherit;
}

/* === SUPPRIMER === */
.panier-item__supprimer {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 30px;
    height: 30px;
    border: none;
    background: transparent;
    color: #ced6e0;
    font-size: 1.1rem;
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease, color 0.2s ease;
}

.panier-item__supprimer:hover {
    background: #fff0f0;
    color: #ff4757;
}

/* === RESPONSIVE === */
@media (max-width: 768px) {
    .panier-item {
        flex-wrap: wrap;
        gap: 16px;
        padding: 18px;
    }

    .panier-item__image {
        width: 80px;
        height: 80px;
    }

    .panier-item__details {
        flex-basis: calc(100% - 110px);
    }

    .panier-item__quantite {
        flex-direction: row;
        gap: 12px;
    }

    .panier-item__total {
        align-items: flex-start;
    }

    .panier-item__quantite,
    .panier-item__total {
        flex-basis: 48%;
    }
}

@media (max-width: 480px) {
    .panier-item__details {
        flex-basis: 100%;
    }

    .panier-item__nom {
        font-size: 1rem;
    }

    .panier-item__total-prix {
        font-size: 1.15rem;
    }
}
</style>