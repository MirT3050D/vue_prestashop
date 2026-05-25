// Importation des méthodes de base pour communiquer avec l'API PrestaShop
import { getXml, putXml, postXml } from '@/service/api';

/**
 * Normalise les nœuds de ressources PrestaShop pour toujours retourner un tableau.
 * PrestaShop renvoie parfois un objet unique s'il n'y a qu'un résultat, ou un tableau s'il y en a plusieurs.
 * Cette fonction lisse ce comportement pour éviter les bugs lors des itérations (ex: map, forEach).
 * 
 * @param {Object} node Le nœud XML parent (ex: response.prestashop.stock_availables)
 * @param {string} singularKey La clé de l'enfant (ex: 'stock_available')
 */
function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

/**
 * Récupère la liste des stocks disponibles depuis l'API.
 * La ressource `stock_availables` gère les quantités réelles rattachées aux produits.
 * 
 * @param {string|Object} params Les paramètres de filtre (par défaut: display=full)
 */
export async function getStockAvailables(params = 'display=full') {
    // Transforme l'objet JSON en paramètres d'URL (ex: { filter[id]: 5 } => "filter[id]=5")
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    // Exécute la requête GET
    const response = await getXml(`/stock_availables${query ? '?' + query : ''}`);
    // Normalise et retourne le tableau des stocks
    return normalizeArray(response?.prestashop?.stock_availables, 'stock_available');
}

/**
 * Met à jour une entrée de stock existante via une requête PUT.
 * (Sert à forcer la quantité disponible d'un produit).
 * 
 * @param {number|string} id L'ID de l'entrée `stock_available`
 * @param {string|Object} payload Le document XML contenant la nouvelle quantité
 */
export async function updateStockAvailable(id, payload) {
    const response = await putXml(`/stock_availables/${id}`, payload);
    return response?.prestashop?.stock_available || response;
}

/**
 * Fonction utilitaire avancée : Met à jour la quantité ET génère un mouvement de stock historique.
 * Très important pour garder une trace comptable (Back-Office) des ajouts ou retraits de stock.
 * 
 * @param {number} productId L'ID du produit ciblé
 * @param {number} attributeId L'ID de la déclinaison (0 si c'est un produit simple sans taille/couleur)
 * @param {number} newQuantity La nouvelle quantité totale absolue (ex: si j'en ai 5 et j'en ajoute 2, newQuantity = 7)
 * @param {number} employeeId L'ID de l'employé effectuant la modification (1 par défaut, souvent le SuperAdmin)
 * @returns {Promise<boolean>} True si réussi, False sinon.
 */
export async function updateProductStock(productId, attributeId, newQuantity, employeeId = 1) {
    try {
        // 1. On cherche la ligne de stock correspondante pour ce produit précis
        const stockList = await getStockAvailables(`filter[id_product]=[${productId}]&filter[id_product_attribute]=[${attributeId}]&display=full`);

        // Si le produit possède bien une ligne de stock
        if (stockList && stockList.length > 0) {
            const stockToUpdate = stockList[0];
            // Extraction sécurisée de l'ID du stock (qui est différent de l'ID produit)
            const stockId = stockToUpdate.id['#text'] || stockToUpdate.id;

            // 2. On extrait l'ancienne quantité pour calculer la différence (le Delta)
            const oldQuantity = parseInt(stockToUpdate.quantity['#text'] || stockToUpdate.quantity, 10) || 0;
            const delta = newQuantity - oldQuantity;

            // S'il n'y a pas de changement de quantité, on ne fait rien pour économiser des requêtes API
            if (delta === 0) {
                return true;
            }

            // 3. MISE À JOUR DU STOCK (FRONT-OFFICE)
            // On modifie directement l'objet JavaScript récupéré
            stockToUpdate.quantity = newQuantity;
            // On le prépare pour l'envoi XML
            const payload = {
                prestashop: {
                    stock_available: stockToUpdate
                }
            };
            // Mise à jour de la ressource stock_available (qui permet au client de commander)
            await updateStockAvailable(stockId, payload);

            // 4. CRÉATION DU MOUVEMENT DE STOCK (BACK-OFFICE)
            // Calcul des valeurs requises par le schéma XML des mouvements
            const sign = delta > 0 ? 1 : -1; // 1 si ajout, -1 si retrait
            const physicalQuantity = Math.abs(delta); // La quantité mouvementée (toujours positive)
            const reasonId = delta > 0 ? 11 : 12; // 11 = Employee Edition (+), 12 = Employee Edition (-) selon les IDs PrestaShop par défaut

            // On génère la date du jour au format AAAA-MM-JJ HH:MM:SS (Requis par la BDD PrestaShop)
            const now = new Date();
            // Nettoyage de la date ISO pour correspondre à MySQL (ex: "2023-10-05 14:30:00")
            const dateAdd = now.toISOString().slice(0, 19).replace('T', ' ');

            // Construction du XML Brut pour forger le mouvement (ressource stock_mvt)
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

            // Envoi du mouvement à l'API pour l'historisation
            await postXml('/stock_movements', movementXml);

            // Succès
            console.log(`✅ Stock mis à jour avec succès. Mouvement créé : ${delta > 0 ? '+' : '-'}${physicalQuantity} (Raison ID: ${reasonId})`);
            return true;

        } else {
            console.error(`Aucun stock trouvé pour le produit ${productId} et l'attribut ${attributeId}`);
            return false;
        }
    } catch (error) {
        // Interception des erreurs API ou réseau
        console.error("Erreur lors de la mise à jour du stock :", error.response?.data || error.message);
        return false;
    }
}