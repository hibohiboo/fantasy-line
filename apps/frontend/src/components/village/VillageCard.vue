<template>
  <v-card>
    <v-card-title class="text-title-large">{{ village.name }}</v-card-title>
    <v-card-subtitle class="text-body-medium text-medium-emphasis">
      作成日: {{ formattedDate }}
    </v-card-subtitle>
    <v-card-actions>
      <v-btn variant="text" color="primary" :to="`/villages/${village.id}`">
        詳細を見る
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { VillageResponse } from '@repo/schema'

const props = defineProps<{ village: VillageResponse }>()

const formattedDate = computed(() => {
  const d = new Date(props.village.createdAt)
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
})
</script>
