<script setup>
import { useRoute, RouterView, RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import { ref, onMounted, computed } from 'vue';

const route = useRoute();
const customer = ref(null);

const isBackoffice = computed(() => {
    return route.meta.isBackoffice === true;
});

function loadCustomer() {
    let data = localStorage.getItem('customer');
    if (data) {
        try {
            customer.value = JSON.parse(data);
        } catch (e) {
            customer.value = null;
        }
    } else {
        customer.value = null;
    }
}

function logout() {
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer');
    localStorage.removeItem('token'); // Also remove admin token
    customer.value = null;
    if (isBackoffice.value) {
        window.location.href = '/admin'; // Force redirect to login admin
    }
}

onMounted(() => {
    loadCustomer();
});

// Écouter les changements de localStorage (pour mise à jour après login)
window.addEventListener('storage', loadCustomer);
</script>

<template>
  <div class="app-layout">

    <!-- Navbar horizontale en haut -->
    <header class="navbar" :class="{ 'navbar-admin': isBackoffice }">
      <div class="navbar-logo">
        <Icon :icon="isBackoffice ? 'lucide:settings' : 'lucide:shopping-bag'" class="logo-icon" />
        <span class="logo-text">{{ isBackoffice ? 'AdminShop' : 'MonShop' }}</span>
      </div>

      <nav class="navbar-nav">
        <!-- Menu Backoffice -->
        <template v-if="isBackoffice">
          <RouterLink to="/backofficeDashboard" class="nav-item" active-class="active">
            <Icon icon="lucide:layout-dashboard" />
            Tableau de bord
          </RouterLink>
          <RouterLink to="/listProduct" class="nav-item" active-class="active">
            <Icon icon="lucide:package" />
            Produits
          </RouterLink>
          <RouterLink to="/import" class="nav-item" active-class="active">
            <Icon icon="lucide:import" />
            Import
          </RouterLink>
          <RouterLink to="/reset" class="nav-item" active-class="active">
            <Icon icon="lucide:refresh-ccw" />
            Réinitialisation
          </RouterLink>
        </template>

        <!-- Menu Frontoffice -->
        <template v-else>
          <RouterLink to="/" class="nav-item" active-class="active">
            <Icon icon="lucide:home" />
            Accueil
          </RouterLink>
          <RouterLink to="/panier" class="nav-item" active-class="active">
            <Icon icon="lucide:shopping-cart" />
            Panier
          </RouterLink>
        </template>
      </nav>

      <div class="navbar-end">
        <template v-if="isBackoffice">
           <button class="nav-item logout-link" @click="logout">
            <Icon icon="lucide:log-out" />
            Déconnexion Admin
          </button>
        </template>
        <template v-else-if="customer">
          <span class="user-greeting">
            <Icon icon="lucide:user" />
            {{ customer.firstname || customer.email }}
          </span>
          <button class="nav-item logout-link" @click="logout">
            <Icon icon="lucide:log-out" />
            Déconnexion
          </button>
        </template>
        <RouterLink v-else-if="!isBackoffice" to="/connexion" class="nav-item login-link" active-class="active">
          <Icon icon="lucide:log-in" />
          Connexion
        </RouterLink>
      </div>
    </header>

    <!-- Contenu principal -->
    <main class="main-content">
      <RouterView @login-success="loadCustomer" />
    </main>

  </div>
</template>

<style scoped>
/* === LAYOUT === */
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background-color: #f8f9fa;
}

/* === NAVBAR === */
.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 36px;
  height: 64px;
  background: linear-gradient(110deg, #2f3542 0%, #3d4a5c 55%, #4a5568 100%);
  box-shadow: 0 4px 20px rgba(47, 53, 66, 0.2);
}

.navbar-admin {
  background: linear-gradient(110deg, #0f172a 0%, #1e293b 55%, #334155 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.navbar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.logo-icon {
  font-size: 1.5rem;
  color: #ffffff;
}

.logo-text {
  font-size: 1.2rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.5px;
}

.navbar-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 500;
  transition: all 0.2s ease;
  background: transparent;
  border: none;
  cursor: pointer;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.nav-item.active {
  background: linear-gradient(135deg, rgba(46, 213, 115, 0.18), rgba(46, 213, 115, 0.08));
  color: #2ed573;
  font-weight: 600;
}

.navbar-end {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-greeting {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #2ed573;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0 10px;
}

.logout-link:hover {
  background-color: rgba(255, 71, 87, 0.15);
  color: #ff4757;
}

.login-link {
  color: rgba(255, 255, 255, 0.65);
}

.main-content {
  flex: 1;
  overflow-y: auto;
  background-color: #f8f9fa;
}
</style>