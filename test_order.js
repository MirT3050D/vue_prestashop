const axios = require('axios');
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_cart>53</id_cart>
    <id_customer>2</id_customer>
    <id_address_delivery>5</id_address_delivery>
    <id_address_invoice>5</id_address_invoice>
    <id_carrier>1</id_carrier>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <id_shop>1</id_shop>
    <id_shop_group>1</id_shop_group>
    <module>ps_cashondelivery</module>
    <payment>Paiement à la livraison</payment>
    <total_paid>15.000000</total_paid>
    <total_paid_real>15.000000</total_paid_real>
    <total_paid_tax_incl>15.000000</total_paid_tax_incl>
    <total_paid_tax_excl>15.000000</total_paid_tax_excl>
    <total_products>15.000000</total_products>
    <total_products_wt>15.000000</total_products_wt>
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
    <current_state>10</current_state>
  </order>
</prestashop>`;

axios.post('http://localhost:8080/prestashop_edition_classic_version_8.2.6/api/orders', xml, {
  headers: { 'Content-Type': 'application/xml' },
  auth: { username: '4TL3WHGWM1LYH3QMDN2ZMXLY7IGUXK5N', password: '' }
}).then(res => console.log('OK', res.data))
  .catch(err => console.log('ERROR', err.response.status, err.response.data));
