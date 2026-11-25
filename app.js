(function(){
"use strict";
const LS_KEY="solop-gia-su-v1";
const S={students:{},lessons:{},payments:{},groups:{},settings:{chargeUnexcused:false},settingsBy:{}};
let mode="loading", tab="overview";
let feeMonth=thisMonth(), lessonMonth="all", attMonth=thisMonth(), attClass="", feeView="month";

/* ---------- tiện ích ---------- */
function $(s){return document.querySelector(s)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function money(n){return (Math.round(n||0)).toLocaleString("vi-VN")+"đ"}
function todayStr(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function thisMonth(){return todayStr().slice(0,7)}
function monthLabel(m){const [y,mo]=m.split("-");return "Tháng "+Number(mo)+"/"+y}
function newId(){return (crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9-]/g,"")}
const WD=["CN","T2","T3","T4","T5","T6","T7"];
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
function byName(a,b){return (a.name||"").localeCompare(b.name||"","vi")}
function studentsArr(){return Object.entries(S.students).map(([id,s])=>({id,...s})).sort(byName)}
function lessonsArr(){return Object.entries(S.lessons).map(([id,l])=>({id,...l})).sort((a,b)=>(b.date+(b.time||"")).localeCompare(a.date+(a.time||"")))}
const MODE={off:"Offline",on:"Online"};
function groupsArr(){return Object.entries(S.groups||{}).map(([id,g])=>({id,...g})).sort((a,b)=>(a.subject||"").localeCompare(b.subject||"","vi")||byName(a,b))}
function groupsOf(sid){return groupsArr().filter(g=>(g.memberIds||[]).includes(sid))}
function inGroup(sid,gid){const g=S.groups[gid];return !!g&&(g.memberIds||[]).includes(sid)}
function subjects(){return [...new Set(["Tiếng Anh","Toán",...Object.values(S.groups).map(g=>g.subject).filter(Boolean)])]}
function groupFee(g,mode){return Number(mode==="on"?g.feeOnline:g.feeOffline)||0}
function lessonGroupName(l){const g=S.groups[l.groupId];return g?g.name:(l.className||"")}
function lessonSubject(l){const g=S.groups[l.groupId];return (g&&g.subject)||l.subject||""}
function groupOptions(sel,allLabel){
  const bySub={};groupsArr().forEach(g=>{(bySub[g.subject||"Khác"]=bySub[g.subject||"Khác"]||[]).push(g)});
  return `<option value="">${allLabel}</option>`+Object.entries(bySub).map(([sub,gs])=>`<optgroup label="${esc(sub)}">${gs.map(g=>`<option value="${esc(g.id)}" ${g.id===sel?"selected":""}>${esc(g.name)}</option>`).join("")}</optgroup>`).join("");
}

/* ---------- lưu trữ trên máy chủ (Supabase) ---------- */
const CFG=window.SOLOP_CONFIG;
const sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let me=null;
const PARENT_DOMAIN="@phuhuynh.solop.local";
function normPhone(p){return String(p||"").replace(/\D/g,"").replace(/^84/,"0")}

function att2model(rows){const m={};rows.forEach(a=>{m[a.student_id]={st:a.status,done:a.done||[],fee:a.fee,cmt:a.comment||""}});return m}
async function loadAll(){
  const q=t=>sb.from(t).select("*");
  const res=await Promise.all([q("students"),q("groups"),q("group_members"),q("lessons"),q("attendance"),q("payments"),q("settings")]);
  const bad=res.find(r=>r.error);if(bad)throw bad.error;
  const [st,gr,gm,ls,at,pa,se]=res.map(r=>r.data||[]);
  S.students={};st.forEach(r=>{S.students[r.id]={name:r.name,parentName:r.parent_name,phone:r.phone,note:r.note,active:r.active,parentId:r.parent_id,tutorId:r.tutor_id,createdAt:r.created_at}});
  const mem={};gm.forEach(m=>{(mem[m.group_id]=mem[m.group_id]||[]).push(m.student_id)});
  S.groups={};gr.forEach(r=>{S.groups[r.id]={name:r.name,subject:r.subject,feeOffline:r.fee_offline,feeOnline:r.fee_online,note:r.note,memberIds:mem[r.id]||[],createdAt:r.created_at}});
  const attBy={};at.forEach(a=>{(attBy[a.lesson_id]=attBy[a.lesson_id]||[]).push(a)});
  S.lessons={};ls.forEach(r=>{S.lessons[r.id]={date:r.date,time:r.time,groupId:r.group_id||"",className:r.group_name,subject:r.subject,mode:r.mode,content:r.content,homework:r.homework_note,hwItems:r.hw_items||[],attendance:att2model(attBy[r.id]||[]),tutorId:r.tutor_id,updatedAt:r.updated_at}});
  S.payments={};pa.forEach(p=>{S.payments[p.student_id+"_"+p.month]={studentId:p.student_id,month:p.month,paid:p.paid,amount:p.amount,paidDate:p.paid_date||""}});
  S.settingsBy={};se.forEach(x=>{S.settingsBy[x.tutor_id]={chargeUnexcused:x.charge_unexcused,bankBin:x.bank_bin||"",accNo:x.acc_no||"",accName:x.acc_name||"",noteStyle:x.note_style||"name"}});
  S.settings=S.settingsBy[me.id]||{chargeUnexcused:false};
}
let writeQueue=Promise.resolve();
function enqueue(fn){writeQueue=writeQueue.then(fn).catch(async e=>{console.error(e);toast("Chưa lưu được: "+(e&&e.message||"lỗi mạng")+". Đang tải lại dữ liệu…");try{await loadAll();render()}catch(_){}});return writeQueue}
function chk(r){if(r&&r.error)throw r.error;return r}
async function persist(coll,id,data,prev){
  if(coll==="settings"){
    chk(await sb.from("settings").upsert({tutor_id:me.id,charge_unexcused:!!data.chargeUnexcused,bank_bin:data.bankBin||null,acc_no:data.accNo||null,acc_name:data.accName||null,note_style:data.noteStyle||"name",updated_at:new Date().toISOString()}));
  }else if(coll==="students"){
    chk(await sb.from("students").upsert({id,name:data.name,parent_name:data.parentName||"",phone:data.phone||"",note:data.note||"",active:data.active!==false}));
  }else if(coll==="groups"){
    chk(await sb.from("groups").upsert({id,name:data.name,subject:data.subject||"Khác",fee_offline:data.feeOffline||0,fee_online:data.feeOnline||0,note:data.note||""}));
    const want=new Set(data.memberIds||[]),had=new Set((prev&&prev.memberIds)||[]);
    const gone=[...had].filter(x=>!want.has(x)),add=[...want].filter(x=>!had.has(x));
    if(gone.length)chk(await sb.from("group_members").delete().eq("group_id",id).in("student_id",gone));
    if(add.length)chk(await sb.from("group_members").upsert(add.map(sid=>({group_id:id,student_id:sid}))));
  }else if(coll==="lessons"){
    chk(await sb.from("lessons").upsert({id,group_id:data.groupId||null,group_name:data.className||"",subject:data.subject||"",mode:data.mode||"off",date:data.date,time:data.time||"",content:data.content||"",homework_note:data.homework||"",hw_items:data.hwItems||[],updated_at:new Date().toISOString()}));
    const keep=Object.keys(data.attendance||{});
    const gone=Object.keys((prev&&prev.attendance)||{}).filter(x=>!keep.includes(x));
    if(gone.length)chk(await sb.from("attendance").delete().eq("lesson_id",id).in("student_id",gone));
    if(keep.length)chk(await sb.from("attendance").upsert(keep.map(sid=>{const r=data.attendance[sid];return {lesson_id:id,student_id:sid,status:r.st,done:r.done||[],fee:Math.round(r.fee||0),comment:r.cmt||""}})));
  }else if(coll==="payments"){
    chk(await sb.from("payments").upsert({student_id:data.studentId,month:data.month,paid:!!data.paid,amount:Math.round(data.amount||0),paid_date:data.paidDate||null}));
  }
}
function save(coll,id,data){
  const prev=coll==="settings"?S.settings:S[coll][id];
  if(coll==="settings"){S.settings=data;S.settingsBy[me.id]=data}else S[coll][id]=data;
  render();
  return enqueue(()=>persist(coll,id,data,prev));
}
function removeDoc(coll,id){
  delete S[coll][id];render();
  return enqueue(async()=>{
    if(coll==="payments"){const [sid,m]=[id.slice(0,id.lastIndexOf("_")),id.slice(id.lastIndexOf("_")+1)];chk(await sb.from("payments").delete().eq("student_id",sid).eq("month",m))}
    else chk(await sb.from(coll).delete().eq("id",id));
  });
}

/* ---------- tính học phí ---------- */
function feeFor(sid,month,gid){
  const s=S.students[sid]||{};
  let p=0,e=0,u=0,total=0;const items={};
  for(const l of Object.values(S.lessons)){
    if(!l.date||l.date.slice(0,7)!==month)continue;
    if(gid&&l.groupId!==gid)continue;
    const r=(l.attendance||{})[sid];if(!r)continue;
    const fee=Number(r.fee??s.fee??0);
    if(r.st==="p")p++;else if(r.st==="e")e++;else if(r.st==="u")u++;
    if(r.st==="p"||(r.st==="u"&&S.settings.chargeUnexcused)){
      total+=fee;const k=[lessonSubject(l),MODE[l.mode]||"",fee].join("|");items[k]=(items[k]||0)+1;
    }
  }
  return {p,e,u,total,items:Object.entries(items).map(([k,n])=>{const a=k.split("|");return {label:[a[0],a[1]].filter(Boolean).join(" · ")||"Học phí",n,fee:+a[2]}})};
}
function itemsShort(f){return f.items.map(i=>`${esc(i.label)}: ${i.n} × ${Math.round(i.fee/1000)}k`).join("<br>")}

/* ---------- giao diện ---------- */
function setStatus(){
  const el=$("#status");if(!el)return;
  el.textContent=mode==="loading"?"Đang mở sổ…":"Dữ liệu lưu trên máy chủ, mở ở máy nào cũng thấy";
}
function renderBanner(){$("#banner").innerHTML=""}
function armed(btn,label,fn){
  const orig=btn.textContent;let t=null;
  return function(){
    if(btn.classList.contains("armed")){clearTimeout(t);btn.classList.remove("armed");btn.textContent=orig;fn();return}
    btn.classList.add("armed");btn.textContent=label;
    t=setTimeout(()=>{btn.classList.remove("armed");btn.textContent=orig},3500);
  };
}

function render(){
  setStatus();renderBanner();
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===tab)));
  if(mode==="loading"){$("#view").innerHTML=`<div class="empty"><b>Đang mở sổ lớp…</b>Chờ một chút nhé.</div>`;return}
  if(tab==="overview")renderOverview();else if(tab==="lessons")renderLessons();else if(tab==="attendance")renderAttendance();else if(tab==="students")renderStudents();else if(tab==="groups")renderGroups();else if(feeView==="year")renderFeesYear();else renderFees();
}

