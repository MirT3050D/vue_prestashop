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
          <template v-for="order in orders" :key="order.id">
            <tr>
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
                  :disabled="isUpdating[order.id] || isDeliveredState(order.current_state)">
                  <option disabled selected>-- Changer --</option>
                  <option v-for="state in targetStates" :key="normalizeId(state.id)" :value="normalizeId(state.id)">
                    {{ getStatusName(state.id) }}
                  </option>
                </select>
                <span v-else class="cart-label">Non modifiable</span>
                <span v-if="isUpdating[order.id]" class="mini-loader"></span>
              </td>
            </tr>
            <tr class="order-details">
              <td colspan="6">
                <Dropdown class="details-dropdown" :dropdown_title="{ label: 'Details' }">
                  <div class="details-grid">
                    <div class="detail-row header">
                      <span>Produit</span>
                      <span>Référence</span>
                      <span>Qté</span>
                      <span>PU HT</span>
                      <span>PU TTC</span>
                      <span>Total HT</span>
                      <span>Total TTC</span>
                    </div>
                    <div v-if="getOrderRows(order).length === 0" class="detail-row empty">
                      Aucun détail de commande.
                    </div>
                    <div v-for="row in getOrderRows(order)" :key="normalizeId(row.id)" class="detail-row">
                      <span>{{ row.product_name }}</span>
                      <span>{{ row.product_reference }}</span>
                      <span>{{ row.product_quantity }}</span>
                      <span>{{ toNumber(row.unit_price_tax_excl).toFixed(2) }} €</span>
                      <span>{{ toNumber(row.unit_price_tax_incl).toFixed(2) }} €</span>
                      <span>{{ (toNumber(row.unit_price_tax_excl) * toNumber(row.product_quantity)).toFixed(2) }} €</span>
                      <span>{{ (toNumber(row.unit_price_tax_incl) * toNumber(row.product_quantity)).toFixed(2) }} €</span>
                    </div>
                  </div>
                </Dropdown>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getOrders, getOrderStates, updateOrderStatus } from '@/service/orderService';
import { getCarts } from '@/service/cartService';
import { getStockAvailables, updateStockAvailable } from '@/service/stockService';
import { postXml } from '@/service/api';
import Loading from '@/components/Loading.vue';
import Dropdown from '@/components/Dropdown.vue';

const orders = ref([]);
const orderStates = ref([]);
const targetStates = ref([]);
const isLoading = ref(true);
const isUpdating = ref({});
const error = ref(null);

const stateNameMapping = ref(new Map());
const stateColorMapping = ref(new Map());
const stateIdByNameLower = ref(new Map());

function normalizeId(id) {
  if (id && typeof id === 'object') return String(id['#text'] ?? id);
  return String(id ?? '');
}

function getCartRows(cart) {
  const rows = cart?.associations?.cart_rows?.cart_row || [];
  return Array.isArray(rows) ? rows : (rows ? [rows] : []);
}

