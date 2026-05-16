<script setup>

import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getCustomers } from '@/service/customerService';

const router = useRouter();
const customers = ref([]);
const isLoading = ref(true);
const error = ref('');

async function fetchCustomers() {
  try {
    const data = await getCustomers({
      display: '[id,firstname,lastname,email]',
      limit: '12',
      sort: '[id_DESC]'
    });
    
    // On garde seulement les clients qui ont un nom et un prénom
    let finalSelection = [];
    for (let i = 0; i < data.length; i++) {
        let c = data[i];
        if (c.firstname && c.lastname) {
            finalSelection.push(c);
        }
    }
    customers.value = finalSelection;

  } catch (err) {
    error.value = "Impossible de charger les utilisateurs.";
    console.error(err);
  } finally {
    isLoading.value = false;
  }
}

function selectUser(user) {
  if (user != null) {
    let customerData = {
      id: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email
    };
    let token = "dev_token_" + user.id;
    
    localStorage.setItem('customer', JSON.stringify(customerData));
    localStorage.setItem('customer_token', JSON.stringify(token));
  } else {
    localStorage.removeItem('customer');
    localStorage.removeItem('customer_token');
  }
  
  window.dispatchEvent(new Event('customer-updated'));
  router.push({ name: 'homeFrontoffice' });
}

onMounted(fetchCustomers);
</script>

<template>
  <div class="user-selection-page">
    <div class="selection-container">
      <header class="selection-header">
        <h1>Bienvenue sur AdminShop</h1>
        <p>Veuillez choisir un profil pour accéder à la boutique</p>
      </header>

      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>Chargement des profils...</p>
      </div>

      <div v-else-if="error" class="error-state">
        {{ error }}
      </div>

      <div v-else class="user-grid">
        <!-- Option Anonyme -->
        <article class="user-card anonymous" @click="selectUser(null)">
          <div class="avatar">👤</div>
          <div class="user-info">
            <h3>Utilisateur Anonyme</h3>
            <p>Accès invité (Guest)</p>
          </div>
          <div class="action-hint">Continuer →</div>
        </article>

        <!-- Liste des clients PrestaShop -->
        <article 
          v-for="user in customers" 
          :key="user.id" 
          class="user-card" 
          @click="selectUser(user)"
        >
          <div class="avatar">{{ user.firstname[0] }}{{ user.lastname[0] }}</div>
          <div class="user-info">
            <h3>{{ user.firstname }} {{ user.lastname }}</h3>
            <p>{{ user.email }}</p>
          </div>
          <div class="id-badge">ID: {{ user.id }}</div>
        </article>
      </div>

      <footer class="selection-footer">
        <router-link to="/admin" class="admin-link">Accès Back-office →</router-link>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.user-selection-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  font-family: 'Inter', sans-serif;
}

.selection-container {
  max-width: 1000px;
  width: 100%;
}

.selection-header {
  text-align: center;
  margin-bottom: 50px;
}

.selection-header h1 {
  font-size: 2.5rem;
  color: #1e293b;
  font-weight: 800;
  margin-bottom: 10px;
  letter-spacing: -1px;
}

.selection-header p {
  color: #64748b;
  font-size: 1.1rem;
}

.user-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.user-card {
  background: white;
  border-radius: 20px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;
  position: relative;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.user-card:hover {
  transform: translateY(-5px);
  border-color: #3b82f6;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.user-card.anonymous {
  background: #1e293b;
  color: white;
}

.user-card.anonymous .user-info p {
  color: #94a3b8;
}

.avatar {
  width: 56px;
  height: 56px;
  background: #3b82f6;
  color: white;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.2rem;
  flex-shrink: 0;
}

.anonymous .avatar {
  background: rgba(255, 255, 255, 0.1);
}

.user-info h3 {
  font-size: 1rem;
  margin: 0;
  color: inherit;
  font-weight: 700;
}

.user-info p {
  font-size: 0.85rem;
  color: #64748b;
  margin: 4px 0 0 0;
}

.id-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 0.65rem;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 99px;
  color: #64748b;
  font-weight: 600;
}

.action-hint {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 600;
  opacity: 0;
  transition: opacity 0.2s;
}

.user-card:hover .action-hint {
  opacity: 1;
}

.selection-footer {
  margin-top: 40px;
  text-align: center;
}

.admin-link {
  color: #64748b;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
}

.admin-link:hover {
  color: #3b82f6;
}

.loading-state {
  text-align: center;
  padding: 60px;
  color: #64748b;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
