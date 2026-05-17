import { getXml, postXml, putXml, deleteXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';

// ============================================================================
// CONFIGURATION DU ROLLBACK (CIBLE DE RÉINITIALISATION)
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
    }
];

export const rollbackOrders = async (logCallback) => {
    logCallback('info', 'Lancement de la réinitialisation des commandes et paniers...');
    await runResetForTargets(resetOrderTargets, (type, message) => {
        logCallback(type, `Rollback Commande: ${message}`);
    });
    logCallback('info', 'Réinitialisation des commandes terminée.');
};

// ============================================================================
// FONCTIONS UTILITAIRES DE PARSING
// ============================================================================

/**
 * Parse la chaîne de caractères complexe du CSV représentant les achats.
 * Exemple : "[(T_01;3;ngoza)]" ou "[(T_01;2;kely),(C_03;1;)]"
 */
function parseAchat(achatString) {
    if (!achatString || achatString.indexOf('[') === -1 || achatString.indexOf(']') === -1) {
        return [];
    }
    // Extraction du contenu entre les crochets []
    const start = achatString.indexOf('[');
    const end = achatString.lastIndexOf(']');
    const content = achatString.slice(start + 1, end);

    // Découpage des différents tuples entre parenthèses ( )
    const tuples = content.match(/\(.*?\)/g);
    if (!tuples) {
        return [];
    }

    const items = [];
    for (let i = 0; i < tuples.length; i++) {
        const tuple = tuples[i];
        const cleanTuple = tuple.slice(1, -1); // Enlever les parenthèses ( et )
        const parts = cleanTuple.split(';');

        // Nettoyage des guillemets résiduels de l'encapsulation CSV
        const ref = parts[0] ? parts[0].replace(/["']/g, '').trim() : '';
        const qty = parts[1] ? parseInt(parts[1].trim(), 10) || 1 : 1;
        const variant = parts[2] ? parts[2].replace(/["']/g, '').trim() : '';

        if (ref) {
            items.push({ reference: ref, quantity: qty, variant: variant });
        }
    }
    return items;
}

/**
 * Extrait textuellement l'ID d'un nœud renvoyé par l'API PrestaShop.
 */
function extractId(node) {
    if (!node) return null;
    if (typeof node === 'object') {
        return String(node['#text'] || node['@_id'] || node.id || '');
    }
    return String(node);
}

// ============================================================================
// FONCTION PRINCIPALE : IMPORTATION DES COMMANDES ET PANIERS
// ============================================================================
export const processOrderImport = async (data, logCallback) => {
    if (!data || data.length === 0) {
        logCallback('warn', 'Le fichier CSV des commandes est vide.');
        return;
    }

    // ========================================================================
    // SÉCURITÉ 1 : VÉRIFICATION GLOBALE DES COLONNES CONFORMES
    // ========================================================================
    const expectedColumns = ['date', 'nom', 'email', 'pwd', 'adresse', 'achat', 'etat'];
    const actualColumns = Object.keys(data[0]);
    const missingColumns = [];

    for (let c = 0; c < expectedColumns.length; c++) {
        if (actualColumns.indexOf(expectedColumns[c]) === -1) {
            missingColumns.push(expectedColumns[c]);
        }
    }

    if (missingColumns.length > 0) {
        logCallback('error', `CRITIQUE : Colonnes manquantes dans le CSV : ${missingColumns.join(', ')}`);
        logCallback('error', 'Annulation immédiate de l\'importation des commandes.');
        return;
    }

    try {
        // Chargement des états de commande disponibles sur PrestaShop pour le mapping
        const statesResp = await getXml('/order_states?display=full');
        const allStates = statesResp?.prestashop?.order_states?.order_state || [];
        const stateList = Array.isArray(allStates) ? allStates : [allStates];

        logCallback('info', `${stateList.length} états de commande chargés pour vérification.`);

        for (const [index, row] of data.entries()) {
            logCallback('info', `Traitement de la ligne ${index + 1} (Client : ${row.nom || 'Inconnu'})...`);

            // ========================================================================
            // SÉCURITÉ 2 : CONTRÔLE DES DONNÉES OBLIGATOIRES
            // ========================================================================
            if (!row.email || !row.nom || !row.adresse || !row.achat) {
                logCallback('error', `Ligne ${index + 1} ignorée : Des données essentielles (email, nom, adresse, achat) manquent.`);
                continue;
            }

            // ========================================================================
            // SÉCURITÉ 3 : VALIDATION STRICTE DU FORMAT DE DATE (DD/MM/YYYY)
            // ========================================================================
            const rawDate = String(row.date).trim();
            const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;

            if (!dateRegex.test(rawDate)) {
                logCallback('error', `Ligne ${index + 1} ignorée : Format de date "${rawDate}" invalide. Attendu : DD/MM/YYYY.`);
                continue;
            }

            // Extraction et conversion de la date pour l'injection PrestaShop (AAAA-MM-JJ)
            const dateParts = rawDate.split('/');
            const day = dateParts[0].padStart(2, '0');
            const month = dateParts[1].padStart(2, '0');
            const year = dateParts[2];
            const formattedDate = `${year}-${month}-${day}`;

            // ========================================================================
            // RÉSOLUTION OU CRÉATION DU CLIENT
            // ========================================================================
            let customerId = null;
            const customerSearch = await getXml(`/customers?filter[email]=[${row.email.trim()}]&display=[id]`);
            let customer = customerSearch?.prestashop?.customers?.customer;

            if (customer) {
                if (Array.isArray(customer)) customer = customer[0];
                customerId = extractId(customer.id);
            } else {
                logCallback('info', `Création du client ${row.nom} (${row.email})...`);
                const customerPayload = {
                    prestashop: {
                        customer: {
                            firstname: row.nom,
                            lastname: row.nom,
                            email: row.email.trim(),
                            passwd: row.pwd || 'DefaultPassword123!',
                            active: 1
                        }
                    }
                };
                const newCustomer = await postXml('/customers', customerPayload);
                customerId = extractId(newCustomer?.prestashop?.customer?.id);
            }

            // ========================================================================
            // RÉSOLUTION OU CRÉATION DE L'ADRESSE
            // ========================================================================
            let addressId = null;
            const addressSearch = await getXml(`/addresses?filter[id_customer]=[${customerId}]&filter[address1]=[${row.adresse.trim()}]&display=[id]`);
            let address = addressSearch?.prestashop?.addresses?.address;

            if (address) {
                if (Array.isArray(address)) address = address[0];
                addressId = extractId(address.id);
            } else {
                const addressPayload = {
                    prestashop: {
                        address: {
                            id_customer: customerId,
                            alias: 'Importé',
                            lastname: row.nom,
                            firstname: row.nom,
                            address1: row.adresse.trim(),
                            postcode: '101', // Code postal standard Madagascar
                            city: 'Antananarivo',
                            id_country: 1, // Madagascar
                            phone: '0340000000'
                        }
                    }
                };
                const newAddress = await postXml('/addresses', addressPayload);
                addressId = extractId(newAddress?.prestashop?.address?.id);
            }

            // ========================================================================
            // ANALYSE ET ENRICHISSEMENT DES PRODUITS DE L'ACHAT
            // ========================================================================
            const purchasedItems = parseAchat(row.achat);
            if (purchasedItems.length === 0) {
                logCallback('error', `Ligne ${index + 1} ignorée : Aucun produit valide n'a pu être extrait de la colonne achat.`);
                continue;
            }

            let cartRowsXml = '';
            let productCheckFailed = false;

            for (let i = 0; i < purchasedItems.length; i++) {
                const item = purchasedItems[i];

                // Recherche de l'ID du produit de base via sa référence
                const prodSearch = await getXml(`/products?filter[reference]=[${item.reference}]&display=[id]`);
                let foundProd = prodSearch?.prestashop?.products?.product;
                if (!foundProd) {
                    logCallback('error', `Ligne ${index + 1} stoppée : Référence produit "${item.reference}" introuvable.`);
                    productCheckFailed = true;
                    break;
                }
                if (Array.isArray(foundProd)) foundProd = foundProd[0];
                const idProduct = extractId(foundProd.id);

                // Recherche optionnelle de la déclinaison si une variante est définie
                let idProductAttribute = '0';
                if (item.variant) {
                    const combSearch = await getXml(`/combinations?filter[id_product]=[${idProduct}]&filter[reference]=%${item.variant}%&display=[id]`);
                    let foundComb = combSearch?.prestashop?.combinations?.combination;
                    if (foundComb) {
                        if (Array.isArray(foundComb)) foundComb = foundComb[0];
                        idProductAttribute = extractId(foundComb.id);
                    }
                }

                cartRowsXml += `
                <cart_row>
                    <id_product>${idProduct}</id_product>
                    <id_product_attribute>${idProductAttribute}</id_product_attribute>
                    <id_address_delivery>${addressId}</id_address_delivery>
                    <id_customization>0</id_customization>
                    <quantity>${item.quantity}</quantity>
                </cart_row>`;
            }

            if (productCheckFailed) {
                continue; // Saute cette ligne si un produit n'existe pas en base
            }

            // ========================================================================
            // ÉTAPE C : CRÉATION DU PANIER EN XML BRUT STRICT
            // ========================================================================
            const cartXmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
    <cart>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_currency>1</id_currency>
        <id_customer>${customerId}</customerId>
        <id_lang>1</id_lang>
        <id_shop_group>1</id_shop_group>
        <id_shop>1</id_shop>
        <id_carrier>1</id_carrier>
        <associations>
            <cart_rows nodeType="cart_row" virtualEntity="true">
${cartRowsXml}
            </cart_rows>
        </associations>
    </cart>
</prestashop>`;

            const newCartResp = await postXml('/carts', cartXmlPayload);
            const cartId = extractId(newCartResp?.prestashop?.cart?.id);

            if (!cartId) {
                logCallback('error', `Échec critique de création du panier à la ligne ${index + 1}.`);
                continue;
            }

            // ========================================================================
            // ÉTAPE D : LA RÈGLE D'OR (VÉRIFICATION DE L'ÉTAT DU COMPTE)
            // ========================================================================
            const etatBrut = row.etat ? String(row.etat).trim().toLowerCase() : '';

            // Si l'état est vide, null ou absent -> Le panier reste intact (Panier abandonné historique)
            if (etatBrut === '' || etatBrut === 'null') {
                logCallback('info', `État vide détecté. Fixation de la date historique pour le Panier #${cartId}...`);

                const updateCartDatePayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
    <cart>
        <id>${cartId}</id>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_currency>1</id_currency>
        <id_customer>${customerId}</id_customer>
        <id_lang>1</id_lang>
        <id_shop_group>1</id_shop_group>
        <id_shop>1</id_shop>
        <id_carrier>1</id_carrier>
        <date_add>${formattedDate} 12:00:00</date_add>
        <date_upd>${formattedDate} 12:00:00</date_upd>
        <associations>
            <cart_rows nodeType="cart_row" virtualEntity="true">
${cartRowsXml}
            </cart_rows>
        </associations>
    </cart>
</prestashop>`;

                await putXml(`/carts/${cartId}`, updateCartDatePayload);
                logCallback('success', `Ligne ${index + 1} importée : Le panier #${cartId} est conservé avec succès (Aucune commande créée).`);
                continue; // Règle respectée : arrêt du traitement et passage à la ligne suivante
            }

            // ========================================================================
            // ÉTAPE E : CRÉATION DE LA COMMANDE (Si un état valide est fourni)
            // ========================================================================
            let orderStateId = '2'; // Statut par défaut (Paiement accepté)

            for (let s = 0; s < stateList.length; s++) {
                const stateNode = stateList[s].name?.language;
                let textName = '';
                if (Array.isArray(stateNode)) {
                    textName = stateNode[0]['#text'] || '';
                } else if (stateNode) {
                    textName = stateNode['#text'] || stateNode;
                }

                if (textName.toLowerCase().indexOf(etatBrut) !== -1) {
                    orderStateId = extractId(stateList[s].id);
                    break;
                }
            }

            // Construction du XML pour la commande finale
            const orderXmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <order>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_cart>${cartId}</id_cart>
        <id_currency>1</id_currency>
        <id_lang>1</id_lang>
        <id_customer>${customerId}</id_customer>
        <id_carrier>1</id_carrier>
        <current_state>${orderStateId}</current_state>
        <payment>Paiement importé</payment>
        <module>importcsv</module>
        <total_paid>0.00</total_paid>
        <total_paid_real>0.00</total_paid_real>
        <total_products>0.00</total_products>
        <total_products_wt>0.00</total_products_wt>
        <conversion_rate>1</conversion_rate>
    </order>
</prestashop>`;

            const newOrderResp = await postXml('/orders', orderXmlPayload);
            const orderId = extractId(newOrderResp?.prestashop?.order?.id);

            if (orderId) {
                // Forçage de la date historique de la commande créée
                logCallback('info', `Mise à jour de la date historique de la commande #${orderId}...`);
                const updateOrderDatePayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <order>
        <id>${orderId}</id>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_cart>${cartId}</id_cart>
        <id_currency>1</id_currency>
        <id_lang>1</id_lang>
        <id_customer>${customerId}</id_customer>
        <id_carrier>1</id_carrier>
        <current_state>${orderStateId}</current_state>
        <payment>Paiement importé</payment>
        <module>importcsv</module>
        <date_add>${formattedDate} 12:00:00</date_add>
        <date_upd>${formattedDate} 12:00:00</date_upd>
    </order>
</prestashop>`;
                await putXml(`/orders/${orderId}`, updateOrderDatePayload);

                // Nettoyage standard du panier de commande pour libérer l'espace front-office du client
                const cleanCartPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <cart>
        <id>${cartId}</id>
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
                await putXml(`/carts/${cartId}`, cleanCartPayload);

                logCallback('success', `Ligne ${index + 1} importée avec succès. Commande ID : ${orderId}`);
            }
        }

        logCallback('success', 'Importation globale des commandes et paniers terminée avec succès !');
    } catch (error) {
        logCallback('error', `CRITIQUE : Échec de l'importation des commandes : ${error.message}`);
        logCallback('error', 'Lancement automatique de la procédure de Rollback...');
        await rollbackOrders(logCallback);
    }
};