<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getXml } from '@/service/api';
import { getProducts, getCombinations } from '@/service/productService';
import Loading from '@/components/Loading.vue';

const router = useRouter();
const loading = ref(false);
const products = ref([]);
const movements = ref([]);
const combinations = ref([]);
const selectedProductId = ref('all');

// ============================================================================
// 1. SÉCURITÉ NETTOYÉE ET ROBUSTE
// ============================================================================
function safeValue(node) {
    if (node === undefined || node === null) return '';
    if (typeof node === 'object') {
        // Gère toutes les structures possibles retournées par le parseur XML
        return String(node['#text'] || node.id || node['@_id'] || '');
    }
    const str = String(node);
    return str === 'undefined' ? '' : str;
}

function getLangText(field) {
    if (!field || !field.language) return '';
    if (Array.isArray(field.language)) return field.language[0]['#text'];
    return field.language['#text'];
}

// ============================================================================
// 2. DÉCODAGE DES IDS CACHÉS (STRATÉGIE DE REPLI SUR ID_ORDER)
// ============================================================================
function getMovementProductName(mvt) {
    // Étape 1: Essayer de lire la colonne id_product standard
    let pId = safeValue(mvt.id_product);

    // Étape 2: Si vide ou égal à 0, on va chercher l'ID caché dans id_order
    if (!pId || pId === '0') {
        pId = safeValue(mvt.id_order);
    }

    // Étape 3: Recherche du nom dans la liste globale des produits chargés
    if (pId && pId !== '0') {
        const prod = products.value.find(p => String(p.id) === String(pId));
        if (prod) return getLangText(prod.name);
        return `Article #${pId}`; // Fallback si le produit n'est pas encore trouvé
    }

    return 'Article Inconnu';
}

function getMovementVariantName(mvt) {
    // Étape 1: Essayer de lire la colonne id_product_attribute standard
    let attrId = safeValue(mvt.id_product_attribute);

    // Étape 2: Si vide ou égal à 0, on va chercher l'ID caché dans id_supply_order
    if (!attrId || attrId === '0') {
        attrId = safeValue(mvt.id_supply_order);
    }

    if (!attrId || attrId === '0') return 'Produit simple';

    const comb = combinations.value.find(c => String(c.id) === String(attrId));
    if (comb && comb.reference) {
        const parts = comb.reference.split('_');
        if (parts.length > 1) return parts.slice(1).join(' ');
        return comb.reference;
    }
    return `Déclinaison #${attrId}`;
}

function getReasonLabel(reasonId, sign) {
    const id = String(reasonId);
    if (id === '11') return 'Importation initiale / Ajustement';
    if (id === '12') return 'Régularisation négative';
    return sign === '1' ? 'Entrée de marchandises' : 'Sortie de marchandises (Commande)';
}

// ============================================================================
// CHARGEMENT PRINCIPAL
// ============================================================================
onMounted(async () => {
    loading.value = true;
    try {
        // Chargement initial de tous les produits pour mapper les noms
        products.value = await getProducts('display=full');

        // Récupération de l'historique complet
        const response = await getXml('/stock_movements?display=full');
        const rawMvts = response?.prestashop?.stock_mvts?.stock_mvt;
        let mvtsArray = Array.isArray(rawMvts) ? rawMvts : (rawMvts ? [rawMvts] : []);

        // Tri chronologique inverse (du plus récent au plus ancien)
        mvtsArray.sort((a, b) => {
            const dateA = new Date(safeValue(a.date_add)).getTime();
            const dateB = new Date(safeValue(b.date_add)).getTime();
            return dateB - dateA;
        });

        movements.value = mvtsArray;
    } catch (error) {
        console.error("Erreur historique :", error);
    } finally {
        loading.value = false;
    }
});

// À chaque fois que l'utilisateur sélectionne un produit spécifique, on charge ses combinaisons
watch(selectedProductId, async (newId) => {
    if (newId && newId !== 'all') {
        try {
            const rawCombs = await getCombinations(newId);
            combinations.value = Array.isArray(rawCombs) ? rawCombs : (rawCombs ? [rawCombs] : []);
        } catch (e) {
            combinations.value = [];
        }
    } else {
        combinations.value = [];
    }
});

