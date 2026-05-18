<script setup>
import { computed, customRef, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import Loading from '@/components/Loading.vue';
import { getCustomerOrders, getOrderStates } from '@/service/orderService';

const customer = ref(null);
const orders = ref([]);
const orderStates = ref([]);
const isLoading = ref(true);
const error = ref('');

function extractText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        if (typeof value['#text'] !== 'undefined') return String(value['#text']);
        if (typeof value['@_id'] !== 'undefined') return String(value['@_id']);
        return '';
    }
    return String(value);
}

function loadCustomer() {
    const data = localStorage.getItem('customer');
    if (!data) {
        customer.value = null;
        return;
    }

    try {
        customer.value = JSON.parse(data);
    } catch (e) {
        customer.value = null;
    }
}

function formatDate(value) {
    const raw = extractText(value);
    if (!raw) return 'Date inconnue';

    const date = new Date(raw.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return raw;

    return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: '2-digit'
    });
}

const stateLabels = computed(() => {
    const labels = new Map();

    for (const state of orderStates.value) {
        const langNode = state?.name?.language;
        let label = '';

        if (Array.isArray(langNode)) {
            label = extractText(langNode[0]);
        } else {
            label = extractText(langNode);
        }

        labels.set(String(extractText(state.id)), label || 'Inconnu');
    }

    return labels;
});

const stateColors = computed(() => {
    const colors = new Map();

    for (const state of orderStates.value) {
        colors.set(String(extractText(state.id)), state.color || '#9ca3af');
    }

    return colors;
});

function getOrderStateLabel(stateId) {
    return stateLabels.value.get(String(extractText(stateId))) || 'Inconnu';
}

function getOrderStateColor(stateId) {
    return stateColors.value.get(String(extractText(stateId))) || '#9ca3af';
}


async function loadData() {
    isLoading.value = true;
    error.value = '';

    loadCustomer();

    if (!customer.value || Number(customer.value.id) === 1) {
        isLoading.value = false;
        return null;
    }
    else {



        if (!customer.value || !customer.value.id) {
            orders.value = [];
            isLoading.value = false;
            return;
        }

        try {
            const [ordersData, statesData] = await Promise.all([
                getCustomerOrders(customer.value.id),
                getOrderStates()
            ]);

            orders.value = ordersData
                .slice()
                .sort((a, b) => Number(extractText(b.id)) - Number(extractText(a.id)));
            orderStates.value = statesData;
        } catch (e) {
            console.error("Error loading orders:", e);
            error.value = 'Impossible de charger vos commandes pour le moment.';
        } finally {
            isLoading.value = false;
        }
    }
}

onMounted(loadData);
</script>

<template>
    <div class="orders-view">
        <section class="hero-card">
            <div>
                <p class="eyebrow">Espace client</p>
                <h1>Mes commandes</h1>
                <p class="hero-text">
                    Suivez l’état de vos commandes et consultez leur évolution.
                </p>
            </div>
            <button class="btn-secondary" @click="loadData">
                <Icon icon="lucide:refresh-cw" />
                Actualiser
            </button>
        </section>

        <div v-if="isLoading" class="state-card">
            <Loading :is-loading="true" />
            <p>Chargement de vos commandes...</p>
        </div>

        <div v-else-if="!customer || !customer.id || Number(customer.id) === 1" class="state-card auth-card">
            <Icon icon="lucide:lock" class="state-icon" />
            <h2>Connexion requise</h2>
            <p>Connectez-vous pour voir l’état de vos commandes.</p>
            <router-link to="/selection-profil" class="btn-primary">
                <Icon icon="lucide:log-in" />
                Se connecter
            </router-link>
        </div>

        <div v-else-if="error" class="state-card error-card">
            <Icon icon="lucide:alert-circle" class="state-icon" />
            <h2>Une erreur est survenue</h2>
            <p>{{ error }}</p>
        </div>

        <div v-else-if="orders.length === 0" class="state-card empty-card">
            <Icon icon="lucide:package-search" class="state-icon" />
            <h2>Aucune commande trouvée</h2>
            <p>Vos commandes apparaîtront ici dès qu’une commande aura été passée.</p>
        </div>

        <div v-else class="orders-grid">
            <article v-for="order in orders" :key="extractText(order.id)" class="order-card">
                <div class="order-head">
                    <div>
                        <p class="order-reference">Commande #{{ extractText(order.reference) || extractText(order.id) }}
                        </p>
                        <p class="order-date">Passée le {{ formatDate(order.date_add) }}</p>
                    </div>
                    <span class="order-badge" :style="{ backgroundColor: getOrderStateColor(order.current_state) }">
                        {{ getOrderStateLabel(order.current_state) }}
                    </span>
                </div>

                <div class="order-meta">
                    <div>
                        <span class="meta-label">Total</span>
                        <strong>{{ Number(extractText(order.total_paid) || 0).toFixed(2) }} €</strong>
                    </div>
                    <div>
                        <span class="meta-label">Paiement</span>
                        <strong>{{ extractText(order.payment) || 'Paiement à la livraison' }}</strong>
                    </div>
                    <div>
                        <span class="meta-label">Livraison</span>
                        <strong>Gratuite</strong>
                    </div>
                </div>
            </article>
        </div>
    </div>
</template>

<style scoped>
.orders-view {
    max-width: 1100px;
    margin: 40px auto;
    padding: 0 20px 40px;
    font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.hero-card {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    padding: 28px 30px;
    border-radius: 24px;
    color: #ffffff;
    background: linear-gradient(135deg, #2f3542 0%, #3d4a5c 55%, #4a5568 100%);
    box-shadow: 0 18px 40px rgba(47, 53, 66, 0.18);
    margin-bottom: 24px;
}

.eyebrow {
    margin: 0 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.76rem;
    opacity: 0.75;
}

.hero-card h1 {
    margin: 0;
    font-size: 2.2rem;
    line-height: 1.05;
}

.hero-text {
    max-width: 580px;
    margin: 12px 0 0;
    color: rgba(255, 255, 255, 0.78);
}

.btn-secondary,
.btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: none;
    border-radius: 12px;
    padding: 12px 16px;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
}

.btn-secondary {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
}

.btn-primary {
    color: #0f172a;
    background: #ffffff;
}

.state-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    min-height: 280px;
    padding: 28px;
    border-radius: 24px;
    background: #ffffff;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    text-align: center;
}

.state-icon {
    width: 40px;
    height: 40px;
    color: #2f3542;
}

.auth-card .state-icon,
.empty-card .state-icon {
    color: #2ed573;
}

.error-card .state-icon {
    color: #ef4444;
}

.orders-grid {
    display: grid;
    gap: 18px;
}

.order-card {
    padding: 22px 24px;
    border-radius: 20px;
    background: #ffffff;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.07);
}

.order-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 18px;
}

.order-reference {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 800;
    color: #2f3542;
}

.order-date {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 0.92rem;
}

.order-badge {
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    color: #ffffff;
    font-size: 0.86rem;
    font-weight: 700;
    white-space: nowrap;
}

.order-meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
}

.order-meta>div {
    padding: 14px;
    border-radius: 16px;
    background: #f8fafc;
}

.meta-label {
    display: block;
    margin-bottom: 6px;
    color: #64748b;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.order-meta strong {
    color: #0f172a;
}

@media (max-width: 768px) {

    .hero-card,
    .order-head {
        flex-direction: column;
    }

    .order-meta {
        grid-template-columns: 1fr;
    }
}
</style>