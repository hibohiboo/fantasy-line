import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../features/auth/useAuthStore'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../features/auth/LoginView.vue'),
    },
    {
      path: '/',
      name: 'home',
      component: () => import('../shared/ui/HomeView.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../shared/ui/AboutView.vue'),
    },
    {
      path: '/villages',
      name: 'village-list',
      component: () => import('../features/village/VillageListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/villages/new',
      name: 'village-create',
      component: () => import('../features/village/VillageCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/residents',
      name: 'resident-list',
      component: () => import('../features/resident/ResidentListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/residents/new',
      name: 'resident-create',
      component: () => import('../features/resident/ResidentCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/villages/:id/residents',
      name: 'village-resident-list',
      component: () => import('../features/resident/VillageResidentListView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.user) {
    return { name: 'login' }
  }
})

export default router
