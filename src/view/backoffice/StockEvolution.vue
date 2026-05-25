<script setup>
/**
 * @file StockEvolution.vue
 * @description Vue dédiée à la traçabilité des mouvements de stock.
 * Affiche l'historique de toutes les entrées et sorties, avec la date, le produit, 
 * la variante, la quantité (signée +/-) et le motif. Supporte un filtrage par article et par date.
 */
// ============================================================================
// IMPORTATIONS
// ============================================================================
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { safeValue, getLangText } from '@/service/prestashopUtils';
// Import du service gérant les mouvements de stock
import { loadAllMovementData, getMovementProductName as _getMovementProductName, getMovementVariantName as _getMovementVariantName, getReasonLabel, filterMovements } from '@/service/stockMovementService';
import Loading from '@/components/Loading.vue';

// ============================================================================
// VARIABLES RÉACTIVES
// ============================================================================
const router = useRouter();
const loading = ref(false);        // Indicateur de chargement
const products = ref([]);          // Tous les produits
const movements = ref([]);         // Historique complet des flux de stock
const combinations = ref([]);      // Déclinaisons
const stockAvailables = ref([]);   // État des stocks actuel

// Variables de filtrage
const selectedProductId = ref('all'); // ID de l'article filtré
const startDate = ref('');            // Date de début
const endDate = ref('');              // Date de fin

// ============================================================================
// MÉTHODES DE PRÉSENTATION
// ============================================================================
// Wrappers pour le template (les fonctions service ont besoin des données globales en paramètre)

/**
 * Retrouve le nom lisible d'un produit depuis un mouvement brut
 */
function getMovementProductName(mvt) {
    return _getMovementProductName(mvt, products.value, stockAvailables.value);
}

/**
 * Retrouve le nom de la déclinaison depuis un mouvement brut
 */
function getMovementVariantName(mvt) {
    return _getMovementVariantName(mvt, combinations.value, stockAvailables.value);
}

// ============================================================================
// CYCLE DE VIE & CHARGEMENT
// ============================================================================
onMounted(async () => {
    loading.value = true;
    try {
        // Le service télécharge toutes les données complexes nécessaires (Produits, Mouvements, etc.)
        const data = await loadAllMovementData();
        products.value = data.products;
        combinations.value = data.combinations;
        movements.value = data.movements;
        stockAvailables.value = data.stockAvailables;
    } catch (error) {
        console.error("Erreur d'historique :", error);
    } finally {
        loading.value = false;
    }
});

// ============================================================================
// FILTRAGE LOGIQUE (Computed)
// ============================================================================
/**
 * Calcule la liste des mouvements à afficher en fonction des filtres choisis par l'utilisateur.
 * Se met à jour instantanément dès que l'ID ou les dates changent.
 */
const filteredMovements = computed(() => {
    return filterMovements(movements.value, selectedProductId.value, startDate.value, endDate.value, stockAvailables.value);
});

/**
 * Réinitialise les filtres de date.
 */
function clearDates() {
    startDate.value = '';
    endDate.value = '';
}
</script>

