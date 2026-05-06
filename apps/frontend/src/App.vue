<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <v-app>
    <v-app-bar color="primary" flat elevation="1">
      <v-app-bar-title>
        <router-link to="/" class="text-white text-decoration-none text-title-large">
          ファンタジーライン
        </router-link>
      </v-app-bar-title>
      <template #append>
        <v-btn to="/villages" variant="text" color="white">
          村一覧
        </v-btn>
      </template>
    </v-app-bar>
    <v-main>
      <RouterView />
    </v-main>
  </v-app>
</template>
