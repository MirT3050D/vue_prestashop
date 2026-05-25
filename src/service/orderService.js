// Importation des méthodes de base (CRUD) pour les requêtes HTTP vers l'API XML
import { getXml, postXml, putXml, deleteXml } from '@/service/api';

/**
 * Normalise les nœuds de ressources PrestaShop pour s'assurer de toujours manipuler un tableau.
 * 
 * @param {Object} node Le nœud parent (ex: response.prestashop.orders)
 * @param {string} singularKey La clé de l'élément (ex: 'order')
 */
function normalizeArray(node, singularKey) {
    if (!node || node === '') return [];
    const list = node[singularKey];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
}

/**
 * Récupère l'ensemble des commandes de la boutique.
 * 
 * @param {string|Object} params Paramètres de filtrage optionnels (par défaut: display=full)
 */
export async function getOrders(params = 'display=full') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/orders${query ? '?' + query : ''}`);
    return normalizeArray(response?.prestashop?.orders, 'order');
}

/**
 * Récupère uniquement les commandes passées par un client spécifique.
 * Très utile pour la page "Historique de mes commandes" côté Front-Office.
 * 
 * @param {string|number} customerId L'identifiant du client
 */
export async function getCustomerOrders(customerId) {
    if (!customerId) return [];
    // Filtre les commandes par l'ID du client en utilisant la syntaxe native PrestaShop filter[id]=[]
    return await getOrders(`display=full&filter[id_customer]=[${customerId}]`);
}

/**
 * Récupère le détail complet d'une seule commande via son ID.
 * 
 * @param {string|number} id L'ID de la commande
 * @param {string|Object} params Paramètres optionnels
 */
export async function getOrder(id, params = '') {
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    const response = await getXml(`/orders/${id}${query ? '?' + query : ''}`);
    return response?.prestashop?.order || null;
}

/**
 * Crée une nouvelle commande sur l'API (Ressource très complexe, généralement gérée par checkoutService).
 * 
 * @param {string|Object} payload Le payload XML complet de l'objet <order>
 */
export async function createOrder(payload) {
    const response = await postXml('/orders', payload);
    return response?.prestashop?.order || response;
}

/**
 * Met à jour une commande existante (Globalement déconseillé, privilégier l'historique d'état).
 */
export async function updateOrder(id, payload) {
    const response = await putXml(`/orders/${id}`, payload);
    return response?.prestashop?.order || response;
}

/**
 * Supprime une commande de la BDD (Action dangereuse, rare en e-commerce).
 */
export async function deleteOrder(id) {
    return await deleteXml(`/orders/${id}`);
}

/**
 * Récupère la liste de tous les statuts possibles d'une commande configurés dans PrestaShop 
 * (ex: En cours, Livré, Annulé, Paiement accepté...).
 */
export async function getOrderStates() {
    const response = await getXml('/order_states?display=full');
    return normalizeArray(response?.prestashop?.order_states, 'order_state');
}

/**
 * Modifie le statut d'une commande (ex: passer de "En préparation" à "Livré").
 * ATTENTION: Dans PrestaShop, on ne fait pas un PUT sur la commande pour changer le statut. 
 * On POST un nouvel "historique" (order_history) qui fera basculer l'état actuel de la commande automatiquement.
 * Cela permet de tracer qui a changé l'état et quand.
 * 
 * @param {string} orderId L'ID de la commande à mettre à jour
 * @param {string} newStateId L'ID du nouveau statut désiré
 * @param {Object} options Options supplémentaires pour l'employé
 */
export async function updateOrderStatus(orderId, newStateId, options = {}) {
    const stateId = String(newStateId);
    
    // Certains statuts très spécifiques (comme 5 ou 6, ex: Annulé ou Livré selon les config) 
    // peuvent avoir un endpoint backend custom créé par un développeur tiers.
    const useCustomEndpoint = stateId === '5' || stateId === '6';

    if (useCustomEndpoint) {
        // Envoi vers un web-service customisé
        const { employeeId = 0, date = '' } = options;
        const payload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <manual_order_state>
        <id_order>${orderId}</id_order>
        <id_order_state>${newStateId}</id_order_state>
        <id_employee>${employeeId}</id_employee>
        <date>${date}</date>
    </manual_order_state>
</prestashop>`;

        return await postXml('/custom_order_state', payload);
    }

    // VOIE NATIVE STANDARD : Création d'une ligne d'historique
    const payload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <order_history>
        <id_order>${orderId}</id_order>
        <id_order_state>${newStateId}</id_order_state>
    </order_history>
