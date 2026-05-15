import OrderListView from '@/view/backoffice/OrderListView.vue';import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../view/frontoffice/HomeView.vue'
import TestApiGet from '@/components/TestApiGet.vue'
import ListProduitsView from '@/view/ListProduitsView.vue'
import ResetView from '@/view/backoffice/ResetView.vue'
import LoginBackView from '@/view/backoffice/LoginBackView.vue'
import ImportView from '@/view/backoffice/ImportView.vue'
import FicheProduitView from '@/view/frontoffice/FicheProduitView.vue'
import PanierView from '@/view/frontoffice/PanierView.vue'
import LoginFrontView from '@/view/frontoffice/LoginFrontView.vue'
import CheckoutView from '@/view/frontoffice/CheckoutView.vue'
import OrdersView from '@/view/frontoffice/OrdersView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{
    path: '/backofficeDashboard',
    name: 'home',
    component: HomeView,
    meta: { requiresAuth: true, isBackoffice: true }
  },
  {
    path: '/test',
    name: 'test',
    component: TestApiGet
  },

  {
    path: '/import',
    name: 'import',
    meta: { requiresAuth: true, isBackoffice: true },
    component: ImportView
  },
  {
    path: '/reset',
    name: 'reset',
    meta: { requiresAuth: true, isBackoffice: true },
    component: ResetView
  },
  {
    path: '/orders',
    name: 'order_list',
    meta: { requiresAuth: true, isBackoffice: true },
    component: OrderListView
  },
  {
    path: '/admin',
    name: 'login',
    component: LoginBackView,
    meta: { isBackoffice: true }
  },
  {
    path: '/',
    name: 'homeFrontoffice',
    component: HomeView
  },
  {
    path: '/produit/:id',
    name: 'ficheProduit',
    component: FicheProduitView
  },
  {
    path: '/panier',
    name: 'panier',
    component: PanierView
  },
  {
    path: '/connexion',
    name: 'connexion',
    component: LoginFrontView
  },
  {
    path: '/checkout',
    name: 'checkout',
    component: CheckoutView
  },
  {
    path: '/mes-commandes',
    name: 'mes_commandes',
    component: OrdersView
  }
  ]
})


router.beforeEach((to, from, next) => {
  const isAuthenticated = !!localStorage.getItem('token');

  // Si la route est pour le back-office et nécessite une authentification
  if (to.meta.isBackoffice && to.meta.requiresAuth && !isAuthenticated) {
    // Redirige vers la page de login du back-office
    next({ name: 'login' });
  } 
  // Si l'utilisateur est authentifié et essaie d'aller sur la page de login
  else if (isAuthenticated && to.name === 'login') {
    // Redirige vers la première page utile du back-office (ex: import)
    next({ name: 'import' });
  } 
  // Pour toutes les autres situations, laisser passer
  else {
    next();
  }
});

export default router