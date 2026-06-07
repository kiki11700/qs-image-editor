<template>
  <div class="pt-4">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-xl font-bold">工作流编排</h2>
        <p class="text-xs text-gray-500 mt-1">按顺序组合多个修图功能，一键执行</p>
      </div>
      <div class="flex gap-2">
        <el-button size="small" round @click="addNode">+ 添加步骤</el-button>
        <el-button type="primary" size="small" round :loading="running" :disabled="nodes.length < 2 || running" @click="runWorkflow">
          {{ running ? "处理中..." : "▶ 开始执行" }}
        </el-button>
      </div>
    </div>

    <!-- 工作流节点 -->
    <div class="space-y-3 mb-6">
      <div v-for="(node, idx) in nodes" :key="node.id" class="bg-white/[0.04] rounded-xl border border-white/[0.08] p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-[#667eea]/20 text-[#667eea] flex items-center justify-center text-xs font-bold">{{ idx + 1 }}</span>
            <span class="text-sm font-medium">{{ toolName(node.toolId) }}</span>
          </div>
          <el-button v-if="nodes.length > 1" size="small" text type="danger" @click="removeNode(idx)">删除</el-button>
        </div>

        <div class="flex gap-2 items-center">
          <el-select v-model="node.toolId" placeholder="选择功能" size="small" class="!w-[140px]" @change="()=>{}">
            <el-option v-for="t in tools" :key="t.id" :label="t.name" :value="t.id">
              <span>{{ t.icon }} {{ t.name }}</span>
            </el-option>
          </el-select>

          <template v-if="node.toolId === 'replace-bg'">
            <el-input v-model="node.params.bgColor" placeholder="颜色 #ffffff" size="small" class="!w-[120px]" />
          </template>
          <template v-else-if="node.toolId === 'style-transfer'">
            <el-input v-model="node.params.stylePrompt" placeholder="风格描述" size="small" class="!w-[150px]" />
          </template>

          <span class="text-xs text-gray-600 ml-auto">消耗 1 次额度/步</span>
        </div>

        <!-- 第一个节点：上传图片 -->
        <div v-if="idx === 0" class="mt-3">
          <div v-if="!node.file" class="border border-dashed border-white/10 rounded-lg py-6 text-center cursor-pointer hover:border-white/20" @click="triggerUpload(idx)">
            <div class="text-2xl mb-1">📁</div>
            <div class="text-xs text-gray-500">点击上传图片</div>
          </div>
          <div v-else class="flex items-center gap-3 p-2 rounded-lg bg-black/20">
            <img :src="node.fileUrl" class="w-10 h-10 rounded object-cover" />
            <span class="text-xs text-gray-400 truncate flex-1">{{ node.file.name }}</span>
            <el-button size="small" text @click="node.file = null; node.fileUrl = ''">更换</el-button>
          </div>
        </div>

        <!-- 最后一个节点：显示结果 -->
        <div v-if="idx === nodes.length - 1 && node.resultUrl" class="mt-3">
          <div class="text-xs text-gray-500 mb-1">处理结果</div>
          <img :src="node.resultUrl" class="max-h-[200px] rounded-lg object-contain bg-black/20" />
          <el-button size="small" round class="mt-2" @click="downloadWorkflowResult">⬇ 下载结果</el-button>
        </div>
      </div>
    </div>

    <!-- 流程预览 -->
    <div v-if="nodes.length >= 2" class="flex justify-center mb-4">
      <div class="flex items-center gap-1 text-gray-600 text-sm">
        <span v-for="(n, i) in nodes" :key="n.id">
          {{ toolName(n.toolId) }}{{ i < nodes.length - 1 ? " → " : "" }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from "vue";
import { ElMessage } from "element-plus";
import { useUserStore } from "../stores/user";
import { useRouter } from "vue-router";
import axios from "axios";

const router = useRouter();
const store = useUserStore();

const tools = [
  { id: "upscale", icon: "🖼️", name: "转高清" },
  { id: "upscale4k", icon: "📺", name: "转4K" },
  { id: "vectorize", icon: "📐", name: "转矢量" },
  { id: "remove-bg", icon: "✂️", name: "抠图去底" },
  { id: "replace-bg", icon: "🎨", name: "更换背景" },
  { id: "style-transfer", icon: "✨", name: "转风格" },
  { id: "similar", icon: "🔀", name: "出类似图" },
];

let nodeCounter = 0;
const nodes = ref([
  { id: ++nodeCounter, toolId: "upscale", params: {}, file: null, fileUrl: "", resultUrl: "" },
  { id: ++nodeCounter, toolId: "remove-bg", params: {}, file: null, fileUrl: "", resultUrl: "" },
]);
const running = ref(false);
const fileInputs = ref({});

function toolName(id) { return tools.find(t => t.id === id)?.name || id; }

function addNode() {
  const lastTool = nodes.value[nodes.value.length - 1]?.toolId || "upscale";
  nodes.value.push({ id: ++nodeCounter, toolId: lastTool, params: {}, file: null, fileUrl: "", resultUrl: "" });
}

function removeNode(idx) {
  nodes.value.splice(idx, 1);
}

function triggerUpload(idx) {
  const existing = document.getElementById("wf-upload-" + idx);
  if (existing) { existing.click(); return; }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.id = "wf-upload-" + idx;
  input.className = "hidden";
  input.onchange = (e) => {
    const f = e.target?.files?.[0];
    if (!f) return;
    nodes.value[idx].file = f;
    const reader = new FileReader();
    reader.onload = (ev) => { nodes.value[idx].fileUrl = ev.target.result; };
    reader.readAsDataURL(f);
  };
  document.body.appendChild(input);
  input.click();
}

async function runWorkflow() {
  if (!store.isLoggedIn) { ElMessage.warning("请先登录"); router.push("/login"); return; }
  const firstNode = nodes.value[0];
  if (!firstNode.file) { ElMessage.warning("请先上传图片"); return; }
  if (nodes.value.some(n => !n.toolId)) { ElMessage.warning("请选择所有步骤的功能"); return; }

  running.value = true;

  try {
    let currentFile = firstNode.file;
    for (let i = 0; i < nodes.value.length; i++) {
      const node = nodes.value[i];
      ElMessage.info(`正在执行第 ${i + 1} 步：${toolName(node.toolId)}`);

      const formData = new FormData();
      formData.append("image", currentFile);
      formData.append("type", node.toolId);
      formData.append("stylePrompt", node.params.stylePrompt || "");
      formData.append("bgColor", node.params.bgColor || "#ffffff");

      const res = await axios.post("/api/image/process", formData, {
        headers: { Authorization: "Bearer " + store.token, "Content-Type": "multipart/form-data" }
      });

      const taskId = res.data.taskId;
      // 轮询
      const result = await pollTask(taskId);
      if (!result) throw new Error("第 " + (i + 1) + " 步处理失败");

      if (i === 0) node.resultUrl = "处理中...";
      if (i === nodes.value.length - 1) {
        node.resultUrl = "/api/image/preview/" + taskId + "?token=" + store.token;
        lastResultId.value = taskId;
      }

      // 下载中间结果作为下一步输入
      if (i < nodes.value.length - 1) {
        const imgRes = await fetch("/api/image/download/" + taskId + "?token=" + store.token);
        const blob = await imgRes.blob();
        currentFile = new File([blob], "step_" + i + ".png", { type: blob.type });
      }
    }

    const me = await axios.get("/api/auth/me", { headers: { Authorization: "Bearer " + store.token } });
    store.updateCredits(me.data.credits);
    ElMessage.success("工作流执行完成！");
  } catch (e) {
    ElMessage.error(e.response?.data?.error || e.message || "工作流执行失败");
  } finally {
    running.value = false;
  }
}

const lastResultId = ref("");

async function pollTask(taskId) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await axios.get("/api/image/task/" + taskId, {
        headers: { Authorization: "Bearer " + store.token }
      });
      if (res.data.status === "completed") return true;
      if (res.data.status === "failed") return false;
    } catch (e) { /* retry */ }
  }
  return false;
}

async function downloadWorkflowResult() {
  if (!lastResultId.value) return;
  try {
    const res = await fetch("/api/image/download/" + lastResultId.value + "?token=" + store.token);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workflow_result.png";
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { ElMessage.error("下载失败"); }
}
</script>
