<template>
  <div class="min-h-[70vh] flex items-center justify-center">
    <div class="w-full max-w-md">
      <div class="bg-white/[0.04] rounded-2xl p-8 border border-white/[0.08] backdrop-blur-xl">
        <h2 class="text-2xl font-bold text-center mb-2">{{ isRegister ? "????" : "????" }}</h2>
        <p class="text-sm text-gray-500 text-center mb-6">{{ isRegister ? "???? 8 ?????" : "??????" }}</p>

        <el-form :model="form" class="space-y-4" @submit.prevent="submit">
          <el-form-item v-if="isRegister">
            <el-input v-model="form.email" placeholder="??" size="large" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.username" placeholder="???" size="large" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.password" type="password" placeholder="??" show-password size="large" />
          </el-form-item>
          <el-button type="primary" native-type="submit" size="large" class="!w-full" :loading="loading">
            {{ isRegister ? "??" : "??" }}
          </el-button>
        </el-form>

        <div class="mt-4 text-center text-sm text-gray-500">
          {{ isRegister ? "?????" : "??????" }}
          <a class="text-[#667eea] cursor-pointer hover:underline font-medium" @click="isRegister = !isRegister">
            {{ isRegister ? "???" : "????" }}
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useUserStore } from "../stores/user";
import { ElMessage } from "element-plus";
import axios from "axios";

const router = useRouter();
const route = useRoute();
const store = useUserStore();
const isRegister = ref(false);
const loading = ref(false);
const form = ref({ username: "", password: "", email: "" });

async function submit() {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning("???????");
    return;
  }
  if (isRegister.value && !form.value.email) {
    ElMessage.warning("?????");
    return;
  }
  loading.value = true;
  try {
    const ep = isRegister.value ? "/api/auth/register" : "/api/auth/login";
    const payload = isRegister.value
      ? { username: form.value.username, email: form.value.email, password: form.value.password }
      : { username: form.value.username, password: form.value.password };
    const res = await axios.post(ep, payload);
    store.setAuth(res.data.token, { userId: res.data.userId, username: res.data.username, credits: res.data.credits });
    ElMessage.success(isRegister.value ? "??????? 8 ?????" : "????");
    router.push("/");
  } catch (e) {
    ElMessage.error(e.response?.data?.error || "????");
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (store.isLoggedIn) router.push("/");
});
</script>
