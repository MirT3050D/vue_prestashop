// Importations liées aux commandes et aux statuts de l'API
import { getOrders, getOrderStates, updateOrderStatus } from '@/service/orderService';
// Importation des paniers pour gérer la liste des commandes non finalisées
import { getCarts } from '@/service/cartService';
// Fonctions réseau brutes (GET/POST)
import { getXml, postXml } from '@/service/api';
// Utilitaires de parsage
import { extractText } from '@/service/prestashopUtils';
// Fonction critique issue de checkoutService pour impacter le stock de manière agressive
import { forceUpdateStockAvailable } from '@/service/checkoutService';

/**
 * Assure qu'un identifiant (ID) est toujours retourné sous forme de chaîne de caractères (String), 
 * qu'il provienne d'un objet XML encapsulé {'#text': '12'} ou d'un nombre brut (12).
 * 
 * @param {any} id La valeur potentielle de l'ID
 */
export function normalizeId(id) {
  if (id && typeof id === 'object') {
    if (id['#text'] !== undefined && id['#text'] !== null) {
      return String(id['#text']);
    }
    return String(id);
  }
  if (id !== undefined && id !== null) {
    return String(id);
  }
  return '';
}

/**
 * Extrait les lignes de produits (rows) d'un panier PrestaShop en gérant les anomalies de structure XML.
 * Retourne toujours un tableau vide ou un tableau d'objets.
 * 
 * @param {Object} cart L'objet panier issu de l'API
 */
export function getCartRows(cart) {
  let rows = [];
  if (cart && cart.associations && cart.associations.cart_rows && cart.associations.cart_rows.cart_row) {
    rows = cart.associations.cart_rows.cart_row;
  }
  
  if (Array.isArray(rows)) {
    return rows;
  }
  
  if (rows) {
    return [rows]; // Si objet unique, l'encapsule dans un tableau
  }
  
  return [];
}

/**
 * Convertit fiablement une valeur en nombre flottant (pour les prix, quantités).
 * Gère les valeurs nulles, et transforme les virgules en points (format français).
 * 
 * @param {any} value La valeur à convertir
 */
export function toNumber(value) {
  if (value == null) {
    return 0;
  }
  const parsed = parseFloat(String(value).replace(',', '.'));
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return 0;
}

/**
 * Extrait les lignes de produits (rows) d'une commande (Order) de façon sécurisée.
 * 
 * @param {Object} order L'objet commande issu de l'API
 */
export function getOrderRows(order) {
  let rows = [];
  if (order && order.associations && order.associations.order_rows && order.associations.order_rows.order_row) {
    rows = order.associations.order_rows.order_row;
  }
  
  if (Array.isArray(rows)) {
    return rows;
  }
  return [rows];
}

// Les statuts "cibles" essentiels au workflow du Back-Office
export const TARGET_STATE_NAMES = ['paiement accepté', 'annulé', 'livré'];

/**
 * Fonction géante d'agrégation pour le Dashboard Back-Office "Liste des Commandes".
 * Elle charge toutes les commandes, tous les paniers non transformés, et les fusionne dans un même tableau pour la vue Vue.js.
 */
export async function fetchOrderListData() {
  // Parallélisation de requêtes lourdes (Gain de temps réseau)
  const [ordersData, statesData, cartsData] = await Promise.all([
    getOrders({ display: 'full' }),
    getOrderStates(),
    getCarts({ display: 'full' })
  ]);

  // Construit un dictionnaire (Set) ultra-rapide des IDs de paniers qui ont déjà été convertis en vraie commande
  const convertedCartIds = new Set(
    ordersData
      .map(order => normalizeId(order.id_cart))
      .filter(id => id && id !== '0')
  );

  // Filtre les paniers : On ne garde que ceux qui (1) n'ont pas de commande rattachée et (2) ne sont pas vides
  const activeCarts = cartsData.filter(cart => {
    if (convertedCartIds.has(normalizeId(cart.id))) {
      return false;
    }
    const rows = getCartRows(cart);
    return rows.length > 0;
  });

  // Transforme (Mock) les vrais "Paniers" pour qu'ils aient la même structure d'objet JSON qu'une "Commande"
  const normalizedCarts = activeCarts.map(cart => {
    let customerData = null;
    if (cart.customer) {
      customerData = cart.customer;
    }

    return {
      id: normalizeId(cart.id),
      reference: `PANIER #${normalizeId(cart.id)}`, // Affiche une fausse référence
      id_customer: cart.id_customer,
      total_paid: 0, // Un panier n'est pas encore payé
      current_state: 'dans_le_panier', // Statut inventé de toutes pièces
      isCart: true, // Flag pour différencier les vraies commandes des paniers
      customer: customerData
    };
  });

  // Fusionne le tableau des vraies commandes et le tableau des faux paniers
  const orders = [...ordersData, ...normalizedCarts];
  // Trie par ID décroissant (Le plus récent en haut)
  orders.sort((orderA, orderB) => orderB.id - orderA.id);
  
  // Prépare les dictionnaires de correspondance pour les Statuts de commandes (Id vers Nom, Id vers Couleur)
  const stateNameMapping = new Map();
  const stateColorMapping = new Map();
  const stateIdByNameLower = new Map();
  const targetStates = [];

  // Boucle de construction des maps
  statesData.forEach(state => {
    let langNode = null;
    if (state.name && state.name.language) {
      langNode = state.name.language;
    }
    
    let stateText = '';
    if (Array.isArray(langNode)) {
      if (langNode[0] && langNode[0]['#text']) {
        stateText = langNode[0]['#text'];
      }
    } else if (langNode && typeof langNode === 'object') {
      if (langNode['#text']) {
        stateText = langNode['#text'];
      }
    } else if (typeof langNode === 'string') {
      stateText = langNode;
    }
    
    const stateName = stateText.toLowerCase();
    const idKey = normalizeId(state.id);
    
    stateNameMapping.set(idKey, stateText);
    stateColorMapping.set(idKey, state.color);
    stateIdByNameLower.set(stateName, idKey);

    // Si le statut fait partie des cibles principales (ex: livré, payé), on le met de côté
    if (TARGET_STATE_NAMES.includes(stateName)) {
      targetStates.push(state);
    }
  });

  // Retourne un objet massif prêt à être digéré par le composant Vue (DataTable)
  return { orders, statesData, targetStates, stateNameMapping, stateColorMapping, stateIdByNameLower };
}