function renderLessons(){
  const all=lessonsArr();
  const months=[...new Set(all.map(l=>l.date.slice(0,7)))];
  const list=lessonMonth==="all"?all:all.filter(l=>l.date.slice(0,7)===lessonMonth);
  const noStudents=!Object.keys(S.students).length;
  let h=`<div class="bar"><div class="left"><h2>Các buổi học</h2>
    <select id="lessonMonth" style="width:auto"><option value="all">Tất cả các tháng</option>${months.map(m=>`<option value="${m}" ${m===lessonMonth?"selected":""}>${monthLabel(m)}</option>`).join("")}</select></div>
    <button type="button" class="primary" id="addLesson">+ Thêm buổi học</button></div>`;
  if(!list.length){
    h+=`<div class="empty"><b>Chưa có buổi học nào</b>${noStudents?"Hãy thêm học sinh ở tab “Học sinh” trước, rồi quay lại đây để ghi buổi học và điểm danh.":"Bấm “Thêm buổi học” để ghi nội dung, bài tập và điểm danh."}</div>`;
  }else{
    h+=`<div class="list">`+list.map(l=>{
      const d=new Date(l.date+"T00:00:00");
      const recs=Object.values(l.attendance||{});
      const p=recs.filter(r=>r.st==="p").length,e=recs.filter(r=>r.st==="e").length,u=recs.filter(r=>r.st==="u").length;
      return `<div class="card lesson" tabindex="0" data-lesson="${esc(l.id)}">
        <div class="date"><small>${WD[d.getDay()]}</small><b>${d.getDate()}</b><small>Th${d.getMonth()+1}</small></div>
        <div class="body">
          <div class="meta">${lessonGroupName(l)?`<span class="pill acc">${esc(lessonGroupName(l))}</span>`:""}${lessonSubject(l)?`<span class="pill">${esc(lessonSubject(l))}</span>`:""}${l.mode?`<span class="pill ${l.mode==="on"?"on":""}">${MODE[l.mode]}</span>`:""}${l.time?`<span class="pill">${esc(l.time)}</span>`:""}${e?`<span class="pill warn">${e} vắng có phép</span>`:""}${u?`<span class="pill bad">${u} vắng</span>`:""}</div>
          ${l.content?`<p class="clamp"><span class="lbl">Nội dung:</span>${esc(l.content)}</p>`:""}
          ${(l.hwItems||[]).length?`<p class="clamp"><span class="lbl">BTVN:</span>${(l.hwItems||[]).map((h,i)=>esc((i+1)+". "+(h.title||"Bài "+(i+1)))+(h.link||h.filePath?" 📎":"")).join("  ·  ")}</p>`:""}
          ${l.homework?`<p class="clamp"><span class="lbl">${(l.hwItems||[]).length?"Ghi chú:":"BTVN:"}</span>${esc(l.homework)}</p>`:""}
          ${hwProgress(l)}
          ${!l.content&&!l.homework&&!(l.hwItems||[]).length?`<p class="hint">Chưa ghi nội dung</p>`:""}
        </div>
        <div class="count">${p}/${recs.length}<small>có mặt</small></div>
      </div>`}).join("")+`</div>`;
  }
  $("#view").innerHTML=h;
  $("#addLesson").onclick=()=>openLesson(null);
  $("#lessonMonth").onchange=e=>{lessonMonth=e.target.value;render()};
  document.querySelectorAll("[data-lesson]").forEach(c=>{
    c.onclick=()=>openLesson(c.dataset.lesson);
    c.onkeydown=e=>{if(e.key==="Enter")openLesson(c.dataset.lesson)};
  });
}

function renderStudents(){
  const arr=studentsArr(),m=thisMonth();
  const sections=[];
  groupsArr().forEach(g=>{const list=arr.filter(s=>s.active!==false&&(g.memberIds||[]).includes(s.id));sections.push({title:(g.subject?g.subject+" · ":"")+g.name,list})});
  const none=arr.filter(s=>s.active!==false&&!groupsOf(s.id).length);if(none.length)sections.push({title:"Chưa xếp lớp",list:none});
  const off=arr.filter(s=>s.active===false);if(off.length)sections.push({title:"Đã nghỉ",list:off});
  let h=`<div class="bar"><h2>Học sinh <span class="pill">${arr.filter(s=>s.active!==false).length} đang học</span></h2><button type="button" class="primary" id="addStudent">+ Thêm học sinh</button></div>`;
  if(!arr.length)h+=`<div class="empty"><b>Chưa có học sinh</b>Bấm “Thêm học sinh” để nhập tên và chọn lớp cho em.</div>`;
  for(const sec of sections){
    if(!sec.list.length)continue;
    h+=`<h3>${esc(sec.title)} · ${sec.list.length}</h3><div class="list">`+sec.list.map(s=>{
      const f=feeFor(s.id,m);const gs=groupsOf(s.id);
      return `<div class="card stu ${s.active===false?"inactive":""}" tabindex="0" data-student="${esc(s.id)}">
        <div><div class="name">${esc(s.name)}</div>
        <div class="info">${gs.length?gs.map(g=>esc(g.name)).join(", "):"Chưa xếp lớp"}${s.parentName?" · PH: "+esc(s.parentName):""}${s.phone?" · "+esc(s.phone):""}</div>
        ${s.note?`<div class="info clamp">${esc(s.note)}</div>`:""}</div>
        <div class="count">${f.p} buổi<small>có mặt ${monthLabel(m).toLowerCase()}</small></div>
      </div>`}).join("")+`</div>`;
  }
  $("#view").innerHTML=h;
  $("#addStudent").onclick=()=>openStudent(null);
  document.querySelectorAll("[data-student]").forEach(c=>{
    c.onclick=()=>openStudent(c.dataset.student);
    c.onkeydown=e=>{if(e.key==="Enter")openStudent(c.dataset.student)};
  });
}

