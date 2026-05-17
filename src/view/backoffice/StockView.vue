<script setup>
import { onMounted, ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { getProducts } from '@/service/productService';
import { getStockAvailables, updateProductStock } from '@/service/stockService';

// ============================================================================
// VARIABLES D'ÉTAT RÉACTIVES
// ============================================================================
const items = ref([]);          // Contient la liste plate de nos lignes de stock rattachées
const loading = ref(true);       // Gère le chargement initial de la page
const searchTxt = ref('');       // Filtre textuel de recherche
const stockFilter = ref('all');  // Filtre de quantité ('all', 'low', 'empty')
const message = ref('');         // Bannière d'alerte textuelle
const messageType = ref('');     // Type d'alerte ('success' ou 'error')

// ============================================================================
// CHARGEMENT ET CORRÉLATION DES DONNÉES (API MAPPER)
// ============================================================================
async function loadStockDashboard() {
    loading.value = true;
    items.value = [];
    message.value = '';

    try {
        // 1. On télécharge en parallèle la liste des produits et la grille des stocks
        const productsList = await getProducts('display=full');
        const stocksList = await getStockAvailables('display=full');

        const tempItems = [];

        // 2. Double boucle for classique pour croiser les données sans fonctions complexes
        for (let i = 0; i < stocksList.length; i++) {
            const stock = stocksList[i];

            // Extraction sécurisée des identifiants (gère si PrestaShop renvoie un objet XML ou une valeur brute)
            const prodId = stock.id_product && typeof stock.id_product === 'object' ? stock.id_product['#text'] : stock.id_product;
            const attrId = stock.id_product_attribute && typeof stock.id_product_attribute === 'object' ? stock.id_product_attribute['#text'] : stock.id_product_attribute;
            const stockId = stock.id && typeof stock.id === 'object' ? stock.id['#text'] : stock.id;
            const qty = parseInt(stock.quantity && typeof stock.quantity === 'object' ? stock.quantity['#text'] : stock.quantity, 10) || 0;

            // Recherche du produit parent correspondant à la ligne de stock
            let matchingProduct = null;
            for (let j = 0; j < productsList.length; j++) {
                if (String(productsList[j].id) === String(prodId)) {
                    matchingProduct = productsList[j];
                    break;
                }
            }

            // Si le produit existe, on enrichit l'élément pour l'affichage de notre tableau
            if (matchingProduct) {
                let prodName = '';
                const nameNode = matchingProduct.name ? matchingProduct.name.language : null;
                if (Array.isArray(nameNode)) {
                    prodName = nameNode[0]['#text'];
                } else if (nameNode) {
                    prodName = nameNode['#text'] || nameNode;
                }

                const baseRef = matchingProduct.reference || 'REF-' + prodId;
                let typeLabel = 'Produit Simple';
                let displayRef = baseRef;

                // Si l'ID attribut est différent de 0, c'est une déclinaison/variante physique du produit
                if (String(attrId) !== '0') {
                    typeLabel = 'Déclinaison';
                    displayRef = baseRef + ' (Var #' + attrId + ')';
                }

                tempItems.push({
                    id: stockId,
                    id_product: prodId,
                    id_product_attribute: attrId,
                    name: prodName,
                    reference: displayRef,
                    type: typeLabel,
                    quantity: qty,
                    isSaving: false // Gère l'état d'attente du bouton de sauvegarde de cette ligne
                });
            }
        }

        items.value = tempItems;

    } catch (error) {
        console.error("Erreur lors du chargement du tableau de bord des stocks:", error);
        message.value = "Impossible de synchroniser les stocks avec PrestaShop.";
        messageType.value = "error";
    } finally {
        loading.value = false;
    }
}

// ============================================================================
// ACTION DE MISE À JOUR (SAUVEGARDE EN LIVE)
// ============================================================================
async function sauvegarderLigneStock(item) {
    item.isSaving = true;
    message.value = '';

    try {
        // Appel de notre fonction utilitaire du service stock
        const success = await updateProductStock(item.id_product, item.id_product_attribute, item.quantity);

        if (success) {
            message.value = "Stock mis à jour avec succès pour " + item.name + " (" + item.reference + ").";
            messageType.value = "success";
        } else {
            message.value = "Erreur de traitement de la quantité côté serveur.";
            messageType.value = "error";
        }
    } catch (err) {
        console.error("Échec du PUT stock:", err);
        message.value = "Erreur réseau lors de la modification de la quantité.";
        messageType.value = "error";
    } finally {
        item.isSaving = false;
    }
}

// ============================================================================
// PROPRIÉTÉ CALCULÉE : FILTRAGE ET RECHERCHE LOCALE (UX ULTRA-RAPIDE)
// ============================================================================
const filteredItems = computed(function () {
    const search = searchTxt.value.toLowerCase().trim();
    const result = [];

    for (let i = 0; i < items.value.length; i++) {
        const item = items.value[i];

        // 1. Filtrage par texte (Nom ou Référence)
        const matchText = item.name.toLowerCase().includes(search) || item.reference.toLowerCase().includes(search);

        // 2. Filtrage par état quantitatif
        let matchStock = false;
        if (stockFilter.value === 'all') {
            matchStock = true;
        } else if (stockFilter.value === 'low') {
            matchStock = item.quantity > 0 && item.quantity <= 5; // Moins de 5 articles restants
        } else if (stockFilter.value === 'empty') {
            matchStock = item.quantity === 0; // Rupture complète
        }

        if (matchText && matchStock) {
            result.push(item);
        }
    }
    return result;
});

// Montage du composant
onMounted(function () {
    loadStockDashboard();
});
</script>

<template>
    <div class="stock-container">
        <header class="stock-header">
            <div>
                <h1>Gestion des Stocks</h1>
                <p class="subtitle">Pilotez les quantités disponibles en boutique et traitez les ruptures</p>
            </div>
            <button class="btn-refresh" @click="loadStockDashboard" :disabled="loading">
                <Icon icon="lucide:refresh-cw" :class="{ 'spin': loading }" />
                Synchroniser
            </button>
        </header>

        <div v-if="message" :class="['alert-banner', messageType]">
            <Icon :icon="messageType === 'success' ? 'lucide:check-circle' : 'lucide:alert-circle'" />
            <span>{{ message }}</span>
            <button class="alert-close" @click="message = ''">
                <Icon icon="lucide:x" />
            </button>
        </div>

        <section class="toolbar-card">
            <div class="search-box">
                <Icon icon="lucide:search" class="search-icon" />
                <input type="text" v-model="searchTxt" placeholder="Rechercher par nom de produit ou référence...">
            </div>

            <div class="filter-group">
                <label>État du stock :</label>
                <select v-model="stockFilter">
                    <option value="all">Tous les articles</option>
                    <option value="low">⚠️ Stocks bas (1 à 5)</option>
                    <option value="empty">🚨 En rupture (0)</option>
                </select>
            </div>
        </section>

        <div v-if="loading" class="loading-state">
            <Icon icon="lucide:loader-2" class="spin-loader" />
            <h2>Analyse de la base de données...</h2>
            <p>Nous croisons la liste des produits avec les entrées de stock de PrestaShop.</p>
        </div>

        <div v-else-if="filteredItems.length > 0" class="table-wrapper">
            <table class="stock-table">
                <thead>
                    <tr>
                        <th>Réf. Produit</th>
                        <th>Nom de l'article</th>
                        <th>Type</th>
                        <th class="center-text">Quantité Actuelle</th>
                        <th class="center-text">Statut</th>
                        <th class="right-text">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="item in filteredItems" :key="item.id"
                        :class="{ 'row-empty': item.quantity === 0, 'row-low': item.quantity > 0 && item.quantity <= 5 }">
                        <td class="font-mono">{{ item.reference }}</td>
                        <td class="font-bold">{{ item.name }}</td>
                        <td>
                            <span :class="['badge-type', item.type === 'Déclinaison' ? 'variant' : 'simple']">
                                {{ item.type }}
                            </span>
                        </td>
                        <td class="center-text">
                            <input type="number" v-model.number="item.quantity" min="0" class="input-qty"
                                :disabled="item.isSaving">
                        </td>
                        <td class="center-text">
                            <span v-if="item.quantity === 0" class="stock-tag status-empty">Rupture</span>
                            <span v-else-if="item.quantity <= 5" class="stock-tag status-low">Stock Bas</span>
                            <span v-else class="stock-tag status-ok">Disponible</span>
                        </td>
                        <td class="right-text">
                            <button class="btn-save" @click="sauvegarderLigneStock(item)" :disabled="item.isSaving">
                                <Icon :icon="item.isSaving ? 'lucide:loader-2' : 'lucide:save'"
                                    :class="{ 'spin': item.isSaving }" />
                                {{ item.isSaving ? 'Envoi...' : 'Mettre à jour' }}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-else class="empty-state">
            <Icon icon="lucide:package-open" class="empty-icon" />
            <h2>Aucune ligne de stock trouvée</h2>
            <p>Aucun produit ne correspond à vos critères de recherche actuels.</p>
        </div>
    </div>
</template>

<style scoped>
.stock-container {
    max-width: 1200px;
    margin: 40px auto;
    padding: 0 20px;
    font-family: 'Inter', sans-serif;
}

/* === EN-TÊTE === */
.stock-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
}

