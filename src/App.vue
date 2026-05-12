<script setup>
import { RouterView } from 'vue-router';
</script>

<template>
  <div class="app-layout">

    <!-- Navbar horizontale en haut -->
    <header class="navbar">
      <div class="navbar-logo">
        <span class="logo-icon">🛍️</span>
        <span class="logo-text">MonShop</span>
      </div>

      <nav class="navbar-nav">
        <a href="#" class="nav-item active">🏠 Accueil</a>
        <!-- Les liens seront ajoutés ici -->
      </nav>

      <div class="navbar-end">
        <!-- Espace réservé (profil, login, etc.) -->
      </div>
    </header>

    <!-- Contenu principal -->
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
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 36px;
  height: 64px;

  /* Dégradé doux, en harmonie avec les couleurs de HomeView */
  background: linear-gradient(110deg, #2f3542 0%, #3d4a5c 55%, #4a5568 100%);

  box-shadow: 0 4px 20px rgba(47, 53, 66, 0.2);
}

/* Logo */
.navbar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.logo-icon {
  font-size: 1.5rem;
}

.logo-text {
  font-size: 1.2rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.5px;
}

/* Navigation */
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
  transition: background 0.2s ease, color 0.2s ease;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.nav-item.active {
  /* Accent vert doux — même couleur que les prix dans ProductBloc */
  background: linear-gradient(135deg, rgba(46, 213, 115, 0.18), rgba(46, 213, 115, 0.08));
  color: #2ed573;
  font-weight: 600;
}

/* Fin de la navbar (profil, etc.) */
.navbar-end {
  min-width: 80px;
  display: flex;
  justify-content: flex-end;
}

/* === MAIN CONTENT === */
.main-content {
  flex: 1;
  overflow-y: auto;
  background-color: #f8f9fa;
}
</style>