/* ---------- lớp học ---------- */
function renderGroups(){
  const gs=groupsArr(),m=thisMonth();
  let h=`<div class="bar"><h2>Lớp học <span class="pill">${gs.length} lớp</span></h2><button type="button" class="primary" id="addGroup">+ Thêm lớp</button></div>`;
  if(!gs.length)h+=`<div class="empty"><b>Chưa có lớp nào</b>Tạo lớp để nhóm các em học chung, chọn môn học và đặt học phí cho buổi offline và online.</div>`;
  const bySub={};gs.forEach(g=>{(bySub[g.subject||"Khác"]=bySub[g.subject||"Khác"]||[]).push(g)});
  for(const [sub,list] of Object.entries(bySub)){
    h+=`<h3>${esc(sub)} · ${list.length} lớp</h3><div class="list">`+list.map(g=>{
      const mem=(g.memberIds||[]).map(id=>S.students[id]).filter(s=>s&&s.active!==false);
      const n=Object.values(S.lessons).filter(l=>l.groupId===g.id&&l.date&&l.date.slice(0,7)===m).length;
      return `<div class="card grp" tabindex="0" data-group="${esc(g.id)}"><div>
        <div class="name">${esc(g.name)}</div>
        <div class="meta" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0"><span class="pill">Offline ${money(g.feeOffline)}/buổi</span><span class="pill on">Online ${money(g.feeOnline)}/buổi</span></div>
        <div class="info">${mem.length?mem.length+" em: "+mem.map(s=>esc(s.name)).join(", "):"Chưa có học sinh"}</div>
        ${g.note?`<div class="info clamp">${esc(g.note)}</div>`:""}
      </div><div class="count">${n} buổi<small>${monthLabel(m).toLowerCase()}</small></div></div>`}).join("")+`</div>`;
  }
  $("#view").innerHTML=h;
  $("#addGroup").onclick=()=>openGroup(null);
  document.querySelectorAll("[data-group]").forEach(c=>{c.onclick=()=>openGroup(c.dataset.group);c.onkeydown=e=>{if(e.key==="Enter")openGroup(c.dataset.group)}});
}
let editingGroup=null;
function openGroup(id){
  editingGroup=id;const g=id?S.groups[id]:null;
  $("#dGroupTitle").textContent=g?"Sửa lớp học":"Thêm lớp học";
  $("#gName").value=g?g.name||"":"";$("#gSubject").value=g?g.subject||"":"Tiếng Anh";
  $("#gFeeOff").value=g?g.feeOffline||"":"";$("#gFeeOn").value=g?g.feeOnline||"":"";$("#gNote").value=g?g.note||"":"";
  $("#subjectList").innerHTML=subjects().map(x=>`<option value="${esc(x)}">`).join("");
  const mem=new Set(g?g.memberIds||[]:[]);
  const st=studentsArr().filter(s=>s.active!==false||mem.has(s.id));
  $("#gMembers").innerHTML=st.length?st.map(s=>`<label><input type="checkbox" value="${esc(s.id)}" ${mem.has(s.id)?"checked":""}>${esc(s.name)}</label>`).join(""):`<span class="hint">Chưa có học sinh. Bạn có thể thêm học sinh sau rồi chọn lớp cho em.</span>`;
  $("#gDelete").hidden=!g;$("#gDelete").classList.remove("armed");$("#gDelete").textContent="Xóa lớp";
  $("#dGroup").showModal();
}
$("#fGroup").addEventListener("submit",e=>{
  e.preventDefault();
  const name=$("#gName").value.trim();if(!name){toast("Hãy nhập tên lớp");return}
  const old=editingGroup?S.groups[editingGroup]:null;
  const data={name,subject:$("#gSubject").value.trim()||"Khác",feeOffline:Number($("#gFeeOff").value||0),feeOnline:Number($("#gFeeOn").value||0),note:$("#gNote").value.trim(),memberIds:[...$("#gMembers").querySelectorAll("input:checked")].map(i=>i.value),createdAt:old&&old.createdAt||new Date().toISOString()};
  if(old&&old.sample)data.sample=true;
  save("groups",editingGroup||newId(),data);
  $("#dGroup").close();toast("Đã lưu lớp");
});
$("#gDelete").onclick=armed($("#gDelete"),"Bấm lần nữa để xóa",()=>{removeDoc("groups",editingGroup);$("#dGroup").close();toast("Đã xóa lớp. Các buổi học cũ vẫn được giữ.")});

function renderFees(){
  const m=feeMonth;
  const rows=studentsArr().map(s=>({s,f:feeFor(s.id,m),pay:S.payments[s.id+"_"+m]})).filter(r=>r.f.p+r.f.e+r.f.u>0||(r.s.active!==false));
  let due=0,paid=0;rows.forEach(r=>{due+=r.f.total;if(r.pay&&r.pay.paid)paid+=r.f.total});
  let h=`<div class="bar"><div class="left"><h2>Học phí</h2>${feeToggle()}<input type="month" id="feeMonth" value="${m}" style="width:auto"></div>
    <label class="check"><input type="checkbox" id="chargeU" ${S.settings.chargeUnexcused?"checked":""}> Tính tiền cả buổi vắng không phép</label></div>
    <div class="kpis">
      <div class="kpi"><small>Phải thu ${monthLabel(m).toLowerCase()}</small><b>${money(due)}</b></div>
      <div class="kpi"><small>Đã thu</small><b style="color:var(--ok)">${money(paid)}</b></div>
      <div class="kpi"><small>Còn lại</small><b style="color:${due-paid>0?"var(--warn)":"var(--fg)"}">${money(due-paid)}</b></div>
    </div>
    <div class="card bankcard">${bankLine()}<button type="button" class="small" id="bankEdit">${S.settings.accNo?"Sửa tài khoản":"+ Nhập tài khoản ngân hàng"}</button></div>`;
  if(!rows.length)h+=`<div class="empty"><b>Chưa có dữ liệu học phí</b>Học phí được tính tự động từ điểm danh: số buổi có mặt × học phí mỗi buổi.</div>`;
  else h+=`<div class="tablewrap"><table><thead><tr><th>Học sinh</th><th class="n">Có mặt</th><th class="n">Vắng phép</th><th class="n">Vắng</th><th class="n">Chi tiết</th><th class="n">Thành tiền</th><th>Đã thu?</th><th></th></tr></thead><tbody>`+
    rows.map(r=>`<tr>
      <td><b>${esc(r.s.name)}</b>${groupsOf(r.s.id).length?`<br><span class="status">${groupsOf(r.s.id).map(g=>esc(g.name)).join(", ")}</span>`:""}</td>
      <td class="n">${r.f.p}</td><td class="n">${r.f.e}</td><td class="n">${r.f.u}</td>
      <td class="n status" style="white-space:nowrap">${itemsShort(r.f)||"–"}</td><td class="n"><b>${money(r.f.total)}</b></td>
      <td>${r.f.total>0?`<label class="check"><input type="checkbox" data-pay="${esc(r.s.id)}" ${r.pay&&r.pay.paid?"checked":""}> ${r.pay&&r.pay.paid?`<span class="pill ok">Đã thu${r.pay.paidDate?" "+esc(r.pay.paidDate.split("-").reverse().slice(0,2).join("/")):""}</span>`:`<span class="pill warn">Chưa thu</span>`}</label>`:`<span class="status">Không có</span>`}</td>
      <td>${r.f.total>0?`<button type="button" class="small" data-msg="${esc(r.s.id)}">Mã QR & tin nhắn</button>`:""}</td>
    </tr>`).join("")+`</tbody><tfoot><tr><td>Tổng cộng</td><td class="n">${rows.reduce((a,r)=>a+r.f.p,0)}</td><td class="n">${rows.reduce((a,r)=>a+r.f.e,0)}</td><td class="n">${rows.reduce((a,r)=>a+r.f.u,0)}</td><td></td><td class="n">${money(due)}</td><td colspan="2"></td></tr></tfoot></table></div>
    <p class="hint" style="margin-top:10px">Học phí = số buổi có mặt × học phí mỗi buổi của lớp (offline hoặc online)${S.settings.chargeUnexcused?" (cộng cả buổi vắng không phép)":""}. Buổi vắng có phép không tính tiền.</p>`;
  $("#view").innerHTML=h;
  $("#feeMonth").onchange=e=>{if(e.target.value){feeMonth=e.target.value;render()}};
  $("#chargeU").onchange=e=>save("settings","main",{...S.settings,chargeUnexcused:e.target.checked});
  document.querySelectorAll("[data-pay]").forEach(c=>c.onchange=()=>{
    const sid=c.dataset.pay,id=sid+"_"+m,f=feeFor(sid,m);
    save("payments",id,{studentId:sid,month:m,paid:c.checked,amount:f.total,paidDate:c.checked?todayStr():""});
  });
  document.querySelectorAll("[data-msg]").forEach(b=>b.onclick=()=>openMsg(b.dataset.msg,m));
  $("#bankEdit").onclick=openBank;
  bindFeeToggle();
}
function feeToggle(){return `<div class="seg2" role="group" aria-label="Kiểu xem"><button type="button" data-fv="month" aria-pressed="${feeView==="month"}">Theo tháng</button><button type="button" data-fv="year" aria-pressed="${feeView==="year"}">Cả năm</button></div>`}
function bindFeeToggle(){document.querySelectorAll("[data-fv]").forEach(b=>b.onclick=()=>{feeView=b.dataset.fv;render()})}
function lessonMonths(){return [...new Set(Object.values(S.lessons).map(l=>(l.date||"").slice(0,7)).filter(Boolean))].sort()}

