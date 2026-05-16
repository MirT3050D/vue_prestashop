<script setup>

import { ref, onMounted, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { getImage } from '@/service/api';
import { calculateTtc, getProductTaxRate } from '@/service/price';
import { getProduct } from '@/service/productService';
import { getCustomerAddresses, createAddress } from '@/service/addressService';
import { createCart } from '@/service/cartService';
import { createOrder, getOrderStates, updateOrderStatusByHistory, getOrder } from '@/service/orderService';
import { getPrestaShopConfig } from '@/service/api';
import { useRouter } from 'vue-router';

const router = useRouter();

// ===== État =====
const step = ref('form'); // 'form' | 'confirmation'
const loading = ref(false);
const error = ref('');
const idOrder = ref(null);
const codStateId = ref(10); // Default fallback for COD

const panier = ref([]);
const customer = ref(null);

async function enrichCartItem(item) {
    let taxRate = item.taxRate;
    let image = item.image || null;

    if (taxRate == null) {
        taxRate = await getProductTaxRate(item.id_product);
    }

    try {
        const product = await getProduct(item.id_product);
        if (product && product.id_default_image) {
            let imgId = product.id_default_image;
            if (typeof imgId === 'object' && imgId['#text']) imgId = imgId['#text'];
            if (typeof imgId === 'object' && imgId['@_xlink:href']) {
                 imgId = imgId['@_xlink:href'].split('/').pop();
            }
            const path = `images/products/${item.id_product}/${imgId}`;
            image = await getImage(path);
        }
    } catch (e) {}

    return {
        ...item,
        taxRate: Number(taxRate) || 0,
        image
    };
}

function extractText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        if (typeof value['#text'] !== 'undefined') return String(value['#text']);
        return '';
    }
    return String(value);
}

function normalizeFormText(value) {
    return extractText(value).trim();
}

// ===== Formulaire livraison =====
const form = ref({
    firstname: '',
    lastname: '',
    address1: '',
    postcode: '',
    city: '',
    phone: '',
    alias: 'Mon adresse'
});

// ===== Total =====
const totalPanier = computed(() => {
    let total = 0;
    for (let i = 0; i < panier.value.length; i++) {
        const unitPriceTTC = calculateTtc(panier.value[i].price, panier.value[i].taxRate);
        total = total + (unitPriceTTC * panier.value[i].quantity);
    }
    return total.toFixed(2);
});

/**
 * Lookup the order state ID for "Paiement à la livraison" (Cash on Delivery).
 * Falls back to state 10 if not found.
 */
async function findCodStateId() {
    try {
        const config = await getPrestaShopConfig('PS_OS_COD_VALIDATION');
        const configuredStateId = Number(extractText(config?.value));
        if (configuredStateId > 0) {
            codStateId.value = configuredStateId;
            console.log('[checkout] COD state id from configuration:', codStateId.value);
            return;
        }

        const states = await getOrderStates();
        if (!states) return;

        for (let i = 0; i < states.length; i++) {
            const moduleName = extractText(states[i].module_name).toLowerCase();
            if (moduleName === 'ps_cashondelivery') {
                codStateId.value = Number(extractText(states[i].id));
                console.log('[checkout] COD state id from module_name:', codStateId.value);
                return;
            }

            const langNode = states[i].name?.language;
            const langNodes = Array.isArray(langNode) ? langNode : (langNode ? [langNode] : []);
            const hasCodLabel = langNodes.some((node) => {
                const name = extractText(node).toLowerCase();
                return name.includes('cash on delivery') || name.includes('paiement a la livraison') || name.includes('paiement à la livraison') || name.includes('cashondelivery');
            });

            if (hasCodLabel) {
                codStateId.value = Number(extractText(states[i].id));
                console.log('[checkout] COD state id from state label:', codStateId.value);
                return;
            }
        }

        console.warn('[checkout] COD state id not found in configuration or states. Using fallback:', codStateId.value);
    } catch (e) {
        console.log('Could not fetch order states for COD lookup:', e);
    }
}

