<script setup>
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import ProductPanier from '@/components/frontoffice/ProductPanier.vue';

import { createCart, getCarts, getCart, mergeUnpaidCarts, getUnpaidCarts, deleteCart } from '@/service/cartService';
import { getCustomerAddresses } from '@/service/addressService';
import { getCustomer } from '@/service/customerService';

import { extractText } from '@/service/prestashopUtils';
import { getCartStorageKey, enrichCartItem, getItemStock, computeTotalTtc, computeTotalHt, saveCart } from '@/service/cartLocalService';
import { findCodStateId } from '@/service/checkoutService';

const router = useRouter();
const panier = ref([]);
const loading = ref(true); // VITAL : On commence à true pour éviter l'écran "Panier vide"
const message = ref('');
const messageType = ref('');
const codStateId = ref(10);
const secureKey = ref('');

// Variable pour afficher un petit état de chargement spécifique au bouton
const isMerging = ref(false);

async function relancerRegroupement() {
    const customerJson = localStorage.getItem('customer');

    if (customerJson) {
        const customerData = JSON.parse(customerJson);

        // 1. On active l'état de chargement et on prévient l'utilisateur
        isMerging.value = true;
        message.value = "Regroupement de vos anciens paniers en cours...";
        messageType.value = "success";

        try {
            // 2. On lance la fusion.
            const nouveauPanier = await mergeUnpaidCarts(customerData.id, getCustomerAddresses(JSON.parse(localStorage.getItem("customer")).id));
            if (nouveauPanier) {
                // 3. Si un regroupement a eu lieu, on recharge l'affichage local du panier
                await loadCart();
                message.value = "Vos anciens paniers abandonnés ont été regroupés avec succès !";
                messageType.value = "success";
            } else {
                message.value = "Vous n'avez aucun autre panier abandonné à regrouper.";
                messageType.value = "error";
            }
        } catch (error) {
            console.error("Erreur lors de la fusion :", error);
            message.value = "Impossible de regrouper les paniers pour le moment.";
            messageType.value = "error";
        } finally {
            // 4. On désactive le chargement du bouton
            isMerging.value = false;
        }
    } else {
        message.value = "Vous devez être connecté pour regrouper vos paniers.";
        messageType.value = "error";
    }
}

function getRowsFromCart(cart) {
    const assoc = cart?.associations;
    if (!assoc || !assoc.cart_rows) return [];
    const rawRows = assoc.cart_rows.cart_row || assoc.cart_rows;
    return Array.isArray(rawRows) ? rawRows : (rawRows && typeof rawRows === 'object' ? [rawRows] : []);
}

// ========== Panier localStorage & API ==========
onMounted(async () => {
    console.log("🚀 1. Le composant Panier est bien monté !");
    const cod = await findCodStateId();
    if (cod) codStateId.value = cod;
    loadCart();
});

async function loadCart() {
    console.log("🛒 2. Lancement de loadCart()");
    loading.value = true;

    // On déclare la variable TOUT EN HAUT pour régler le problème de "not defined"
    let initialCart = [];
    const storageKey = getCartStorageKey();

    try {
        // Récupération du panier local
        let cartJson = localStorage.getItem(storageKey);
        if (cartJson) {
            initialCart = JSON.parse(cartJson);
        }

        // 1. Récupération du panier API si client connecté
        const customerJson = localStorage.getItem('customer');
        console.log("👤 3. Statut du client :", customerJson ? "Connecté" : "Non connecté (Visiteur)");

        if (customerJson) {
            const customerData = JSON.parse(customerJson);
            if (customerData?.id) {
                // 1. On utilise notre fonction sécurisée qui filtre MANUELLEMENT en Javascript
                const myUnpaidCarts = await getUnpaidCarts(customerData.id);

                // 2. Tri manuel en JavaScript par ID décroissant pour mettre le plus récent en 1er
                myUnpaidCarts.sort(function (a, b) {
                    let idA = parseInt(extractText(a.id), 10) || 0;
                    let idB = parseInt(extractText(b.id), 10) || 0;
                    return idB - idA; // Ordre décroissant
                });

                if (myUnpaidCarts.length > 0) {
                    // Le panier index 0 est maintenant à 100% le plus récent du client connecté
                    let latestCart = myUnpaidCarts[0];
                    let rows = getRowsFromCart(latestCart);

                    if (rows.length > 0) {
                        const mappedItems = [];
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

                        if (mappedItems.length > 0) {
                            // On remplace le panier local par celui de l'API
                            initialCart = mappedItems;
                        }
                    }
                }
            }
        }
        
        // 2. Enrichissement des données (prix, noms, images)
        if (initialCart.length > 0) {
            console.log("📦 4. Articles trouvés, on enrichit les données...", initialCart);
            const enrichedCart = await Promise.all(initialCart.map(item => enrichCartItem(item)));
            panier.value = enrichedCart;
            saveCart(null, enrichedCart);
        } else {
            console.log("📭 4. Aucun article trouvé, panier vide.");
            panier.value = [];
        }

    } catch (e) {
        console.error("Erreur globale lors du chargement du panier:", e);
        panier.value = [];
    } finally {
        loading.value = false; // L'affichage se met à jour et fait disparaître le "loading"
    }
}

