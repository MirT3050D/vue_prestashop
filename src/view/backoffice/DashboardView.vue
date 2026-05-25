<script setup>
/**
 * @file DashboardView.vue
 * @description Vue principale du tableau de bord de l'administration (Back-Office).
 * Elle affiche une synthèse des ventes, bénéfices (brut et incluant le stock dormant),
 * ainsi qu'un résumé détaillé de la rentabilité par catégorie.
 * Remarque architecturale : Tous les calculs mathématiques lourds sont déportés dans `service/dashboardService.js`.
 */
// ============================================================================
// IMPORTATIONS
// ============================================================================
import { computed, onMounted, ref } from 'vue';
// Import des utilitaires de nettoyage pour l'API PrestaShop
import { extractText, toNumber, getLanguageText, normalizeArray, getOrderRows, formatMoney } from '@/service/prestashopUtils';
// Import des services métier (Les vrais calculs complexes se font là-bas pour alléger la vue)
import { fetchDashboardData, filterOrdersByDate, computeSalesStats, computeTopProducts, computeCategoryProfitStats, computeTotals, computeTotalStockPurchaseHt } from '@/service/dashboardService';

// Composants enfants
import StatistiqueVente from '@/components/backoffice/StatistiqueVente.vue';
import MeilleurProduit from '@/components/backoffice/MeilleurProduit.vue';
import Loading from '@/components/Loading.vue';

// ============================================================================
// VARIABLES RÉACTIVES (ÉTAT DU COMPOSANT)
// ============================================================================
const rawOrders = ref([]);         // Liste brute de toutes les commandes
const allProducts = ref([]);       // Liste de tous les produits
const allStocks = ref([]);         // Liste de tous les stocks
const startDate = ref('');         // Filtre : Date de début
const endDate = ref('');           // Filtre : Date de fin
const aggregationInterval = ref('daily'); // Regroupement (Jour, Semaine, Mois)
const productInfoById = ref({});   // Dictionnaire { idProduit: infos... } pour un accès ultra-rapide
const categoryNameById = ref({});  // Dictionnaire { idCategory: nom }
const isRefreshing = ref(false);   // État du bouton rafraîchir
const isLoading = ref(true);       // État du chargement initial

// ============================================================================
// PROPRIÉTÉS CALCULÉES (COMPUTED)
// ============================================================================
// Ces variables se mettent à jour automatiquement si startDate ou endDate changent

/**
 * Garde uniquement les commandes qui tombent dans la période sélectionnée.
 */
const filteredOrders = computed(function () {
  return filterOrdersByDate(rawOrders.value, startDate.value, endDate.value);
});

/**
 * Génère les données pour le graphique "Statistiques de Ventes" (Le tableau chronologique).
 */
const salesStats = computed(function () {
  return computeSalesStats(filteredOrders.value, '', '', aggregationInterval.value);
});

/**
 * Calcule le Top 5 des produits les plus vendus.
 */
const topProducts = computed(function () {
  return computeTopProducts(filteredOrders.value, '', '', 5);
});

/**
 * Calcule le bénéfice, découpé par catégorie (T-Shirts, Mugs, etc.).
 */
const categoryProfitStats = computed(function () {
  return computeCategoryProfitStats(filteredOrders.value, '', '', productInfoById.value, categoryNameById.value);
});

// -- CALCULS DES TOTAUX GLOBAUX --
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

// Bénéfice net (Ventes HT - Prix d'achat des produits vendus)
const totalProfit = computed(function () {
  return totalSalesHt.value - totalPurchaseHt.value;
});

// Coût total de TOUT le stock (Vendu ou non)
const totalStockPurchaseHt = computed(function () {
  return computeTotalStockPurchaseHt(allProducts.value, allStocks.value, filteredOrders.value, '', '');
});

// Bénéfice net tenant compte du stock dormant (Ventes HT - Coût total du stock global)
const totalStockProfit = computed(function () {
  return totalSalesHt.value - totalStockPurchaseHt.value;
});

// ============================================================================
// MÉTHODES
// ============================================================================
/**
 * Télécharge toutes les données vitales au Dashboard depuis l'API.
 */
async function fetchData() {
  isLoading.value = true;
  try {
    const data = await fetchDashboardData();

    rawOrders.value = data.orders;
    allProducts.value = data.allProducts;
    allStocks.value = data.allStocks;
    productInfoById.value = data.productInfoById;
    categoryNameById.value = data.categoryNameById;

    // Si on vient d'arriver, on initialise les dates par défaut suggérées par le service
    if (data.dateRange && !startDate.value) {
      startDate.value = data.dateRange.start;
      endDate.value = data.dateRange.end;
    }
  } finally {
    isLoading.value = false;
  }
}

/**
 * Bouton pour forcer un rafraîchissement sans recharger la page.
 */
async function handleRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await fetchData();
  } finally {
    isRefreshing.value = false;
  }
}

// Lors de l'ouverture de la page
onMounted(fetchData);
</script>

<template>
  <div class="dashboard-page">
    
    <!-- En-tête + Filtres -->
    <header class="header-banner">
      <h1>Statistiques de Ventes</h1>
      
      <!-- Zone de filtres (Dates + Regroupement) -->
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

    <!-- Roue de chargement plein écran si les données ne sont pas prêtes -->
    <div v-if="isLoading" class="loading-container">
      <Loading :isLoading="isLoading" />
      <p>Chargement des statistiques...</p>
    </div>

    <!-- Contenu du Dashboard (Une fois chargé) -->
    <div v-else>
      
      <!-- Section Haut : 2 graphiques (Historique des ventes / Top 5 Produits) -->
      <div class="main-content">
        <StatistiqueVente :stats="salesStats" />
        <MeilleurProduit :produits="topProducts" />
      </div>

      <!-- Section Milieu : Tuiles des indicateurs financiers -->
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

      <!-- Section Bas : Répartition par catégorie -->
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
/* === LAYOUT GLOBAL === */
.dashboard-page {
  padding: 30px;
  background: #f4f7fa; /* Gris très clair, style "Dashboard" */
  min-height: 100vh;
  font-family: 'Inter', sans-serif;
}

/* === EN-TÊTE NOIR AVEC FILTRES === */
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

/* S'assure que le menu déroulant reste lisible (le fond des options ne peut pas être semi-transparent) */
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

/* === SECTION DES GRAPHIQUES === */
.main-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); /* Les deux cartes se mettent côte à côte ou s'empilent si l'écran est trop petit */
  gap: 25px;
  align-items: start;
}

/* === TUILES DE RÉSUMÉ (KPI) === */
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

/* Tuile spéciale "Bénéfice" (Bordure verte) */
.summary-card.highlight {
  border: 2px solid #22c55e;
}

/* Tuile spéciale "Bénéfice Total" (Bordure violette) */
.summary-card.highlight-purple {
  border: 2px solid #a855f7;
}

/* === LISTE PAR CATÉGORIES === */
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

/* === CHARGEMENT === */
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