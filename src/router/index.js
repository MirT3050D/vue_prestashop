import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../view/HomeView.vue'
import TestApiGet from '@/components/TestApiGet.vue'
import ListProduitsView from '@/view/ListProduitsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{
    path: '/', // Une nouvelle adresse pour tes tâches
    name: 'home',
    component: HomeView
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
  ]
})

export default router