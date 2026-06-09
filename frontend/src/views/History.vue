<template>
  <div class="max-w-3xl mx-auto pt-6 px-4">
    <h2 class="text-xl font-bold mb-6">历史记录</h2>
    <div v-if="tasks.length === 0" class="text-center py-16 text-gray-600">
      <div class="text-4xl mb-3">📋</div>
      <div class="text-sm">还没有处理记录</div>
    </div>
    <div v-else class="space-y-2">
      <div v-for="t in tasks" :key="t.id"
        class="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] transition-all"
      >
        <div class="flex items-center gap-3">
          <span class="text-lg">{{ toolIcon(t.type) }}</span>
          <div>
            <div class="text-sm font-medium">{{ toolName(t.type) }}</div>
            <div class="text-xs text-gray-600">{{ formatTime(t.createdAt) }}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs px-2.5 py-1 rounded-full font-medium"
            :class="statusClass(t.status)"
          >{{ statusText(t.status) }}</span>
          <template v-if="t.status === 'completed'">
            <el-button size="small" round @click="viewResult(t)">查看</el-button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/user";
import axios from "axios";

const router = useRouter();
const store = useUserStore();
const tasks = ref([]);

const TOOLS_MAP = {
  upscale: { icon: "🖼️", name: "转高清" },
  upscale4k: { icon: "📺", name: "转4K" },
  vectorize: { icon: "📐", name: "转矢量" },
  "remove-bg": { icon: "✂️", name: "抠图去底" },
  "replace-bg": { icon: "🎨", name: "更换背景" },
  "style-transfer": { icon: "✨", name: "转风格" },
  similar: { icon: "🔀", name: "出类似图" },
  "extract-pattern": { icon: "🖌️", name: "印花提取" },
};

function toolIcon(type) { return TOOLS_MAP[type]?.icon || "🖼️"; }
function toolName(type) { return TOOLS_MAP[type]?.name || type; }
function statusClass(s) {
  return s === "completed" ? "bg-emerald-500/15 text-emerald-400" : s === "processing" ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400";
}
function statusText(s) {
  return s === "completed" ? "已完成" : s === "processing" ? "处理中" : "失败";
}
function formatTime(t) {
  if (!t) return "";
  return t.substring(0, 16).replace("T", " ");
}

function viewResult(task) {
  router.push("/?taskId=" + task.id);
}

async function loadTasks() {
  if (!store.isLoggedIn) { router.push("/login"); return; }
  try {
    const res = await axios.get("/api/image/tasks", {
      headers: { Authorization: "Bearer " + store.token }
    });
    tasks.value = res.data;
  } catch (e) {
    ElMessage.error("加载失败");
  }
}
onMounted(() => { loadTasks(); });
</script>