// ===== Chargement initial =====
onMounted(async () => {
    // Fetch COD state ID
    await findCodStateId();

    // Charger panier
    const cartJson = localStorage.getItem('panier');
    if (cartJson) {
        try {
            const parsedCart = JSON.parse(cartJson);
            panier.value = await Promise.all(parsedCart.map((item) => enrichCartItem(item)));
            localStorage.setItem('panier', JSON.stringify(panier.value));
        } catch (e) {
            panier.value = [];
        }
    }

    // Charger client
    const customerJson = localStorage.getItem('customer');
    if (!customerJson) {
        router.push('/connexion');
        return;
    }

    try {
        customer.value = JSON.parse(customerJson);
    } catch (e) {
        router.push('/connexion');
        return;
    }

    if (!customer.value || !customer.value.id) {
        router.push('/connexion');
        return;
    }

    // Pré-remplir nom/prénom depuis le profil
    form.value.firstname = customer.value.firstname || '';
    form.value.lastname = customer.value.lastname || '';

    // Tenter de récupérer une adresse existante
    try {
        const adresses = await getCustomerAddresses(customer.value.id);
        if (adresses.length > 0) {
            const a = adresses[0];
            form.value.firstname = a.firstname || form.value.firstname;
            form.value.lastname = a.lastname || form.value.lastname;
            form.value.address1 = a.address1 || '';
            form.value.postcode = a.postcode || '';
            form.value.city = a.city || '';
            form.value.phone = a.phone || '';
            form.value.alias = a.alias || 'Mon adresse';
        }
    } catch (e) {
        console.log('Pas d\'adresse existante:', e);
    }
});

// ===== Validation du formulaire =====
function validerFormulaire() {
    if (!normalizeFormText(form.value.firstname)) return 'Le prénom est requis.';
    if (!normalizeFormText(form.value.lastname))  return 'Le nom est requis.';
    if (!normalizeFormText(form.value.address1))  return 'L\'adresse est requise.';
    if (!normalizeFormText(form.value.postcode))  return 'Le code postal est requis.';
    if (!normalizeFormText(form.value.city))      return 'La ville est requise.';
    return '';
}

