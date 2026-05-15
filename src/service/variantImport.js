import { getXml, postXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';

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

export const processVariantImport = async (data, logCallback) => {
  const optionGroupCache = {};
  const optionValueCache = {};
  const parentProductCache = {};
  const taxRateCache = {};

  try {
    for (const [index, row] of data.entries()) {
      logCallback('info', `Importation de la ligne ${index + 1} (Ref: ${row.reference || '?'})...`);
      
      const reference = row.reference?.trim();
      const specificite = row.specificité?.trim();
      const karazany = row.karazany?.trim();
      const stockInitialRaw = row.stock_initial || '0';
      const stockInitial = parseInt(stockInitialRaw, 10);
      
      if (!reference || !specificite || !karazany) {
        logCallback('error', `Ligne ${index + 1} ignorée : données incomplètes.`);
        continue;
      }

      // 1. Trouver le produit parent
      let parentProductId = null;
      let parentProductPrice = 0;
      let parentTaxGroupId = null;

      if (parentProductCache[reference]) {
        parentProductId = parentProductCache[reference].id;
        parentProductPrice = parentProductCache[reference].price;
        parentTaxGroupId = parentProductCache[reference].taxGroupId;
      } else {
        const prodResp = await getXml(`/products?filter[reference]=[${encodeURIComponent(reference)}]&display=[id,price,id_tax_rules_group]`);
        if (prodResp && prodResp.prestashop && prodResp.prestashop.products && prodResp.prestashop.products.product) {
           let prods = prodResp.prestashop.products.product;
           if (!Array.isArray(prods)) prods = [prods];
           parentProductId = prods[0].id;
           parentProductPrice = parseFloat(prods[0].price || 0);
           const taxGroupIdNode = prods[0].id_tax_rules_group;
           let extractedTaxGroupId = (typeof taxGroupIdNode === 'object' && taxGroupIdNode !== null) ? taxGroupIdNode['#text'] : taxGroupIdNode;
           if (!extractedTaxGroupId) extractedTaxGroupId = '0';
           parentTaxGroupId = extractedTaxGroupId;
           parentProductCache[reference] = { id: parentProductId, price: parentProductPrice, taxGroupId: parentTaxGroupId };
        } else {
           logCallback('error', `Produit parent introuvable pour la référence ${reference}.`);
           continue;
        }
      }

      let taxRate = 0;
      if (parentTaxGroupId && taxRateCache[parentTaxGroupId]) {
        taxRate = taxRateCache[parentTaxGroupId];
      } else if (parentTaxGroupId && parentTaxGroupId !== '0') {
        logCallback('info', `Recherche du taux de taxe pour le groupe ${parentTaxGroupId}...`);
        try {
          const taxRulesResp = await getXml(`/tax_rules?filter[id_tax_rules_group]=[${parentTaxGroupId}]&display=[id,id_tax]`);
          if (taxRulesResp && taxRulesResp.prestashop && taxRulesResp.prestashop.tax_rules && taxRulesResp.prestashop.tax_rules.tax_rule) {
            const rules = Array.isArray(taxRulesResp.prestashop.tax_rules.tax_rule) ? taxRulesResp.prestashop.tax_rules.tax_rule : [taxRulesResp.prestashop.tax_rules.tax_rule];
            if (rules.length > 0) {
              const taxId = rules[0].id_tax;
              const taxResp = await getXml(`/taxes/${taxId}?display=[rate]`);
              if (taxResp && taxResp.prestashop && taxResp.prestashop.tax) {
                const rate = parseFloat(taxResp.prestashop.tax.rate);
                taxRate = rate;
                taxRateCache[parentTaxGroupId] = rate;
                logCallback('info', `Taux de taxe trouvé: ${rate}%`);
              }
            }
          }
        } catch (e) {
          logCallback('error', `Impossible de récupérer le taux de taxe pour le groupe ${parentTaxGroupId}: ${e.message}`);
        }
      }

      const priceRaw = row.prix_vente_ttc ? row.prix_vente_ttc.replace(',', '.') : '0';
      const priceTTC = parseFloat(priceRaw) || 0;
      const priceHT = priceTTC > 0 ? priceTTC / (1 + (taxRate / 100)) : 0;

      // Calcul de l'impact de prix (impact sur le prix HT)
      let priceImpact = priceHT > 0 ? (priceHT - parentProductPrice) : 0;

      // 2. Trouver ou créer le groupe d'attributs (product_options)
      let optionGroupId = null;
      const optGroupKey = specificite.toLowerCase();
      if (optionGroupCache[optGroupKey]) {
        optionGroupId = optionGroupCache[optGroupKey];
      } else {
        const optGrpResp = await getXml(`/product_options?filter[name]=[${encodeURIComponent(specificite)}]&display=[id]`);
        if (optGrpResp && optGrpResp.prestashop && optGrpResp.prestashop.product_options && optGrpResp.prestashop.product_options.product_option) {
           let grps = optGrpResp.prestashop.product_options.product_option;
           if (!Array.isArray(grps)) grps = [grps];
           optionGroupId = grps[0].id;
        } else {
           logCallback('info', `Création du groupe d'attributs "${specificite}"...`);
           const optGrpPayload = {
             prestashop: {
               product_option: {
                 is_color_group: 0,
                 group_type: 'select',
                 name: { language: { '@_id': '1', '#text': specificite } },
                 public_name: { language: { '@_id': '1', '#text': specificite } }
               }
             }
           };
           const createGrpResp = await postXml('/product_options', optGrpPayload);
           optionGroupId = createGrpResp.prestashop.product_option.id;
        }
        optionGroupCache[optGroupKey] = optionGroupId;
      }

      // 3. Trouver ou créer la valeur d'attribut (product_option_values)
      let optionValueId = null;
      const optValKey = `${optionGroupId}_${karazany.toLowerCase()}`;
      if (optionValueCache[optValKey]) {
        optionValueId = optionValueCache[optValKey];
      } else {
        const optValResp = await getXml(`/product_option_values?filter[id_attribute_group]=[${optionGroupId}]&filter[name]=[${encodeURIComponent(karazany)}]&display=[id]`);
        if (optValResp && optValResp.prestashop && optValResp.prestashop.product_option_values && optValResp.prestashop.product_option_values.product_option_value) {
           let vals = optValResp.prestashop.product_option_values.product_option_value;
           if (!Array.isArray(vals)) vals = [vals];
           optionValueId = vals[0].id;
        } else {
           logCallback('info', `Création de la valeur d'attribut "${karazany}"...`);
           const optValPayload = {
             prestashop: {
               product_option_value: {
                 id_attribute_group: optionGroupId,
                 name: { language: { '@_id': '1', '#text': karazany } }
               }
             }
           };
           const createValResp = await postXml('/product_option_values', optValPayload);
           optionValueId = createValResp.prestashop.product_option_value.id;
        }
        optionValueCache[optValKey] = optionValueId;
      }

      // 4. Créer la déclinaison (combination)
      logCallback('info', `Création de la déclinaison pour le produit ${reference}...`);
      // La quantité de stock est maintenant incluse directement ici
      const combinationPayload = {
        prestashop: {
          combination: {
            id_product: parentProductId,
            reference: `${reference}_${karazany}`,
            price: priceImpact.toFixed(6),
            minimal_quantity: 1,
            quantity: stockInitial, // <-- Le stock est ajouté ici
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
      
      const createCombResp = await postXml('/combinations', combinationPayload);

      logCallback('success', `Ligne ${index + 1} (${karazany}) importée avec succès.`);
    }
    
    logCallback('success', 'Import des variations terminé avec succès !');
  } catch (error) {
    const apiError = error.response?.data || error.message;
    logCallback('error', `Erreur lors de l'import des variations : ${error.message}`);
    logCallback('error', `Détails de l'API : ${apiError}`);
    logCallback('error', 'Annulation de l\'opération et lancement de la réinitialisation (Rollback)...');
    await rollbackDeclinaison(logCallback);
  }
};
