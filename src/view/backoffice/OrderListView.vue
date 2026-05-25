<template>
  <div class="order-list-page">
    <h1>Liste des Commandes</h1>
    <p>Consultez et mettez à jour l'état des commandes récentes.</p>

    <!-- Affichage pendant le chargement des commandes -->
    <div v-if="isLoading" class="loading-state">
      <Loading :is-loading="true" />
      <p>Chargement des commandes...</p>
    </div>

    <!-- Affichage en cas d'erreur de récupération -->
    <div v-else-if="error" class="error-state">
      <p>Erreur lors du chargement des commandes : {{ error }}</p>
    </div>

    <!-- Contenu principal : Liste des commandes -->
    <div v-else class="order-table-container">
      
      <!-- Barre de filtres (Recherche texte + Filtrage par statut) -->
      <div class="filters-bar">
        <input type="text" v-model="searchQuery" placeholder="Rechercher par ID, Réf, Client..." class="search-input" />
        <select v-model="statusFilter" class="status-filter">
          <option value="">Tous les états</option>
          <option v-for="state in orderStates" :key="normalizeId(state.id)" :value="normalizeId(state.id)">
            {{ getStatusName(state.id) }}
          </option>
          <!-- Statut fictif pour les paniers non transformés en commande -->
          <option value="dans_le_panier">Dans le panier</option>
        </select>
      </div>

      <!-- Tableau principal -->
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
          <!-- On boucle sur les commandes filtrées -->
          <template v-for="order in filteredOrders" :key="order.id">
            
            <!-- Ligne principale (Infos générales de la commande) -->
            <tr>
              <td>{{ order.id }}</td>
              <td>{{ order.reference }}</td>
              <td>
                <!-- Si le client a un prénom, on l'affiche, sinon on affiche juste l'ID -->
                <span v-if="order.customer && order.customer.firstname">
                  {{ order.customer.firstname }} {{ order.customer.lastname }}
                </span>
                <span v-else>
                  Client ID: {{ order.id_customer['#text'] || order.id_customer }}
                </span>
              </td>
              <td>{{ parseFloat(order.total_paid).toFixed(2) }} €</td>
              <td>
                <!-- Le badge coloré indiquant l'état actuel (Livré, Annulé, etc.) -->
                <span class="status-badge" :style="{ backgroundColor: getStatusColor(order.current_state) }">
                  {{ getStatusName(order.current_state) }}
                </span>
              </td>
              <td>
                <!-- Sélecteur pour CHANGER l'état (Désactivé si c'est un simple panier ou si la commande est terminée/annulée) -->
                <select v-if="!order.isCart" @change="onStatusChange(order.id, $event.target.value)" class="status-select"
                  :disabled="isUpdating[order.id] || isDeliveredState(order.current_state) || isCanceledState(order.current_state)">
                  <option disabled selected>-- Changer --</option>
                  <!-- On ne propose que les états "cibles" pertinents configurés dans le service -->
                  <option v-for="state in targetStates" :key="normalizeId(state.id)" :value="normalizeId(state.id)">
                    {{ getStatusName(state.id) }}
                  </option>
                </select>
                <span v-else class="cart-label">Non modifiable</span>
                <!-- Petit loader qui s'affiche pendant que la mise à jour s'effectue via l'API -->
                <span v-if="isUpdating[order.id]" class="mini-loader"></span>
              </td>
            </tr>
            
            <!-- Ligne de détails extensible (Dropdown pour voir le contenu du panier) -->
            <tr class="order-details">
              <td colspan="6">
                <!-- Composant Dropdown réutilisable pour afficher/masquer les détails -->
                <Dropdown class="details-dropdown" :dropdown_title="{ label: 'Details' }">
                  <div class="details-grid">
                    <!-- En-tête des détails -->
                    <div class="detail-row header">
                      <span>Produit</span>
                      <span>Référence</span>
                      <span>Qté</span>
                      <span>PU HT</span>
                      <span>PU TTC</span>
                      <span>Total HT</span>
                      <span>Total TTC</span>
                    </div>
                    <!-- Message si le panier est vide ou introuvable -->
                    <div v-if="getOrderRows(order).length === 0" class="detail-row empty">
                      Aucun détail de commande.
                    </div>
                    <!-- Boucle sur chaque produit (ligne) de la commande -->
                    <div v-for="row in getOrderRows(order)" :key="normalizeId(row.id)" class="detail-row">
                      <span>{{ row.product_name }}</span>
                      <span>{{ row.product_reference }}</span>
                      <span>{{ row.product_quantity }}</span>
                      <span>{{ toNumber(row.unit_price_tax_excl).toFixed(2) }} €</span>
                      <span>{{ toNumber(row.unit_price_tax_incl).toFixed(2) }} €</span>
                      <!-- Calcul automatique des totaux à la volée -->
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
/**
 * @file OrderListView.vue
 * @description Interface listant l'intégralité des commandes de la boutique.
 * Elle permet la recherche, le filtrage par statut, l'inspection du détail des paniers, 
 * et la modification de l'état d'une commande (ex: passage à "Expédié").
 * S'appuie sur le service `orderListService` pour les appels API et la logique métier.
 */
