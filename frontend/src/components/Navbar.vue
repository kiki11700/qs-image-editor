<template>
  <header class="sticky top-0 z-50 border-b border-white/10" style="background: rgba(15,15,35,0.85); backdrop-filter: blur(16px);">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-14 sm:h-16">
        <router-link to="/" class="flex items-center gap-2">
          <span class="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#667eea] to-[#764ba2] bg-clip-text text-transparent">? AI ??</span>
        </router-link>

        <nav class="hidden md:flex items-center gap-1">
          <router-link to="/" class="px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors">??</router-link>
          <router-link to="/workflow" class="px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors">???</router-link>
          <router-link to="/history" class="px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors">????</router-link>
        </nav>

        <div class="flex items-center gap-3">
          <span v-if="store.isLoggedIn" class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-gray-300">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            {{ store.credits }} ?
          </span>

          <template v-if="store.isLoggedIn">
            <router-link to="/recharge">
              <el-button type="primary" size="small" round>??</el-button>
            </router-link>
            <el-dropdown trigger="click" @command="handleCommand">
              <el-button size="small" round class="!bg-white/5 !border-white/10 !text-gray-200">
                {{ store.username }} <el-icon class="ml-1"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="history">????</el-dropdown-item>
                  <el-dropdown-item command="recharge">????</el-dropdown-item>
                  <el-dropdown-item divided command="logout">????</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
          <template v-else>
            <router-link to="/login">
              <el-button size="small" round class="!bg-white/5 !border-white/10 !text-gray-200">??</el-button>
            </router-link>
          </template>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/user";
import { ArrowDown } from "@element-plus/icons-vue";

const router = useRouter();
const store = useUserStore();

function handleCommand(cmd) {
  if (cmd === "logout") {
    store.logout();
    router.push("/");
  } else if (cmd === "history") {
    router.push("/history");
  } else {
    router.push("/recharge");
  }
}
</script>
