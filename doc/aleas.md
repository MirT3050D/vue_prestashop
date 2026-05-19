# Aléas Possibles du Projet (Évaluation J1-J2-J3)

Ce document récapitule les différents imprévus ("aléas") techniques et fonctionnels que l'enseignant pourrait imposer lors de la soutenance pour évaluer la robustesse, la flexibilité et la compréhension du code de l'application. Chaque cas est accompagné du sujet de l'aléa, du comportement actuel et de sa solution technique avec le code correspondant.

---

## 📦 1. Aléas sur l'Importation des Produits (`productImport.js`)

*   **Gestion des doublons (Mise à jour si existant) :**
    *   **Sujet de l'aléa :** *"Si un produit du CSV possède une référence déjà enregistrée dans PrestaShop, mettez à jour ses informations (prix, nom) via l'API au lieu de générer un doublon."*
    *   *Comportement actuel :* Le script effectue un `POST` systématique. Si une référence existe déjà, le produit est dupliqué.
    *   *Solution technique :* Faire une recherche par référence avant de choisir entre `POST` (création) ou `PUT` (mise à jour).
    ```javascript
    // Dans productImport.js, au début de la boucle d'importation :
    const checkResp = await getXml(`/products?filter[reference]=[${row.reference}]&display=[id]`);
    const existing = checkResp?.prestashop?.products?.product;
    const existingId = existing ? extractText(Array.isArray(existing) ? existing[0].id : existing.id) : null;

    if (existingId) {
        logCallback('info', `Le produit avec la référence ${row.reference} existe déjà (ID: ${existingId}). Mise à jour en cours...`);
        // Charger le produit actuel pour obtenir sa structure XML complète
        const productData = await getXml(`/products/${existingId}`);
        if (productData?.prestashop?.product) {
            // Mettre à jour les champs nécessaires
            productData.prestashop.product.price = priceHT.toFixed(6);
            productData.prestashop.product.wholesale_price = finalWholesalePrice.toFixed(6);
            productData.prestashop.product.name.language['#text'] = row.nom;
            
            // Nettoyage vital des champs en lecture seule pour éviter l'erreur 127
            delete productData.prestashop.product.manufacturer_name;
            delete productData.prestashop.product.quantity;
            delete productData.prestashop.product.id_default_image;
            delete productData.prestashop.product.id_default_combination;
            delete productData.prestashop.product.position_in_category;
            delete productData.prestashop.product.type;

            await putXml(`/products/${existingId}`, productData);
            logCallback('success', `Produit ${row.reference} mis à jour avec succès.`);
        }
    } else {
        // ... Logique existante du POSTXml ...
    }
    ```

