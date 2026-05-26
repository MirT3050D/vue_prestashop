import { getOrders, getOrderStates, updateOrderStatus } from '@/service/orderService';
import { getCarts } from '@/service/cartService';
import { getXml, postXml } from '@/service/api';
import { extractText } from '@/service/prestashopUtils';
import { forceUpdateStockAvailable } from '@/service/checkoutService';
import { getProduct } from '@/service/productService';

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

export function getCartRows(cart) {
  let rows = [];
  if (cart && cart.associations && cart.associations.cart_rows && cart.associations.cart_rows.cart_row) {
    rows = cart.associations.cart_rows.cart_row;
  }
  
  if (Array.isArray(rows)) {
    return rows;
  }
  
  if (rows) {
    return [rows];
  }
  
  return [];
}

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

export const TARGET_STATE_NAMES = ['paiement accepté', 'annulé', 'livré'];

export async function fetchOrderListData() {
  const [ordersData, statesData, cartsData] = await Promise.all([
    getOrders({ display: 'full' }),
    getOrderStates(),
    getCarts({ display: 'full' })
  ]);

  const convertedCartIds = new Set(
    ordersData
      .map(order => normalizeId(order.id_cart))
      .filter(id => id && id !== '0')
  );

  const activeCarts = cartsData.filter(cart => {
    if (convertedCartIds.has(normalizeId(cart.id))) {
      return false;
    }
    const rows = getCartRows(cart);
    return rows.length > 0;
  });

  // On utilise Promise.all car la récupération des produits est asynchrone
  const normalizedCarts = await Promise.all(activeCarts.map(async cart => {
    let customerData = null;
    if (cart.customer) {
      customerData = cart.customer;
    }

    const cartRows = getCartRows(cart);
    let total_paid = 0;
    const order_row = [];

    // On parcourt chaque produit du panier pour récupérer son nom et son prix via l'API
    for (const row of cartRows) {
      const productId = normalizeId(row.id_product);
      const quantity = parseInt(normalizeId(row.quantity), 10) || 0;
      
      let productName = `Produit #${productId}`;
      let productRef = '';
      let unitPrice = 0;

      if (productId) {
        try {
          // Appel à l'API pour récupérer les infos complètes du produit
          const productData = await getProduct(productId);
          if (productData) {
            // Extraction sécurisée du nom du produit (gestion du format XML multilingue)
            if (productData.name && productData.name.language) {
               const lang = productData.name.language;
               productName = Array.isArray(lang) ? (lang[0]['#text'] || lang[0]) : (lang['#text'] || lang);
            } else if (typeof productData.name === 'string') {
               productName = productData.name;
            }
            
            // Extraction de la référence
            if (productData.reference && typeof productData.reference === 'object') {
                productRef = productData.reference['#text'] || '';
            } else {
                productRef = productData.reference || '';
            }
            
            // Extraction du prix (on récupère le prix de base du produit)
            if (productData.price && typeof productData.price === 'object') {
                unitPrice = parseFloat(productData.price['#text']) || 0;
            } else {
                unitPrice = parseFloat(productData.price) || 0;
            }
          }
        } catch (e) {
          console.warn(`Erreur lors de la récupération du produit ${productId} pour le panier ${cart.id}:`, e.message);
        }
      }

      // Ajout au total du panier (prix * quantité)
      total_paid += unitPrice * quantity;

      // On formate la ligne pour qu'elle ait exactement la même structure qu'une ligne de commande (order_row)
      // Cela permet à la vue OrderListView.vue de l'afficher sans aucune modification
      order_row.push({
        id: productId,
        product_id: productId,
        product_attribute_id: normalizeId(row.id_product_attribute),
        product_name: productName,
        product_reference: productRef,
        product_quantity: quantity,
        unit_price_tax_excl: unitPrice,
        unit_price_tax_incl: unitPrice, // Simplification : on met le même prix en TTC
      });
    }

    return {
      id: normalizeId(cart.id),
      reference: `PANIER #${normalizeId(cart.id)}`,
      id_customer: cart.id_customer,
      total_paid: total_paid,
      current_state: 'dans_le_panier',
      isCart: true,
      customer: customerData,
      // Ajout de l'objet associations pour imiter la structure d'une commande
      associations: {
        order_rows: {
          order_row: order_row
        }
      }
    };
  }));

  const orders = [...ordersData, ...normalizedCarts];
  orders.sort((orderA, orderB) => orderB.id - orderA.id);
  
  const stateNameMapping = new Map();
  const stateColorMapping = new Map();
  const stateIdByNameLower = new Map();
  const targetStates = [];

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

    if (TARGET_STATE_NAMES.includes(stateName)) {
      targetStates.push(state);
    }
  });

  return { orders, statesData, targetStates, stateNameMapping, stateColorMapping, stateIdByNameLower };
}