function toNumber(value) {
  if (value == null) return 0;
  const parsed = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildStockMovementXml(productId, attributeId, delta, orderId) {
  const sign = delta > 0 ? 1 : -1;
  const physicalQuantity = Math.abs(delta);
  const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const reasonId = delta > 0 ? 11 : 12;

  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <stock_mvt>
    <id_product><![CDATA[${productId}]]></id_product>
    <id_product_attribute><![CDATA[${attributeId}]]></id_product_attribute>
    <id_employee><![CDATA[1]]></id_employee>
    <id_stock><![CDATA[0]]></id_stock>
    <id_stock_mvt_reason><![CDATA[${reasonId}]]></id_stock_mvt_reason>
    <physical_quantity><![CDATA[${physicalQuantity}]]></physical_quantity>
    <sign><![CDATA[${sign}]]></sign>
    <price_te><![CDATA[0.000000]]></price_te>
    <date_add><![CDATA[${dateAdd}]]></date_add>
  </stock_mvt>
</prestashop>`;
}

function getOrderRows(order) {
  const rows = order?.associations?.order_rows?.order_row || [];
  return Array.isArray(rows) ? rows : [rows];
}

function buildStockAvailablePayload(stock, newQty) {
  const id = normalizeId(stock.id);
  const locationValue = stock.location?.['#text'] ?? stock.location;
  const payload = {
    id,
    id_product: normalizeId(stock.id_product),
    id_product_attribute: normalizeId(stock.id_product_attribute || '0'),
    id_shop: normalizeId(stock.id_shop || '1'),
    id_shop_group: normalizeId(stock.id_shop_group || '0'),
    quantity: String(newQty),
    depends_on_stock: normalizeId(stock.depends_on_stock ?? '0'),
    out_of_stock: normalizeId(stock.out_of_stock ?? '2')
  };

  if (locationValue != null && String(locationValue).trim() !== '') {
    payload.location = String(locationValue);
  }

  return { prestashop: { stock_available: payload } };
}

function getStateIdByNameLower(nameLower) {
  return stateIdByNameLower.value.get(nameLower) || '';
}

function isDeliveredState(stateId) {
  const deliveredId = getStateIdByNameLower('livré');
  return deliveredId && normalizeId(stateId) === deliveredId;
}

function isPaidState(stateId) {
  const paidId = getStateIdByNameLower('paiement accepté');
  return paidId && normalizeId(stateId) === paidId;
}

// States we want to be able to switch to
const TARGET_STATE_NAMES = ['paiement accepté', 'annulé', 'livré'];

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

    // Filtrer les paniers non convertis et non vides
    const activeCarts = cartsData.filter(c => {
      if (convertedCartIds.has(normalizeId(c.id))) return false;
      const rows = getCartRows(c);
      return rows.length > 0;
    });

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
      stateIdByNameLower.value.set(stateName, idKey);

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

  const orderToUpdate = orders.value.find(o => String(o.id) === String(orderId));
  if (!orderToUpdate || orderToUpdate.isCart) return;

  const deliveredId = getStateIdByNameLower('livré');
  const canceledId = getStateIdByNameLower('annulé');
  const paidId = getStateIdByNameLower('paiement accepté');

  if (deliveredId && normalizeId(orderToUpdate.current_state) === deliveredId && normalizeId(newStateId) !== deliveredId) {
    alert('Cette commande est déjà livrée. Changement impossible.');
    return;
  }

  if (canceledId && normalizeId(newStateId) === canceledId) {
    if (!paidId || normalizeId(orderToUpdate.current_state) !== paidId) {
      alert('Seules les commandes payées peuvent être annulées.');
      return;
    }
  }

  isUpdating.value[orderId] = true;
  try {
    await updateOrderStatus(orderId, newStateId);
    // Refresh the specific order's state locally for instant feedback
    if (orderToUpdate) {
      orderToUpdate.current_state = newStateId;
    }

    if (deliveredId && normalizeId(newStateId) === deliveredId) {
      await applyStockDelta(orderToUpdate, -1);
    }

    if (canceledId && normalizeId(newStateId) === canceledId) {
      await applyStockDelta(orderToUpdate, 1);
    }
  } catch (e) {
    alert(`Erreur lors de la mise à jour de la commande ${orderId}: ${e.message}`);
  } finally {
    isUpdating.value[orderId] = false;
  }
}

async function applyStockDelta(order, sign) {
  if (!order) return;
  const rows = getOrderRows(order);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productId = normalizeId(row.product_id);
    const attributeId = normalizeId(row.product_attribute_id) || '0';
    const qty = parseInt(normalizeId(row.product_quantity), 10) || 0;
    if (!productId || qty <= 0) continue;

    try {
      const stockList = await getStockAvailables(`filter[id_product]=[${productId}]&filter[id_product_attribute]=[${attributeId}]&display=full`);
      if (stockList && stockList.length > 0) {
        const stockToUpdate = stockList[0];
        const currentQty = parseInt(normalizeId(stockToUpdate.quantity), 10) || 0;
        const delta = qty * sign;
        const newQty = currentQty + delta;

        const payload = buildStockAvailablePayload(stockToUpdate, newQty);
        await updateStockAvailable(normalizeId(stockToUpdate.id), payload);

        const movementXml = buildStockMovementXml(productId, attributeId, delta, order.id);
        await postXml('/stock_movements', movementXml);
      }
    } catch (e) {
      console.error('Erreur stock commande:', e);
    }
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

.order-details td {
  background: #f8fafc;
}

.order-details :deep(.boite) {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: none;
  padding: 10px 12px;
  border-radius: 10px;
  max-width: none;
  width: 100%;
}

.order-details :deep(.boite h3) {
  font-size: 0.9rem;
  font-weight: 600;
  color: #1f2937;
}

.order-details :deep(.boite svg) {
  padding: 2px;
}

.order-details :deep(.elements) {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 8px 10px;
}

.details-grid {
  display: grid;
  gap: 6px;
  padding: 8px 4px;
  width: 100%;
}

.detail-row {
  display: grid;
  grid-template-columns: 2fr 1fr 0.6fr 0.8fr 0.8fr 0.9fr 0.9fr;
  gap: 10px;
  align-items: center;
  font-size: 0.8rem;
  color: #1f2937;
}

.detail-row.header {
  font-weight: 600;
  color: #111827;
}

.detail-row.empty {
  font-style: italic;
  color: #6b7280;
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