*   **Formats de date alternatifs :**
    *   **Sujet de l'aléa :** *"Le fichier d'importation contient désormais des dates au format ISO (AAAA-MM-JJ). Modifiez le parser pour qu'il prenne en charge à la fois les anciens formats (JJ/MM/AAAA) et ce nouveau format."*
    *   *Comportement actuel :* La date est strictement validée sur le format `DD/MM/YYYY`.
    *   *Solution technique :* Utiliser un parser de date flexible qui prend en charge les formats `DD/MM/YYYY` et `YYYY-MM-DD` (format natif PrestaShop).
    ```javascript
    // Dans productImport.js, remplacer la validation de date par :
    const trimmedDate = rawDate.trim();
    let formattedDate = null;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmedDate)) {
        // Format DD/MM/YYYY
        const parts = trimmedDate.split('/');
        formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        // Format YYYY-MM-DD
        formattedDate = trimmedDate;
    } else {
        throw new Error(`La date "${rawDate}" n'est pas dans un format reconnu (DD/MM/YYYY ou YYYY-MM-DD).`);
    }
    ```

*   **Catégories imbriquées (Hiérarchie multi-niveaux) :**
    *   **Sujet de l'aléa :** *"Les catégories dans le fichier produits.csv sont maintenant hiérarchisées sous la forme 'Parent > Enfant'. Adaptez l'import pour recréer cette hiérarchie dans PrestaShop."*
    *   *Comportement actuel :* Les nouvelles catégories sont créées directement sous la catégorie Accueil (ID 2).
    *   *Solution technique :* Parcourir la chaîne (ex: `Vêtements > Homme > T-shirts`), chercher ou créer chaque niveau récursivement et récupérer le dernier ID de catégorie pour le lier au produit.
    ```javascript
    // Fonction utilitaire pour résoudre ou créer une catégorie sous un parent donné :
    async function getOrCreateCategory(categoryName, parentId = 2) {
        const catResp = await getXml(`/categories?filter[name]=[${categoryName}]&filter[id_parent]=[${parentId}]&display=[id]`);
        const cat = catResp?.prestashop?.categories?.category;
        if (cat) {
            return extractText(Array.isArray(cat) ? cat[0].id : cat.id);
        }
        // Création de la catégorie si introuvable
        const payload = {
            prestashop: {
                category: {
                    id_parent: parentId,
                    active: 1,
                    name: { language: { '@_id': '1', '#text': categoryName } },
                    link_rewrite: { language: { '@_id': '1', '#text': categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-') } }
                }
            }
        };
        const created = await postXml('/categories', payload);
        return extractText(created?.prestashop?.category?.id);
    }

    // Dans la boucle d'import :
    let currentParentId = 2;
    const categoriesNames = row.categorie.split('>').map(c => c.trim());
    for (const name of categoriesNames) {
        currentParentId = await getOrCreateCategory(name, currentParentId);
    }
    const finalCategoryId = currentParentId; // À associer au produit
    ```

---

## 🎨 2. Aléas sur l'Importation des Déclinaisons (`variantImport.js`)

*   **Combinaisons à attributs multiples (ex : Taille ET Couleur) :**
    *   **Sujet de l'aléa :** *"Les déclinaisons comportent maintenant plusieurs attributs distincts sur une même ligne (ex: Taille et Couleur). Associez ces multiples attributs à la même combinaison dans PrestaShop."*
    *   *Comportement actuel :* Gère un seul attribut par ligne.
    *   *Solution technique :* Déclarer les valeurs de déclinaisons sous forme de tableau de plusieurs attributs dans le XML transmis à `/combinations`.
    ```javascript
    // Dans variantImport.js :
    // Supposons que le CSV possède des colonnes "Taille" et "Couleur" séparées :
    const sizeValueId = await resolveOrCreateAttribute("Taille", row.taille);
    const colorValueId = await resolveOrCreateAttribute("Couleur", row.couleur);

    const combPayload = {
        prestashop: {
            combination: {
                id_product: parentProductId,
                reference: `${reference}_${row.taille}_${row.couleur}`,
                price: priceImpact.toFixed(6),
                minimal_quantity: 1,
                associations: {
                    product_option_values: {
                        product_option_value: [
                            { id: sizeValueId },
                            { id: colorValueId }
                        ]
                    }
                }
            }
        }
    };
    const newComb = await postXml('/combinations', combPayload);
    ```

*   **Vérification de l'existence du parent :**
    *   **Sujet de l'aléa :** *"Lors de l'import des déclinaisons, si le produit parent correspondant à la référence de base n'existe pas en base de données, affichez une erreur propre dans les logs et passez à la ligne suivante sans bloquer le script."*
    *   *Solution technique :* Ne pas faire planter le script mais lever une alerte propre et enregistrer la ligne rejetée dans un rapport final.
    ```javascript
    const productSearch = await getXml(`/products?filter[reference]=[${reference}]&display=[id,price]`);
    let parentProduct = productSearch?.prestashop?.products?.product;
    if (!parentProduct) {
        logCallback('error', `Ligne ignorée : Le produit parent avec la référence "${reference}" n'existe pas dans PrestaShop.`);
        continue; // Passe à la déclinaison suivante
    }
    ```

---

## 🛒 3. Aléas sur l'Importation des Commandes (`orderImport.js`)

*   **Nouveaux statuts de commandes :**
    *   **Sujet de l'aléa :** *"Ajoutez la prise en charge de statuts de commande supplémentaires lors de l'import des commandes (par exemple : 'En cours de préparation' ou 'En attente de paiement' selon le mot-clé trouvé dans la colonne état)."*
    *   *Solution technique :* Compléter le dictionnaire d'états de commande dans `resolveOrderStateId` :
    ```javascript
    function resolveOrderStateId(etatRaw) {
        const value = String(etatRaw || '').toLowerCase();
        if (value.includes('livr')) return 5;          // Livré
        if (value.includes('annul') || value.includes('cancel')) return 6; // Annulé
        if (value.includes('prepa') || value.includes('prep')) return 3;   // En cours de préparation
        if (value.includes('attente') || value.includes('pend')) return 10; // En attente de paiement
        if (value.includes('accept') || value.includes('pay') || value.includes('paiement')) return 2; // Paiement accepté
        return 2; // Statut par défaut si non spécifié
    }
    ```

*   **Vérification des stocks physiques avant import :**
    *   **Sujet de l'aléa :** *"Si le stock disponible d'un produit est insuffisant pour honorer une commande du fichier CSV, la commande doit être importée avec le statut 'En attente de réapprovisionnement' (ID 9) au lieu de 'Paiement accepté'."*
    *   *Solution technique :* Interroger le stock de chaque article du panier. Si la quantité demandée est supérieure à la quantité disponible, rejeter l'import de la commande ou la placer en statut "Hors-Stock" (ID 9).
    ```javascript
    // Dans la boucle de traitement de chaque achat dans orderImport.js :
    const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${pId}]&filter[id_product_attribute]=[${attributeId}]&display=[quantity]`);
    const stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;
    const currentQty = parseInt(extractId(Array.isArray(stockAvailable) ? stockAvailable[0].quantity : stockAvailable?.quantity), 10) || 0;

    if (achat.quantite > currentQty) {
        logCallback('warn', `⚠️ Stock insuffisant pour ${achat.reference}. Demandé: ${achat.quantite}, En stock: ${currentQty}.`);
        // Option A : rejeter la commande
        // throw new Error(`Stock insuffisant pour l'import de la commande.`);
        // Option B : changer l'état de commande cible vers "En attente de réapprovisionnement" (ID 9)
        // targetOrderState = 9;
    }
    ```

*   **Anti-doublons de commandes :**
    *   **Sujet de l'aléa :** *"Empêchez la création de doublons de commandes si l'utilisateur exécute l'importation du même fichier de commandes plusieurs fois d'affilée."*
    *   *Solution technique :* Chercher s'il existe déjà une commande avec la même référence unique générée ou pour le même client à cette date précise.
    ```javascript
    // Dans orderImport.js, avant la création du panier :
    const existingOrderSearch = await getXml(`/orders?filter[id_customer]=[${customerId}]&filter[date_add]=[${formattedDate} 12:00:00]&display=[id]`);
    const existingOrder = existingOrderSearch?.prestashop?.orders?.order;
    if (existingOrder) {
        logCallback('warn', `Commande déjà importée pour ce client à la date du ${formattedDate} — saut de ligne.`);
        continue;
    }
    ```

---

## 🖼️ 4. Aléas sur l'Importation des Images (`imageImport.js`)

*   **Gestion des images multiples par produit (ex : `REF_01_1.jpg`, `REF_01_2.jpg`) :**
    *   **Sujet de l'aléa :** *"Le fichier ZIP contient plusieurs images pour un produit (ex: REF_01_1.jpg et REF_01_2.jpg). Extrayez la référence de base pour toutes les associer au produit correspondant."*
    *   *Solution technique :* Extraire la référence en supprimant le suffixe de l'image grâce à une expression régulière.
    ```javascript
    // Dans imageImport.js :
    const filename = imageFile.name;
    const baseName = filename.substring(0, filename.lastIndexOf('.')); // "REF_01_1"
    
    // Regex pour isoler la référence produit : extrait "REF_01" de "REF_01_1" ou "REF_01_2"
    let productRef = baseName;
    const match = baseName.match(/(.+?)_\d+$/);
    if (match) {
        productRef = match[1];
    }
    ```

*   **Association d'une image à une déclinaison spécifique :**
    *   **Sujet de l'aléa :** *"Les images du dossier ZIP doivent être associées à des déclinaisons de produits spécifiques (combinations) et non aux produits parents génériques."*
    *   *Solution technique :* Envoyer l'image sur le endpoint des déclinaisons `/images/combinations/{id_combination}` au lieu de `/images/products/{id_product}`.
    ```javascript
    // Si l'image porte le nom de la déclinaison (ex : "REF_01_BLEU.jpg") :
    const combSearch = await getXml(`/combinations?filter[reference]=[${encodeURIComponent(combinationRef)}]&display=[id]`);
    const combNode = combSearch?.prestashop?.combinations?.combination;
    if (combNode) {
        const combId = extractId(Array.isArray(combNode) ? combNode[0].id : combNode.id);
        const uploadUrl = `/images/combinations/${combId}`;
        await postImage(uploadUrl, imageAsFile);
    }
    ```

---

## 📊 5. Aléas sur le Backoffice & la Gestion de Stock

*   **Nettoyage du "Hack" de l'historique de stock :**
    *   **Sujet de l'aléa :** *"Corrigez la structure d'enregistrement des mouvements de stock pour qu'ils récurrent la ligne de stock réelle (id_stock) au lieu de détourner les colonnes id_order et id_supply_order."*
    *   *Explication :* Actuellement, vous forcez `id_order` = `productId` et `id_supply_order` = `attributeId` avec un `id_stock` = `0` pour afficher les noms.
    *   *Solution propre :* Enregistrer les mouvements avec le véritable `id_stock` (ID de `stock_available`) et laisser les IDs de commande à 0. Dans l'affichage Vue (`StockEvolution.vue`), mapper l'ID de stock pour récupérer l'ID de produit et de variante correspondants.
    ```javascript
    // 1. Enregistrement PROPRE du mouvement de stock :
    async function forceCleanStockMovement(stockAvailableId, employeeId, reasonId, delta, sign, dateAdd) {
        const baseXml = `
            <id_order><![CDATA[0]]></id_order>
            <id_supply_order><![CDATA[0]]></id_supply_order>
            <id_employee><![CDATA[${employeeId}]]></id_employee>
            <id_stock><![CDATA[${stockAvailableId}]]></id_stock>
            <id_stock_mvt_reason><![CDATA[${reasonId}]]></id_stock_mvt_reason>
            <physical_quantity><![CDATA[${Math.abs(delta)}]]></physical_quantity>
            <sign><![CDATA[${sign}]]></sign>
            <price_te><![CDATA[0.000000]]></price_te>
            <date_add><![CDATA[${dateAdd}]]></date_add>
        `;
        await postXml('/stock_movements', `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop><stock_mvt>${baseXml}</stock_mvt></prestashop>`);
    }

    // 2. Résolution dans StockEvolution.vue pour afficher les noms :
    function getMovementProductName(mvt) {
        const stockInfo = getMovementStockInfo(mvt); // Trouve l'élément dans stockAvailables via mvt.id_stock
        const pId = stockInfo ? safeValue(stockInfo.id_product) : '';
        if (pId) {
            const prod = products.value.find(p => String(p.id) === String(pId));
            if (prod) return getLangText(prod.name);
        }
        return 'Article Inconnu';
    }
    ```

*   **Export de données en CSV (Dashboard / Stats) :**
    *   **Sujet de l'aléa :** *"Ajoutez un bouton sur le tableau de bord d'évolution des stocks pour exporter l'historique actuellement filtré en format CSV."*
    *   *Solution technique :* Créer un lien de téléchargement dynamique en convertissant les mouvements de stock filtrés en format CSV.
    ```javascript
    // Dans DashboardView.vue ou StockEvolution.vue :
    function exportToCsv() {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Date,Article,Variante,Type,Quantite,Motif\n";
        
        filteredMovements.value.forEach(mvt => {
            const date = safeValue(mvt.date_add);
            const name = getMovementProductName(mvt).replace(/,/g, '');
            const variant = getMovementVariantName(mvt).replace(/,/g, '');
            const type = String(safeValue(mvt.sign)) === '1' ? 'Entree' : 'Sortie';
            const qty = safeValue(mvt.physical_quantity);
            const reason = getReasonLabel(safeValue(mvt.id_stock_mvt_reason), safeValue(mvt.sign)).replace(/,/g, '');
            
            csvContent += `${date},${name},${variant},${type},${qty},${reason}\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `historique_stocks_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    ```

---

## 💻 6. Aléas sur le Frontoffice

*   **Sécurisation du panier par rapport au stock de PrestaShop :**
    *   **Sujet de l'aléa :** *"Empêchez le client d'ajouter au panier plus de produits que la quantité disponible en stock dans PrestaShop (en vérifiant les stocks en temps réel lors du clic sur 'Ajouter')."*
    *   *Solution technique :* Récupérer le stock en temps réel via l'API avant de permettre l'ajout au panier.
    ```javascript
    // Dans FicheProduitView.vue lors de l'ajout au panier :
    async function ajouterAuPanier() {
        const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${produit.id}]&filter[id_product_attribute]=[${selectedVariantId.value || 0}]&display=[quantity]`);
        const stockItem = stockSearch?.prestashop?.stock_availables?.stock_available;
        const availableQty = parseInt(extractText(Array.isArray(stockItem) ? stockItem[0].quantity : stockItem?.quantity), 10) || 0;

        const cartQty = getCartItemQty(produit.id, selectedVariantId.value);
        if (cartQty + quantiteSelectionnee.value > availableQty) {
            alert(`Impossible d'ajouter au panier. Stock disponible : ${availableQty} unités.`);
            return;
        }
        // Effectuer l'ajout ...
    }
    ```

---

## 💼 7. Aléas Métier - Fiches Solutions & Code Associé (Business Logic)

Voici les solutions de code pour répondre aux imprévus métier les plus fréquents demandés par les enseignants.

### Fiche A : Frais de port dynamiques sous conditions de montant
*   **Sujet de l'aléa :** *"Mettez en place des règles de livraison dynamique : livraison gratuite à partir de 50€ d'achat, sinon facturer 5.90€ de frais de port."*
*   **Règle métier :** Livraison gratuite à partir de **50€ TTC** d'achat, sinon **5.90€ TTC** de frais de port.

#### Solution Frontoffice (`CheckoutView.vue`)
Modifiez les propriétés calculées et la construction du XML de commande :
```javascript
// 1. Définir le frais de port dans CheckoutView.vue
const shippingFee = computed(() => {
    return Number(totalPanier.value) >= 50 ? 0 : 5.90;
});

// 2. Mettre à jour le Grand Total TTC de la commande
const totalCommandeTtc = computed(() => {
    return (Number(totalPanier.value) + shippingFee.value).toFixed(2);
});

// 3. Dans la fonction passerCommande(), adapter le payload XML :
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
    <module>ps_checkout</module>
    <secure_key>${secureKey}</secure_key>
    <payment>Paiement accepté</payment>
    <total_paid>${totalCommandeTtc.value}</total_paid>
    <total_paid_real>${totalCommandeTtc.value}</total_paid_real>
    <total_products>${Number(totalPanierHt.value).toFixed(6)}</total_products>
    <total_products_wt>${Number(totalPanier.value).toFixed(6)}</total_products_wt>
    <total_shipping>${shippingFee.value.toFixed(6)}</total_shipping>
    <total_shipping_tax_excl>${(shippingFee.value / 1.2).toFixed(6)}</total_shipping_tax_excl>
    <total_shipping_tax_incl>${shippingFee.value.toFixed(6)}</total_shipping_tax_incl>
    <current_state>${codStateId.value}</current_state>
    <associations>
        <order_rows>${orderRowsXml}</order_rows>
    </associations>
  </order>
</prestashop>`;
```

#### Solution Import Commandes (`orderImport.js`)
Modifiez le calcul lors de l'import d'un fichier CSV de commandes :
```javascript
// Dans processOrderImport() de orderImport.js :
const shippingTtc = cartTotalTtc >= 50 ? 0 : 5.90;
const shippingHt = shippingTtc / 1.2; // TVA standard de 20% sur la livraison
const grandTotalTtc = cartTotalTtc + shippingTtc;
const grandTotalHt = cartTotalHt + shippingHt;

// Remplacer les totaux dans orderPayload :
// <total_paid><![CDATA[${grandTotalTtc.toFixed(6)}]]></total_paid>
// <total_shipping><![CDATA[${shippingTtc.toFixed(6)}]]></total_shipping>
```

---

### Fiche B : Montant minimum d'achat pour passer commande
*   **Sujet de l'aléa :** *"Empêchez le client de passer commande si le montant des articles de son panier n'atteint pas le minimum de 15€."*
*   **Règle métier :** Une commande ne peut pas être enregistrée si le total des produits est inférieur à **15.00€ TTC**.

#### Solution Frontoffice (`CheckoutView.vue`)
Ajouter un contrôle dans la fonction de validation du formulaire avant d'exécuter la commande :
```javascript
// Dans CheckoutView.vue, modifier validerFormulaire() :
function validerFormulaire() {
    if (Number(totalPanier.value) < 15.0) {
        return 'Le montant total de votre panier doit être d\'au moins 15.00€ TTC pour passer commande.';
    }
    if (!normalizeFormText(form.value.firstname)) return 'Le prénom est requis.';
    if (!normalizeFormText(form.value.lastname)) return 'Le nom est requis.';
    if (!normalizeFormText(form.value.address1)) return 'L\'adresse est requise.';
    if (!normalizeFormText(form.value.postcode)) return 'Le code postal est requis.';
    if (!normalizeFormText(form.value.city)) return 'La ville est requise.';
    return '';
}
```

---

### Fiche C : Remise automatique pour le Groupe Client VIP
*   **Sujet de l'aléa :** *"Les clients du groupe VIP (ID de groupe 4) bénéficient d'une remise automatique de 15% sur tous les produits."*
*   **Règle métier :** Si le client connecté est un client VIP (ID du groupe par défaut = `4`), appliquer une réduction immédiate de **15%** sur tous les prix du catalogue et recalculer le total.

#### Solution Calcul Prix (`CheckoutView.vue` et `FicheProduitView.vue`)
Dans le cas où le client est VIP, modifier la tarification :
```javascript
// 1. Déterminer si le client est VIP (vérification du groupe dans localStorage)
const isVip = computed(() => {
    const customerJson = localStorage.getItem('customer');
    if (!customerJson) return false;
    try {
        const c = JSON.parse(customerJson);
        // Supposons que id_default_group (ou group) vaut 4 pour VIP
        return String(c.id_default_group || c.id_group) === '4';
    } catch {
        return false;
    }
});

// 2. Appliquer la réduction de 15% sur les calculs de prix unitaire :
const getProductPrice = (item) => {
    const basePrice = Number(item.price || 0);
    return isVip.value ? basePrice * 0.85 : basePrice;
};

// 3. Modifier totalPanier et totalPanierHt pour prendre en compte le prix remisé
const totalPanier = computed(() => {
    let total = 0;
    for (let i = 0; i < panier.value.length; i++) {
        const discountedPrice = getProductPrice(panier.value[i]);
        const unitPriceTTC = calculateTtc(discountedPrice, panier.value[i].taxRate);
        total += (unitPriceTTC * panier.value[i].quantity);
    }
    return total.toFixed(2);
});
```

---

### Fiche D : Seuil critique d'alerte stock (Alerte pénurie)
*   **Sujet de l'aléa :** *"Si un produit a un stock faible (moins de 5 unités), affichez un avertissement visuel clignotant sur la fiche produit."*
*   **Règle métier :** Afficher un badge visuel clignotant "Pénurie imminente" si le stock d'un produit (ou d'une déclinaison) est inférieur à **5 unités** mais supérieur à 0. Désactiver le bouton d'achat si le stock est égal à 0.