/**
 * Moteur de recherche et de filtrage pour le tableau des commandes.
 * 
 * @param {Array} orders La liste des commandes fusionnées
 * @param {string} statusFilter Un ID de statut pour filtrer (optionnel)
 * @param {string} searchQuery Un texte tapé par l'utilisateur (nom, ID, ref)
 */
export function filterOrdersList(orders, statusFilter, searchQuery) {
  return orders.filter(order => {
    // 1. Filtre par statut (Menu déroulant)
    if (statusFilter && statusFilter !== '') {
      if (normalizeId(order.current_state) !== statusFilter) {
        return false;
      }
    }
    
    // 2. Filtre par texte (Barre de recherche)
    if (searchQuery && searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      const idMatch = normalizeId(order.id).toLowerCase().includes(query);
      const refMatch = normalizeId(order.reference).toLowerCase().includes(query);
      
      let customerMatch = false;
      // Cherche dans le prénom/nom si le client est injecté
      if (order.customer && order.customer.firstname) {
        const fullName = `${order.customer.firstname} ${order.customer.lastname}`;
        customerMatch = fullName.toLowerCase().includes(query);
      } else {
        // Sinon cherche bêtement par ID de client
        const customerId = normalizeId(order.id_customer);
        customerMatch = customerId.includes(query);
      }
      
      // Si rien ne correspond, on élimine la ligne
      if (!idMatch && !refMatch && !customerMatch) {
        return false;
      }
    }
    return true; // La ligne survit aux filtres
  });
}

/**
 * Vérifie si l'ID d'état fourni correspond à l'état "Livré" (selon le dictionnaire).
 */
export function isDeliveredState(stateId, stateIdByNameLower) {
  const deliveredId = stateIdByNameLower.get('livré');
  if (deliveredId && normalizeId(stateId) === deliveredId) {
    return true;
  }
  return false;
}

/**
 * Vérifie si l'ID d'état fourni correspond à l'état "Annulé".
 */
export function isCanceledState(stateId, stateIdByNameLower) {
  const canceledId = stateIdByNameLower.get('annulé');
  if (canceledId && normalizeId(stateId) === canceledId) {
    return true;
  }
  return false;
}

/**
 * Rapatrie le nom textuel depuis l'ID d'état (Gère le cas fictif "dans_le_panier").
 */
export function getStatusName(stateId, stateNameMapping) {
  if (stateId === 'dans_le_panier') {
    return 'Dans le panier';
  }
  const idKey = normalizeId(stateId);
  const name = stateNameMapping.get(idKey);
  if (name) {
    return name;
  }
  return 'Inconnu';
}

/**
 * Rapatrie la couleur depuis l'ID d'état.
 */
export function getStatusColor(stateId, stateColorMapping) {
  if (stateId === 'dans_le_panier') {
    return '#94a3b8'; // Slate
  }
  const idKey = normalizeId(stateId);
  const color = stateColorMapping.get(idKey);
  if (color) {
    return color;
  }
  return '#cccccc'; // Default gris
}

/**
 * Fonction ULTRA-CRITIQUE (Back-Office). 
 * Quand une commande passe au statut "Livré", cette fonction est appelée pour retirer DÉFINITIVEMENT
 * les produits du stock physique de l'entrepôt, et ajouter une trace comptable du mouvement.
 * 
 * @param {string} productId ID du produit
 * @param {string} attributeId Déclinaison
 * @param {number} quantity Quantité vendue (à décrémenter)
 * @param {string} orderId ID de la commande liée (pour la tracabilité)
 */
