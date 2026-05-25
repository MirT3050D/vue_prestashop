import { extractText, toNumber, getLanguageText, normalizeArray, getOrderRows, formatMoney } from '@/service/prestashopUtils';
import { getOrders } from '@/service/orderService';
import { getProduct, getProducts } from '@/service/productService';
import { getCategories } from '@/service/categoryService';
import { getStockAvailables } from '@/service/stockService';

/**
 * Fonction de classification temporelle.
 * Convertit une date brute (ex: "2024-01-15 10:30:00") en une clé d'agrégation "propre" 
 * selon la vue voulue (daily, weekly, monthly, yearly).
 * Ex: si monthly -> "2024-01-01". Permet de regrouper facilement toutes les ventes de janvier.
 * 
 * @param {string} dateString - La date au format SQL ou ISO
 * @param {string} aggregationInterval - Le regroupement (ex: 'monthly')
 * @returns {string|null} La clé formatée (ex: '2024-01-01')
 */
export function getIntervalKey(dateString, aggregationInterval) {
    // Normalise la date pour le parser JS (Remplace l'espace SQL par un T ISO)
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
        return y + '-01-01'; // Renvoie le 1er janvier de l'année
    }

    if (aggregationInterval === 'monthly') {
        return y + '-' + m + '-01'; // Renvoie le 1er jour du mois
    }

    if (aggregationInterval === 'weekly') {
        let day = d.getDay();
        if (day === 0) {
            day = 7; // Le dimanche (0 en JS) devient 7 (logique ISO)
        }
        // Mathématique: Recule la date pour atterrir sur le lundi de la semaine courante
        d.setHours(-24 * (day - 1)); 
        return d.toISOString().slice(0, 10);
    }

    // Daily par défaut
    return d.toISOString().slice(0, 10);
}

/**
 * Filtre un tableau de commandes pour ne garder que celles situées entre deux dates.
 * 
 * @param {Array} orders - Tableau des commandes à filtrer
 * @param {string} startDate - Date de début min (YYYY-MM-DD)
 * @param {string} endDate - Date de fin max (YYYY-MM-DD)
 */
export function filterOrdersByDate(orders, startDate, endDate) {
    return orders.filter(function (o) {
        // Extrait uniquement la partie "date" (excluant l'heure)
        const d = extractText(o.date_add).slice(0, 10);

        let isAfterStart = true;
        if (startDate) {
            if (d < startDate) {
                isAfterStart = false; // Trop ancien
            }
        }

        let isBeforeEnd = true;
        if (endDate) {
            if (d > endDate) {
                isBeforeEnd = false; // Trop récent
            }
        }

        return isAfterStart && isBeforeEnd;
    });
}

/**
 * Le "Moteur de KPI" pour les graphiques de Chiffre d'Affaires.
 * Prend un tableau brut de commandes et calcule le nombre de commandes et le CA généré pour chaque intervalle.
 * 
 * @param {Array} orders - Les commandes brutes
 * @param {string} startDate - Date de début
 * @param {string} endDate - Date de fin
 * @param {string} aggregationInterval - Ex: 'monthly'
 * @returns {Array} Tableau de statistiques prêt pour Chart.js (trié de la date la plus récente à la plus ancienne)
 */
export function computeSalesStats(orders, startDate, endDate, aggregationInterval) {
    const filtered = filterOrdersByDate(orders, startDate, endDate);
    const stats = {};

    // Remplacement de "for...of" par une boucle for classique
    for (let i = 0; i < filtered.length; i++) {
        const o = filtered[i];
        // Demande la clé à utiliser pour la date
        const key = getIntervalKey(extractText(o.date_add), aggregationInterval);

        if (!key) {
            continue; // Ignore si date corrompue
        }

        // Si la case mémoire (Ex: '2024-01-01') n'existe pas, on l'initialise
        if (!stats[key]) {
            stats[key] = { date: key, nb_commande: 0, CA: 0 };
        }

        // Incrémente le compteur et le tiroir-caisse
        stats[key].nb_commande += 1;
        stats[key].CA += toNumber(o.total_paid_tax_incl);
    }

    const statsArray = Object.values(stats);

    // Tri décroissant sur la date
    return statsArray.sort(function (a, b) {
        return b.date.localeCompare(a.date);
    });
}

