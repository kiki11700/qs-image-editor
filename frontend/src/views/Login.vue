<template>
  <div class="min-h-[70vh] flex items-center justify-center">
    <div class="w-full max-w-md">
      <div class="bg-white/[0.04] rounded-2xl p-8 border border-white/[0.08] backdrop-blur-xl">
        <h2 class="text-2xl font-bold text-center mb-2">{{ isRegister ? "注册" : "登录" }}</h2>
        <p class="text-sm text-gray-500 text-center mb-6">{{ isRegister ? "注册即送 8 次免费额度" : "欢迎回来" }}</p>

        <el-form :model="form" class="space-y-4" @submit.prevent="submit">
          <el-form-item v-if="isRegister">
            <el-input v-model="form.email" placeholder="邮箱" size="large" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.username" placeholder="用户名" size="large" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.password" type="password" placeholder="密码" show-password size="large" />
          </el-form-item>
          <el-button type="primary" native-type="submit" size="large" class="!w-full" :loading="loading">
            {{ isRegister ? "注册" : "登录" }}
          </el-button>
        </el-form>

        <div class="mt-4 text-center text-sm text-gray-500">
          {{ isRegister ? "已有账号？" : "还没有账号？" }}
          <a class="text-[#667eea] cursor-pointer hover:underline font-medium" @click="isRegister = !isRegister">
            {{ isRegister ? "去登录" : "立即注册" }}
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
    ElMessage.warning("请填写用户名和密码");
    return;
  }
  if (isRegister.value && !form.value.email) {
    ElMessage.warning("请填写邮箱");
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
    ElMessage.success(isRegister.value ? "注册成功！赠送 8 次额度" : "登录成功");
    router.push("/");
  } catch (e) {
    ElMessage.error(e.response?.data?.error || "操作失败");
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (store.isLoggedIn) router.push("/");
});
</script>
