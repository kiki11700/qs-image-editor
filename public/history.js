// ========== History ==========
async function loadHistory() {
  if (!token) return;
  try {
    const res = await fetch(API_BASE + '/api/image/tasks', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    const tasks = await res.json();
    const list = document.getElementById('historyList');
    if (tasks.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:#999;padding:20px;font-size:14px;">暂无处理记录</div>';
      return;
    }
    const typeNames = { upscale: '转高清', upscale4k: '转4K', vectorize: '转矢量', 'remove-bg': '抠图去底', 'replace-bg': '更换背景', 'style-transfer': '转风格', similar: '出类似图' };
    list.innerHTML = tasks.map(t => \`
      <div class="history-item">
        <div>
          <strong>\${typeNames[t.type] || t.type}</strong>
          <span style="color:#999;margin-left:8px;font-size:12px;">\${new Date(t.createdAt).toLocaleString()}</span>
        </div>
        <div>
          <span class="status \${t.status}">\${t.status === 'completed' ? '已完成' : t.status === 'processing' ? '处理中' : '失败'}</span>
          \${t.outputUrl ? '<a href="' + t.outputUrl + '" download style="margin-left:8px;">📥 下载</a>' : ''}
        </div>
      </div>
    \`).join('');
  } catch(e) {}
}