export function filterOrdersList(orders, statusFilter, searchQuery) {
  return orders.filter(order => {
    if (statusFilter && statusFilter !== '') {
      if (normalizeId(order.current_state) !== statusFilter) {
        return false;
      }
    }
    
    if (searchQuery && searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      const idMatch = normalizeId(order.id).toLowerCase().includes(query);
      const refMatch = normalizeId(order.reference).toLowerCase().includes(query);
      
      let customerMatch = false;
      if (order.customer && order.customer.firstname) {
        const fullName = `${order.customer.firstname} ${order.customer.lastname}`;
        customerMatch = fullName.toLowerCase().includes(query);
      } else {
        const customerId = normalizeId(order.id_customer);
        customerMatch = customerId.includes(query);
      }
      
      if (!idMatch && !refMatch && !customerMatch) {
        return false;
      }
    }
    return true;
  });
}

export function isDeliveredState(stateId, stateIdByNameLower) {
  const deliveredId = stateIdByNameLower.get('livré');
  if (deliveredId && normalizeId(stateId) === deliveredId) {
    return true;
  }
  return false;
}

export function isCanceledState(stateId, stateIdByNameLower) {
  const canceledId = stateIdByNameLower.get('annulé');
  if (canceledId && normalizeId(stateId) === canceledId) {
    return true;
  }
  return false;
}

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

export function getStatusColor(stateId, stateColorMapping) {
  if (stateId === 'dans_le_panier') {
    return '#94a3b8';
  }
  const idKey = normalizeId(stateId);
  const color = stateColorMapping.get(idKey);
  if (color) {
    return color;
  }
  return '#cccccc';
}

export async function decrementPhysicalStock(productId, attributeId, quantity, orderId) {
    try {
        const attrFilter = attributeId ? attributeId : 0;
        const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${productId}]&filter[id_product_attribute]=[${attrFilter}]&display=full`);
        let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

        if (stockAvailable) {
            if (Array.isArray(stockAvailable)) {
                stockAvailable = stockAvailable[0];
            }
            
            const currentQty = parseInt(extractText(stockAvailable.quantity), 10) || 0;
            
            let physicalQty = parseInt(extractText(stockAvailable.physical_quantity), 10);
            if (isNaN(physicalQty)) {
                physicalQty = currentQty + quantity; 
            }
            const newPhysicalQty = physicalQty - quantity;
            
            let reservedQty = parseInt(extractText(stockAvailable.reserved_quantity), 10) || 0;
            let newReservedQty = reservedQty - quantity;
            if (newReservedQty < 0) {
                newReservedQty = 0;
            }

            await forceUpdateStockAvailable(stockAvailable, currentQty, newPhysicalQty, newReservedQty);

            const dateAdd = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const baseXml = `
                <id_order><![CDATA[${productId}]]></id_order>
                <id_supply_order><![CDATA[${attrFilter}]]></id_supply_order>
                <id_employee><![CDATA[1]]></id_employee>
                <id_stock><![CDATA[0]]></id_stock>
                <id_stock_mvt_reason><![CDATA[3]]></id_stock_mvt_reason>
                <physical_quantity><![CDATA[${quantity}]]></physical_quantity>
                <sign><![CDATA[0]]></sign>
                <price_te><![CDATA[0.000000]]></price_te>
                <date_add><![CDATA[${dateAdd}]]></date_add>
            `;
            await postXml('/stock_movements', `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop><stock_mvt>${baseXml}</stock_mvt></prestashop>`);
        }
    } catch (e) {
        console.warn(`Erreur décrémentation physique: ${e.message}`);
    }
}

export async function processOrderStatusChange(orderId, newStateId, orders, stateIdByNameLower) {
  if (!newStateId) {
    return { success: false };
  }

  const orderToUpdate = orders.find(orderItem => String(orderItem.id) === String(orderId));
  if (!orderToUpdate || orderToUpdate.isCart) {
    return { success: false };
  }

  const deliveredId = stateIdByNameLower.get('livré');
  const canceledId = stateIdByNameLower.get('annulé');
  const paidId = stateIdByNameLower.get('paiement accepté');

  if (deliveredId && normalizeId(orderToUpdate.current_state) === deliveredId && normalizeId(newStateId) !== deliveredId) {
    return { success: false, error: 'Cette commande est déjà livrée. Changement impossible.' };
  }

  if (canceledId && normalizeId(newStateId) === canceledId) {
    if (!paidId || normalizeId(orderToUpdate.current_state) !== paidId) {
      return { success: false, error: 'Seules les commandes payées peuvent être annulées.' };
    }
  }

  await updateOrderStatus(orderId, newStateId);
  
  // If the new state is Delivered, decrement physical stock and create movement
  if (deliveredId && normalizeId(newStateId) === deliveredId) {
    const rows = getOrderRows(orderToUpdate);
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const pId = row.product_id;
        const attrId = row.product_attribute_id;
        const qty = parseInt(row.product_quantity, 10) || 0;
        await decrementPhysicalStock(pId, attrId, qty, orderId);
    }
  }
  
  return { success: true, orderToUpdate };
}