// ============================================================================
// FILTRAGE LOGIQUE DU TABLEAU
// ============================================================================
const filteredMovements = computed(() => {
    let allMvts = movements.value;
    if (selectedProductId.value === 'all') return allMvts;

    return allMvts.filter(mvt => {
        let mvtId = safeValue(mvt.id_product);
        if (!mvtId || mvtId === '0') {
            mvtId = safeValue(mvt.id_order);
        }
        return String(mvtId) === String(selectedProductId.value);
    });
});
</script>

<template>
    <div class="stock-evolution-container">
        <Loading :isLoading="loading" />
        <button @click="router.back()" class="btn-back">← Retour</button>

        <div class="header-section">
            <h1>Historique général des mouvements de stock</h1>
            <p>Suivez l'évolution journalière des flux entrants et sortants de votre catalogue.</p>
        </div>

        <div class="filter-section">
            <label for="product-filter" class="filter-label">Filtrer par produit :</label>
            <select id="product-filter" v-model="selectedProductId" class="filter-select">
                <option value="all">-- Tous les produits --</option>
                <option v-for="prod in products" :key="prod.id" :value="prod.id">
                    {{ getLangText(prod.name) }} {{ prod.reference ? `(${prod.reference})` : '' }}
                </option>
            </select>
        </div>

        <div class="table-wrapper">
            <table v-if="filteredMovements.length > 0" class="evolution-table">
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
                    <tr v-for="mvt in filteredMovements" :key="safeValue(mvt.id)">
                        <td>{{ safeValue(mvt.date_add) }}</td>
                        <td><strong>{{ getMovementProductName(mvt) }}</strong></td>
                        <td>{{ getMovementVariantName(mvt) }}</td>
                        <td>
                            <span :class="['badge-type', safeValue(mvt.sign) === '1' ? 'mvt-in' : 'mvt-out']">
                                {{ safeValue(mvt.sign) === '1' ? '🟢 Entrée' : '🔴 Sortie' }}
                            </span>
                        </td>
                        <td class="qty-cell">
                            <strong>{{ safeValue(mvt.sign) === '1' ? '+' : '-' }}{{ safeValue(mvt.physical_quantity)
                                }}</strong>
                        </td>
                        <td>{{ getReasonLabel(safeValue(mvt.id_stock_mvt_reason), safeValue(mvt.sign)) }}</td>
                    </tr>
                </tbody>
            </table>
            <div v-else-if="!loading" class="no-data-alert">Aucun mouvement de stock pour cette sélection.</div>
        </div>
    </div>
</template>

<style scoped>
.stock-evolution-container {
    max-width: 1100px;
    margin: 30px auto;
    padding: 0 20px;
    font-family: Arial, sans-serif;
    color: #2f3542;
}

.btn-back {
    background-color: #f1f2f6;
    border: 1px solid #ced6e0;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
    margin-bottom: 20px;
}

.btn-back:hover {
    background-color: #e4e7eb;
}

.header-section {
    margin-bottom: 30px;
}

.header-section h1 {
    font-size: 1.7rem;
    margin-bottom: 6px;
    color: #1e2229;
}

.header-section p {
    color: #57606f;
    margin-top: 0;
    font-size: 0.95rem;
}

.filter-section {
    background-color: #f8f9fa;
    border: 1px solid #e4e7eb;
    padding: 15px 20px;
    border-radius: 8px;
    margin-bottom: 25px;
    display: flex;
    align-items: center;
    gap: 15px;
}

.filter-label {
    font-weight: bold;
    color: #2f3542;
    font-size: 0.95rem;
}

.filter-select {
    padding: 8px 12px;
    border: 1px solid #ced6e0;
    border-radius: 6px;
    background-color: white;
    font-size: 0.95rem;
    outline: none;
    min-width: 300px;
    cursor: pointer;
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