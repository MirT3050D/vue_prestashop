import { getXml, postXml, putXml, deleteXml } from '@/service/api';

// ============================================================================
// 1. CONFIGURATION & CONSTANTES
// ============================================================================

export const resetOrderTargets = [
    {
        key: 'orders',
        label: 'Commandes',
        endpoint: '/orders',
        collectionKey: 'orders',
        itemKey: 'order',
        skipIds: []
    },
    {
        key: 'carts',
        label: 'Paniers',
        endpoint: '/carts',
        collectionKey: 'carts',
        itemKey: 'cart',
        skipIds: []
    },
];

// ============================================================================
// 2. FONCTIONS UTILITAIRES GÉNÉRIQUES
// ============================================================================

/**
 * Parse une chaîne de caractères formatée en tableau d'objets d'achats.
 * Exemple d'entrée attendue : "[(ref1;2;couleur), (ref2;1;)]"
 */
function parseAchat(achatString) {
    if (!achatString || !achatString.startsWith('[') || !achatString.endsWith(']')) {
        return [];
    }
    const content = achatString.slice(1, -1);
    const tuples = content.match(/\(.*?\)/g);
    if (!tuples) return [];

    return tuples.map(tuple => {
        const parts = tuple.slice(1, -1).split(';').map(p => p.trim().replace(/"/g, ''));
        return {
            ref: parts[0],
            qty: parseInt(parts[1], 10),
            variantName: parts[2] || null,
        };
    });
}

/**
 * Extrait la valeur textuelle d'un nœud XML (converti en objet) de manière sécurisée.
 */
function getNodeText(value) {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'object') return value['#text'] ?? null;
    return null;
}

/**
 * Convertit une valeur en nombre de manière robuste (gère les virgules françaises).
 */
function toNumber(value, fallback = 0) {
    const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
}

// ============================================================================
// 3. FONCTIONS D'INTERROGATION PRESTASHOP (API READ)
// ============================================================================

/**
 * Cherche l'ID d'une déclinaison (variante) et son impact sur le prix.
 */
async function findVariantId(productId, variantName, logCallback) {
    if (!variantName) return { id: 0, priceImpact: 0 };

    try {
        const combinationsResp = await getXml(`/combinations?filter[id_product]=[${productId}]&display=full`);
        if (!combinationsResp?.prestashop?.combinations?.combination) return null;

        let combinations = combinationsResp.prestashop.combinations.combination;
        if (!Array.isArray(combinations)) combinations = [combinations];

        for (const combo of combinations) {
            const associations = combo.associations.product_option_values.product_option_value;

            if (Array.isArray(associations)) {
                // À développer si une déclinaison possède plusieurs attributs
            } else {
                const optionValueId = getNodeText(associations.id);
                const valueResp = await getXml(`/product_option_values/${optionValueId}?display=[name]`);
                const nameNode = valueResp?.prestashop?.product_option_value?.name?.language;

                if (nameNode && nameNode['#text'].toLowerCase() === variantName.toLowerCase()) {
                    return {
                        id: getNodeText(combo.id),
                        priceImpact: toNumber(getNodeText(combo.price))
                    };
                }
            }
        }
        logCallback('warn', `Aucune déclinaison trouvée pour le nom "${variantName}" sur le produit ${productId}`);
        return { id: null, priceImpact: 0 };

    } catch (error) {
        logCallback('error', `Erreur recherche déclinaison "${variantName}": ${error.message}`);
        return { id: null, priceImpact: 0 };
    }
}

/**
 * Récupère et met en cache la liste de tous les états de commande possibles.
 */
async function getOrderStates(logCallback) {
    const statesMap = new Map();
    try {
        const statesResp = await getXml('/order_states?display=[id,name]');
        const states = statesResp?.prestashop?.order_states?.order_state;

        if (states && Array.isArray(states)) {
            for (const state of states) {
                const nameNode = state.name.language;
                const stateName = (Array.isArray(nameNode) ? nameNode[0]['#text'] : nameNode['#text']).toLowerCase();
                statesMap.set(stateName, state.id);
            }
        }
        logCallback('info', `${statesMap.size} états de commande chargés.`);
        return statesMap;
    } catch (error) {
        logCallback('error', `Impossible de charger les états de commande : ${error.message}`);
        return statesMap;
    }
}

/**
 * Calcule le taux de taxe applicable en fonction du groupe de règles de taxes.
 */
async function getTaxRateForGroup(taxRulesGroupId, taxRateCache, logCallback) {
    if (!taxRulesGroupId || taxRulesGroupId === '0') return 0;
    if (taxRateCache[taxRulesGroupId] != null) return taxRateCache[taxRulesGroupId];

    try {
        const rulesResp = await getXml(`/tax_rules?filter[id_tax_rules_group]=[${taxRulesGroupId}]&display=[id,id_tax]`);
        const rulesNode = rulesResp?.prestashop?.tax_rules?.tax_rule;
        const rules = Array.isArray(rulesNode) ? rulesNode : (rulesNode ? [rulesNode] : []);

        if (rules.length === 0) return 0;

        const taxId = getNodeText(rules[0].id_tax);
        const taxResp = await getXml(`/taxes/${taxId}?display=[rate]`);
        const rate = toNumber(getNodeText(taxResp?.prestashop?.tax?.rate));

        // Mise en cache pour éviter les requêtes redondantes
        taxRateCache[taxRulesGroupId] = rate;
        return rate;
    } catch (error) {
        logCallback('warn', `Impossible de récupérer le taux de taxe pour le groupe ${taxRulesGroupId}: ${error.message}`);
        return 0;
    }
}

/**
 * Récupère l'ID du groupe client par défaut configuré dans PrestaShop.
 */
async function getCustomerDefaultGroupId(logCallback) {
    try {
        const configResp = await getXml('/configurations?display=full&filter[name]=[PS_CUSTOMER_GROUP]');
        const configNode = configResp?.prestashop?.configurations?.configuration;
        const config = Array.isArray(configNode) ? configNode[0] : configNode;
        const groupId = Number(getNodeText(config?.value));

        if (Number.isFinite(groupId) && groupId > 0) {
            return groupId;
        }
    } catch (error) {
        logCallback('warn', `Impossible de lire PS_CUSTOMER_GROUP: ${error.message}`);
    }
    return 3; // Fallback par défaut (généralement "Clients")
}


// ============================================================================
// 4. FONCTION PRINCIPALE : IMPORT DES COMMANDES
// ============================================================================

export const processOrderImport = async (data, logCallback) => {
    // -- 4.1 INITIALISATION DES CACHES --
    const customerCache = {};
    const productCache = {};
    const taxRateCache = {};

    // Chargement préalable des états
    const orderStates = await getOrderStates(logCallback);
    if (orderStates.size === 0) {
        logCallback('error', "Arrêt de l'import : impossible de récupérer les états de commande.");
        return;
    }

    // -- 4.2 BOUCLE SUR CHAQUE LIGNE DU CSV --
    for (const [index, row] of data.entries()) {
        if (index === 0) {
            logCallback('info', `Colonnes détectées dans le CSV : ${Object.keys(row).join(', ')}`);
        }

        // Stockage des ID créés pour un éventuel Rollback en cas de crash
        const createdEntities = { customer: null, address: null, cart: null, order: null };

        const rollback = async () => {
            logCallback('info', '--- Début du Rollback ---');
            if (createdEntities.order) await deleteXml(`/orders/${createdEntities.order}`).catch(e => logCallback('warn', `Rollback commande échoué: ${e.message}`));
            if (createdEntities.cart) await deleteXml(`/carts/${createdEntities.cart}`).catch(e => logCallback('warn', 'Rollback panier échoué: ' + e.message));
            if (createdEntities.address) await deleteXml(`/addresses/${createdEntities.address}`).catch(e => logCallback('warn', 'Rollback adresse échoué: ' + e.message));
            if (createdEntities.customer) await deleteXml(`/customers/${createdEntities.customer}`).catch(e => logCallback('warn', 'Rollback client échoué: ' + e.message));
            logCallback('info', '--- Fin du Rollback ---');
        };

        try {
            logCallback('info', `Traitement de la ligne ${index + 1} : ${JSON.stringify(row)}`);
            const { date, nom, email, pwd, adresse, achat, etat } = row;

            const articles = parseAchat(achat);
            if (!email || articles.length === 0) {
                logCallback('warn', `Ligne ${index + 1} ignorée : email ou articles manquants.`);
                continue; // On passe à la ligne suivante
            }

            // ----------------------------------------------------------------
            // ÉTAPE A : GESTION DU CLIENT ET DE L'ADRESSE
            // ----------------------------------------------------------------
            let customerId, addressId, secureKey;
            const customerNames = nom.split(' ');
            const firstname = customerNames.slice(0, -1).join(' ') || customerNames[0];
            const lastname = customerNames.slice(-1)[0];

            if (customerCache[email]) {
                // Client déjà vu lors de cet import
                customerId = customerCache[email].id;
                addressId = customerCache[email].addressId;
                secureKey = customerCache[email].secureKey;
            } else {
                // Recherche dans PrestaShop
                const customerSearch = await getXml(`/customers?filter[email]=[${encodeURIComponent(email)}]&display=[id,secure_key]`);
                const existingCustomer = customerSearch?.prestashop?.customers?.customer;

                if (existingCustomer) {
                    // Le client existe déjà
                    customerId = getNodeText(existingCustomer.id);
                    secureKey = getNodeText(existingCustomer.secure_key);
                } else {
                    // Le client n'existe pas, on le crée
                    const defaultGroupId = await getCustomerDefaultGroupId(logCallback);
                    const customerPayload = {
                        prestashop: {
                            customer: {
                                firstname, lastname, email,
                                passwd: pwd || 'password',
                                active: 1,
                                id_default_group: defaultGroupId,
                                associations: { groups: { group: [{ id: defaultGroupId }] } }
                            }
                        }
                    };
                    const newCustomer = await postXml('/customers', customerPayload);
                    customerId = getNodeText(newCustomer.prestashop.customer.id);
                    createdEntities.customer = customerId; // Sauvegarde pour le Rollback
                }

                // Récupération de la clé de sécurité (obligatoire pour les commandes)
                if (!secureKey) {
                    const customerDetail = await getXml(`/customers/${customerId}?display=[secure_key]`);
                    secureKey = getNodeText(customerDetail?.prestashop?.customer?.secure_key);
                }

                // Recherche ou création de l'adresse
                const addressSearch = await getXml(`/addresses?filter[id_customer]=[${customerId}]&display=[id]`);
                const existingAddress = addressSearch?.prestashop?.addresses?.address;

                if (existingAddress) {
                    const addrNode = Array.isArray(existingAddress) ? existingAddress[0].id : existingAddress.id;
                    addressId = getNodeText(addrNode);
                } else {
                    const addressPayload = { prestashop: { address: { id_customer: customerId, alias: 'Adresse Principale', firstname, lastname, address1: adresse, city: 'Ville', id_country: 8, phone: '0102030405' } } };
                    const newAddress = await postXml('/addresses', addressPayload);
                    addressId = getNodeText(newAddress.prestashop.address.id);
                    createdEntities.address = addressId; // Sauvegarde pour le Rollback
                }

                // Mise en cache
                customerCache[email] = { id: customerId, addressId, secureKey };
            }

            // ----------------------------------------------------------------
            // ÉTAPE B : TRAITEMENT DES PRODUITS & CALCUL DES PRIX
            // ----------------------------------------------------------------
            let cartRows = [];
            let orderRows = [];
            let totalProductsHT = 0;
            let totalProductsWT = 0; // WT = With Taxes (TTC)

            for (const article of articles) {
                let productInfo = productCache[article.ref];

                if (!productInfo) {
                    // Recherche des infos de base du produit
                    const productSearch = await getXml(`/products?filter[reference]=[${encodeURIComponent(article.ref)}]&display=[id,price,id_tax_rules_group]`);
                    let product = productSearch?.prestashop?.products?.product;

                    if (!product) throw new Error(`Produit introuvable pour la référence ${article.ref}.`);
                    if (Array.isArray(product)) product = product[0];

                    const productId = getNodeText(product.id);
                    const productPriceHT = toNumber(getNodeText(product.price));
                    const taxGroupId = getNodeText(product.id_tax_rules_group) || '0';
                    const taxRate = await getTaxRateForGroup(taxGroupId, taxRateCache, logCallback);
                    const productPriceWT = productPriceHT * (1 + (taxRate / 100));

                    productInfo = { id: productId, priceHT: productPriceHT, priceWT: productPriceWT, taxGroupId, taxRate };
                    productCache[article.ref] = productInfo; // Mise en cache
                }

                // Gestion de la déclinaison
                const variantData = await findVariantId(productInfo.id, article.variantName, logCallback);
                const variantId = variantData ? variantData.id : 0;
                const priceImpactHT = variantData ? variantData.priceImpact : 0;

                // Calcul final des prix pour cette ligne
                const finalPriceHT = productInfo.priceHT + priceImpactHT;
                const finalPriceWT = finalPriceHT * (1 + (productInfo.taxRate / 100));

                // Préparation des lignes pour le panier
                cartRows.push({
                    id_product: productInfo.id,
                    id_product_attribute: variantId || 0,
                    id_address_delivery: addressId,
                    quantity: article.qty,
                });

                // Préparation des lignes pour la commande
                orderRows.push({
                    product_id: productInfo.id,
                    product_attribute_id: variantId || 0,
                    product_quantity: article.qty,
                });

                // Incrémentation des totaux globaux
                totalProductsHT += finalPriceHT * article.qty;
                totalProductsWT += finalPriceWT * article.qty;
            }

            if (!Number.isFinite(totalProductsWT) || totalProductsWT <= 0) {
                throw new Error(`Total commande invalide (${totalProductsWT}).`);
            }

            // ----------------------------------------------------------------
            // ÉTAPE C : CRÉATION DU PANIER (XML Épuré et Strict)
            // ----------------------------------------------------------------
            logCallback('info', 'Étape 1 & 2: Création du panier avec les produits...');

            // 1. Construction des lignes SANS id_customization et SANS attributs complexes
            let cartRowsXml = '';
            for (const row of cartRows) {
                cartRowsXml += `
                <cart_row>
                    <id_product>${row.id_product}</id_product>
                    <id_product_attribute>${row.id_product_attribute}</id_product_attribute>
                    <id_address_delivery>${row.id_address_delivery}</id_address_delivery>
                    <quantity>${row.quantity}</quantity>
                </cart_row>`;
            }

            // 2. Payload du panier avec les balises brutes
            const cartXmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <cart>
        <id_customer>${customerId}</id_customer>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_currency>1</id_currency>
        <id_lang>1</id_lang>
        <associations>
            <cart_rows>
${cartRowsXml}
            </cart_rows>
        </associations>
    </cart>
</prestashop>`;

            // 3. Envoi à PrestaShop
            const newCart = await postXml('/carts', cartXmlPayload);
            createdEntities.cart = getNodeText(newCart?.prestashop?.cart?.id || newCart?.prestashop?.cart?.['@_id']);

            if (!createdEntities.cart) {
                throw new Error('La création du panier a échoué.');
            }

            // Arrêt ici si l'état est vide (Le panier est conservé avec ses produits !)
            logCallback('info', `Valeur reçue pour etat: "${etat}"`);
            if (!etat || String(etat).trim() === '' || String(etat).toLowerCase() === 'null') {
                logCallback('success', `Ligne ${index + 1} importée : Panier ${createdEntities.cart} créé avec succès (Aucune commande générée).`);
                continue; // On passe à la ligne suivante du CSV !
            }           // ----------------------------------------------------------------
            // ÉTAPE D : CRÉATION DE LA COMMANDE
            // ----------------------------------------------------------------
            logCallback('info', 'Étape 3: Création de la commande...');

            const currentStateId = orderStates.get(etat.toLowerCase()) || 2;
            const totalPaidWT = totalProductsWT.toFixed(6);
            const totalPaidHT = totalProductsHT.toFixed(6);
            const orderReference = `IMP${String(createdEntities.cart).padStart(6, '0')}`;

            logCallback('info', `Résumé panier: lignes=${cartRows.length}, total_ht=${totalPaidHT}, total_ttc=${totalPaidWT}`);
            logCallback('info', `Résumé commande: client=${customerId}, adresse=${addressId}, panier=${createdEntities.cart}, transporteur=1, état=${currentStateId}`);

            // Construction de la chaîne XML pour les lignes de commande
            let orderRowsXml = '';
            for (const row of orderRows) {
                orderRowsXml += `
                <order_row>
                    <product_id>${row.product_id}</product_id>
                    <product_attribute_id>${row.product_attribute_id}</product_attribute_id>
                    <product_quantity>${row.product_quantity}</product_quantity>
                </order_row>`;
            }

            // Construction du payload XML de la commande
            const orderPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <order>
        <id_customer>${customerId}</id_customer>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_cart>${createdEntities.cart}</id_cart>
        <id_carrier>1</id_carrier>
        <id_currency>1</id_currency>
        <id_lang>1</id_lang>
        <id_shop>1</id_shop>
        <id_shop_group>1</id_shop_group>
        <reference>${orderReference}</reference>
        <module>ps_checkpayment</module>
        <payment>Import CSV</payment>
        <total_paid>${totalPaidWT}</total_paid>
        <total_paid_real>0.000000</total_paid_real>
        <total_paid_tax_incl>${totalPaidWT}</total_paid_tax_incl>
        <total_paid_tax_excl>${totalPaidHT}</total_paid_tax_excl>
        <total_products>${totalPaidHT}</total_products>
        <total_products_wt>${totalPaidWT}</total_products_wt>
        <total_shipping>0.000000</total_shipping>
        <total_shipping_tax_excl>0.000000</total_shipping_tax_excl>
        <total_shipping_tax_incl>0.000000</total_shipping_tax_incl>
        <total_discounts>0.000000</total_discounts>
        <total_discounts_tax_excl>0.000000</total_discounts_tax_excl>
        <total_discounts_tax_incl>0.000000</total_discounts_tax_incl>
        <total_wrapping>0.000000</total_wrapping>
        <total_wrapping_tax_excl>0.000000</total_wrapping_tax_excl>
        <total_wrapping_tax_incl>0.000000</total_wrapping_tax_incl>
        <conversion_rate>1.000000</conversion_rate>
        <current_state>${currentStateId}</current_state>
        ${secureKey ? `<secure_key>${secureKey}</secure_key>` : ''}
        <associations>
            <order_rows>${orderRowsXml}
            </order_rows>
        </associations>
    </order>
</prestashop>`;

            const newOrder = await postXml('/orders', orderPayload);
            createdEntities.order = getNodeText(newOrder?.prestashop?.order?.id || newOrder?.prestashop?.order?.['@_id']);

            if (!createdEntities.order) {
                throw new Error('La création de la commande a renvoyé une réponse inattendue.');
            }

            // ----------------------------------------------------------------
            // ÉTAPE E : FORÇAGE DES DATES & NETTOYAGE DU PANIER
            // ----------------------------------------------------------------
            logCallback('info', `Étape 4: Mise à jour de la date de la commande ${createdEntities.order}...`);
            const [day, month, year] = date.split('/');

            // Note: Lors d'un update (PUT), PrestaShop exige de renvoyer quasiment tous les champs
            const orderDatesPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <order>
        <id>${createdEntities.order}</id>
        <id_customer>${customerId}</id_customer>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_cart>${createdEntities.cart}</id_cart>
        <id_carrier>1</id_carrier>
        <id_currency>1</id_currency>
        <id_lang>1</id_lang>
        <id_shop>1</id_shop>
        <id_shop_group>1</id_shop_group>
        <reference>${orderReference}</reference>
        <module>ps_checkpayment</module>
        <payment>Import CSV</payment>
        <current_state>${currentStateId}</current_state>
        <total_paid>${totalPaidWT}</total_paid>
        <total_paid_real>0.000000</total_paid_real>
        <total_paid_tax_incl>${totalPaidWT}</total_paid_tax_incl>
        <total_paid_tax_excl>${totalPaidHT}</total_paid_tax_excl>
        <total_products>${totalPaidHT}</total_products>
        <total_products_wt>${totalPaidWT}</total_products_wt>
        <total_shipping>0.000000</total_shipping>
        <total_shipping_tax_excl>0.000000</total_shipping_tax_excl>
        <total_shipping_tax_incl>0.000000</total_shipping_tax_incl>
        <total_discounts>0.000000</total_discounts>
        <total_discounts_tax_excl>0.000000</total_discounts_tax_excl>
        <total_discounts_tax_incl>0.000000</total_discounts_tax_incl>
        <total_wrapping>0.000000</total_wrapping>
        <total_wrapping_tax_excl>0.000000</total_wrapping_tax_excl>
        <total_wrapping_tax_incl>0.000000</total_wrapping_tax_incl>
        <conversion_rate>1.000000</conversion_rate>
        <secure_key>${secureKey || ''}</secure_key>
        <date_add>${year}-${month}-${day} 12:00:00</date_add>
        <invoice_date>${year}-${month}-${day} 12:00:00</invoice_date>
        <delivery_date>${year}-${month}-${day} 12:00:00</delivery_date>
        <associations>
            <order_rows>${orderRowsXml}
            </order_rows>
        </associations>
    </order>
</prestashop>`;
            await putXml(`/orders/${createdEntities.order}`, orderDatesPayload);

            // On vide les produits du panier pour éviter les problèmes d'affichage côté client
            logCallback('info', `Nettoyage du panier ${createdEntities.cart} après commande...`);
            const cleanCartPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <cart>
        <id>${createdEntities.cart}</id>
        <id_customer>${customerId}</id_customer>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_currency>1</id_currency>
        <id_lang>1</id_lang>
        <associations>
            <cart_rows></cart_rows>
        </associations>
    </cart>
</prestashop>`;
            await putXml(`/carts/${createdEntities.cart}`, cleanCartPayload);

            logCallback('success', `Ligne ${index + 1} importée avec succès. Commande ID: ${createdEntities.order}`);

        } catch (error) {
            // ----------------------------------------------------------------
            // ÉTAPE F : GESTION DES ERREURS & DÉCLENCHEMENT DU ROLLBACK
            // ----------------------------------------------------------------
            const apiError = error.response?.data || error.message;
            logCallback('error', `Erreur critique Ligne ${index + 1}: ${error.message}`);
            if (apiError) logCallback('error', `Détails API: ${apiError}`);

            await rollback(); // On nettoie les objets à moitié créés
        }
    }

    logCallback('success', 'Import des commandes terminé avec succès !');
};