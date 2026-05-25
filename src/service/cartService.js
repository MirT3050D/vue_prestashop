// Importation des méthodes HTTP CRUD (GET, POST, PUT, DELETE) pour l'API
import { getXml, postXml, putXml, deleteXml } from '@/service/api';
// Importation d'une fonction utilitaire pour extraire de manière sécurisée du texte depuis un nœud XML
import { extractText } from '@/service/prestashopUtils';

/**
 * Normalise les nœuds de ressources PrestaShop pour toujours retourner un tableau.
 * Évite les erreurs lorsque l'API renvoie un seul objet au lieu d'une liste.
 * 
 * @param {Object} node Le nœud XML parsé (ex: response.prestashop.carts)
 * @param {string} singularKey Le nom de la balise enfant (ex: 'cart')
 */
function normalizeArray(node, singularKey) {
    // Si le parent est vide, retourne un tableau vide
    if (!node || node === '') return [];
    // Récupère l'enfant spécifique
    const list = node[singularKey];
    // Si l'enfant n'existe pas, tableau vide
    if (!list) return [];
    // Force la conversion en tableau si c'est un objet unique
    return Array.isArray(list) ? list : [list];
}

/**
 * Récupère tous les paniers depuis l'API.
 * 
 * @param {string|Object} params Les paramètres de filtrage de l'URL
 */
export async function getCarts(params = 'display=full') {
    // Formate les paramètres en chaîne (ex: display=full&filter[id_customer]=5)
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    // Exécute la requête GET
    const response = await getXml(`/carts${query ? '?' + query : ''}`);
    // Renvoie le tableau normalisé des paniers
    return normalizeArray(response?.prestashop?.carts, 'cart');
}

/**
 * Récupère un seul panier précis via son ID.
 * 
 * @param {number|string} id L'identifiant du panier
 * @param {string|Object} params Paramètres optionnels (ex: display=full)
 */
export async function getCart(id, params = '') {
    // Formate la requête URL
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    // Exécute la requête GET sur un panier spécifique
    const response = await getXml(`/carts/${id}${query ? '?' + query : ''}`);
    // Retourne l'objet panier ou null s'il n'y a rien
    return response?.prestashop?.cart || null;
}

/**
 * Crée un nouveau panier vide ou pré-rempli dans PrestaShop.
 * 
 * @param {string|Object} payload Le contenu du panier (XML sous forme de texte ou objet JSON)
 */
export async function createCart(payload) {
    // Envoie la requête de création POST
    const response = await postXml('/carts', payload);
    // Retourne le panier créé (extrait de la réponse)
    return response?.prestashop?.cart || response;
}

/**
 * Met à jour un panier existant (ajoute/retire des produits, change l'adresse).
 * 
 * @param {number|string} id L'ID du panier
 * @param {string|Object} payload Les nouvelles données du panier
 */
export async function updateCart(id, payload) {
    // Exécute la requête PUT
    const response = await putXml(`/carts/${id}`, payload);
    // Retourne le panier mis à jour
    return response?.prestashop?.cart || response;
}

/**
 * Supprime physiquement un panier de la base de données.
 * 
 * @param {number|string} id L'ID du panier à supprimer
 */
export async function deleteCart(id) {
    // Exécute la requête DELETE
    return await deleteXml(`/carts/${id}`);
}

// Importation de getOrders indispensable pour savoir quels paniers ont été convertis en commande validée
import { getOrders } from '@/service/orderService'; 

/**
 * Récupère tous les paniers d'un client spécifique qui N'ONT PAS encore été convertis en commande (paniers abandonnés/en cours).
 * 
 * @param {number|string} customerId L'identifiant du client
 */