</prestashop>`;

    // Appelle la ressource `order_histories` pour déclencher le changement d'état
    return await postXml('/order_histories', payload);
}

/**
 * Alias de compatibilité pour updateOrderStatus
 */
export async function updateOrderStatusByHistory(orderId, newStateId) {
    return await updateOrderStatus(orderId, newStateId);
}

/**
 * Parse les statuts de commandes bruts (XML JSONifié) pour construire des "Maps" rapides en mémoire.
 * Cela permet d'afficher rapidement le texte et la couleur d'un badge statut sans devoir boucler.
 * 
 * @param {Array} statesData Les données brutes issues de getOrderStates()
 * @returns {{ nameMap: Map, colorMap: Map, idByNameLower: Map }} Trois dictionnaires (Clé->Valeur) utiles
 */
export function parseOrderStates(statesData) {
    const nameMap = new Map(); // Permet d'obtenir un Nom depuis un ID
    const colorMap = new Map(); // Permet d'obtenir une Couleur HTML depuis un ID
    const idByNameLower = new Map(); // Permet d'obtenir un ID depuis un nom (minuscule)

    // Boucle de construction des dictionnaires
    for (let i = 0; i < statesData.length; i++) {
        const state = statesData[i];
        const langNode = state.name?.language;
        let stateText = '';
        
        // Extraction multilingue sécurisée
        if (Array.isArray(langNode)) {
            stateText = langNode[0]['#text'] || '';
        } else if (langNode && typeof langNode === 'object') {
            stateText = langNode['#text'] || '';
        } else if (typeof langNode === 'string') {
            stateText = langNode;
        }

        // Nettoyage de l'ID XML
        const idKey = typeof state.id === 'object' ? String(state.id['#text'] ?? state.id) : String(state.id ?? '');
        
        // Remplissage des Maps
        nameMap.set(idKey, stateText);
        colorMap.set(idKey, state.color); // Ex: "#FF0000" pour rouge
        idByNameLower.set(stateText.toLowerCase(), idKey);
    }

    return { nameMap, colorMap, idByNameLower };
}

/**
 * Extrait le nom d'un statut via son ID, en utilisant la Map pré-calculée.
 * 
 * @param {string} stateId L'ID de l'état
 * @param {Map} nameMap Le dictionnaire des noms
 */
export function getStateName(stateId, nameMap) {
    // Cas spécial géré par l'application locale
    if (stateId === 'dans_le_panier') return 'Dans le panier';
    // Extraction sécurisée de l'ID XML
    const idKey = typeof stateId === 'object' ? String(stateId['#text'] ?? stateId) : String(stateId ?? '');
    return nameMap.get(idKey) || 'Inconnu';
}

/**
 * Extrait la couleur HEX (#XXXXXX) d'un statut via son ID, en utilisant la Map pré-calculée.
 * Parfait pour colorier les badges "En cours" "Annulé" etc.
 */
export function getStateColor(stateId, colorMap) {
    // Cas spécial pour les paniers non convertis
    if (stateId === 'dans_le_panier') return '#94a3b8'; // Gris slate
    // Extraction sécurisée de l'ID XML
    const idKey = typeof stateId === 'object' ? String(stateId['#text'] ?? stateId) : String(stateId ?? '');
    return colorMap.get(idKey) || '#cccccc'; // Gris par défaut
}
