<script setup>
/**
 * @file StockView.vue
 * @description Vue centrale de gestion logistique du stock.
 * Affiche la quantité physique, réservée, et disponible pour chaque produit/déclinaison.
 * Permet l'ajustement manuel direct de la quantité avec mise à jour API et création 
 * automatique de l'historique des mouvements pour garantir la comptabilité.
 */
// ============================================================================
// IMPORTATIONS
// ============================================================================
import { onMounted, ref, computed } from 'vue';
import { getProducts } from '@/service/productService';
import { getStockAvailables, updateProductStock } from '@/service/stockService';
import { getOrders } from '@/service/orderService';
import { getCategories } from '@/service/categoryService';
import { getXml } from '@/service/api';
import { extractId, getLangText, getCategoryName } from '@/service/prestashopUtils';
// Permet de forcer la trace dans l'historique lors d'une modif manuelle
import { createStockMovement } from '@/service/stockMovementService'; 
import Loading from '@/components/Loading.vue';

// ============================================================================
// VARIABLES D'ÉTAT
// ============================================================================
const items = ref([]);         // Liste nettoyée et combinée des lignes de stocks
const loading = ref(true);     // Spinner de chargement
const searchTxt = ref('');     // Texte du champ de recherche
const message = ref('');       // Bannière de message (Succès / Erreur)
const messageType = ref('');   // Type de message ('success' ou 'error')

// ============================================================================
// UTILITAIRES UI
// ============================================================================
/**
 * Affiche une bannière temporaire de 4 secondes (Toast notification)
 */
function triggerBanner(msg, type) {
    message.value = msg;
    messageType.value = type;
    setTimeout(() => { message.value = ''; }, 4000);
}