#### Solution Frontoffice (`FicheProduitView.vue`)
Adapter l'interface de la fiche produit en fonction du stock :
```html
<!-- Dans le template de FicheProduitView.vue, section informations stock : -->
<div class="stock-status">
    <span v-if="stockQuantity === 0" class="badge out-of-stock">
        ❌ Rupture de stock
    </span>
    <span v-else-if="stockQuantity > 0 && stockQuantity < 5" class="badge low-stock critical-flash">
        ⚠️ Stock critique ! (Plus que {{ stockQuantity }} restants)
    </span>
    <span v-else class="badge in-stock">
        ✔️ En stock ({{ stockQuantity }} unités)
    </span>
</div>

<!-- Désactivation du bouton Ajouter au Panier : -->
<button 
    @click="ajouterAuPanier" 
    class="btn-add-cart" 
    :disabled="stockQuantity === 0"
>
    {{ stockQuantity === 0 ? 'Indisponible' : 'Ajouter au panier' }}
</button>
```

```css
/* Style associé dans <style scoped> */
.critical-flash {
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
    padding: 6px 12px;
    border-radius: 8px;
    font-weight: bold;
    animation: flash 1.5s infinite;
}

@keyframes flash {
    0% { opacity: 1; }
    50% { opacity: 0.4; }
    100% { opacity: 1; }
}
```

