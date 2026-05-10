<template>
  <v-container>
    <v-row align="center" class="mb-4">
      <v-col>
        <h1 class="text-headline-large">住人一覧</h1>
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
      :residents="villageResidents"
      :showVillage="false"
    />
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useResidentStore } from '@/stores/resident'
import ResidentList from '@/components/resident/ResidentList.vue'

const route = useRoute()
const store = useResidentStore()
const { villageResidents, isLoading, error } = storeToRefs(store)
const isError = computed(() => error.value !== null)

onMounted(() => {
  const villageId = Number(route.params.id)
  store.fetchVillageResidents(villageId)
})
</script>
