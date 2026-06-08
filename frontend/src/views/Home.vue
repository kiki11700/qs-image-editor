<template>
  <div class="pt-4 pb-12">
    <div class="text-center mb-8">
      <h1 class="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-[#667eea] to-[#764ba2] bg-clip-text text-transparent">AI 智能修图</h1>
      <p class="text-gray-500 text-sm mt-2">上传图片，选择功能，AI 一键处理</p>
    </div>

    <div class="mb-8">
      <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">选择功能</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div v-for="t in tools" :key="t.id" @click="selectTool(t.id)"
          class="relative p-4 rounded-xl cursor-pointer transition-all duration-200 text-center border"
          :class="selectedTool === t.id ? 'bg-gradient-to-br from-[#667eea]/20 to-[#764ba2]/20 border-[#667eea] shadow-lg shadow-[#667eea]/10' : 'bg-white/[0.04] border-white/[0.08] hover:border-white/[0.2] hover:bg-white/[0.06]'">
          <div v-if="selectedTool === t.id" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#667eea] flex items-center justify-center text-white text-[10px]">&#10003;</div>
          <div class="text-2xl mb-1.5">{{ t.icon }}</div>
          <div class="text-sm font-semibold">{{ t.name }}</div>
          <div class="text-[11px] text-gray-500 mt-0.5 leading-tight">{{ t.desc }}</div>
        </div>
      </div>
    </div>

    <div class="bg-white/[0.03] rounded-2xl border border-white/[0.08] p-6 sm:p-8">
      <div v-if="!selectedTool" class="text-center py-10 text-gray-500">
        <div class="text-5xl mb-3">👆</div>
        <div class="text-sm">请先选择一个功能</div>
      </div>

      <template v-if="selectedTool">
        <div v-if="selectedToolDef?.needsParam" class="mb-5">
          <label class="block text-sm font-medium text-gray-400 mb-2">{{ selectedToolDef.paramLabel }}</label>
          <div v-if="selectedToolDef.paramType === 'text'" class="max-w-md">
            <input v-model="extraParam" placeholder="例如: 动漫风格、油画风格、水彩风格"
              class="w-full px-4 py-2.5 rounded-lg bg-black/20 border border-white/[0.1] text-gray-200 text-sm outline-none focus:border-[#667eea] transition-colors" />
          </div>
          <div v-else class="flex items-center gap-3">
            <input type="color" v-model="extraParam" class="w-10 h-10 rounded cursor-pointer border-0" />
            <span class="text-xs text-gray-500">{{ extraParam || '#ffffff' }}</span>
          </div>
        </div>

        <div @drop.prevent="handleDrop" @dragover.prevent
          class="relative border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-200"
          :class="fileUrl ? 'border-[#667eea]/40 bg-[#667eea]/5' : 'border-white/[0.12] hover:border-white/[0.25] bg-white/[0.02] hover:bg-white/[0.04]'">
          <input type="file" accept="image/*" class="hidden" id="fileInput"
            @change="handleFile($event.target.files[0])" />
          <div v-if="!fileUrl" class="py-12 px-4" @click="document.getElementById('fileInput').click()">
            <div class="text-5xl mb-3 text-gray-600">📁</div>
            <div class="text-base font-medium text-gray-400">拖拽图片到此处，或点击上传</div>
            <div class="text-xs text-gray-600 mt-2">支持 JPG / PNG / WebP，最大 100MB</div>
          </div>
          <div v-else class="p-4">
            <img :src="fileUrl" class="max-h-64 mx-auto rounded-lg object-contain" />
            <div class="flex justify-center gap-3 mt-3">
              <button @click="document.getElementById('fileInput').click()"
                class="px-4 py-1.5 rounded-lg text-xs font-medium border border-white/[0.15] text-gray-300 hover:bg-white/[0.05] transition-colors">重新选择</button>
              <button @click="resetAll"
                class="px-4 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">清除</button>
            </div>
          </div>
        </div>

        <div class="flex justify-center mt-6">
          <button @click="processImage" :disabled="!canProcess || processing"
            class="px-12 py-3 rounded-xl text-base font-bold transition-all duration-200"
            :class="!canProcess || processing ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:shadow-lg hover:shadow-[#667eea]/20 active:scale-[0.98]'">
            <span v-if="processing" class="flex items-center gap-2">
              <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              处理中...
            </span>
            <span v-else>开始处理（内测免费）</span>
          </button>
        </div>
        <div v-if="!store.isLoggedIn && selectedTool" class="text-center mt-2">
          <span class="text-xs text-gray-600">请先</span>
          <router-link to="/login" class="text-xs text-[#667eea] hover:underline">登录</router-link>
          <span class="text-xs text-gray-600">后使用</span>
        </div>
      </template>
    </div>

    <div v-if="resultVisible" class="mt-6 bg-white/[0.03] rounded-2xl border border-white/[0.08] p-6 sm:p-8">
      <h3 class="text-lg font-bold mb-4">处理结果</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="bg-black/20 rounded-xl p-3">
          <div class="text-xs text-gray-500 mb-2 font-medium">原图</div>
          <img :src="fileUrl" class="w-full rounded-lg object-contain max-h-80" />
        </div>
        <div class="bg-black/20 rounded-xl p-3">
          <div class="text-xs text-gray-500 mb-2 font-medium">处理结果</div>
          <img :src="previewUrl" class="w-full rounded-lg object-contain max-h-80" />
        </div>
      </div>
      <div class="flex justify-center gap-3 mt-4">
        <button @click="downloadResult"
          class="px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:shadow-lg transition-all">⬇ 下载结果</button>
        <button @click="resetAll"
          class="px-6 py-2.5 rounded-xl text-sm font-medium border border-white/[0.15] text-gray-300 hover:bg-white/[0.05] transition-all">继续处理</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useRouter, useRoute } from "vue-router";
