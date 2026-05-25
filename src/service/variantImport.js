// Importations pour interagir avec l'API PrestaShop et les outils internes
import { getXml, postXml, putXml, formatApiError } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';
import { resetTargets } from '@/service/resetTargets';
import { getProductTaxRate } from '@/service/price';

// Définition des cibles spécifiques pour annuler uniquement l'importation de déclinaisons
export const resetDeclinaisonTargets = [
  { key: 'combinations', label: 'Combinaisons (Déclinaisons)', endpoint: '/combinations', collectionKey: 'combinations', itemKey: 'combination', skipIds: [] },
  { key: 'product_option_values', label: 'Valeurs d\'attributs', endpoint: '/product_option_values', collectionKey: 'product_option_values', itemKey: 'product_option_value', skipIds: [] },
  { key: 'product_options', label: 'Groupes d\'attributs', endpoint: '/product_options', collectionKey: 'product_options', itemKey: 'product_option', skipIds: [] }
];

/**
 * Fonction de secours. Nettoie tout le travail des déclinaisons en cas de problème sévère.
 */
export const rollbackDeclinaison = async (logCallback) => {
  logCallback('info', 'Lancement de la réinitialisation des déclinaisons...');
  await runResetForTargets(resetDeclinaisonTargets, (type, message) => logCallback(type, `Rollback Déclinaison: ${message}`));
};

/**
 * Fonction utilitaire interne pour extraire un ID depuis du XML
 */
function extractId(node) {
  if (node === undefined || node === null) return '';
  if (typeof node === 'object') return String(node['#text'] || node['@_id'] || node.id || '');
  return String(node);
}

// ----------------------------------------------------------------------------
// FONCTIONS API
// ----------------------------------------------------------------------------

/**
 * Force la mise à jour des stocks disponibles (Inventaire) d'un produit ou d'une déclinaison.
 * Contrairement aux autres objets, PrestaShop exige qu'on envoie le XML complet de `stock_available` pour faire un PUT.
 */
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

  // Reconstruction de l'objet XML strict pour le PUT
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

/**
 * Crée une entrée dans l'historique comptable des stocks pour garder une trace de l'import.
 * Utilise la "méthode Legacy" en cachant l'ID Produit dans le champ "id_order".
 */
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
    console.error('Erreur historique stock:', error);
    if (logCallback) logCallback('warn', `Erreur historique stock : ${formatApiError(error)}`);
  }
}

// ----------------------------------------------------------------------------
// TRAITEMENT GLOBAL DES VARIATIONS
// ----------------------------------------------------------------------------

/**
 * Moteur principal de l'importation de déclinaisons depuis un fichier CSV.
 * Une déclinaison, c'est par exemple : Produit Parent = T-Shirt, Déclinaison = Couleur: Rouge.
 */