export async function decrementPhysicalStock(productId, attributeId, quantity, orderId) {
    try {
        const attrFilter = attributeId ? attributeId : 0;
        // Trouve la ligne de stock en BDD
        const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${productId}]&filter[id_product_attribute]=[${attrFilter}]&display=full`);
        let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

        if (stockAvailable) {
            if (Array.isArray(stockAvailable)) {
                stockAvailable = stockAvailable[0];
            }
            
            // Note: On ne modifie PAS `quantity` (stock vendable/virtuel), car PrestaShop l'a déjà fait au moment du paiement
            const currentQty = parseInt(extractText(stockAvailable.quantity), 10) || 0;
            
            // On manipule le stock PHYSIQUE et RÉSERVÉ (logistique entrepôt)
            let physicalQty = parseInt(extractText(stockAvailable.physical_quantity), 10);
            if (isNaN(physicalQty)) {
                // Fallback de survie si l'API est défaillante
                physicalQty = currentQty + quantity; 
            }
            const newPhysicalQty = physicalQty - quantity;
            
            let reservedQty = parseInt(extractText(stockAvailable.reserved_quantity), 10) || 0;
            let newReservedQty = reservedQty - quantity;
            if (newReservedQty < 0) {
                newReservedQty = 0;
            }

            // Mise à jour massive de la ressource stock_available
            await forceUpdateStockAvailable(stockAvailable, currentQty, newPhysicalQty, newReservedQty);

            // Création d'une ligne d'historique (stock_mvt) pour dire: "L'employé a sorti X unités pour la commande Y"
            const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const baseXml = `
                <id_order><![CDATA[${productId}]]></id_order> <!-- Erreur probable dans l'application d'origine : id_order prend le productId -->
                <id_supply_order><![CDATA[${attrFilter}]]></id_supply_order> <!-- Pareil, utilisation détournée de champs -->
                <id_employee><![CDATA[1]]></id_employee>
                <id_stock><![CDATA[0]]></id_stock>
                <id_stock_mvt_reason><![CDATA[3]]></id_stock_mvt_reason> <!-- Raison 3 = Sortie pour commande -->
                <physical_quantity><![CDATA[${quantity}]]></physical_quantity>
                <sign><![CDATA[0]]></sign> <!-- 0 = Retrait, 1 = Ajout en XML MVT -->
                <price_te><![CDATA[0.000000]]></price_te>
                <date_add><![CDATA[${dateAdd}]]></date_add>
            `;
            await postXml('/stock_movements', `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop><stock_mvt>${baseXml}</stock_mvt></prestashop>`);
        }
    } catch (e) {
        console.warn(`Erreur décrémentation physique: ${e.message}`);
    }
}

/**
 * Orchestrateur appelé lorsqu'un administrateur change le statut d'une commande via un Dropdown.
 * Vérifie les règles métiers (ex: "Une commande livrée ne peut plus reculer", "Annuler sans être payé, interdit").
 * Déclenche les actions logistiques (comme `decrementPhysicalStock`) si besoin.
 */
export async function processOrderStatusChange(orderId, newStateId, orders, stateIdByNameLower) {
  // Sécurité: Refuse les entrées invalides
  if (!newStateId) {
    return { success: false };
  }

  // Trouve la commande ciblée
  const orderToUpdate = orders.find(orderItem => String(orderItem.id) === String(orderId));
  // Sécurité: Si introuvable ou si c'est un faux panier (isCart), refuse l'opération
  if (!orderToUpdate || orderToUpdate.isCart) {
    return { success: false };
  }

  // Récupération des IDs critiques depuis le dictionnaire (en Minuscule)
  const deliveredId = stateIdByNameLower.get('livré');
  const canceledId = stateIdByNameLower.get('annulé');
  const paidId = stateIdByNameLower.get('paiement accepté');

  // --- REGLES METIERS / VERROUS ---

  // 1. Verrou anti-recul : Une commande livrée est finale (le colis a quitté l'entrepôt)
  if (deliveredId && normalizeId(orderToUpdate.current_state) === deliveredId && normalizeId(newStateId) !== deliveredId) {
    return { success: false, error: 'Cette commande est déjà livrée. Changement impossible.' };
  }

  // 2. Verrou logique d'annulation : Le workflow impose qu'on ne peut annuler qu'une commande qui a été "payée" (en tout cas selon cette implémentation)
  if (canceledId && normalizeId(newStateId) === canceledId) {
    if (!paidId || normalizeId(orderToUpdate.current_state) !== paidId) {
      return { success: false, error: 'Seules les commandes payées peuvent être annulées.' };
    }
  }

  // --- APPLICATION ---
  
  // Appel API pour envoyer le changement de statut vers PrestaShop
  await updateOrderStatus(orderId, newStateId);
  
  // LOGISTIQUE: Si l'admin a basculé vers "Livré", c'est maintenant qu'on tape dans le stock d'entrepôt (Physical)
  if (deliveredId && normalizeId(newStateId) === deliveredId) {
    const rows = getOrderRows(orderToUpdate);
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const pId = row.product_id;
        const attrId = row.product_attribute_id;
        const qty = parseInt(row.product_quantity, 10) || 0;
        // Décrémente chaque produit ligne par ligne
        await decrementPhysicalStock(pId, attrId, qty, orderId);
    }
  }
  
  return { success: true, orderToUpdate };
}