// ============================================================================
// LOGIQUE MÉTIER PRINCIPALE : CHARGEMENT DU TABLEAU DE BORD
// ============================================================================
async function loadStockDashboard() {
    loading.value = true;
    items.value = [];
    message.value = '';

    try {
        // 1. Récupération parallèle massive pour gagner du temps.
        // On récupère Produits, Stocks réels, Déclinaisons (Combinations) et Catégories
        const [productsList, stocksList, responseCombs, categoriesList] = await Promise.all([
            getProducts('display=full'),
            getStockAvailables('display=full'),
            getXml('/combinations?display=full'),
            getCategories('display=[id,name]')
        ]);

        // 1.1 Gestion des commandes en attente (Réservations)
        // Objectif : Savoir combien de produits sont déjà payés mais pas encore livrés.
        let paidOrders = [];
        try {
            // Filtre par statut = 2 (Généralement "Paiement accepté" dans PrestaShop)
            paidOrders = await getOrders({ display: 'full', 'filter[current_state]': '[2]' });
        } catch (e) {
            paidOrders = [];
        }
        if (!paidOrders || paidOrders.length === 0) {
            // Méthode de secours si le filtre API échoue
            paidOrders = await getOrders({ display: 'full' });
            paidOrders = paidOrders.filter(o => extractId(o.current_state) === '2');
        }

        // reservedMap va stocker la quantité réservée pour chaque (Produit + Attribut)
        const reservedMap = {};
        for (let i = 0; i < paidOrders.length; i++) {
            const order = paidOrders[i];
            const rows = order?.associations?.order_rows?.order_row || [];
            const rowList = Array.isArray(rows) ? rows : [rows];

            for (let j = 0; j < rowList.length; j++) {
                const row = rowList[j];
                const productId = extractId(row.product_id);
                const attrId = extractId(row.product_attribute_id) || '0';
                if (!productId) continue;
                
                const qty = parseInt(extractId(row.product_quantity), 10) || 0;
                // La clé est un hash "idProduit:idAttribut"
                const key = `${productId}:${attrId}`;
                reservedMap[key] = (reservedMap[key] || 0) + qty;
            }
        }

        // Préparation des dictionnaires (Map) pour accès rapide aux déclinaisons et catégories
        const combinationsList = responseCombs?.prestashop?.combinations?.combination || [];
        const combs = Array.isArray(combinationsList) ? combinationsList : [combinationsList];

        const categoryMap = {};
        if (categoriesList && Array.isArray(categoriesList)) {
            categoriesList.forEach(cat => {
                const catId = extractId(cat.id);
                let catName = 'Sans categorie';
                if (cat && cat.name && cat.name.language) {
                    if (Array.isArray(cat.name.language)) {
                        catName = cat.name.language[0]['#text'] || catName;
                    } else {
                        catName = cat.name.language['#text'] || catName;
                    }
                }
                if (catId) categoryMap[catId] = catName;
            });
        }

        // 2. Détection des produits possédant des déclinaisons
        // PrestaShop génère toujours une ligne "Générale" (Attribute = 0) même s'il y a des attributs.
        // Il faut l'ignorer pour ne pas fausser le stock !
        const productsWithVariants = new Set();
        stocksList.forEach(stock => {
            if (extractId(stock.id_product_attribute) !== '0') {
                productsWithVariants.add(extractId(stock.id_product));
            }
        });

        // 3. Construction du tableau final
        const tempItems = [];
        for (const stock of stocksList) {
            const pId = extractId(stock.id_product);
            const attrId = extractId(stock.id_product_attribute);

            // LOGIQUE CLÉ : On ignore la ligne "Mère" si le produit a des filles (déclinaisons).
            if (productsWithVariants.has(pId) && attrId === '0') {
                continue;
            }

            const product = productsList.find(p => extractId(p.id) === pId);
            if (!product) continue;

            const categoryId = extractId(product.id_category_default);
            const categoryName = getCategoryName(categoryId, categoryMap);

            // Extraction du joli nom de la déclinaison depuis la référence (ex: MUG_ROUGE -> ROUGE)
            let variantName = '-';
            if (attrId !== '0') {
                const comb = combs.find(c => extractId(c.id) === attrId);
                if (comb && comb.reference) {
                    const parts = comb.reference.split('_');
                    variantName = parts.length > 1 ? parts.slice(1).join(' ') : comb.reference;
                } else {
                    variantName = `Var #${attrId}`;
                }
            }

            // Calculs critiques de quantité
            const reservedQty = reservedMap[`${pId}:${attrId}`] || 0;
            // PrestaShop donne "availableQty". La quantité PHYSIQUE réelle est Dispo + Réservé.
            const availableQty = parseInt(stock.quantity['#text'] || stock.quantity, 10) || 0;
            const qty = availableQty + reservedQty; 

            tempItems.push({
                id: extractId(stock.id),
                id_product: pId,
                id_product_attribute: attrId,
                name: getLangText(product.name),
                reference: product.reference || '',
                variantName: variantName,
                categoryName: categoryName,
                quantity: qty,                       // Quantité totale dans l'entrepôt
                reserved_quantity: reservedQty,      // Quantité devant être expédiée
                available_quantity: availableQty,    // Quantité vendable sur le site
                editable_quantity: qty,              // Variable liée au champ de saisie HTML
                is_saving: false                     // Indicateur de chargement pour le bouton de cette ligne
            });
        }

        // Tri alphabétique par nom de produit
        items.value = tempItems.sort((a, b) => a.name.localeCompare(b.name));

    } catch (error) {
        console.error("Erreur de chargement :", error);
        triggerBanner("Erreur de connexion à l'API PrestaShop.", "error");
    } finally {
        loading.value = false;
    }
}

// ============================================================================
// SAUVEGARDE MANUELLE AVEC TRAÇABILITÉ (HACK MYSQL INTÉGRÉ)
// ============================================================================
/**
 * Appelée lorsqu'un administrateur tape un nouveau chiffre et clique sur "Sauvegarder"
 */
async function handleSaveStock(item) {
    if (item.editable_quantity < 0 || isNaN(item.editable_quantity)) {
        triggerBanner("La quantité ne peut pas être négative.", "error");
        return;
    }

    item.is_saving = true;
    try {
        const diff = item.editable_quantity - item.quantity;

        // 1. Mise à jour réelle via l'API Standard (Change le stock dans PrestaShop)
        await updateProductStock(item.id_product, item.id_product_attribute, item.editable_quantity);

        // 2. CORRECTION CRITIQUE : PrestaShop API a un bug et n'enregistre pas l'historique lors des modifs manuelles.
        // On force la création d'une ligne d'historique via notre service spécial.
        if (diff !== 0) {
            const sign = diff > 0 ? 1 : -1;
            const reasonId = diff > 0 ? 11 : 12; // 11=Ajustement Positif, 12=Ajustement Négatif
            await createStockMovement(item.id_product, item.id_product_attribute, Math.abs(diff), sign, reasonId);
        }

        // On valide la modification dans l'interface
        item.quantity = item.editable_quantity;
        triggerBanner(`Stock mis à jour pour "${item.name}".`, "success");

    } catch (error) {
        console.error("Erreur de sauvegarde:", error);
        triggerBanner("Erreur lors de la sauvegarde.", "error");
    } finally {
        item.is_saving = false;
    }
}