/**
 * Algorithme "Best-Sellers" : Parcourt les entrailles de chaque commande (order_row)
 * pour compter le nombre de fois qu'un produit précis a été vendu, et le classe.
 * 
 * @param {number} limit - Nombre de produits du Top (ex: Top 5)
 */
export function computeTopProducts(orders, startDate, endDate, limit) {
    if (limit === undefined || limit === null) {
        limit = 5;
    }

    const filtered = filterOrdersByDate(orders, startDate, endDate);
    const stats = {};

    // Double boucle: Pour chaque commande -> Pour chaque produit de la commande
    for (let i = 0; i < filtered.length; i++) {
        const o = filtered[i];

        // Extraction sécurisée des sous-noeuds produits (associations.order_rows)
        let rows = null;
        if (o.associations && o.associations.order_rows) {
            rows = o.associations.order_rows.order_row;
        }

        // Normalisation
        let items = [];
        if (Array.isArray(rows)) {
            items = rows;
        } else if (rows) {
            items = [rows];
        }

        for (let j = 0; j < items.length; j++) {
            const item = items[j];
            const id = extractText(item.product_id);

            if (!id) {
                continue;
            }

            // Init si nouveau produit rencontré
            if (!stats[id]) {
                stats[id] = {
                    id: id,
                    nom: extractText(item.product_name),
                    reference: extractText(item.product_reference),
                    ventes: 0, // Unités vendues
                    ca: 0 // Euro générés
                };
            }

            const qty = toNumber(item.product_quantity);
            stats[id].ventes += qty;
            stats[id].ca += toNumber(item.unit_price_tax_incl) * qty;
        }
    }

    const statsArray = Object.values(stats);

    // Tri par Volume de ventes (Les plus vendus en haut)
    const sortedArray = statsArray.sort(function (a, b) {
        return b.ventes - a.ventes;
    });

    return sortedArray.slice(0, limit); // Troncature du tableau (slice)
}

/**
 * Calcule la rentabilité et la Marge Nette.
 * Fait la corrélation entre les prix de ventes (dans les commandes) et le prix d'achat/grossiste (`wholesale_price`) dans la BDD.
 * Catégorise ces profits (Ex: Je gagne plus sur les chaussures ou les chemises ?).
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
            // Ce que le client a payé
            const saleHt = toNumber(row.unit_price_tax_excl) * qty;
            const saleTtc = toNumber(row.unit_price_tax_incl) * qty;

            // Ce que le marchand a payé (Prix grossiste x Qty)
            const productInfo = productInfoById[productId] || {};
            const categoryId = productInfo.categoryId || '0';
            const categoryName = categoryNameById[categoryId] || 'Sans categorie';

            if (!stats[categoryId]) {
                stats[categoryId] = {
                    categoryId: categoryId,
                    categoryName: categoryName,
                    totalSalesHt: 0,
                    totalSalesTtc: 0,
                    totalPurchaseHt: 0, // Coût d'achat global
                    profit: 0
                };
            }

            stats[categoryId].totalSalesHt += saleHt;
            stats[categoryId].totalSalesTtc += saleTtc;
            stats[categoryId].totalPurchaseHt += (productInfo.wholesalePrice || 0) * qty;
        }
    }

    const statsArray = Object.values(stats);
    // Calcul final du bénéfice pour chaque catégorie (Profit = Chiffre Affaire HT - Achat Gros HT)
    for (let k = 0; k < statsArray.length; k++) {
        const item = statsArray[k];
        item.profit = item.totalSalesHt - item.totalPurchaseHt;
    }

    // Trie par catégorie la plus rentable
    return statsArray.sort(function (a, b) {
        return b.profit - a.profit;
    });
}

/**
 * Condense les statistiques de catégorie en un seul grand bloc Total Récapitulatif.
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
 * Outil d'inventaire financier.
 * "Quelle est la valeur d'achat théorique de tout mon magasin ?" (Ce qu'il y a en stock + Ce que j'ai déjà vendu).
 * Multiplie le prix grossiste de CHAQUE produit par l'addition de (En Stock + Vendu).
 */
