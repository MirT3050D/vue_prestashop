<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import { Chart, registerables } from 'chart.js';
import { api } from '@/service/api';

Chart.register(...registerables);

// --- ÉTATS ---
const isLoading = ref(false);
const error = ref('');
const rawOrders = ref([]);
const rawCustomers = ref([]);
const stockAlerts = ref([]);

// Filtres
const startDate = ref('');
const endDate = ref('');
const aggregationInterval = ref('daily');

const mainChartCanvas = ref(null);
const donutChartCanvas = ref(null);
let mainChartInstance = null;
let donutChartInstance = null;

// --- MAPPING ---
const STATUS_MAP = {
  2: { label: 'Payé', color: '#10b981' },
  3: { label: 'En cours', color: '#3b82f6' },
  4: { label: 'Expédié', color: '#6366f1' },
  5: { label: 'Livré', color: '#059669' },
  6: { label: 'Annulé', color: '#ef4444' },
  7: { label: 'Remboursé', color: '#f59e0b' },
  default: { label: 'Autre', color: '#94a3b8' }
};

// --- FONCTIONS UTILITAIRES ---
function toNumber(v) {
    if (v === null || v === undefined || v === '') return 0;
    const n = String(v).replace(',', '.');
    return Number.isFinite(Number.parseFloat(n)) ? Number.parseFloat(n) : 0;
}

function getIntervalKey(dateString) {
  const d = new Date(dateString.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const q = Math.floor(d.getMonth() / 3) + 1;
  if (aggregationInterval.value === 'yearly') return `${y}`;
  if (aggregationInterval.value === 'quarterly') return `${y}-T${q}`;
  if (aggregationInterval.value === 'monthly') return `${y}-${m}`;
  return d.toISOString().slice(0, 10);
}

// --- LOGIQUE DE FILTRAGE ---
const filteredOrders = computed(() => {
  return rawOrders.value.filter(o => {
    const d = o.date_add.slice(0, 10);
    return (!startDate.value || d >= startDate.value) && (!endDate.value || d <= endDate.value);
  });
});

// --- ANALYSE PRODUITS (Top 5) ---
const topProducts = computed(() => {
  const productMap = new Map();
  for (const order of filteredOrders.value) {
    const rows = order.associations?.order_rows || [];
    const normalizedRows = Array.isArray(rows) ? rows : [rows];
    
    for (const item of normalizedRows) {
        if (!item.product_id) continue;
        const current = productMap.get(item.product_id) || { name: item.product_name, qty: 0, revenue: 0 };
        current.qty += toNumber(item.product_quantity);
        current.revenue += toNumber(item.unit_price_tax_incl) * toNumber(item.product_quantity);
        productMap.set(item.product_id, current);
    }
  }
  return [...productMap.entries()]
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);
});

// --- ANALYSE CLIENTS ---
const customerStats = computed(() => {
  const periodCustomers = rawCustomers.value.filter(c => {
    const d = c.date_add.slice(0, 10);
    return (!startDate.value || d >= startDate.value) && (!endDate.value || d <= endDate.value);
  }).length;

  const totalOrders = filteredOrders.value.length;
  const uniqueCustomers = new Set(filteredOrders.value.map(o => o.id_customer)).size;
  const repeatRate = uniqueCustomers > 0 ? ((totalOrders - uniqueCustomers) / totalOrders) * 100 : 0;

  return { newAccounts: periodCustomers, loyaltyRate: repeatRate.toFixed(1) };
});

// --- AGRÉGATS COMMANDES ---
const groupedRows = computed(() => {
  const map = new Map();
  for (const o of filteredOrders.value) {
    const key = getIntervalKey(o.date_add);
    if (!key) continue;
    const amt = toNumber(o.total_paid_tax_incl);
    const curr = map.get(key) || { key, orderCount: 0, totalAmount: 0 };
    curr.orderCount += 1;
    curr.totalAmount += amt;
    map.set(key, curr);
  }
  return [...map.values()]
    .map(r => ({ ...r, averageBasket: r.orderCount > 0 ? r.totalAmount / r.orderCount : 0 }))
    .sort((a, b) => a.key.localeCompare(b.key));
});

const summary = computed(() => {
  const rev = filteredOrders.value.reduce((s, o) => s + toNumber(o.total_paid_tax_incl), 0);
  const count = filteredOrders.value.length;
  return { revenue: rev, count, avg: count > 0 ? rev / count : 0 };
});

const statusDistribution = computed(() => {
  const s = {};
  for (const o of filteredOrders.value) {
    const st = o.current_state || 'default';
    s[st] = (s[st] || 0) + 1;
  }
  return Object.entries(s).map(([id, count]) => ({
    id, count, 
    label: STATUS_MAP[id]?.label || STATUS_MAP.default.label,
    color: STATUS_MAP[id]?.color || STATUS_MAP.default.color
  }));
});