// ===== Passer la commande =====
async function passerCommande() {
    error.value = validerFormulaire();
    if (error.value) return;

    loading.value = true;
    error.value = '';

    try {
        console.log('[checkout] COD state id:', codStateId.value);
        const totalAmount = Number(totalPanier.value || 0).toFixed(6);
        // 1. Créer ou réutiliser une adresse
        let idAdresse = 0;

        // Chercher une adresse existante
        try {
            const adresses = await getCustomerAddresses(customer.value.id);
            if (adresses.length > 0 && adresses[0].id) idAdresse = adresses[0].id;
        } catch (e) {}

        // Créer une nouvelle adresse si aucune trouvée
        if (!idAdresse) {
            let adresseXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${customer.value.id}</id_customer>
    <id_country>8</id_country>
    <alias>${form.value.alias}</alias>
    <firstname>${form.value.firstname}</firstname>
    <lastname>${form.value.lastname}</lastname>
    <address1>${form.value.address1}</address1>
    <postcode>${form.value.postcode}</postcode>
    <city>${form.value.city}</city>
    <phone>${form.value.phone}</phone>
  </address>
</prestashop>`;
            let adresseResp = await createAddress(adresseXml);
            idAdresse = adresseResp?.id || 0;
        }

        if (!idAdresse) {
            error.value = 'Impossible de créer l\'adresse. Vérifiez les champs.';
            loading.value = false;
            return;
        }

        // 2. Créer le panier PrestaShop
        let cartRowsXml = '';
        for (let i = 0; i < panier.value.length; i++) {
            let item = panier.value[i];
            cartRowsXml += `
      <cart_row>
        <id_product>${item.id_product}</id_product>
        <id_product_attribute>${item.id_product_attribute || 0}</id_product_attribute>
        <id_address_delivery>${idAdresse}</id_address_delivery>
        <quantity>${item.quantity}</quantity>
      </cart_row>`;
        }

        let cartXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <id_customer>${customer.value.id}</id_customer>
    <id_address_delivery>${idAdresse}</id_address_delivery>
    <id_address_invoice>${idAdresse}</id_address_invoice>
    <associations>
      <cart_rows>${cartRowsXml}
      </cart_rows>
    </associations>
  </cart>
</prestashop>`;

        let cartResp = await createCart(cartXml);
        console.log('[checkout] cart response:', cartResp);
        let idCart = cartResp?.id || 0;

        if (!idCart) {
            error.value = 'Impossible de créer le panier. Veuillez réessayer.';
            loading.value = false;
            return;
        }

        // 3. Créer la commande
        let orderRowsXml = '';
        for (let i = 0; i < panier.value.length; i++) {
            let item = panier.value[i];
            orderRowsXml += `
        <order_row>
          <product_id>${item.id_product}</product_id>
          <product_attribute_id>${item.id_product_attribute || 0}</product_attribute_id>
          <product_quantity>${item.quantity}</product_quantity>
        </order_row>`;
        }

        const secureKey = Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');

        let orderXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_cart>${idCart}</id_cart>
    <id_customer>${customer.value.id}</id_customer>
    <id_address_delivery>${idAdresse}</id_address_delivery>
    <id_address_invoice>${idAdresse}</id_address_invoice>
    <id_carrier>1</id_carrier>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
        <id_shop>1</id_shop>
        <id_shop_group>1</id_shop_group>
        <module>ps_cashondelivery</module>
        <secure_key>${secureKey}</secure_key>
    <payment>Paiement à la livraison</payment>
        <total_paid>${totalAmount}</total_paid>
        <total_paid_real>${totalAmount}</total_paid_real>
        <total_paid_tax_incl>${totalAmount}</total_paid_tax_incl>
        <total_paid_tax_excl>${totalAmount}</total_paid_tax_excl>
        <total_products>${totalAmount}</total_products>
        <total_products_wt>${totalAmount}</total_products_wt>
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
        <associations>
            <order_rows>${orderRowsXml}
            </order_rows>
        </associations>
  </order>
</prestashop>`;

        console.log('[checkout] order payload:', orderXml);
        let orderResp = await createOrder(orderXml);
        console.log('[checkout] order response:', orderResp);
        if (orderResp) {
            idOrder.value = extractText(orderResp.id) || '?';
            const responseState = Number(extractText(orderResp.current_state));
            console.log('[checkout] state returned by order create:', responseState || '(missing)');
        }

        if (idOrder.value && idOrder.value !== '?') {
            const freshOrder = await getOrder(idOrder.value);
            const currentStateAfterCreate = Number(extractText(freshOrder?.current_state));
            console.log('[checkout] current_state after order reload:', currentStateAfterCreate || '(missing)');

            if (currentStateAfterCreate && currentStateAfterCreate !== Number(codStateId.value)) {
                console.warn('[checkout] Unexpected state after creation. Forcing COD state.', {
                    expected: Number(codStateId.value),
                    actual: currentStateAfterCreate,
                    orderId: idOrder.value
                });

                await updateOrderStatusByHistory(String(idOrder.value), String(codStateId.value));

                const updatedOrder = await getOrder(idOrder.value);
                const updatedState = Number(extractText(updatedOrder?.current_state));
                console.log('[checkout] current_state after forced update:', updatedState || '(missing)');
            }
        }

        // 4. Vider le panier local et afficher la confirmation
        localStorage.setItem('panier', JSON.stringify([]));
        step.value = 'confirmation';

    } catch (err) {
        console.error('[checkout] order flow error:', err?.response?.data || err);
        error.value = 'Une erreur est survenue lors de la commande. Veuillez réessayer.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div class="checkout-view">

        <!-- ===== ÉTAPES ===== -->
        <div class="stepper">
            <div class="step" :class="{ active: step === 'form', done: step === 'confirmation' }">
                <div class="step-circle">
                    <Icon v-if="step === 'confirmation'" icon="lucide:check" />
                    <span v-else>1</span>
                </div>
                <span class="step-label">Informations</span>
            </div>
            <div class="step-line"></div>
            <div class="step" :class="{ active: step === 'confirmation' }">
                <div class="step-circle">
                    <span>2</span>
                </div>
                <span class="step-label">Confirmation</span>
            </div>
        </div>

        <!-- ===== FORMULAIRE LIVRAISON ===== -->
        <div v-if="step === 'form'" class="checkout-layout">

            <div class="form-section">
                <h2 class="section-title">
                    <Icon icon="lucide:map-pin" />
                    Adresse de livraison
                </h2>

                <div v-if="error" class="error-banner">
                    <Icon icon="lucide:alert-circle" />
                    {{ error }}
                </div>

                <form @submit.prevent="passerCommande" class="checkout-form">
                    <div class="form-row">
                        <div class="field">
                            <label>Prénom *</label>
                            <input v-model="form.firstname" type="text" placeholder="Jean" required />
                        </div>
                        <div class="field">
                            <label>Nom *</label>
                            <input v-model="form.lastname" type="text" placeholder="Dupont" required />
                        </div>
                    </div>

                    <div class="field">
                        <label>Adresse *</label>
                        <input v-model="form.address1" type="text" placeholder="12 rue de la Paix" required />
                    </div>

                    <div class="form-row">
                        <div class="field">
                            <label>Code postal *</label>
                            <input v-model="form.postcode" type="text" placeholder="75000" required />
                        </div>
                        <div class="field">
                            <label>Ville *</label>
                            <input v-model="form.city" type="text" placeholder="Paris" required />
                        </div>
                    </div>

                    <div class="field">
                        <label>Téléphone</label>
                        <input v-model="form.phone" type="tel" placeholder="06 00 00 00 00" />
                    </div>

                    <div class="field">
                        <label>Nom de l'adresse</label>
                        <input v-model="form.alias" type="text" placeholder="Domicile" />
                    </div>

                    <!-- Paiement -->
                    <div class="payment-section">
                        <h3 class="payment-title">
                            <Icon icon="lucide:credit-card" />
                            Mode de paiement
                        </h3>
                        <div class="payment-option selected">
                            <Icon icon="lucide:truck" />
                            <div>
                                <strong>Paiement à la livraison</strong>
                                <p>Payez en espèces lors de la réception de votre commande</p>
                            </div>
                            <Icon icon="lucide:check-circle" class="check-icon" />
                        </div>
                    </div>

                    <div class="form-actions">
                        <router-link to="/panier" class="btn-back">
                            <Icon icon="lucide:arrow-left" />
                            Retour au panier
                        </router-link>
                        <button type="submit" class="btn-confirm" :disabled="loading">
                            <Icon v-if="loading" icon="lucide:loader-2" class="spin" />
                            <Icon v-else icon="lucide:shield-check" />
                            {{ loading ? 'Commande en cours...' : 'Confirmer la commande' }}
                        </button>
                    </div>
                </form>
            </div>

            <!-- Résumé commande -->
            <div class="order-summary">
                <h3 class="summary-title">Votre commande</h3>
                <div class="summary-items">
                    <div v-for="(item, i) in panier" :key="i" class="summary-item">
                        <img v-if="item.image" :src="item.image" :alt="item.name" class="summary-img" />
                        <div v-else class="summary-img-placeholder">
                            <Icon icon="lucide:package" />
                        </div>
                        <div class="summary-item-info">
                            <span class="summary-item-name">{{ item.name }}</span>
                            <span class="summary-item-qty">x{{ item.quantity }}</span>
                        </div>
                        <span class="summary-item-price">
                            {{ (calculateTtc(item.price, item.taxRate) * item.quantity).toFixed(2) }} €
                        </span>
                    </div>
                </div>
                <hr class="summary-sep" />
                <div class="summary-row">
                    <span>Sous-total</span>
                    <span>{{ totalPanier }} €</span>
                </div>
                <div class="summary-row">
                    <span>Livraison</span>
                    <span class="free">Gratuit</span>
                </div>
                <div class="summary-row total">
                    <span>Total</span>
                    <span>{{ totalPanier }} €</span>
                </div>
            </div>
        </div>

        <!-- ===== CONFIRMATION ===== -->
        <div v-if="step === 'confirmation'" class="confirmation">
            <div class="confirmation-icon">
                <Icon icon="lucide:package-check" />
            </div>
            <h2>Commande confirmée !</h2>
            <p v-if="idOrder">Votre commande <strong>#{{ idOrder }}</strong> a été enregistrée avec succès.</p>
            <p>Vous recevrez une confirmation par email. Votre commande sera payée lors de la livraison.</p>
            <router-link to="/" class="btn-home">
                <Icon icon="lucide:home" />
                Retour à la boutique
            </router-link>
        </div>

    </div>
</template>

<style scoped>
.checkout-view {
    max-width: 1100px;
    margin: 40px auto;
    padding: 0 20px;
    font-family: 'Inter', sans-serif;
}

/* === STEPPER === */
.stepper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 40px;
}

.step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.step-circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid #ced6e0;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: #ced6e0;
    font-size: 1rem;
    transition: all 0.3s ease;
}

.step.active .step-circle {
    border-color: #2ed573;
    background: #2ed573;
    color: #fff;
}

.step.done .step-circle {
    border-color: #2ed573;
    background: #2ed573;
    color: #fff;
}

.step-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #a4b0be;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.step.active .step-label {
    color: #2f3542;
}

.step-line {
    flex: 1;
    max-width: 120px;
    height: 2px;
    background: #e4e7eb;
    margin: 0 16px;
    margin-bottom: 28px;
}

/* === LAYOUT === */
.checkout-layout {
    display: flex;
    gap: 30px;
    align-items: flex-start;
}

.form-section {
    flex: 2;
    background: #fff;
    border-radius: 20px;
    padding: 36px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
}

.section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1.3rem;
    font-weight: 700;
    color: #2f3542;
    margin-bottom: 28px;
}

/* === ERREUR === */
.error-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    background: #fff0f0;
    border: 1px solid #ffcdd2;
    border-radius: 12px;
    color: #d32f2f;
    font-size: 0.9rem;
    margin-bottom: 20px;
}

/* === FORMULAIRE === */
.checkout-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.form-row {
    display: flex;
    gap: 16px;
}

.form-row .field {
    flex: 1;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.field label {
    font-size: 0.88rem;
    font-weight: 600;
    color: #2f3542;
}

.field input {
    padding: 13px 16px;
    border: 1.5px solid #e4e7eb;
    border-radius: 12px;
    font-size: 0.95rem;
    color: #2f3542;
    background: #f8f9fa;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    box-sizing: border-box;
    width: 100%;
}

.field input:focus {
    border-color: #2ed573;
    box-shadow: 0 0 0 3px rgba(46, 213, 115, 0.12);
    background: #fff;
}

/* === PAIEMENT === */
.payment-section {
    margin-top: 8px;
    padding-top: 24px;
    border-top: 1px solid #f1f2f6;
}

.payment-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.05rem;
    font-weight: 700;
    color: #2f3542;
    margin-bottom: 16px;
}

.payment-option {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    border: 2px solid #2ed573;
    border-radius: 14px;
    background: rgba(46, 213, 115, 0.05);
    color: #2f3542;
    font-size: 0.95rem;
}

.payment-option p {
    margin: 4px 0 0;
    font-size: 0.83rem;
    color: #747d8c;
}

.check-icon {
    margin-left: auto;
    color: #2ed573;
    font-size: 1.2rem;
}

/* === ACTIONS === */
.form-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 12px;
}

.btn-back {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-radius: 12px;
    border: 1.5px solid #e4e7eb;
    background: #fff;
    color: #2f3542;
    font-size: 0.92rem;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s ease;
}

.btn-back:hover {
    background: #f8f9fa;
    border-color: #ced6e0;
}

.btn-confirm {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 28px;
    background: linear-gradient(135deg, #2ed573, #26af5f);
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 15px rgba(46, 213, 115, 0.3);
}

.btn-confirm:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(46, 213, 115, 0.4);
}

.btn-confirm:disabled {
    opacity: 0.65;
    cursor: not-allowed;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
.spin { animation: spin 1s linear infinite; }

/* === RÉSUMÉ === */
.order-summary {
    flex: 1;
    background: #fff;
    border-radius: 20px;
    padding: 28px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    position: sticky;
    top: 84px;
}

.summary-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #2f3542;
    margin-bottom: 20px;
}

.summary-items {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 16px;
}

.summary-item {
    display: flex;
    align-items: center;
    gap: 12px;
}

.summary-img {
    width: 52px;
    height: 52px;
    border-radius: 10px;
    object-fit: cover;
    background: #f0f1f3;
    flex-shrink: 0;
}

.summary-img-placeholder {
    width: 52px;
    height: 52px;
    border-radius: 10px;
    background: #f0f1f3;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #a4b0be;
    font-size: 1.2rem;
    flex-shrink: 0;
}

.summary-item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.summary-item-name {
    font-size: 0.88rem;
    font-weight: 600;
    color: #2f3542;
}

.summary-item-qty {
    font-size: 0.8rem;
    color: #a4b0be;
}

.summary-item-price {
    font-size: 0.95rem;
    font-weight: 700;
    color: #2f3542;
}

.summary-sep {
    border: 0;
    border-top: 1px solid #f1f2f6;
    margin: 16px 0;
}

.summary-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    color: #747d8c;
    font-weight: 500;
    margin-bottom: 10px;
}

.summary-row.total {
    font-size: 1.15rem;
    font-weight: 800;
    color: #2f3542;
    margin-top: 4px;
}

.free {
    color: #2ed573;
    font-weight: 700;
}

/* === CONFIRMATION === */
.confirmation {
    text-align: center;
    padding: 80px 20px;
    background: #fff;
    border-radius: 24px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.05);
}

.confirmation-icon {
    font-size: 5rem;
    color: #2ed573;
    margin-bottom: 24px;
}

.confirmation h2 {
    font-size: 2rem;
    font-weight: 800;
    color: #2f3542;
    margin-bottom: 12px;
}

.confirmation p {
    color: #747d8c;
    font-size: 1rem;
    margin-bottom: 8px;
    line-height: 1.6;
}

.btn-home {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-top: 28px;
    padding: 14px 28px;
    background: #2f3542;
    color: #fff;
    border-radius: 12px;
    font-weight: 700;
    text-decoration: none;
    transition: transform 0.2s ease;
}

.btn-home:hover {
    transform: translateY(-2px);
}

@media (max-width: 900px) {
    .checkout-layout { flex-direction: column; }
    .order-summary { position: static; }
    .form-row { flex-direction: column; }
}
</style>
