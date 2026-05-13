<template>
  <div class="import-page">
    <h1>Import de Données via CSV</h1>
    <p>Sélectionnez un fichier CSV pour importer des données dans PrestaShop.</p>
    
    <div class="import-grid">
      <!-- Card 1: Produits -->
      <div class="upload-card">
        <h2>1. Import de Produits</h2>
        <p>Format: reference, nom, prix_ttc, Taxe, categorie</p>
        <div class="upload-section">
          <input type="file" accept=".csv" @change="(e) => onFileChange(e, 'product')" :disabled="isImportingProduct" class="file-input" />
          <button class="action-btn" @click="startProductImport" :disabled="!fileProduct || isImportingProduct">
            {{ isImportingProduct ? 'Import en cours...' : 'Lancer l\'import' }}
          </button>
        </div>
      </div>

      <!-- Card 2: Variations -->
      <div class="upload-card">
        <h2>2. Import de Variations</h2>
        <p>Format: reference, specificité, karazany, stock_initial, prix_vente_ttc</p>
        <div class="upload-section">
          <input type="file" accept=".csv" @change="(e) => onFileChange(e, 'variant')" :disabled="isImportingVariant" class="file-input" />
          <button class="action-btn" @click="startVariantImport" :disabled="!fileVariant || isImportingVariant">
            {{ isImportingVariant ? 'Import en cours...' : 'Lancer l\'import' }}
          </button>
        </div>
      </div>

      <!-- Card 3: Placeholder 1 -->
      <div class="upload-card placeholder-card">
        <h2>3. Import de Clients</h2>
        <p>En cours de développement...</p>
        <div class="upload-section">
          <input type="file" accept=".csv" disabled class="file-input" />
          <button class="action-btn" disabled>À venir</button>
        </div>
      </div>

      <!-- Card 4: Placeholder 2 -->
      <div class="upload-card placeholder-card">
        <h2>4. Import de Commandes</h2>
        <p>En cours de développement...</p>
        <div class="upload-section">
          <input type="file" accept=".csv" disabled class="file-input" />
          <button class="action-btn" disabled>À venir</button>
        </div>
      </div>
    </div>

    <div v-if="logs.length" class="logs-section">
      <h3>Journal de l'import :</h3>
      <ul>
        <li v-for="(log, index) in logs" :key="index" :class="log.type">
          {{ log.message }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Papa from 'papaparse';
import { getXml, postXml, putXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';
import { resetTargets } from '@/service/resetTargets';

const fileProduct = ref(null);
const fileVariant = ref(null);
const isImportingProduct = ref(false);
const isImportingVariant = ref(false);
const logs = ref([]);

const addLog = (type, message) => {
  logs.value.push({ type, message });
};

const onFileChange = (event, type) => {
  if (type === 'product') {
    fileProduct.value = event.target.files[0];
  } else if (type === 'variant') {
    fileVariant.value = event.target.files[0];
  }
};

const startProductImport = () => {
  if (!fileProduct.value) return;
  isImportingProduct.value = true;
  logs.value = [];
  addLog('info', 'Début de la lecture du fichier CSV Produits...');

  Papa.parse(fileProduct.value, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const data = results.data;
      addLog('success', `${data.length} lignes trouvées dans le CSV Produits. Début de l'import.`);
      await processImport(data);
    },
    error: (error) => {
      addLog('error', `Erreur de lecture du fichier CSV : ${error.message}`);
      isImportingProduct.value = false;
    }
  });
};

const startVariantImport = () => {
  if (!fileVariant.value) return;
  isImportingVariant.value = true;
  logs.value = [];
  addLog('info', 'Début de la lecture du fichier CSV Variations...');

  Papa.parse(fileVariant.value, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const data = results.data;
      addLog('success', `${data.length} lignes trouvées dans le CSV Variations. Début de l'import.`);
      await processVariantImport(data);
    },
    error: (error) => {
      addLog('error', `Erreur de lecture du fichier CSV : ${error.message}`);
      isImportingVariant.value = false;
    }
  });
};

