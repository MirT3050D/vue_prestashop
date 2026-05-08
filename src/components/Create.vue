<template>
  <div class="form-container">
    <h2>Ajouter un nouveau produit</h2>
    <form @submit.prevent="handleSubmit" class="styled-form">
      <div class="form-group">
        <label>Nom du produit (FR)</label>
        <input type="text" v-model="formData.name" placeholder="Ex: T-shirt coton" required>
      </div>

      <div class="row">
        <div class="form-group">
          <label>Prix HT (€)</label>
          <input type="number" step="0.01" v-model="formData.price">
        </div>
        <div class="form-group">
          <label>ID Catégorie</label>
          <input type="number" v-model="formData.id_category">
        </div>
      </div>

      <div class="form-group checkbox">
        <input type="checkbox" id="active" v-model="formData.active">
        <label for="active">Activer le produit immédiatement</label>
      </div>

      <button type="submit" class="btn-save">🚀 Créer sur PrestaShop</button>
    </form>
  </div>
</template>

<script setup>
import { reactive } from 'vue';

const formData = reactive({
  name: '',
  price: 0,
  id_category: 2,
  active: true
});

const handleSubmit = () => {
  console.log("Données prêtes pour conversion XML :", formData);
  // Ici ton appel axios.post avec le body XML
};
</script>

<style scoped>
.form-container {
  max-width: 600px;
  background: white;
  padding: 30px;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

h2 { margin-bottom: 25px; color: #1e293b; }

.styled-form .form-group {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
}

.styled-form label {
  font-weight: 600;
  margin-bottom: 8px;
  color: #475569;
}

.styled-form input[type="text"],
.styled-form input[type="number"] {
  padding: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 1rem;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.checkbox {
  flex-direction: row !important;
  align-items: center;
  gap: 10px;
}

.btn-save {
  width: 100%;
  padding: 14px;
  background-color: #10b981;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.3s;
}

.btn-save:hover { background-color: #059669; }
</style>