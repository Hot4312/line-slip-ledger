const key = new URLSearchParams(location.search).get('key') || localStorage.adminKey || '';
if (key) localStorage.adminKey = key;
const auth = key ? { authorization: `Bearer ${key}` } : {};
let slips = [], current = null;
const el = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(n)||0);
const dt = s => s ? new Date(s).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}) : 'ยังไม่ระบุเวลาโอน';
const label = {pending:'รอตรวจสอบ',confirmed:'ยืนยันแล้ว',rejected:'ไม่ใช่รายการ'};
function render(){
  el('total').textContent=slips.length; el('pending').textContent=slips.filter(s=>s.status==='pending').length;
  el('sum').textContent=money(slips.filter(s=>s.status==='confirmed').reduce((a,s)=>a+(Number(s.amount)||0),0));
  const q=el('search').value.toLowerCase(), f=el('filter').value;
  const rows=slips.filter(s=>(!f||s.status===f)&&JSON.stringify(s).toLowerCase().includes(q));
  el('empty').hidden=slips.length>0; el('list').innerHTML=rows.map(s=>`<article class="card" data-id="${s.id}"><img src="${s.image}?key=${encodeURIComponent(key)}" loading="lazy"><div class="card-body"><div class="card-top"><strong>${s.senderName}</strong><span class="badge ${s.status}">${label[s.status]}</span></div><div class="money">${s.amount==null?'—':money(s.amount)}</div><div class="meta">${dt(s.transferAt||s.receivedAt)} · ${s.bank||'ยังไม่ระบุธนาคาร'}</div></div></article>`).join('');
  document.querySelectorAll('.card').forEach(c=>c.onclick=()=>open(slips.find(s=>s.id===c.dataset.id)));
}
function open(s){current=s;el('preview').src=`${s.image}?key=${encodeURIComponent(key)}`;for(const k of ['amount','transferAt','bank','reference','note'])el(k).value=s[k]??'';el('editor').showModal()}
async function update(status){const patch={status};for(const k of ['amount','transferAt','bank','reference','note'])patch[k]=el(k).value;const r=await fetch(`/api/slips/${current.id}`,{method:'PATCH',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(patch)});if(!r.ok)return alert('บันทึกไม่สำเร็จ');const saved=await r.json();slips=slips.map(s=>s.id===current.id?saved:s);el('editor').close();render()}
async function load(){const r=await fetch('/api/slips',{headers:auth});if(r.status===401)return document.body.innerHTML='<main class="empty"><h2>ต้องใช้ ADMIN_KEY</h2><p>เปิดหน้านี้ด้วย <code>/?key=รหัสของคุณ</code></p></main>';slips=await r.json();render()}
el('search').oninput=render;el('filter').onchange=render;el('save').onclick=()=>update('confirmed');el('reject').onclick=()=>update('rejected');el('export').onclick=()=>location.href=`/api/export.csv?key=${encodeURIComponent(key)}`;load();
