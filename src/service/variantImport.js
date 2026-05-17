import { getXml, postXml, putXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';

// ============================================================================
// CONFIGURATION DU ROLLBACK
// ============================================================================
export const resetDeclinaisonTargets = [
  {
    key: 'combinations',
    label: 'Combinaisons (Déclinaisons)',
    endpoint: '/combinations',
    collectionKey: 'combinations',
    itemKey: 'combination',
    skipIds: []
  },
  {
    key: 'product_option_values',
    label: 'Valeurs d\'attributs',
    endpoint: '/product_option_values',
    collectionKey: 'product_option_values',
    itemKey: 'product_option_value',
    skipIds: []
  },
  {
    key: 'product_options',
    label: 'Groupes d\'attributs',
    endpoint: '/product_options',
    collectionKey: 'product_options',
    itemKey: 'product_option',
    skipIds: []
  }
];

export const rollbackDeclinaison = async (logCallback) => {
  logCallback('info', 'Lancement de la réinitialisation des déclinaisons (Sécurité)...');
  await runResetForTargets(resetDeclinaisonTargets, (type, message) => {
    logCallback(type, `Rollback Déclinaison: ${message}`);
  });
  logCallback('info', 'Réinitialisation des déclinaisons terminée. L\'import a été annulé.');
};

// ============================================================================
// FONCTION PRINCIPALE D'IMPORT DES VARIATIONS
// ============================================================================
export const processImport = async (data, logCallback) => {
  const optionCache = {};
  const optionValueCache = {};
  const employeeId = 1; // Ton ID SuperAdmin Mir Rahajarijaona pour signer les mvts

  if (!data || data.length === 0) {
    logCallback('warn', 'Le fichier CSV des variations est vide.');
    return;
  }

  try {
    for (const [index, row] of data.entries()) {

      // Extraction et sécurisation des données du CSV
      const reference = row.reference ? String(row.reference).trim() : '';
      const specificite = row['specificité'] ? String(row['specificité']).trim() : '';
      const karazany = row.karazany ? String(row.karazany).trim() : '';

      const stockRaw = row.stock_initial ? String(row.stock_initial).trim() : '';
      const stockInitial = parseInt(stockRaw, 10) || 0;

      const prixRaw = row.prix_vente_ttc ? String(row.prix_vente_ttc).replace(',', '.') : '0';
      const prixVenteTTC = parseFloat(prixRaw) || 0;

      if (!reference) {
        logCallback('warn', `Ligne ${index + 1} ignorée : Référence du produit manquante.`);
        continue;
      }

      logCallback('info', `Traitement de la ligne ${index + 1} (Réf: ${reference})...`);

      // 1. Trouver le produit parent via sa référence
      const productSearch = await getXml(`/products?filter[reference]=[${reference}]&display=[id,price]`);
      let parentProduct = productSearch?.prestashop?.products?.product;

      if (!parentProduct) {
        logCallback('error', `Ligne ${index + 1} ignorée : Aucun produit parent trouvé pour la référence ${reference}.`);
        continue;
      }

      if (Array.isArray(parentProduct)) parentProduct = parentProduct[0];
      const parentProductId = parentProduct.id;

      // Génération de la date pour le log de mouvement
      const now = new Date();
      const dateAdd = now.toISOString().slice(0, 19).replace('T', ' ');

      // ========================================================================
      // CAS 1 : PRODUIT SIMPLE (Colonnes vides -> Stock Direct + Mouvement)
      // ========================================================================
      if (!specificite || !karazany) {
        logCallback('info', `Ligne ${index + 1} : Produit simple détecté (Réf: ${reference}).`);

        if (stockRaw !== '') {
          try {
            const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[0]&display=full`);
            let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

            if (stockAvailable) {
              if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];

              // Calcul du delta pour le mouvement de stock
              const oldQty = parseInt(stockAvailable.quantity['#text'] || stockAvailable.quantity, 10) || 0;
              const delta = stockInitial - oldQty;

              // Mise à jour de la quantité
              stockAvailable.quantity = stockInitial;
              await putXml(`/stock_availables/${stockAvailable.id}`, { prestashop: { stock_available: stockAvailable } });

              // Génération du mouvement de stock s'il y a un changement réel
              if (delta !== 0) {
                const sign = delta > 0 ? 1 : -1;
                const reasonId = delta > 0 ? 11 : 12;
                const movementXml = `<?xml version="1.0" encoding="UTF-8"?>
                         <prestashop>
                             <stock_mvt>
                                 <id_product>${parentProductId}</id_product>
                                 <id_product_attribute>0</id_product_attribute>
                                 <id_employee>${employeeId}</id_employee>
                                 <id_stock>0</id_stock>
                                 <id_stock_mvt_reason>${reasonId}</id_stock_mvt_reason>
                                 <physical_quantity>${Math.abs(delta)}</physical_quantity>
                                 <sign>${sign}</sign>
                                 <price_te>0.000000</price_te>
                                 <date_add>${dateAdd}</date_add>
                             </stock_mvt>
                         </prestashop>`;
                await postXml('/stock_movements', movementXml);
              }

              logCallback('success', `Stock du produit simple ${reference} mis à jour à ${stockInitial} (Mouvement tracé).`);
            }
          } catch (stockErr) {
            logCallback('error', `Erreur stock produit simple ${reference} : ${stockErr.message}`);
          }
        }
        continue;
      }

      // ========================================================================
      // CAS 2 : PRODUIT AVEC DÉCLINAISONS (Création Déclinaison + Stock + Mouvement)
      // ========================================================================

      // Calcul de l'impact sur le prix
      let priceImpact = 0;
      if (prixVenteTTC > 0) {
        const parentPriceHT = parseFloat(parentProduct.price) || 0;
        priceImpact = prixVenteTTC - parentPriceHT;
      }

      // 2. Création ou récupération du Groupe d'attributs (ex: "taille")
      let optionId = optionCache[specificite];
      if (!optionId) {
        const optSearch = await getXml(`/product_options?filter[name]=[${specificite}]&display=[id]`);
        let opt = optSearch?.prestashop?.product_options?.product_option;

        if (opt) {
          optionId = Array.isArray(opt) ? opt[0].id : opt.id;
        } else {
          const optPayload = {
            prestashop: {
              product_option: {
                is_color_group: 0,
                group_type: 'select',
                name: { language: { '@_id': '1', '#text': specificite } },
                public_name: { language: { '@_id': '1', '#text': specificite } }
              }
            }
          };
          const newOpt = await postXml('/product_options', optPayload);
          optionId = newOpt?.prestashop?.product_option?.id;
        }
        optionCache[specificite] = optionId;
      }

      // 3. Création ou récupération de la Valeur (ex: "ngoza")
      const optValKey = `${optionId}_${karazany}`;
      let optionValueId = optionValueCache[optValKey];
      if (!optionValueId) {
        const valSearch = await getXml(`/product_option_values?filter[id_attribute_group]=[${optionId}]&filter[name]=[${karazany}]&display=[id]`);
        let val = valSearch?.prestashop?.product_option_values?.product_option_value;

        if (val) {
          optionValueId = Array.isArray(val) ? val[0].id : val.id;
        } else {
          const valPayload = {
            prestashop: {
              product_option_value: {
                id_attribute_group: optionId,
                name: { language: { '@_id': '1', '#text': karazany } }
              }
            }
          };
          const newVal = await postXml('/product_option_values', valPayload);
          optionValueId = newVal?.prestashop?.product_option_value?.id;
        }
        optionValueCache[optValKey] = optionValueId;
      }

      // 4. Création de la déclinaison (combination)
      logCallback('info', `Création de la déclinaison pour le produit ${reference}...`);
      const combinationPayload = {
        prestashop: {
          combination: {
            id_product: parentProductId,
            reference: `${reference}_${karazany}`,
            price: priceImpact.toFixed(6),
            minimal_quantity: 1,
            associations: {
              product_option_values: {
                product_option_value: [{
                  id: optionValueId
                }]
              }
            }
          }
        }
      };

      const newCombResp = await postXml('/combinations', combinationPayload);
      const combinationId = newCombResp?.prestashop?.combination?.id;

      // Forçage du stock de la déclinaison + création du mouvement historique
      if (combinationId && stockRaw !== '') {
        logCallback('info', `Configuration du stock initial pour la déclinaison ID ${combinationId}...`);
        try {
          const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[${combinationId}]&display=full`);
          let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

          if (stockAvailable) {
            if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];

            // Extraction de l'ancienne quantité (généralement 0 à la création d'une combinaison)
            const oldQty = parseInt(stockAvailable.quantity['#text'] || stockAvailable.quantity, 10) || 0;
            const delta = stockInitial - oldQty;

            stockAvailable.quantity = stockInitial;
            await putXml(`/stock_availables/${stockAvailable.id}`, {
              prestashop: { stock_available: stockAvailable }
            });

            // Génération du mouvement de stock associé
            if (delta !== 0) {
              const sign = delta > 0 ? 1 : -1;
              const reasonId = delta > 0 ? 11 : 12;
              const movementXml = `<?xml version="1.0" encoding="UTF-8"?>
                      <prestashop>
                          <stock_mvt>
                              <id_product>${parentProductId}</id_product>
                              <id_product_attribute>${combinationId}</id_product_attribute>
                              <id_employee>${employeeId}</id_employee>
                              <id_stock>0</id_stock>
                              <id_stock_mvt_reason>${reasonId}</id_stock_mvt_reason>
                              <physical_quantity>${Math.abs(delta)}</physical_quantity>
                              <sign>${sign}</sign>
                              <price_te>0.000000</price_te>
                              <date_add>${dateAdd}</date_add>
                          </stock_mvt>
                      </prestashop>`;
              await postXml('/stock_movements', movementXml);
            }

            logCallback('success', `Stock de la déclinaison (${karazany}) initialisé à ${stockInitial} (Mouvement tracé).`);
          }
        } catch (stockError) {
          logCallback('error', `Impossible de fixer le stock de la déclinaison : ${stockError.message}`);
        }
      }

      logCallback('success', `Ligne ${index + 1} (${karazany}) importée avec succès.`);
    }

    logCallback('success', 'Import des variations terminé avec succès !');
  } catch (error) {
    const apiError = error.response?.data || error.message;
    logCallback('error', `Erreur lors de l'import des variations : ${error.message}`);
    if (apiError) logCallback('error', `Détails de l'API : ${JSON.stringify(apiError)}`);

    logCallback('error', 'Annulation de l\'opération et lancement de la réinitialisation (Rollback)...');
    await rollbackDeclinaison(logCallback);
  }
};