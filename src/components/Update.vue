<!-- 
  Composant Update.vue
  Ce fichier est actuellement un brouillon (entièrement commenté).
  Il devait probablement servir de fenêtre modale (Overlay) pour éditer rapidement un élément (Produit, Commande, etc.) 
  sans quitter la page principale.
-->

<!-- <template>
  <div class="edit-overlay">
    <div class="form-container edit-mode">
      <header class="form-header">
        <h2>Modifier le produit #{{ formData.id }}</h2>
        <button class="close-btn" @click="$emit('cancel')">✕</button>
      </header>

      <form @submit.prevent="updateProduct">
        <div class="form-actions">
          <button type="submit" class="btn-update">💾 Enregistrer les changements</button>
          <button type="button" @click="$emit('cancel')" class="btn-cancel">Annuler</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* On peut mettre cet overlay si c'est une modale */
.edit-overlay {
  background: rgba(0,0,0,0.5);
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-mode {
  border-top: 5px solid #3b82f6; /* Couleur différente du Create */
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; }

.btn-update {
  background-color: #3b82f6;
  color: white;
  padding: 12px 25px;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
}

.form-actions {
  display: flex;
  gap: 15px;
  margin-top: 25px;
}

.btn-cancel {
  background: #e2e8f0;
  color: #475569;
  padding: 12px 25px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style> -->