<template>
    <div class="stock-evolution-container">
        <Loading :isLoading="loading" />

        <!-- Bouton retour vers la gestion des stocks -->
        <button @click="router.back()" class="btn-back">← Retour</button>

        <!-- Titre -->
        <div class="header-section">
            <h1>Historique général des mouvements de stock</h1>
            <p>Suivez l'évolution journalière des flux entrants et sortants de votre catalogue.</p>
        </div>

        <!-- Barre de filtres (Article, Date Début, Date Fin) -->
        <div class="filter-section">

            <div class="filter-group">
                <span class="filter-label">Article :</span>
                <select v-model="selectedProductId" class="filter-input filter-select">
                    <option value="all">Tous les articles</option>
                    <!-- Boucle pour lister tous les produits dans le sélecteur -->
                    <option v-for="product in products" :key="product.id" :value="safeValue(product.id)">
                        {{ getLangText(product.name) }} (Réf: {{ safeValue(product.reference) }})
                    </option>
                </select>
            </div>

            <div class="filter-group">
                <span class="filter-label">Du :</span>
                <input type="date" v-model="startDate" class="filter-input date-input" />
            </div>

            <div class="filter-group">
                <span class="filter-label">Au :</span>
                <input type="date" v-model="endDate" class="filter-input date-input" />
            </div>

            <!-- Bouton pour vider rapidement les filtres de date -->
            <button v-if="startDate || endDate" @click="clearDates" class="btn-clear" title="Effacer les dates">
                ✕
            </button>
        </div>

        <!-- Tableau des mouvements -->
        <div class="table-wrapper">
            <table class="evolution-table" v-if="filteredMovements.length > 0">
                <thead>
                    <tr>
                        <th>Date du mouvement</th>
                        <th>Article concerné</th>
                        <th>Déclinaison / Variante</th>
                        <th>Type de flux</th>
                        <th>Quantité</th>
                        <th>Motif du mouvement</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- Ligne affichant un mouvement spécifique -->
                    <tr v-for="mvt in filteredMovements" :key="safeValue(mvt.id)">
                        <td>{{ safeValue(mvt.date_add) }}</td>
                        <td><strong>{{ getMovementProductName(mvt) }}</strong></td>
                        <td class="text-muted">{{ getMovementVariantName(mvt) }}</td>
                        <td>
                            <!-- Badge visuel Vert(Entrée) / Rouge(Sortie) en fonction du "sign" du mouvement -->
                            <span :class="['badge-type', String(safeValue(mvt.sign)) === '1' ? 'mvt-in' : 'mvt-out']">
                                {{ String(safeValue(mvt.sign)) === '1' ? '🟢 Entrée' : '🔴 Sortie' }}
                            </span>
                        </td>
                        <td class="qty-cell">
                            <strong>
                                <!-- Ajoute explicitement un + ou un - devant le chiffre -->
                                {{ String(safeValue(mvt.sign)) === '1' ? '+' : '-' }}{{ safeValue(mvt.physical_quantity)
                                }}
                            </strong>
                        </td>
                        <!-- Traduit l'ID de la raison (ex: 11) en texte clair (ex: Ajustement Positif) -->
                        <td class="text-muted">{{ getReasonLabel(safeValue(mvt.id_stock_mvt_reason),
                            safeValue(mvt.sign)) }}</td>
                    </tr>
                </tbody>
            </table>

            <!-- Message alternatif si les filtres sont trop stricts -->
            <div v-else-if="!loading" class="no-data-alert">
                Aucun mouvement de stock trouvé pour ces critères de recherche.
            </div>
        </div>
    </div>
</template>

<style scoped>
.stock-evolution-container {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.btn-back {
    background: none;
    border: none;
    color: #3b82f6;
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
    margin-bottom: 20px;
    font-weight: bold;
}

.btn-back:hover {
    text-decoration: underline;
}

.header-section {
    margin-bottom: 30px;
}

.header-section h1 {
    margin: 0 0 10px 0;
    color: #2f3542;
    font-size: 1.8rem;
}

.header-section p {
    color: #57606f;
    margin-top: 0;
    font-size: 0.95rem;
}

/* Nouveaux styles pour la barre de filtre avec les dates */
.filter-section {
    background-color: #f8f9fa;
    border: 1px solid #e4e7eb;
    padding: 15px 20px;
    border-radius: 8px;
    margin-bottom: 25px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px;
}

.filter-group {
    display: flex;
    align-items: center;
    gap: 10px;
}

.filter-label {
    font-weight: bold;
    color: #2f3542;
    font-size: 0.95rem;
}

.filter-input {
    padding: 8px 12px;
    border: 1px solid #ced6e0;
    border-radius: 6px;
    background-color: white;
    font-size: 0.95rem;
    outline: none;
    cursor: pointer;
    color: #2f3542;
}

.filter-select {
    min-width: 250px;
}

.date-input {
    min-width: 140px;
    font-family: inherit;
}

.btn-clear {
    background-color: #ffebee;
    color: #c62828;
    border: 1px solid #ffcdd2;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: bold;
    transition: all 0.2s ease;
}

.btn-clear:hover {
    background-color: #ffcdd2;
    transform: scale(1.05);
}

.table-wrapper {
    width: 100%;
    overflow-x: auto;
    background-color: white;
    border: 1px solid #dcdde1;
    border-radius: 8px;
}

.evolution-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

.evolution-table th,
.evolution-table td {
    border-bottom: 1px solid #dcdde1;
    padding: 14px;
}

.evolution-table th {
    background-color: #f5f6fa;
    font-weight: bold;
    color: #2f3542;
}

.evolution-table tr:last-child td {
    border-bottom: none;
}

.evolution-table tr:nth-child(even) {
    background-color: #fafafa;
}

.text-muted {
    color: #747d8c;
}

.qty-cell {
    font-size: 1.05rem;
}

.badge-type {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: bold;
}

.mvt-in {
    background-color: #e8f5e9;
    color: #2e7d32;
}

.mvt-out {
    background-color: #ffebee;
    color: #c62828;
}

.no-data-alert {
    padding: 30px;
    background-color: #f1f2f6;
    border-radius: 6px;
    text-align: center;
    color: #57606f;
    font-style: italic;
}
</style>