export function computeTotalStockPurchaseHt(allProducts, allStocks, orders, startDate, endDate) {
    const filtered = filterOrdersByDate(orders, startDate, endDate);

    // 1. Crée un dictionnaire [ID produit] -> Prix d'Achat
    const wholesalePriceById = {};
    for (let i = 0; i < allProducts.length; i++) {
        const p = allProducts[i];
        const pid = extractText(p.id);
        wholesalePriceById[pid] = toNumber(extractText(p.wholesale_price));
    }

    // 2. Crée un dictionnaire [ID produit] -> Quantité stockée (hors déclinaisons complexes pour simplifier)
    const stockQtyById = {};
    for (let i = 0; i < allStocks.length; i++) {
        const s = allStocks[i];
        const pid = extractText(s.id_product);
        const attrId = extractText(s.id_product_attribute) || '0';
        if (attrId === '0') {
            stockQtyById[pid] = toNumber(extractText(s.quantity));
        }
    }

    // 3. Crée un dictionnaire [ID produit] -> Quantité Vendue
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

    // 4. Calcul Financier Final
    let total = 0;
    for (let i = 0; i < allProducts.length; i++) {
        const p = allProducts[i];
        const pid = extractText(p.id);
        const wholesalePrice = wholesalePriceById[pid] || 0;
        const stockQty = stockQtyById[pid] || 0;
        const soldQty = soldQtyById[pid] || 0;
        // Total = Prix d'achat x (Ce que j'ai + Ce que j'ai donné au client)
        total += wholesalePrice * (stockQty + soldQty);
    }

    return total;
}

/**
 * Fonction Architecte Initiale.
 * Le Dashboard est très lourd à charger, cette fonction orchestre et rassemble les dizaines de requêtes API
 * (Orders, Products, Stocks, Categories, Infos unitaires) en un seul gros package (Dictionnaires et Tableaux)
 * prêt à être mouliné par les fonctions compute() sans jamais refaire d'appel réseau.
 * 
 * @returns {Promise<Object>} Un bloc de données massif (state initial du Dashboard)
 */
export async function fetchDashboardData() {
    // Phase 1 : Extraction parallèle des gros blocs de données avec filtrage réseau limitant la charge
    const [orders, productsData, stocksData] = await Promise.all([
        getOrders({ display: 'full' }),
        getProducts('display=[id,wholesale_price]'),
        getStockAvailables('display=[id_product,id_product_attribute,quantity]')
    ]);

    // Filtrage: On exclut directement les commandes au statut 6 (Souvent "Annulé")
    const rawOrders = orders.filter(function (o) {
        return extractText(o.current_state) !== '6';
    });

    const allProducts = productsData;
    const allStocks = stocksData;

    // Calculer la plage de dates absolue existante en BDD
    let dateStart = '';
    let dateEnd = '';

    if (rawOrders.length > 0) {
        // Liste toutes les dates de la table
        const dates = rawOrders.map(function (o) {
            const dateStr = extractText(o.date_add);
            if (dateStr) {
                return dateStr.slice(0, 10);
            }
            return null;
        });

        const validDates = dates.filter(function (date) {
            if (date !== null && date !== '') {
                return true;
            } else {
                return false;
            }
        });

        // Tri naturel alphabétique (qui marche sur YYYY-MM-DD)
        validDates.sort();

        // Plus ancienne vs Plus récente
        if (validDates.length > 0) {
            dateStart = validDates[0];
            dateEnd = validDates[validDates.length - 1];
        }
    }

    // Constitution d'un dictionnaire d'IDs de produits uniques qui ont été vendus au moins une fois
    const productIds = {};
    for (let i = 0; i < rawOrders.length; i++) {
        const rows = getOrderRows(rawOrders[i]);
        for (let j = 0; j < rows.length; j++) {
            const pid = extractText(rows[j].product_id);
            if (pid) productIds[pid] = true;
        }
    }

    const ids = Object.keys(productIds);
    const infoMap = {}; // Cache des données détaillées produit
    
    // Pour chaque produit vendu, on récupère son prix d'achat, nom, et catégorie
    // Note technique: Boucle asynchrone synchrone (await dans un for). C'est lent. Pour optimiser, un Promise.all(map) serait préférable
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

    // Constitution du cache des noms de catégories
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

    // Le gros paquet cadeau pour l'UI
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
