# Importation : Déclinaisons (`variantImport.js`)

Ce module permet de générer les déclinaisons (variantes) des produits de la boutique et d'initialiser les stocks physiques.

---

## ⚙️ Fonctionnement et Règles Métier

1.  **Distinction Produit Simple / Produit Décliné** :
    *   Si les champs `specificité` (ex: Taille) et `karazany` (valeur de la déclinaison, ex: XL) sont vides ou absents, le script considère le produit comme **simple**.
    *   Il met à jour directement sa quantité en stock (`stock_available` avec `id_product_attribute = 0`) et écrit le mouvement de stock historique correspondant.
2.  **Création à la volée des Attributs & Valeurs** :
    *   Recherche si le groupe d'attributs existe (ex: "Taille"), sinon le crée.
    *   Recherche si la valeur associée (ex: "M", "L") existe, sinon la crée.
3.  **Calcul de l'Impact de Prix** :
    *   L'API de PrestaShop requiert de spécifier l'impact de prix HT relatif de la déclinaison par rapport au produit parent.
    *   Le service convertit le prix de vente TTC saisi en HT (en utilisant le taux de taxe du produit parent), puis soustrait le prix HT du produit de base pour calculer cet impact.
4.  **Synchronisation de Stock & Traçabilité** :
    *   Une fois la déclinaison créée, le service modifie l'enregistrement de son stock disponible dans `stock_availables` et écrit l'historique dans `stock_movements`.

---

## 🛠️ Code Principal

Voici le code illustrant la création d'une déclinaison et le calcul d'impact de prix dans `src/service/variantImport.js` :

```javascript
import { getXml, postXml, putXml } from '@/service/api';
import { getProductTaxRate } from '@/service/price';

export const processVariantImport = async (data, logCallback) => {
  // ... Résolution du produit parent et des attributs ...

  // Calcul du prix HT de la variante et de l'impact relatif
  let priceImpact = 0;
  if (prixVenteTTC > 0) {
    try {
      const parentTaxRate = await getProductTaxRate(parentProductId);
      // Convertir le TTC en HT : HT = TTC / (1 + taxRate / 100)
      const prixVenteHT = prixVenteTTC / (1 + (parentTaxRate / 100));
      const parentPriceHT = parseFloat(parentProduct.price) || 0;
      priceImpact = prixVenteHT - parentPriceHT;
    } catch (e) {
      logCallback('warn', `Impossible de récupérer le taux de taxe, impact = 0`);
      priceImpact = 0;
    }
  }

  // Création de la déclinaison dans PrestaShop
  const newCombResp = await postXml('/combinations', {
    prestashop: {
      combination: {
        id_product: parentProductId,
        reference: `${reference}_${karazany}`,
        price: priceImpact.toFixed(6),
        minimal_quantity: 1,
        associations: {
          product_option_values: {
            product_option_value: [{ id: optionValueId }]
          }
        }
      }
    }
  });
  
  const combinationId = extractId(newCombResp?.prestashop?.combination?.id);
  // ... Mise à jour du stock et mouvement de stock ...
};
```
