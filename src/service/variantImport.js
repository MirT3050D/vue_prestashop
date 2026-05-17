import { getXml, postXml, putXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';

// ============================================================================
// CONFIGURATION DU ROLLBACK
// ============================================================================
export const resetDeclinaisonTargets = [
  { key: 'combinations', label: 'Combinaisons (Déclinaisons)', endpoint: '/combinations', collectionKey: 'combinations', itemKey: 'combination', skipIds: [] },
  { key: 'product_option_values', label: 'Valeurs d\'attributs', endpoint: '/product_option_values', collectionKey: 'product_option_values', itemKey: 'product_option_value', skipIds: [] },
  { key: 'product_options', label: 'Groupes d\'attributs', endpoint: '/product_options', collectionKey: 'product_options', itemKey: 'product_option', skipIds: [] }
];

export const rollbackDeclinaison = async (logCallback) => {
  logCallback('info', 'Lancement de la réinitialisation des déclinaisons (Sécurité)...');
  await runResetForTargets(resetDeclinaisonTargets, (type, message) => logCallback(type, `Rollback Déclinaison: ${message}`));
};

function extractId(node) {
  if (!node) return null;
  if (typeof node === 'object') return String(node['#text'] || node['@_id'] || node.id || '');
  return String(node);
}

function getLangText(field) {
  if (!field || !field.language) return 'Produit importé';
  if (Array.isArray(field.language)) return field.language[0]['#text'];
  return field.language['#text'];
}

// ============================================================================
// SUPER-FONCTION CORRIGÉE (UNIQUEMENT LES COLONNES EXISTANTES DANS MYSQL)
// ============================================================================
async function forceStockMovement(parentProductId, attributeId, employeeId, reasonId, delta, sign, dateAdd, logCallback) {
  if (logCallback) logCallback('info', `[DEBUG] 🔍 Sauvegarde du mouvement pour ID Prod: ${parentProductId}`);

  // Sécurité absolue : On ne met QUE des colonnes qui existent sur ton DESC ps_stock_mvt !
  // On stocke id_product dans id_order, et id_product_attribute dans id_supply_order
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
    const postPayload = `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop><stock_mvt>${baseXml}</stock_mvt></prestashop>`;
    await postXml('/stock_movements', postPayload);
    if (logCallback) logCallback('success', `[DEBUG] 🎯 Mouvement tracé avec succès dans id_order (${parentProductId}).`);
  } catch (error) {
    if (logCallback) logCallback('error', `[DEBUG] ❌ Erreur d'écriture mouvement : ${error.message}`);
  }
}

// ============================================================================
// FONCTION PRINCIPALE D'IMPORT
// ============================================================================
export const processVariantImport = async (data, logCallback) => {
  const optionCache = {};
  const optionValueCache = {};
  const employeeId = 1;

  if (data && data.length > 0) {
    data = data.map(row => {
      const newRow = {};
      for (const key in row) newRow[key.trim().toLowerCase()] = row[key];
      return newRow;
    });
  } else {
    logCallback('warn', 'Le fichier CSV des variations est vide.');
    return;
  }

  try {
    for (const [index, row] of data.entries()) {
      if (!row.reference || String(row.reference).trim() === '') continue;

      const reference = String(row.reference).trim();
      const specificite = row['specificité'] ? String(row['specificité']).trim() : '';
      const karazany = row.karazany ? String(row.karazany).trim() : '';

      logCallback('info', `--- Traitement Ligne ${index + 1} (Réf: ${reference}) ---`);

      const stockRaw = row.stock_initial ? String(row.stock_initial).trim() : '';
      let stockInitial = stockRaw !== '' ? parseInt(stockRaw, 10) : 0;
      let prixVenteTTC = row.prix_vente_ttc ? parseFloat(String(row.prix_vente_ttc).replace(',', '.')) : 0;

      const productSearch = await getXml(`/products?filter[reference]=[${reference}]&display=[id,price,name]`);
      let parentProduct = productSearch?.prestashop?.products?.product;
      if (!parentProduct) continue;
      if (Array.isArray(parentProduct)) parentProduct = parentProduct[0];

      const parentProductId = extractId(parentProduct.id);
      const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // ========================================================================
      // CAS 1 : PRODUIT SIMPLE
      // ========================================================================
      if (!specificite || !karazany) {
        if (stockRaw !== '') {
          try {
            const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[0]&display=full`);
            let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

            if (stockAvailable) {
              if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];
              const oldQty = parseInt(stockAvailable.quantity['#text'] || stockAvailable.quantity, 10) || 0;
              const delta = stockInitial - oldQty;

              stockAvailable.quantity = stockInitial;
              await putXml(`/stock_availables/${extractId(stockAvailable.id)}`, { prestashop: { stock_available: stockAvailable } });

              if (delta !== 0) {
                const sign = delta > 0 ? 1 : -1;
                const reasonId = delta > 0 ? 11 : 12;
                // CORRECTION : On passe bien logCallback à la fin !
                await forceStockMovement(parentProductId, 0, employeeId, reasonId, delta, sign, dateAdd, logCallback);
              }
              logCallback('success', `Stock du produit simple ${reference} mis à jour.`);
            }
          } catch (stockErr) {
            logCallback('error', `Erreur stock produit simple ${reference} : ${stockErr.message}`);
          }
        }
        continue;
      }

      // ========================================================================
      // CAS 2 : PRODUIT AVEC DÉCLINAISONS
      // ========================================================================
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

      const priceImpact = prixVenteTTC > 0 ? prixVenteTTC - (parseFloat(parentProduct.price) || 0) : 0;
      const newCombResp = await postXml('/combinations', { prestashop: { combination: { id_product: parentProductId, reference: `${reference}_${karazany}`, price: priceImpact.toFixed(6), minimal_quantity: 1, associations: { product_option_values: { product_option_value: [{ id: optionValueId }] } } } } });
      const combinationId = extractId(newCombResp?.prestashop?.combination?.id);

      if (combinationId && stockRaw !== '') {
        try {
          const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[${combinationId}]&display=full`);
          let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

          if (stockAvailable) {
            if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];
            const oldQty = parseInt(stockAvailable.quantity['#text'] || stockAvailable.quantity, 10) || 0;
            const delta = stockInitial - oldQty;

            stockAvailable.quantity = stockInitial;
            await putXml(`/stock_availables/${extractId(stockAvailable.id)}`, { prestashop: { stock_available: stockAvailable } });

            if (delta !== 0) {
              const sign = delta > 0 ? 1 : -1;
              const reasonId = delta > 0 ? 11 : 12;
              // CORRECTION : On passe bien logCallback à la fin !
              await forceStockMovement(parentProductId, combinationId, employeeId, reasonId, delta, sign, dateAdd, logCallback);
            }
            logCallback('success', `Stock de la déclinaison (${karazany}) initialisé.`);
          }
        } catch (stockError) {
          logCallback('error', `Impossible de fixer le stock : ${stockError.message}`);
        }
      }
    }
    logCallback('success', 'Import des variations terminé avec succès !');
  } catch (error) {
    logCallback('error', `Erreur lors de l'import des variations : ${error.message}`);
    await rollbackDeclinaison(logCallback);
  }
};