import { useUserStore } from "../stores/user";
import axios from "axios";

const router = useRouter();
const route = useRoute();
const store = useUserStore();

const tools = [
  { id: "upscale",      icon: "🖼️",  name: "转高清",    desc: "AI 增强画质，提升分辨率",         needsParam: false },
  { id: "upscale4k",    icon: "📺",  name: "转 4K 高清", desc: "极致超清化处理，输出 4K 图片",    needsParam: false },
  { id: "vectorize",    icon: "📐",  name: "转矢量图",   desc: "位图转 SVG 矢量，无限放大不失真", needsParam: false },
  { id: "remove-bg",    icon: "✂️",  name: "抠图去底",   desc: "AI 自动识别主体，一键去除背景",    needsParam: false },
  { id: "replace-bg",   icon: "🎨",  name: "更换背景",   desc: "更换背景颜色或图片",              needsParam: true, paramType: "color", paramLabel: "背景颜色" },
  { id: "style-transfer", icon: "✨", name: "转风格",    desc: "AI 风格迁移，创意无限",            needsParam: true, paramType: "text",  paramLabel: "风格描述" },
  { id: "similar",      icon: "🔀",  name: "出类似图",   desc: "AI 生成相似风格的全新图片",        needsParam: false },
];

const selectedTool = ref(null);
const extraParam = ref("");
const file = ref(null);
const fileUrl = ref("");
const processing = ref(false);
const resultUrl = ref("");
const previewUrl = ref("");
const taskId = ref("");
const resultVisible = ref(false);

const canProcess = computed(() => selectedTool.value && file.value && store.isLoggedIn);
const selectedToolDef = computed(() => tools.find(t => t.id === selectedTool.value));

