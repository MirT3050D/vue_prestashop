<script setup>

import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import { Chart, registerables } from 'chart.js';
import { getOrders } from '@/service/orderService';
import { getCustomers } from '@/service/customerService';
import { getStockAvailables } from '@/service/stockService';

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

// --- MAPPING DES STATUTS PRESTASHOP (Étendu) ---
const STATUS_MAP = {
  1:  { label: 'Attente Chèque', color: '#94a3b8' },
  2:  { label: 'Payé', color: '#10b981' },
  3:  { label: 'Préparation', color: '#3b82f6' },
  4:  { label: 'Expédié', color: '#6366f1' },
  5:  { label: 'Livré', color: '#059669' },
  6:  { label: 'Annulé', color: '#ef4444' },
  7:  { label: 'Remboursé', color: '#f59e0b' },
  8:  { label: 'Erreur Paiement', color: '#b91c1c' },
  9:  { label: 'Rupture', color: '#f97316' },
  10: { label: 'Attente Virement', color: '#64748b' },
  11: { label: 'PayPal', color: '#003087' },
  12: { label: 'Payé (Distant)', color: '#10b981' },
  default: { label: 'Autre', color: '#d1d5db' }
};

// --- FONCTIONS UTILITAIRES ---

function extractText(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
        return String(v['#text'] || '');
    }
    return String(v);
}

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
  
  if (aggregationInterval.value === 'yearly') return `${y}`;
  if (aggregationInterval.value === 'monthly') return `${y}-${m}`;
  if (aggregationInterval.value === 'weekly') {
      const tempDate = new Date(d.getTime());
      tempDate.setHours(0, 0, 0, 0);
      tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
      const week1 = new Date(tempDate.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
      return `${y}-S${String(weekNum).padStart(2, '0')}`;
  }
  return d.toISOString().slice(0, 10);
}

// --- LOGIQUE DE FILTRAGE ---
const filteredOrders = computed(() => {
  return rawOrders.value.filter(o => {
    const dateStr = extractText(o.date_add);
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    return (!startDate.value || d >= startDate.value) && (!endDate.value || d <= endDate.value);
  });
});

// --- ANALYSE PRODUITS ---
const topProducts = computed(() => {
  const productMap = new Map();
  for (const order of filteredOrders.value) {
    const rows = order.associations?.order_rows || [];
    const normalizedRows = Array.isArray(rows) ? rows : [rows];
    for (const item of normalizedRows) {
        const productId = extractText(item?.product_id);
        if (!productId) continue;
        const current = productMap.get(productId) || { name: extractText(item.product_name), qty: 0, revenue: 0 };
        current.qty += toNumber(item.product_quantity);
        current.revenue += toNumber(item.unit_price_tax_incl) * toNumber(item.product_quantity);
        productMap.set(productId, current);
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
    const dateStr = extractText(c.date_add);
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    return (!startDate.value || d >= startDate.value) && (!endDate.value || d <= endDate.value);
  }).length;
  const totalOrders = filteredOrders.value.length;
  const uniqueCustomers = new Set(filteredOrders.value.map(o => extractText(o.id_customer))).size;
  const repeatRate = uniqueCustomers > 0 ? ((totalOrders - uniqueCustomers) / totalOrders) * 100 : 0;
  return { newAccounts: periodCustomers, loyaltyRate: repeatRate.toFixed(1) };
});