.stock-header h1 {
    font-size: 2.2rem;
    font-weight: 800;
    color: #2f3542;
    margin: 0 0 6px 0;
}

.subtitle {
    font-size: 1.05rem;
    color: #747d8c;
    margin: 0;
}

.btn-refresh {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: #2f3542;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
}

.btn-refresh:hover {
    background-color: #1e222b;
}

/* === BARRE DE RECHERCHE ET FILTRES === */
.toolbar-card {
    background: white;
    padding: 20px;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
    display: flex;
    gap: 20px;
    margin-bottom: 30px;
    align-items: center;
    flex-wrap: wrap;
}

.search-box {
    flex: 1;
    min-width: 300px;
    position: relative;
}

.search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #a4b0be;
    font-size: 1.2rem;
}

.search-box input {
    width: 100%;
    padding: 12px 12px 12px 42px;
    border: 2px solid #f1f2f6;
    border-radius: 10px;
    font-size: 0.95rem;
    outline: none;
    background-color: #f8f9fa;
    box-sizing: border-box;
    transition: border-color 0.2s;
}

.search-box input:focus {
    border-color: #2ed573;
}

.filter-group {
    display: flex;
    align-items: center;
    gap: 10px;
}

.filter-group label {
    font-weight: 600;
    color: #57606f;
    font-size: 0.95rem;
}

