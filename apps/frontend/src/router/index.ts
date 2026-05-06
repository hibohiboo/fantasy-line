import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import VillageListView from '../views/VillageListView.vue'
import VillageCreateView from '../views/VillageCreateView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
    },
    {
      path: '/villages',
      name: 'village-list',
      component: VillageListView,
      meta: { requiresAuth: true },
    },
    {
      path: '/villages/new',
      name: 'village-create',
      component: VillageCreateView,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !localStorage.getItem('userId')) {
    return { name: 'home' }
  }
})

export default router