/* ---------- tổng quan ---------- */
function renderOverview(){
  const m=thisMonth();
  const active=studentsArr().filter(s=>s.active!==false);
  const ls=lessonsArr().filter(l=>l.date.slice(0,7)===m);
  let due=0,paid=0;
  studentsArr().forEach(s=>{const f=feeFor(s.id,m);due+=f.total;const pay=S.payments[s.id+"_"+m];if(pay&&pay.paid)paid+=f.total});
  const unpaid=[];
  lessonMonths().forEach(mm=>studentsArr().forEach(s=>{const f=feeFor(s.id,mm);const pay=S.payments[s.id+"_"+mm];if(f.total>0&&!(pay&&pay.paid))unpaid.push({s,mm,f})}));
  unpaid.sort((a,b)=>a.mm.localeCompare(b.mm)||byName(a.s,b.s));
  let p=0,tot=0;ls.forEach(l=>Object.values(l.attendance||{}).forEach(r=>{tot++;if(r.st==="p")p++}));
  const recent=lessonsArr().slice(0,4);
  let h=`<div class="hero"><div><h2>Chào bạn! Hôm nay là ${WD[new Date().getDay()]==="CN"?"Chủ nhật":"thứ "+(new Date().getDay()+1)}, ${todayStr().split("-").reverse().join("/")}</h2><p class="hint">Tình hình ${monthLabel(m).toLowerCase()} của lớp bạn.</p></div>
    <button type="button" class="primary" id="ovAdd">+ Ghi buổi học hôm nay</button></div>
    <div class="kpis six">
      <div class="kpi"><small>Học sinh đang học</small><b>${active.length}</b></div>
      <div class="kpi"><small>Buổi đã dạy tháng này</small><b>${ls.length}</b></div>
      <div class="kpi"><small>Tỉ lệ đi học</small><b>${tot?Math.round(p/tot*100)+"%":"–"}</b></div>
      <div class="kpi"><small>Học phí tháng này</small><b>${money(due)}</b></div>
      <div class="kpi"><small>Đã thu</small><b style="color:var(--ok)">${money(paid)}</b></div>
      <div class="kpi"><small>Còn phải thu</small><b style="color:${due-paid>0?"var(--warn)":"var(--fg)"}">${money(due-paid)}</b></div>
    </div>
    <div class="two">
      <div class="card"><div class="bar" style="margin:0 0 4px"><h2 style="font-size:1.05rem">Học phí chưa thu</h2><button type="button" class="ghost small" data-go="fees">Xem học phí</button></div>
        ${unpaid.length?unpaid.slice(0,8).map(u=>`<div class="mini"><div class="t"><b>${esc(u.s.name)}</b><small>${monthLabel(u.mm)} · ${u.f.p} buổi</small></div><span class="pill warn">${money(u.f.total)}</span></div>`).join("")+(unpaid.length>8?`<p class="hint">và ${unpaid.length-8} khoản khác…</p>`:""):`<p class="hint" style="padding:10px 0">Không còn khoản nào chưa thu.</p>`}
      </div>
      <div class="card"><div class="bar" style="margin:0 0 4px"><h2 style="font-size:1.05rem">Buổi học gần đây</h2><button type="button" class="ghost small" data-go="lessons">Xem tất cả</button></div>
        ${recent.length?recent.map(l=>{const recs=Object.values(l.attendance||{});return `<div class="mini" style="cursor:pointer" data-lesson="${esc(l.id)}"><div class="t"><b>${l.date.split("-").reverse().slice(0,2).join("/")}${lessonGroupName(l)?" · "+esc(lessonGroupName(l)):""}${l.mode?" · "+MODE[l.mode]:""}</b><small class="clamp" style="-webkit-line-clamp:1">${esc(l.content||"Chưa ghi nội dung")}</small></div><span class="pill ok">${recs.filter(r=>r.st==="p").length}/${recs.length} có mặt</span></div>`}).join(""):`<p class="hint" style="padding:10px 0">Chưa có buổi học nào.</p>`}
      </div>
    </div>`;
  $("#view").innerHTML=h;
  $("#ovAdd").onclick=()=>openLesson(null);
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{tab=b.dataset.go;render()});
  document.querySelectorAll("[data-lesson]").forEach(c=>c.onclick=()=>openLesson(c.dataset.lesson));
}

/* ---------- bảng điểm danh theo tháng ---------- */
function renderAttendance(){
  if(attClass&&!S.groups[attClass])attClass="";
  const inC=s=>!attClass||inGroup(s.id,attClass);
  const ls=lessonsArr().filter(l=>l.date.slice(0,7)===attMonth).reverse()
    .filter(l=>!attClass||l.groupId===attClass);
  const stu=studentsArr().filter(s=>inC(s)&&(s.active!==false||ls.some(l=>(l.attendance||{})[s.id])));
  const sym={p:"✓",e:"P",u:"V"};
  let h=`<div class="bar"><div class="left"><h2>Bảng điểm danh</h2><input type="month" id="attMonth" value="${attMonth}" style="width:auto">
    <select id="attClass" style="width:auto">${groupOptions(attClass,"Tất cả lớp")}</select></div>
    <button type="button" class="primary" id="attAdd">+ Điểm danh buổi mới</button></div>`;
  if(!ls.length||!stu.length){h+=`<div class="empty"><b>Chưa có buổi học nào trong ${monthLabel(attMonth).toLowerCase()}</b>Bấm “Điểm danh buổi mới” để ghi buổi học và điểm danh.</div>`}
  else{
    h+=`<div class="tablewrap"><table class="grid"><thead><tr><th>Học sinh</th>${ls.map(l=>{const d=new Date(l.date+"T00:00:00");return `<th class="d" data-lesson="${esc(l.id)}" title="Mở buổi học: ${esc(lessonGroupName(l))}">${WD[d.getDay()]}<br>${d.getDate()}/${d.getMonth()+1}${l.mode?`<br><span class="pill ${l.mode==="on"?"on":""}" style="padding:0 6px;font-size:.68rem">${l.mode==="on"?"On":"Off"}</span>`:""}</th>`}).join("")}<th>Có mặt</th><th>Phép</th><th>Vắng</th><th>Học phí</th></tr></thead><tbody>`+
    stu.map(s=>{const f=feeFor(s.id,attMonth,attClass);return `<tr><td><b>${esc(s.name)}</b></td>${ls.map(l=>{const r=(l.attendance||{})[s.id];return `<td><span class="cell ${r?r.st:"n"}">${r?sym[r.st]:"·"}</span></td>`}).join("")}<td><b>${f.p}</b></td><td>${f.e}</td><td>${f.u}</td><td style="white-space:nowrap"><b>${money(f.total)}</b></td></tr>`}).join("")+
    `</tbody></table></div>
    <div class="legend"><span><span class="cell p">✓</span>Có mặt</span><span><span class="cell e">P</span>Vắng có phép</span><span><span class="cell u">V</span>Vắng không phép</span><span><span class="cell n">·</span>Không học buổi này</span><span>Bấm vào ngày để sửa buổi học</span></div>`;
  }
  $("#view").innerHTML=h;
  $("#attMonth").onchange=e=>{if(e.target.value){attMonth=e.target.value;render()}};
  $("#attClass").onchange=e=>{attClass=e.target.value;render()};
  $("#attAdd").onclick=()=>openLesson(null,attClass);
  document.querySelectorAll("[data-lesson]").forEach(c=>c.onclick=()=>openLesson(c.dataset.lesson));
}

/* ---------- học phí cả năm ---------- */
function renderFeesYear(){
  const y=feeMonth.slice(0,4);
  const months=Array.from({length:12},(_,i)=>y+"-"+String(i+1).padStart(2,"0"));
  const rows=studentsArr().map(s=>({s,cells:months.map(m=>({m,f:feeFor(s.id,m),pay:S.payments[s.id+"_"+m]}))})).filter(r=>r.s.active!==false||r.cells.some(c=>c.f.total>0));
  let due=0,paid=0;rows.forEach(r=>r.cells.forEach(c=>{due+=c.f.total;if(c.pay&&c.pay.paid)paid+=c.f.total}));
  let h=`<div class="bar"><div class="left"><h2>Học phí</h2>${feeToggle()}
    <select id="feeYear" style="width:auto">${[+y-1,+y,+y+1].map(v=>`<option ${String(v)===y?"selected":""}>${v}</option>`).join("")}</select></div></div>
    <div class="kpis"><div class="kpi"><small>Phải thu năm ${y}</small><b>${money(due)}</b></div><div class="kpi"><small>Đã thu</small><b style="color:var(--ok)">${money(paid)}</b></div><div class="kpi"><small>Còn lại</small><b style="color:${due-paid>0?"var(--warn)":"var(--fg)"}">${money(due-paid)}</b></div></div>`;
  if(!rows.length)h+=`<div class="empty"><b>Chưa có học sinh</b>Thêm học sinh ở tab “Học sinh” trước nhé.</div>`;
  else h+=`<div class="tablewrap"><table class="grid"><thead><tr><th>Học sinh</th>${months.map(m=>`<th>Th${Number(m.slice(5))}</th>`).join("")}</tr></thead><tbody>`+
    rows.map(r=>`<tr><td><b>${esc(r.s.name)}</b></td>${r.cells.map(c=>c.f.total>0?`<td><button type="button" class="ycell ${c.pay&&c.pay.paid?"paid":"due"}" data-ys="${esc(r.s.id)}" data-ym="${c.m}" title="Bấm để đổi Đã thu / Chưa thu">${Math.round(c.f.total/1000).toLocaleString("vi-VN")}k</button></td>`:`<td><span class="cell n">·</span></td>`).join("")}</tr>`).join("")+
    `</tbody></table></div><div class="legend"><span><span class="ycell paid">Xanh</span>Đã thu</span><span><span class="ycell due">Cam</span>Chưa thu</span><span>Bấm vào ô để đổi trạng thái. Số tiền tính theo nghìn đồng.</span></div>`;
  $("#view").innerHTML=h;
  bindFeeToggle();
  $("#feeYear").onchange=e=>{feeMonth=e.target.value+feeMonth.slice(4);render()};
  document.querySelectorAll("[data-ys]").forEach(b=>b.onclick=()=>{
    const sid=b.dataset.ys,m=b.dataset.ym,pay=S.payments[sid+"_"+m],now=!(pay&&pay.paid),f=feeFor(sid,m);
    save("payments",sid+"_"+m,{studentId:sid,month:m,paid:now,amount:f.total,paidDate:now?todayStr():""});
    toast(now?"Đã đánh dấu đã thu":"Đã chuyển về chưa thu");
  });
}


