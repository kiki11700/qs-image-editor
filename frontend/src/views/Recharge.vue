<template>
  <div class="max-w-2xl mx-auto pt-8">
    <h2 class="text-2xl font-bold text-center mb-2">?? ????</h2>
    <p class="text-sm text-gray-500 text-center mb-8">?????????????????</p>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
      <div v-for="pkg in packages" :key="pkg.id"
        @click="selectedPkg = pkg.id"
        class="relative p-5 rounded-xl cursor-pointer transition-all duration-200 text-center border"
        :class="selectedPkg === pkg.id
          ? `bg-gradient-to-br from-[#667eea]/20 to-[#764ba2]/20 border-[#667eea] shadow-lg shadow-[#667eea]/10`
          : `bg-white/[0.04] border-white/[0.08] hover:border-white/[0.15]`"
      >
        <div v-if="selectedPkg === pkg.id" class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#667eea] flex items-center justify-center text-white text-xs">?</div>
        <div class="text-3xl font-bold text-[#667eea] mb-1">{{ pkg.credits }}</div>
        <div class="text-xs text-gray-500 mb-3">?????</div>
        <div class="text-lg font-bold text-white">?{{ pkg.price }}</div>
        <div class="text-xs text-gray-500 mt-1">?{{ (pkg.price / pkg.credits).toFixed(2) }}/?</div>
      </div>
    </div>

    <div class="bg-white/[0.04] rounded-xl p-5 border border-white/[0.08] mb-4">
      <div class="text-sm font-medium mb-3">???</div>
      <div class="flex gap-2">
        <el-input v-model="code" placeholder="?????" size="large" class="flex-1" />
        <el-button type="primary" size="large" @click="redeem">??</el-button>
      </div>
    </div>

    <div class="flex gap-3 justify-center">
      <el-button type="primary" size="large" round :disabled="!selectedPkg || paying" :loading="paying" @click="pay" class="!px-12 !text-base">
        {{ paying ? "???..." : "???? ?" + (selectedPkg ? packages.find(p=>p.id===selectedPkg)?.price : 0) }}
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useUserStore } from "../stores/user";
import { useRouter } from "vue-router";
import axios from "axios";

const router = useRouter();
const store = useUserStore();
const packages = ref([]);
const selectedPkg = ref("");
const paying = ref(false);
const code = ref("");

async function loadPackages() {
  try {
    const res = await axios.get("/api/payment/packages");
    packages.value = res.data;
  } catch (e) { /* ignore */ }
}

async function pay() {
  if (!store.isLoggedIn) { ElMessage.warning("????"); router.push("/login"); return; }
  if (!selectedPkg.value) return;
  paying.value = true;
  try {
    const res = await axios.post("/api/payment/create-order",
      { packageId: selectedPkg.value, channel: "alipay" },
      { headers: { Authorization: "Bearer " + store.token } }
    );
    // ??????
    await axios.post("/api/payment/notify", { orderId: res.data.orderId });
    const me = await axios.get("/api/auth/me", { headers: { Authorization: "Bearer " + store.token } });
    store.updateCredits(me.data.credits);
    ElMessage.success("??????? " + res.data.credits + " ???");
  } catch (e) {
    ElMessage.error(e.response?.data?.error || "????");
  } finally {
    paying.value = false;
  }
}

async function redeem() {
  if (!store.isLoggedIn) { ElMessage.warning("????"); return; }
  if (!code.value) { ElMessage.warning("??????"); return; }
  try {
    const res = await axios.post("/api/payment/redeem", { code: code.value }, {
      headers: { Authorization: "Bearer " + store.token }
    });
    store.updateCredits(res.data.credits);
    ElMessage.success(res.data.message);
  } catch (e) {
    ElMessage.error(e.response?.data?.error || "????");
  }
}

onMounted(() => { loadPackages(); });
</script>
