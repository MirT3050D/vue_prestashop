<template>
  <div class="import-page">
    <h1>Import de Produits via CSV</h1>
    <p>Sélectionnez un fichier CSV pour importer des produits dans PrestaShop.</p>
    
    <div class="upload-section">
      <input type="file" accept=".csv" @change="onFileChange" :disabled="isImporting" class="file-input" />
      <button class="action-btn" @click="startImport" :disabled="!file || isImporting">
        {{ isImporting ? 'Import en cours...' : 'Lancer l\'import' }}
      </button>
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
import { getXml, postXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';
import { resetTargets } from '@/service/resetTargets';

const file = ref(null);
const isImporting = ref(false);
const logs = ref([]);

const addLog = (type, message) => {
  logs.value.push({ type, message });
};

const onFileChange = (event) => {
  file.value = event.target.files[0];
};

const startImport = () => {
  if (!file.value) return;
  isImporting.value = true;
  logs.value = [];
  addLog('info', 'Début de la lecture du fichier CSV...');

  Papa.parse(file.value, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const data = results.data;
      addLog('success', `${data.length} lignes trouvées dans le CSV. Début de l'import.`);
      await processImport(data);
    },
    error: (error) => {
      addLog('error', `Erreur de lecture du fichier CSV : ${error.message}`);
      isImporting.value = false;
    }
  });
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
    
    addLog('success', 'Import terminé avec succès !');
  } catch (error) {
    addLog('error', `Erreur lors de l'import : ${error.message}`);
    addLog('error', 'Annulation de l\'opération et lancement de la réinitialisation (Rollback)...');
    await rollback();
  } finally {
    isImporting.value = false;
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
  max-width: 800px;
  margin: 0 auto;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.upload-section {
  margin-top: 20px;
  display: flex;
  gap: 15px;
  align-items: center;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.file-input {
  flex-grow: 1;
}
.action-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #0f172a, #2563eb);
  color: white;
  font-weight: bold;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}
.action-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
.logs-section {
  margin-top: 30px;
  background-color: #1e293b;
  color: #cbd5e1;
  padding: 20px;
  border-radius: 8px;
  max-height: 400px;
  overflow-y: auto;
  font-family: monospace;
}
.logs-section h3 {
  margin-top: 0;
  color: white;
}
.logs-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.logs-section li {
  margin-bottom: 5px;
  padding: 5px 10px;
  border-radius: 4px;
}
.info { color: #60a5fa; }
.success { color: #4ade80; }
.error { color: #f87171; font-weight: bold; background-color: rgba(248, 113, 113, 0.1); }
</style>