---

### Fiche E : Validation stricte des coordonnées du client (Téléphone et e-mail)
*   **Sujet de l'aléa :** *"Validez les informations de livraison : le téléphone doit être un mobile français valide et l'email doit être académique."*
*   **Règle métier :** Le numéro de téléphone saisi doit être un numéro mobile français valide (commençant par `06` ou `07` et composé de 10 chiffres). L'adresse e-mail doit obligatoirement être une adresse académique (ex: se terminant par `@etu.univ-paris8.fr`).

#### Solution Frontoffice (`CheckoutView.vue` ou inscription)
Ajouter des expressions régulières lors de la soumission du formulaire :
```javascript
// Dans CheckoutView.vue, insérer dans la validation :
function validerFormulaire() {
    // 1. Validation du téléphone mobile français (ex: 0612345678 ou 0712345678)
    const phoneClean = form.value.phone.replace(/[\s.-]/g, ''); // Nettoyer les espaces/tirets
    const phoneRegex = /^(06|07)\d{8}$/;
    if (form.value.phone && !phoneRegex.test(phoneClean)) {
        return 'Le numéro de téléphone doit être un mobile français valide (10 chiffres commençant par 06 ou 07).';
    }

    // 2. Validation du domaine d'adresse email du client
    const email = customer.value.email || '';
    if (!email.endsWith('@etu.univ-paris8.fr')) {
        return 'Seuls les utilisateurs munis d\'une adresse universitaire (@etu.univ-paris8.fr) peuvent valider un achat.';
    }

    if (!normalizeFormText(form.value.firstname)) return 'Le prénom est requis.';
    if (!normalizeFormText(form.value.lastname)) return 'Le nom est requis.';
    if (!normalizeFormText(form.value.address1)) return 'L\'adresse est requise.';
    if (!normalizeFormText(form.value.postcode)) return 'Le code postal est requis.';
    if (!normalizeFormText(form.value.city)) return 'La ville est requise.';
    return '';
}
```

