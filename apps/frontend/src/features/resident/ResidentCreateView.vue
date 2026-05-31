<template>
  <v-container style="max-width: 600px">
    <h1 class="text-headline-large mb-6">住人を登録する</h1>

    <v-form ref="form">
      <v-text-field
        v-model="name"
        label="名前"
        data-testid="name"
        :rules="[validateName]"
        maxlength="128"
        counter
        required
      />

      <v-text-field
        v-model="nameKana"
        label="読み（カタカナ）"
        data-testid="nameKana"
        :rules="[validateNameKana]"
        maxlength="128"
        counter
        required
      />

      <v-text-field
        v-model="birthDate"
        label="生年月日"
        data-testid="birthDate"
        type="date"
        :rules="[validateBirthDate]"
        required
      />

      <v-select
        v-model="villageId"
        label="所属村"
        data-testid="villageId"
        :items="villageItems"
        item-title="name"
        item-value="id"
        :rules="[validateVillageId]"
        required
      />

      <v-row class="mt-2">
        <v-col>
          <v-btn variant="outlined" @click="onCancel">キャンセル</v-btn>
        </v-col>
        <v-col class="text-right">
          <v-btn
            color="primary"
            :loading="isSubmitting"
            data-testid="submit"
            @click="onSubmit"
          >
            登録する
          </v-btn>
        </v-col>
      </v-row>
    </v-form>

    <v-alert v-if="apiError" type="error" variant="tonal" class="mt-4">
      {{ apiError }}
    </v-alert>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useResidentStore } from '@/features/resident/residentStore'
import { useVillageStore } from '@/features/village/villageStore'
import { CreateResidentSchema } from '@repo/schema'
import type { VillageResponse } from '@repo/schema'

const router = useRouter()
const residentStore = useResidentStore()
const villageStore = useVillageStore()

const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const name = ref('')
const nameKana = ref('')
const birthDate = ref('')
const villageId = ref<number | null>(null)
const isSubmitting = ref(false)
const apiError = ref<string | null>(null)

const villageItems = computed(() => villageStore.villages as unknown as VillageResponse[])

onMounted(() => villageStore.fetchVillages())

const nameSchema = CreateResidentSchema.shape.name
const nameKanaSchema = CreateResidentSchema.shape.nameKana
const birthDateSchema = CreateResidentSchema.shape.birthDate
const villageIdSchema = CreateResidentSchema.shape.villageId

function validateName(v: string): true | string {
  const result = nameSchema.safeParse(v)
  if (result.success) return true
  const code = result.error.issues[0]?.code
  if (code === 'too_small') return '名前は必須です'
  if (code === 'too_big') return '名前は128文字以内で入力してください'
  return '入力内容を確認してください'
}

function validateNameKana(v: string): true | string {
  const result = nameKanaSchema.safeParse(v)
  if (result.success) return true
  const issue = result.error.issues[0]
  if (issue?.code === 'too_small') return '読みは必須です'
  if (issue?.code === 'too_big') return '読みは128文字以内で入力してください'
  if (issue?.code === 'invalid_format') return '読みはカタカナで入力してください'
  return '入力内容を確認してください'
}

function validateBirthDate(v: string): true | string {
  const result = birthDateSchema.safeParse(v)
  if (result.success) return true
  return '生年月日は必須です'
}

function validateVillageId(v: number | null): true | string {
  const result = villageIdSchema.safeParse(v)
  if (result.success) return true
  return '所属村を選択してください'
}

async function onSubmit() {
  const result = await form.value?.validate()
  if (!result?.valid) return

  if (villageId.value === null) return

  isSubmitting.value = true
  apiError.value = null
  try {
    const resident = await residentStore.createResident({
      name: name.value,
      nameKana: nameKana.value,
      birthDate: birthDate.value,
      villageId: villageId.value,
    })
    if (resident === null) {
      apiError.value = (residentStore.error as unknown as string | null) ?? '住人の登録に失敗しました。再試行してください。'
      return
    }
    router.push('/residents')
  } finally {
    isSubmitting.value = false
  }
}

function onCancel() {
  router.push('/residents')
}
</script>
