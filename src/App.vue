<script setup>
import { useRoute, RouterView, RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';

// Récupère l'objet route actuel pour savoir sur quelle page on se trouve
const route = useRoute();
// État réactif contenant les informations du client connecté (ou anonyme)
const customer = ref(null);

// ============================================================================
// CALCULS RÉACTIFS (COMPUTED)
// ============================================================================
/**
 * Détermine si nous sommes dans l'administration (Backoffice) ou sur la boutique (Frontoffice).
 * Cette information est définie dans le fichier de routing (router/index.js) via `meta.isBackoffice`.
 */
const isBackoffice = computed(() => {
    return route.meta.isBackoffice === true;
});

// ============================================================================
// GESTION DE L'UTILISATEUR ET DE LA SESSION
// ============================================================================
/**
 * Définit un utilisateur "Anonyme" par défaut.
 * Utilisé lorsque le client n'est pas connecté pour lui permettre de naviguer tout de même.
 */
function setAnonymous() {
    let customerData = {
      id: 1, // L'ID 1 est généralement réservé au compte Invité/Anonyme
      firstname: 'Anonymous',
      lastname: 'Anonymous',
      email: 'anonymous@psgdpr.com'
    };
    let token = "dev_token_1";
    // Sauvegarde dans le cache du navigateur (localStorage)
    localStorage.setItem('customer', JSON.stringify(customerData));
    localStorage.setItem('customer_token', JSON.stringify(token));
    customer.value = customerData;
}

/**
 * Tente de charger le client depuis le localStorage.
 * Si le client n'existe pas ou s'il y a une erreur de format, force la session en mode Anonyme.
 */
function loadCustomer() {
    let data = localStorage.getItem('customer');
    if (data) {
        try {
            customer.value = JSON.parse(data);
            if (!customer.value || !customer.value.id) {
                setAnonymous();
            }
        } catch (e) {
            setAnonymous();
        }
    } else {
        setAnonymous();
    }
}

/**
 * Déconnecte l'utilisateur (Client ou Admin).
 * Nettoie le localStorage, repasse en anonyme et force la redirection.
 */
function logout() {
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer');
    localStorage.removeItem('token'); // Supprime également le token Admin
    setAnonymous();
    
    // Prévient toute l'application que le client a changé
    window.dispatchEvent(new Event('customer-updated'));
    
    // Si on était dans le backoffice, on éjecte l'admin vers la page de login admin
    if (isBackoffice.value) {
        window.location.href = '/admin'; // Force redirect to login admin
    }
}

// ============================================================================
// ÉVÉNEMENTS GLOBAUX
// ============================================================================
/**
 * Fonction appelée quand l'événement custom 'customer-updated' est déclenché.
 * Permet de recharger le client si un autre composant a modifié la session.
 */
function handleCustomerUpdate() {
  loadCustomer();
}

// Lors du montage du composant (Quand l'app s'ouvre)
onMounted(() => {
    loadCustomer();
  // Écoute les changements du localStorage (utile si l'utilisateur ouvre plusieurs onglets)
  window.addEventListener('storage', loadCustomer);
  // Écoute les connexions/déconnexions déclenchées par d'autres composants
  window.addEventListener('customer-updated', handleCustomerUpdate);
});

// Avant la destruction du composant (Nettoyage)
onBeforeUnmount(() => {
  window.removeEventListener('storage', loadCustomer);
  window.removeEventListener('customer-updated', handleCustomerUpdate);
});
</script>

<template>
  <div class="app-layout">

    <!-- 
      Navbar horizontale en haut 
      La classe 'navbar-admin' est ajoutée dynamiquement si on est dans le backoffice (Change la couleur)
    -->
    <header class="navbar" :class="{ 'navbar-admin': isBackoffice }">
      
      <!-- LOGO -->
      <div class="navbar-logo">
        <Icon :icon="isBackoffice ? 'lucide:settings' : 'lucide:shopping-bag'" class="logo-icon" />
        <span class="logo-text">{{ isBackoffice ? 'AdminShop' : 'MonShop' }}</span>
      </div>

      <!-- NAVIGATION CENTRALE -->
      <nav class="navbar-nav">
        <!-- Menu spécifique au Backoffice (Admin) -->
        <template v-if="isBackoffice">
          <!-- RouterLink permet de naviguer sans recharger la page (SPA - Single Page Application) -->
          <RouterLink to="/admin/backofficeDashboard" class="nav-item" active-class="active">
            <Icon icon="lucide:layout-dashboard" />
            Tableau de bord
          </RouterLink>
          <RouterLink to="/admin/orders" class="nav-item" active-class="active">
            <Icon icon="lucide:shopping-cart" />
            Commandes
          </RouterLink>
          <RouterLink to="/admin/stocks" class="nav-item" active-class="active">
            <Icon icon="lucide:package" />
            Stocks
          </RouterLink>
          <RouterLink to="/admin/stock-evolution" class="nav-item" active-class="active">
            <Icon icon="lucide:history" />
            Évolution Stocks
          </RouterLink>
          <RouterLink to="/admin/import" class="nav-item" active-class="active">
            <Icon icon="lucide:import" />
            Import
          </RouterLink>
          <RouterLink to="/admin/reset" class="nav-item" active-class="active">
            <Icon icon="lucide:refresh-ccw" />
            Réinitialisation
          </RouterLink>
        </template>

        <!-- Menu spécifique au Frontoffice (Client) -->
        <template v-else>
          <RouterLink to="/" class="nav-item" active-class="active">
            <Icon icon="lucide:home" />
            Accueil
          </RouterLink>
          <!-- N'affiche "Mes commandes" que si le client n'est PAS anonyme (ID != 1) -->
          <RouterLink v-if="customer && Number(customer.id) !== 1" to="/mes-commandes" class="nav-item" active-class="active">
            <Icon icon="lucide:receipt-text" />
            Mes commandes
          </RouterLink>
          <RouterLink to="/panier" class="nav-item" active-class="active">
            <Icon icon="lucide:shopping-cart" />
            Panier
          </RouterLink>
        </template>
      </nav>

      <!-- MENU DE DROITE (UTILISATEUR / CONNEXION) -->
      <div class="navbar-end">
        
        <!-- Cas 1 : On est dans l'admin -->
        <template v-if="isBackoffice">
           <button class="nav-item logout-link" @click="logout">
            <Icon icon="lucide:log-out" />
            Déconnexion Admin
          </button>
        </template>
        
        <!-- Cas 2 : On est client connecté (Pas admin, pas anonyme) -->
        <template v-else-if="customer && Number(customer.id) !== 1">
          <span class="user-greeting">
            <Icon icon="lucide:user" />
            <!-- Affiche le prénom ou l'email à défaut -->
            {{ customer.firstname || customer.email }}
          </span>
          <RouterLink to="/selection-profil" class="nav-item">
            <Icon icon="lucide:users" />
            Changer d'utilisateur
          </RouterLink>
          <button class="nav-item logout-link" @click="logout">
            <Icon icon="lucide:log-out" />
            Déconnexion
          </button>
        </template>

        <!-- Cas 3 : On est client Anonyme -->
        <RouterLink v-else-if="!isBackoffice" to="/selection-profil" class="nav-item login-link" active-class="active">
          <Icon icon="lucide:log-in" />
          Connexion
        </RouterLink>
      </div>
    </header>

    <!-- Contenu principal (C'est ici que les autres vues vont s'injecter selon l'URL) -->
    <main class="main-content">
      <RouterView />
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
  /* Rend la navbar collante au scroll */
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 36px;
  height: 64px;
  /* Thème Frontoffice : Dégradé Gris-Bleuté */
  background: linear-gradient(110deg, #2f3542 0%, #3d4a5c 55%, #4a5568 100%);
  box-shadow: 0 4px 20px rgba(47, 53, 66, 0.2);
}

/* Thème Backoffice : Dégradé Sombre / Noir */
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

/* Style appliqué automatiquement par VueRouter quand on est sur la page de ce lien */
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