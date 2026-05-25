// Importation d'une fonction utilitaire pour extraire proprement du texte d'objets XML
import { extractText } from '@/service/prestashopUtils';
// Importation de la fonction de récupération des données produit depuis le service dédié
import { getProduct } from '@/service/productService';
// Importation des utilitaires pour calculer la TVA et les prix TTC
import { getProductTaxRate, calculateTtc } from '@/service/price';
// Importation de la méthode pour charger l'URL d'une image depuis l'API
import { getImage } from '@/service/api';
// Importation de la méthode de vérification du stock physique/disponible
import { getStockAvailables } from '@/service/stockService';

/**
 * Retourne la clé localStorage du panier pour un client donné.
 * Gère le cas des utilisateurs connectés et des visiteurs anonymes (guest).
 * 
 * @param {string|number} customerId L'identifiant éventuel du client
 */
export function getCartStorageKey(customerId) {
    // Si un ID est fourni explicitement, on génère une clé spécifique à cet utilisateur
    if (customerId) return `panier_${customerId}`;
    
    // Sinon, on cherche si un client est actuellement connecté en lisant le localStorage
    const customerJson = localStorage.getItem('customer');
    if (customerJson) {
        try {
            // Tente de décoder les données JSON du client
            const customerData = JSON.parse(customerJson);
            // S'il est valide et a un ID, on génère sa clé
            if (customerData?.id) return `panier_${customerData.id}`;
        } catch (e) {
            // En cas d'erreur de format JSON, on loggue silencieusement
            console.error("Erreur parse customer:", e);
        }
    }
    // Si l'utilisateur n'est pas identifié, on utilise un panier "invité" par défaut
    return 'panier_guest';
}

/**
 * Lit le panier depuis le localStorage et retourne un tableau d'items.
 * C'est le point d'entrée pour récupérer le panier actuel de la session.
 * 
 * @param {string|number} customerId L'identifiant éventuel du client
 */
export function getCart(customerId) {
    // Récupère la bonne clé de stockage (utilisateur ou invité)
    const key = getCartStorageKey(customerId);
    // Lit la chaîne JSON sauvegardée dans le navigateur
    const raw = localStorage.getItem(key);
    // Si rien n'existe, on retourne un panier vide
    if (!raw) return [];
    try {
        // Tente de convertir la chaîne en tableau d'objets JavaScript
        const parsed = JSON.parse(raw);
        // Sécurité : s'assure qu'on retourne toujours un tableau, même si le JSON était altéré
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        // Loggue l'erreur si les données du localStorage sont corrompues et retourne un panier vide
        console.error("Erreur parse panier:", e);
        return [];
    }
}

/**
 * Sauvegarde les items du panier de façon persistante dans le localStorage du navigateur.
 * 
 * @param {string|number} customerId L'ID du client (pour cibler le bon panier)
 * @param {Array} items La liste des produits à sauvegarder
 */
export function saveCart(customerId, items) {
    // Récupère la bonne clé pour l'utilisateur
    const key = getCartStorageKey(customerId);
    // Écrase l'ancienne valeur avec la nouvelle chaîne JSON du panier
    localStorage.setItem(key, JSON.stringify(items));
}

/**
 * Vide intégralement le panier local en le remplaçant par un tableau vide.
 * 
 * @param {string|number} customerId L'ID du client
 */
export function clearCart(customerId) {
    // Récupère la clé
    const key = getCartStorageKey(customerId);
    // Insère un tableau vide `[]` sérialisé
    localStorage.setItem(key, JSON.stringify([]));
}

/**
 * Enrichit un item brut du panier (qui n'a qu'un id_product et une quantité)
 * avec toutes ses données réelles (nom, prix, image, TVA) en interrogeant l'API PrestaShop.
 * 
 * @param {Object} item L'objet basique contenu dans le localStorage
 */
export async function enrichCartItem(item) {
    // Initialise les valeurs avec ce qu'on a potentiellement déjà en cache dans l'item
    let taxRate = item.taxRate;
    let image = item.image || null;
    let price = item.price;
    let name = item.name;
    let reference = item.reference;

    // Si on n'a pas la TVA et que le produit est valide, on interroge l'API pour récupérer son taux de taxe
    if (taxRate == null && item.id_product && String(item.id_product) !== '0' && String(item.id_product) !== 'undefined') {
        taxRate = await getProductTaxRate(item.id_product);
    }

    try {
        // Si le produit est valide
        if (item.id_product && String(item.id_product) !== '0' && String(item.id_product) !== 'undefined') {
            // On récupère la fiche complète du produit via l'API
            const product = await getProduct(item.id_product);
            if (product) {
                // Extrait le prix de base HT (hors taxe)
                price = Number(extractText(product.price)) || 0;
                
                // Extrait le nom en gérant le fait qu'il peut y avoir plusieurs langues retournées par PrestaShop
                const nameNode = product.name?.language;
                const text = Array.isArray(nameNode) ? nameNode[0]['#text'] : (nameNode?.['#text'] || nameNode);
                name = extractText(text) || 'Produit sans nom';
                
                // Extrait la référence SKU si elle existe
                reference = extractText(product.reference) || '';

                // Si le produit a une image par défaut configurée
                if (product.id_default_image) {
                    let imgId = product.id_default_image;
                    // Nettoyage de l'objet XML si c'en est un
                    if (typeof imgId === 'object' && imgId['#text']) imgId = imgId['#text'];
                    if (typeof imgId === 'object' && imgId['@_xlink:href']) {
                        // Extrait l'ID de l'image de l'URL fournie par l'API (ex: http://.../images/products/1/5 -> 5)
                        imgId = imgId['@_xlink:href'].split('/').pop();
                    }
                    // Construit la route pour interroger l'API d'images
                    const path = `images/products/${item.id_product}/${imgId}`;
                    // Télécharge l'image sous forme de blob/URL locale
                    image = await getImage(path);
                }
            }
        }
    } catch (e) {
        // Si la récupération API échoue, on continue sans bloquer (avec les données par défaut)
    }

    // Retourne un nouvel objet item contenant les données enrichies
    return {
        ...item,
        name: name || `Produit #${item.id_product}`, // Fallback si pas de nom
        price: price || 0, // Fallback si pas de prix
        reference: reference || '',
        taxRate: Number(taxRate) || 0, // Assure que la taxe est bien un nombre
        image // L'URL blob de l'image
    };
}

