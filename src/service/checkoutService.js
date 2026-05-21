import { extractText } from '@/service/prestashopUtils';
import { getXml, postXml, putXml, getPrestaShopConfig } from '@/service/api';
import { getStockAvailables } from '@/service/stockService';
import { getCustomerAddresses, createAddress } from '@/service/addressService';
import { createCart } from '@/service/cartService';
import { createOrder, getOrderStates, updateOrderStatusByHistory, getOrder } from '@/service/orderService';

/**
 * Finds the COD (Cash on Delivery) state ID.
 * First checks PS_OS_COD_VALIDATION config, then searches order states by module name or label.
 * Returns the state ID number.
 */
export async function findCodStateId() {
    try {
        const config = await getPrestaShopConfig('PS_OS_COD_VALIDATION');
        const configuredStateId = Number(extractText(config?.value));
        if (configuredStateId > 0) return configuredStateId;

        const states = await getOrderStates();
        if (!states) return 2;

        for (let i = 0; i < states.length; i++) {
            const moduleName = extractText(states[i].module_name).toLowerCase();
            if (moduleName === 'ps_cashondelivery') {
                return Number(extractText(states[i].id));
            }

            const langNode = states[i].name?.language;
            const langNodes = Array.isArray(langNode) ? langNode : (langNode ? [langNode] : []);
            const hasCodLabel = langNodes.some((node) => {
                const name = extractText(node).toLowerCase();
                return name.includes('cash on delivery') || name.includes('paiement a la livraison') || name.includes('paiement à la livraison') || name.includes('cashondelivery') || name.includes('livraison') || name.includes('cod');
            });

            if (hasCodLabel) return Number(extractText(states[i].id));
        }
    } catch (e) {
        console.log('Could not fetch order states for COD lookup:', e);
    }
    return 2;
}

/**
 * Validates all cart items have sufficient stock.
 * Returns { valid: true } or { valid: false, error: 'message' }.
 */
export async function validateCartStock(cartItems, getItemStockFn) {
    for (let i = 0; i < cartItems.length; i++) {
        const item = cartItems[i];
        const available = await getItemStockFn(item);
        const requested = Number(item.quantity) || 0;

        if (requested > available) {
            const name = item.name || `Produit #${item.id_product}`;
            return { valid: false, error: `Stock insuffisant pour ${name}. Disponible: ${available}, dans le panier: ${requested}.` };
        }
    }

    return { valid: true };
}

