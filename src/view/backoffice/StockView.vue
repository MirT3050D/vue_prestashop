<script setup>
import { onMounted, ref, computed } from 'vue';
import { getProducts } from '@/service/productService';
import { getStockAvailables, updateProductStock } from '@/service/stockService';
import { getOrders } from '@/service/orderService';
import { getCategories } from '@/service/categoryService';
import { getXml, postXml } from '@/service/api';
import Loading from '@/components/Loading.vue';

// ============================================================================
// VARIABLES D'ÉTAT
// ============================================================================
const items = ref([]);
const loading = ref(true);
const searchTxt = ref('');
const message = ref('');
const messageType = ref('');

// ============================================================================
// UTILITAIRES
// ============================================================================
function extractId(node) {
    if (!node) return '0';
    if (typeof node === 'object') return String(node['#text'] || node['@_id'] || node.id || '0');
    return String(node);
}

function getLangText(field) {
    if (!field || !field.language) return 'Produit inconnu';
    if (Array.isArray(field.language)) return field.language[0]['#text'];
    return field.language['#text'];
}

function getCategoryName(categoryId, categoryMap) {
    if (!categoryId) return 'Sans categorie';
    return categoryMap[categoryId] || 'Sans categorie';
}

function triggerBanner(msg, type) {
    message.value = msg;
    messageType.value = type;
    setTimeout(() => { message.value = ''; }, 4000);
}

// ============================================================================
// CHARGEMENT INTELLIGENT DES STOCKS
// ============================================================================
async function loadStockDashboard() {
    loading.value = true;
    items.value = [];
    message.value = '';

    try {
        // 1. Récupération parallèle de TOUTES les données nécessaires
        const [productsList, stocksList, responseCombs, categoriesList] = await Promise.all([
            getProducts('display=full'),
            getStockAvailables('display=full'),
            getXml('/combinations?display=full'),
            getCategories('display=[id,name]')
        ]);

        // 1.1 Chargement des commandes payees (etat 2) pour calculer les reserves
        let paidOrders = [];
        try {
            paidOrders = await getOrders({ display: 'full', 'filter[current_state]': '[2]' });
        } catch (e) {
            paidOrders = [];
        }
        if (!paidOrders || paidOrders.length === 0) {
            // Fallback si le filtre ne renvoie rien
            paidOrders = await getOrders({ display: 'full' });
            paidOrders = paidOrders.filter(o => extractId(o.current_state) === '2');
        }

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
                const key = `${productId}:${attrId}`;
                reservedMap[key] = (reservedMap[key] || 0) + qty;
            }
        }

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
        const productsWithVariants = new Set();
        stocksList.forEach(stock => {
            if (extractId(stock.id_product_attribute) !== '0') {
                productsWithVariants.add(extractId(stock.id_product));
            }
        });

        // 3. Construction du tableau filtré
        const tempItems = [];
        for (const stock of stocksList) {
            const pId = extractId(stock.id_product);
            const attrId = extractId(stock.id_product_attribute);

            // LOGIQUE CLÉ : Si le produit a des variantes, on ignore sa ligne globale "0" (qui fausse le total)
            if (productsWithVariants.has(pId) && attrId === '0') {
                continue;
            }

            const product = productsList.find(p => extractId(p.id) === pId);
            if (!product) continue;

            const categoryId = extractId(product.id_category_default);
            const categoryName = getCategoryName(categoryId, categoryMap);

            // Extraction du joli nom de la déclinaison
            let variantName = '-';
            if (attrId !== '0') {
                const comb = combs.find(c => extractId(c.id) === attrId);
                if (comb && comb.reference) {
                    const parts = comb.reference.split('_');
                    variantName = parts.length > 1 ? parts.slice(1).join(' ') : comb.reference;
                } else {
                    variantName = `Var #${attrId}`; // Sécurité
                }
            }

            const reservedQty = reservedMap[`${pId}:${attrId}`] || 0;
            const availableQty = parseInt(stock.quantity['#text'] || stock.quantity, 10)|| 0 ;
            const qty = availableQty + reservedQty;
            

            tempItems.push({
                id: extractId(stock.id),
                id_product: pId,
                id_product_attribute: attrId,
                name: getLangText(product.name),
                reference: product.reference || '',
                variantName: variantName,
                categoryName: categoryName,
                quantity: qty,
                reserved_quantity: reservedQty,
                available_quantity: availableQty,
                editable_quantity: qty,
                is_saving: false
            });
        }

        // Tri par nom de produit
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
async function handleSaveStock(item) {
    if (item.editable_quantity < 0 || isNaN(item.editable_quantity)) {
        triggerBanner("La quantité ne peut pas être négative.", "error");
        return;
    }

    item.is_saving = true;
    try {
        const diff = item.editable_quantity - item.quantity;

        // 1. Mise à jour réelle via l'API
        await updateProductStock(item.id_product, item.id_product_attribute, item.editable_quantity);

        // 2. Traçabilité forcée avec nos IDs cachés pour StockEvolution.vue !
        if (diff !== 0) {
            const sign = diff > 0 ? 1 : -1;
            const reasonId = diff > 0 ? 11 : 12; // 11=Ajustement Positif, 12=Ajustement Négatif
            const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');

            const mvtXml = `<?xml version="1.0" encoding="UTF-8"?>
            <prestashop>
                <stock_mvt>
                    <id_order><![CDATA[${item.id_product}]]></id_order>
                    <id_supply_order><![CDATA[${item.id_product_attribute}]]></id_supply_order>
                    <id_employee><![CDATA[1]]></id_employee>
                    <id_stock><![CDATA[0]]></id_stock>
                    <id_stock_mvt_reason><![CDATA[${reasonId}]]></id_stock_mvt_reason>
                    <physical_quantity><![CDATA[${Math.abs(diff)}]]></physical_quantity>
                    <sign><![CDATA[${sign}]]></sign>
                    <price_te><![CDATA[0.000000]]></price_te>
                    <date_add><![CDATA[${dateAdd}]]></date_add>
                </stock_mvt>
            </prestashop>`;

            await postXml('/stock_movements', mvtXml);
        }

        item.quantity = item.editable_quantity;
        triggerBanner(`Stock mis à jour pour "${item.name}".`, "success");

    } catch (error) {
        console.error("Erreur de sauvegarde:", error);
        triggerBanner("Erreur lors de la sauvegarde.", "error");
    } finally {
        item.is_saving = false;
    }
}

const filteredItems = computed(() => {
    return items.value.filter(item => {
        const matchTxt = item.name.toLowerCase().includes(searchTxt.value.toLowerCase()) ||
            item.reference.toLowerCase().includes(searchTxt.value.toLowerCase());
        return matchTxt;
    });
});

onMounted(loadStockDashboard);
</script>

<template>
    <div class="stock-dashboard">
        <Loading :isLoading="loading" />

        <div class="header-section">
            <h1>Gestion des Stocks</h1>
            <p>Gérez les quantités de vos produits et déclinaisons en temps réel.</p>
        </div>

        <div v-if="message" :class="['alert-banner', messageType]">
            {{ message }}
        </div>

        <div class="toolbar">
            <input v-model="searchTxt" type="text" placeholder="Rechercher un produit (Nom, Réf...)"
                class="search-input" />
        </div>

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

                        <td>
                            <input type="number" v-model="item.editable_quantity" class="qty-input" min="0" />
                        </td>

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

.header-section h1 {
    margin: 0 0 5px 0;
    color: #1e293b;
    font-size: 1.8rem;
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