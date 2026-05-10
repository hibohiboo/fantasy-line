import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import VillageListView from '../views/VillageListView.vue'
import VillageCreateView from '../views/VillageCreateView.vue'
import ResidentListView from '../views/ResidentListView.vue'
import ResidentCreateView from '../views/ResidentCreateView.vue'
import VillageResidentListView from '../views/VillageResidentListView.vue'

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
    {
      path: '/residents',
      name: 'resident-list',
      component: ResidentListView,
      meta: { requiresAuth: true },
    },
    {
      path: '/residents/new',
      name: 'resident-create',
      component: ResidentCreateView,
      meta: { requiresAuth: true },
    },
    {
      path: '/villages/:id/residents',
      name: 'village-resident-list',
      component: VillageResidentListView,
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