.filter-group select {
    padding: 12px 16px;
    border: 2px solid #f1f2f6;
    border-radius: 10px;
    background: #f8f9fa;
    font-size: 0.95rem;
    outline: none;
    cursor: pointer;
}

/* === BANNIÈRE ALERTE === */
.alert-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 500;
    margin-bottom: 25px;
}

.alert-banner.success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
}

.alert-banner.error {
    background: #fff0f0;
    border: 1px solid #ffcdd2;
    color: #d32f2f;
}

.alert-close {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    opacity: 0.6;
}

/* === TABLEAU DESIGN === */
.table-wrapper {
    background: white;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
    overflow: hidden;
}

.stock-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

.stock-table th {
    background-color: #f8f9fa;
    color: #57606f;
    font-weight: 700;
    padding: 16px 20px;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid #f1f2f6;
}

.stock-table td {
    padding: 16px 20px;
    border-bottom: 1px solid #f1f2f6;
    color: #2f3542;
    font-size: 0.95rem;
    vertical-align: middle;
}

/* Variations de lignes selon l'état critique */
.stock-table tr.row-empty td {
    background-color: #fff5f5;
}

.stock-table tr.row-low td {
    background-color: #fffdf0;
}

.font-mono {
    font-family: monospace;
    font-size: 1rem;
    color: #57606f;
}

.font-bold {
    font-weight: 700;
}

.center-text {
    text-align: center;
}

.right-text {
    text-align: right;
}

/* Inputs Quantité */
.input-qty {
    width: 80px;
    padding: 8px 10px;
    border: 2px solid #ced6e0;
    border-radius: 6px;
    font-size: 1rem;
    text-align: center;
    font-weight: bold;
    outline: none;
}

.input-qty:focus {
    border-color: #2ed573;
}

/* Badges de Type */
.badge-type {
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
}

.badge-type.simple {
    background-color: #e3f2fd;
    color: #0d47a1;
}

.badge-type.variant {
    background-color: #f3e5f5;
    color: #4a148c;
}

/* Tags de Statuts quantitatifs */
.stock-tag {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 700;
}

.status-ok {
    background-color: #e8f5e9;
    color: #2e7d32;
}

.status-low {
    background-color: #fff8e1;
    color: #f57f17;
}

.status-empty {
    background-color: #ffebee;
    color: #c62828;
}

/* Bouton Sauvegarder */
.btn-save {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: #2ed573;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background-color 0.2s;
}

.btn-save:hover:not(:disabled) {
    background-color: #26af5f;
}

.btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* === CHARGEMENT & VIDE === */
.loading-state,
.empty-state {
    text-align: center;
    padding: 60px 20px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
}

.spin-loader {
    font-size: 3rem;
    color: #2ed573;
    animation: spin 1s linear infinite;
    margin-bottom: 15px;
}

.empty-icon {
    font-size: 4rem;
    color: #ced6e0;
    margin-bottom: 15px;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

.spin {
    animation: spin 1s linear infinite;
}
</style>