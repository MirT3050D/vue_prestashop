// Importation d'une fonction utilitaire pour extraire proprement du texte d'objets XML
import { extractText } from '@/service/prestashopUtils';
// Importation des appels API de base (GET, POST, PUT) et de la récupération de configuration globale
import { getXml, postXml, putXml, getPrestaShopConfig } from '@/service/api';
// Importation de la vérification des stocks depuis le service des stocks
import { getStockAvailables } from '@/service/stockService';
// Importation des fonctions liées aux adresses client (récupération et création)
import { getCustomerAddresses, createAddress } from '@/service/addressService';
// Importation de la fonction pour créer physiquement un panier sur l'API distante
import { createCart } from '@/service/cartService';
// Importation des fonctions liées aux commandes (création, historique, statuts)
import { createOrder, getOrderStates, updateOrderStatusByHistory, getOrder } from '@/service/orderService';
// Importation de la récupération des détails d'un client
import { getCustomer } from '@/service/customerService';

/**
 * Recherche l'ID du statut de commande "Paiement à la livraison" (COD - Cash on Delivery).
 * L'algorithme vérifie d'abord si une variable de configuration explicite existe (PS_OS_COD_VALIDATION).
 * Sinon, il scanne la liste de tous les statuts pour trouver un nom correspondant ("cash on delivery", "cod", etc.).
 * 
 * @returns {Promise<number>} L'ID du statut trouvé (par défaut 2 si introuvable)
 */
export async function findCodStateId() {
    try {
        // 1. Tente de récupérer la valeur depuis la configuration PrestaShop
        const config = await getPrestaShopConfig('PS_OS_COD_VALIDATION');
        const configuredStateId = Number(extractText(config?.value));
        // Si elle existe et est valide (> 0), on la retourne immédiatement
        if (configuredStateId > 0) return configuredStateId;

        // 2. Fallback : Télécharge la liste complète de tous les états de commande possibles
        const states = await getOrderStates();
        if (!states) return 2; // Statut 2 par défaut (souvent "Paiement accepté")

        // Boucle sur chaque statut pour chercher des mots-clés
        for (let i = 0; i < states.length; i++) {
            // Vérifie d'abord si c'est rattaché au module de paiement 'ps_cashondelivery'
            const moduleName = extractText(states[i].module_name).toLowerCase();
            if (moduleName === 'ps_cashondelivery') {
                return Number(extractText(states[i].id));
            }

            // Vérifie ensuite via les labels textuels (dans toutes les langues disponibles)
            const langNode = states[i].name?.language;
            const langNodes = Array.isArray(langNode) ? langNode : (langNode ? [langNode] : []);
            // .some() renvoie true si au moins une langue contient un mot-clé COD
            const hasCodLabel = langNodes.some((node) => {
                const name = extractText(node).toLowerCase();
                return name.includes('cash on delivery') || name.includes('paiement a la livraison') || name.includes('paiement à la livraison') || name.includes('cashondelivery') || name.includes('livraison') || name.includes('cod');
            });

            // Si un match textuel est trouvé, on retourne cet ID
            if (hasCodLabel) return Number(extractText(states[i].id));
        }
    } catch (e) {
        // Loggue l'erreur silencieusement et passe à la valeur par défaut
        console.log('Could not fetch order states for COD lookup:', e);
    }
    // 2 est souvent "Paiement accepté" en cas de dernier recours
    return 2;
}

/**
 * Valide que tous les articles du panier ont un stock suffisant avant de lancer la commande.
 * C'est une étape de vérification de sécurité (Pre-Flight Check).
 * 
 * @param {Array} cartItems Les produits du panier actuel
 * @param {Function} getItemStockFn La fonction pour interroger le stock (injectée en dépendance)
 * @returns {Promise<Object>} Un objet { valid: true } ou { valid: false, error: 'message' }
 */
