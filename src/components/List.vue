<template>
  <div class="table-container">
    <h1>
      Liste de tous les {{ props.module }}
    </h1>
    <table class="styled-table">
      <thead>
        <tr>
          <!-- Génération dynamique des en-têtes de colonnes (Nom, Prix, Quantité, etc.) -->
          <th v-for="column in props.columns" :key="column">
            {{ column }}
          </th>
          <!-- Colonne fixe pour les boutons d'action (Modifier/Supprimer) -->
          <th>actions</th>
        </tr>
      </thead>
      <tbody>
        <!-- Boucle sur chaque ligne de données (chaque produit, chaque commande, etc.) -->
        <tr v-for="(object, rowIndex) in props.data" :key="resolveRowKey(object, rowIndex)">
          <!-- Boucle pour afficher la valeur de chaque colonne pour cet objet -->
          <td v-for="column in props.columns" :key="`${rowIndex}-${column}`">
            {{ object[column] }}
          </td>
          <!-- Boutons d'action (conditionnés par la prop showActions) -->
          <td v-if="props.showActions" class="actions">
            <!-- Émet l'événement 'edit' vers le composant parent en passant l'objet cliqué -->
            <button @click="editItem(object)" class="btn-edit" title="Modifier">
              <Icon icon="lucide:edit-2" />
            </button>
            <!-- Émet l'événement 'delete' vers le composant parent -->
            <button @click="deleteItem(object)" class="btn-delete" title="Supprimer">
              <Icon icon="lucide:trash-2" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { Icon } from '@iconify/vue';

// ============================================================================
// DÉFINITION DES PROPRIÉTÉS (PROPS)
// ============================================================================
const props = defineProps({
  // Nom du module pour l'affichage (ex: "Produits", "Commandes")
  module: {
    type: String,
    required: true
  },
  // Tableau contenant les données brutes à afficher (Objets JSON)
  data: {
    type: Array,
    default: () => []
  },
  // Liste des clés de colonnes à afficher (ex: ['id', 'name', 'price'])
  columns: {
    type: Array,
    default: () => []
  },
  // Nom optionnel du champ qui sert de clé primaire (ex: 'id_product')
  rowKey: {
    type: String,
    default: ''
  },
  // Permet de masquer la colonne des actions si nécessaire (Mode lecture seule)
  showActions: {
    type: Boolean,
    default: true
  }
});

// ============================================================================
// GESTION DES ÉVÉNEMENTS (EMITS)
// ============================================================================
const emit = defineEmits(['edit', 'delete']);

const editItem = (item) => emit('edit', item);
const deleteItem = (item) => emit('delete', item);

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================
/**
 * Tente de trouver un identifiant unique pour chaque ligne (V-FOR key).
 * C'est crucial pour les performances de rendu de Vue.js.
 * Il cherche dans l'ordre : la prop rowKey, puis 'id', puis 'id_product', etc.
 * En dernier recours, il utilise l'index de la boucle.
 */
const resolveRowKey = (item, rowIndex) => {
  const candidates = [
    props.rowKey,
    'id',
    'id_product',
    `id_${props.module}`.toLowerCase(),
    `id_${props.module}`
  ].filter(Boolean);

  for (const key of candidates) {
    if (item?.[key] != null) {
      return item[key];
    }
  }

  return rowIndex;
};
</script>

<style scoped>
/* Conteneur principal avec effet carte (ombre, coins arrondis) */
.table-container {
  background: white;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.styled-table {
  width: 100%;
  border-collapse: collapse;
}

/* Style des en-têtes de colonnes (Thème clair, texte gris bleuté) */
.styled-table th {
  background-color: #f8fafc;
  padding: 15px;
  text-align: left;
  color: #64748b;
  border-bottom: 2px solid #e2e8f0;
}

/* Style des cellules de données */
.styled-table td {
  padding: 15px;
  border-bottom: 1px solid #f1f5f9;
}

.product-name {
  font-weight: 600;
  color: #1e293b;
}

/* Style des pastilles de statut (ex: Actif / Inactif) */
.badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
}

.badge.active {
  background: #dcfce7;
  color: #166534;
}

.badge.inactive {
  background: #fee2e2;
  color: #991b1b;
}

/* Style de la colonne Actions contenant les boutons */
.actions {
  display: flex;
  gap: 10px;
}

.actions button {
  border: none;
  background: #f1f5f9;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Effets de survol pour les boutons (Feedback visuel) */
.btn-edit:hover {
  background: #dbeafe;
}

.btn-delete:hover {
  background: #fee2e2;
}
</style>