// --- APPELS API ---
async function fetchData() {
  isLoading.value = true;
  error.value = '';
  try {
    // 1. Commandes (avec associations pour le top produits)
    const orderRes = await api.get('/orders', {
      params: { display: 'full' }
    });
    const oData = orderRes.data?.orders?.order || orderRes.data?.orders || [];
    rawOrders.value = Array.isArray(oData) ? oData : [oData];

    // Dates par défaut
    if (rawOrders.value.length > 0 && !startDate.value) {
        const sorted = [...rawOrders.value].sort((a,b) => a.date_add.localeCompare(b.date_add));
        startDate.value = sorted[0].date_add.slice(0, 10);
        endDate.value = sorted[sorted.length - 1].date_add.slice(0, 10);
    }

    // 2. Clients
    const custRes = await api.get('/customers', { params: { display: '[id,date_add]' } });
    const cData = custRes.data?.customers?.customer || custRes.data?.customers || [];
    rawCustomers.value = Array.isArray(cData) ? cData : [cData];

    // 3. Stock Alertes (on prend les 8 premiers avec stock faible)
    const stockRes = await api.get('/stock_availables', {
        params: { 
            display: '[id_product,quantity]',
            'filter[quantity]': '[0,10]',
            limit: '8',
            sort: '[quantity_ASC]'
        }
    });
    const sData = stockRes.data?.stock_availables?.stock_available || stockRes.data?.stock_availables || [];
    const stockRaw = Array.isArray(sData) ? sData : [sData];
    
    // Pour les noms des produits, on peut essayer de les retrouver dans les commandes déjà chargées
    stockAlerts.value = stockRaw.map(s => {
        const found = rawOrders.value.find(o => 
            (Array.isArray(o.associations?.order_rows) ? o.associations.order_rows : [o.associations?.order_rows])
            .some(row => row?.product_id == s.id_product)
        );
        let name = "Produit #" + s.id_product;
        if (found) {
            const row = (Array.isArray(found.associations.order_rows) ? found.associations.order_rows : [found.associations.order_rows])
                        .find(r => r?.product_id == s.id_product);
            name = row?.product_name || name;
        }
        return { ...s, name };
    });

  } catch (err) {
    error.value = 'Erreur lors du chargement des données opérationnelles.';
  } finally {
    isLoading.value = false;
  }
}

// --- GRAPHIQUES ---
function destroyCharts() {
  if (mainChartInstance) mainChartInstance.destroy();
  if (donutChartInstance) donutChartInstance.destroy();
}

async function renderCharts() {
  await nextTick();
  destroyCharts();
  if (groupedRows.value.length > 0 && mainChartCanvas.value) {
    mainChartInstance = new Chart(mainChartCanvas.value, {
      type: 'bar',
      data: {
        labels: groupedRows.value.map(r => r.key),
        datasets: [
          { label: 'Volume', data: groupedRows.value.map(r => r.orderCount), backgroundColor: '#3b82f6', yAxisID: 'y' },
          { label: 'CA (€)', data: groupedRows.value.map(r => r.totalAmount), borderColor: '#f59e0b', type: 'line', tension: 0.3, yAxisID: 'y1' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, y1: { position: 'right', grid: { drawOnChartArea: false } } } }
    });
  }
  if (statusDistribution.value.length > 0 && donutChartCanvas.value) {
    donutChartInstance = new Chart(donutChartCanvas.value, {
      type: 'doughnut',
      data: {
        labels: statusDistribution.value.map(s => s.label),
        datasets: [{ data: statusDistribution.value.map(s => s.count), backgroundColor: statusDistribution.value.map(s => s.color) }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '75%' }
    });
  }
}

watch([groupedRows, statusDistribution], renderCharts, { deep: true });
onMounted(() => { fetchData(); });
onBeforeUnmount(() => destroyCharts());

function formatCurrency(v) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0); }
</script>

