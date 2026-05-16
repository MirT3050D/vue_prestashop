<template>
  <div class="order-list-page">
    <h1>Liste des Commandes</h1>
    <p>Consultez et mettez à jour l'état des commandes récentes.</p>

    <div v-if="isLoading" class="loading-state">
      <Loading :is-loading="true" />
      <p>Chargement des commandes...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>Erreur lors du chargement des commandes : {{ error }}</p>
    </div>

    <div v-else class="order-table-container">
      <table class="order-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Référence</th>
            <th>Client</th>
            <th>Total</th>
            <th>État Actuel</th>
            <th>Changer l'état</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id">
            <td>{{ order.id }}</td>
            <td>{{ order.reference }}</td>
            <td>
              <span v-if="order.customer && order.customer.firstname">
                {{ order.customer.firstname }} {{ order.customer.lastname }}
              </span>
              <span v-else>
                Client ID: {{ order.id_customer['#text'] || order.id_customer }}
              </span>
            </td>
            <td>{{ parseFloat(order.total_paid).toFixed(2) }} €</td>
            <td>
              <span class="status-badge" :style="{ backgroundColor: getStatusColor(order.current_state) }">
                {{ getStatusName(order.current_state) }}
              </span>
            </td>
            <td>
              <select v-if="!order.isCart" @change="onStatusChange(order.id, $event.target.value)" class="status-select"
                :disabled="isUpdating[order.id]">
                <option disabled selected>-- Changer --</option>
                <option v-for="state in targetStates" :key="normalizeId(state.id)" :value="normalizeId(state.id)">
                  {{ getStatusName(state.id) }}
                </option>
              </select>
              <span v-else class="cart-label">Non modifiable</span>
              <span v-if="isUpdating[order.id]" class="mini-loader"></span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getOrders, getOrderStates, updateOrderStatus } from '@/service/orderService';
import { getCarts } from '@/service/cartService';
import Loading from '@/components/Loading.vue';

const orders = ref([]);
const orderStates = ref([]);
const targetStates = ref([]);
const isLoading = ref(true);
const isUpdating = ref({});
const error = ref(null);

const stateNameMapping = ref(new Map());
const stateColorMapping = ref(new Map());

function normalizeId(id) {
  if (id && typeof id === 'object') return String(id['#text'] ?? id);
  return String(id ?? '');
}

// States we want to be able to switch to
const TARGET_STATE_NAMES = ['paiement accepté', 'annulé'];

async function fetchData() {
  isLoading.value = true;
  error.value = null;
  try {
    const [ordersData, statesData, cartsData] = await Promise.all([
      getOrders({ display: 'full' }),
      getOrderStates(),
      getCarts({ display: 'full' })
    ]);

    // Identifiants des paniers déjà convertis en commandes
    const convertedCartIds = new Set(ordersData.map(o => normalizeId(o.id_cart)).filter(id => id && id !== '0'));

    // Filtrer les paniers non convertis
    const activeCarts = cartsData.filter(c => !convertedCartIds.has(normalizeId(c.id)));

    // Normaliser les paniers pour le tableau
    const normalizedCarts = activeCarts.map(c => ({
      id: normalizeId(c.id),
      reference: `PANIER #${normalizeId(c.id)}`,
      id_customer: c.id_customer,
      total_paid: 0, // Les paniers n'ont pas de total_paid direct dans l'API standard sans calcul
      current_state: 'dans_le_panier',
      isCart: true,
      customer: c.customer || null
    }));

    orders.value = [...ordersData, ...normalizedCarts].sort((a, b) => b.id - a.id);
    orderStates.value = statesData;

    // Create mappings for quick lookup
    statesData.forEach(state => {
      // Handle language field: can be array (multi-lang) or object (single lang)
      const langNode = state.name?.language;
      let stateText = '';
      if (Array.isArray(langNode)) {
        stateText = langNode[0]['#text'] || '';
      } else if (langNode && typeof langNode === 'object') {
        stateText = langNode['#text'] || '';
      } else if (typeof langNode === 'string') {
        stateText = langNode;
      }
      const stateName = stateText.toLowerCase();
      const idKey = normalizeId(state.id);
      stateNameMapping.value.set(idKey, stateText);
      stateColorMapping.value.set(idKey, state.color);

      if (TARGET_STATE_NAMES.includes(stateName)) {
        targetStates.value.push(state);
      }
      console.log('state parsed:', { id: state.id, idKey, name: stateText, nameLower: stateName, color: state.color });
    });

    console.log('stateNameMapping entries:', Array.from(stateNameMapping.value.entries()));
    console.log('stateColorMapping entries:', Array.from(stateColorMapping.value.entries()));
    console.log('targetStates:', targetStates.value);

  } catch (e) {
    error.value = e.message;
  } finally {
    isLoading.value = false;
  }
}

function getStatusName(stateId) {
  if (stateId === 'dans_le_panier') return 'Dans le panier';
  const idKey = normalizeId(stateId);
  return stateNameMapping.value.get(idKey) || 'Inconnu';
}

function getStatusColor(stateId) {
  if (stateId === 'dans_le_panier') return '#94a3b8'; // Gris ardoise pour les paniers
  const idKey = normalizeId(stateId);
  const color = stateColorMapping.value.get(idKey);
  return color || '#cccccc';
}

async function onStatusChange(orderId, newStateId) {
  if (!newStateId) return;

  isUpdating.value[orderId] = true;
  try {
    await updateOrderStatus(orderId, newStateId);
    // Refresh the specific order's state locally for instant feedback
    const orderToUpdate = orders.value.find(o => String(o.id) === String(orderId));
    if (orderToUpdate) {
      orderToUpdate.current_state = newStateId;
    }
  } catch (e) {
    alert(`Erreur lors de la mise à jour de la commande ${orderId}: ${e.message}`);
  } finally {
    isUpdating.value[orderId] = false;
  }
}

onMounted(fetchData);
</script>

<style scoped>
.order-list-page {
  padding: 2rem;
}

.order-table-container {
  overflow-x: auto;
}

.order-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

.order-table th,
.order-table td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

.order-table th {
  background-color: #f8fafc;
  font-weight: 600;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 12px;
  color: white;
  font-size: 0.8rem;
  font-weight: 500;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.1);
}

.status-select {
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
}

.mini-loader {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-left: 8px;
  vertical-align: middle;
}

.cart-label {
  font-size: 0.8rem;
  color: #94a3b8;
  font-style: italic;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}
</style>