// ============================================================================
// PROPRIÉTÉS CALCULÉES
// ============================================================================
/**
 * Filtre instantanément le tableau en fonction de la barre de recherche.
 */
const filteredItems = computed(() => {
    return items.value.filter(item => {
        const matchTxt = item.name.toLowerCase().includes(searchTxt.value.toLowerCase()) ||
            item.reference.toLowerCase().includes(searchTxt.value.toLowerCase());
        return matchTxt;
    });
});

/**
 * Agrège dynamiquement les stocks pour générer le "Résumé par Catégorie" en bas de page.
 */
const categoryStocks = computed(() => {
    const categories = {};

    for (const item of items.value) {
        const cat = item.categoryName;

        // Initialisation de la catégorie si elle n'existe pas encore
        if (!categories[cat]) {
            categories[cat] = {
                name: cat,
                quantity: 0,
                reserved_quantity: 0,
                available_quantity: 0
            };
        }

        // Addition des compteurs
        categories[cat].quantity += item.quantity;
        categories[cat].reserved_quantity += item.reserved_quantity;
        categories[cat].available_quantity += item.available_quantity;
    }

    return Object.values(categories).sort((a, b) => a.name.localeCompare(b.name));
});

// Lancement au démarrage
onMounted(loadStockDashboard);
</script>

<template>
    <div class="stock-dashboard">
        <Loading :isLoading="loading" />

        <div class="header-section">
            <h1>Gestion des Stocks</h1>
            <p>Gérez les quantités de vos produits et déclinaisons en temps réel.</p>
        </div>

        <!-- Bannière d'alerte contextuelle (succès / erreur) -->
        <div v-if="message" :class="['alert-banner', messageType]">
            {{ message }}
        </div>

        <!-- Barre de recherche -->
        <div class="toolbar">
            <input v-model="searchTxt" type="text" placeholder="Rechercher un produit (Nom, Réf...)"
                class="search-input" />
        </div>

        <!-- Tableau principal des articles -->
        <div class="table-container">
            <table class="stock-table">
                <thead>
                    <tr>
                        <th>Réf.</th>
                        <th>Article concerné</th>
                        <th>Catégorie</th>
                        <th>Déclinaison</th>
                        <th>Qté physique</th>
                        <th>Qté reservé</th>
                        <th>Qté disponible</th>
                        <th>Ajuster le stock</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="item in filteredItems" :key="item.id">
                        <td><span class="ref-badge">{{ item.reference || 'N/A' }}</span></td>
                        <td><strong>{{ item.name }}</strong></td>
                        <td>{{ item.categoryName }}</td>

                        <td>
                            <span v-if="item.variantName !== '-'" class="variant-badge">{{ item.variantName }}</span>
                            <span v-else class="text-muted">Produit standard</span>
                        </td>

                        <!-- La couleur du badge (qty-ok, qty-low, qty-empty) change dynamiquement selon le nombre -->
                        <td>
                            <span
                                :class="['qty-badge', item.quantity > 5 ? 'qty-ok' : (item.quantity > 0 ? 'qty-low' : 'qty-empty')]">
                                {{ item.quantity }}
                            </span>
                        </td>

                        <td>
                            <span class="qty-badge qty-reserved">{{ item.reserved_quantity }}</span>
                        </td>

                        <td>
                            <span
                                :class="['qty-badge', item.available_quantity > 5 ? 'qty-ok' : (item.available_quantity > 0 ? 'qty-low' : 'qty-empty')]">
                                {{ item.available_quantity }}
                            </span>
                        </td>

                        <!-- Le champ modifiable "editable_quantity" -->
                        <td>
                            <input type="number" v-model="item.editable_quantity" class="qty-input" min="0" />
                        </td>

                        <!-- Le bouton ne devient cliquable QUE SI la quantité a été modifiée manuellement -->
                        <td>
                            <button @click="handleSaveStock(item)"
                                :disabled="item.is_saving || item.quantity === item.editable_quantity" class="btn-save">
                                {{ item.is_saving ? '...' : 'Sauvegarder' }}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div v-if="filteredItems.length === 0 && !loading" class="empty-state">
                Aucun produit trouvé.
            </div>
        </div>

        <!-- SECTION 2 : RÉSUMÉ PAR CATÉGORIE -->
        <div class="header-section mt-40">
            <h2>Résumé par Catégorie</h2>
            <p>Vue globale des quantités physiques, réservées et disponibles par catégorie.</p>
        </div>

        <div class="table-container">
            <table class="stock-table">
                <thead>
                    <tr>
                        <th>Catégorie</th>
                        <th>Qté physique totale</th>
                        <th>Qté réservée totale</th>
                        <th>Qté disponible totale</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="cat in categoryStocks" :key="cat.name">
                        <td><strong>{{ cat.name }}</strong></td>

                        <td>
                            <span
                                :class="['qty-badge', cat.quantity > 10 ? 'qty-ok' : (cat.quantity > 0 ? 'qty-low' : 'qty-empty')]">
                                {{ cat.quantity }}
                            </span>
                        </td>

                        <td>
                            <span class="qty-badge qty-reserved">{{ cat.reserved_quantity }}</span>
                        </td>

                        <td>
                            <span
                                :class="['qty-badge', cat.available_quantity > 10 ? 'qty-ok' : (cat.available_quantity > 0 ? 'qty-low' : 'qty-empty')]">
                                {{ cat.available_quantity }}
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div v-if="categoryStocks.length === 0 && !loading" class="empty-state">
                Aucune catégorie trouvée.
            </div>
        </div>
    </div>
