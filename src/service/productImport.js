import { getXml, postXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';
import { resetTargets } from '@/service/resetTargets';

export const rollbackProducts = async (logCallback) => {
  logCallback('info', 'Lancement de la réinitialisation des données (Sécurité)...');
  await runResetForTargets(resetTargets, (type, message) => {
    logCallback(type, `Rollback: ${message}`);
  });
  logCallback('info', 'Réinitialisation terminée. L\'import a été annulé.');
};

export const processImport = async (data, logCallback) => {
  const categoryCache = {};
  const taxCache = {};

  try {
    for (const [index, row] of data.entries()) {
      logCallback('info', `Importation de la ligne ${index + 1} (${row.nom || 'Sans nom'})...`);
      
      // Calculate Price HT
      const priceRaw = row.prix_ttc ? row.prix_ttc.replace(',', '.') : '0';
      const priceTTC = parseFloat(priceRaw) || 0;
      
      const taxRaw = row.Taxe ? row.Taxe.replace('%', '').replace(',', '.') : '0';
      const taxRate = parseFloat(taxRaw) || 0;
      
      const priceHT = priceTTC / (1 + (taxRate / 100));

      // Resolve Tax Rules Group
      let taxRulesGroupId = 0; // Default to no tax
      if (taxRate > 0) {
        const taxName = `TVA ${taxRate}`;
        if (taxCache[taxName]) {
          taxRulesGroupId = taxCache[taxName];
        } else {
          logCallback('info', `Recherche de la règle de taxe "${taxName}"...`);
          try {
            const searchResp = await getXml(`/tax_rule_groups?filter[name]=[${encodeURIComponent(taxName)}]&display=[id,name]`);
            let foundId = null;
            if (searchResp && searchResp.prestashop && searchResp.prestashop.tax_rule_groups && searchResp.prestashop.tax_rule_groups.tax_rule_group) {
              let groups = searchResp.prestashop.tax_rule_groups.tax_rule_group;
              if (!Array.isArray(groups)) groups = [groups];
              foundId = groups[0].id;
            }

            if (foundId) {
              taxRulesGroupId = foundId;
              taxCache[taxName] = taxRulesGroupId;
            } else {
              logCallback('info', `Création de la règle de taxe "${taxName}"...`);
              
              // 1. Create Tax
              const taxPayload = { prestashop: { tax: { rate: taxRate, active: 1, name: { language: { '@_id': '1', '#text': taxName } } } } };
              const taxResp = await postXml('/taxes', taxPayload);
              const taxId = taxResp.prestashop.tax.id;

              // 2. Create Tax Rules Group
              const groupPayload = { prestashop: { tax_rule_group: { name: taxName, active: 1 } } };
              const groupResp = await postXml('/tax_rule_groups', groupPayload);
              taxRulesGroupId = groupResp.prestashop.tax_rule_group.id;
              
              // 3. Create Tax Rule
              const rulePayload = { prestashop: { tax_rule: { id_tax_rules_group: taxRulesGroupId, id_country: 8, id_tax: taxId, behavior: 0 } } };
              await postXml('/tax_rules', rulePayload);
              
              taxCache[taxName] = taxRulesGroupId;
              logCallback('success', `Règle de taxe "${taxName}" créée avec l'ID ${taxRulesGroupId}.`);
            }
          } catch (taxError) {
             logCallback('error', `Erreur avec la taxe "${taxName}".`);
             throw taxError;
          }
        }
      }
      
      // Resolve Category
      let categoryId = 2; // Default to Accueil
      if (row.categorie) {
        const catName = row.categorie.trim();
        const catNameLower = catName.toLowerCase();
        
        if (categoryCache[catNameLower]) {
          categoryId = categoryCache[catNameLower];
        } else {
          logCallback('info', `Recherche de la catégorie "${catName}"...`);
          try {
            const searchResp = await getXml(`/categories?filter[name]=[${encodeURIComponent(catName)}]&display=[id,name]`);
            let foundId = null;
            
            if (searchResp && searchResp.prestashop && searchResp.prestashop.categories && searchResp.prestashop.categories.category) {
               let cats = searchResp.prestashop.categories.category;
               if (!Array.isArray(cats)) cats = [cats];
               foundId = cats[0].id;
            }
            
            if (foundId) {
              categoryId = foundId;
              categoryCache[catNameLower] = categoryId;
            } else {
              logCallback('info', `Création de la catégorie "${catName}"...`);
              const catPayload = {
                prestashop: {
                  category: {
                    active: 1,
                    id_parent: 2,
                    name: {
                      language: { '@_id': '1', '#text': catName }
                    },
                    link_rewrite: {
                      language: { '@_id': '1', '#text': catName.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
                    }
                  }
                }
              };
              const createResp = await postXml('/categories', catPayload);
              if (createResp && createResp.prestashop && createResp.prestashop.category) {
                categoryId = createResp.prestashop.category.id;
                categoryCache[catNameLower] = categoryId;
                logCallback('success', `Catégorie "${catName}" créée avec l'ID ${categoryId}.`);
              }
            }
          } catch (catError) {
             logCallback('error', `Erreur avec la catégorie "${catName}".`);
             throw catError;
          }
        }
      }
      
      const productPayload = {
        prestashop: {
          product: {
            state: 1,
            active: 1,
            reference: row.reference || '',
            price: priceHT.toFixed(6),
            id_tax_rules_group: taxRulesGroupId,
            id_category_default: categoryId,
            name: {
              language: {
                '@_id': '1',
                '#text': row.nom || 'Produit sans nom'
              }
            },
            link_rewrite: {
              language: {
                '@_id': '1',
                '#text': (row.nom || 'produit').toLowerCase().replace(/[^a-z0-9]+/g, '-')
              }
            },
            associations: {
              categories: {
                category: {
                  id: categoryId
                }
              }
            }
          }
        }
      };

      await postXml('/products', productPayload);
      logCallback('success', `Ligne ${index + 1} (${row.nom}) importée avec succès.`);
    }
    
    logCallback('success', 'Import des produits terminé avec succès !');
  } catch (error) {
    logCallback('error', `Erreur lors de l'import : ${error.message}`);
    logCallback('error', 'Annulation de l\'opération et lancement de la réinitialisation (Rollback)...');
    await rollbackProducts(logCallback);
  }
};
