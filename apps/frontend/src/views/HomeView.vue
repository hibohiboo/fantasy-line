<template>
  <v-container max-width="480" class="py-16">
    <div class="text-center">
      <h1 class="text-display-small mb-4">ファンタジーライン</h1>
      <p class="text-body-large text-medium-emphasis mb-10">
        村を育て、ファンタジー世界を管理する台帳
      </p>

      <template v-if="!userId">
        <v-text-field
          v-model="inputName"
          label="ユーザー名"
          placeholder="冒険者の名前を入力してください"
          variant="outlined"
          class="mb-4"
          @keyup.enter="start"
        />
        <v-btn
          color="primary"
          size="large"
          :disabled="!inputName.trim()"
          @click="start"
        >
          始める
        </v-btn>
      </template>

      <template v-else>
        <p class="text-body-medium text-medium-emphasis mb-6">
          おかえりなさい、{{ userId }} さん
        </p>
        <v-btn color="primary" size="large" to="/villages">
          村一覧を見る
        </v-btn>
      </template>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const userId = ref(localStorage.getItem('userId'))
const inputName = ref('')

function start() {
  if (!inputName.value.trim()) return
  localStorage.setItem('userId', inputName.value.trim())
  userId.value = inputName.value.trim()
  router.push('/villages')
}
</script>
