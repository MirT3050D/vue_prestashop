<script setup>
import { computed, onMounted, ref } from 'vue';
import { getOrders } from '@/service/orderService';
import { getProduct } from '@/service/productService';
import { getCategories } from '@/service/categoryService';
import StatistiqueVente from '@/components/backoffice/StatistiqueVente.vue';
import MeilleurProduit from '@/components/backoffice/MeilleurProduit.vue';
import Loading from '@/components/Loading.vue';

const rawOrders = ref([]);
const startDate = ref('');
const endDate = ref('');
const aggregationInterval = ref('daily');
const productInfoById = ref({});
const categoryNameById = ref({});
const isRefreshing = ref(false);
const isLoading = ref(true);

// Remplacement de la fonction fléchée et du ternaire (? :) par des if/else
function extractText(v) {
  if (v && typeof v === 'object') {
    if (v['#text']) {
      return String(v['#text']);
    } else {
      return '';
    }
  } else {
    if (v) {
      return String(v);
    } else {
      return '';
    }
  }
}

// Remplacement du ternaire et de l'opérateur logique court (||)
function toNumber(v) {
  if (v) {
    const valueAsString = String(v).replace(',', '.');
    const parsedNumber = parseFloat(valueAsString);
    if (parsedNumber) {
      return parsedNumber;
    } else {
      return 0;
    }
  } else {
    return 0;
  }
}

function getLanguageText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return extractText(node[0]?.['#text'] ?? node[0]) || '';
  }
  if (typeof node === 'object') {
    return extractText(node['#text'] ?? node.language ?? node) || '';
  }
  return '';
}

function normalizeArray(node) {
  if (!node) return [];
  return Array.isArray(node) ? node : [node];
}

function getOrderRows(order) {
  if (!order || !order.associations || !order.associations.order_rows) return [];
  return normalizeArray(order.associations.order_rows.order_row);
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  return amount.toFixed(2);
}

// Fonction classique
function getIntervalKey(dateString) {
  const d = new Date(dateString.replace(' ', 'T'));

  if (isNaN(d.getTime())) {
    return null;
  }

  const y = d.getFullYear();
  let m = String(d.getMonth() + 1);

  // Ajouter un 0 au début si le mois est un seul chiffre (ex: "5" devient "05")
  if (m.length === 1) {
    m = '0' + m;
  }

  if (aggregationInterval.value === 'yearly') {
    return y + '-01-01';
  }

  if (aggregationInterval.value === 'monthly') {
    return y + '-' + m + '-01';
  }

  if (aggregationInterval.value === 'weekly') {
    let day = d.getDay();
    if (day === 0) {
      day = 7; // Le dimanche (0) devient 7
    }
    d.setHours(-24 * (day - 1)); // Reculer les jours jusqu'au lundi
    return d.toISOString().slice(0, 10);
  }

  return d.toISOString().slice(0, 10);
}

// Utilisation de function() au lieu de () => dans le computed
const filteredOrders = computed(function () {
  return rawOrders.value.filter(function (o) {
    const d = extractText(o.date_add).slice(0, 10);

    let isAfterStart = true;
    if (startDate.value) {
      if (d < startDate.value) {
        isAfterStart = false;
      }
    }

    let isBeforeEnd = true;
    if (endDate.value) {
      if (d > endDate.value) {
        isBeforeEnd = false;
      }
    }

    return isAfterStart && isBeforeEnd;
  });
});

const salesStats = computed(function () {
  const stats = {};

  // Remplacement de "for...of" par une boucle for classique
  for (let i = 0; i < filteredOrders.value.length; i++) {
    const o = filteredOrders.value[i];
    const key = getIntervalKey(extractText(o.date_add));

    if (!key) {
      continue; // Passe directement à la prochaine commande
    }

    if (!stats[key]) {
      stats[key] = { date: key, nb_commande: 0, CA: 0 };
    }

    stats[key].nb_commande += 1;
    stats[key].CA += toNumber(o.total_paid_tax_incl);
  }

  const statsArray = Object.values(stats);

  // Remplacement de la fonction fléchée dans le sort()
  return statsArray.sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });
});

