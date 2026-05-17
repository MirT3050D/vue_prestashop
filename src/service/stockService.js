import { getXml, putXml, postXml } from '@/service/api';

/**
 * Normalise les nœuds de ressources PrestaShop pour toujours retourner un tableau.
 */
function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

/**
 * Récupère la liste des stocks disponibles.
 */
export async function getStockAvailables(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/stock_availables${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.stock_availables, 'stock_available');
}

/**
 * Met à jour une entrée de stock existante.
 */
export async function updateStockAvailable(id, payload) {
    const response = await putXml(`/stock_availables/${id}`, payload);
    return response?.prestashop?.stock_available || response;
}

/**
 * Fonction utilitaire avancée : Met à jour la quantité ET génère le mouvement de stock
 * @param {number} productId L'ID du produit
 * @param {number} attributeId L'ID de la déclinaison (0 si produit simple)
 * @param {number} newQuantity La nouvelle quantité à définir
 * @param {number} employeeId L'ID de l'employé effectuant la modif (1 par défaut)
 */
export async function updateProductStock(productId, attributeId, newQuantity, employeeId = 1) {
    try {
        // 1. On cherche la ligne de stock correspondante
        const stockList = await getStockAvailables(`filter[id_product]=[${productId}]&filter[id_product_attribute]=[${attributeId}]&display=full`);

        if (stockList && stockList.length > 0) {
            const stockToUpdate = stockList[0];
            const stockId = stockToUpdate.id['#text'] || stockToUpdate.id;

            // 2. On extrait l'ancienne quantité pour calculer la différence (le Delta)
            const oldQuantity = parseInt(stockToUpdate.quantity['#text'] || stockToUpdate.quantity, 10) || 0;
            const delta = newQuantity - oldQuantity;

            // S'il n'y a pas de changement de quantité, on ne fait rien pour économiser des requêtes
            if (delta === 0) {
                return true;
            }

            // 3. MISE À JOUR DU STOCK (FRONT-OFFICE)
            stockToUpdate.quantity = newQuantity;
            const payload = {
                prestashop: {
                    stock_available: stockToUpdate
                }
            };
            await updateStockAvailable(stockId, payload);

            // 4. CRÉATION DU MOUVEMENT DE STOCK (BACK-OFFICE)
            // Calcul des valeurs requises par le schéma XML
            const sign = delta > 0 ? 1 : -1;
            const physicalQuantity = Math.abs(delta);
            const reasonId = delta > 0 ? 11 : 12; // 11 = Employee Edition (+), 12 = Employee Edition (-)

            // On génère la date du jour au format AAAA-MM-JJ HH:MM:SS
            const now = new Date();
            const dateAdd = now.toISOString().slice(0, 19).replace('T', ' ');

            // Construction du XML Brut pour le mouvement (stock_mvt)
            const movementXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <stock_mvt>
        <id_product>${productId}</id_product>
        <id_product_attribute>${attributeId}</id_product_attribute>
        <id_employee>${employeeId}</id_employee>
        <id_stock>0</id_stock>
        <id_stock_mvt_reason>${reasonId}</id_stock_mvt_reason>
        <physical_quantity>${physicalQuantity}</physical_quantity>
        <sign>${sign}</sign>
        <price_te>0.000000</price_te>
        <date_add>${dateAdd}</date_add>
    </stock_mvt>
</prestashop>`;

            // Envoi du mouvement à l'API
            await postXml('/stock_movements', movementXml);

            console.log(`✅ Stock mis à jour avec succès. Mouvement créé : ${delta > 0 ? '+' : '-'}${physicalQuantity} (Raison ID: ${reasonId})`);
            return true;

        } else {
            console.error(`Aucun stock trouvé pour le produit ${productId} et l'attribut ${attributeId}`);
            return false;
        }
    } catch (error) {
        console.error("Erreur lors de la mise à jour du stock :", error.response?.data || error.message);
        return false;
    }
}