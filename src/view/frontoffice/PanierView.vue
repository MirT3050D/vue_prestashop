<script setup>
import { onMounted, ref, computed } from 'vue';
import ProductPanier from '@/components/frontoffice/ProductPanier.vue';
import { Icon } from '@iconify/vue';
import { getXml, postXml, getImage } from '@/service/api';
import { useRouter } from 'vue-router';

const router = useRouter();
const panier = ref([]);
const loading = ref(false);
const message = ref('');
const messageType = ref(''); // 'success' ou 'error'
const codStateId = ref(10); // Fallback if COD state not found
const secureKey = ref('');

// ========== Panier localStorage ==========

async function loadCart() {
    let cartJson = localStorage.getItem("panier");
    if (cartJson) {
        try {
            panier.value = JSON.parse(cartJson);
            
            // Re-charger les images (les blobs URLs expirent au refresh)
            for (let i = 0; i < panier.value.length; i++) {
                let item = panier.value[i];
                try {
                    const productData = await getXml(`products/${item.id_product}`);
                    const p = productData.prestashop.product;
                    if (p.id_default_image) {
                        let imgId = p.id_default_image;
                        // Si c'est un objet (xlink), on prend l'ID
                        if (typeof imgId === 'object' && imgId['#text']) imgId = imgId['#text'];
                        if (typeof imgId === 'object' && imgId['@_xlink:href']) {
                             imgId = imgId['@_xlink:href'].split('/').pop();
                        }
                        
                        const path = `images/products/${item.id_product}/${imgId}`;
                        item.image = await getImage(path);
                    }
                } catch (err) {
                    console.warn("Erreur image pour produit " + item.id_product, err);
                }
            }
        } catch (e) {
            panier.value = [];
        }
    } else {
        panier.value = [];
    }
}

onMounted(() => {
    findCodStateId();
    loadCart();
});

async function findCodStateId() {
    try {
        const statesResp = await getXml('/order_states?display=full');
        const statesNode = statesResp?.prestashop?.order_states?.order_state;
        if (!statesNode) return;
        const states = Array.isArray(statesNode) ? statesNode : [statesNode];

        for (let i = 0; i < states.length; i++) {
            const langNode = states[i].name?.language;
            let stateName = '';
            if (Array.isArray(langNode)) {
                stateName = (langNode[0]['#text'] || '').toLowerCase();
            } else if (langNode && typeof langNode === 'object') {
                stateName = (langNode['#text'] || '').toLowerCase();
            }
            if (stateName.includes('livraison') || stateName.includes('cash on delivery') || stateName.includes('cod')) {
                codStateId.value = states[i].id;
                return;
            }
        }
    } catch (e) {
        console.log('Could not fetch order states for COD lookup:', e);
    }
}

// Calcul du total du panier avec une boucle simple
const totalPanier = computed(() => {
    let total = 0;
    for (let i = 0; i < panier.value.length; i++) {
        let item = panier.value[i];
        const unitPriceTTC = Math.round(parseFloat(item.price) * 1.055 * 100) / 100;
        total = total + (unitPriceTTC * item.quantity);
    }
    return total.toFixed(2);
});

function updateQuantity(index, newQty) {
    if (newQty > 0) {
        panier.value[index].quantity = newQty;
        localStorage.setItem("panier", JSON.stringify(panier.value));
    }
}

function removeItem(index) {
    panier.value.splice(index, 1);
    localStorage.setItem("panier", JSON.stringify(panier.value));
}

function viderPanier() {
    if (confirm("Voulez-vous vraiment vider votre panier ?")) {
        panier.value = [];
        localStorage.setItem("panier", JSON.stringify([]));
    }
}

// ========== Commande PrestaShop ==========