/* ---------- buổi học ---------- */
let editingLesson=null, draftAtt={}, draftHw=[];
function openLesson(id,presetGroup){
  editingLesson=id;
  const l=id?S.lessons[id]:null;
  $("#dLessonTitle").textContent=l?"Sửa buổi học":"Buổi học mới";
  $("#lDate").value=l?l.date:todayStr();
  $("#lTime").value=l?l.time||"":"";
  $("#lContent").value=l?l.content||"":"";
  $("#lHomework").value=l?l.homework||"":"";
  draftHw=l?JSON.parse(JSON.stringify(l.hwItems||[])):[];
  if(!l)draftHw=[{id:newId().slice(0,12),title:"",link:""}];
  renderHw();
  const gs=groupsArr();
  const gsel=l?(l.groupId||""):(presetGroup||(gs[0]&&gs[0].id)||"");
  $("#lClass").innerHTML=groupOptions(gsel,"Không theo lớp (tự chọn học sinh)");
  $("#lMode").value=l?(l.mode||"off"):"off";
  feeHint();
  draftAtt=l?JSON.parse(JSON.stringify(l.attendance||{})):{};
  if(!l)defaultAtt();
  $("#lDelete").hidden=!l;
  $("#lDelete").classList.remove("armed");$("#lDelete").textContent="Xóa buổi học";
  renderAtt();
  $("#dLesson").showModal();
}
function inClass(s,gid){return !gid||inGroup(s.id,gid)}
function defaultAtt(){
  const c=$("#lClass").value;draftAtt={};
  if(c)studentsArr().filter(s=>s.active!==false&&inClass(s,c)).forEach(s=>{draftAtt[s.id]={st:"p"}});
}
function feeHint(){
  const g=S.groups[$("#lClass").value],mode=$("#lMode").value;
  $("#lFeeHint").textContent=g?`Học phí buổi này: ${money(groupFee(g,mode))} mỗi em (${g.subject||""} · ${MODE[mode]}).`:"Buổi không theo lớp: học phí lấy theo mức cũ của từng em (nếu có).";
}
function renderAtt(){
  const c=$("#lClass").value;
  const list=studentsArr().filter(s=>draftAtt[s.id]||(s.active!==false&&inClass(s,c)));
  const opts=[["p","Có mặt"],["e","Phép"],["u","Vắng"],["n","—"]];
  $("#attList").innerHTML=list.length?list.map(s=>{
    const r=draftAtt[s.id];const st=r?r.st:"n";
    return `<div class="att-row"><div class="who">${esc(s.name)}<small>${esc(groupsOf(s.id).map(g=>g.name).join(", "))}</small></div>
      <div class="seg" role="radiogroup" aria-label="Điểm danh ${esc(s.name)}">${opts.map(([v,t])=>`<label><input type="radio" name="att-${esc(s.id)}" value="${v}" data-sid="${esc(s.id)}" ${st===v?"checked":""}><span>${t}</span></label>`).join("")}</div>
      ${r&&r.st!=="n"&&draftHw.length?`<div class="hw"><span class="lbl">Đã làm xong:</span>${draftHw.map((h,i)=>`<label class="check" title="${esc(h.title||"Bài "+(i+1))}"><input type="checkbox" data-done="${esc(s.id)}" data-item="${esc(h.id)}" ${(r.done||[]).includes(h.id)?"checked":""}> Bài ${i+1}</label>`).join("")}<button type="button" class="ghost small" data-doneall="${esc(s.id)}">Tất cả</button></div>`:""}
      ${r&&r.st!=="n"?`<div class="cmt"><input type="text" data-cmt="${esc(s.id)}" value="${esc(r.cmt||"")}" placeholder="Nhận xét riêng cho ${esc(s.name)} (phụ huynh em này sẽ thấy)" aria-label="Nhận xét cho ${esc(s.name)}"></div>`:""}
    </div>`}).join(""):`<div class="empty" style="border:0">Chưa có học sinh nào. Thêm học sinh ở tab “Học sinh” trước nhé.</div>`;
  $("#attList").querySelectorAll("input[type=radio]").forEach(i=>i.onchange=()=>{
    const sid=i.dataset.sid;
    if(i.value==="n")delete draftAtt[sid];else draftAtt[sid]={...(draftAtt[sid]||{hw:false}),st:i.value};
    renderAtt();
  });
  $("#attList").querySelectorAll("[data-done]").forEach(i=>i.onchange=()=>{
    const r=draftAtt[i.dataset.done];const set=new Set(r.done||[]);
    if(i.checked)set.add(i.dataset.item);else set.delete(i.dataset.item);r.done=[...set];
  });
  $("#attList").querySelectorAll("[data-cmt]").forEach(i=>i.oninput=()=>{draftAtt[i.dataset.cmt].cmt=i.value});
  $("#attList").querySelectorAll("[data-doneall]").forEach(b=>b.onclick=()=>{draftAtt[b.dataset.doneall].done=draftHw.map(h=>h.id);renderAtt()});
}
$("#lClass").onchange=()=>{if(!editingLesson)defaultAtt();feeHint();renderAtt()};
$("#lMode").onchange=feeHint;
$("#allPresent").onclick=()=>{
  const c=$("#lClass").value;
  studentsArr().filter(s=>s.active!==false&&(c?inClass(s,c):draftAtt[s.id])).forEach(s=>{draftAtt[s.id]={...(draftAtt[s.id]||{}),st:"p"}});
  renderAtt();
};
$("#fLesson").addEventListener("submit",e=>{
  e.preventDefault();
  const date=$("#lDate").value;if(!date){toast("Hãy chọn ngày học");return}
  const old=editingLesson?S.lessons[editingLesson]:null;
  const gid=$("#lClass").value,g=S.groups[gid],lmode=$("#lMode").value;
  const same=old&&(old.groupId||"")===gid&&(old.mode||"off")===lmode;
  const att={};const ids=new Set(draftHw.map(h=>h.id));
  for(const [sid,r] of Object.entries(draftAtt)){
    const prevFee=same&&old.attendance&&old.attendance[sid]&&old.attendance[sid].fee;
    const fee=prevFee!=null&&prevFee!==false?prevFee:(g?groupFee(g,lmode):Number((S.students[sid]||{}).fee||0));
    att[sid]={st:r.st,done:(r.done||[]).filter(x=>ids.has(x)),fee,cmt:(r.cmt||"").trim()};
  }
  const data={date,time:$("#lTime").value.trim(),groupId:gid,className:g?g.name:"",subject:g?g.subject||"":"",mode:lmode,content:$("#lContent").value.trim(),homework:$("#lHomework").value.trim(),hwItems:draftHw.filter(h=>h.title.trim()||h.link.trim()||h.filePath).map(h=>({...h,title:h.title.trim(),link:h.link.trim()})),attendance:att,updatedAt:new Date().toISOString()};
  if(old&&old.sample)data.sample=true;
  save("lessons",editingLesson||newId(),data);
  $("#dLesson").close();toast("Đã lưu buổi học");
});
$("#lDelete").onclick=armed($("#lDelete"),"Bấm lần nữa để xóa",()=>{removeDoc("lessons",editingLesson);$("#dLesson").close();toast("Đã xóa buổi học")});

/* ---------- học sinh ---------- */
let editingStudent=null;
function openStudent(id){
  editingStudent=id;const s=id?S.students[id]:null;
  $("#dStudentTitle").textContent=s?"Sửa thông tin học sinh":"Thêm học sinh";
  $("#sName").value=s?s.name||"":"";
  const mine=new Set(id?groupsOf(id).map(g=>g.id):[]);
  $("#sGroups").innerHTML=groupsArr().length?groupsArr().map(g=>`<label><input type="checkbox" value="${esc(g.id)}" ${mine.has(g.id)?"checked":""}>${esc(g.name)}<span class="status">${esc(g.subject||"")}</span></label>`).join(""):`<span class="hint">Chưa có lớp nào. Tạo lớp ở tab “Lớp học” trước.</span>`;
  $("#sParent").value=s?s.parentName||"":"";
  $("#sPhone").value=s?s.phone||"":"";
  $("#sNote").value=s?s.note||"":"";
  $("#sActive").value=s&&s.active===false?"0":"1";
  $("#sDelete").hidden=!s;$("#sDelete").classList.remove("armed");$("#sDelete").textContent="Xóa học sinh";
  renderParentBox(id);
  $("#dStudent").showModal();
}
$("#fStudent").addEventListener("submit",e=>{
  e.preventDefault();
  const name=$("#sName").value.trim();if(!name){toast("Hãy nhập tên học sinh");return}
  const old=editingStudent?S.students[editingStudent]:null;
  const data={name,fee:old?old.fee||0:0,parentName:$("#sParent").value.trim(),phone:$("#sPhone").value.trim(),note:$("#sNote").value.trim(),active:$("#sActive").value==="1",parentId:old?old.parentId||null:null,tutorId:me.id,createdAt:old&&old.createdAt||new Date().toISOString()};
  const sid=editingStudent||newId();
  save("students",sid,data);
  const want=new Set([...$("#sGroups").querySelectorAll("input:checked")].map(i=>i.value));
  groupsArr().forEach(g=>{const has=(g.memberIds||[]).includes(sid);if(has!==want.has(g.id)){const {id,...rest}=g;save("groups",g.id,{...rest,memberIds:want.has(g.id)?[...(g.memberIds||[]),sid]:(g.memberIds||[]).filter(x=>x!==sid)})}});
  $("#dStudent").close();toast("Đã lưu học sinh");
});
$("#sDelete").onclick=armed($("#sDelete"),"Bấm lần nữa để xóa",()=>{const sid=editingStudent;groupsOf(sid).forEach(g=>{const {id,...rest}=g;save("groups",g.id,{...rest,memberIds:(g.memberIds||[]).filter(x=>x!==sid)})});removeDoc("students",sid);$("#dStudent").close();toast("Đã xóa học sinh")});

