# Importation : Produits (`productImport.js`)

Ce module gère le parsing et l'intégration des fiches produits de base dans PrestaShop à partir d'un fichier CSV.

---

## ⚙️ Fonctionnement et Règles Métier

1.  **Validation Strict des Colonnes** :
    *   Le CSV doit contenir : `nom`, `reference`, `prix_ttc`, `taxe`, `categorie`, `prix_achat`, `date_availability_produit`.
    *   Toutes les clés du fichier CSV sont nettoyées et converties en minuscules pour éviter les erreurs de casse.
2.  **Règles de Sécurité & Validations** :
    *   Le nom et la référence du produit sont obligatoires.
    *   Le prix de vente TTC, la taxe et le prix d'achat doivent être des nombres positifs ou nuls.
    *   La date de disponibilité, si fournie, doit obligatoirement être au format `DD/MM/YYYY`.
3.  **Résolution / Création des Taxes** :
    *   Recherche un groupe fiscal correspondant au taux de taxe indiqué.
    *   Si aucun groupe n'existe, il crée automatiquement la taxe (ex: `20.00%`), le groupe de taxe et la règle fiscale associée pour le pays par défaut de la boutique.
4.  **Résolution / Création de la Catégorie** :
    *   Si la catégorie n'existe pas, elle est créée sous la catégorie parente d'accueil.
5.  **Forçage de la date historique (PUT)** :
    *   L'écriture de la date de disponibilité nécessite un premier appel `POST` pour enregistrer le produit, puis un second appel `PUT`. Les nœuds générés automatiquement par PrestaShop (quantités, type, images) sont nettoyés dans l'objet XML avant le `PUT` pour éviter une erreur de validation Webservice.

---

## 🛠️ Code Principal

Voici l'implémentation de la logique de création et de mise à jour des produits dans `src/service/productImport.js` :

```javascript
import { getXml, postXml, putXml } from '@/service/api';

// Traitement central de l'import d'une ligne produit
export const processProductImport = async (data, logCallback) => {
  // ... Normalisation et validations ...

  const priceHT = priceTTC / (1 + (taxRate / 100));
  const finalWholesalePrice = isNaN(wholesalePrice) || wholesalePrice < 0 ? 0 : wholesalePrice;

  // Création du payload XML du produit
  const productPayload = {
    prestashop: {
      product: {
        state: 1,
        active: 1,
        reference: row.reference,
        price: priceHT.toFixed(6),
        wholesale_price: finalWholesalePrice.toFixed(6),
        id_tax_rules_group: taxRulesGroupId,
        id_category_default: categoryId,
        name: { language: { '@_id': '1', '#text': row.nom } },
        link_rewrite: { language: { '@_id': '1', '#text': row.nom.toLowerCase().replace(/[^a-z0-9]+/g, '-') } },
        associations: { categories: { category: { id: categoryId } } }
      }
    }
  };

  const newProductResp = await postXml('/products', productPayload);
  const productId = newProductResp?.prestashop?.product?.id;

  // Mise à jour de la date de disponibilité (PUT)
  if (productId && formattedDate) {
    try {
      const productToUpdate = await getXml(`/products/${productId}`);
      if (productToUpdate?.prestashop?.product) {
        productToUpdate.prestashop.product.available_date = formattedDate;

        // Suppression des champs générés pour éviter l'erreur de PUT
        delete productToUpdate.prestashop.product.manufacturer_name;
        delete productToUpdate.prestashop.product.quantity;
        delete productToUpdate.prestashop.product.id_default_image;
        delete productToUpdate.prestashop.product.id_default_combination;
        delete productToUpdate.prestashop.product.position_in_category;
        delete productToUpdate.prestashop.product.type;

        await putXml(`/products/${productId}`, productToUpdate);
      }
    } catch (dateError) {
      logCallback('error', `Échec mise à jour date : ${dateError.message}`);
    }
  }
};
```