function handleFile(rawFile) {
  if (!rawFile) return;
  if (!rawFile.type.startsWith("image/")) { ElMessage.warning("请上传图片文件"); return; }
  if (rawFile.size > 100 * 1024 * 1024) { ElMessage.warning("图片超过 100MB 限制"); return; }
  file.value = rawFile;
  fileUrl.value = URL.createObjectURL(rawFile);
  resultVisible.value = false;
}

function handleDrop(e) {
  const f = e.dataTransfer?.files?.[0];
  if (f) handleFile(f);
}

function selectTool(id) {
  selectedTool.value = id;
  extraParam.value = "";
  resultVisible.value = false;
}

async function processImage() {
  if (!store.isLoggedIn) { ElMessage.warning("请先登录"); router.push("/login"); return; }
  if (!selectedTool.value || !file.value) return;
  processing.value = true;
  resultVisible.value = false;

  const fd = new FormData();
  fd.append("image", file.value);
  fd.append("type", selectedTool.value);
  const def = selectedToolDef.value;
  if (def?.needsParam && extraParam.value) {
    fd.append(def.paramType === "color" ? "bgColor" : "stylePrompt", extraParam.value);
  }

  try {
    const res = await axios.post("/api/image/process", fd, {
      headers: { Authorization: "Bearer " + store.token, "Content-Type": "multipart/form-data" },
    });
    taskId.value = res.data.taskId;
    ElMessage.success("任务已提交，正在处理...");
    await pollResult();
  } catch (e) {
    ElMessage.error(e.response?.data?.error || "处理失败");
    processing.value = false;
  }
}

async function pollResult() {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const res = await axios.get("/api/image/task/" + taskId.value, {
        headers: { Authorization: "Bearer " + store.token },
      });
      if (res.data.status === "completed") {
        resultUrl.value = "/api/image/download/" + taskId.value + "?token=" + store.token;
        previewUrl.value = "/api/image/preview/" + taskId.value + "?token=" + store.token;
        resultVisible.value = true;
        processing.value = false;
        ElMessage.success("处理完成！");
        const me = await axios.get("/api/auth/me", { headers: { Authorization: "Bearer " + store.token } });
        store.updateCredits(me.data.credits);
        return;
      }
      if (res.data.status === "failed") {
        processing.value = false;
        ElMessage.error("处理失败");
        return;
      }
    } catch (_) {}
  }
  processing.value = false;
  ElMessage.error("处理超时，请查看历史记录");
}

function downloadResult() {
  if (!resultUrl.value) return;
  const a = document.createElement("a");
  a.href = resultUrl.value;
  const ext = resultUrl.value.endsWith(".svg") ? ".svg" : ".png";
  a.download = "QS美图_result_" + taskId.value.slice(0, 8) + ext;
  a.click();
}

function resetAll() {
  selectedTool.value = null;
  file.value = null;
  fileUrl.value = "";
  resultUrl.value = "";
  previewUrl.value = "";
  resultVisible.value = false;
  taskId.value = "";
  extraParam.value = "";
}

onMounted(async () => {
  const taskIdParam = route.query.taskId;
  if (taskIdParam) { await loadTaskResult(taskIdParam); }
});

async function loadTaskResult(tid) {
  if (!store.isLoggedIn) { router.push("/login"); return; }
  try {
    const res = await axios.get("/api/image/task/" + tid, {
      headers: { Authorization: "Bearer " + store.token }
    });
    if (res.data.status === "completed") {
      taskId.value = tid;
      previewUrl.value = "/api/image/preview/" + tid + "?token=" + store.token;
      resultUrl.value = "/api/image/download/" + tid + "?token=" + store.token;
      fileUrl.value = res.data.inputUrl ? res.data.inputUrl + "?token=" + store.token : "";
      resultVisible.value = true;
      const t = tools.find(t => t.id === res.data.type);
      if (t) selectedTool.value = t.id;
    } else {
      ElMessage.info("该任务尚未完成或已失败");
    }
  } catch(e) {
    ElMessage.error("加载历史记录失败");
  }
}
</script>