export async function validateCartStock(cartItems, getItemStockFn) {
    let name = [];
    let available = [];
    let error = [];
    let requested = [];
    let nisy_tsy_ampy = false; // Drapeau booléen (mg: "il y en a un qui ne suffit pas")
    let string_info = "";
    
    // Logs de débogage pour tracer la validation
    console.log("cart valider", cartItems);
    console.log("length", cartItems.length);
    
    // Boucle asynchrone sur chaque ligne du panier
    for (let i = 0; i < cartItems.length; i++) {
        console.log("oui moditra")
        error[i] = 0;
        const item = cartItems[i];
        
        // Appelle la fonction externe pour vérifier le vrai stock actuel en base
        available[i] = await getItemStockFn(item);
        // Récupère la quantité demandée par le client
        requested[i] = Number(item.quantity) || 0;
        
        // Construit un log informatif de l'état du stock
        string_info = string_info + "||" + `Stock pour ${name[i]}. Disponible: ${available[i]}, dans le panier: ${requested[i]}.`
        name[i] = null;
        
        // Règle métier stricte : Si on demande plus que ce qu'il y a, la commande ne doit pas passer
        if (requested[i] > available[i]) {
            // Enregistre le nom du produit fautif pour le message d'erreur
            name[i] = item.name || `Produit #${item.id_product}`;
            error[i] = 1;
            nisy_tsy_ampy = true;
        }
    }
    
    // Si au moins un produit est en rupture de stock par rapport à la quantité demandée
    if (nisy_tsy_ampy) {
        let string_retour = "";
        // Génère un message d'erreur multi-lignes pour tous les produits problématiques
        for (let index = 0; index < name.length; index++) {
            if (name[index] != null) {
                string_retour = string_retour + "||" + `Stock insuffisant pour ${name[index]}. Disponible: ${available[index]}, dans le panier: ${requested[index]}.`
            }
        }
        return { valid: false, error: string_retour };
    }

    // Le panier est totalement valide et stock disponible
    return { valid: true, info: string_info };
}

// ============================================================================
// LOGIQUE DE DÉCRÉMENTATION DE STOCK (Avec Hack pour StockEvolution.vue)
// ============================================================================

/**
 * Fonction de force-update du stock via PUT XML.
 * Elle construit intégralement le document XML requis par PrestaShop pour modifier `stock_availables`.
 */
export async function forceUpdateStockAvailable(stockAvailable, newQty, physicalQty, reservedQty) {
    // Extraction sécurisée de tous les champs existants pour ne pas les écraser avec du vide
    const stId = extractText(stockAvailable.id);
    const stProductId = extractText(stockAvailable.id_product);
    let stAttrId = extractText(stockAvailable.id_product_attribute);
    if (stAttrId === '') stAttrId = '0';
    const stShop = extractText(stockAvailable.id_shop) || '1';
    const stShopGroup = extractText(stockAvailable.id_shop_group) || '0';
    const stDepends = extractText(stockAvailable.depends_on_stock) || '0';
    const stOutOfStock = extractText(stockAvailable.out_of_stock) || '2';
    const stLocation = (typeof stockAvailable.location === 'object' ? '' : stockAvailable.location) || '';

    // Construction du document XML pour écraser la ressource stock_available
    const stockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <prestashop><stock_available>
        <id><![CDATA[${stId}]]></id>
        <id_product><![CDATA[${stProductId}]]></id_product>
        <id_product_attribute><![CDATA[${stAttrId}]]></id_product_attribute>
        <id_shop><![CDATA[${stShop}]]></id_shop>
        <id_shop_group><![CDATA[${stShopGroup}]]></id_shop_group>
        <quantity><![CDATA[${newQty}]]></quantity>
        <physical_quantity><![CDATA[${physicalQty}]]></physical_quantity>
        <reserved_quantity><![CDATA[${reservedQty}]]></reserved_quantity>
        <depends_on_stock><![CDATA[${stDepends}]]></depends_on_stock>
        <out_of_stock><![CDATA[${stOutOfStock}]]></out_of_stock>
        <location><![CDATA[${stLocation}]]></location>
    </stock_available></prestashop>`;

    // Appel PUT vers l'API
    await putXml(`/stock_availables/${stId}`, stockXml);
}

/**
 * Décrémente manuellement le stock disponible d'un produit.
 * (Note : Historiquement utilisé, mais souvent commenté car PrestaShop peut gérer cela automatiquement via ses statuts de commande).
 */
export async function decrementStock(productId, attributeId, quantity, orderId) {
    try {
        const attrFilter = attributeId ? attributeId : 0;
        // Recherche l'ID de la ligne de stock pour ce produit exact
        const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${productId}]&filter[id_product_attribute]=[${attrFilter}]&display=full`);
        let stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;

        if (stockAvailable) {
            // S'il y a un seul retour, ce n'est pas un tableau, on force le format
            if (Array.isArray(stockAvailable)) stockAvailable = stockAvailable[0];

            // Calcule les nouvelles quantités (Ancien - Acheté)
            const oldQty = parseInt(extractText(stockAvailable.quantity), 10) || 0;
            const newQty = oldQty - quantity;

            let physicalQty = parseInt(extractText(stockAvailable.physical_quantity), 10);
            if (isNaN(physicalQty)) physicalQty = oldQty; // Fallback

            // Augmente la quantité "réservée"
            let reservedQty = parseInt(extractText(stockAvailable.reserved_quantity), 10) || 0;
            const newReservedQty = reservedQty + quantity;

            // Met à jour la ressource en base
            await forceUpdateStockAvailable(stockAvailable, newQty, physicalQty, newReservedQty);
        }
    } catch (e) {
        console.warn(`[checkout] Erreur réservation stock: ${e.message}`);
    }
}