/**
 * Interroge l'API pour connaître la quantité de stock actuellement disponible pour un produit ou une déclinaison.
 * 
 * @param {string|number} productId L'ID du produit
 * @param {string|number} attributeId L'ID de sa déclinaison (0 s'il n'y en a pas)
 */
export async function getItemStock(productId, attributeId) {
    const pId = extractText(productId);
    const attrId = extractText(attributeId) || '0';
    // Sécurité: Si pas d'ID, on renvoie 0 stock
    if (!pId) return 0;
    try {
        // Requête API vers stock_availables filtrée par produit et déclinaison
        const stockData = await getStockAvailables(`filter[id_product]=[${pId}]&filter[id_product_attribute]=[${attrId}]&display=[quantity]`);
        // Si on a un retour de l'API
        if (stockData && stockData.length > 0) {
            // On extrait et convertit la quantité en nombre entier
            return parseInt(extractText(stockData[0].quantity), 10) || 0;
        }
    } catch (e) {
        // En cas de problème réseau, loggue et continue
        console.warn('Erreur récupération stock:', e);
    }
    // Si l'API échoue ou ne renvoie rien, on considère le produit en rupture
    return 0;
}

/**
 * Calcule le coût global du panier TOUTES TAXES COMPRISES (TTC).
 * 
 * @param {Array} items La liste des produits du panier
 * @returns {string} Le total TTC formaté avec 2 décimales
 */
export function computeTotalTtc(items) {
    let total = 0;
    // Boucle sur chaque produit du panier
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Calcule le prix unitaire TTC pour cet item
        const priceTtc = calculateTtc(item.price || 0, item.taxRate || 0);
        // Multiplie par la quantité et l'ajoute au total global
        total += priceTtc * (item.quantity || 1);
    }
    // Formate en chaîne avec 2 chiffres après la virgule (ex: "15.99")
    return total.toFixed(2);
}

/**
 * Calcule le coût global du panier HORS TAXE (HT).
 * 
 * @param {Array} items La liste des produits
 * @returns {string} Le total HT formaté avec 2 décimales
 */
export function computeTotalHt(items) {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Prend le prix unitaire HT de base, multiplié par la quantité
        total += (Number(item.price) || 0) * (item.quantity || 1);
    }
    // Formate en chaîne
    return total.toFixed(2);
}

/**
 * Transfère les produits d'un panier visiteur anonyme vers le vrai panier de l'utilisateur connecté.
 * Fonctionnalité essentielle déclenchée lors d'un Login.
 * 
 * @param {string|number} anonymousId L'identifiant (souvent null pour le guest) de l'anonyme
 * @param {string|number} userId L'identifiant du client connecté
 */
export function mergeAnonymousToUser(anonymousId, userId) {
    // Récupère les items du panier invité
    const anonItems = getCart(anonymousId);
    // S'il est vide, rien à faire
    if (anonItems.length === 0) return;

    // Récupère le panier actuel du client connecté
    const userItems = getCart(userId);

    // Boucle sur chaque produit du panier invité
    for (let i = 0; i < anonItems.length; i++) {
        const anonItem = anonItems[i];
        let found = false;

        // Boucle sur le panier de l'utilisateur pour vérifier si le produit y est déjà
        for (let j = 0; j < userItems.length; j++) {
            // Si l'ID produit et l'ID de déclinaison sont exactement identiques
            if (String(userItems[j].id_product) === String(anonItem.id_product) &&
                String(userItems[j].id_product_attribute || '0') === String(anonItem.id_product_attribute || '0')) {
                // On fusionne les quantités (on ajoute la quantité anonyme à la quantité utilisateur)
                userItems[j].quantity = (userItems[j].quantity || 1) + (anonItem.quantity || 1);
                found = true;
                break;
            }
        }

        // Si le produit n'était pas encore dans le panier de l'utilisateur
        if (!found) {
            // On l'ajoute simplement comme un nouveau produit
            userItems.push(anonItem);
        }
    }

    // Sauvegarde le panier utilisateur mis à jour dans le localStorage
    saveCart(userId, userItems);
    // Vide le panier invité pour faire le ménage
    clearCart(anonymousId);
}

/**
 * Vérifie combien d'exemplaires d'un produit (et sa déclinaison) sont déjà présents dans le panier courant.
 * Utile pour limiter la quantité max ajoutable ou savoir si on doit incrémenter ou créer l'item.
 * 
 * @param {string|number} productId L'ID du produit
 * @param {string|number} attributeId L'ID de sa déclinaison
 */
export function getExistingCartQuantity(productId, attributeId) {
    // Récupère le panier en cours (identifié automatiquement selon si on est loggué ou non)
    const cart = getCart(); 
    // Recherche le produit spécifique dans le tableau
    const existingItem = cart.find(item =>
        String(item.id_product) === String(productId) &&
        String(item.id_product_attribute) === String(attributeId)
    );
    // S'il existe, retourne sa quantité en nombre entier, sinon 0
    return existingItem ? Number(existingItem.quantity) || 0 : 0;
}
