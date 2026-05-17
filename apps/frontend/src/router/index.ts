import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
    },
    {
      path: '/villages',
      name: 'village-list',
      component: () => import('../views/VillageListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/villages/new',
      name: 'village-create',
      component: () => import('../views/VillageCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/residents',
      name: 'resident-list',
      component: () => import('../views/ResidentListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/residents/new',
      name: 'resident-create',
      component: () => import('../views/ResidentCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/villages/:id/residents',
      name: 'village-resident-list',
      component: () => import('../views/VillageResidentListView.vue'),
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
