<template>
  <div class="table-container">
    <h1>
      Liste de tous les {{ props.module }}
    </h1>
    <table class="styled-table">
      <thead>
        <tr>
          <th v-for="column in props.columns" :key="column">
            {{ column }}
          </th>
          <th>actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(object, rowIndex) in props.data" :key="resolveRowKey(object, rowIndex)">
          <td v-for="column in props.columns" :key="`${rowIndex}-${column}`">
            {{ object[column] }}
          </td>
          <td v-if="props.showActions" class="actions">
            <button @click="editItem(object)" class="btn-edit">✏️</button>
            <button @click="deleteItem(object)" class="btn-delete">🗑️</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
const props = defineProps({
  module: {
    type: String,
    required: true
  },
  data: {
    type: Array,
    default: () => []
  },
  columns: {
    type: Array,
    default: () => []
  },
  rowKey: {
    type: String,
    default: ''
  },
  showActions: {
    type: Boolean,
    default: true
  }
});
const emit = defineEmits(['edit', 'delete']);

const editItem = (item) => emit('edit', item);
const deleteItem = (item) => emit('delete', item);

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

.styled-table th {
  background-color: #f8fafc;
  padding: 15px;
  text-align: left;
  color: #64748b;
  border-bottom: 2px solid #e2e8f0;
}

.styled-table td {
  padding: 15px;
  border-bottom: 1px solid #f1f5f9;
}

.product-name {
  font-weight: 600;
  color: #1e293b;
}

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
}

.btn-edit:hover {
  background: #dbeafe;
}

.btn-delete:hover {
  background: #fee2e2;
}
</style>