/* ---------- bài tập ---------- */
function safeLink(u){u=(u||"").trim();if(!u)return "";if(!/^https?:\/\//i.test(u))u="https://"+u;return u}
function hwProgress(l){
  const items=l.hwItems||[];if(!items.length)return "";
  const recs=Object.values(l.attendance||{});if(!recs.length)return "";
  const full=recs.filter(r=>items.every(h=>(r.done||[]).includes(h.id))).length;
  return `<span class="pill ${full===recs.length?"ok":"warn"}">${full}/${recs.length} em làm xong hết bài</span>`;
}
function renderHw(){
  $("#hwList").innerHTML=draftHw.length?draftHw.map((h,i)=>`<div class="hwitem">
    <span class="no">${i+1}</span>
    <div class="fields">
      <input type="text" data-hwt="${i}" value="${esc(h.title)}" placeholder="Tên bài tập, VD: Workbook trang 34–35" aria-label="Tên bài tập ${i+1}">
      <input type="text" inputmode="url" data-hwl="${i}" value="${esc(h.link)}" placeholder="Link bài tập (Google Drive, Quizlet…) – không bắt buộc" aria-label="Link bài tập ${i+1}">
      <div class="files">
        ${h.link?`<a href="${esc(safeLink(h.link))}" target="_blank" rel="noopener">Mở link</a>`:""}
        ${h.filePath?`<a href="#" data-file="${esc(h.filePath)}">📄 ${esc(h.fileName||"Tệp đính kèm")}</a><button type="button" class="ghost small" data-hwfx="${i}">Bỏ tệp</button>`:
          `<label class="btn small" style="padding:4px 10px;font-size:.85rem">📎 Gắn file PDF/ảnh<input type="file" accept="application/pdf,image/*" data-hwf="${i}" hidden></label>`}
      </div>
    </div>
    <button type="button" class="ghost small" data-hwx="${i}" aria-label="Xóa bài ${i+1}">Xóa</button>
  </div>`).join(""):`<p class="hint">Chưa giao bài tập nào. Bấm “Thêm bài tập”.</p>`;
  const L=$("#hwList");
  L.querySelectorAll("[data-hwt]").forEach(i=>{i.oninput=()=>{draftHw[i.dataset.hwt].title=i.value};i.onchange=renderAtt});
  L.querySelectorAll("[data-hwl]").forEach(i=>{i.onchange=()=>{draftHw[i.dataset.hwl].link=i.value.trim();renderHw()}});
  L.querySelectorAll("[data-hwx]").forEach(b=>b.onclick=()=>{draftHw.splice(+b.dataset.hwx,1);renderHw();renderAtt()});
  L.querySelectorAll("[data-hwfx]").forEach(b=>b.onclick=()=>{const h=draftHw[b.dataset.hwfx];delete h.filePath;delete h.fileName;renderHw()});
  L.querySelectorAll("[data-hwf]").forEach(inp=>inp.onchange=async()=>{
    const f=inp.files&&inp.files[0];if(!f)return;
    if(f.size>20*1024*1024){toast("Tệp lớn hơn 20MB, hãy chọn tệp nhỏ hơn");return}
    toast("Đang tải tệp lên…");
    try{
      const safe=noAccent(f.name).replace(/[^A-Za-z0-9._-]+/g,"-").slice(-60);
      const path=`${me.id}/${newId()}-${safe}`;
      const {error}=await sb.storage.from("files").upload(path,f,{contentType:f.type||"application/pdf",upsert:false});
      if(error)throw error;
      const h=draftHw[inp.dataset.hwf];h.filePath=path;h.fileName=f.name;renderHw();toast("Đã gắn tệp. Nhớ bấm “Lưu buổi học”.")}
    catch(e){toast("Chưa tải tệp lên được. Thử lại nhé.")}
  });
}
$("#hwAdd").onclick=()=>{draftHw.push({id:newId().slice(0,12),title:"",link:""});renderHw();renderAtt();const t=document.querySelectorAll("[data-hwt]");t[t.length-1].focus()};

/* ---------- ngân hàng & mã QR ---------- */
const BANKS=[["970436","Vietcombank"],["970415","VietinBank"],["970418","BIDV"],["970405","Agribank"],["970407","Techcombank"],["970422","MB Bank"],["970416","ACB"],["970432","VPBank"],["970423","TPBank"],["970403","Sacombank"],["970437","HDBank"],["970441","VIB"],["970443","SHB"],["970431","Eximbank"],["970426","MSB"],["970440","SeABank"],["970448","OCB"],["970449","LPBank (LienViet)"],["970428","Nam A Bank"],["970409","Bac A Bank"],["970427","VietABank"],["970425","ABBANK"],["970412","PVcomBank"],["970454","BVBank (Viet Capital)"],["970452","KienlongBank"],["970419","NCB"],["970438","BaoViet Bank"],["970400","Saigonbank"],["970430","PGBank"],["970433","Vietbank"],["970429","SCB"]];
function bankName(bin){const b=BANKS.find(x=>x[0]===bin);return b?b[1]:""}
function bankLine(){const st=S.settings;return st.accNo?`<div><small>Tài khoản nhận học phí</small><div style="font-weight:700">${esc(bankName(st.bankBin))} · ${esc(st.accNo)}${st.accName?" · "+esc(st.accName):""}</div></div>`:`<div><small>Tài khoản nhận học phí</small><div class="hint">Nhập số tài khoản để tạo mã QR chuyển khoản cho phụ huynh.</div></div>`}
function openBank(){
  const st=S.settings;
  $("#bBank").innerHTML=`<option value="">Chọn ngân hàng</option>`+BANKS.map(([b,n])=>`<option value="${b}" ${st.bankBin===b?"selected":""}>${esc(n)}</option>`).join("");
  $("#bAcc").value=st.accNo||"";$("#bName").value=st.accName||"";$("#bNote").value=st.noteStyle||"name";
  $("#dBank").showModal();
}
$("#fBank").addEventListener("submit",e=>{
  e.preventDefault();
  const bin=$("#bBank").value,acc=$("#bAcc").value.replace(/\s/g,"");
  if(!bin||!/^[0-9A-Za-z]{4,19}$/.test(acc)){toast("Hãy chọn ngân hàng và nhập số tài khoản (chỉ gồm số)");return}
  save("settings","main",{...S.settings,bankBin:bin,accNo:acc,accName:noAccent($("#bName").value).toUpperCase().trim(),noteStyle:$("#bNote").value});
  $("#dBank").close();toast("Đã lưu tài khoản");
});
function noAccent(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D")}
function tlv(id,v){return id+String(v.length).padStart(2,"0")+v}
function crc16(str){let c=0xFFFF;for(let i=0;i<str.length;i++){c^=str.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF}return c.toString(16).toUpperCase().padStart(4,"0")}
function vietQR(bin,acc,amount,note){
  const acct=tlv("38",tlv("00","A000000727")+tlv("01",tlv("00",bin)+tlv("01",acc))+tlv("02","QRIBFTTA"));
  let p=tlv("00","01")+tlv("01","12")+acct+tlv("53","704")+(amount>0?tlv("54",String(Math.round(amount))):"")+tlv("58","VN")+(note?tlv("62",tlv("08",note)):"")+"6304";
  return p+crc16(p);
}
function randCode(seed){let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619)>>>0}const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let o="";for(let i=0;i<8;i++){o+=A[h%A.length];h=Math.imul(h^(h>>>13),2654435761)>>>0}return o}
function qrNote(s,m,sid,st){
  if((st||S.settings).noteStyle==="random")return randCode(sid+"|"+m);
  const name=noAccent(s.name||"").toUpperCase().replace(/[^A-Z0-9 ]/g,"").replace(/\s+/g," ").trim();
  return (name.slice(0,37).trim()+" CHUYEN KHOAN").trim();
}
function drawQR(payload,lines){
  const q=qrcode(0,"M");q.addData(payload);q.make();
  const n=q.getModuleCount(),cell=8,pad=32,qs=n*cell,W=qs+pad*2,H=qs+pad*2+lines.length*26+8;
  const c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");
  g.fillStyle="#ffffff";g.fillRect(0,0,W,H);g.fillStyle="#1a1a1a";
  for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(q.isDark(r,k))g.fillRect(pad+k*cell,pad+r*cell,cell,cell);
  g.textAlign="center";
  lines.forEach((t,i)=>{g.font=(i===0?"800 20px ":"600 16px ")+"Nunito, Arial, sans-serif";g.fillStyle=i===0?"#c73a61":"#3a2430";g.fillText(t,W/2,pad+qs+24+i*26)});
  return c;
}
let lastQR=null;

/* ---------- tin nhắn học phí ---------- */
function qrFor(st,s,sid,m,amount){
  if(!(st&&st.accNo&&st.bankBin&&typeof qrcode==="function"))return null;
  const note=qrNote(s,m,sid,st);
  const c=drawQR(vietQR(st.bankBin,st.accNo,amount,note),[money(amount),`${bankName(st.bankBin)} · ${st.accNo}`,st.accName||"",`Nội dung: ${note}`].filter(Boolean));
  return {canvas:c,note,name:`QR-hoc-phi-${noAccent(s.name).replace(/[^A-Za-z0-9]+/g,"-")}-${m}.png`};
}
function saveCanvas(c,name){c.toBlob(b=>{const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)},"image/png")}
function openMsg(sid,m){
  const s=S.students[sid]||{},f=feeFor(sid,m);const [y,mo]=m.split("-");
  const buoi=f.p+(S.settings.chargeUnexcused?f.u:0);
  let t=`Chào ${s.parentName||"phụ huynh"}, em gửi thông báo học phí tháng ${Number(mo)}/${y} của em ${s.name}:\n`;
  t+=`- Số buổi học: ${f.p} buổi`;
  if(f.e)t+=`\n- Vắng có phép: ${f.e} buổi (không tính phí)`;
  if(f.u)t+=`\n- Vắng không phép: ${f.u} buổi${S.settings.chargeUnexcused?" (có tính phí)":" (không tính phí)"}`;
  f.items.forEach(i=>{t+=`\n- ${i.label}: ${i.n} buổi × ${money(i.fee)} = ${money(i.n*i.fee)}`});
  t+=`\n- Tổng học phí: ${money(f.total)}`;
  const st=S.settings;lastQR=null;
  if(st.accNo&&st.bankBin&&typeof qrcode==="function"){
    const note=qrNote(s,m,sid);
    try{
      const c=drawQR(vietQR(st.bankBin,st.accNo,f.total,note),[money(f.total),`${bankName(st.bankBin)} · ${st.accNo}`,st.accName||"",`Nội dung: ${note}`].filter(Boolean));
      lastQR={canvas:c,name:`QR-hoc-phi-${noAccent(s.name).replace(/[^A-Za-z0-9]+/g,"-")}-${m}.png`};
      $("#qrArea").innerHTML=`<div class="qrbox"><div id="qrHost"></div><div class="qi"><span class="lbl">Quét mã để chuyển khoản</span><b>${money(f.total)}</b><span>${esc(bankName(st.bankBin))} · ${esc(st.accNo)}</span>${st.accName?`<span>${esc(st.accName)}</span>`:""}<span class="hint">Nội dung CK: ${esc(note)}</span><span class="hint">Bạn có thể tải ảnh mã QR hoặc chụp màn hình để gửi phụ huynh.</span></div></div>`;
      $("#qrHost").appendChild(c);
      t+=`\n\nThông tin chuyển khoản:\n${bankName(st.bankBin)} - STK ${st.accNo}${st.accName?" - "+st.accName:""}\nNội dung: ${note}`;
    }catch(e){$("#qrArea").innerHTML=`<p class="hint">Chưa tạo được mã QR.</p>`}
  }else if(!st.accNo){
    $("#qrArea").innerHTML=`<div class="qrbox"><div class="qi"><b style="font-size:1rem">Chưa có tài khoản ngân hàng</b><span class="hint">Nhập số tài khoản một lần, sau đó mỗi học sinh sẽ có mã QR đúng số tiền học phí.</span><div><button type="button" class="small" id="qrSetup">+ Nhập tài khoản ngân hàng</button></div></div></div>`;
    $("#qrSetup").onclick=()=>{$("#dMsg").close();openBank()};
  }else $("#qrArea").innerHTML=`<p class="hint">Chưa tải được công cụ tạo mã QR. Kiểm tra mạng rồi mở lại.</p>`;
  $("#qrSave").hidden=!lastQR;
  t+=`\n\nCảm ơn ${s.parentName||"anh/chị"} ạ!`;
  $("#msgText").value=t;$("#dMsg").showModal();
}
$("#qrSave").onclick=()=>{if(lastQR)saveCanvas(lastQR.canvas,lastQR.name)};
$("#msgCopy").onclick=()=>{
  const ta=$("#msgText");
  const fallback=()=>{ta.focus();ta.select();toast("Đã chọn sẵn chữ, bấm giữ hoặc Ctrl+C để sao chép")};
  try{navigator.clipboard.writeText(ta.value).then(()=>toast("Đã sao chép tin nhắn"),fallback)}catch(e){fallback()}
};