---

### Fiche F : Limitation des quantités par panier
*   **Sujet de l'aléa :** *"Limitez la quantité maximale d'un même article à 5 unités par panier afin d'éviter la revente."*
*   **Règle métier :** Limiter l'achat à un maximum de **5 exemplaires** du même produit (ou déclinaison) par commande pour éviter la spéculation ou la revente sauvage.

#### Solution Frontoffice (`PanierView.vue` et `FicheProduitView.vue`)
Empêcher l'ajout ou la mise à jour de la quantité au-delà de 5 :
```javascript
// Dans FicheProduitView.vue, lors de l'ajout au panier :
function ajouterAuPanier() {
    const quantiteExistante = obtenirQuantiteDansPanier(produit.id); // Fonction utilitaire locale
    const nouvelleQuantite = quantiteExistante + quantiteSelectionnee.value;

    if (nouvelleQuantite > 5) {
        alert("Règle commerciale : Vous ne pouvez pas acheter plus de 5 exemplaires de ce produit.");
        return;
    }
    // Effectuer l'ajout ...
}

// Dans PanierView.vue, lors de la modification de quantité dans le tableau :
function modifierQuantite(item, delta) {
    const nouvelleQuantite = item.quantity + delta;
    if (nouvelleQuantite > 5) {
        alert("Quantité maximale de 5 exemplaires atteinte.");
        return;
    }
    if (nouvelleQuantite <= 0) {
        retirerDuPanier(item);
    } else {
        item.quantity = nouvelleQuantite;
        sauvegarderPanier();
    }
}
```

