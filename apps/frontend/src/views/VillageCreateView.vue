<template>
  <v-container style="max-width: 600px">
    <h1 class="text-headline-large mb-6">村を作成する</h1>

    <v-form ref="form">
      <v-text-field
        v-model="villageName"
        label="村名"
        :rules="[validateName]"
        maxlength="128"
        counter
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
            作成する
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
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useVillageStore } from '@/stores/village'
import { CreateVillageSchema } from '@repo/schema'

const router = useRouter()
const store = useVillageStore()

const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const villageName = ref('')
const isSubmitting = ref(false)
const apiError = ref<string | null>(null)

const nameSchema = CreateVillageSchema.shape.name

function validateName(v: string): true | string {
  const result = nameSchema.safeParse(v)
  if (result.success) return true
  const code = result.error.issues[0]?.code
  if (code === 'too_small') return '村名を入力してください'
  if (code === 'too_big') return '村名は128文字以内で入力してください'
  return '入力内容を確認してください'
}

async function onSubmit() {
  const result = await form.value?.validate()
  if (!result?.valid) return

  isSubmitting.value = true
  apiError.value = null
  try {
    const result = await store.createVillage(villageName.value)
    if (result === null) {
      apiError.value = store.error ?? '村の作成に失敗しました。再試行してください。'
      return
    }
    router.push('/villages')
  } finally {
    isSubmitting.value = false
  }
}

function onCancel() {
  router.push('/villages')
}
</script>