/* ---------- tài khoản phụ huynh (trong hộp thoại học sinh) ---------- */
function renderParentBox(id){
  const s=id?S.students[id]:null;
  $("#pPass").value="";$("#pPhone").value=s?s.phone||"":"";
  $("#pSave").disabled=!s;$("#pUnlink").hidden=!(s&&s.parentId);
  if(!s){$("#sParentState").textContent="Lưu học sinh trước, rồi mở lại em này để tạo tài khoản cho phụ huynh.";return}
  if(s.parentId){$("#sParentState").textContent=`Đã có tài khoản. Phụ huynh đăng nhập bằng số ${s.phone||"đã lưu"}.`;$("#pPassHint").textContent="Để trống nếu không muốn đổi mật khẩu."}
  else{$("#sParentState").textContent="Chưa có tài khoản. Nhập số điện thoại và đặt mật khẩu để phụ huynh xem được việc học của em.";$("#pPassHint").textContent="Bạn sẽ gửi mật khẩu này cho phụ huynh."}
}
async function callParentFn(body){
  const {data,error}=await sb.functions.invoke("parent-account",{body});
  if(error){let msg=error.message;try{const j=await error.context.json();if(j&&j.error)msg=j.error}catch(_){}throw new Error(msg)}
  if(data&&data.error)throw new Error(data.error);
  return data;
}
function siteUrl(){return location.origin+location.pathname.replace(/index\.html$/,"")}
$("#pSave").onclick=async()=>{
  const id=editingStudent,s=S.students[id];if(!s)return;
  const phone=normPhone($("#pPhone").value),pass=$("#pPass").value.trim();
  if(!/^0\d{9,10}$/.test(phone)){toast("Số điện thoại chưa đúng, hãy nhập 10 số");return}
  if(!s.parentId&&pass.length<6){toast("Hãy đặt mật khẩu ít nhất 6 ký tự");return}
  if(pass&&pass.length<6){toast("Mật khẩu cần ít nhất 6 ký tự");return}
  const btn=$("#pSave");btn.disabled=true;btn.textContent="Đang lưu…";
  try{
    await callParentFn({action:"link",student_id:id,phone,password:pass,parent_name:s.parentName||""});
    await loadAll();render();renderParentBox(id);
    $("#dStudent").close();
    lastQR=null;$("#qrArea").innerHTML="";$("#qrSave").hidden=true;
    $("#msgText").value=`Chào ${s.parentName||"anh/chị"}, em gửi thông tin để anh/chị theo dõi việc học của em ${s.name}:\n- Trang web: ${siteUrl()}\n- Chọn "Phụ huynh", số điện thoại: ${phone}\n- Mật khẩu: ${pass||"(giữ như cũ)"}\n\nAnh/chị đăng nhập sẽ xem được các buổi học, nội dung bài, bài tập về nhà, nhận xét và học phí của con ạ.`;
    $("#dMsg").showModal();toast("Đã lưu tài khoản phụ huynh");
  }catch(e){toast(e.message||"Chưa lưu được tài khoản")}
  finally{btn.disabled=false;btn.textContent="Tạo / cập nhật tài khoản"}
};
$("#pUnlink").onclick=armed($("#pUnlink"),"Bấm lần nữa để gỡ",async()=>{
  try{await callParentFn({action:"unlink",student_id:editingStudent});await loadAll();render();renderParentBox(editingStudent);toast("Đã gỡ tài khoản phụ huynh khỏi em này")}
  catch(e){toast(e.message||"Chưa gỡ được")}
});