const processVariantImport = async (data) => {
  const optionGroupCache = {};
  const optionValueCache = {};
  const parentProductCache = {};

  try {
    for (const [index, row] of data.entries()) {
      addLog('info', `Importation de la ligne ${index + 1} (Ref: ${row.reference || '?'})...`);
      
      const reference = row.reference?.trim();
      const specificite = row.specificité?.trim();
      const karazany = row.karazany?.trim();
      const stockInitialRaw = row.stock_initial || '0';
      const stockInitial = parseInt(stockInitialRaw, 10);
      
      const priceRaw = row.prix_vente_ttc ? row.prix_vente_ttc.replace(',', '.') : '0';
      const priceTTC = parseFloat(priceRaw) || 0;

      if (!reference || !specificite || !karazany) {
        addLog('error', `Ligne ${index + 1} ignorée : données incomplètes.`);
        continue;
      }

      // 1. Trouver le produit parent
      let parentProductId = null;
      let parentProductPrice = 0;
      if (parentProductCache[reference]) {
        parentProductId = parentProductCache[reference].id;
        parentProductPrice = parentProductCache[reference].price;
      } else {
        const prodResp = await getXml(`/products?filter[reference]=[${encodeURIComponent(reference)}]&display=[id,price]`);
        if (prodResp && prodResp.prestashop && prodResp.prestashop.products && prodResp.prestashop.products.product) {
           let prods = prodResp.prestashop.products.product;
           if (!Array.isArray(prods)) prods = [prods];
           parentProductId = prods[0].id;
           parentProductPrice = parseFloat(prods[0].price || 0);
           parentProductCache[reference] = { id: parentProductId, price: parentProductPrice };
        } else {
           addLog('error', `Produit parent introuvable pour la référence ${reference}.`);
           continue;
        }
      }

      // Calcul de l'impact de prix (simplifié : prixTTC de la variation - prixHT du parent)
      let priceImpact = priceTTC > 0 ? (priceTTC - parentProductPrice) : 0;

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
           addLog('info', `Création du groupe d'attributs "${specificite}"...`);
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
           addLog('info', `Création de la valeur d'attribut "${karazany}"...`);
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
      addLog('info', `Création de la déclinaison pour le produit ${reference}...`);
      const combinationPayload = {
        prestashop: {
          combination: {
            id_product: parentProductId,
            reference: `${reference}_${karazany}`,
            price: priceImpact.toFixed(6),
            associations: {
              product_option_values: {
                product_option_value: {
                  id: optionValueId
                }
              }
            }
          }
        }
      };
      
      const createCombResp = await postXml('/combinations', combinationPayload);
      const combinationId = createCombResp.prestashop.combination.id;

      // 5. Mettre à jour le stock (stock_availables)
      if (stockInitial > 0) {
        addLog('info', `Mise à jour du stock pour la déclinaison (${stockInitial})...`);
        const stockResp = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[${combinationId}]&display=[id,id_product,id_product_attribute,id_shop,id_shop_group,depends_on_stock,out_of_stock]`);
        
        if (stockResp && stockResp.prestashop && stockResp.prestashop.stock_availables && stockResp.prestashop.stock_availables.stock_available) {
           let stocks = stockResp.prestashop.stock_availables.stock_available;
           if (!Array.isArray(stocks)) stocks = [stocks];
           const stockAvailable = stocks[0];
           
           const stockPayload = {
             prestashop: {
               stock_available: {
                 id: stockAvailable.id,
                 id_product: stockAvailable.id_product,
                 id_product_attribute: stockAvailable.id_product_attribute,
                 id_shop: stockAvailable.id_shop,
                 id_shop_group: stockAvailable.id_shop_group,
                 quantity: stockInitial,
                 depends_on_stock: stockAvailable.depends_on_stock || 0,
                 out_of_stock: stockAvailable.out_of_stock || 2
               }
             }
           };
           
           await putXml('/stock_availables', stockPayload);
        }
      }

      addLog('success', `Ligne ${index + 1} (${karazany}) importée avec succès.`);
    }
    
    addLog('success', 'Import des variations terminé avec succès !');
  } catch (error) {
    addLog('error', `Erreur lors de l'import des variations : ${error.message}`);
    addLog('error', 'Annulation de l\'opération et lancement de la réinitialisation (Rollback)...');
    await rollback();
  } finally {
    isImportingVariant.value = false;
  }
};

const processImport = async (data) => {
  const categoryCache = {};
  const taxCache = {};

  try {
    for (const [index, row] of data.entries()) {
      addLog('info', `Importation de la ligne ${index + 1} (${row.nom || 'Sans nom'})...`);
      
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
          addLog('info', `Recherche de la règle de taxe "${taxName}"...`);
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
              addLog('info', `Création de la règle de taxe "${taxName}"...`);
              
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
              addLog('success', `Règle de taxe "${taxName}" créée avec l'ID ${taxRulesGroupId}.`);
            }
          } catch (taxError) {
             addLog('error', `Erreur avec la taxe "${taxName}".`);
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
          addLog('info', `Recherche de la catégorie "${catName}"...`);
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
              addLog('info', `Création de la catégorie "${catName}"...`);
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
                addLog('success', `Catégorie "${catName}" créée avec l'ID ${categoryId}.`);
              }
            }
          } catch (catError) {
             addLog('error', `Erreur avec la catégorie "${catName}".`);
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
      addLog('success', `Ligne ${index + 1} (${row.nom}) importée avec succès.`);
    }
    
    addLog('success', 'Import des produits terminé avec succès !');
  } catch (error) {
    addLog('error', `Erreur lors de l'import : ${error.message}`);
    addLog('error', 'Annulation de l\'opération et lancement de la réinitialisation (Rollback)...');
    await rollback();
  } finally {
    isImportingProduct.value = false;
  }
};

