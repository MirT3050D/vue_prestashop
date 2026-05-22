<script setup>
import { onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import Loading from '@/components/Loading.vue';
import { getCustomerOrders, getOrderStates, parseOrderStates, getStateName, getStateColor } from '@/service/orderService';
import { extractText, formatDate } from '@/service/prestashopUtils';
import { getCurrentCustomer } from '@/service/authService';
import { getCart } from '@/service/cartService';
import { processCheckout, validateCartStock } from '@/service/checkoutService';
import { getAddress } from '@/service/addressService';
import { getItemStock } from '@/service/cartLocalService';
import { getCartStorageKey } from '@/service/cartLocalService';
import { updateOrderStatus } from '@/service/orderService';

const customer = ref(null);
const orders = ref([]);
const stateNameMap = ref(new Map());
const stateColorMap = ref(new Map());
const isLoading = ref(true);
const error = ref('');
const nombre_duplication = ref(1);

function getOrderStateLabel(stateId) {
    return getStateName(stateId, stateNameMap.value);
}

function getOrderStateColor(stateId) {
    return getStateColor(stateId, stateColorMap.value);
}

// ===== Passer la commande =====
async function passerCommande(order) {
    let idOrder = 0;
    const panier = await getCart(order["id_cart"]["#text"]);
    let panier_row = panier["associations"]["cart_rows"]["cart_row"];
    let panier_row_tab = [[]];
    for (let index = 0; index < panier_row.length; index++) {
        panier_row[index]["quantity"] = panier_row[index]["quantity"] * nombre_duplication.value;
        panier_row[index]["price"] = order["associations"]["order_rows"]["order_row"][index]["product_price"];
        panier_row[index]["name"] = order["associations"]["order_rows"]["order_row"][index]["product_name"];
        panier_row[index]["id_product"] = panier_row[index]["id_product"]["#text"];
        panier_row[index]["id_product_attribute"] = panier_row[index]["id_product_attribute"]["#text"];
    }
    if (panier_row.length == null) {
        panier_row_tab[0]["quantity"] = panier_row["quantity"] * nombre_duplication.value;
        panier_row_tab[0]["price"] = order["associations"]["order_rows"]["order_row"]["product_price"];
        panier_row_tab[0]["name"] = order["associations"]["order_rows"]["order_row"]["product_name"];
        panier_row_tab[0]["id_product"] = panier_row["id_product"]["#text"];
        panier_row_tab[0]["id_product_attribute"] = panier_row["id_product_attribute"]["#text"];
        panier_row = panier_row_tab;
    }
    console.log("CART ROW", panier_row);
    const form = await getAddress(order["id_address_delivery"]["#text"]);
    // Validate stock
    const stockValidation = await validateCartStock(panier_row, async (item) => {
        return await getItemStock(item.id_product, item.id_product_attribute);
    });

    if (!stockValidation.valid) {
        error.value = stockValidation.error;
        return;
    }

    error.value = '';

    const result = await processCheckout(customer.value, form, panier_row, 2);

    if (result.success) {
        idOrder = result.orderId;
        localStorage.setItem(getCartStorageKey(), JSON.stringify([]));
        updateOrderStatus(idOrder, 5);
        // step.value = 'confirmation';
    } else {
        error.value = result.error;
        console.log("error", error);
    }

}


async function loadData() {
    isLoading.value = true;
    error.value = '';

    customer.value = getCurrentCustomer();

    if (!customer.value || Number(customer.value.id) === 1) {
        isLoading.value = false;
        return null;
    }

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

        const parsed = parseOrderStates(statesData);
        stateNameMap.value = parsed.nameMap;
        stateColorMap.value = parsed.colorMap;
        console.log("order", orders.value);
        if (orders.value.length > 0) {
            console.log("adresse", await getAddress(orders.value[0]["id_address_delivery"]["#text"]));
            const cart = await (getCart(orders.value[0]["id_cart"]["#text"], "?display=full"));
            console.log("cart", cart["associations"]["cart_rows"]["cart_row"]);
        }
    } catch (e) {
        console.error("Error loading orders:", e);
        error.value = 'Impossible de charger vos commandes pour le moment.';
    } finally {
        isLoading.value = false;
    }
}

function getOrderRows(order) {
    const rows = order?.associations?.order_rows?.order_row || [];
    return Array.isArray(rows) ? rows : [rows];
}

const expandedOrders = ref({});
function toggleOrderDetails(orderId) {
    expandedOrders.value[orderId] = !expandedOrders.value[orderId];
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
                    <div>
                        <button @click="passerCommande(order)">
                            Dupliquer
                        </button>
                        <input v-model="nombre_duplication" type="number" id="nb">
                    </div>
                </div>

                <div style="margin-top: 15px; text-align: center;">
                    <button
                        style="padding: 8px 16px; font-size: 0.85rem; background-color: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s ease;"
                        @click="toggleOrderDetails(extractText(order.id))"
                        onmouseover="this.style.backgroundColor='#e2e8f0'"
                        onmouseout="this.style.backgroundColor='#f1f5f9'">
                        {{ expandedOrders[extractText(order.id)] ? 'Masquer détails' : 'Voir détails' }}
                    </button>
                </div>

                <div v-if="expandedOrders[extractText(order.id)]" class="order-details-section">
                    <h4>Détails des produits</h4>
                    <div class="details-list">
                        <div v-for="(row, index) in getOrderRows(order)" :key="index" class="detail-item">
                            <div class="detail-name">{{ extractText(row.product_name) }}</div>
                            <div class="detail-qty">Qté: {{ extractText(row.product_quantity) }}</div>
                            <div class="detail-price">{{ Number(extractText(row.unit_price_tax_incl) || 0).toFixed(2) }}
                                € / u</div>
                        </div>
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

.order-details-section {
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px dashed #e2e8f0;
}

.order-details-section h4 {
    margin: 0 0 12px 0;
    font-size: 0.95rem;
    color: #475569;
}

.details-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.detail-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #f8fafc;
    border-radius: 8px;
    font-size: 0.9rem;
}

.detail-name {
    flex: 2;
    font-weight: 600;
    color: #1e293b;
}

.detail-qty {
    flex: 1;
    color: #64748b;
    text-align: center;
}

.detail-price {
    flex: 1;
    text-align: right;
    font-weight: 700;
    color: #0f172a;
}
</style>