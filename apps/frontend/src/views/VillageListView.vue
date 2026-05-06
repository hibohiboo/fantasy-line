<template>
  <v-container>
    <v-row align="center" class="mb-4">
      <v-col>
        <h1 class="text-headline-large">村一覧</h1>
      </v-col>
      <v-col class="text-right">
        <v-btn color="primary" to="/villages/new">村を作成する</v-btn>
      </v-col>
    </v-row>

    <v-alert
      v-if="isError"
      type="error"
      variant="tonal"
      class="mb-4"
    >
      村一覧の取得に失敗しました。再読み込みしてください。
    </v-alert>

    <div v-if="isLoading" class="d-flex justify-center my-8">
      <v-progress-circular data-testid="loading" indeterminate color="primary" />
    </div>

    <v-empty-state
      v-else-if="villages.length === 0 && !isError"
      icon="mdi-castle"
      title="村がありません"
      text="最初の村を作成しましょう。"
    >
      <template #actions>
        <v-btn color="primary" to="/villages/new">村を作成する</v-btn>
      </template>
    </v-empty-state>

    <v-row v-else>
      <v-col
        v-for="village in villages"
        :key="village.id"
        cols="12"
        sm="6"
        md="4"
      >
        <VillageCard :village="village" />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useVillageStore } from '@/stores/village'
import VillageCard from '@/components/village/VillageCard.vue'

const store = useVillageStore()
const { villages, isLoading, error } = storeToRefs(store)
const isError = computed(() => error.value !== null)

onMounted(() => store.fetchVillages())
</script>