// ============================================================================
// LOGIQUE DE DÉCRÉMENTATION DE STOCK (Avec Hack pour StockEvolution.vue)
// ============================================================================
export async function forceUpdateStockAvailable(stockAvailable, newQty) {
    const stId = extractText(stockAvailable.id);
    const stProductId = extractText(stockAvailable.id_product);
    let stAttrId = extractText(stockAvailable.id_product_attribute);
    if (stAttrId === '') stAttrId = '0';
    const stShop = extractText(stockAvailable.id_shop) || '1';
    const stShopGroup = extractText(stockAvailable.id_shop_group) || '0';
    const stDepends = extractText(stockAvailable.depends_on_stock) || '0';
    const stOutOfStock = extractText(stockAvailable.out_of_stock) || '2';
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

export async function decrementStock(productId, attributeId, quantity, orderId) {
    try {
        const attrFilter = attributeId ? attributeId : 0;
        const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${productId}]&filter[id_product_attribute]=[${attrFilter}]&display=full`);
        let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

        if (stockAvailable) {
            if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];
            const oldQty = parseInt(extractText(stockAvailable.quantity), 10) || 0;
            const newQty = oldQty - quantity;

            await forceUpdateStockAvailable(stockAvailable, newQty);

            const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');

            // CORRECTION ICI : On utilise id_order et id_supply_order pour que StockEvolution.vue affiche le bon nom !
            const baseXml = `
                <id_order><![CDATA[${productId}]]></id_order>
                <id_supply_order><![CDATA[${attrFilter}]]></id_supply_order>
                <id_employee><![CDATA[1]]></id_employee>
                <id_stock><![CDATA[0]]></id_stock>
                <id_stock_mvt_reason><![CDATA[3]]></id_stock_mvt_reason>
                <physical_quantity><![CDATA[${quantity}]]></physical_quantity>
                <sign><![CDATA[0]]></sign>
                <price_te><![CDATA[0.000000]]></price_te>
                <date_add><![CDATA[${dateAdd}]]></date_add>
            `;
            await postXml('/stock_movements', `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop><stock_mvt>${baseXml}</stock_mvt></prestashop>`);
        }
    } catch (e) {
        console.warn(`[checkout] Erreur décrémentation: ${e.message}`);
    }
}

/**
 * Returns XML string for address creation.
 */
export function buildAddressXml(customerId, form) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${customerId}</id_customer>
    <id_country>8</id_country>
    <alias>${form.alias}</alias>
    <firstname>${form.firstname}</firstname>
    <lastname>${form.lastname}</lastname>
    <address1>${form.address1}</address1>
    <postcode>${form.postcode}</postcode>
    <city>${form.city}</city>
    <phone>${form.phone}</phone>
  </address>
</prestashop>`;
}

/**
 * Returns XML string for cart creation.
 */
export function buildCartXml(customerId, addressId, items) {
    let cartRowsXml = '';

    for (let i = 0; i < items.length; i++) {
        let item = items[i];
        cartRowsXml += `
      <cart_row>
        <id_product>${item.id_product}</id_product>
        <id_product_attribute>${item.id_product_attribute || 0}</id_product_attribute>
        <id_address_delivery>${addressId}</id_address_delivery>
        <quantity>${item.quantity}</quantity>
      </cart_row>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <id_customer>${customerId}</id_customer>
    <id_address_delivery>${addressId}</id_address_delivery>
    <id_address_invoice>${addressId}</id_address_invoice>
    <associations>
      <cart_rows>${cartRowsXml}</cart_rows>
    </associations>
  </cart>
</prestashop>`;
}

/**
 * Returns XML string for order creation.
 */
export function buildOrderXml(cartId, customerId, addressId, items, stateId, totalHt) {
    let orderRowsXml = '';

    for (let i = 0; i < items.length; i++) {
        let item = items[i];
        const basePriceHt = Number(item.price || 0);

        orderRowsXml += `
        <order_row>
          <product_id>${item.id_product}</product_id>
          <product_attribute_id>${item.id_product_attribute || 0}</product_attribute_id>
          <product_quantity>${item.quantity}</product_quantity>
          <product_name><![CDATA[${item.name}]]></product_name>
          <product_reference><![CDATA[${item.reference || ''}]]></product_reference>
          <product_price>${basePriceHt.toFixed(6)}</product_price>
          <unit_price_tax_incl>${basePriceHt.toFixed(6)}</unit_price_tax_incl>
          <unit_price_tax_excl>${basePriceHt.toFixed(6)}</unit_price_tax_excl>
        </order_row>`;
    }

    const secureKey = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_cart>${cartId}</id_cart>
    <id_customer>${customerId}</id_customer>
    <id_address_delivery>${addressId}</id_address_delivery>
    <id_address_invoice>${addressId}</id_address_invoice>
    <id_carrier>1</id_carrier>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
        <id_shop>1</id_shop>
        <id_shop_group>1</id_shop_group>
        <module>ps_checkout</module>
        <secure_key>${secureKey}</secure_key>
    <payment>Paiement accepté / En ligne</payment>
        <total_paid>${totalHt.toFixed(6)}</total_paid>
        <total_paid_real>${totalHt.toFixed(6)}</total_paid_real>
        <total_products>${totalHt.toFixed(6)}</total_products>
        <total_products_wt>${totalHt.toFixed(6)}</total_products_wt>
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
        <current_state>${stateId}</current_state>
        <associations>
            <order_rows>${orderRowsXml}</order_rows>
        </associations>
  </order>
</prestashop>`;
}

/**
 * The full checkout flow: validates stock, creates/finds address, creates cart,
 * creates order, decrements stock.
 * Returns { success, orderId, error }.
 */
export async function processCheckout(customer, form, cartItems, codStateId) {
    try {
        let idAdresse = 0;

        try {
            const adresses = await getCustomerAddresses(customer.id);
            if (adresses.length > 0 && adresses[0].id) idAdresse = adresses[0].id;
        } catch (e) { }

        if (!idAdresse) {
            let adresseXml = buildAddressXml(customer.id, form);
            let adresseResp = await createAddress(adresseXml);
            idAdresse = adresseResp?.id || 0;
        }

        if (!idAdresse) {
            return { success: false, orderId: null, error: 'Impossible de créer l\'adresse. Vérifiez les champs.' };
        }

        let cartTotal = 0;
        for (let i = 0; i < cartItems.length; i++) {
            const basePriceHt = Number(cartItems[i].price || 0);
            cartTotal += basePriceHt * cartItems[i].quantity;
        }

        let cartXml = buildCartXml(customer.id, idAdresse, cartItems);
        let cartResp = await createCart(cartXml);
        let idCart = cartResp?.id || 0;

        if (!idCart) {
            return { success: false, orderId: null, error: 'Impossible de créer le panier. Veuillez réessayer.' };
        }

        let orderXml = buildOrderXml(idCart, customer.id, idAdresse, cartItems, codStateId, cartTotal);
        let orderResp = await createOrder(orderXml);
        let orderId = null;

        if (orderResp) {
            orderId = extractText(orderResp.id) || '?';
        }

        if (orderId && orderId !== '?') {
            const freshOrder = await getOrder(orderId);
            const currentStateAfterCreate = Number(extractText(freshOrder?.current_state));

            if (currentStateAfterCreate && currentStateAfterCreate !== Number(codStateId)) {
                await updateOrderStatusByHistory(String(orderId), String(codStateId));
            }

            // DÉCRÉMENTATION DE STOCK FORCÉE
            for (let i = 0; i < cartItems.length; i++) {
                let item = cartItems[i];
                await decrementStock(item.id_product, item.id_product_attribute || 0, item.quantity, orderId);
            }
        }

        return { success: true, orderId: orderId, error: null };

    } catch (err) {
        return { success: false, orderId: null, error: 'Une erreur est survenue lors de la commande. Veuillez réessayer.' };
    }
}