const topProducts = computed(function () {
  const stats = {};

  for (let i = 0; i < filteredOrders.value.length; i++) {
    const o = filteredOrders.value[i];

    // Remplacement du "?." (optional chaining) par des vérifications "if"
    let rows = null;
    if (o.associations && o.associations.order_rows) {
      rows = o.associations.order_rows.order_row;
    }

    // Remplacement du ternaire pour s'assurer qu'on a bien un tableau
    let items = [];
    if (Array.isArray(rows)) {
      items = rows;
    } else if (rows) {
      items = [rows]; // S'il n'y a qu'un seul objet, on le met dans un tableau
    }

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const id = extractText(item.product_id);

      if (!id) {
        continue;
      }

      if (!stats[id]) {
        stats[id] = {
          id: id,
          nom: extractText(item.product_name),
          reference: extractText(item.product_reference),
          ventes: 0,
          ca: 0
        };
      }

      const qty = toNumber(item.product_quantity);
      stats[id].ventes += qty;
      stats[id].ca += toNumber(item.unit_price_tax_incl) * qty;
    }
  }

  const statsArray = Object.values(stats);

  const sortedArray = statsArray.sort(function (a, b) {
    return b.ventes - a.ventes;
  });

  return sortedArray.slice(0, 5); // Garde seulement les 5 premiers
});

const categoryProfitStats = computed(function () {
  const stats = {};

  for (let i = 0; i < filteredOrders.value.length; i++) {
    const o = filteredOrders.value[i];
    const rows = getOrderRows(o);

    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      const productId = extractText(row.product_id);
      if (!productId) continue;

      const qty = toNumber(row.product_quantity);
      const saleHt = toNumber(row.unit_price_tax_excl) * qty;
      const saleTtc = toNumber(row.unit_price_tax_incl) * qty;

      const productInfo = productInfoById.value[productId] || {};
      const categoryId = productInfo.categoryId || '0';
      const categoryName = categoryNameById.value[categoryId] || 'Sans categorie';

      if (!stats[categoryId]) {
        stats[categoryId] = {
          categoryId: categoryId,
          categoryName: categoryName,
          totalSalesHt: 0,
          totalSalesTtc: 0,
          totalPurchaseHt: 0,
          profit: 0
        };
      }

      stats[categoryId].totalSalesHt += saleHt;
      stats[categoryId].totalSalesTtc += saleTtc;
      stats[categoryId].totalPurchaseHt += (productInfo.wholesalePrice || 0) * qty;
    }
  }

  const statsArray = Object.values(stats);
  for (let k = 0; k < statsArray.length; k++) {
    const item = statsArray[k];
    item.profit = item.totalSalesHt - item.totalPurchaseHt;
  }

  return statsArray.sort(function (a, b) {
    return b.profit - a.profit;
  });
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

// Déclaration de fonction asynchrone classique
async function fetchData() {
  isLoading.value = true;
  try {
    const orders = await getOrders({ display: 'full' });
    rawOrders.value = orders.filter(function (o) {
      return extractText(o.current_state) !== '6';
    });

    if (rawOrders.value.length > 0 && !startDate.value) {

      // Remplacement de la fonction fléchée dans le map()
      const dates = rawOrders.value.map(function (o) {
        const dateStr = extractText(o.date_add);
        if (dateStr) {
          return dateStr.slice(0, 10);
        }
        return null;
      });

      // Remplacement du "filter(Boolean)" par une condition explicite
      const validDates = dates.filter(function (date) {
        if (date !== null && date !== '') {
          return true;
        } else {
          return false;
        }
      });

      validDates.sort();

      if (validDates.length > 0) {
        startDate.value = validDates[0];
        endDate.value = validDates[validDates.length - 1];
      }
    }

    const productIds = {};
    for (let i = 0; i < rawOrders.value.length; i++) {
      const rows = getOrderRows(rawOrders.value[i]);
      for (let j = 0; j < rows.length; j++) {
        const pid = extractText(rows[j].product_id);
        if (pid) productIds[pid] = true;
      }
    }

    const ids = Object.keys(productIds);
    const infoMap = {};
    for (let i = 0; i < ids.length; i++) {
      const pid = ids[i];
      try {
        const product = await getProduct(pid, 'display=[id,wholesale_price,id_category_default,name]');
        if (product) {
          infoMap[pid] = {
            wholesalePrice: toNumber(extractText(product.wholesale_price)),
            categoryId: extractText(product.id_category_default) || '0',
            name: getLanguageText(product.name?.language || product.name)
          };
        }
      } catch (e) {
        infoMap[pid] = { wholesalePrice: 0, categoryId: '0', name: '' };
      }
    }
    productInfoById.value = infoMap;

    const categoryMap = {};
    try {
      const cats = await getCategories('display=[id,name]');
      for (let i = 0; i < cats.length; i++) {
        const catId = extractText(cats[i].id);
        const catName = getLanguageText(cats[i].name?.language || cats[i].name);
        if (catId) categoryMap[catId] = catName || 'Sans categorie';
      }
    } catch (e) {
      // Keep empty map if categories fail
    }
    categoryNameById.value = categoryMap;
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