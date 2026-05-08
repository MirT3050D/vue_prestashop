<template>
  <div class="table-container">
    <table class="styled-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Produit</th>
          <th>Prix HT</th>
          <th>État</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>#{{ item.id }}</td>
          <td class="product-name">{{ item.name }}</td>
          <td>{{ item.price }} €</td>
          <td>
            <span :class="['badge', item.active === '1' ? 'active' : 'inactive']">
              {{ item.active === '1' ? 'En ligne' : 'Hors ligne' }}
            </span>
          </td>
          <td class="actions">
            <button @click="editItem(item)" class="btn-edit">✏️</button>
            <button @click="deleteItem(item.id)" class="btn-delete">🗑️</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
const props = defineProps(['items']);
const emit = defineEmits(['edit', 'delete']);

const editItem = (item) => emit('edit', item);
const deleteItem = (id) => emit('delete', id);
</script>

<style scoped>
.table-container {
  background: white;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
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

.product-name { font-weight: 600; color: #1e293b; }

.badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
}

.badge.active { background: #dcfce7; color: #166534; }
.badge.inactive { background: #fee2e2; color: #991b1b; }

.actions { display: flex; gap: 10px; }

.actions button {
  border: none;
  background: #f1f5f9;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: 0.2s;
}

.btn-edit:hover { background: #dbeafe; }
.btn-delete:hover { background: #fee2e2; }
</style>