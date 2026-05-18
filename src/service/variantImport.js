import { getXml, postXml, putXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';
import { resetTargets } from '@/service/resetTargets';
import { getProductTaxRate } from '@/service/price';

export const resetDeclinaisonTargets = [
  { key: 'combinations', label: 'Combinaisons (Déclinaisons)', endpoint: '/combinations', collectionKey: 'combinations', itemKey: 'combination', skipIds: [] },
  { key: 'product_option_values', label: 'Valeurs d\'attributs', endpoint: '/product_option_values', collectionKey: 'product_option_values', itemKey: 'product_option_value', skipIds: [] },
  { key: 'product_options', label: 'Groupes d\'attributs', endpoint: '/product_options', collectionKey: 'product_options', itemKey: 'product_option', skipIds: [] }
];

export const rollbackDeclinaison = async (logCallback) => {
  logCallback('info', 'Lancement de la réinitialisation des déclinaisons...');
  await runResetForTargets(resetDeclinaisonTargets, (type, message) => logCallback(type, `Rollback Déclinaison: ${message}`));
};

function extractId(node) {
  if (node === undefined || node === null) return '';
  if (typeof node === 'object') return String(node['#text'] || node['@_id'] || node.id || '');
  return String(node);
}

function formatApiError(error) {
  let msg = error.message;
  if (error.response?.data) {
    const dataStr = typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : String(error.response.data);
    msg += ` | Détail : ${dataStr.substring(0, 200)}`;
  }
  return msg;
}

// ----------------------------------------------------------------------------
// FONCTIONS API
// ----------------------------------------------------------------------------
async function forceUpdateStockAvailable(stockAvailable, valueToSend) {
  const stId = extractId(stockAvailable.id);
  const stProductId = extractId(stockAvailable.id_product);
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
      <quantity><![CDATA[${valueToSend}]]></quantity> 
      <depends_on_stock><![CDATA[${stDepends}]]></depends_on_stock>
      <out_of_stock><![CDATA[${stOutOfStock}]]></out_of_stock>
      <location><![CDATA[${stLocation}]]></location>
  </stock_available></prestashop>`;

  await putXml(`/stock_availables/${stId}`, stockXml);
}

async function forceStockMovement(parentProductId, attributeId, employeeId, reasonId, delta, sign, dateAdd, logCallback) {
  // RESTAURATION DU HACK : Utilisation de id_order et id_supply_order pour que StockEvolution.vue retrouve les noms !
  const baseXml = `
      <id_order><![CDATA[${parentProductId}]]></id_order>
      <id_supply_order><![CDATA[${attributeId}]]></id_supply_order>
      <id_employee><![CDATA[${employeeId}]]></id_employee>
      <id_stock><![CDATA[0]]></id_stock>
      <id_stock_mvt_reason><![CDATA[${reasonId}]]></id_stock_mvt_reason>
      <physical_quantity><![CDATA[${Math.abs(delta)}]]></physical_quantity>
      <sign><![CDATA[${sign}]]></sign>
      <price_te><![CDATA[0.000000]]></price_te>
      <date_add><![CDATA[${dateAdd}]]></date_add>
  `;
  try {
    await postXml('/stock_movements', `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop><stock_mvt>${baseXml}</stock_mvt></prestashop>`);
  } catch (error) {
    if (logCallback) logCallback('warn', `Erreur historique stock : ${formatApiError(error)}`);
  }
}

// ----------------------------------------------------------------------------
// TRAITEMENT GLOBAL DES VARIATIONS
// ----------------------------------------------------------------------------
export const processVariantImport = async (data, logCallback) => {
  const optionCache = {};
  const optionValueCache = {};
  const employeeId = 1;

  if (!data || data.length === 0) return;
  data = data.map(row => { const newRow = {}; for (const key in row) newRow[key.trim().toLowerCase()] = row[key]; return newRow; });

  try {
    for (const row of data) {
      if (!row.reference || String(row.reference).trim() === '') continue;

      const reference = String(row.reference).trim();
      const specificite = row['specificité'] ? String(row['specificité']).trim() : '';
      const karazany = row.karazany ? String(row.karazany).trim() : '';
      const stockRaw = row.stock_initial ? String(row.stock_initial).trim() : '';

      let stockInitial = stockRaw !== '' ? parseInt(stockRaw, 10) : 0;
      let prixVenteTTC = row.prix_vente_ttc ? parseFloat(String(row.prix_vente_ttc).replace(',', '.')) : 0;

      const productSearch = await getXml(`/products?filter[reference]=[${reference}]&display=[id,price,name]`);
      let parentProduct = productSearch?.prestashop?.products?.product;
      if (!parentProduct) continue;
      if (Array.isArray(parentProduct)) parentProduct = parentProduct[0];

      const parentProductId = extractId(parentProduct.id);
      const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');

      if (!specificite || !karazany) {
        if (stockRaw !== '') {
          try {
            const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[0]&display=full`);
            let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

            if (stockAvailable) {
              if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];
              const oldQty = parseInt(extractId(stockAvailable.quantity), 10) || 0;
              const delta = stockInitial - oldQty;

              await forceUpdateStockAvailable(stockAvailable, stockInitial);

              if (delta !== 0) {
                const sign = delta > 0 ? 1 : -1;
                const reasonId = delta > 0 ? 11 : 12;
                await forceStockMovement(parentProductId, 0, employeeId, reasonId, delta, sign, dateAdd, logCallback);
              }
              logCallback('success', `Stock du produit simple ${reference} mis à jour à ${stockInitial}.`);
            }
          } catch (stockErr) {
            logCallback('error', `Erreur stock produit simple ${reference} : ${formatApiError(stockErr)}`);
          }
        }
        continue;
      }

      let optionId = optionCache[specificite];
      if (!optionId) {
        const optSearch = await getXml(`/product_options?filter[name]=[${specificite}]&display=[id]`);
        let opt = optSearch?.prestashop?.product_options?.product_option;
        if (opt) optionId = extractId(Array.isArray(opt) ? opt[0].id : opt.id);
        else {
          const newOpt = await postXml('/product_options', { prestashop: { product_option: { is_color_group: 0, group_type: 'select', name: { language: { '@_id': '1', '#text': specificite } }, public_name: { language: { '@_id': '1', '#text': specificite } } } } });
          optionId = extractId(newOpt?.prestashop?.product_option?.id);
        }
        optionCache[specificite] = optionId;
      }

      const optValKey = `${optionId}_${karazany}`;
      let optionValueId = optionValueCache[optValKey];
      if (!optionValueId) {
        const valSearch = await getXml(`/product_option_values?filter[id_attribute_group]=[${optionId}]&filter[name]=[${karazany}]&display=[id]`);
        let val = valSearch?.prestashop?.product_option_values?.product_option_value;
        if (val) optionValueId = extractId(Array.isArray(val) ? val[0].id : val.id);
        else {
          const newVal = await postXml('/product_option_values', { prestashop: { product_option_value: { id_attribute_group: optionId, name: { language: { '@_id': '1', '#text': karazany } } } } });
          optionValueId = extractId(newVal?.prestashop?.product_option_value?.id);
        }
        optionValueCache[optValKey] = optionValueId;
      }

      // Calcul du prix HT de la variante et de l'impact
      let priceImpact = 0;
      if (prixVenteTTC > 0) {
        try {
          const parentTaxRate = await getProductTaxRate(parentProductId);
          // Convertir le TTC en HT : HT = TTC / (1 + taxRate / 100)
          const prixVenteHT = prixVenteTTC / (1 + (parentTaxRate / 100));
          const parentPriceHT = parseFloat(parentProduct.price) || 0;
          priceImpact = prixVenteHT - parentPriceHT;
        } catch (e) {
          logCallback('warn', `Impossible de récupérer le taux de taxe pour la variante ${reference}_${karazany}, impact=0`);
          priceImpact = 0;
        }
      }
      const newCombResp = await postXml('/combinations', { prestashop: { combination: { id_product: parentProductId, reference: `${reference}_${karazany}`, price: priceImpact.toFixed(6), minimal_quantity: 1, associations: { product_option_values: { product_option_value: [{ id: optionValueId }] } } } } });
      const combinationId = extractId(newCombResp?.prestashop?.combination?.id);

      if (combinationId && stockRaw !== '') {
        try {
          const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[${combinationId}]&display=full`);
          let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

          if (stockAvailable) {
            if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];
            const oldQty = parseInt(extractId(stockAvailable.quantity), 10) || 0;
            const delta = stockInitial - oldQty;

            await forceUpdateStockAvailable(stockAvailable, stockInitial);

            if (delta !== 0) {
              const sign = delta > 0 ? 1 : -1;
              const reasonId = delta > 0 ? 11 : 12;
              await forceStockMovement(parentProductId, combinationId, employeeId, reasonId, delta, sign, dateAdd, logCallback);
            }
            logCallback('success', `Stock de la déclinaison (${karazany}) synchronisé (${stockInitial} unités).`);
          }
        } catch (stockError) {
          logCallback('error', `Impossible de fixer le stock : ${formatApiError(stockError)}`);
        }
      }
    }
    logCallback('success', 'Import des variations terminé avec succès !');
  } catch (error) {
    logCallback('error', `Erreur lors de l'import des variations : ${formatApiError(error)}`);
    // Rollback global pour annuler tous les imports (produits, déclinaisons, commandes, images, ...)
    try {
      await runResetForTargets(resetTargets, (type, message) => logCallback(type, `Rollback global: ${message}`));
    } catch (e) {
      logCallback('warn', `Échec du rollback global : ${e?.message ?? e}`);
    }
  }
};