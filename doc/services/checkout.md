# Service : Commande et Checkout (`checkoutService.js`)

Ce service centralise toute la logique complexe permettant de transformer un panier local en une véritable commande dans PrestaShop. 

---

## ⚙️ Rôle et Fonctionnement

*   **Validation des stocks** (`validateCartStock`) : Vérifie si les quantités demandées dans le panier sont bien disponibles dans le stock réel du magasin avant d'autoriser le paiement.
*   **Création de la Commande** (`processCheckout`) : C'est le chef d'orchestre. Il s'occupe de :
    1. Récupérer ou créer l'adresse de livraison du client.
    2. Créer le panier (Cart) côté PrestaShop via l'API.
    3. Transformer ce panier en Commande (Order).
    4. Forcer la décrémentation des stocks physiques pour que le magasin soit à jour.

---

## 📘 Guide d'utilisation des fonctions

### 1. Structure attendue pour `cartItems`
Plusieurs fonctions de ce service (et de l'application) utilisent un tableau d'articles appelé `cartItems` (ou `panier_row`). Voici la structure exacte d'un objet "article" attendue par les fonctions du service :

```javascript
const cartItems = [
    {
        id_product: "12",                // ID du produit (Obligatoire)
        id_product_attribute: "34",      // ID de la déclinaison (Optionnel, ou "0" si pas de déclinaison)
        quantity: 2,                     // Quantité demandée (Obligatoire)
        price: 15.50,                    // Prix unitaire HT (Obligatoire pour la création de commande)
        name: "T-Shirt Noir",            // Nom du produit (Utilisé pour l'affichage des erreurs et la commande)
        reference: "TS-NOIR-34"          // Référence (Optionnel)
    }
];
```

### 2. Valider le stock : `validateCartStock(cartItems, getItemStockFn)`
Avant de lancer une commande, il faut vérifier que le stock est suffisant.
Cette fonction prend vos articles, et une fonction callback qui permet d'aller lire le stock.

**Exemple d'utilisation :**
```javascript
import { validateCartStock } from '@/service/checkoutService';
import { getItemStock } from '@/service/cartLocalService';

// On passe le panier, et on lui indique comment récupérer le stock d'un item
const stockValidation = await validateCartStock(cartItems, async (item) => {
    return await getItemStock(item.id_product, item.id_product_attribute);
});

if (!stockValidation.valid) {
    // S'il manque du stock, stockValidation.error contient le message détaillé
    // Ex: "Stock insuffisant pour T-Shirt Noir. Disponible: 1, dans le panier: 2."
    console.error(stockValidation.error);
    alert(stockValidation.error);
} else {
    console.log("Le stock est suffisant, on peut payer !");
}
```

### 3. Finaliser l'achat : `processCheckout(customer, form, cartItems, codStateId)`
C'est la fonction principale pour valider le panier. 

*   `customer` : Objet contenant les infos du client connecté (ex: `{ id: 5, firstname: "Jean", ... }`).
*   `form` : Objet contenant l'adresse de livraison (ex: `{ alias: "Domicile", address1: "1 rue de Paris", ... }`).
*   `cartItems` : Tableau des produits (voir structure plus haut).
*   `codStateId` : L'ID de l'état de la commande (ex: `6` pour "Paiement à la livraison", ou `2` pour "Paiement accepté").

**Exemple d'utilisation :**
```javascript
import { processCheckout } from '@/service/checkoutService';

// Lance la création complète de la commande
const result = await processCheckout(customerData, addressForm, cartItems, 6);

if (result.success) {
    console.log("Commande réussie ! ID de la commande :", result.orderId);
    // Vider le panier local par exemple
} else {
    console.error("Échec de la commande :", result.error);
}
```

---

## 🛠️ Code Principal de l'Orchestration

Voici comment `processCheckout` orchestre les opérations en coulisses :

```javascript
export async function processCheckout(customer, form, cartItems, codStateId) {
    try {
        // 1. Gestion de l'adresse
        let idAdresse = await getCustomerAddressId(customer.id);
        if (!idAdresse) idAdresse = await createAddress(customer.id, form);

        // 2. Création du panier API
        const cartXml = buildCartXml(customer.id, idAdresse, cartItems);
        const cartResp = await createCart(cartXml);
        const idCart = cartResp?.id || 0;

        // 3. Transformation en Commande (Order)
        const orderXml = buildOrderXml(idCart, customer.id, idAdresse, cartItems, codStateId, totalHt);
        const orderResp = await createOrder(orderXml);
        const orderId = orderResp?.id;

        // 4. Forcer la décrémentation des stocks physiques dans PrestaShop
        for (let i = 0; i < cartItems.length; i++) {
            let item = cartItems[i];
            await decrementStock(item.id_product, item.id_product_attribute || 0, item.quantity, orderId);
        }

        return { success: true, orderId: orderId, error: null };
    } catch (err) {
        return { success: false, orderId: null, error: 'Erreur lors de la commande' };
    }
}
```
