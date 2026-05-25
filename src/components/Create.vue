<template>
  <!-- Conteneur principal du formulaire d'ajout -->
  <div class="form-container">
    <!-- Titre de la page / section -->
    <h2>Ajouter un nouveau produit</h2>
    
    <!-- Formulaire d'ajout : @submit.prevent empêche le rechargement de la page et appelle handleSubmit -->
    <form @submit.prevent="handleSubmit" class="styled-form">
      
      <!-- Champ pour le nom du produit -->
      <div class="form-group">
        <label>Nom du produit (FR)</label>
        <!-- Champ texte lié à formData.name, obligatoire (required) -->
        <input type="text" v-model="formData.name" placeholder="Ex: T-shirt coton" required>
      </div>

      <!-- Ligne contenant le prix et la catégorie côte à côte -->
      <div class="row">
        <!-- Champ pour le prix HT -->
        <div class="form-group">
          <label>Prix HT (€)</label>
          <!-- Champ numérique permettant les décimales (step="0.01"), lié à formData.price -->
          <input type="number" step="0.01" v-model="formData.price">
        </div>
        
        <!-- Champ pour l'ID de la catégorie parente -->
        <div class="form-group">
          <label>ID Catégorie</label>
          <!-- Champ numérique entier, lié à formData.id_category -->
          <input type="number" v-model="formData.id_category">
        </div>
      </div>

      <!-- Case à cocher pour activer/désactiver le produit immédiatement -->
      <div class="form-group checkbox">
        <!-- Checkbox liée au booléen formData.active -->
        <input type="checkbox" id="active" v-model="formData.active">
        <label for="active">Activer le produit immédiatement</label>
      </div>

      <!-- Bouton de soumission du formulaire -->
      <button type="submit" class="btn-save">🚀 Créer sur PrestaShop</button>
    </form>
  </div>
</template>

<script setup>
// Importation de la fonction reactive de Vue pour créer un objet réactif
import { reactive } from 'vue';

// Initialisation de l'état du formulaire avec des valeurs par défaut
const formData = reactive({
  name: '', // Le nom sera vide par défaut
  price: 0, // Prix initialisé à 0
  id_category: 2, // Par défaut, catégorie 2 (souvent "Accueil" dans PrestaShop)
  active: true // Le produit sera activé par défaut
});

// Fonction déclenchée lors de la soumission du formulaire
const handleSubmit = () => {
  // Affiche les données récoltées dans la console pour vérifier
  console.log("Données prêtes pour conversion XML :", formData);
  // (TODO) Ici sera fait l'appel axios.post vers l'API PrestaShop avec le XML généré
};
</script>

<style scoped>
/* Style de la boîte blanche contenant le formulaire */
.form-container {
  max-width: 600px;
  background: white;
  padding: 30px;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

/* Style du titre */
h2 { margin-bottom: 25px; color: #1e293b; }

/* Espacement entre chaque groupe de champs */
.styled-form .form-group {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
}

/* Style des labels (titres des champs) */
.styled-form label {
  font-weight: 600;
  margin-bottom: 8px;
  color: #475569;
}

/* Style des champs de saisie de texte et de nombre */
.styled-form input[type="text"],
.styled-form input[type="number"] {
  padding: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 1rem;
}

/* Disposition en grille pour mettre deux champs sur la même ligne */
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

/* Alignement horizontal pour la case à cocher et son texte */
.checkbox {
  flex-direction: row !important;
  align-items: center;
  gap: 10px;
}

/* Style du bouton d'enregistrement */
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

/* Changement de couleur au survol du bouton */
.btn-save:hover { background-color: #059669; }
</style>