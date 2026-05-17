import { getXml, postXml, putXml, deleteXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';

// ============================================================================
// CONFIGURATION DU ROLLBACK
// ============================================================================
export const resetOrderTargets = [
    { key: 'orders', label: 'Commandes', endpoint: '/orders', collectionKey: 'orders', itemKey: 'order', skipIds: [] },
    { key: 'addresses', label: 'Adresses Clients', endpoint: '/addresses', collectionKey: 'addresses', itemKey: 'address', skipIds: [] },
    { key: 'customers', label: 'Clients', endpoint: '/customers', collectionKey: 'customers', itemKey: 'customer', skipIds: [] }
];

export const rollbackOrders = async (logCallback) => {
    logCallback('info', 'Lancement de la réinitialisation des commandes...');
    await runResetForTargets(resetOrderTargets, (type, message) => {
        logCallback(type, `Rollback: ${message}`);
    });
    logCallback('info', 'Réinitialisation terminée.');
};

// ============================================================================
// UTILITAIRES DE LECTURE ET DE LOGS DÉTAILLÉS
// ============================================================================
function parseAchat(achatString) {
    if (!achatString || !achatString.includes('[')) return [];
    const content = achatString.substring(achatString.indexOf('[') + 1, achatString.lastIndexOf(']')).trim();
    if (!content) return [];

    const items = [];
    let currentItem = '';
    let inTuple = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '(') { inTuple = true; currentItem = ''; }
        else if (char === ')') { inTuple = false; items.push(currentItem); }
        else if (inTuple) currentItem += char;
    }

    return items.map(item => {
        const parts = item.split(';').map(p => p.replace(/"/g, '').trim());
        return { reference: parts[0] || '', quantite: parseInt(parts[1], 10) || 1, variante: parts[2] || '' };
    });
}

function generateOrderReference() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 9; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function extractId(node) {
    // CORRECTION : On ne tombe plus dans le piège du 0 "falsy" !
    if (node === undefined || node === null) return '';
    if (typeof node === 'object') return String(node['#text'] || node['@_id'] || node.id || '');
    return String(node);
}

function getLangText(field) {
    if (!field || !field.language) return '';
    if (Array.isArray(field.language)) return field.language[0]['#text'];
    return field.language['#text'];
}

function formatApiError(error) {
    let msg = error.message;
    if (error.response) {
        msg += ` (Statut HTTP: ${error.response.status})`;
        if (error.response.data) {
            const dataStr = typeof error.response.data === 'object'
                ? JSON.stringify(error.response.data)
                : String(error.response.data);
            msg += ` | Détail API : ${dataStr.replace(/\n/g, '').substring(0, 500)}`;
        }
    }
    return msg;
}

// ============================================================================
// SUPER-FONCTION DE MISE À JOUR SÉCURISÉE DU STOCK (Anti-Erreur 400/500)
// ============================================================================
async function forceUpdateStockAvailable(stockAvailable, newQty) {
    const stId = extractId(stockAvailable.id);
    const stProductId = extractId(stockAvailable.id_product);

    // CORRECTION : Forçage absolu de l'ID attribut à "0" s'il est vide
    let stAttrId = extractId(stockAvailable.id_product_attribute);
    if (stAttrId === '') stAttrId = '0';

    const stShop = extractId(stockAvailable.id_shop) || '1';
    const stShopGroup = extractId(stockAvailable.id_shop_group) || '0';
    const stDepends = extractId(stockAvailable.depends_on_stock) || '0';
    const stOutOfStock = extractId(stockAvailable.out_of_stock) || '2';
    const stLocation = (typeof stockAvailable.location === 'object' ? '' : stockAvailable.location) || '';

    const stockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <prestashop><stock_available>
        <id><![CDATA[${stId}]]></id>
        <id_product><![CDATA[${stProductId}]]></id_product>
        <id_product_attribute><![CDATA[${stAttrId}]]></id_product_attribute>
        <id_shop><![CDATA[${stShop}]]></id_shop>
        <id_shop_group><![CDATA[${stShopGroup}]]></id_shop_group>
        <quantity><![CDATA[${newQty}]]></quantity>
        <depends_on_stock><![CDATA[${stDepends}]]></depends_on_stock>
        <out_of_stock><![CDATA[${stOutOfStock}]]></out_of_stock>
        <location><![CDATA[${stLocation}]]></location>
    </stock_available></prestashop>`;

    await putXml(`/stock_availables/${stId}`, stockXml);
}

// ============================================================================
// GESTION DES STOCKS
// ============================================================================
// ... (garde tout le haut de ton fichier actuel jusqu'à decrementStock) ...

async function decrementStock(pId, attributeId, quantity, orderId, employeeId, logCallback) {
    try {
        const attrFilter = attributeId ? attributeId : 0;
        const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${pId}]&filter[id_product_attribute]=[${attrFilter}]&display=full`);
        let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

        if (stockAvailable) {
            if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];

            // CORRECTION : on lit le stock actuel et on calcule la nouvelle valeur absolue
            const oldQty = parseInt(extractId(stockAvailable.quantity), 10) || 0;
            const newQty = oldQty - quantity;

            await forceUpdateStockAvailable(stockAvailable, newQty); // ✅ valeur absolue, pas négative

            const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const baseXml = `
                <id_product><![CDATA[${pId}]]></id_product>
                <id_product_attribute><![CDATA[${attrFilter}]]></id_product_attribute>
                <id_employee><![CDATA[${employeeId}]]></id_employee>
                <id_stock><![CDATA[0]]></id_stock>
                <id_stock_mvt_reason><![CDATA[3]]></id_stock_mvt_reason>
                <physical_quantity><![CDATA[${quantity}]]></physical_quantity>
                <sign><![CDATA[-1]]></sign>
                <price_te><![CDATA[0.000000]]></price_te>
                <date_add><![CDATA[${dateAdd}]]></date_add>
            `;
            await postXml('/stock_movements', `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop><stock_mvt>${baseXml}</stock_mvt></prestashop>`);
            if (logCallback) logCallback('success', `📦 Stock décrémenté pour le produit ${pId} (${oldQty} → ${newQty}).`);
        }
    } catch (e) {
        if (logCallback) logCallback('warn', `⚠️ Impossible de décrémenter le stock : ${e.message}`);
    }
}
// ... (Garde le reste de ton fichier processOrderImport) ...
// ============================================================================
// FONCTION PRINCIPALE D'IMPORTATION
// ============================================================================
export const processOrderImport = async (data, logCallback) => {
    if (!data || data.length === 0) { logCallback('warn', 'CSV vide.'); return; }

    data = data.map(row => {
        const newRow = {};
        for (const key in row) newRow[key.trim().toLowerCase()] = row[key];
        return newRow;
    });

    const employeeId = 1;

    try {
        for (const [index, row] of data.entries()) {
            const nom = row.nom ? String(row.nom).trim() : 'Client';
            const email = row.email ? String(row.email).trim() : '';
            const password = row.pwd ? String(row.pwd).trim() : '123456789';
            const adresseRaw = row.adresse ? String(row.adresse).trim() : 'Antananarivo';
            const dateRaw = row.date ? String(row.date).trim() : '';
            const etatRaw = row.etat ? String(row.etat).trim().toLowerCase() : '';
            const achats = parseAchat(row.achat);

            if (!email) continue;
            logCallback('info', `--- Ligne ${index + 1} (Client : ${nom}) ---`);

            let customerId = null;
            const customerSearch = await getXml(`/customers?filter[email]=[${email}]&display=[id]`);
            let existingCustomer = customerSearch?.prestashop?.customers?.customer;

            if (existingCustomer) {
                customerId = extractId(Array.isArray(existingCustomer) ? existingCustomer[0].id : existingCustomer.id);
            } else {
                const customerPayload = `<?xml version="1.0" encoding="UTF-8"?>
                <prestashop><customer>
                    <lastname><![CDATA[${nom}]]></lastname><firstname><![CDATA[Client]]></firstname>
                    <email><![CDATA[${email}]]></email><passwd><![CDATA[${password}]]></passwd>
                    <id_default_group><![CDATA[3]]></id_default_group><active><![CDATA[1]]></active>
                    <associations><groups><group><id><![CDATA[3]]></id></group></groups></associations>
                </customer></prestashop>`;
                const newCustomerResp = await postXml('/customers', customerPayload);
                customerId = extractId(newCustomerResp?.prestashop?.customer?.id);
            }

            let addressId = null;
            const addressSearch = await getXml(`/addresses?filter[id_customer]=[${customerId}]&display=[id]`);
            let existingAddress = addressSearch?.prestashop?.addresses?.address;

            if (existingAddress) {
                addressId = extractId(Array.isArray(existingAddress) ? existingAddress[0].id : existingAddress.id);
            } else {
                const addressPayload = `<?xml version="1.0" encoding="UTF-8"?>
                <prestashop><address>
                    <id_customer><![CDATA[${customerId}]]></id_customer><id_country><![CDATA[8]]></id_country>
                    <alias><![CDATA[Mon Adresse]]></alias><lastname><![CDATA[${nom}]]></lastname><firstname><![CDATA[Client]]></firstname>
                    <address1><![CDATA[${adresseRaw}]]></address1><city><![CDATA[Antananarivo]]></city><phone><![CDATA[0340000000]]></phone>
                </address></prestashop>`;
                const newAddressResp = await postXml('/addresses', addressPayload);
                addressId = extractId(newAddressResp?.prestashop?.address?.id);
            }

            let cartRowsXml = '';
            let orderRowsXml = '';
            let totalPaidHt = 0;
            let totalPaidTtc = 0;
            const linesToDecrement = [];

            for (const achat of achats) {
                const prodSearch = await getXml(`/products?filter[reference]=[${achat.reference}]&display=[id,price,name]`);
                let prod = prodSearch?.prestashop?.products?.product;
                if (!prod) continue;
                if (Array.isArray(prod)) prod = prod[0];

                const pId = extractId(prod.id);
                let currentItemPriceHt = parseFloat(prod.price) || 0;
                let prodName = getLangText(prod.name) || 'Produit';

                let attributeId = 0;
                if (achat.variante) {
                    const combSearch = await getXml(`/combinations?filter[id_product]=[${pId}]&filter[reference]=[${achat.reference}_${achat.variante}]&display=[id,price]`);
                    let comb = combSearch?.prestashop?.combinations?.combination;
                    if (comb) {
                        attributeId = extractId(Array.isArray(comb) ? comb[0].id : comb.id);
                        currentItemPriceHt += parseFloat(Array.isArray(comb) ? comb[0].price : comb.price) || 0;
                        prodName += ` - ${achat.variante}`;
                    }
                }

                const currentItemPriceTtc = currentItemPriceHt * 1.20;
                totalPaidHt += currentItemPriceHt * achat.quantite;
                totalPaidTtc += currentItemPriceTtc * achat.quantite;

                linesToDecrement.push({ pId, attributeId, quantity: achat.quantite });

                cartRowsXml += `
                <cart_row>
                    <id_product><![CDATA[${pId}]]></id_product>
                    <id_product_attribute><![CDATA[${attributeId}]]></id_product_attribute>
                    <id_address_delivery><![CDATA[${addressId}]]></id_address_delivery>
                    <quantity><![CDATA[${achat.quantite}]]></quantity>
                </cart_row>`;

                orderRowsXml += `
                <order_row>
                    <product_id><![CDATA[${pId}]]></product_id>
                    <product_attribute_id><![CDATA[${attributeId}]]></product_attribute_id>
                    <product_quantity><![CDATA[${achat.quantite}]]></product_quantity>
                    <product_name><![CDATA[${prodName}]]></product_name>
                    <product_reference><![CDATA[${achat.reference}]]></product_reference>
                    <product_price><![CDATA[${currentItemPriceHt.toFixed(6)}]]></product_price>
                    <unit_price_tax_incl><![CDATA[${currentItemPriceTtc.toFixed(6)}]]></unit_price_tax_incl>
                    <unit_price_tax_excl><![CDATA[${currentItemPriceHt.toFixed(6)}]]></unit_price_tax_excl>
                </order_row>`;
            }

            let formattedDate = new Date().toISOString().slice(0, 10);
            if (dateRaw) {
                const parts = dateRaw.split('/');
                if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            if (!cartRowsXml) {
                logCallback('warn', `Panier vide pour la ligne ${index + 1}, ignorée.`);
                continue;
            }

            const cartPayload = `<?xml version="1.0" encoding="UTF-8"?>
            <prestashop><cart>
                <id_customer><![CDATA[${customerId}]]></id_customer><id_address_delivery><![CDATA[${addressId}]]></id_address_delivery>
                <id_address_invoice><![CDATA[${addressId}]]></id_address_invoice><id_currency><![CDATA[1]]></id_currency>
                <id_lang><![CDATA[1]]></id_lang><associations><cart_rows>${cartRowsXml}</cart_rows></associations>
            </cart></prestashop>`;
            const newCartResp = await postXml('/carts', cartPayload);
            const cartId = extractId(newCartResp?.prestashop?.cart?.id);

            if (!etatRaw || etatRaw === '') {
                logCallback('warn', `Ligne ${index + 1} : Panier Abandonné #${cartId} conservé.`);
                continue;
            }

            const orderStateId = (etatRaw.includes('accept') || etatRaw.includes('pay')) ? 2 : 6;
            const orderRef = generateOrderReference();

            const orderPayload = `<?xml version="1.0" encoding="UTF-8"?>
            <prestashop><order>
                <id_address_delivery><![CDATA[${addressId}]]></id_address_delivery>
                <id_address_invoice><![CDATA[${addressId}]]></id_address_invoice>
                <id_cart><![CDATA[${cartId}]]></id_cart>
                <id_currency><![CDATA[1]]></id_currency><id_lang><![CDATA[1]]></id_lang>
                <id_customer><![CDATA[${customerId}]]></id_customer><id_carrier><![CDATA[1]]></id_carrier>
                <id_shop_group><![CDATA[1]]></id_shop_group><id_shop><![CDATA[1]]></id_shop>
                <current_state><![CDATA[${orderStateId}]]></current_state>
                <reference><![CDATA[${orderRef}]]></reference>
                <module><![CDATA[ps_cashondelivery]]></module>
                <payment><![CDATA[Paiement à la livraison]]></payment>
                
                <total_paid><![CDATA[${totalPaidTtc.toFixed(6)}]]></total_paid>
                <total_paid_real><![CDATA[${orderStateId === 2 ? totalPaidTtc.toFixed(6) : '0.000000'}]]></total_paid_real>
                <total_products><![CDATA[${totalPaidHt.toFixed(6)}]]></total_products>
                <total_products_wt><![CDATA[${totalPaidTtc.toFixed(6)}]]></total_products_wt>
                
                <total_shipping><![CDATA[0.000000]]></total_shipping>
                <total_shipping_tax_incl><![CDATA[0.000000]]></total_shipping_tax_incl>
                <total_shipping_tax_excl><![CDATA[0.000000]]></total_shipping_tax_excl>
                <total_discounts><![CDATA[0.000000]]></total_discounts>
                <total_wrapping><![CDATA[0.000000]]></total_wrapping>

                <conversion_rate><![CDATA[1.000000]]></conversion_rate>
                <date_add><![CDATA[${formattedDate} 12:00:00]]></date_add>
                <date_upd><![CDATA[${formattedDate} 12:00:00]]></date_upd>
                <associations><order_rows>${orderRowsXml}</order_rows></associations>
            </order></prestashop>`;

            const newOrderResp = await postXml('/orders', orderPayload);
            const orderId = extractId(newOrderResp?.prestashop?.order?.id);

            if (orderId) {
                for (const line of linesToDecrement) {
                    await decrementStock(line.pId, line.attributeId, line.quantity, orderId, employeeId, logCallback);
                }
                logCallback('success', `Commande ID ${orderId} importée avec détails et totaux.`);
            } else {
                logCallback('error', `Échec de création de la commande à la ligne ${index + 1}. Suppression du panier fantôme.`);
                try {
                    await deleteXml(`/carts/${cartId}`);
                } catch (delErr) {
                    logCallback('warn', `Impossible de supprimer le panier fantôme ${cartId} : ${formatApiError(delErr)}`);
                }
            }
        }
        logCallback('success', 'Importation terminée !');
    } catch (error) {
        logCallback('error', `Erreur critique : ${formatApiError(error)}`);
        await rollbackOrders(logCallback);
    }
};