const totalPanier = computed(() => {
    return computeTotalTtc(panier.value);
});

const totalPanierHt = computed(() => {
    return computeTotalHt(panier.value);
});

async function updateQuantity(index, newQty) {
    if (newQty <= 0) return;

    const item = panier.value[index];
    if (!item) return;

    const available = await getItemStock(item.id_product, item.id_product_attribute);
    if (available <= 0) {
        message.value = `Stock insuffisant pour ${item.name || 'ce produit'}.`;
        messageType.value = 'error';
        return;
    }

    if (newQty > available) {
        message.value = `Stock insuffisant pour ${item.name || 'ce produit'}. Disponible: ${available}.`;
        messageType.value = 'error';
        newQty = available;
    }

    panier.value[index].quantity = newQty;
    saveCart(null, panier.value);
}

function removeItem(index) {
    panier.value.splice(index, 1);
    saveCart(null, panier.value);
}

function viderPanier() {
    if (confirm("Voulez-vous vraiment vider votre panier ?")) {
        panier.value = [];
        saveCart(null, []);
        // Nettoyage des paniers non payés côté API pour éviter les retours fantômes
        const customerJson = localStorage.getItem('customer');
        if (customerJson) {
            try {
                const customerData = JSON.parse(customerJson);
                if (customerData?.id) {
                    getUnpaidCarts(customerData.id).then((carts) => {
                        carts.forEach((cart) => {
                            const cartId = extractText(cart.id);
                            if (cartId) {
                                deleteCart(cartId);
                            }
                        });
                    });
                }
            } catch (e) {
                console.warn('Erreur nettoyage panier API:', e);
            }
        }
    }
}

// ========== Commande PrestaShop ==========
async function passerCommande() {
    router.push('/checkout');
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

        <!-- État de chargement -->
        <div v-if="loading" class="empty-cart loading-cart">
            <div class="empty-icon spin">
                <Icon icon="lucide:loader-2" />
            </div>
            <h2>Chargement de votre panier</h2>
            <p>Nous récupérons vos articles...</p>
        </div>

        <div v-else-if="panier.length > 0" class="panier-layout">
            <!-- Liste des produits -->
            <div class="main_left">
                <div class="items-list">
                    <ProductPanier v-for="(item, index) in panier" :key="index" :nom="item.name"
                        :prix-ttc="calculateTtc(item.price, item.taxRate)" :prix-ht="item.price" :quantite="item.quantity" :image="item.image"
                        @update:quantite="(newQty) => updateQuantity(index, newQty)" @supprimer="removeItem(index)" />
                </div>

                <div class="panier-actions">
                    <button class="btn-regrouper" @click="relancerRegroupement" :disabled="isMerging">
                        <Icon icon="lucide:git-merge" :class="{ 'spin': isMerging }" />
                        <span v-if="isMerging">Regroupement...</span>
                        <span v-else>Récupérer mes anciens paniers abandonnés</span>
                    </button>

                    <button class="btn-vider" @click="viderPanier">
                        Vider le panier
                    </button>
                </div>
            </div>

            <!-- Résumé / Total -->
            <div class="right">
                <div class="summary-card">
                    <h2 class="summary-title">Récapitulatif</h2>

                    <div class="summary-row">
                        <span>Sous-total HT</span>
                        <span>{{ totalPanierHt }} €</span>
                    </div>
                    <div class="summary-row">
                        <span>Sous-total TTC</span>
                        <span>{{ totalPanier }} €</span>
                    </div>
                    <div class="summary-row">
                        <span>Livraison</span>
                        <span class="free-shipping">Gratuit</span>
                    </div>

                    <hr class="separator">

                    <div class="summary-row total">
                        <span>Total TTC</span>
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
            <div class="panier-actions">
                <button class="btn-regrouper" @click="relancerRegroupement" :disabled="isMerging">
                    <Icon icon="lucide:git-merge" :class="{ 'spin': isMerging }" />
                    <span v-if="isMerging">Regroupement...</span>
                    <span v-else>Récupérer mes anciens paniers abandonnés</span>
                </button>
            </div>
            <h2>Votre panier est vide</h2>
            <p>Découvrez nos produits et commencez vos achats !</p>
            <router-link to="/" class="btn-back">Retour à la boutique</router-link>
        </div>
    </div>
</template>

<style scoped>
.panier-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 15px;
}

.btn-regrouper {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: #f1f2f6;
    color: #2f3542;
    border: 1px solid #ced6e0;
    padding: 10px 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-regrouper:hover:not(:disabled) {
    background-color: #e4e7eb;
    color: #2563eb;
    border-color: #2563eb;
}

.btn-regrouper:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

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
    from {
        opacity: 0;
        transform: translateY(-10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
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
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
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
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
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
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
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