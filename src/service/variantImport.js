import { getXml, postXml, putXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';

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
  if (error.response) {
    msg += ` (Statut HTTP: ${error.response.status})`;
    if (error.response.data) {
      const dataStr = typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : String(error.response.data);
      msg += ` | Détail API : ${dataStr.replace(/\n/g, '').substring(0, 500)}`;
    }
  }
  return msg;
}

// FIX #4 : Nettoyage robuste des valeurs numériques du CSV (guillemets + virgule)
function parseNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return parseFloat(String(value).replace(/['"]/g, '').replace(',', '.'));
}

// ----------------------------------------------------------------------------
// FONCTIONS API
// ----------------------------------------------------------------------------
async function forceUpdateStockAvailable(stockAvailable, absoluteQty) {
  // FIX #1 : On envoie la quantité ABSOLUE (pas un delta) dans le PUT
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
      <quantity><![CDATA[${absoluteQty}]]></quantity>
      <depends_on_stock><![CDATA[${stDepends}]]></depends_on_stock>
      <out_of_stock><![CDATA[${stOutOfStock}]]></out_of_stock>
      <location><![CDATA[${stLocation}]]></location>
  </stock_available></prestashop>`;

  await putXml(`/stock_availables/${stId}`, stockXml);
}

async function forceStockMovement(productId, attributeId, employeeId, reasonId, delta, sign, dateAdd, logCallback) {
  // FIX #3 : Utilisation des bons champs id_product / id_product_attribute
  const baseXml = `
      <id_product><![CDATA[${productId}]]></id_product>
      <id_product_attribute><![CDATA[${attributeId}]]></id_product_attribute>
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
    if (logCallback) logCallback('warn', `Erreur log mouvement : ${formatApiError(error)}`);
  }
}

// ----------------------------------------------------------------------------
// FONCTION PRINCIPALE
// ----------------------------------------------------------------------------
export const processVariantImport = async (data, logCallback) => {
  const optionCache = {};
  const optionValueCache = {};
  const employeeId = 1;

  if (!data || data.length === 0) return;
  data = data.map(row => {
    const newRow = {};
    for (const key in row) newRow[key.trim().toLowerCase()] = row[key];
    return newRow;
  });

  try {
    for (const [index, row] of data.entries()) {
      if (!row.reference || String(row.reference).trim() === '') continue;

      const reference = String(row.reference).trim();
      const specificite = row['specificité'] ? String(row['specificité']).trim() : '';

      // FIX #2 : Normalisation de la casse pour matcher les valeurs en base (ex: "ngoza" → "Ngoza")
      const karazanyRaw = row.karazany ? String(row.karazany).trim() : '';
      const karazany = karazanyRaw.charAt(0).toUpperCase() + karazanyRaw.slice(1).toLowerCase();

      const stockRaw = row.stock_initial ? String(row.stock_initial).trim() : '';
      // FIX #4 : Utilisation de parseNumber pour gérer guillemets et virgules
      const stockInitialParsed = parseNumber(stockRaw);
      let stockInitial = stockInitialParsed !== null ? stockInitialParsed : 0;

      const prixParsed = parseNumber(row.prix_vente_ttc);
      let prixVenteTTC = prixParsed !== null ? prixParsed : 0;

      const productSearch = await getXml(`/products?filter[reference]=[${reference}]&display=[id,price,name]`);
      let parentProduct = productSearch?.prestashop?.products?.product;
      if (!parentProduct) continue;
      if (Array.isArray(parentProduct)) parentProduct = parentProduct[0];

      const parentProductId = extractId(parentProduct.id);
      const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // ======================================================================
      // PRODUIT SIMPLE
      // ======================================================================
      if (!specificite || !karazany) {
        if (stockRaw !== '') {
          try {
            const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[0]&display=full`);
            let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

            if (stockAvailable) {
              if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];
              const stId = extractId(stockAvailable.id);
              const oldQty = parseInt(extractId(stockAvailable.quantity), 10) || 0;
              // FIX #1 : delta sert uniquement pour le mouvement, pas pour le PUT
              const delta = stockInitial - oldQty;

              logCallback('info', `🧪 [AUDIT SIMPLE] Produit: ${reference} (ID: ${parentProductId})`);
              logCallback('info', `🧪 [1] Stock Actuel (Base) : ${oldQty} | Cible (CSV) : ${stockInitial} | Delta : ${delta}`);

              // On envoie la valeur ABSOLUE au PUT
              await forceUpdateStockAvailable(stockAvailable, stockInitial);

              const check1 = await getXml(`/stock_availables/${stId}`);
              const qtyAfterPut = parseInt(extractId(check1?.prestashop?.stock_available?.quantity), 10) || 0;
              logCallback('info', `🧪 [2] Stock APRÈS le PUT : ${qtyAfterPut}`);

              if (delta !== 0) {
                const sign = delta > 0 ? 1 : -1;
                const reasonId = delta > 0 ? 11 : 12;
                await forceStockMovement(parentProductId, 0, employeeId, reasonId, delta, sign, dateAdd, logCallback);

                const check2 = await getXml(`/stock_availables/${stId}`);
                const qtyAfterPost = parseInt(extractId(check2?.prestashop?.stock_available?.quantity), 10) || 0;
                logCallback('info', `🧪 [3] Stock APRÈS le Mouvement (POST) : ${qtyAfterPost}`);
              }
            }
          } catch (stockErr) {
            logCallback('error', `Erreur stock ${reference} : ${formatApiError(stockErr)}`);
          }
        }
        continue;
      }

      // ======================================================================
      // PRODUIT AVEC DÉCLINAISONS
      // ======================================================================
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

      // FIX #2 : Recherche avec la valeur normalisée (ex: "Ngoza") pour éviter les doublons
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

      const priceImpact = prixVenteTTC > 0 ? prixVenteTTC - (parseFloat(parentProduct.price) || 0) : 0;
      const newCombResp = await postXml('/combinations', { prestashop: { combination: { id_product: parentProductId, reference: `${reference}_${karazany}`, price: priceImpact.toFixed(6), minimal_quantity: 1, associations: { product_option_values: { product_option_value: [{ id: optionValueId }] } } } } });
      const combinationId = extractId(newCombResp?.prestashop?.combination?.id);

      if (combinationId && stockRaw !== '') {
        try {
          const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[${combinationId}]&display=full`);
          let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

          if (stockAvailable) {
            if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];
            const stId = extractId(stockAvailable.id);
            const oldQty = parseInt(extractId(stockAvailable.quantity), 10) || 0;
            // FIX #1 : delta sert uniquement pour le mouvement
            const delta = stockInitial - oldQty;

            logCallback('info', `🧪 [AUDIT DÉCLINAISON] Produit: ${reference}_${karazany} (AttrID: ${combinationId})`);
            logCallback('info', `🧪 [1] Stock Actuel (Base) : ${oldQty} | Cible (CSV) : ${stockInitial} | Delta : ${delta}`);

            // On envoie la valeur ABSOLUE au PUT
            await forceUpdateStockAvailable(stockAvailable, stockInitial);

            const check1 = await getXml(`/stock_availables/${stId}`);
            const qtyAfterPut = parseInt(extractId(check1?.prestashop?.stock_available?.quantity), 10) || 0;
            logCallback('info', `🧪 [2] Stock APRÈS le PUT : ${qtyAfterPut}`);

            if (delta !== 0) {
              const sign = delta > 0 ? 1 : -1;
              const reasonId = delta > 0 ? 11 : 12;
              await forceStockMovement(parentProductId, combinationId, employeeId, reasonId, delta, sign, dateAdd, logCallback);

              const check2 = await getXml(`/stock_availables/${stId}`);
              const qtyAfterPost = parseInt(extractId(check2?.prestashop?.stock_available?.quantity), 10) || 0;
              logCallback('info', `🧪 [3] Stock APRÈS le Mouvement (POST) : ${qtyAfterPost}`);
            }
            logCallback('success', `Fin du traitement pour ${karazany}.`);
          }
        } catch (stockError) {
          logCallback('error', `Impossible de fixer le stock : ${formatApiError(stockError)}`);
        }
      }
    }
    logCallback('success', 'Import des variations terminé !');
  } catch (error) {
    logCallback('error', `Erreur globale : ${formatApiError(error)}`);
    await rollbackDeclinaison(logCallback);
  }
};