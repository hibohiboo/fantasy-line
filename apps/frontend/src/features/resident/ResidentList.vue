<template>
  <div>
    <v-empty-state
      v-if="residents.length === 0"
      icon="mdi-account-group"
      title="住人が登録されていません。追加してください"
    />
    <v-table v-else>
      <thead>
        <tr>
          <th>名前</th>
          <th>読み</th>
          <th>生年月日</th>
          <th v-if="showVillage">所属村</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="resident in residents" :key="resident.id">
          <td>{{ resident.name }}</td>
          <td>{{ resident.nameKana }}</td>
          <td>{{ resident.birthDate }}</td>
          <td v-if="showVillage">{{ (resident as ResidentWithVillageResponse).villageName }}</td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>

<script setup lang="ts">
import type { ResidentWithVillageResponse, ResidentResponse } from '@repo/schema'

defineProps<{
  residents: ResidentWithVillageResponse[] | ResidentResponse[]
  showVillage: boolean
}>()
</script>
