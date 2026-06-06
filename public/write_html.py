import sys
html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AI 修图</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f7fb;color:#1a1a2e}
.header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.logo{font-size:20px;font-weight:700}.right{display:flex;align-items:center;gap:12px;font-size:14px}
.right .credits{background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-weight:600}
.b{border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px;font-weight:600}
.bw{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff}.bw:hover{background:rgba(255,255,255,.25)}
.bp{background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff}
.main{max-width:1100px;margin:0 auto;padding:24px 16px}
.tools{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.t{border:2px solid #eee;border-radius:14px;padding:16px;text-align:center;cursor:pointer;transition:.2s;background:#fff}
.t:hover{border-color:#667eea;box-shadow:0 4px 12px rgba(102,126,234,.1)}.t.act{border-color:#667eea;background:rgba(102,126,234,.05)}
.t .i{font-size:28px;margin-bottom:6px}.t .n{font-size:14px;font-weight:700}.t .d{font-size:11px;color:#888;margin-top:2px}
.fb{display:inline-block;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;margin-left:4px}
.up{border:2px dashed #ddd;border-radius:14px;padding:32px;text-align:center;cursor:pointer;transition:.2s;background:#fff;margin-bottom:16px}
.up:hover,.up.dragover{border-color:#667eea}.up .i{font-size:36px}.up .t{font-size:15px;font-weight:600}.up .h{font-size:12px;color:#999;margin-top:4px}
.pr{display:none;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}.pr.sh{display:grid}
.pb{background:#fff;border-radius:12px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.pb h3{font-size:13px;color:#666;margin-bottom:8px}
.pb .w{background:#f5f5f5;border-radius:8px;min-height:150px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.pb .w img{max-width:100%;max-height:300px;display:none}.pb .w .ph{color:#999;font-size:13px}
.ex{display:none;background:#fff;border-radius:12px;padding:16px;margin-bottom:16px}.ex.sh{display:block}
.ex label{font-size:13px;font-weight:600;display:block;margin-bottom:6px}
.ex select,.ex input[type=text]{width:100%;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px;outline:none}
.ex select:focus,.ex input:focus{border-color:#667eea}
.pw{text-align:center;margin-bottom:20px}
.bp2{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;padding:12px 40px;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;transition:.2s}
.bp2:hover{box-shadow:0 6px 20px rgba(102,126,234,.3)}.bp2:disabled{opacity:.5;cursor:default}.bp2.lo{opacity:.7}
.sp{display:inline-block;width:18px;height:18px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:s .8s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes s{to{transform:rotate(360deg)}}
.dw{text-align:center;margin-top:8px}.bd{background:#667eea;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:13px;display:none}
.hi{background:#fff;border-radius:12px;padding:16px}.hi h3{font-size:15px;margin-bottom:12px}
.hl{max-height:260px;overflow-y:auto}.hi-item{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f8f9ff;border-radius:8px;font-size:12px;margin-bottom:6px}
.ba{padding:2px 8px;border-radius:10px;font-size:11px}.bad{background:#e8f5e9;color:#2e7d32}.bai{background:#fff3e0;color:#e65100}.baf{background:#fbe9e7;color:#c62828}
.mo{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;justify-content:center;align-items:center}.mo.sh{display:flex}
.mb{background:#fff;border-radius:16px;padding:32px;width:400px;max-width:90vw}
.mb h2{font-size:22px;text-align:center;margin-bottom:6px}.mb .su{color:#888;text-align:center;font-size:13px;margin-bottom:20px}
.mb .f{margin-bottom:14px}.mb .f label{display:block;font-size:12px;font-weight:600;margin-bottom:4px}
.mb .f input{width:100%;padding:9px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;outline:none}
.mb .f input:focus{border-color:#667eea}.mb .bp3{width:100%;padding:11px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer}
.mb .sw{text-align:center;margin-top:12px;font-size:13px;color:#888}.mb .sw a{color:#667eea;cursor:pointer;font-weight:600}
.mb .er{color:#e74c3c;font-size:12px;text-align:center;display:none;margin-top:6px}
.pk{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.pkg{border:2px solid #eee;border-radius:10px;padding:12px;text-align:center;cursor:pointer}
.pkg.act{border-color:#667eea}.pkg .pr2{font-size:22px;font-weight:700;color:#667eea}.pkg .cr{font-size:13px}
.ch{display:flex;gap:10px;margin-bottom:14px}.c{flex:1;padding:10px;border:2px solid #eee;border-radius:8px;text-align:center;cursor:pointer;font-weight:600}
.c.act{border-color:#667eea}
.re{margin-top:12px;padding-top:12px;border-top:1px solid #eee}.rr{display:flex;gap:8px}
.rr input{flex:1;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px}
.rr button{padding:8px 16px;background:#27ae60;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:10px;font-size:13px;z-index:300;opacity:0;transition:.3s;pointer-events:none;color:#fff}
.toast.sh2{opacity:1}.toast.ok{background:#27ae60}.toast.er{background:#e74c3c}.toast.in{background:#333}
@media(max-width:640px){.pr.sh{grid-template-columns:1fr}.tools{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<div class="header"><div class="logo">✨ AI 修图</div><div class="right" id="hr"></div></div>
<div class="main">
<div style="margin-bottom:16px"><h1 style="font-size:22px">选择功能</h1><p style="color:#888;font-size:13px">AI 智能处理</p></div>
<div class="tools" id="tools">
<div class="t" data-t="upscale" onclick="sl(this)"><div class="i">🖼️</div><div class="n">转高清<span class="fb">试用</span></div><div class="d">AI 增强画质</div></div>
<div class="t" data-t="upscale4k" onclick="sl(this)"><div class="i">📺</div><div class="n">转4K</div><div class="d">极致超清</div></div>
<div class="t" data-t="vectorize" onclick="sl(this)"><div class="i">📐</div><div class="n">转矢量</div><div class="d">位图转SVG</div></div>
<div class="t" data-t="remove-bg" onclick="sl(this)"><div class="i">✂️</div><div class="n">抠图去底</div><div class="d">AI去背景</div></div>
<div class="t" data-t="replace-bg" onclick="sl(this)"><div class="i">🎨</div><div class="n">换背景</div><div class="d">自定义颜色</div></div>
<div class="t" data-t="style-transfer" onclick="sl(this)"><div class="i">🌈</div><div class="n">转风格</div><div class="d">动漫/油画等</div></div>
<div class="t" data-t="similar" onclick="sl(this)"><div class="i">🔄</div><div class="n">出类似图</div><div class="d">AI二次创作</div></div>
</div>
<div class="up" id="upArea" onclick="document.getElementById('fi').click()">
<div class="i">📤</div><div class="t">点击或拖拽上传</div><div class="h">JPG/PNG/WebP 最大100MB</div>
<div id="fi2" style="display:none;margin-top:8px;padding:8px;background:#f8f9ff;border-radius:8px;font-size:12px;color:#555"></div></div>
<input type="file" id="fi" accept="image/*" style="display:none">
<div class="ex" id="ex">
<div id="so" style="display:none"><label>风格</label><select id="ss"><option>动漫风格</option><option>油画风格</option><option>水彩风格</option><option>素描风格</option><option>赛博朋克</option><option>像素风格</option></select></div>
<div id="bo" style="display:none"><label>背景色</label><input type="color" id="bc" value="#ffffff" style="width:60px;height:36px;padding:2px"></div></div>
<div class="pr" id="pr">
<div class="pb"><h3>📷 原图</h3><div class="w"><img id="oi"><div class="ph" id="op">等待上传...</div></div></div>
<div class="pb"><h3>✅ 结果</h3><div class="w"><img id="ri"><div class="ph" id="rp">等待处理...</div></div><div class="dw"><button class="bd" id="db">📥 下载</button></div></div></div>
<div class="pw"><button class="bp2" id="pb2" disabled>🚀 开始处理</button></div>
<div class="hi"><h3>📋 记录</h3><div class="hl" id="hl"><div style="text-align:center;color:#999;padding:16px;font-size:13px">暂无记录</div></div></div></div>
<div class="toast" id="tt"></div>
"""
with open(sys.argv[1], "a", encoding="utf-8") as f:
    f.write(html)
print("HTML body written")
