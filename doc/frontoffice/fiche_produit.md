# Vue Front-office : Fiche Produit (`FicheProduitView.vue`)

Cette vue affiche le détail complet d'un produit (prix HT/TTC, description, image) et gère la sélection dynamique de ses déclinaisons.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Génération Dynamique des Déclinaisons** :
    *   Le script interroge `/combinations`, `/product_option_values` et `/product_options` pour structurer les groupes d'attributs (ex: Taille, Couleur) associés au produit.
2.  **Résolution Strict de la Compatibilité d'Options** :
    *   Toutes les combinaisons d'options ne sont pas forcément en stock ou existantes. La méthode `isOptionValueAvailable` vérifie en temps réel quelles valeurs sont compatibles avec les choix déjà faits, grisant ou masquant les options incompatibles.
3.  **Gestion de l'image de Déclinaison** :
    *   Si la déclinaison sélectionnée possède une image spécifique en base, elle remplace dynamiquement l'image par défaut du produit sur la galerie.
4.  **Ajustement de Quantité face au Stock Réel** :
    *   La quantité maximale que l'utilisateur peut ajouter au panier est limitée par : `Quantité en Stock Physique - Quantité déjà présente dans le panier local`.

---

## 🛠️ Extraits de Code Clés

Voici le mécanisme de vérification de compatibilité des options d'attributs implémenté dans `src/view/frontoffice/FicheProduitView.vue` :

```javascript
function isOptionValueAvailable(groupName, valueId) {
    if (productCombinations.value.length === 0) return true;

    return productCombinations.value.some(comb => {
        const combValues = comb.associations?.product_option_values?.product_option_value;
        if (!combValues) return false;
        
        const combValueIds = Array.isArray(combValues)
            ? combValues.map(v => safeId(v.id))
            : [safeId(combValues.id)];

        // La valeur d'option recherchée doit appartenir à cette combinaison
        if (!combValueIds.includes(String(valueId))) return false;

        // Toutes les autres sélections déjà faites sur d'autres groupes doivent être compatibles
        for (const variant of variants.value) {
            if (variant.name === groupName) continue;

            const isGroupUsed = variant.values.some(val => combValueIds.includes(String(val.id)));
            if (!isGroupUsed) continue;

            const selectedValId = selectedOptions.value[variant.name];
            if (selectedValId && !combValueIds.includes(String(selectedValId))) {
                return false;
            }
        }

        return true;
    });
}
```