async function passerCommande() {
    // 1. Vérifier que le client est connecté
    let customerJson = localStorage.getItem('customer');
    if (!customerJson) {
        message.value = 'Vous devez être connecté pour passer une commande.';
        messageType.value = 'error';
        return;
    }

    let customer = null;
    try {
        customer = JSON.parse(customerJson);
    } catch (e) {
        message.value = 'Erreur lors de la lecture des données client.';
        messageType.value = 'error';
        return;
    }

    if (!customer || !customer.id) {
        message.value = 'Informations client incomplètes. Veuillez vous reconnecter.';
        messageType.value = 'error';
        return;
    }

    try {
        const customerResp = await getXml(`customers/${customer.id}?display=[secure_key]`);
        secureKey.value = customerResp?.prestashop?.customer?.secure_key?.['#text'] || customerResp?.prestashop?.customer?.secure_key || '';
    } catch (e) {
        console.warn('Impossible de charger secure_key client:', e);
    }

    loading.value = true;
    message.value = '';

    try {
        // 2. Récupérer l'adresse du client
        let idAdresse = 0;
        try {
            let adresseData = await getXml(`addresses?display=full&filter[id_customer]=[${customer.id}]`);
            if (adresseData && adresseData.prestashop && adresseData.prestashop.addresses) {
                let adresses = adresseData.prestashop.addresses.address;
                if (!Array.isArray(adresses)) {
                    adresses = [adresses];
                }
                if (adresses.length > 0 && adresses[0].id) {
                    idAdresse = adresses[0].id;
                }
            }
        } catch (e) {
            console.log('Impossible de récupérer l\'adresse:', e);
        }

        if (!idAdresse) {
            message.value = 'Aucune adresse trouvée pour ce client. Veuillez en ajouter une dans PrestaShop.';
            messageType.value = 'error';
            loading.value = false;
            return;
        }

        // 3. Construire les lignes du panier XML (cart_rows)
        let cartRowsXml = '';
        for (let i = 0; i < panier.value.length; i++) {
            let item = panier.value[i];
            let idProduct = item.id_product;
            let idAttribute = item.id_product_attribute || 0;
            let qty = item.quantity;
            cartRowsXml += `
          <cart_row>
            <id_product>${idProduct}</id_product>
            <id_product_attribute>${idAttribute}</id_product_attribute>
            <id_address_delivery>${idAdresse}</id_address_delivery>
            <quantity>${qty}</quantity>
          </cart_row>`;
        }

        // 4. Créer le panier PrestaShop via WebService API
        let cartXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <id_customer>${customer.id}</id_customer>
    <id_address_delivery>${idAdresse}</id_address_delivery>
    <id_address_invoice>${idAdresse}</id_address_invoice>
    <associations>
      <cart_rows>${cartRowsXml}
      </cart_rows>
    </associations>
  </cart>
</prestashop>`;

        let cartResponse = await postXml('carts', cartXml);

        // Extraire l'id du panier créé
        let idCart = 0;
        if (cartResponse && cartResponse.prestashop && cartResponse.prestashop.cart) {
            let cartData = cartResponse.prestashop.cart;
            idCart = cartData.id || (cartData['@_id'] || 0);
        }

        if (!idCart) {
            message.value = 'Impossible de créer le panier PrestaShop. Veuillez réessayer.';
            messageType.value = 'error';
            loading.value = false;
            return;
        }

        // 5. Créer la commande PrestaShop
        // id_carrier = 1 (transporteur par défaut), id_payment = "free" pour les tests
                const totalAmount = Number(totalPanier.value || 0).toFixed(6);
        let orderXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_cart>${idCart}</id_cart>
    <id_customer>${customer.id}</id_customer>
    <id_address_delivery>${idAdresse}</id_address_delivery>
    <id_address_invoice>${idAdresse}</id_address_invoice>
    <id_carrier>1</id_carrier>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
        <id_shop>1</id_shop>
        <id_shop_group>1</id_shop_group>
    <module>ps_checkpayment</module>
    <payment>Paiement à la livraison</payment>
        <secure_key>${secureKey.value}</secure_key>
        <total_paid>${totalAmount}</total_paid>
        <total_paid_real>0.000000</total_paid_real>
        <total_paid_tax_incl>${totalAmount}</total_paid_tax_incl>
        <total_paid_tax_excl>${totalAmount}</total_paid_tax_excl>
        <total_products>${totalAmount}</total_products>
        <total_products_wt>${totalAmount}</total_products_wt>
        <total_products_tax_incl>${totalAmount}</total_products_tax_incl>
        <total_products_tax_excl>${totalAmount}</total_products_tax_excl>
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
        <current_state>${codStateId.value}</current_state>
  </order>
</prestashop>`;

        let orderResponse = await postXml('orders', orderXml);

        // Extraire l'id de la commande créée
        let idOrder = 0;
        if (orderResponse && orderResponse.prestashop && orderResponse.prestashop.order) {
            let orderData = orderResponse.prestashop.order;
            idOrder = orderData.id || (orderData['@_id'] || 0);
        }

        if (idOrder) {
            // 6. Succès — vider le panier et afficher le message
            panier.value = [];
            localStorage.setItem("panier", JSON.stringify([]));
            message.value = `Commande #${idOrder} passée avec succès ! Merci pour votre achat.`;
            messageType.value = 'success';
        } else {
            message.value = 'La commande a été envoyée, mais la confirmation est indisponible.';
            messageType.value = 'success';
        }

    } catch (err) {
        console.error('Erreur lors de la commande:', err);
        message.value = 'Une erreur est survenue lors de la commande. Veuillez réessayer.';
        messageType.value = 'error';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div class="panier-view">
        <h1 class="page-title">Votre Panier</h1>

        <!-- Message de confirmation / erreur -->
        <div v-if="message" :class="['alert-banner', messageType]">
            <Icon :icon="messageType === 'success' ? 'lucide:check-circle' : 'lucide:alert-circle'" />
            <span>{{ message }}</span>
            <button class="alert-close" @click="message = ''">
                <Icon icon="lucide:x" />
            </button>
        </div>

        <div v-if="panier.length > 0" class="panier-layout">
            <!-- Liste des produits -->
            <div class="main_left">
                <div class="items-list">
                    <ProductPanier 
                        v-for="(item, index) in panier" 
                        :key="index"
                        :nom="item.name"
                        :prix="Math.round(item.price * 1.055 * 100) / 100"
                        :quantite="item.quantity"
                        :image="item.image"
                        @update:quantite="(newQty) => updateQuantity(index, newQty)"
                        @supprimer="removeItem(index)"
                    />
                </div>
                
                <button class="btn-vider" @click="viderPanier">
                    Vider le panier
                </button>
            </div>

            <!-- Résumé / Total -->
            <div class="right">
                <div class="summary-card">
                    <h2 class="summary-title">Récapitulatif</h2>
                    
                    <div class="summary-row">
                        <span>Sous-total</span>
                        <span>{{ totalPanier }} €</span>
                    </div>
                    <div class="summary-row">
                        <span>Livraison</span>
                        <span class="free-shipping">Gratuit</span>
                    </div>
                    
                    <hr class="separator">
                    
                    <div class="summary-row total">
                        <span>Total (TTC)</span>
                        <span class="total-price">{{ totalPanier }} €</span>
                    </div>

                    <router-link to="/checkout" class="btn-checkout">
                        <Icon icon="lucide:credit-card" />
                        Passer à la caisse
                    </router-link>
                </div>
            </div>
        </div>

        <!-- État vide -->
        <div v-else class="empty-cart">
            <div class="empty-icon">
                <Icon icon="lucide:shopping-cart" />
            </div>
            <h2>Votre panier est vide</h2>
            <p>Découvrez nos produits et commencez vos achats !</p>
            <router-link to="/" class="btn-back">Retour à la boutique</router-link>
        </div>
    </div>
</template>

<style scoped>
.panier-view {
    max-width: 1200px;
    margin: 40px auto;
    padding: 0 20px;
    font-family: 'Inter', sans-serif;
}

.page-title {
    font-size: 2rem;
    font-weight: 800;
    color: #2f3542;
    margin-bottom: 30px;
}

/* === ALERTE === */
.alert-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-radius: 14px;
    font-size: 0.95rem;
    font-weight: 500;
    margin-bottom: 24px;
    animation: slideIn 0.3s ease;
}

.alert-banner.success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
}