/**
 * Construit un document XML permettant la création d'une nouvelle adresse pour le client.
 * PrestaShop requiert une adresse valide pour pouvoir facturer ou livrer une commande.
 */
export function buildAddressXml(customerId, form) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${customerId}</id_customer>
    <id_country>8</id_country> <!-- 8 = ID pays fixe, ex: France ou Madagascar selon la BDD -->
    <alias>${form.alias}</alias>
    <firstname>${form.firstname}</firstname>
    <lastname>${form.lastname}</lastname>
    <address1>${form.address1}</address1>
    <postcode>${form.postcode}</postcode>
    <city>${form.city}</city>
    <phone>${form.phone}</phone>
  </address>
</prestashop>`;
}

/**
 * Construit un document XML pour transformer le panier local (du localStorage) 
 * en véritable panier (Cart) en base de données sur le serveur.
 * La commande (Order) a absolument besoin d'un panier (id_cart) pour exister.
 */
export function buildCartXml(customerId, addressId, items, secureKey) {
    let cartRowsXml = '';

    // Boucle sur chaque produit pour générer les nœuds XML <cart_row>
    for (let i = 0; i < items.length; i++) {
        let item = items[i];
        cartRowsXml += `
      <cart_row>
        <id_product>${item.id_product}</id_product>
        <id_product_attribute>${item.id_product_attribute || 0}</id_product_attribute>
        <id_address_delivery>${addressId}</id_address_delivery>
        <quantity>${item.quantity}</quantity>
      </cart_row>`;
    }

    // Wrap l'ensemble dans la structure attendue
    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <id_customer>${customerId}</id_customer>
    <id_address_delivery>${addressId}</id_address_delivery>
    <id_address_invoice>${addressId}</id_address_invoice>
    <secure_key>${secureKey}</secure_key>
    <associations>
      <cart_rows>${cartRowsXml}</cart_rows>
    </associations>
  </cart>
</prestashop>`;
}

/**
 * Construit le document XML le plus critique : La création de la commande (Order).
 * C'est l'équivalent de la validation finale du paiement.
 */
