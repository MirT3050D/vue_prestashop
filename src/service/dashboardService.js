import { extractText, toNumber, getLanguageText, normalizeArray, getOrderRows, formatMoney } from '@/service/prestashopUtils';
import { getOrders } from '@/service/orderService';
import { getProduct, getProducts } from '@/service/productService';
import { getCategories } from '@/service/categoryService';
import { getStockAvailables } from '@/service/stockService';

/**
 * Convertit une date en clé d'intervalle selon l'agrégation choisie.
 * @param {string} dateString - La date au format string (ex: "2024-01-15 10:30:00")
 * @param {string} aggregationInterval - L'intervalle : 'daily', 'weekly', 'monthly', 'yearly'
 * @returns {string|null} La clé de date formatée ou null si invalide
 */
export function getIntervalKey(dateString, aggregationInterval) {
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

    if (aggregationInterval === 'yearly') {
        return y + '-01-01';
    }

    if (aggregationInterval === 'monthly') {
        return y + '-' + m + '-01';
    }

    if (aggregationInterval === 'weekly') {
        let day = d.getDay();
        if (day === 0) {
            day = 7; // Le dimanche (0) devient 7
        }
        d.setHours(-24 * (day - 1)); // Reculer les jours jusqu'au lundi
        return d.toISOString().slice(0, 10);
    }

    return d.toISOString().slice(0, 10);
}

/**
 * Filtre les commandes par plage de dates.
 * @param {Array} orders - Les commandes brutes
 * @param {string} startDate - Date de début (YYYY-MM-DD)
 * @param {string} endDate - Date de fin (YYYY-MM-DD)
 * @returns {Array} Les commandes filtrées
 */
export function filterOrdersByDate(orders, startDate, endDate) {
    return orders.filter(function (o) {
        const d = extractText(o.date_add).slice(0, 10);

        let isAfterStart = true;
        if (startDate) {
            if (d < startDate) {
                isAfterStart = false;
            }
        }

        let isBeforeEnd = true;
        if (endDate) {
            if (d > endDate) {
                isBeforeEnd = false;
            }
        }

        return isAfterStart && isBeforeEnd;
    });
}

/**
 * Agrège les commandes filtrées en statistiques de vente par intervalle de temps.
 * @param {Array} orders - Les commandes brutes
 * @param {string} startDate - Date de début (YYYY-MM-DD)
 * @param {string} endDate - Date de fin (YYYY-MM-DD)
 * @param {string} aggregationInterval - L'intervalle : 'daily', 'weekly', 'monthly', 'yearly'
 * @returns {Array} Tableau trié de {date, nb_commande, CA}
 */