export const processVariantImport = async (data, logCallback) => {
  // Caches pour éviter de chercher en boucle la couleur "Rouge" dans la base de données
  const optionCache = {};
  const optionValueCache = {};
  const employeeId = 1;

  // 1. Contrôle des données
  if (!data || data.length === 0) {
    logCallback('info', 'Aucune donnée à importer.');
    return;
  }
  // Convertit tous les en-têtes en minuscules pour s'affranchir de la casse (ex: REFERENCE -> reference)
  data = data.map(row => { const newRow = {}; for (const key in row) newRow[key.trim().toLowerCase()] = row[key]; return newRow; });

  try {
    // 2. Boucle sur chaque ligne du fichier CSV
    for (const [rowIdx, row] of data.entries()) {
      logCallback('info', `Traitement de la ligne ${rowIdx + 1} : ${JSON.stringify(row)}`);
      if (!row.reference || String(row.reference).trim() === '') {
        logCallback('warn', `Ligne ${rowIdx + 1} ignorée : référence manquante.`);
        continue;
      }

      // Extraction des champs
      const reference = String(row.reference).trim(); // Réf du produit parent
      const specificite = row['specificité'] ? String(row['specificité']).trim() : ''; // Ex: "Couleur"
      const karazany = row.karazany ? String(row.karazany).trim() : ''; // Ex: "Rouge"
      const stockRaw = row.stock_initial ? String(row.stock_initial).trim() : '';

      let stockInitial = stockRaw !== '' ? parseInt(stockRaw, 10) : 0;
      let prixVenteTTC = row.prix_vente_ttc ? parseFloat(String(row.prix_vente_ttc).replace(',', '.')) : 0;

      // 3. Trouver à quel Produit Parent appartient cette déclinaison
      logCallback('info', `Recherche du produit parent pour la référence : ${reference}`);
      const productSearch = await getXml(`/products?filter[reference]=[${reference}]&display=[id,price,name]`);
      let parentProduct = productSearch?.prestashop?.products?.product;
      
      if (!parentProduct) {
        logCallback('error', `Produit parent non trouvé pour la référence : ${reference}`);
        continue;
      }
      if (Array.isArray(parentProduct)) parentProduct = parentProduct[0];

      const parentProductId = extractId(parentProduct.id);
      const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // ---------------------------------------------------------
      // SCÉNARIO A : Le CSV ne déclare aucune spécificité. 
      // Ce n'est donc pas une déclinaison, mais une simple mise à jour de stock du produit parent.
      // ---------------------------------------------------------
      if (!specificite || !karazany) {
        logCallback('info', `Produit simple détecté (pas de déclinaison) pour la référence : ${reference}`);
        if (stockRaw !== '') {
          try {
            logCallback('info', `Recherche du stock disponible pour le produit simple (id: ${parentProductId})`);
            const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[0]&display=full`);
            let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

            if (stockAvailable) {
              if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];
              const oldQty = parseInt(extractId(stockAvailable.quantity), 10) || 0;
              const delta = stockInitial - oldQty;

              // Met à jour la ligne d'inventaire
              logCallback('info', `Mise à jour du stock de ${oldQty} vers ${stockInitial} pour le produit simple (id: ${parentProductId})`);
              await forceUpdateStockAvailable(stockAvailable, stockInitial);

              // Inscrit la trace dans l'historique si ça a changé
              if (delta !== 0) {
                const sign = delta > 0 ? 1 : -1;
                const reasonId = delta > 0 ? 11 : 12; // 11 = Import +, 12 = Régularisation -
                logCallback('info', `Création d'un mouvement de stock (delta: ${delta}, sign: ${sign}, reasonId: ${reasonId}) pour le produit simple.`);
                await forceStockMovement(parentProductId, 0, employeeId, reasonId, delta, sign, dateAdd, logCallback);
              }
              logCallback('success', `Stock du produit simple ${reference} mis à jour à ${stockInitial}.`);
            } else {
              logCallback('warn', `Aucun stock disponible trouvé pour le produit simple (id: ${parentProductId})`);
            }
          } catch (stockErr) {
            console.error(`Erreur stock produit simple ${reference}:`, stockErr);
            logCallback('error', `Erreur stock produit simple ${reference} : ${formatApiError(stockErr)}`);
          }
        }
        continue;
      }

      // ---------------------------------------------------------
      // SCÉNARIO B : C'est une vraie Déclinaison (Ex: Couleur - Rouge)
      // ---------------------------------------------------------

      // 1. Cherche ou crée le Groupe d'Attribut ("Couleur")
      let optionId = optionCache[specificite];
      if (!optionId) {
        logCallback('info', `Recherche de l'option d'attribut : ${specificite}`);
        const optSearch = await getXml(`/product_options?filter[name]=[${specificite}]&display=[id]`);
        let opt = optSearch?.prestashop?.product_options?.product_option;
        if (opt) {
          optionId = extractId(Array.isArray(opt) ? opt[0].id : opt.id);
          logCallback('info', `Option trouvée : ${specificite} (id: ${optionId})`);
        } else {
          // Création à la volée du groupe
          logCallback('info', `Option non trouvée, création de l'option : ${specificite}`);
          const newOpt = await postXml('/product_options', { prestashop: { product_option: { is_color_group: 0, group_type: 'select', name: { language: { '@_id': '1', '#text': specificite } }, public_name: { language: { '@_id': '1', '#text': specificite } } } } });
          optionId = extractId(newOpt?.prestashop?.product_option?.id);
          logCallback('success', `Option créée : ${specificite} (id: ${optionId})`);
        }
        optionCache[specificite] = optionId; // Mise en cache pour les lignes CSV suivantes
      }

      // 2. Cherche ou crée la Valeur d'Attribut ("Rouge") au sein du groupe ("Couleur")
      const optValKey = `${optionId}_${karazany}`;
      let optionValueId = optionValueCache[optValKey];
      if (!optionValueId) {
        logCallback('info', `Recherche de la valeur d'attribut : ${karazany} pour l'option ${specificite}`);
        const valSearch = await getXml(`/product_option_values?filter[id_attribute_group]=[${optionId}]&filter[name]=[${karazany}]&display=[id]`);
        let val = valSearch?.prestashop?.product_option_values?.product_option_value;
        if (val) {
          optionValueId = extractId(Array.isArray(val) ? val[0].id : val.id);
          logCallback('info', `Valeur d'attribut trouvée : ${karazany} (id: ${optionValueId})`);
        } else {
          // Création à la volée de la valeur
          logCallback('info', `Valeur d'attribut non trouvée, création de la valeur : ${karazany}`);
          const newVal = await postXml('/product_option_values', { prestashop: { product_option_value: { id_attribute_group: optionId, name: { language: { '@_id': '1', '#text': karazany } } } } });
          optionValueId = extractId(newVal?.prestashop?.product_option_value?.id);
          logCallback('success', `Valeur d'attribut créée : ${karazany} (id: ${optionValueId})`);
        }
        optionValueCache[optValKey] = optionValueId; // Mise en cache
      }

      // 3. Calcul de l'Impact sur le Prix
      // L'API PrestaShop ne prend pas un "Nouveau prix" pour une déclinaison.
      // Elle prend un "Impact". Si le Parent coûte 10€, et que la déclinaison coûte 12€, l'impact est de +2€.
      let priceImpact = 0;
      if (prixVenteTTC > 0) {
        try {
          logCallback('info', `Calcul du prix HT et de l'impact pour la variante ${reference}_${karazany}`);
          // On doit récupérer la taxe du produit parent pour calculer le HT
          const parentTaxRate = await getProductTaxRate(parentProductId);
          const prixVenteHT = prixVenteTTC / (1 + (parentTaxRate / 100));
          const parentPriceHT = parseFloat(parentProduct.price) || 0;
          
          priceImpact = prixVenteHT - parentPriceHT;
          logCallback('info', `Prix TTC: ${prixVenteTTC}, Prix HT: ${prixVenteHT.toFixed(2)}, Prix parent HT: ${parentPriceHT}, Impact: ${priceImpact.toFixed(6)}`);
        } catch (e) {
          logCallback('warn', `Impossible de récupérer le taux de taxe pour la variante ${reference}_${karazany}, impact=0`);
          priceImpact = 0;
        }
      }
      
      // 4. Fabrication et Envoi de la Combinaison
      logCallback('info', `Création de la combinaison pour ${reference}_${karazany} (impact: ${priceImpact.toFixed(6)})`);
      // Le payload rattache le Produit Parent, la Réf, le Prix, et la Valeur (Couleur = Rouge)
      const newCombResp = await postXml('/combinations', { prestashop: { combination: { id_product: parentProductId, reference: `${reference}_${karazany}`, price: priceImpact.toFixed(6), minimal_quantity: 1, associations: { product_option_values: { product_option_value: [{ id: optionValueId }] } } } } });
      const combinationId = extractId(newCombResp?.prestashop?.combination?.id);

      // 5. Ajustement du Stock de cette Déclinaison
      if (combinationId && stockRaw !== '') {
        try {
          // PrestaShop génère automatiquement une ligne 'stock_available' quand on crée une déclinaison.
          // On va chercher cette ligne générée pour la modifier.
          logCallback('info', `Recherche du stock disponible pour la déclinaison (id: ${combinationId})`);
          const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[${combinationId}]&display=full`);
          let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

          if (stockAvailable) {
            if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];
            const oldQty = parseInt(extractId(stockAvailable.quantity), 10) || 0;
            const delta = stockInitial - oldQty;

            logCallback('info', `Mise à jour du stock de la déclinaison de ${oldQty} vers ${stockInitial}`);
            await forceUpdateStockAvailable(stockAvailable, stockInitial);

            if (delta !== 0) {
              const sign = delta > 0 ? 1 : -1;
              const reasonId = delta > 0 ? 11 : 12;
              logCallback('info', `Création d'un mouvement de stock (delta: ${delta}, sign: ${sign}, reasonId: ${reasonId}) pour la déclinaison.`);
              await forceStockMovement(parentProductId, combinationId, employeeId, reasonId, delta, sign, dateAdd, logCallback);
            }
            logCallback('success', `Stock de la déclinaison (${karazany}) synchronisé (${stockInitial} unités).`);
          } else {
            logCallback('warn', `Aucun stock disponible trouvé pour la déclinaison (id: ${combinationId})`);
          }
        } catch (stockError) {
          console.error('Impossible de fixer le stock:', stockError);
          logCallback('error', `Impossible de fixer le stock : ${formatApiError(stockError)}`);
        }
      }
      
      // Petit temps d'arrêt pour éviter que le serveur PrestaShop ne rejette les requêtes (DDoS interne)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    logCallback('success', 'Import des variations terminé avec succès !');
  } catch (error) {
    console.error('Erreur lors de l\'import des variations:', error);
    logCallback('error', `Erreur lors de l'import des variations : ${formatApiError(error)}`);
    
    // Si la boucle plante (Crash réseau ou erreur majeure), on lance le Rollback Total (Pas seulement déclinaisons, mais TOUT).
    try {
      await runResetForTargets(resetTargets, (type, message) => logCallback(type, `Rollback global: ${message}`));
    } catch (e) {
      console.error('Échec du rollback global:', e);
      logCallback('warn', `Échec du rollback global : ${formatApiError(e)}`);
    }
  }
};