/* ---------- trang phụ huynh ---------- */
let pKid=null,pMonth=thisMonth();
async function openFile(path){
  const w=window.open("","_blank");
  const {data,error}=await sb.storage.from("files").createSignedUrl(path,3600);
  if(error||!data){if(w)w.close();toast("Chưa mở được tệp");return}
  if(w)w.location=data.signedUrl;else location.href=data.signedUrl;
}
document.addEventListener("click",e=>{const a=e.target.closest("a[data-file]");if(a){e.preventDefault();openFile(a.dataset.file)}});
function renderParent(){
  const kids=studentsArr();
  $("#pWho").textContent=me.phone?("Phụ huynh · "+me.phone):"Phụ huynh";
  if(!kids.length){$("#pView").innerHTML=`<div class="empty"><b>Chưa có thông tin học sinh</b>Tài khoản này chưa được gắn với em nào. Hãy nhắn gia sư để kiểm tra lại.</div>`;return}
  if(!pKid||!S.students[pKid])pKid=kids[0].id;
  const s=S.students[pKid],m=pMonth,f=feeFor(pKid,m),pay=S.payments[pKid+"_"+m];
  const st=S.settingsBy[s.tutorId]||{};
  const ls=lessonsArr().filter(l=>l.date.slice(0,7)===m&&(l.attendance||{})[pKid]);
  const stTxt={p:["ok","Có mặt"],e:["warn","Vắng có phép"],u:["bad","Vắng"]};
  let h=(kids.length>1?`<div class="child-tabs">${kids.map(k=>`<button type="button" class="${k.id===pKid?"primary":""}" data-kid="${esc(k.id)}">${esc(k.name)}</button>`).join("")}</div>`:"")+
  `<div class="hero"><div><h2>${esc(s.name)}</h2><p class="hint">${groupsOf(pKid).map(g=>esc(g.name)).join(", ")||"Theo dõi việc học của con"}</p></div><input type="month" id="pMonth" value="${m}" style="width:auto"></div>
  <div class="kpis"><div class="kpi"><small>Buổi có mặt</small><b>${f.p}</b></div><div class="kpi"><small>Vắng</small><b>${f.e+f.u}</b></div>
  <div class="kpi"><small>Học phí ${monthLabel(m).toLowerCase()}</small><b>${money(f.total)}</b>${f.total>0?(pay&&pay.paid?`<span class="pill ok">Đã đóng</span>`:`<span class="pill warn">Chưa đóng</span>`):""}</div></div>`;
  if(f.total>0&&!(pay&&pay.paid)){
    const q=qrFor(st,s,pKid,m,f.total);
    h+=`<div class="card" style="margin-bottom:14px"><h3 style="margin-top:0">Học phí ${monthLabel(m).toLowerCase()}</h3>${f.items.map(i=>`<div class="mini"><span>${esc(i.label)}: ${i.n} buổi × ${money(i.fee)}</span><b>${money(i.n*i.fee)}</b></div>`).join("")}
      ${q?`<div class="qrbox" style="margin-top:10px"><div id="pQr"></div><div class="qi"><span class="lbl">Quét mã để chuyển khoản</span><b>${money(f.total)}</b><span>${esc(bankName(st.bankBin))} · ${esc(st.accNo)}</span>${st.accName?`<span>${esc(st.accName)}</span>`:""}<span class="hint">Nội dung CK: ${esc(q.note)}</span><div><button type="button" class="small" id="pQrSave">Tải ảnh mã QR</button></div></div></div>`:""}</div>`;
    window.__pq=q;
  }
  h+=`<h3>Các buổi học ${monthLabel(m).toLowerCase()}</h3>`;
  h+=ls.length?`<div class="list">`+ls.map(l=>{
    const r=l.attendance[pKid],d=new Date(l.date+"T00:00:00"),items=l.hwItems||[];
    return `<div class="card plesson"><div class="head"><b>${WD[d.getDay()]}, ${d.getDate()}/${d.getMonth()+1}${l.time?" · "+esc(l.time):""}</b>
      <span style="display:flex;gap:6px;flex-wrap:wrap">${lessonGroupName(l)?`<span class="pill acc">${esc(lessonGroupName(l))}</span>`:""}${l.mode?`<span class="pill ${l.mode==="on"?"on":""}">${MODE[l.mode]}</span>`:""}<span class="pill ${stTxt[r.st][0]}">${stTxt[r.st][1]}</span></span></div>
      ${l.content?`<div><span class="lbl">Nội dung:</span>${esc(l.content)}</div>`:""}
      ${items.length?`<div><span class="lbl">Bài tập về nhà:</span><ul>${items.map((it,i)=>`<li>${(r.done||[]).includes(it.id)?"✅":"⬜"} ${esc(it.title||"Bài "+(i+1))}${it.link?` · <a href="${esc(safeLink(it.link))}" target="_blank" rel="noopener">Mở link</a>`:""}${it.filePath?` · <a href="#" data-file="${esc(it.filePath)}">📄 ${esc(it.fileName||"Tệp")}</a>`:""}</li>`).join("")}</ul></div>`:""}
      ${l.homework?`<div><span class="lbl">Ghi chú:</span>${esc(l.homework)}</div>`:""}
      ${r.cmt?`<div class="cmtbox"><b>Nhận xét của gia sư:</b> ${esc(r.cmt)}</div>`:""}
    </div>`}).join("")+`</div>`:`<div class="empty"><b>Chưa có buổi học nào trong tháng này</b>Chọn tháng khác ở ô phía trên.</div>`;
  $("#pView").innerHTML=h;
  if(window.__pq&&$("#pQr")){$("#pQr").appendChild(window.__pq.canvas);$("#pQrSave").onclick=()=>saveCanvas(window.__pq.canvas,window.__pq.name)}
  window.__pq=null;
  $("#pMonth").onchange=e=>{if(e.target.value){pMonth=e.target.value;renderParent()}};
  document.querySelectorAll("[data-kid]").forEach(b=>b.onclick=()=>{pKid=b.dataset.kid;renderParent()});
}

/* ---------- chung ---------- */
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
document.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;try{localStorage.setItem(LS_KEY+"-tab",tab)}catch(e){}render()});
try{const t=localStorage.getItem(LS_KEY+"-tab");if(t)tab=t}catch(e){}

/* ---------- đăng nhập ---------- */
const VI_ERR=[[/invalid login credentials/i,"Sai thông tin đăng nhập hoặc mật khẩu."],[/email not confirmed/i,"Bạn chưa xác nhận email. Hãy mở email và bấm vào đường link xác nhận."],[/already registered/i,"Email này đã có tài khoản. Hãy đăng nhập."],[/password should be at least/i,"Mật khẩu cần ít nhất 6 ký tự."],[/rate limit/i,"Bạn thử quá nhiều lần, hãy chờ vài phút rồi thử lại."],[/invalid email|unable to validate email/i,"Email chưa đúng."]];
function viErr(e){const m=(e&&e.message)||String(e);const f=VI_ERR.find(([re])=>re.test(m));return f?f[1]:m}
function authMsg(t,err){const el=$("#authMsg");el.textContent=t||"";el.classList.toggle("err",!!err)}
let signup=false;
function showAuth(){
  $("#authScreen").hidden=false;$("#adminApp").hidden=true;$("#parentApp").hidden=true;
  $("#authLoading").hidden=true;$("#authForms").hidden=false;
}
document.querySelectorAll("[data-who]").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("[data-who]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  $("#fParentLogin").hidden=b.dataset.who!=="parent";$("#fTutorLogin").hidden=b.dataset.who!=="tutor";$("#fNewPass").hidden=true;authMsg("");
  try{localStorage.setItem(LS_KEY+"-who",b.dataset.who)}catch(e){}
});
try{const w=localStorage.getItem(LS_KEY+"-who");if(w==="tutor")document.querySelector('[data-who="tutor"]').click()}catch(e){}
$("#toggleSignup").onclick=()=>{signup=!signup;$("#nameRow").hidden=!signup;$("#tutorSubmit").textContent=signup?"Đăng ký tài khoản gia sư":"Đăng nhập";$("#toggleSignup").textContent=signup?"Đã có tài khoản? Đăng nhập":"Chưa có tài khoản? Đăng ký";$("#loginPass").autocomplete=signup?"new-password":"current-password";authMsg("")};
$("#fParentLogin").addEventListener("submit",async e=>{
  e.preventDefault();authMsg("Đang đăng nhập…");
  const phone=normPhone($("#loginPhone").value);
  if(!/^0\d{9,10}$/.test(phone)){authMsg("Số điện thoại chưa đúng, hãy nhập 10 số.",true);return}
  const {error}=await sb.auth.signInWithPassword({email:phone+PARENT_DOMAIN,password:$("#loginPhonePass").value});
  if(error)authMsg(viErr(error),true);
});
$("#fTutorLogin").addEventListener("submit",async e=>{
  e.preventDefault();
  const email=$("#loginEmail").value.trim(),password=$("#loginPass").value;
  if(signup){
    authMsg("Đang tạo tài khoản…");
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:$("#loginName").value.trim()},emailRedirectTo:siteUrl()}});
    if(error){authMsg(viErr(error),true);return}
    if(!data.session)authMsg("Đã tạo tài khoản. Hãy mở email "+email+" và bấm vào đường link xác nhận, rồi quay lại đây đăng nhập.");
  }else{
    authMsg("Đang đăng nhập…");
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error)authMsg(viErr(error),true);
  }
});
$("#forgotPass").onclick=async()=>{
  const email=$("#loginEmail").value.trim();
  if(!email){authMsg("Hãy nhập email của bạn trước, rồi bấm “Quên mật khẩu”.",true);return}
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:siteUrl()});
  authMsg(error?viErr(error):"Đã gửi email đặt lại mật khẩu tới "+email+". Hãy mở email và bấm vào đường link.",!!error);
};
$("#fNewPass").addEventListener("submit",async e=>{
  e.preventDefault();
  const {error}=await sb.auth.updateUser({password:$("#newPass").value});
  if(error){authMsg(viErr(error),true);return}
  authMsg("Đã đổi mật khẩu.");$("#fNewPass").hidden=true;boot();
});
document.querySelectorAll("[data-logout]").forEach(b=>b.onclick=async()=>{await sb.auth.signOut();location.reload()});

let booted=null;
async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){showAuth();return}
  if(booted===session.user.id)return;booted=session.user.id;
  const {data:prof,error}=await sb.from("profiles").select("*").eq("id",session.user.id).single();
  if(error||!prof){showAuth();authMsg("Chưa tải được hồ sơ: "+viErr(error||{message:"không rõ"}),true);booted=null;return}
  me={id:prof.id,role:prof.role,name:prof.full_name,phone:prof.phone,email:session.user.email};
  $("#authScreen").hidden=true;
  try{await loadAll()}catch(e){toast("Chưa tải được dữ liệu: "+viErr(e))}
  mode="db";
  if(me.role==="parent"){$("#parentApp").hidden=false;renderParent()}
  else{$("#adminApp").hidden=false;$("#whoami").textContent=me.name||me.email;render()}
}
sb.auth.onAuthStateChange((ev,session)=>{
  if(ev==="PASSWORD_RECOVERY"){showAuth();document.querySelector('[data-who="tutor"]').click();$("#fTutorLogin").hidden=true;$("#fNewPass").hidden=false;return}
  if(ev==="SIGNED_IN")setTimeout(boot,0);
  if(ev==="SIGNED_OUT"){booted=null;showAuth()}
});
boot();
})();