export async function getUnpaidCarts(customerId) {
    // Si pas d'ID client fourni, on retourne une liste vide par sécurité
    if (!customerId) {
        return [];
    }

    try {
        // 1. Récupération de toutes les commandes passées par ce client (on a juste besoin de l'ID commande et de l'ID du panier lié)
        const orders = await getOrders('filter[id_customer]=[' + customerId + ']&display=[id,id_cart]');

        // 2. Création d'une liste contenant uniquement les IDs des paniers qui sont liés à ces commandes (donc payés/validés)
        const paidCartIds = [];
        for (let i = 0; i < orders.length; i++) {
            const order = orders[i];
            let cartId = null;

            // PrestaShop XML renvoie parfois un objet au lieu d'une simple chaîne, on gère ce cas
            if (order.id_cart && typeof order.id_cart === 'object') {
                cartId = order.id_cart['#text'];
            } else {
                cartId = order.id_cart;
            }

            // Si on a bien trouvé l'ID du panier dans la commande, on l'ajoute à la liste noire des paniers validés
            if (cartId) {
                paidCartIds.push(String(cartId));
            }
        }

        // 3. Récupération de TOUS les paniers créés par ce client dans son historique
        const allCarts = await getCarts('filter[id_customer]=[' + customerId + ']&display=full');

        // 4. Boucle de filtrage pour retirer les paniers validés
        const unpaidCarts = [];
        for (let j = 0; j < allCarts.length; j++) {
            const cart = allCarts[j];
            let cartId = null;

            // Sécurité d'extraction de l'ID du panier en cours d'analyse
            if (cart.id && typeof cart.id === 'object') {
                cartId = cart.id['#text'];
            } else {
                cartId = cart.id;
            }

            // Vérifie si cet ID est présent dans la liste des paniers liés à une commande
            let isPaid = false;
            for (let k = 0; k < paidCartIds.length; k++) {
                if (paidCartIds[k] === String(cartId)) {
                    isPaid = true;
                }
            }

            // S'il n'est pas payé, on le conserve comme un panier actif/abandonné
            if (isPaid === false) {
                unpaidCarts.push(cart);
            }
        }

        // Retourne la liste filtrée
        return unpaidCarts;

    } catch (error) {
        // En cas de problème réseau ou XML, on loggue l'erreur et on retourne un tableau vide
        console.error("Erreur lors de la récupération des paniers non payés :", error);
        return [];
    }
}

/**
 * Regroupe tous les paniers non payés (abandonnés) d'un client en un seul et unique panier unifié.
 * (Fonctionnalité très utile si le client s'est connecté sur plusieurs appareils).
 * 
 * @param {number|string} customerId L'identifiant du client
 * @param {number|string} addressId L'adresse de livraison/facturation par défaut à utiliser
 */
export async function mergeUnpaidCarts(customerId, addressId) {
    // Récupère la liste de tous les paniers abandonnés du client
    const unpaidCarts = await getUnpaidCarts(customerId);

    // S'il n'y a qu'un seul panier ou aucun, une fusion n'a pas de sens
    if (unpaidCarts.length <= 1) {
        return null;
    }

    // Dictionnaire pour cumuler les produits identiques
    const mergedProducts = {};

    // Boucle sur chaque panier non payé
    for (let i = 0; i < unpaidCarts.length; i++) {
        const cart = unpaidCarts[i];

        // S'il y a des produits dans ce panier (cart_rows)
        if (cart.associations && cart.associations.cart_rows && cart.associations.cart_rows.cart_row) {
            let rows = cart.associations.cart_rows.cart_row;
            // Normalisation pour itérer correctement (tableau garanti)
            if (!Array.isArray(rows)) {
                rows = [rows];
            }

            // Boucle sur chaque ligne de produit du panier
            for (let j = 0; j < rows.length; j++) {
                const row = rows[j];

                // Extraction sécurisée de l'ID du produit
                let prodId = null;
                if (row.id_product && typeof row.id_product === 'object') {
                    prodId = row.id_product['#text'];
                } else {
                    prodId = row.id_product;
                }

                // Extraction sécurisée de l'ID de la déclinaison (ex: la taille/couleur)
                let attrId = 0;
                if (row.id_product_attribute) {
                    if (typeof row.id_product_attribute === 'object') {
                        attrId = row.id_product_attribute['#text'] || 0;
                    } else {
                        attrId = row.id_product_attribute;
                    }
                }

                // Extraction sécurisée de la quantité de ce produit
                let qty = 0;
                if (row.quantity && typeof row.quantity === 'object') {
                    qty = parseInt(row.quantity['#text'], 10) || 0;
                } else {
                    qty = parseInt(row.quantity, 10) || 0;
                }

                // Si c'est un produit valide
                if (prodId) {
                    // Création d'une clé unique Produit + Déclinaison
                    const productKey = prodId + '_' + attrId;
                    // Si ce produit exact est déjà dans notre dictionnaire fusionné, on additionne juste la quantité
                    if (mergedProducts[productKey]) {
                        mergedProducts[productKey].quantity += qty;
                    } else {
                        // Sinon, on l'ajoute comme nouvelle entrée
                        mergedProducts[productKey] = {
                            id_product: prodId,
                            id_product_attribute: attrId,
                            quantity: qty
                        };
                    }
                }
            }
        }
    }

    // Construction d'une chaîne XML pour représenter les lignes de ce nouveau méga-panier
    let cartRowsXml = '';
    const keys = Object.keys(mergedProducts);
    // Si finalement il n'y avait aucun produit dans tous ces paniers vides
    if (keys.length === 0) {
        return null;
    }

    // Boucle pour écrire chaque nœud <cart_row> du futur panier
    for (let k = 0; k < keys.length; k++) {
        const item = mergedProducts[keys[k]];
        cartRowsXml += '\n' +
            '                <cart_row>\n' +
            '                    <id_product>' + item.id_product + '</id_product>\n' +
            '                    <id_product_attribute>' + item.id_product_attribute + '</id_product_attribute>\n' +
            '                    <id_address_delivery>' + addressId + '</id_address_delivery>\n' +
            '                    <quantity>' + item.quantity + '</quantity>\n' +
            '                </cart_row>';
    }

    // Construction du document XML complet pour l'API PrestaShop
    const cartXmlPayload = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<prestashop>\n' +
        '    <cart>\n' +
        '        <id_customer>' + customerId + '</id_customer>\n' +
        '        <id_address_delivery>' + addressId + '</id_address_delivery>\n' +
        '        <id_address_invoice>' + addressId + '</id_address_invoice>\n' +
        '        <id_currency>1</id_currency>\n' +
        '        <id_lang>1</id_lang>\n' +
        '        <associations>\n' +
        '            <cart_rows>' + cartRowsXml + '\n' +
        '            </cart_rows>\n' +
        '        </associations>\n' +
        '    </cart>\n' +
        '</prestashop>';

    // 1. Appel API pour CRÉER le panier unifié
    const newCart = await createCart(cartXmlPayload);

    // 2. Nettoyage : Suppression définitive des anciens paniers éparpillés
    for (let m = 0; m < unpaidCarts.length; m++) {
        const oldCart = unpaidCarts[m];
        let oldCartId = null;
        if (oldCart.id && typeof oldCart.id === 'object') {
            oldCartId = oldCart.id['#text'];
        } else {
            oldCartId = oldCart.id;
        }
        if (oldCartId) {
            // Suppression via l'API
            await deleteCart(oldCartId);
        }
    }

    // Retourne le nouveau panier unique créé
    return newCart;
}