<template>
  <div class="dashboard-page">
    <header class="header-banner">
      <div class="header-info">
        <span class="badge-new">PRO UPGRADE</span>
        <h1>Dashboard Opérationnel</h1>
        <div class="filters">
          <input type="date" v-model="startDate">
          <span class="sep">→</span>
          <input type="date" v-model="endDate">
          <select v-model="aggregationInterval" class="select-view">
            <option value="daily">Jour</option>
            <option value="monthly">Mois</option>
            <option value="yearly">An</option>
          </select>
        </div>
      </div>
      <button class="btn-refresh" :disabled="isLoading" @click="fetchData">
        {{ isLoading ? '...' : 'Actualiser' }}
      </button>
    </header>

    <div class="top-metrics">
      <div class="metric-card">
        <span class="label">Revenu Total</span>
        <div class="value">{{ formatCurrency(summary.revenue) }}</div>
      </div>
      <div class="metric-card">
        <span class="label">Commandes</span>
        <div class="value">{{ summary.count }}</div>
      </div>
      <div class="metric-card">
        <span class="label">Nouveaux Clients</span>
        <div class="value">{{ customerStats.newAccounts }}</div>
      </div>
      <div class="metric-card">
        <span class="label">Taux de Rétention</span>
        <div class="value">{{ customerStats.loyaltyRate }}%</div>
      </div>
    </div>

    <div class="main-grid">
      <!-- Graphiques -->
      <div class="panel col-span-2 chart-container">
        <h3>Performance Commerciale</h3>
        <div class="canvas-wrap"><canvas ref="mainChartCanvas"></canvas></div>
      </div>
      <div class="panel donut-container">
        <h3>États des Commandes</h3>
        <div class="canvas-wrap"><canvas ref="donutChartCanvas"></canvas></div>
      </div>

      <!-- Widgets Opérationnels -->
      <div class="panel">
        <h3>Top 5 Produits Vendus</h3>
        <div class="widget-list">
          <div v-for="p in topProducts" :key="p.id" class="list-item">
            <div class="item-info">
              <span class="item-name">{{ p.name }}</span>
              <span class="item-sub">{{ p.qty }} unités</span>
            </div>
            <span class="item-price">{{ formatCurrency(p.revenue) }}</span>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>Alertes Stock Faible</h3>
        <div class="widget-list">
          <div v-for="s in stockAlerts" :key="s.id_product" class="list-item">
            <span class="item-name">{{ s.name }}</span>
            <span class="stock-badge" :class="{ 'low': s.quantity <= 3, 'warn': s.quantity > 3 }">
              {{ s.quantity }} restants
            </span>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>Résumé des Périodes</h3>
        <div class="table-wrap">
          <table class="simple-table">
            <thead>
              <tr><th>Période</th><th>Cmds</th><th>CA</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in groupedRows.slice(-5)" :key="r.key">
                <td>{{ r.key }}</td>
                <td>{{ r.orderCount }}</td>
                <td>{{ formatCurrency(r.totalAmount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page { padding: 30px; background: #f0f2f5; min-height: 100vh; font-family: 'Inter', sans-serif; }

/* Header */
.header-banner { 
  display: flex; justify-content: space-between; align-items: flex-end; 
  background: #1a2233; padding: 40px; border-radius: 30px; color: white; margin-bottom: 30px;
}
.badge-new { 
  background: #3b82f6; font-size: 0.65rem; padding: 4px 10px; border-radius: 20px; 
  font-weight: 800; margin-bottom: 10px; display: inline-block;
}
.header-banner h1 { margin: 0 0 15px 0; font-size: 2.2rem; font-weight: 800; letter-spacing: -1px; }
.filters { display: flex; align-items: center; gap: 12px; }
.filters input, .select-view { 
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); 
  color: white; padding: 8px 15px; border-radius: 12px; outline: none;
}
.btn-refresh { 
  background: white; color: #1a2233; border: none; padding: 12px 30px; 
  border-radius: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s;
}

/* Metrics Cards */
.top-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
.metric-card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
.metric-card .label { color: #64748b; font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 8px; }
.metric-card .value { font-size: 1.8rem; font-weight: 800; color: #1e293b; }

/* Grid & Panels */
.main-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 25px; }
.col-span-2 { grid-column: span 2; }
.panel { background: white; padding: 25px; border-radius: 25px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
.panel h3 { margin-top: 0; font-size: 1.1rem; color: #1e293b; margin-bottom: 20px; border-left: 4px solid #3b82f6; padding-left: 15px; }

.canvas-wrap { height: 300px; position: relative; }

/* Lists */
.widget-list { display: flex; flex-direction: column; gap: 15px; }
.list-item { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9; }
.item-name { font-weight: 600; color: #334155; font-size: 0.95rem; display: block; }
.item-sub { color: #94a3b8; font-size: 0.8rem; }
.item-price { font-weight: 700; color: #10b981; }

.stock-badge { padding: 4px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; }
.stock-badge.low { background: #fef2f2; color: #ef4444; }
.stock-badge.warn { background: #fffbeb; color: #f59e0b; }

/* Tables */
.simple-table { width: 100%; border-collapse: collapse; }
.simple-table th { text-align: left; font-size: 0.75rem; color: #64748b; padding: 8px; }
.simple-table td { padding: 8px; font-size: 0.85rem; border-top: 1px solid #f1f5f9; }

@media (max-width: 1200px) { .top-metrics { grid-template-columns: repeat(2, 1fr); } .main-grid { grid-template-columns: 1fr; } .col-span-2 { grid-column: span 1; } }
</style>