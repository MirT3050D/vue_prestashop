<script setup>
import { computed, onMounted, ref } from 'vue';
import { extractText, toNumber, getLanguageText, normalizeArray, getOrderRows, formatMoney } from '@/service/prestashopUtils';
import { fetchDashboardData, filterOrdersByDate, computeSalesStats, computeTopProducts, computeCategoryProfitStats, computeTotals, computeTotalStockPurchaseHt } from '@/service/dashboardService';
import StatistiqueVente from '@/components/backoffice/StatistiqueVente.vue';
import MeilleurProduit from '@/components/backoffice/MeilleurProduit.vue';
import Loading from '@/components/Loading.vue';

const rawOrders = ref([]);
const allProducts = ref([]);
const allStocks = ref([]);
const startDate = ref('');
const endDate = ref('');
const aggregationInterval = ref('daily');
const productInfoById = ref({});
const categoryNameById = ref({});
const isRefreshing = ref(false);
const isLoading = ref(true);

const filteredOrders = computed(function () {
  return filterOrdersByDate(rawOrders.value, startDate.value, endDate.value);
});

const salesStats = computed(function () {
  return computeSalesStats(filteredOrders.value, '', '', aggregationInterval.value);
});

const topProducts = computed(function () {
  return computeTopProducts(filteredOrders.value, '', '', 5);
});

const categoryProfitStats = computed(function () {
  return computeCategoryProfitStats(filteredOrders.value, '', '', productInfoById.value, categoryNameById.value);
});

const totalSalesHt = computed(function () {
  let total = 0;
  const list = categoryProfitStats.value;
  for (let i = 0; i < list.length; i++) {
    total += list[i].totalSalesHt;
  }
  return total;
});

const totalSalesTtc = computed(function () {
  let total = 0;
  const list = categoryProfitStats.value;
  for (let i = 0; i < list.length; i++) {
    total += list[i].totalSalesTtc;
  }
  return total;
});

const totalPurchaseHt = computed(function () {
  let total = 0;
  const list = categoryProfitStats.value;
  for (let i = 0; i < list.length; i++) {
    total += list[i].totalPurchaseHt;
  }
  return total;
});

const totalProfit = computed(function () {
  return totalSalesHt.value - totalPurchaseHt.value;
});

const totalStockPurchaseHt = computed(function () {
  return computeTotalStockPurchaseHt(allProducts.value, allStocks.value, filteredOrders.value, '', '');
});

const totalStockProfit = computed(function () {
  return totalSalesHt.value - totalStockPurchaseHt.value;
});

async function fetchData() {
  isLoading.value = true;
  try {
    const data = await fetchDashboardData();

    rawOrders.value = data.orders;
    allProducts.value = data.allProducts;
    allStocks.value = data.allStocks;
    productInfoById.value = data.productInfoById;
    categoryNameById.value = data.categoryNameById;

    if (data.dateRange && !startDate.value) {
      startDate.value = data.dateRange.start;
      endDate.value = data.dateRange.end;
    }
  } finally {
    isLoading.value = false;
  }
}

async function handleRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await fetchData();
  } finally {
    isRefreshing.value = false;
  }
}

onMounted(fetchData);
</script>

<template>
  <div class="dashboard-page">
    <header class="header-banner">
      <h1>Statistiques de Ventes</h1>
      <div class="filters">
        <input type="date" v-model="startDate">
        <span>→</span>
        <input type="date" v-model="endDate">
        <select v-model="aggregationInterval" class="select-interval">
          <option value="daily">Journalier</option>
          <option value="weekly">Hebdomadaire</option>
          <option value="monthly">Mensuel</option>
          <option value="yearly">Annuel</option>
        </select>
        <button class="btn-refresh" type="button" :disabled="isRefreshing" @click="handleRefresh">
          {{ isRefreshing ? 'Chargement...' : 'Actualiser' }}
        </button>
      </div>
    </header>

    <div v-if="isLoading" class="loading-container">
      <Loading :isLoading="isLoading" />
      <p>Chargement des statistiques...</p>
    </div>

    <div v-else>
      <div class="main-content">
        <StatistiqueVente :stats="salesStats" />
        <MeilleurProduit :produits="topProducts" />
      </div>

      <section class="summary-section">
        <div class="summary-card">
          <p>Ventes HT</p>
          <h3>{{ formatMoney(totalSalesHt) }} €</h3>
        </div>
        <div class="summary-card">
          <p>Ventes TTC</p>
          <h3>{{ formatMoney(totalSalesTtc) }} €</h3>
        </div>
        <div class="summary-card">
          <p>Achats HT</p>
          <h3>{{ formatMoney(totalPurchaseHt) }} €</h3>
        </div>
        <div class="summary-card highlight">
          <p>Benefice</p>
          <h3>{{ formatMoney(totalProfit) }} €</h3>
        </div>
        <div class="summary-card">
          <p>Prix d'achat total</p>
          <h3>{{ formatMoney(totalStockPurchaseHt) }} €</h3>
        </div>
        <div class="summary-card highlight-purple">
          <p>Benefice total</p>
          <h3>{{ formatMoney(totalStockProfit) }} €</h3>
        </div>
      </section>

      <section class="category-profit">
        <h2>Benefice par categorie</h2>
        <div class="category-list">
          <div class="category-row" v-for="cat in categoryProfitStats" :key="cat.categoryId">
            <div class="category-name">{{ cat.categoryName }}</div>
            <div class="category-values">
              <span>Ventes HT: {{ formatMoney(cat.totalSalesHt) }} €</span>
              <span>Ventes TTC: {{ formatMoney(cat.totalSalesTtc) }} €</span>
              <span>Achats HT: {{ formatMoney(cat.totalPurchaseHt) }} €</span>
              <span class="profit">Benefice: {{ formatMoney(cat.profit) }} €</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  padding: 30px;
  background: #f4f7fa;
  min-height: 100vh;
  font-family: 'Inter', sans-serif;
}

.header-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #1e293b;
  padding: 30px 40px;
  border-radius: 20px;
  color: white;
  margin-bottom: 30px;
}

.header-banner h1 {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 800;
}

.filters {
  display: flex;
  align-items: center;
  gap: 15px;
}

.filters input,
.select-interval {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px 12px;
  border-radius: 10px;
  outline: none;
}

.select-interval option {
  background: #1e293b;
  color: white;
}

.btn-refresh {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.btn-refresh:hover {
  background: #2563eb;
}

.main-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 25px;
  align-items: start;
}

.summary-section {
  margin-top: 25px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.summary-card {
  background: #ffffff;
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}

.summary-card p {
  margin: 0 0 6px 0;
  color: #64748b;
  font-weight: 600;
}

.summary-card h3 {
  margin: 0;
  font-size: 1.4rem;
  color: #0f172a;
}

.summary-card.highlight {
  border: 2px solid #22c55e;
}

.category-profit {
  margin-top: 24px;
  background: #ffffff;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}

.category-profit h2 {
  margin: 0 0 12px 0;
  font-size: 1.1rem;
  color: #0f172a;
}

.category-list {
  display: grid;
  gap: 10px;
}

.category-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.category-name {
  font-weight: 700;
  color: #1e293b;
}

.category-values {
  display: flex;
  gap: 12px;
  font-size: 0.9rem;
  color: #334155;
}

.category-values .profit {
  font-weight: 700;
  color: #16a34a;
}

.summary-card.highlight-purple {
  border: 2px solid #a855f7;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
  color: #64748b;
  font-weight: 500;
  gap: 15px;
}
</style>