/**
 * Fonction interne pour extraire en toute sécurité les lignes de produits (rows) d'un panier
 * 
 * @param {Object} cart L'objet panier
 */
function getRowsFromCart(cart) {
    const assoc = cart?.associations;
    if (!assoc || !assoc.cart_rows) return [];
    const rawRows = assoc.cart_rows.cart_row || assoc.cart_rows;
    // Retourne un tableau structuré, même s'il n'y a qu'un seul élément ou rien
    return Array.isArray(rawRows) ? rawRows : (rawRows && typeof rawRows === 'object' ? [rawRows] : []);
}

/**
 * Récupère le tout dernier panier non payé d'un client et le formate pour correspondre 
 * au format du panier local (localStorage / Vuex). Utile au moment du Login.
 * 
 * @param {number|string} customerId L'ID du client
 */
export async function syncAndGetLatestCart(customerId) {
    // Sécurité: Si pas de client, on retourne un panier vide
    if (!customerId) return [];

    // Récupère les paniers non payés
    const myUnpaidCarts = await getUnpaidCarts(customerId);

    // Trie les paniers du plus récent au plus ancien en se basant sur l'ID (le plus grand ID = le plus récent)
    myUnpaidCarts.sort(function (a, b) {
        let idA = parseInt(extractText(a.id), 10) || 0;
        let idB = parseInt(extractText(b.id), 10) || 0;
        return idB - idA;
    });

    // S'il possède au moins un panier non payé
    if (myUnpaidCarts.length > 0) {
        // Sélectionne le tout dernier
        let latestCart = myUnpaidCarts[0];
        // Extrait ses produits
        let rows = getRowsFromCart(latestCart);

        if (rows.length > 0) {
            const mappedItems = [];
            // Boucle sur les produits pour les reformater dans un schéma plus simple (sans fioritures XML)
            for (let x = 0; x < rows.length; x++) {
                const r = rows[x];
                const idProd = extractText(r.id_product);

                if (idProd) {
                    mappedItems.push({
                        id_product: idProd,
                        id_product_attribute: extractText(r.id_product_attribute) || 0,
                        quantity: parseInt(extractText(r.quantity), 10) || 1
                    });
                }
            }
            // Retourne le contenu simplifié
            return mappedItems;
        }
    }
    // S'il n'a pas de panier ou qu'il est vide
    return [];
}

/**
 * Supprime explicitement tous les paniers non payés d'un client.
 * (Peut servir de "vider mon panier complètement" ou lors de maintenances de session).
 * 
 * @param {number|string} customerId L'ID du client ciblé
 */
export async function clearAllUnpaidCarts(customerId) {
    if (!customerId) return;
    try {
        // Liste les paniers abandonnés
        const carts = await getUnpaidCarts(customerId);
        // Boucle et les supprime un par un
        for (const cart of carts) {
            const cartId = extractText(cart.id);
            if (cartId) {
                await deleteCart(cartId);
            }
        }
    } catch (e) {
        // Ignore silencieusement l'erreur dans la console pour ne pas bloquer l'UI
        console.warn('Erreur nettoyage panier API:', e);
    }
}