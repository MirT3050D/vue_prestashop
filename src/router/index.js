import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../view/frontoffice/HomeView.vue'
import TestApiGet from '@/components/TestApiGet.vue'
import ListProduitsView from '@/view/ListProduitsView.vue'
import ResetView from '@/view/ResetView.vue'
import LoginView from '@/view/LoginView.vue'
import ImportView from '@/view/ImportView.vue'
import FicheProduitView from '@/view/frontoffice/FicheProduitView.vue'
import PanierView from '@/view/frontoffice/PanierView.vue'
import LoginFrontView from '@/view/frontoffice/LoginFrontView.vue'
import CheckoutView from '@/view/frontoffice/CheckoutView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{
    path: '/backofficeDashboard',
    name: 'home',
    component: HomeView,
    meta: { requiresAuth: true }
  },
  {
    path: '/test',
    name: 'test',
    component: TestApiGet
  },
  {
    path: '/listProduct',
    name: 'list_product',
    meta: { requiresAuth: true },
    component: ListProduitsView
  },
  {
    path: '/import',
    name: 'import',
    meta: { requiresAuth: true },
    component: ImportView
  },
  {
    path: '/reset',
    name: 'reset',
    meta: { requiresAuth: true },
    component: ResetView
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView
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
  }
  ]
})

router.beforeEach((to, from, next) => {
  const isAuthenticated = localStorage.getItem('token') !== null

  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && isAuthenticated) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router