</template>

<style scoped>
.stock-dashboard {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.header-section {
    margin-bottom: 25px;
}

.mt-40 {
    margin-top: 40px;
}

.header-section h1 {
    margin: 0 0 5px 0;
    color: #1e293b;
    font-size: 1.8rem;
}

.header-section h2 {
    margin: 0 0 5px 0;
    color: #1e293b;
    font-size: 1.5rem;
}

.header-section p {
    margin: 0;
    color: #64748b;
}

.alert-banner {
    padding: 12px 20px;
    border-radius: 6px;
    margin-bottom: 20px;
    font-weight: 500;
}

.alert-banner.success {
    background-color: #dcfce7;
    color: #166534;
    border: 1px solid #bbf7d0;
}

.alert-banner.error {
    background-color: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
}

.toolbar {
    margin-bottom: 20px;
}

.search-input {
    width: 100%;
    max-width: 400px;
    padding: 10px 15px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    outline: none;
}

.search-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.table-container {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    border: 1px solid #e2e8f0;
}

.stock-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

.stock-table th {
    background-color: #f8fafc;
    padding: 12px 15px;
    font-weight: 600;
    color: #475569;
    border-bottom: 1px solid #e2e8f0;
}

.stock-table td {
    padding: 12px 15px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: middle;
}

.stock-table tr:last-child td {
    border-bottom: none;
}

.stock-table tr:hover {
    background-color: #f1f5f9;
}

.text-muted {
    color: #94a3b8;
    font-style: italic;
}

.ref-badge {
    background-color: #f1f5f9;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.85rem;
    color: #475569;
}

.variant-badge {
    background-color: #e0e7ff;
    color: #4338ca;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 500;
    text-transform: capitalize;
}

.qty-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: bold;
    font-size: 0.9rem;
}

.qty-ok {
    background-color: #dcfce7;
    color: #166534;
}

.qty-low {
    background-color: #fef9c3;
    color: #854d0e;
}

.qty-empty {
    background-color: #fee2e2;
    color: #991b1b;
}

.qty-reserved {
    background-color: #e0f2fe;
    color: #0369a1;
}

.qty-input {
    width: 80px;
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    text-align: center;
}

.btn-save {
    background-color: #3b82f6;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.2s;
}

.btn-save:hover:not(:disabled) {
    background-color: #2563eb;
}

.btn-save:disabled {
    background-color: #94a3b8;
    cursor: not-allowed;
    opacity: 0.7;
}

.empty-state {
    text-align: center;
    padding: 40px;
    color: #64748b;
    font-style: italic;
}
</style>