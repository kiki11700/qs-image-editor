html = r"""<div class="modal" id="am"><div class="mb">
<div id="lf"><h2>👋 欢迎回来</h2><p class="su">登录使用 AI 修图</p>
<div class="f"><label>用户名</label><input id="lu" placeholder="输入用户名"></div>
<div class="f"><label>密码</label><input id="lp" type="password" placeholder="输入密码"></div>
<div class="er" id="le"></div><button class="bp3" onclick="login()">登录</button>
<p class="sw">还没有账号？<a onclick="sa('reg')">立即注册，送8次免费额度</a></p></div>
<div id="rf" style="display:none"><h2>🎉 注册送8次</h2><p class="su">新用户赠送8次额度</p>
<div class="f"><label>用户名</label><input id="ru" placeholder="设置用户名"></div>
<div class="f"><label>邮箱</label><input id="re" placeholder="your@email.com"></div>
<div class="f"><label>密码</label><input id="rp" type="password" placeholder="至少6位"></div>
<div class="er" id="rre"></div><button class="bp3" onclick="reg()">注册领取8次免费额度</button>
<p class="sw">已有账号？<a onclick="sa('login')">去登录</a></p></div>
</div></div>
<div class="modal" id="pm"><div class="mb">
<h2>💰 充值额度</h2><p class="su">选择套餐充值</p><div class="pk" id="pl"></div>
<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">支付方式</label>
<div class="ch"><div class="c act" onclick="sc(this)">📱 支付宝</div><div class="c" onclick="sc(this)">💚 微信</div></div>
<button class="bp3" onclick="co()">立即支付</button>
<div class="re"><div class="rr"><input id="ci" placeholder="输入兑换码"><button onclick="rd()">兑换</button></div></div>
<p class="sw"><a onclick="cp()" style="cursor:pointer">关闭</a></p>
</div></div>
<script>
var A="",T=localStorage.getItem("T"),ST=null,CF=null,LT=null;
var PK=[{id:"p10",c:10,p:9.9},{id:"p30",c:30,p:25},{id:"p100",c:100,p:68},{id:"p500",c:500,p:258}];
var SP="p30",SC="alipay";
var TN={upscale:"转高清",upscale4k:"转4K",vectorize:"转矢量","remove-bg":"抠图去底","replace-bg":"换背景","style-transfer":"转风格",similar:"出类似图"};
function $(i){return document.getElementById(i)}
function S(e){e.style.display=""}
function H(e){e.style.display="none"}
function TT(m,t){var o=$("tt");o.textContent=m;o.className="toast sh2 "+(t||"in");setTimeout(function(){o.classList.remove("sh2")},2500)}
function sa(f){$("am").classList.add("sh");$("lf").style.display=f==="login"?"block":"none";$("rf").style.display=f==="reg"?"block":"none";$("le").style.display="none";$("rre").style.display="none"}
function ca(){$("am").classList.remove("sh")}
$("am").onclick=function(e){if(e.target===this)ca()}
async function login(){var u=$("lu").value.trim(),p=$("lp").value,e=$("le");if(!u||!p){e.textContent="请填写完整";e.style.display="block";return}
try{var r=await fetch(A+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,password:p})});var d=await r.json();if(!r.ok){e.textContent=d.error;e.style.display="block";return}
T=d.token;localStorage.setItem("T",T);ca();RH();LH();TT("登录成功","ok")}catch(e){e.textContent="网络错误";e.style.display="block"}}
async function reg(){var u=$("ru").value.trim(),em=$("re").value.trim(),p=$("rp").value,er=$("rre");if(!u||!em||!p){er.textContent="请填写完整";er.style.display="block";return}if(p.length<6){er.textContent="密码至少6位";er.style.display="block";return}
try{var r=await fetch(A+"/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,email:em,password:p})});var d=await r.json();if(!r.ok){er.textContent=d.error;er.style.display="block";return}
T=d.token;localStorage.setItem("T",T);ca();RH();LH();TT(d.message,"ok")}catch(e){er.textContent="网络错误";er.style.display="block"}}
function lo(){T=null;localStorage.removeItem("T");RH();TT("已退出","in")}
function RH(){var r=$("hr");if(!T){r.innerHTML='<button class="b bw" onclick="sa('+"'login'"+')">登录 / 注册</button>';return}
fetch(A+"/api/auth/me",{headers:{"Authorization":"Bearer "+T}}).then(function(res){return res.json()}).then(function(u){r.innerHTML='<span class="credits">🎯 '+u.credits+' 次</span><button class="b bp" onclick="sp()">充值</button><button class="b bw" onclick="lo()">退出</button>'})}
function sl(el){document.querySelectorAll(".t").forEach(function(c){c.classList.remove("act")});el.classList.add("act");ST=el.getAttribute("data-t");$("pb2").disabled=!CF;
$("so").style.display=ST==="style-transfer"?"block":"none";$("bo").style.display=ST==="replace-bg"?"block":"none";$("ex").classList.toggle("sh",ST==="style-transfer"||ST==="replace-bg")}
$("fi").onchange=function(){var f=this.files[0];if(!f)return;CF=f;var s=f.size/1024/1024;$("fi2").textContent="📄 "+f.name+" ("+s.toFixed(1)+"MB)";$("fi2").style.display="block";$("pb2").disabled=!ST;
var r=new FileReader();r.onload=function(e){$("oi").src=e.target.result;$("oi").style.display="";H($("op"));$("pr").classList.add("sh");$("ri").style.display="none";S($("rp"))};r.readAsDataURL(f)}
$("upArea").ondragover=function(e){e.preventDefault();this.classList.add("dragover")}
$("upArea").ondragleave=function(e){e.preventDefault();this.classList.remove("dragover")}
$("upArea").ondrop=function(e){e.preventDefault();this.classList.remove("dragover");var f=e.dataTransfer.files[0];if(f){$("fi").files=e.dataTransfer.files;$("fi").onchange()}}
async function pi(){if(!ST){TT("请先选择功能","er");return}if(!CF){TT("请先上传图片","er");return}if(!T){TT("请先登录","er");return}
var b=$("pb2");b.classList.add("lo");b.disabled=true;var fd=new FormData();fd.append("image",CF);fd.append("type",ST);
if(ST==="style-transfer")fd.append("stylePrompt",$("ss").value);if(ST==="replace-bg")fd.append("bgColor",$("bc").value);
try{var r=await fetch(A+"/api/image/process",{method:"POST",headers:{"Authorization":"Bearer "+T},body:fd});var d=await r.json();if(!r.ok){b.classList.remove("lo");b.disabled=false;TT(d.error,"er");return}
TT("任务已提交","in");pl(d.taskId)}catch(e){b.classList.remove("lo");b.disabled=false;TT("请求失败:"+e.message,"er")}}
function pl(tid){var n=0;var fn=async function(){try{var r=await fetch(A+"/api/image/task/"+tid,{headers:{"Authorization":"Bearer "+T}});var d=await r.json();
if(d.status==="completed"){LT=tid;$("ri").src=A+"/api/image/download/"+tid+"?token="+encodeURIComponent(T);$("ri").style.display="";H($("rp"));$("db").style.display="inline-block";$("pr").classList.add("sh");
$("pb2").classList.remove("lo");$("pb2").disabled=false;TT("处理完成！","ok");RH();LH();return}
if(d.status==="failed"){$("pb2").classList.remove("lo");$("pb2").disabled=false;TT("处理失败，额度已退还","er");RH();return}
n++;if(n<60)setTimeout(fn,2000);else{$("pb2").classList.remove("lo");$("pb2").disabled=false;TT("超时","er")}}catch(e){n++;if(n<60)setTimeout(fn,2000)}};setTimeout(fn,1500)}
function dd(){if(!LT){TT("无处理结果","er");return}
var u=A+"/api/image/download/"+LT+"?token="+encodeURIComponent(T);
var x=new XMLHttpRequest();x.open("GET",u,true);x.responseType="blob";
x.onload=function(){var b=x.response;var url=URL.createObjectURL(b);var a=document.createElement("a");a.href=url;a.download="result.svg";document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url)},1000)};
x.onerror=function(){TT("下载失败","er")};x.send()}
$("db").onclick=dd;
async function LH(){if(!T)return;try{var r=await fetch(A+"/api/image/tasks",{headers:{"Authorization":"Bearer "+T}});if(!r.ok)return;var ts=await r.json();var l=$("hl");
if(!ts||ts.length===0){l.innerHTML="<div style=\"text-align:center;color:#999;padding:16px;font-size:13px\">暂无记录</div>";return}
var h="";for(var i=0;i<ts.length;i++){var t=ts[i];var lb=TN[t.type]||t.type;var st=t.status==="completed"?"已完成":t.status==="processing"?"处理中":"失败";var sc=t.status==="completed"?"ba bad":t.status==="processing"?"ba bai":"ba baf";
var dl=t.outputUrl?"<a href=\""+t.outputUrl+"?token="+encodeURIComponent(T)+"\" target=\"_blank\" style=\"margin-left:8px;color:#667eea;text-decoration:none\">📥 下载</a>":"";
h+="<div class=\"hi-item\"><div><strong>"+lb+"</strong><span style=\"color:#999;margin-left:6px;font-size:11px\">"+new Date(t.createdAt).toLocaleString()+"</span></div><div><span class=\""+sc+"\">"+st+"</span>"+dl+"</div></div>"}
l.innerHTML=h}catch(e){}}
function sp(){$("pm").classList.add("sh");RP()}
function cp(){$("pm").classList.remove("sh")}
$("pm").onclick=function(e){if(e.target===this)cp()}
function RP(){var h="";PK.forEach(function(p){h+="<div class=\"pkg"+(p.id===SP?" act":"")+"\" onclick=\"SP='"+p.id+"';RP()\"><div class=\"cr\">"+p.c+"次</div><div class=\"pr2\">¥"+p.p+"</div></div>"});$("pl").innerHTML=h}
function sc(el){document.querySelectorAll(".c").forEach(function(c){c.classList.remove("act")});el.classList.add("act");SC=el.textContent.includes("支付宝")?"alipay":"wxpay"}
async function co(){if(!T){TT("请先登录","er");return}
try{var r=await fetch(A+"/api/payment/create-order",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+T},body:JSON.stringify({packageId:SP,channel:SC})});var d=await r.json();if(!r.ok){TT(d.error,"er");return}
await fetch(A+"/api/payment/notify",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"orderId="+d.orderId+"&tradeNo=mock_"+Date.now()});
TT("充值成功！获得 "+d.credits+" 次","ok");cp();RH()}catch(e){TT("充值失败","er")}}
async function rd(){var c=$("ci").value.trim();if(!c){TT("请输入兑换码","er");return}if(!T){TT("请先登录","er");return}
try{var r=await fetch(A+"/api/payment/redeem",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+T},body:JSON.stringify({code:c})});var d=await r.json();if(!r.ok){TT(d.error,"er");return}
TT(d.message,"ok");$("ci").value="";RH()}catch(e){TT("兑换失败","er")}}
if(T){RH();LH()}else{RH()}
document.onkeydown=function(e){if(e.key==="Escape"){ca();cp()}}
$("lp").onkeydown=function(e){if(e.key==="Enter")login()}
$("pb2").onclick=pi
</script>
</body>
</html>
"""
with open(r"C:\Users\LG\Documents\Codex\2026-06-05\new-chat\ai-image-editor\public\index.html", "a", encoding="utf-8") as f:
    f.write(html)
print("Full HTML written, checking...")
with open(r"C:\Users\LG\Documents\Codex\2026-06-05\new-chat\ai-image-editor\public\index.html", "r", encoding="utf-8") as f:
    c = f.read()
print("Length:", len(c))
print("Has DOCTYPE:", c.startswith("<!DOCTYPE"))
print("Has </html>:", c.strip().endswith("</html>"))
print("Has <script>:", "<script>" in c)
