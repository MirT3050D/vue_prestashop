import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../view/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [    {
      path: '/', // Une nouvelle adresse pour tes tâches
      name: 'home',
      component: HomeView
    }, 
  ]
})

export default router