// --- AGRÉGATS COMMANDES ---
const groupedRows = computed(() => {
  const map = new Map();
  for (const o of filteredOrders.value) {
    const key = getIntervalKey(extractText(o.date_add));
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
  const stats = {};
  for (const o of filteredOrders.value) {
    const stId = extractText(o.current_state) || 'default';
    const label = STATUS_MAP[stId]?.label || STATUS_MAP.default.label;
    stats[label] = (stats[label] || 0) + 1;
  }
  return Object.entries(stats).map(([label, count]) => {
      const colorEntry = Object.values(STATUS_MAP).find(v => v.label === label) || STATUS_MAP.default;
      return { label, count, color: colorEntry.color };
  });
});


// --- APPELS API ---
async function fetchData() {
  isLoading.value = true;
  error.value = '';
  try {
    const oData = await getOrders({ display: 'full' });
    rawOrders.value = oData;

    if (rawOrders.value.length > 0 && !startDate.value) {
        const sorted = [...rawOrders.value]
            .filter(o => extractText(o.date_add))
            .sort((a,b) => extractText(a.date_add).localeCompare(extractText(b.date_add)));
        
        if (sorted.length > 0) {
            startDate.value = extractText(sorted[0].date_add).slice(0, 10);
            endDate.value = extractText(sorted[sorted.length - 1].date_add).slice(0, 10);
        }
    }

    const cData = await getCustomers({ display: '[id,date_add]' });
    rawCustomers.value = cData;

    const stockRaw = await getStockAvailables({
        display: '[id_product,quantity]',
        'filter[quantity]': '[0,10]',
        limit: '8',
        sort: '[quantity_ASC]'
    });
    
    stockAlerts.value = stockRaw.map(s => {
        const targetProductId = extractText(s.id_product);
        const found = rawOrders.value.find(o => {
            const rows = o.associations?.order_rows;
            const normalizedRows = Array.isArray(rows) ? rows : (rows ? [rows] : []);
            return normalizedRows.some(row => extractText(row?.product_id) == targetProductId);
        });
        
        let name = "Produit #" + targetProductId;
        if (found) {
            const rows = found.associations?.order_rows;
            const normalizedRows = Array.isArray(rows) ? rows : (rows ? [rows] : []);
            const row = normalizedRows.find(r => extractText(r?.product_id) == targetProductId);
            name = extractText(row?.product_name) || name;
        }
        return { ...s, name };
    });
  } catch (err) {
    console.error("Error fetching dashboard data:", err);
    error.value = 'Erreur de chargement.';
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
          { label: 'CA (€)', data: groupedRows.value.map(r => r.totalAmount), backgroundColor: '#f59e0b', yAxisID: 'y' },
          { label: 'Volume', data: groupedRows.value.map(r => r.orderCount), borderColor: '#3b82f6', type: 'line', tension: 0.3, yAxisID: 'y1', pointRadius: 4 }
        ]
      },
      options: { 
          responsive: true, 
          maintainAspectRatio: false, 
          scales: { 
              y: { beginAtZero: true, title: { display: true, text: 'Chiffre d\'Affaires (€)' } }, 
              y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Nb Commandes' } } 
          } 
      }
    });
  }
  if (statusDistribution.value.length > 0 && donutChartCanvas.value) {
    donutChartInstance = new Chart(donutChartCanvas.value, {
      type: 'doughnut',
      data: {
        labels: statusDistribution.value.map(s => s.label),
        datasets: [{ data: statusDistribution.value.map(s => s.count), backgroundColor: statusDistribution.value.map(s => s.color) }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
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
        <span class="badge-pro">PILOTAGE AVANCÉ</span>
        <h1>Dashboard Analytique</h1>
        <div class="filters">
          <input type="date" v-model="startDate">
          <span class="sep">→</span>
          <input type="date" v-model="endDate">
          <select v-model="aggregationInterval" class="select-view">
            <option value="daily">Vue Journalière</option>
            <option value="weekly">Vue Hebdomadaire</option>
            <option value="monthly">Vue Mensuelle</option>
          </select>
        </div>
      </div>
      <button class="btn-refresh" :disabled="isLoading" @click="fetchData">
        {{ isLoading ? '...' : 'Actualiser les données' }}
      </button>
    </header>

    <div class="top-metrics">
      <div class="metric-card highlight">
        <span class="label">Chiffre d'Affaires</span>
        <div class="value">{{ formatCurrency(summary.revenue) }}</div>
        <div class="sub-label">Moyenne / {{ aggregationInterval }} : {{ formatCurrency(summary.revenue / (groupedRows.length || 1)) }}</div>
      </div>
      <div class="metric-card">
        <span class="label">Commandes</span>
        <div class="value">{{ summary.count }}</div>
        <div class="sub-label">{{ (summary.count / (groupedRows.length || 1)).toFixed(1) }} / {{ aggregationInterval }}</div>
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
      <div class="panel col-span-2 chart-container">
        <h3>CA et Volume par {{ aggregationInterval }}</h3>
        <div class="canvas-wrap"><canvas ref="mainChartCanvas"></canvas></div>
      </div>
      <div class="panel donut-container">
        <h3>Distribution des États</h3>
        <div class="canvas-wrap"><canvas ref="donutChartCanvas"></canvas></div>
      </div>

      <!-- Tableau remonté pour meilleure visibilité -->
      <div class="panel col-span-2">
        <h3>Détail financier par {{ aggregationInterval }}</h3>
        <div class="table-wrap">
          <table class="simple-table">
            <thead>
              <tr><th>Période</th><th>Nb Commandes</th><th>Panier Moyen</th><th>CA Total</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in groupedRows.slice().reverse().slice(0, 10)" :key="r.key">
                <td class="font-bold">{{ r.key }}</td>
                <td>{{ r.orderCount }}</td>
                <td>{{ formatCurrency(r.averageBasket) }}</td>
                <td class="text-revenue">{{ formatCurrency(r.totalAmount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h3>Alertes Stock</h3>
        <div class="widget-list">
          <div v-for="s in stockAlerts" :key="s.id_product" class="list-item">
            <span class="item-name">{{ s.name }}</span>
            <span class="stock-badge" :class="{ 'low': s.quantity <= 3, 'warn': s.quantity > 3 }">
              {{ s.quantity }} en stock
            </span>
          </div>
        </div>
      </div>

      <div class="panel col-span-3">
        <h3>Top 5 Produits (Volume)</h3>
        <div class="products-row">
            <div v-for="p in topProducts" :key="p.id" class="product-mini-card">
                <span class="p-name">{{ p.name }}</span>
                <div class="p-stats">
                    <span class="p-qty">{{ p.qty }} ventes</span>
                    <span class="p-rev">{{ formatCurrency(p.revenue) }}</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page { padding: 30px; background: #f4f7fa; min-height: 100vh; font-family: 'Inter', sans-serif; }

.header-banner { 
  display: flex; justify-content: space-between; align-items: flex-end; 
  background: #1e293b; padding: 40px; border-radius: 25px; color: white; margin-bottom: 30px;
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
}
.badge-pro { background: #3b82f6; font-size: 0.6rem; padding: 4px 12px; border-radius: 20px; font-weight: 900; margin-bottom: 12px; display: inline-block; letter-spacing: 1px; }
.header-banner h1 { margin: 0 0 15px 0; font-size: 2.4rem; font-weight: 800; letter-spacing: -1.5px; }
.filters { display: flex; align-items: center; gap: 12px; }
.filters input, .select-view { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 10px 15px; border-radius: 12px; outline: none; font-size: 0.9rem; }
.btn-refresh { background: #3b82f6; color: white; border: none; padding: 14px 30px; border-radius: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
.btn-refresh:hover { background: #2563eb; transform: translateY(-2px); }

.top-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-bottom: 30px; }
.metric-card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); border: 1px solid #e2e8f0; }
.metric-card.highlight { border-top: 5px solid #f59e0b; }
.metric-card .label { color: #64748b; font-size: 0.8rem; font-weight: 700; display: block; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.metric-card .value { font-size: 2rem; font-weight: 900; color: #0f172a; letter-spacing: -1px; }
.sub-label { font-size: 0.75rem; color: #94a3b8; margin-top: 8px; font-weight: 500; }

.main-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 25px; }
.col-span-2 { grid-column: span 2; }
.col-span-3 { grid-column: span 3; }
.panel { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
.panel h3 { margin-top: 0; font-size: 1rem; color: #1e293b; margin-bottom: 25px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; }

.canvas-wrap { height: 320px; position: relative; }

.simple-table { width: 100%; border-collapse: collapse; }
.simple-table th { text-align: left; font-size: 0.7rem; color: #94a3b8; padding: 12px 8px; text-transform: uppercase; letter-spacing: 1px; }
.simple-table td { padding: 15px 8px; font-size: 0.9rem; border-top: 1px solid #f1f5f9; color: #334155; }
.font-bold { font-weight: 700; }
.text-revenue { color: #f59e0b; font-weight: 800; }

.widget-list { display: flex; flex-direction: column; gap: 15px; }
.list-item { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
.item-name { font-weight: 600; color: #334155; font-size: 0.9rem; }
.stock-badge { padding: 5px 12px; border-radius: 10px; font-size: 0.7rem; font-weight: 800; }
.stock-badge.low { background: #fef2f2; color: #ef4444; }
.stock-badge.warn { background: #fffbeb; color: #f59e0b; }

.products-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; }
.product-mini-card { background: #f8fafc; padding: 15px; border-radius: 15px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 10px; }
.p-name { font-size: 0.85rem; font-weight: 700; color: #1e293b; line-height: 1.2; height: 2.4em; overflow: hidden; }
.p-stats { display: flex; justify-content: space-between; align-items: center; }
.p-qty { font-size: 0.75rem; color: #64748b; font-weight: 600; }
.p-rev { font-size: 0.8rem; font-weight: 800; color: #10b981; }

@media (max-width: 1200px) { .top-metrics { grid-template-columns: repeat(2, 1fr); } .main-grid { grid-template-columns: 1fr; } .col-span-2, .col-span-3 { grid-column: span 1; } .products-row { grid-template-columns: 1fr; } }
</style>