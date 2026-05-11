import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../view/HomeView.vue'
import TestApiGet from '@/components/TestApiGet.vue'
import ListProduitsView from '@/view/ListProduitsView.vue'
import ResetView from '@/view/ResetView.vue'
import LoginView from '@/view/LoginView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{
    path: '/backofficeDashboard', // Une nouvelle adresse pour tes tâches
    name: 'home',
    component: HomeView,
    meta: { requiresAuth: true } // 🚩 Badge requis
  },
  {
    path: '/test', // Une nouvelle adresse pour tes tâches
    name: 'test',
    component: TestApiGet
  },
  {
    path: '/listProduct', // Une nouvelle adresse pour tes tâches
    name: 'list_product',
    component: ListProduitsView
  },
  {
    path: '/reset',
    name: 'reset',
    component: ResetView
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView
  }
  ]
})
router.beforeEach((to, from, next) => {
    const isAuthenticated = localStorage.getItem('token') !== null

    if (to.meta.requiresAuth && !isAuthenticated) {
      // Si la page est protégée et qu'on n'est pas connecté -> Retour au login
      next('/login')
    } else if (to.path === '/login' && isAuthenticated) {
      // Si on est déjà connecté et qu'on essaie d'aller sur login -> Dashboard
      next('/dashboard')
    } else {
      // Dans tous les autres cas, on laisse passer
      next()
    }
  })
export default router