export function computeSalesStats(orders, startDate, endDate, aggregationInterval) {
    const filtered = filterOrdersByDate(orders, startDate, endDate);
    const stats = {};

    // Remplacement de "for...of" par une boucle for classique
    for (let i = 0; i < filtered.length; i++) {
        const o = filtered[i];
        const key = getIntervalKey(extractText(o.date_add), aggregationInterval);

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
}

/**
 * Extrait les N meilleurs produits vendus dans la plage de dates.
 * @param {Array} orders - Les commandes brutes
 * @param {string} startDate - Date de début (YYYY-MM-DD)
 * @param {string} endDate - Date de fin (YYYY-MM-DD)
 * @param {number} limit - Nombre de produits à retourner (défaut: 5)
 * @returns {Array} Tableau de {id, nom, reference, ventes, ca}
 */
export function computeTopProducts(orders, startDate, endDate, limit) {
    if (limit === undefined || limit === null) {
        limit = 5;
    }

    const filtered = filterOrdersByDate(orders, startDate, endDate);
    const stats = {};

    for (let i = 0; i < filtered.length; i++) {
        const o = filtered[i];

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

    return sortedArray.slice(0, limit); // Garde seulement les N premiers
}

/**
 * Calcule les statistiques de bénéfice par catégorie.
 * @param {Array} orders - Les commandes brutes
 * @param {string} startDate - Date de début (YYYY-MM-DD)
 * @param {string} endDate - Date de fin (YYYY-MM-DD)
 * @param {Object} productInfoById - Map des infos produit par ID
 * @param {Object} categoryNameById - Map des noms de catégorie par ID
 * @returns {Array} Tableau trié de stats par catégorie
 */
export function computeCategoryProfitStats(orders, startDate, endDate, productInfoById, categoryNameById) {
    const filtered = filterOrdersByDate(orders, startDate, endDate);
    const stats = {};

    for (let i = 0; i < filtered.length; i++) {
        const o = filtered[i];
        const rows = getOrderRows(o);

        for (let j = 0; j < rows.length; j++) {
            const row = rows[j];
            const productId = extractText(row.product_id);
            if (!productId) continue;

            const qty = toNumber(row.product_quantity);
            const saleHt = toNumber(row.unit_price_tax_excl) * qty;
            const saleTtc = toNumber(row.unit_price_tax_incl) * qty;

            const productInfo = productInfoById[productId] || {};
            const categoryId = productInfo.categoryId || '0';
            const categoryName = categoryNameById[categoryId] || 'Sans categorie';

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
}

/**
 * Calcule les totaux à partir des statistiques de bénéfice par catégorie.
 * @param {Array} categoryProfitStats - Tableau de stats par catégorie
 * @returns {Object} {totalSalesHt, totalSalesTtc, totalPurchaseHt, totalProfit}
 */
export function computeTotals(categoryProfitStats) {
    let totalSalesHt = 0;
    let totalSalesTtc = 0;
    let totalPurchaseHt = 0;

    for (let i = 0; i < categoryProfitStats.length; i++) {
        totalSalesHt += categoryProfitStats[i].totalSalesHt;
        totalSalesTtc += categoryProfitStats[i].totalSalesTtc;
        totalPurchaseHt += categoryProfitStats[i].totalPurchaseHt;
    }

    const totalProfit = totalSalesHt - totalPurchaseHt;

    return {
        totalSalesHt: totalSalesHt,
        totalSalesTtc: totalSalesTtc,
        totalPurchaseHt: totalPurchaseHt,
        totalProfit: totalProfit
    };
}

/**
 * Calcule le prix d'achat total du stock + vendu.
 * @param {Array} allProducts - Tous les produits
 * @param {Array} allStocks - Tous les stocks
 * @param {Array} orders - Les commandes brutes
 * @param {string} startDate - Date de début (YYYY-MM-DD)
 * @param {string} endDate - Date de fin (YYYY-MM-DD)
 * @returns {number} Le total du prix d'achat HT
 */
export function computeTotalStockPurchaseHt(allProducts, allStocks, orders, startDate, endDate) {
    const filtered = filterOrdersByDate(orders, startDate, endDate);

    const wholesalePriceById = {};
    for (let i = 0; i < allProducts.length; i++) {
        const p = allProducts[i];
        const pid = extractText(p.id);
        wholesalePriceById[pid] = toNumber(extractText(p.wholesale_price));
    }

    const stockQtyById = {};
    for (let i = 0; i < allStocks.length; i++) {
        const s = allStocks[i];
        const pid = extractText(s.id_product);
        const attrId = extractText(s.id_product_attribute) || '0';
        if (attrId === '0') {
            stockQtyById[pid] = toNumber(extractText(s.quantity));
        }
    }

    const soldQtyById = {};
    for (let i = 0; i < filtered.length; i++) {
        const o = filtered[i];
        const rows = getOrderRows(o);
        for (let j = 0; j < rows.length; j++) {
            const row = rows[j];
            const pid = extractText(row.product_id);
            if (pid) {
                const qty = toNumber(row.product_quantity);
                soldQtyById[pid] = (soldQtyById[pid] || 0) + qty;
            }
        }
    }

    let total = 0;
    for (let i = 0; i < allProducts.length; i++) {
        const p = allProducts[i];
        const pid = extractText(p.id);
        const wholesalePrice = wholesalePriceById[pid] || 0;
        const stockQty = stockQtyById[pid] || 0;
        const soldQty = soldQtyById[pid] || 0;
        total += wholesalePrice * (stockQty + soldQty);
    }

    return total;
}

/**
 * Orchestre le chargement de toutes les données du dashboard.
 * Récupère les commandes, produits, stocks en parallèle puis charge les détails.
 * @returns {Object} {orders, allProducts, allStocks, productInfoById, categoryNameById, dateRange}
 */
export async function fetchDashboardData() {
    const [orders, productsData, stocksData] = await Promise.all([
        getOrders({ display: 'full' }),
        getProducts('display=[id,wholesale_price]'),
        getStockAvailables('display=[id_product,id_product_attribute,quantity]')
    ]);

    const rawOrders = orders.filter(function (o) {
        return extractText(o.current_state) !== '6';
    });

    const allProducts = productsData;
    const allStocks = stocksData;

    // Calculer la plage de dates
    let dateStart = '';
    let dateEnd = '';

    if (rawOrders.length > 0) {
        // Remplacement de la fonction fléchée dans le map()
        const dates = rawOrders.map(function (o) {
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
            dateStart = validDates[0];
            dateEnd = validDates[validDates.length - 1];
        }
    }

    // Charger les infos produit
    const productIds = {};
    for (let i = 0; i < rawOrders.length; i++) {
        const rows = getOrderRows(rawOrders[i]);
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

    // Charger les catégories
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

    return {
        orders: rawOrders,
        allProducts: allProducts,
        allStocks: allStocks,
        productInfoById: infoMap,
        categoryNameById: categoryMap,
        dateRange: {
            start: dateStart,
            end: dateEnd
        }
    };
}