---

### Fiche G : Choix dynamique du transporteur au Checkout
*   **Sujet de l'aléa :** *"Laissez le client choisir entre deux modes de livraison au checkout : 'Retrait en magasin' (0.00€, Carrier ID: 1) ou 'Colissimo à domicile' (6.90€, Carrier ID: 2), et mettez à jour les totaux XML en conséquence."*
*   **Règle métier :** L'utilisateur sélectionne un transporteur dans un `<select>`. Si Colissimo est choisi, rajouter 6.90€ aux totaux payés et changer la balise `<id_carrier>` à `2`.

#### Solution Frontoffice (`CheckoutView.vue`)
```html
<!-- Dans CheckoutView.vue, ajouter l'élément HTML dans le formulaire : -->
<div class="field-group">
    <label>Mode de livraison</label>
    <select v-model="selectedCarrier" class="form-select">
        <option value="1">Retrait en Magasin (Gratuit)</option>
        <option value="2">Colissimo à Domicile (+6.90 €)</option>
    </select>
</div>
```

```javascript
// Dans <script setup> de CheckoutView.vue :
const selectedCarrier = ref("1");

const carrierCost = computed(() => {
    return selectedCarrier.value === "2" ? 6.90 : 0.00;
});

// Adapter le total global :
const totalCommandeTtc = computed(() => {
    return (Number(totalPanier.value) + carrierCost.value).toFixed(2);
});

// Et dans la construction de orderXml :
// <id_carrier>${selectedCarrier.value}</id_carrier>
// <total_shipping>${carrierCost.value.toFixed(6)}</total_shipping>
```

