<script setup>
import Dropdown from "./components/Dropdown.vue";
import { ref, onMounted } from "vue";

const module = [];
module[0] = {
  icon: "gridicons:product",
  label: "produits"
};

const elements = [];
elements[0] = {
  label: "Create",
  url: "url"
};
elements[1] = {
  label: "Liste",
  url: "/listProduct"
};
elements[2] = {
  label: "Import CSV",
  url: "/import"
};
const token = ref("");
onMounted(() => {
	token.value = JSON.parse(localStorage.getItem("token"));
})
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-logo">ADMIN SHOP</div>
      <nav class="sidebar-nav">
        <Dropdown :dropdown_title="module[0]" :contents="elements"></Dropdown>
        <RouterLink to="" class="link">
        </RouterLink>
        <RouterLink to="/reset">
            Reset
        </RouterLink>
        <RouterLink to=""></RouterLink>
        <RouterLink to=""></RouterLink>
      </nav>
    </aside>

    <div class="main-wrapper">
      <header class="navbar">
        <div class="navbar-title">Tableau de bord</div>
        <div class="navbar-profile" v-if="token == null">
            <RouterLink to="/login">
              <button class="login-button" type="button">Login</button>
            </RouterLink>
          </div>
          <div v-else>
          <span>Admin</span>
        <div class="avatar"></div>
      </div>
      </header>

      <main class="content">
        <RouterView></RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100-screen;
  background-color: #f4f7f6;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.sidebar {
  width: 250px;
  background-color: #1e293b;
  color: white;
  display: flex;
  flex-direction: column;
}

.sidebar-logo {
  padding: 20px;
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
  background-color: #0f172a;
}

.sidebar-nav {
  margin-top: 20px;
}

.nav-item {
  display: block;
  padding: 15px 25px;
  color: #cbd5e1;
  text-decoration: none;
  transition: 0.3s;
}

.nav-item:hover,
.nav-item.active {
  background-color: #334155;
  color: white;
  border-left: 4px solid #3b82f6;
}

.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.navbar {
  height: 60px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.navbar-profile {
  display: flex;
  align-items: center;
  gap: 10px;
}

.login-button {
  border: none;
  border-radius: 12px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #0f172a, #2563eb);
  color: #f8fafc;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.2);
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.login-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.28);
}

.login-button:active {
  transform: translateY(0);
  opacity: 0.92;
}

.avatar {
  width: 35px;
  height: 35px;
  background-color: #cbd5e1;
  border-radius: 50%;
}

.content {
  padding: 30px;
}
.link
{
  color: #f4f7f6;
  text-decoration: none;
}
/* Styles for RouterLink elements inside the sidebar and active state */
.sidebar-nav a {
  display: block;
  padding: 15px 25px;
  color: #cbd5e1;
  text-decoration: none;
  transition: 0.3s;
}
.sidebar-nav a:hover {
  background-color: #334155;
  color: #fff;
}
.sidebar-nav a.router-link-active {
  background-color: #334155;
  color: #fff;
  border-left: 4px solid #3b82f6;
}
</style>