export function buildOrderXml(cartId, customerId, addressId, items, stateId, totalHt, secureKey) {
    let orderRowsXml = '';

    // Convertit chaque item du panier en ligne de facture (order_row)
    for (let i = 0; i < items.length; i++) {
        let item = items[i];
        const basePriceHt = Number(item.price || 0);

        orderRowsXml += `
        <order_row>
          <product_id>${item.id_product}</product_id>
          <product_attribute_id>${item.id_product_attribute || 0}</product_attribute_id>
          <product_quantity>${item.quantity}</product_quantity>
          <product_name><![CDATA[${item.name}]]></product_name>
          <product_reference><![CDATA[${item.reference || ''}]]></product_reference>
          <product_price>${basePriceHt.toFixed(6)}</product_price>
          <unit_price_tax_incl>${basePriceHt.toFixed(6)}</unit_price_tax_incl>
          <unit_price_tax_excl>${basePriceHt.toFixed(6)}</unit_price_tax_excl>
        </order_row>`;
    }

    // Le tag XML <order> requiert énormément de métadonnées de totalisation
    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_cart>${cartId}</id_cart>
    <id_customer>${customerId}</id_customer>
    <id_address_delivery>${addressId}</id_address_delivery>
    <id_address_invoice>${addressId}</id_address_invoice>
    <id_carrier>1</id_carrier>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
        <id_shop>1</id_shop>
        <id_shop_group>1</id_shop_group>
        <module>ps_checkout</module>
        <secure_key>${secureKey}</secure_key>
    <payment>Paiement accepté / En ligne</payment>
        <total_paid>${totalHt.toFixed(6)}</total_paid>
        <total_paid_real>${totalHt.toFixed(6)}</total_paid_real>
        <total_products>${totalHt.toFixed(6)}</total_products>
        <total_products_wt>${totalHt.toFixed(6)}</total_products_wt>
        <total_shipping>0.000000</total_shipping>
        <total_shipping_tax_excl>0.000000</total_shipping_tax_excl>
        <total_shipping_tax_incl>0.000000</total_shipping_tax_incl>
        <total_discounts>0.000000</total_discounts>
        <total_discounts_tax_excl>0.000000</total_discounts_tax_excl>
        <total_discounts_tax_incl>0.000000</total_discounts_tax_incl>
        <total_wrapping>0.000000</total_wrapping>
        <total_wrapping_tax_excl>0.000000</total_wrapping_tax_excl>
        <total_wrapping_tax_incl>0.000000</total_wrapping_tax_incl>
        <conversion_rate>1.000000</conversion_rate>
        <current_state>${stateId}</current_state>
        <associations>
            <order_rows nodeType="order_row" virtualEntity="true">${orderRowsXml}</order_rows>
        </associations>
  </order>
</prestashop>`;
}

/**
 * Fonction maîtresse (Orchestrateur) du processus de commande.
 * Elle coordonne TOUTES les étapes de la validation d'un achat.
 * 
 * @param {Object} customer Le client connecté
 * @param {Object} form Le formulaire d'adresse rempli par le client
 * @param {Array} cartItems Le contenu du panier local
 * @param {number} codStateId L'ID du statut par défaut (généralement Paiement à la livraison)
 * @returns {Promise<Object>} Un objet indiquant si la commande a réussi, avec son numéro.
 */
export async function processCheckout(customer, form, cartItems, codStateId) {
    // 1. Vérification basique
    if (!cartItems || cartItems.length === 0) {
        return { success: false, orderId: null, error: 'Votre panier est vide. Veuillez ajouter des produits avant de commander.' };
    }

    try {
        let idAdresse = 0;

        // 2. Gestion de l'adresse de livraison
        try {
            // Essaie de récupérer une adresse existante du client
            const adresses = await getCustomerAddresses(customer.id);
            if (adresses.length > 0 && adresses[0].id) idAdresse = adresses[0].id;
        } catch (e) { }

        // Si le client n'a aucune adresse, on la crée via l'API en utilisant les données du formulaire
        if (!idAdresse) {
            let adresseXml = buildAddressXml(customer.id, form);
            let adresseResp = await createAddress(adresseXml);
            idAdresse = adresseResp?.id || 0;
        }

        // Si la création échoue, on bloque la commande
        if (!idAdresse) {
            return { success: false, orderId: null, error: 'Impossible de créer l\'adresse. Vérifiez les champs.' };
        }

        // 3. Calcul du Total
        let cartTotal = 0;
        for (let i = 0; i < cartItems.length; i++) {
            const basePriceHt = Number(cartItems[i].price || 0);
            cartTotal += basePriceHt * cartItems[i].quantity;
        }

        // 4. Génération/Récupération de la clé de sécurité (requis par PrestaShop pour éviter la fraude)
        let sharedSecureKey = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        try {
            const customerDetails = await getCustomer(customer.id);
            if (customerDetails && customerDetails.secure_key) {
                // Utilise la clé du client si elle existe en base
                sharedSecureKey = extractText(customerDetails.secure_key) || sharedSecureKey;
            }
        } catch (e) {
            console.warn("Could not fetch customer secure_key, using random", e);
        }

        // 5. Création du panier (Cart) côté serveur
        let cartXml = buildCartXml(customer.id, idAdresse, cartItems, sharedSecureKey);
        console.log("cartItem", cartItems);
        console.log("cartxml", cartXml);
        let cartResp = await createCart(cartXml);
        console.log("cart_resp", cartResp);
        let idCart = cartResp?.id || 0;
        console.log("id_cart", idCart);

        // Bloque si le panier API n'a pas pu être créé
        if (!idCart) {
            return { success: false, orderId: null, error: 'Impossible de créer le panier. Veuillez réessayer.' };
        }

        // 6. Création de la Commande Finale (Order)
        let orderXml = buildOrderXml(idCart, customer.id, idAdresse, cartItems, codStateId, cartTotal, sharedSecureKey);
        console.log("oder check xml", orderXml);
        let orderResp = await createOrder(orderXml);
        console.log("oder check", orderResp);
        let orderId = null;

        // Si l'API retourne l'objet Order avec un ID
        if (orderResp) {
            orderId = extractText(orderResp.id) || '?';
        }

        // 7. Post-traitement (Ajustement des statuts)
        if (orderId && orderId !== '?') {
            // Vérifie que l'API a bien assigné le bon statut initial
            const freshOrder = await getOrder(orderId);
            const currentStateAfterCreate = Number(extractText(freshOrder?.current_state));

            // Si PrestaShop s'est trompé de statut par défaut (ex: mis en attente de chèque), on le corrige via l'historique
            if (currentStateAfterCreate && currentStateAfterCreate !== Number(codStateId)) {
                await updateOrderStatusByHistory(String(orderId), String(codStateId));
            }

            // NOTE : Le code ci-dessous de décrémentation de stock manuel est désactivé (commenté) 
            // car PrestaShop décrémente généralement le stock automatiquement quand l'état "COD" est défini.
            // // DÉCRÉMENTATION DE STOCK FORCÉE
            // for (let i = 0; i < cartItems.length; i++) {
            //     let item = cartItems[i];
            //     await decrementStock(item.id_product, item.id_product_attribute || 0, item.quantity, orderId);
            // }
        }
        console.log("tonga eto @ farany");
        
        // Tout a réussi
        return { success: true, orderId: orderId, error: null };

    } catch (err) {
        // Interception d'un éventuel crash (ex: perte de connexion)
        return { success: false, orderId: null, error: 'Une erreur est survenue lors de la commande. Veuillez réessayer.' };
    }
}
