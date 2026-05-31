<template>
  <v-card>
    <v-card-title class="text-title-large">{{ village.name }}</v-card-title>
    <v-card-subtitle class="text-body-medium text-medium-emphasis">
      作成日: {{ formattedDate }}
    </v-card-subtitle>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { format } from 'date-fns/format'
import type { VillageResponse } from '@repo/schema'

const props = defineProps<{ village: VillageResponse }>()

const formattedDate = computed(() => {
  const d = new Date(props.village.createdAt)
  return format(d, 'yyyy-MM-dd HH:mm:ss')
})
</script>