---

### Fiche H : Commande dans une Devise Alternative (Multi-currency)
*   **Sujet de l'aléa :** *"Permettez la validation de commandes dans une devise différente de l'Euro, par exemple le Dollar (USD, ID 2 dans PrestaShop), en appliquant un taux de conversion au checkout."*
*   **Règle métier :** Récupérer la devise sélectionnée. Si Dollar (USD), multiplier les montants par le taux de conversion (ex: `1.08`) et soumettre la commande avec `<id_currency>2</id_currency>`.

#### Solution Frontoffice (`CheckoutView.vue`)
```javascript
const selectedCurrency = ref("1"); // 1 = EUR, 2 = USD
const conversionRate = computed(() => {
    return selectedCurrency.value === "2" ? 1.085000 : 1.000000;
});

// Modifier la valeur envoyée dans le XML :
const totalPaidInCurrency = computed(() => {
    return (Number(totalCommandeTtc.value) * conversionRate.value).toFixed(6);
});

// Dans le XML de commande envoyé :
// <id_currency>${selectedCurrency.value}</id_currency>
// <conversion_rate>${conversionRate.value.toFixed(6)}</conversion_rate>
// <total_paid>${totalPaidInCurrency.value}</total_paid>
```

---

### Fiche I : Double confirmation de réinitialisation (Safety Lock)
*   **Sujet de l'aléa :** *"Pour éviter tout clic accidentel sur le bouton de réinitialisation de la base de données, exigez que l'utilisateur saisisse un code de confirmation d'administrateur sécurisé avant de pouvoir débloquer l'action."*
*   **Règle métier :** Exiger un mot de passe d'administration (ex : `ADMIN3132`) pour activer le bouton de suppression globale.