.alert-banner.error {
    background: #fff0f0;
    border: 1px solid #ffcdd2;
    color: #d32f2f;
}

.alert-close {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    opacity: 0.6;
    display: flex;
    align-items: center;
}

.alert-close:hover {
    opacity: 1;
}

@keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

.panier-layout {
    display: flex;
    gap: 30px;
    align-items: flex-start;
}

.main_left {
    flex: 2;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.items-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.right {
    flex: 1;
    position: sticky;
    top: 84px;
}

/* === SUMMARY CARD === */
.summary-card {
    background: white;
    padding: 30px;
    border-radius: 20px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.05);
}

.summary-title {
    font-size: 1.4rem;
    margin-bottom: 25px;
    color: #2f3542;
    font-weight: 700;
}

.summary-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 15px;
    color: #747d8c;
    font-weight: 500;
}

.free-shipping {
    color: #2ed573;
    font-weight: 700;
}

.separator {
    border: 0;
    border-top: 1px solid #f1f2f6;
    margin: 20px 0;
}

.summary-row.total {
    color: #2f3542;
    font-size: 1.25rem;
    font-weight: 800;
    margin-bottom: 30px;
}

.total-price {
    color: #2ed573;
}

.btn-checkout {
    width: 100%;
    padding: 16px;
    background: linear-gradient(135deg, #2ed573, #26af5f);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 1.05rem;
    font-weight: 700;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-sizing: border-box;
    box-shadow: 0 4px 15px rgba(46, 213, 115, 0.3);
}

.btn-checkout:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(46, 213, 115, 0.4);
}


.login-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 14px;
    font-size: 0.85rem;
    color: #a4b0be;
    text-align: center;
    justify-content: center;
}

.btn-vider {
    align-self: flex-start;
    background: none;
    border: none;
    color: #ff4757;
    font-weight: 600;
    cursor: pointer;
    margin-top: 10px;
    text-decoration: underline;
    font-size: 0.9rem;
}

/* === ANIMATION SPIN === */
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.spin {
    animation: spin 1s linear infinite;
}

/* === EMPTY STATE === */
.empty-cart {
    text-align: center;
    padding: 80px 20px;
    background: white;
    border-radius: 24px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.05);
}

.empty-icon {
    font-size: 5rem;
    margin-bottom: 20px;
    color: #ced6e0;
}

.empty-cart h2 {
    font-size: 1.8rem;
    color: #2f3542;
    margin-bottom: 10px;
}

.empty-cart p {
    color: #747d8c;
    margin-bottom: 30px;
}

.btn-back {
    display: inline-block;
    padding: 14px 28px;
    background: #2f3542;
    color: white;
    text-decoration: none;
    border-radius: 12px;
    font-weight: 700;
    transition: transform 0.2s ease;
}

.btn-back:hover {
    transform: translateY(-2px);
}

@media (max-width: 992px) {
    .panier-layout {
        flex-direction: column;
    }
    .right {
        width: 100%;
        position: static;
    }
}
</style>