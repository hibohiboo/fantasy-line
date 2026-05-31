<template>
  <v-container>
    <v-row align="center" class="mb-4">
      <v-col>
        <h1 class="text-headline-large">住人一覧</h1>
      </v-col>
      <v-col class="text-right">
        <v-btn color="primary" to="/residents/new">住人を追加</v-btn>
      </v-col>
    </v-row>

    <v-alert
      v-if="isError"
      type="error"
      variant="tonal"
      class="mb-4"
    >
      住人一覧の取得に失敗しました。再読み込みしてください。
    </v-alert>

    <div v-if="isLoading" class="d-flex justify-center my-8">
      <v-progress-circular data-testid="loading" indeterminate color="primary" />
    </div>

    <ResidentList
      v-else
      :residents="residents"
      :showVillage="true"
    />
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useResidentStore } from '@/features/resident/residentStore'
import ResidentList from '@/features/resident/ResidentList.vue'
import type { ResidentWithVillageResponse } from '@repo/schema'

const store = useResidentStore()
const residents = computed(() => store.residents as unknown as ResidentWithVillageResponse[])
const isLoading = computed(() => store.isLoading as unknown as boolean)
const isError = computed(() => (store.error as unknown as string | null) !== null)

onMounted(() => store.fetchResidents())
</script>
