import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
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
  if (to.meta.requiresAuth && !localStorage.getItem('userId')) {
    return { name: 'home' }
  }
})

export default router