const rollback = async () => {
  addLog('info', 'Lancement de la réinitialisation des données (Sécurité)...');
  await runResetForTargets(resetTargets, (type, message) => {
    addLog(type, `Rollback: ${message}`);
  });
  addLog('info', 'Réinitialisation terminée. L\'import a été annulé.');
};
</script>

<style scoped>
.import-page {
  max-width: 1000px;
  margin: 0 auto;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  padding: 20px;
}

.import-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 30px;
}

@media (max-width: 768px) {
  .import-grid {
    grid-template-columns: 1fr;
  }
}

.upload-card {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  border: 1px solid #e2e8f0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.upload-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 15px rgba(0,0,0,0.08);
}

.upload-card h2 {
  font-size: 1.25rem;
  color: #1e293b;
  margin-top: 0;
  margin-bottom: 8px;
}

.upload-card p {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 20px;
  flex-grow: 1;
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.file-input {
  width: 100%;
  font-size: 0.9rem;
}

.action-btn {
  padding: 12px 20px;
  background: linear-gradient(135deg, #0f172a, #2563eb);
  color: white;
  font-weight: bold;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  width: 100%;
}

.action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.action-btn:disabled {
  background: #cbd5e1;
  color: #64748b;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.placeholder-card {
  background: #f8fafc;
  border-style: dashed;
}

.logs-section {
  margin-top: 40px;
  background-color: #1e293b;
  color: #cbd5e1;
  padding: 24px;
  border-radius: 12px;
  max-height: 400px;
  overflow-y: auto;
  font-family: monospace;
}

.logs-section h3 {
  margin-top: 0;
  color: white;
  margin-bottom: 15px;
}

.logs-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.logs-section li {
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255,255,255,0.05);
  font-size: 0.9rem;
}

.info { color: #60a5fa; border-left: 3px solid #60a5fa; }
.success { color: #4ade80; border-left: 3px solid #4ade80; }
.error { color: #f87171; font-weight: bold; background-color: rgba(248, 113, 113, 0.1); border-left: 3px solid #f87171; }
</style>