// ============================================================================
// IMPORTATIONS
// ============================================================================
import { ref, onMounted, computed } from 'vue';
// Import du service dédié qui centralise toute la logique complexe de gestion des commandes
import { 
  fetchOrderListData, 
  filterOrdersList, 
  normalizeId as svcNormalizeId,
  toNumber as svcToNumber,
  getOrderRows as svcGetOrderRows,
  isDeliveredState as svcIsDeliveredState,
  isCanceledState as svcIsCanceledState,
  getStatusName as svcGetStatusName,
  getStatusColor as svcGetStatusColor,
  processOrderStatusChange
} from '@/service/orderListService';

import Loading from '@/components/Loading.vue';
import Dropdown from '@/components/Dropdown.vue';

// ============================================================================
// VARIABLES RÉACTIVES
// ============================================================================
const orders = ref([]);             // Liste complète des commandes
const orderStates = ref([]);        // Liste de tous les états possibles (Pour le filtre)
const targetStates = ref([]);       // Liste des états vers lesquels on peut basculer une commande
const isLoading = ref(true);        // Indicateur de chargement global
const isUpdating = ref({});         // Indicateur de chargement ciblé par commande { idCommande: true/false }
const error = ref(null);            // Message d'erreur éventuel

// Mappages (Dictionnaires) pour l'accès rapide aux infos des statuts sans avoir à re-boucler
let stateNameMapping = new Map();
let stateColorMapping = new Map();
let stateIdByNameLower = new Map();

// Variables liées à la barre de recherche/filtre
const searchQuery = ref('');
const statusFilter = ref('');

// ============================================================================
// PROPRIÉTÉS CALCULÉES
// ============================================================================
// Filtre dynamiquement la liste affichée en fonction de la recherche texte et du menu déroulant
const filteredOrders = computed(() => {
  return filterOrdersList(orders.value, statusFilter.value, searchQuery.value);
});

// ============================================================================
// MÉTHODES
// ============================================================================

/**
 * Charge initialement toutes les commandes et les états depuis l'API (via le service).
 */
async function fetchData() {
  isLoading.value = true;
  error.value = null;
  try {
    const data = await fetchOrderListData();
    orders.value = data.orders;
    orderStates.value = data.statesData;
    targetStates.value = data.targetStates;
    stateNameMapping = data.stateNameMapping;
    stateColorMapping = data.stateColorMapping;
    stateIdByNameLower = data.stateIdByNameLower;
  } catch (e) {
    error.value = e.message;
  } finally {
    isLoading.value = false;
  }
}

// Les fonctions suivantes sont de simples "ponts" (wrappers) vers le service 
// car le Template HTML ne peut appeler que des fonctions définies dans ce script.

function normalizeId(id) {
  return svcNormalizeId(id);
}

function toNumber(value) {
  return svcToNumber(value);
}

function getOrderRows(order) {
  return svcGetOrderRows(order);
}

// Vérifie si la commande est terminée pour bloquer le sélecteur
function isDeliveredState(stateId) {
  return svcIsDeliveredState(stateId, stateIdByNameLower);
}

// Vérifie si la commande est annulée pour bloquer le sélecteur
function isCanceledState(stateId) {
  return svcIsCanceledState(stateId, stateIdByNameLower);
}

function getStatusName(stateId) {
  return svcGetStatusName(stateId, stateNameMapping);
}

function getStatusColor(stateId) {
  return svcGetStatusColor(stateId, stateColorMapping);
}

/**
 * Fonction déclenchée quand l'admin choisit un nouveau statut dans le menu déroulant d'une commande.
 */
async function onStatusChange(orderId, newStateId) {
  // Verrouille spécifiquement cette ligne de commande
  isUpdating.value[orderId] = true;
  try {
    // Appelle l'API pour changer le statut
    const result = await processOrderStatusChange(orderId, newStateId, orders.value, stateIdByNameLower);
    
    if (!result.success && result.error) {
      alert(result.error);
    } else if (result.success && result.orderToUpdate) {
      // Met à jour localement (visuellement) le statut pour éviter de recharger toute la page
      result.orderToUpdate.current_state = newStateId;
    }
  } catch (e) {
    alert(`Erreur lors de la mise à jour de la commande ${orderId}: ${e.message}`);
  } finally {
    // Déverrouille la ligne
    isUpdating.value[orderId] = false;
  }
}

// Déclenche le téléchargement dès que le composant est monté dans le navigateur
onMounted(fetchData);
</script>

<style scoped>
.order-list-page {
  padding: 2rem;
}

.order-table-container {
  overflow-x: auto;
}

.filters-bar {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 250px;
  padding: 10px 15px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.95rem;
}

.status-filter {
  min-width: 200px;
  padding: 10px 15px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.95rem;
  background-color: white;
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