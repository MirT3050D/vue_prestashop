# List.vue générique

`src/components/List.vue` est un tableau réutilisable pour plusieurs entités.

## Contrat

- `module` : libellé affiché dans le titre.
- `data` : tableau d'objets déjà formatés pour l'affichage.
- `columns` : liste des clés à afficher dans les colonnes.
- `rowKey` : clé primaire à utiliser pour identifier une ligne si elle ne peut pas être déduite automatiquement.
- `showActions` : active ou désactive la colonne d'actions.

## Comportement

- Le composant essaie d'identifier chaque ligne avec `rowKey`, puis `id`, puis `id_product`, puis un fallback basé sur le nom du module.
- Les événements `edit` et `delete` renvoient maintenant l'objet complet de la ligne.
- Si aucune action n'est voulue, `showActions` peut être passé à `false`.

## Exemple

```vue
<List
  module="Produit"
  :data="products"
  :columns="['name', 'reference', 'price']"
  row-key="id_product"
  @edit="openEditModal"
  @delete="confirmDelete"
/>
```