#### Solution Backoffice (`ResetView.vue`)
```javascript
// Dans ResetView.vue, modifier le canRun existant :
const adminPassword = ref('');

const canRun = computed(() => {
  const isConfirmOk = confirmationText.value.trim().toUpperCase() === 'RESET';
  const isAdminPasswordOk = adminPassword.value === 'ADMIN3132';
  return selectedTargets.value.length > 0 && isConfirmOk && isAdminPasswordOk && !isRunning.value;
});
```

```html
<!-- Dans le template de ResetView.vue, ajouter le champ de sécurité : -->
<label class="field">
  <span>Code de sécurité Administrateur</span>
  <input v-model="adminPassword" type="password" placeholder="Mot de passe admin" />
</label>
```

---

### Fiche J : Importation partielle en cas de rupture de stock (Split Orders)
*   **Sujet de l'aléa :** *"Lors de l'import d'une commande CSV, si un article est en rupture de stock, importez quand même la commande mais retirez l'article en rupture du panier créé dans PrestaShop."*
*   **Règle métier :** Filtrer la liste des articles d'une commande importée pour n'ajouter au panier PrestaShop que les lignes dont le stock disponible est supérieur ou égal à la quantité demandée.

#### Solution Import Commandes (`orderImport.js`)
```javascript
// Dans processOrderImport() de orderImport.js :
const activeCartRows = [];

for (const achat of achatsList) {
    // 1. Récupérer le stock disponible actuel du produit ou de la variante
    const stockSearch = await getXml(`/stock_availables?filter[id_product]=[${pId}]&filter[id_product_attribute]=[${attributeId}]&display=[quantity]`);
    const stockAvailable = stockSearch?.prestashop?.stock_availables?.stock_available;
    const currentQty = parseInt(extractId(Array.isArray(stockAvailable) ? stockAvailable[0].quantity : stockAvailable?.quantity), 10) || 0;

    if (currentQty >= achat.quantite) {
        // Stock suffisant : on garde l'article pour le panier
        activeCartRows.push(achat);
    } else {
        logCallback('warn', `Produit ${achat.reference} écarté du panier pour rupture de stock.`);
    }
}

// Si activeCartRows est vide, on peut ignorer la création de la commande complète :
if (activeCartRows.length === 0) {
    logCallback('error', `Commande ignorée : aucun produit n'a de stock disponible.`);
    continue;
}
```
