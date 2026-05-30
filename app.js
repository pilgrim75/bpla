// ============ STATE ============
const ROLES_BASE={admin:'Администратор',cmd:'Командир',tech:'Техник'};
const DRONE_CATALOG=['Гамаюн13','Гамаюн13д','Гамаюн13т','Гамаюн12','КИРМ','ПВХ1','Упырь11','Упырь18','Курьер21'];

function rebuildRoleSelector(){
  const sel=document.getElementById('roleSwitch');
  const cur=sel.value;
  sel.innerHTML=
    '<option value="admin">Администратор</option>'+
    '<option value="cmd">Командир</option>'+
    '<option value="tech">Техник</option>'+
    state.squads.map((sq,i)=>`<option value="pilot_${i}">Пилот ${sq.pilot}</option>`).join('');
  // восстановить выбор если возможно
  if([...sel.options].some(o=>o.value===cur))sel.value=cur;
}

let state = {
  role: 'cmd',
  stock: [
    {name:'КИРМ',qty:1,status:'bg'},
    {name:'Гамаюн13д',qty:9,status:'bg'},
    {name:'Гамаюн13т',qty:3,status:'bg'},
    {name:'ПВХ1',qty:4,status:'bg'},
    {name:'Упырь11',qty:3,status:'bg'},
    {name:'Упырь18',qty:1,status:'bg'},
    {name:'Гамаюн12',qty:1,status:'nbg'},
    {name:'Курьер21',qty:1,status:'nbg'},
  ],
  squads: [
    {pilot:'Поп',drones:[{name:'Гамаюн13',qty:2},{name:'ПВХ1',qty:1}]},
    {pilot:'Толстый',drones:[{name:'Гамаюн13',qty:1},{name:'КИРМ',qty:1}]},
  ],
  flights: [
    {date:'2026-05-25',time:'08:57',pilot:'Поп (Альберт)',target:'305 Вишня',ammo:'Доставка',drone:'Гамаюн13',result:'yes',returned:'yes',note:''},
    {date:'2026-05-25',time:'09:53',pilot:'Толстый',target:'305 Вишня',ammo:'Провизия',drone:'Гамаюн13',result:'yes',returned:'yes',note:''},
    {date:'2026-05-25',time:'10:24',pilot:'Рама',target:'305 Вишня',ammo:'Доставка',drone:'Гамаюн13',result:'yes',returned:'yes',note:''},
    {date:'2026-05-25',time:'11:09',pilot:'Никита',target:'196 Каралл',ammo:'Пом2',drone:'КИРМ',result:'yes',returned:'yes',note:''},
    {date:'2026-05-24',time:'09:06',pilot:'Рама',target:'305 Вишня',ammo:'Доставка',drone:'Гамаюн13',result:'yes',returned:'yes',note:''},
    {date:'2026-05-24',time:'10:22',pilot:'Рама',target:'274 Горчичная',ammo:'Магнитка',drone:'КИРМ',result:'no',returned:'no',note:'Перебили видео'},
    {date:'2026-05-24',time:'19:14',pilot:'Толстый',target:'305 Вишня',ammo:'Провизия',drone:'ПВХ1',result:'yes',returned:'no',note:'Спикировал'},
    {date:'2026-05-23',time:'08:34',pilot:'Рама',target:'305 Вишня',ammo:'Доставка',drone:'Гамаюн13',result:'yes',returned:'yes',note:''},
    {date:'2026-05-23',time:'10:25',pilot:'Толстый',target:'305 Вишня',ammo:'Провизия',drone:'Гамаюн13',result:'yes',returned:'yes',note:''},
    {date:'2026-05-23',time:'12:32',pilot:'Толстый',target:'208 Каралл',ammo:'2 Кассеты Гальки',drone:'КИРМ',result:'yes',returned:'yes',note:''},
    {date:'2026-05-23',time:'13:37',pilot:'Рама',target:'273 Горчичная',ammo:'Магнитка',drone:'КИРМ',result:'yes',returned:'yes',note:''},
    {date:'2026-05-23',time:'16:56',pilot:'Рама',target:'47 Каралл',ammo:'Пом2',drone:'Гамаюн13',result:'yes',returned:'yes',note:''},
    {date:'2026-05-23',time:'17:48',pilot:'Никита',target:'900 Янтарь',ammo:'Пом2',drone:'КИРМ',result:'yes',returned:'yes',note:''},
  ],
  offlineQueue: [],
  transfers: []
};

function saveLocal(){
  try{localStorage.setItem('droneState',JSON.stringify(state));}catch(e){}
}
function loadLocal(){
  try{
    const s=localStorage.getItem('droneState');
    if(s)state=JSON.parse(s);
  }catch(e){}
}
loadLocal();

// ============ NETWORK ============
function checkNet(){
  const bar=document.getElementById('netBar');
  const ind=document.getElementById('syncIndicator');
  if(navigator.onLine){
    bar.innerHTML='';
    if(state.offlineQueue.length>0){
      ind.className='sync-indicator syncing';
      ind.textContent='↑ синхронизация...';
      setTimeout(()=>{state.offlineQueue=[];saveLocal();ind.className='sync-indicator saved';ind.textContent='✓ сохранено';},1500);
    } else {
      ind.className='sync-indicator saved';
      ind.textContent='● онлайн';
    }
  } else {
    bar.innerHTML='<div class="offline-bar">ОФЛАЙН — данные сохраняются локально, синхронизируются при появлении сети</div>';
    ind.className='sync-indicator';
    ind.textContent='● офлайн';
  }
}
window.addEventListener('online',checkNet);
window.addEventListener('offline',checkNet);
checkNet();

// ============ NAV ============
function showPage(id,btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(id==='flights')renderFlights();
  if(id==='dashboard')renderDashboard();
  if(id==='inventory')renderInventory();
  if(id==='report'){fillReportFilters();buildReport();}
  if(id==='settings'){
    const nuke=document.getElementById('nu-enckey');
    if(nuke)nuke.value=cfg.key||localStorage.getItem('cfg_key')||'';
    if(authToken)loadUsersList();
    renderSettingsStatus();
    if(typeof nuRoleChange==='function')nuRoleChange();
  }
  if(id==='admin'){
    // Инициализируем дефолтные даты фильтра
    const now=new Date();
    const firstDay=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
    const today=now.toISOString().slice(0,10);
    const ff=document.getElementById('adm-filterFrom');
    const ft=document.getElementById('adm-filterTo');
    if(ff&&!ff.value)ff.value=firstDay;
    if(ft&&!ft.value)ft.value=today;
    renderAdminFlights();renderAdminStock();renderAdminSquads();
  }
}

function switchRole(r){
  state.role=r;
  let label='';
  let pilotName='';
  if(r==='admin')label='Администратор';
  else if(r==='cmd')label='Командир';
  else if(r==='tech')label='Техник';
  else if(r.startsWith('pilot_')){
    const idx=parseInt(r.split('_')[1]);
    pilotName=state.squads[idx]?state.squads[idx].pilot:'?';
    label='Пилот '+pilotName;
  }
  document.getElementById('roleBadge').innerHTML='<b>'+label+'</b>';
  const canEdit=r==='cmd'||r==='tech'||r==='admin';
  document.getElementById('addDroneBtn').style.display=canEdit?'':'none';
  document.getElementById('transferBtnArea').style.display=canEdit?'':'none';
  const adminBtn=document.getElementById('adminNavBtn');
  adminBtn.style.display=r==='admin'?'':'none';
  if(r!=='admin'){
    const adminPage=document.getElementById('page-admin');
    if(adminPage.classList.contains('active')){
      showPage('dashboard',document.querySelector('.nav button'));
    }
  }
  try{localStorage.setItem('role',r);}catch(e){}
  // Обновляем форму вылета — скрываем/показываем поле пилота
  setTimeout(()=>{
    const isPilot=r.startsWith('pilot_');
    const qpWrap=document.getElementById('qf-pilot-wrap');
    const qp=document.getElementById('qf-pilot');
    if(qpWrap)qpWrap.style.display=isPilot?'none':'';
    if(qp){
      if(isPilot) qp.value=pilotName;
      else qp.value=''; // сбрасываем для командира/техника/админа
    }
    if(typeof autoFillFlightNum==='function')autoFillFlightNum();
    const seBtn=document.getElementById('squadEditBtn');
    if(seBtn)seBtn.style.display=(r==='admin')?'':'none';
  },0);
}

// ============ ADMIN ============
function showAdminTab(tab,btn){
  document.querySelectorAll('.adm-panel').forEach(p=>p.style.display='none');
  document.getElementById('adm-'+tab).style.display='block';
  document.querySelectorAll('.adm-tab').forEach(b=>{
    b.style.background='none';b.style.border='none';b.style.color='var(--text2)';b.style.borderBottom='none';b.style.marginBottom='';
  });
  btn.style.background='var(--green-dim)';btn.style.border='1px solid var(--border2)';
  btn.style.borderBottom='none';btn.style.color='var(--green)';btn.style.marginBottom='-1px';
  if(tab==='flights')renderAdminFlights();
  if(tab==='stock')renderAdminStock();
  if(tab==='squads')renderAdminSquads();
  if(tab==='ammo')renderAmmoList();
  if(tab==='actlog'){loadActLogFromCloud().then(()=>renderActLog());};
}

function admClearFilters(){
  document.getElementById('adm-filterFrom').value='';
  document.getElementById('adm-filterTo').value='';
  document.getElementById('adm-filterPilot').value='';
  renderAdminFlights();
}

function renderAdminFlights(){
  const from=document.getElementById('adm-filterFrom').value;
  const to=document.getElementById('adm-filterTo').value;
  const fp=(document.getElementById('adm-filterPilot').value||'').toLowerCase();
  let indexed=state.flights.map((x,i)=>({x,i}));
  if(from)indexed=indexed.filter(({x})=>x.date>=from);
  if(to)indexed=indexed.filter(({x})=>x.date<=to);
  if(fp)indexed=indexed.filter(({x})=>x.pilot.toLowerCase().includes(fp));
  indexed.sort((a,b)=>(b.x.date+b.x.time).localeCompare(a.x.date+a.x.time));
  const cnt=document.getElementById('adm-flightCount');
  if(cnt)cnt.textContent=`Показано: ${indexed.length} из ${state.flights.length}`;
  document.getElementById('adminFlightList').innerHTML=indexed.length?`
    <table class="adm-flight-table">
      <thead><tr>
        <th style="min-width:108px">Дата</th>
        <th style="min-width:78px">Время</th>
        <th style="min-width:75px">Пилот</th>
        <th style="min-width:100px">Точка</th>
        <th style="min-width:82px">Боеприпас</th>
        <th style="min-width:82px">БПЛА</th>
        <th style="min-width:36px">#</th>
        <th style="min-width:46px">Задача</th>
        <th style="min-width:82px">Борт</th>
        <th style="width:100%">Примечание</th>
        <th style="min-width:24px"></th>
      </tr></thead>
      <tbody>${indexed.map(({x,i})=>`<tr>
        <td><input style="width:100px" type="date" value="${x.date}" onchange="adminEditFlight(${i},'date',this.value)"></td>
        <td><input style="width:76px;min-width:76px" type="time" value="${x.time}" onchange="adminEditFlight(${i},'time',this.value)"></td>
        <td><input style="width:72px" value="${x.pilot||''}" onchange="adminEditFlight(${i},'pilot',this.value)"></td>
        <td><input style="width:100px" value="${x.target||''}" onchange="adminEditFlight(${i},'target',this.value)"></td>
        <td><input style="width:80px" value="${x.ammo||''}" onchange="adminEditFlight(${i},'ammo',this.value)" onclick="event.stopPropagation();const ammoList=ammoCatalog.length?ammoCatalog.map(a=>a.name):[...new Set(state.flights.map(f=>f.ammo).filter(Boolean))].sort();showQuickPicker(this,ammoList,v=>{adminEditFlight(${i},'ammo',v)})" autocomplete="off"></td>
        <td><input style="width:85px" value="${x.drone||''}" onchange="adminEditFlight(${i},'drone',this.value)" onclick="event.stopPropagation();showQuickPicker(this,[...new Set([...state.stock.map(d=>d.name),...state.squads.flatMap(sq=>sq.drones.map(d=>d.name))])].sort(),v=>{adminEditFlight(${i},'drone',v)})" autocomplete="off"></td>
        <td><input style="width:36px" type="number" min="1" value="${x.flightnum||''}" onchange="adminEditFlight(${i},'flightnum',this.value?parseInt(this.value):null)"></td>
        <td><select style="width:46px;padding:1px 2px;font-size:13px" onchange="adminEditFlight(${i},'result',this.value)"><option value="yes" ${x.result==='yes'?'selected':''}>✅</option><option value="no" ${x.result==='no'?'selected':''}>❌</option></select></td>
        <td><select style="width:80px" onchange="adminEditFlight(${i},'returned',this.value)"><option value="yes" ${x.returned==='yes'?'selected':''}>вернул</option><option value="no" ${x.returned==='no'?'selected':''}>потерян</option></select></td>
        <td><input style="width:100%;min-width:120px" value="${x.note||''}" onchange="adminEditFlight(${i},'note',this.value)"></td>
        <td><button class="btn btn-danger btn-sm" style="padding:1px 5px;font-size:9px" onclick="adminDeleteFlight(${i})">✕</button></td>
      </tr>`).join('')}
      </tbody>
    </table>`:'<div style="color:var(--muted);padding:12px">Нет вылетов</div>';
}

function adminEditFlight(idx,field,val){
  if(state.flights[idx])state.flights[idx][field]=val;
  saveLocal();
}

function adminDeleteFlight(idx){
  if(!confirm('Удалить этот вылет?'))return;
  const f=state.flights[idx];
  // Если вылет был с потерей — возвращаем дрон расчёту
  if(f&&f.returned==='no'&&f.drone&&f.pilot){
    const sq=state.squads.find(s=>s.pilot===f.pilot);
    if(sq){
      const d=sq.drones.find(d=>d.name.toLowerCase()===f.drone.toLowerCase());
      if(d){d.qty++;}
      else{sq.drones.push({name:f.drone,qty:1});}
    }
    // Удаляем соответствующую запись о потере из transfers
    const lossIdx=(state.transfers||[]).findIndex(t=>
      t.type==='loss'&&t.pilot===f.pilot&&t.drone===f.drone&&t.date===f.date
    );
    if(lossIdx>-1)state.transfers.splice(lossIdx,1);
    // Синхронизируем склад и расчёты
    setTimeout(()=>syncStockAndSquads(),300);
  }
  state.flights.splice(idx,1);
  saveLocal();
  logAction('flight','delete','Удалён вылет '+(f?.pilot||'')+' '+(f?.date||'')+' '+(f?.time||''));
  renderAdminFlights();
  renderDashboard();
  renderInventory();
}

function renderAdminStock(){
  document.getElementById('adminStockList').innerHTML=state.stock.length?`
    <table>
      <thead><tr><th>Название</th><th>Кол-во</th><th>Статус</th><th>Действие</th></tr></thead>
      <tbody>${state.stock.map((d,i)=>`<tr>
        <td><input style="width:120px" value="${d.name}" onchange="adminEditStock(${i},'name',this.value)"></td>
        <td><input style="width:60px" type="number" min="0" value="${d.qty}" onchange="adminEditStock(${i},'qty',parseInt(this.value)||0)"></td>
        <td><select onchange="adminEditStock(${i},'status',this.value)">
          <option value="bg" ${d.status==='bg'?'selected':''}>БГ</option>
          <option value="nbg" ${d.status==='nbg'?'selected':''}>Не БГ</option>
          <option value="lost" ${d.status==='lost'?'selected':''}>Списан</option>
        </select></td>
        <td><button class="btn btn-danger btn-sm" onclick="adminDeleteStock(${i})">Удалить</button></td>
      </tr>`).join('')}
      </tbody>
    </table>`:'<div style="color:var(--muted);padding:8px">Нет позиций</div>';
}

function adminEditStock(idx,field,val){
  if(state.stock[idx])state.stock[idx][field]=val;
  saveLocal();
  renderDashboard();
}

function adminDeleteStock(idx){
  if(!confirm('Удалить позицию со склада?'))return;
  state.stock.splice(idx,1);
  saveLocal();
  renderAdminStock();
  renderDashboard();
}

function adminAddStock(){
  const n=document.getElementById('adm-newName').value.trim();
  const q=parseInt(document.getElementById('adm-newQty').value)||1;
  const s=document.getElementById('adm-newStatus').value;
  if(!n)return;
  const ex=state.stock.find(d=>d.name.toLowerCase()===n.toLowerCase()&&d.status===s);
  if(ex){ex.qty+=q;}
  else{state.stock.push({name:n,qty:q,status:s});}
  const op={
    id:Date.now()+'_'+Math.random().toString(36).slice(2),
    type:'arrival',
    date:new Date().toISOString().slice(0,10),
    time:new Date().toTimeString().slice(0,5),
    drone:n,qty:q,note:'статус: '+s
  };
  if(!state.transfers)state.transfers=[];
  state.transfers.unshift(op);
  saveLocal();
  localStorage.setItem('last_local_change',Date.now().toString());
  appendToCloud('transfers',op);
  syncStockAndSquads();
  logAction('stock','add','Поступление (адм): '+n+' ×'+q+' ('+s+')');
  renderAdminStock();
  renderDashboard();
  document.getElementById('adm-newName').value='';
}

function renderAdminSquads(){
  document.getElementById('adminSquadList').innerHTML=state.squads.length?`
    <table>
      <thead><tr><th>Пилот</th><th>БПЛА</th><th>Кол-во</th><th>Действие</th></tr></thead>
      <tbody>${state.squads.flatMap((sq,si)=>sq.drones.map((d,di)=>`<tr>
        <td>${di===0?`<input style="width:90px" value="${sq.pilot}" onchange="adminEditSquadPilot(${si},this.value)">`:'&nbsp;'}</td>
        <td><input style="width:90px" value="${d.name}" onchange="adminEditSquadDrone(${si},${di},'name',this.value)"></td>
        <td><input style="width:55px" type="number" min="0" value="${d.qty}" onchange="adminEditSquadDrone(${si},${di},'qty',parseInt(this.value)||0)"></td>
        <td>${di===0?`<button class="btn btn-danger btn-sm" onclick="adminDeleteSquad(${si})">Удалить расчёт</button>`:'&nbsp;'}</td>
      </tr>`)).join('')}
      </tbody>
    </table>`:'<div style="color:var(--muted);padding:8px">Нет расчётов</div>';
}

function adminEditSquadPilot(si,val){
  if(state.squads[si])state.squads[si].pilot=val;
  saveLocal();
}
function adminEditSquadDrone(si,di,field,val){
  if(state.squads[si]&&state.squads[si].drones[di])state.squads[si].drones[di][field]=val;
  saveLocal();
}
function adminDeleteSquad(si){
  if(!confirm('Удалить расчёт '+state.squads[si].pilot+'?'))return;
  state.squads.splice(si,1);
  saveLocal();
  renderAdminSquads();
  renderDashboard();
}
function adminAddSquad(){
  const p=document.getElementById('adm-newPilot').value.trim();
  const ds=document.getElementById('adm-newPilotDrones').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!p)return;
  state.squads.push({pilot:p,drones:ds.map(n=>({name:n,qty:1}))});
  saveLocal();
  renderAdminSquads();
  renderDashboard();
  document.getElementById('adm-newPilot').value='';
  document.getElementById('adm-newPilotDrones').value='';
}

function adminManualSave(){
  saveLocal();
  const el=document.getElementById('saveStatus');
  el.textContent='✓ Сохранено в браузер — '+new Date().toLocaleString('ru');
  el.style.color='#166534';
}

function adminExportJSON(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='bpla_backup_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
  URL.revokeObjectURL(a.href);
  const el=document.getElementById('saveStatus');
  el.textContent='✓ Файл скачан — '+a.download;
  el.style.color='#166534';
}

function adminImportJSON(input){
  const file=input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const imported=JSON.parse(e.target.result);
      if(!imported.flights||!imported.stock)throw new Error('Неверный формат');
      if(!confirm('Заменить все текущие данные данными из файла?'))return;
      state=imported;
      saveLocal();
      renderDashboard();
      renderAdminFlights();
      renderAdminStock();
      renderAdminSquads();
      const el=document.getElementById('saveStatus');
      el.textContent='✓ Данные загружены из файла: '+file.name;
      el.style.color='#166534';
    }catch(err){
      alert('Ошибка загрузки файла: '+err.message);
    }
  };
  reader.readAsText(file);
  input.value='';
}

function adminClearFlights(){
  if(!confirm('Удалить ВСЕ вылеты из базы? Это действие необратимо.'))return;
  state.flights=[];
  saveLocal();
  renderAdminFlights();
  renderDashboard();
  const el=document.getElementById('saveStatus');
  el.textContent='Все вылеты удалены — '+new Date().toLocaleString('ru');
  el.style.color='#dc2626';
}

function adminResetAll(){
  if(!confirm('ПОЛНЫЙ СБРОС всех данных? Склад, расчёты и вылеты будут удалены. Необратимо.'))return;
  if(!confirm('Вы уверены? Данные будут потеряны.'))return;
  localStorage.removeItem('droneState');
  location.reload();
}

// ============ DASHBOARD ============
function renderDashboard(){
  const now=new Date();
  const today=now.toISOString().slice(0,10);
  const yest=new Date(now-864e5).toISOString().slice(0,10);
  const weekAgo=new Date(now-7*864e5).toISOString().slice(0,10);
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);

  // --- БПЛА на учёте ---
  const allDrones=[
    ...state.stock.map(d=>({name:d.name,qty:d.qty,loc:'stock',status:d.status})),
    ...state.squads.flatMap(sq=>sq.drones.map(d=>({name:d.name,qty:d.qty,loc:sq.pilot,status:'bg'})))
  ];
  const totalAll=allDrones.reduce((s,d)=>s+Math.max(0,d.qty),0);
  const totalStock=state.stock.filter(d=>d.status==='bg'&&d.qty!==0).reduce((s,d)=>s+d.qty,0);
  // Группировка по названию
  const byName={};
  allDrones.forEach(d=>{if(!byName[d.name])byName[d.name]=0;byName[d.name]+=d.qty;});
  const stockByName={};
  state.stock.filter(d=>d.status==='bg').forEach(d=>{stockByName[d.name]=(stockByName[d.name]||0)+d.qty;});

  document.getElementById('st-total').textContent=totalAll;
  document.getElementById('st-total-detail').innerHTML=
    Object.entries(byName).filter(([,q])=>q!==0).sort((a,b)=>b[1]-a[1]).map(([n,q])=>
      `<span style="color:${q<0?'var(--red)':'var(--text2)'}">${n}: <b style="color:${q<0?'var(--red)':'var(--green)'}">${q}</b></span>`
    ).join('<br>');

  document.getElementById('st-stock').textContent=totalStock;
  document.getElementById('st-stock-detail').innerHTML=
    Object.entries(stockByName).length
      ? Object.entries(stockByName).sort((a,b)=>b[1]-a[1]).map(([n,q])=>
          `<span style="color:var(--text2)">${n}: <b style="color:var(--green)">${q}</b></span>`
        ).join('<br>')
      :'<span style="color:var(--muted)">склад пуст</span>';

  // --- Вылеты ---
  const fAll=state.flights;
  const fToday=fAll.filter(x=>x.date===today);
  const fWeek=fAll.filter(x=>x.date>=weekAgo);
  const fMonth=fAll.filter(x=>x.date>=monthStart);
  const lossToday=fToday.filter(x=>x.returned==='no').length;
  const doneToday=fToday.filter(x=>x.result==='yes').length;
  const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';

  document.getElementById('st-flights').textContent=fToday.length;
  document.getElementById('st-flights-detail').innerHTML=`
    <span style="color:var(--text2)">Сегодня: <b style="color:var(--green)">${fToday.length}</b>${fToday.length?` · выполнено <b>${pct(doneToday,fToday.length)}</b>`:''}${lossToday?` · <b style="color:var(--red)">потерь: ${lossToday}</b>`:''}</span><br>
    <span style="color:var(--text2)">Неделя: <b style="color:var(--green)">${fWeek.length}</b> · потерь: <b style="color:${fWeek.filter(x=>x.returned==='no').length?'var(--red)':'var(--green)'}">${fWeek.filter(x=>x.returned==='no').length}</b></span><br>
    <span style="color:var(--text2)">Месяц: <b style="color:var(--green)">${fMonth.length}</b> · всего в базе: <b>${fAll.length}</b></span>`;

  // --- Расчёты ---
  document.getElementById('dashSquads').innerHTML=state.squads.map(sq=>{
    const sqFlightsToday=fToday.filter(x=>x.pilot===sq.pilot);
    const sqFlightsWeek=fWeek.filter(x=>x.pilot===sq.pilot);
    const lastFlight=[...fAll].filter(x=>x.pilot===sq.pilot).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time))[0];
    const hasNegative=sq.drones.some(d=>d.qty<0);
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div class="avatar">${sq.pilot.slice(0,2).toUpperCase()}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px;color:var(--green)">Пилот ${sq.pilot}</div>
          <div style="font-size:10px;color:var(--muted)">Последний выход: ${lastFlight?lastFlight.date+' '+lastFlight.time:'нет данных'}</div>
        </div>
        <span class="tag ${sqFlightsToday.length?'tag-ok':'tag-gray'}">${sqFlightsToday.length?sqFlightsToday.length+' вылетов сегодня':'нет вылетов'}</span>
        ${hasNegative?'<span class="tag tag-danger">⚠ расхождение</span>':''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">
        ${sq.drones.filter(d=>d.qty!==0).map(d=>`<span class="tag ${d.qty<0?'tag-danger':'tag-info'}" style="font-size:11px">${d.name}: <b>${d.qty}</b></span>`).join('')}${sq.drones.every(d=>d.qty===0)?'<span style="font-size:11px;color:var(--muted)">нет дронов</span>':''}
      </div>
      <div style="font-size:10px;color:var(--muted)">За неделю: ${sqFlightsWeek.length} вылетов · потерь: ${sqFlightsWeek.filter(x=>x.returned==='no').length}</div>
    </div>`;
  }).join('')||'<div style="color:var(--muted);padding:8px">Нет расчётов</div>';

  // --- Вылеты сегодня / вчера ---
  const sortDesc=(a,b)=>(b.date+b.time).localeCompare(a.date+a.time);
  const todayFlights=[...fAll].filter(x=>x.date===today).sort(sortDesc);
  const yesterdayFlights=[...fAll].filter(x=>x.date===yest).sort(sortDesc);

  const flightRow=x=>`
    <div style="display:flex;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <span style="font-size:10px;color:var(--muted);min-width:38px">${x.time}</span>
      <span style="font-weight:700;color:var(--green);min-width:60px">${x.pilot}</span>
      <span class="tag ${x.returned==='no'?'tag-danger':'tag-ok'}" style="font-size:10px">${x.returned==='no'?'потеря':'вылет'}</span>
      <span class="tag ${x.result==='yes'?'tag-ok':'tag-danger'}" style="font-size:10px">${x.result==='yes'?'✅':'❌'}</span>
      <span style="font-size:11px;color:var(--text2)">${x.drone||'—'}</span>
      ${x.target?`<span style="font-size:10px;color:var(--muted)">📍${x.target}</span>`:''}
      ${x.returned==='no'?`<span style="font-size:10px;color:var(--red)">борт потерян</span>`:''}
    </div>`;

  let html='';
  if(todayFlights.length){
    html+=`<div style="font-size:10px;font-weight:700;color:var(--green);letter-spacing:1px;text-transform:uppercase;padding:4px 0;margin-top:4px">Сегодня — ${todayFlights.length} вылетов</div>`;
    html+=todayFlights.map(flightRow).join('');
  }
  if(yesterdayFlights.length){
    html+=`<div style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;padding:4px 0;margin-top:8px;border-top:1px solid var(--border2)">Вчера — ${yesterdayFlights.length} вылетов</div>`;
    html+=yesterdayFlights.slice(0,8).map(flightRow).join('');
    if(yesterdayFlights.length>8)html+=`<div style="font-size:10px;color:var(--muted);padding:4px 0">... ещё ${yesterdayFlights.length-8}</div>`;
  }
  if(!todayFlights.length&&!yesterdayFlights.length){
    const last=[...fAll].sort(sortDesc).slice(0,5);
    html='<div style="font-size:10px;color:var(--muted);padding:4px 0">Вылетов сегодня и вчера нет</div>';
    if(last.length)html+=`<div style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;padding:8px 0 4px;border-top:1px solid var(--border2)">Последние вылеты</div>`+last.map(flightRow).join('');
  }
  document.getElementById('dashRecent').innerHTML=html;
}

// ============ INVENTORY ============
function renderInventory(){
  const bg=state.stock.filter(d=>d.status==='bg');
  const nbg=state.stock.filter(d=>d.status!=='bg'&&d.qty!==0);
  document.getElementById('stockListBG').innerHTML=bg.length?bg.map(d=>`
    <div class="drone-row"><div class="drone-name">${d.name}</div><div class="qty">${d.qty}</div></div>`).join(''):'<div style="color:var(--muted);padding:8px">Пусто</div>';
  document.getElementById('stockListNBG').innerHTML=nbg.length?nbg.map(d=>`
    <div class="drone-row"><div class="drone-name">${d.name}</div><span class="tag tag-warn">не БГ</span><div class="qty">${d.qty}</div></div>`).join(''):'<div style="color:var(--muted);padding:8px">Нет</div>';

  document.getElementById('squadTable').innerHTML=state.squads.map(sq=>`
    <tr style="background:var(--green-dim)">
      <td colspan="4" style="padding:8px 8px 4px;border-bottom:none">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:30px;height:30px;border:1px solid var(--border2);background:var(--card);color:var(--green);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0">${sq.pilot.slice(0,2).toUpperCase()}</div>
          <span style="font-weight:700;font-size:13px;color:var(--green)">Пилот ${sq.pilot}</span>
          <span class="tag tag-ok" style="margin-left:auto">БГ</span>
        </div>
      </td>
    </tr>
    ${sq.drones.filter(d=>d.qty!==0).map((d,i)=>`
      <tr>
        <td style="padding-left:48px;color:var(--muted);font-size:11px">${i===0?'БПЛА':''}</td>
        <td>${d.name}</td>
        <td><span class="qty" style="${d.qty<0?'border-color:var(--red);color:var(--red)':''}">${d.qty}</span>${d.qty<0?'<span style="font-size:10px;color:var(--red);margin-left:4px">⚠ расхождение</span>':''}</td>
        <td></td>
      </tr>`).join('')}${sq.drones.filter(d=>d.qty!==0).length===0?'<tr><td colspan="4" style="padding-left:48px;color:var(--muted);font-size:11px">нет дронов</td></tr>':''}    
  `).join('');
  renderTransfersLog();
}

function toggleAddDrone(){
  const c=document.getElementById('addDroneCard');
  c.style.display=c.style.display==='none'?'block':'none';
}

function addDrone(){
  const n=document.getElementById('newDroneName').value.trim();
  const q=parseInt(document.getElementById('newDroneQty').value)||1;
  if(!n)return;
  const ex=state.stock.find(d=>d.name.toLowerCase()===n.toLowerCase()&&d.status==='bg');
  if(ex){ex.qty+=q;}
  else{state.stock.push({name:n,qty:q,status:'bg'});}
  const op={
    id:Date.now()+'_'+Math.random().toString(36).slice(2),
    type:'arrival',
    date:new Date().toISOString().slice(0,10),
    time:new Date().toTimeString().slice(0,5),
    drone:n,qty:q,note:''
  };
  if(!state.transfers)state.transfers=[];
  state.transfers.unshift(op);
  saveLocal();
  localStorage.setItem('last_local_change',Date.now().toString());
  appendToCloud('transfers',op);
  syncStockAndSquads();
  renderInventory();
  toggleAddDrone();
  document.getElementById('newDroneName').value='';
  document.getElementById('newDroneQty').value='1';
  logAction('stock','add','Поступление: '+n+' ×'+q);
}

function openTransferForm(){
  document.getElementById('transferCard').style.display='block';
  document.getElementById('exchangeCard').style.display='none';
}

function openExchangeForm(){
  document.getElementById('exchangeCard').style.display='block';
  document.getElementById('transferCard').style.display='none';
  document.getElementById('exDate').value=new Date().toISOString().slice(0,10);
}

function saveTransfer(){
  const from=document.getElementById('transFrom').value;
  const to=document.getElementById('transTo').value;
  const drone=document.getElementById('transDrone').value.trim();
  const qty=parseInt(document.getElementById('transQty').value)||1;
  const note=document.getElementById('transNote').value.trim();
  if(!drone){alert('Укажите БПЛА');return;}
  if(from===to){alert('Отправитель и получатель совпадают');return;}

  // Списать у отправителя
  if(from==='склад'){
    const item=state.stock.find(d=>d.name.toLowerCase()===drone.toLowerCase()&&d.status==='bg');
    if(!item||item.qty<qty){
      if(!confirm(`На складе недостаточно "${drone}". Всё равно оформить?`))return;
    } else {
      item.qty-=qty;
      if(item.qty===0)state.stock=state.stock.filter(d=>d!==item);
    }
  } else {
    const sq=state.squads.find(s=>s.pilot===from);
    if(sq){
      const di=sq.drones.find(d=>d.name.toLowerCase()===drone.toLowerCase());
      if(!di||di.qty<qty){
        if(!confirm(`У пилота ${from} недостаточно "${drone}". Всё равно оформить?`))return;
      } else {
        di.qty-=qty;
        if(di.qty===0)sq.drones=sq.drones.filter(d=>d!==di);
      }
    }
  }

  // Зачислить получателю
  if(to==='склад'){
    const item=state.stock.find(d=>d.name.toLowerCase()===drone.toLowerCase()&&d.status==='bg');
    if(item){item.qty+=qty;}
    else{state.stock.push({name:drone,qty,status:'bg'});}
  } else {
    let sq=state.squads.find(s=>s.pilot===to);
    if(!sq){sq={pilot:to,drones:[]};state.squads.push(sq);}
    const di=sq.drones.find(d=>d.name.toLowerCase()===drone.toLowerCase());
    if(di){di.qty+=qty;}
    else{sq.drones.push({name:drone,qty});}
  }

  if(!state.transfers)state.transfers=[];
  const op={
    id:Date.now()+'_'+Math.random().toString(36).slice(2),
    type:'transfer',
    date:new Date().toISOString().slice(0,10),
    time:new Date().toTimeString().slice(0,5),
    from,to,drone,qty,note
  };
  state.transfers.unshift(op);
  saveLocal();
  localStorage.setItem('last_local_change',Date.now().toString());
  appendToCloud('transfers',op);
  setTimeout(()=>syncStockAndSquads(),300);
  renderInventory();
  renderDashboard();
  document.getElementById('transferCard').style.display='none';
  document.getElementById('transDrone').value='';
  document.getElementById('transNote').value='';
  logAction('transfer','add',from+' → '+to+': '+drone+' ×'+qty);
}

function saveExchange(){
  const date=document.getElementById('exDate').value||new Date().toISOString().slice(0,10);
  const unit=document.getElementById('exUnit').value.trim();
  const give=document.getElementById('exGive').value.trim();
  const giveQty=parseInt(document.getElementById('exGiveQty').value)||1;
  const get=document.getElementById('exGet').value.trim();
  const getQty=parseInt(document.getElementById('exGetQty').value)||1;
  const note=document.getElementById('exNote').value.trim();
  if(!unit||!give||!get){alert('Заполните подразделение, отданный и полученный борт');return;}

  // Списать отданный борт со склада
  const giveItem=state.stock.find(d=>d.name.toLowerCase()===give.toLowerCase()&&d.status==='bg');
  if(giveItem){
    giveItem.qty=Math.max(0,giveItem.qty-giveQty);
    if(giveItem.qty===0)state.stock=state.stock.filter(d=>d!==giveItem);
  } else {
    if(!confirm(`"${give}" не найден на складе. Всё равно оформить?`))return;
  }

  // Оприходовать полученный борт на склад
  const getItem=state.stock.find(d=>d.name.toLowerCase()===get.toLowerCase()&&d.status==='bg');
  if(getItem){getItem.qty+=getQty;}
  else{state.stock.push({name:get,qty:getQty,status:'bg'});}

  // Записать в историю
  if(!state.transfers)state.transfers=[];
  state.transfers.unshift({
    type:'exchange',
    date,
    time:new Date().toTimeString().slice(0,5),
    unit,
    give,giveQty,
    get,getQty,
    note
  });

  saveLocal();
  renderInventory();
  renderDashboard();
  document.getElementById('exchangeCard').style.display='none';
  ['exUnit','exGive','exGet','exNote'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('exGiveQty').value='1';
  document.getElementById('exGetQty').value='1';
}

function renderTransfersLog(){
  if(!state.transfers||!state.transfers.length){
    document.getElementById('transfersLog').innerHTML='<div style="color:var(--muted);font-size:12px">Нет операций</div>';
    return;
  }
  document.getElementById('transfersLog').innerHTML=state.transfers.slice(0,30).map(op=>{
    if(op.type==='loss'){
      return `<div style="padding:8px 0;border-bottom:0.5px solid var(--border);font-size:12px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="tag tag-danger">✈ Потеря</span>
          <span style="font-weight:600">${op.drone}</span>
          <span>пилот: ${op.pilot}</span>
          <span style="color:var(--muted)">${op.date} ${op.time||''}</span>
        </div>
      </div>`;
    } else if(op.type==='arrival'){
      return `<div style="padding:8px 0;border-bottom:0.5px solid var(--border);font-size:12px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="tag tag-ok">📦 Поступление</span>
          <span style="font-weight:600">${op.drone} × ${op.qty}</span>
          <span style="color:var(--muted)">${op.date} ${op.time||''}</span>
          ${op.note?`<span style="color:var(--muted);font-size:11px">· ${op.note}</span>`:''}
        </div>
      </div>`;
    } else if(op.type==='exchange'){
      return `<div style="padding:8px 0;border-bottom:0.5px solid var(--border);font-size:12px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
          <span class="tag" style="background:#ede9fe;color:#5b21b6">⇄ Обмен</span>
          <span style="font-weight:600">${op.unit}</span>
          <span style="color:var(--muted)">${op.date} ${op.time||''}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="tag tag-danger">Отдали: ${op.give} × ${op.giveQty}</span>
          <span style="color:var(--muted)">→</span>
          <span class="tag tag-ok">Получили: ${op.get} × ${op.getQty}</span>
          ${op.note?`<span style="color:var(--muted);font-size:11px">· ${op.note}</span>`:''}
        </div>
      </div>`;
    } else {
      return `<div style="padding:8px 0;border-bottom:0.5px solid var(--border);font-size:12px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="tag tag-info">Передача</span>
          <span>${op.from} → ${op.to}</span>
          <span style="font-weight:600">${op.drone} × ${op.qty}</span>
          <span style="color:var(--muted)">${op.date} ${op.time||''}</span>
          ${op.note?`<span style="color:var(--muted);font-size:11px">· ${op.note}</span>`:''}
        </div>
      </div>`;
    }
  }).join('');
}

// ============ FLIGHTS ============
function renderFlights(){
  const fp=document.getElementById('filterPilot').value;
  const fd=document.getElementById('filterDate').value;
  let f=[...state.flights];
  if(fp)f=f.filter(x=>x.pilot&&x.pilot.includes(fp));
  if(fd)f=f.filter(x=>x.date===fd);
  const toMs=x=>{
    const t=(x.time||'00:00').trim();
    const norm=t.includes(':')?t.split(':').map(p=>p.padStart(2,'0')).join(':'):'00:00';
    return new Date((x.date||'2000-01-01')+'T'+norm);
  };
  f.sort((a,b)=>toMs(b)-toMs(a));
  if(!f.length){
    document.getElementById('flightList').innerHTML='<div style="color:var(--muted);padding:16px;text-align:center">Нет вылетов</div>';
    fillDataLists();return;
  }
  // Автонумерация: считаем вылеты каждого пилота за каждый день
  const pilotDayCount={};
  [...f].sort((a,b)=>((a.date||'')+(a.time||'')).localeCompare((b.date||'')+(b.time||''))).forEach(x=>{
    const key=(x.pilot||'')+'|'+(x.date||'');
    pilotDayCount[key]=(pilotDayCount[key]||0)+1;
    x._autoNum=pilotDayCount[key];
  });
  document.getElementById('flightList').innerHTML=`
    <table style="table-layout:auto;width:100%">
      <thead><tr>
        <th style="width:100px">Дата</th>
        <th style="width:55px">Время</th>
        <th style="width:80px">Пилот</th>
        <th style="width:120px">Точка</th>
        <th style="width:90px">Боеприпас</th>
        <th style="white-space:nowrap">БПЛА</th>
        <th style="width:90px">Задача</th>
        <th style="width:75px">Борт</th>
        <th>Примечание</th>
        <th style="width:28px"></th>
      </tr></thead>
      <tbody>
        ${f.map(x=>{
          const idx=state.flights.indexOf(x);
          const editRow=renderFlightEditRow(x,idx);
          const num=x._autoNum||x.flightnum||'';
          // Форматируем дату дд.мм.гггг
          const dateFmt=x.date?x.date.split('-').reverse().join('.'):'';
          // Строка для копирования
          const copyStr='Пилот '+( x.pilot||'')
            +', '+dateFmt
            +', '+(x.time||'')
            +', '+(x.target||'')
            +', '+(x.ammo||'')
            +', '+(x.drone||'')
            +', '+(x.result==='yes'?'выполнена':'не выполнена')
            +', '+(x.returned==='yes'?'вернул':'потерян')
            +(x.note?', '+x.note:'');
          return `<tr style="${x.returned==='no'?'background:rgba(220,38,38,0.04)':''}">
            <td style="white-space:nowrap">${x.date||'—'}</td>
            <td style="white-space:nowrap;color:var(--muted)">${x.time||'—'}</td>
            <td style="font-weight:700;color:var(--green);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${num?'<span style="color:var(--muted);font-weight:400;font-size:10px">#'+num+' </span>':''}${x.pilot||'—'}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.target||'—'}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.ammo||'—'}</td>
            <td style="white-space:nowrap;padding-right:14px">${x.drone||'—'}</td>
            <td><span class="tag ${x.result==='yes'?'tag-ok':'tag-danger'}" style="font-size:10px">${x.result==='yes'?'✅ выполнена':'❌ нет'}</span></td>
            <td><span class="tag ${x.returned==='yes'?'tag-info':'tag-danger'}" style="font-size:10px">${x.returned==='yes'?'вернул':'потерян'}</span></td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10px">${x.note||''}</td>
            <td style="padding:2px 4px;width:36px"><button class="copy-flight-btn" data-copy="${copyStr.replace(/"/g,'&quot;').replace(/\n/g,' ')}" style="background:rgba(57,255,20,0.06);border:1px solid #22c55e;color:var(--green);cursor:pointer;font-size:16px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit" title="Копировать">⎘</button></td>
          </tr>${editRow?`<tr><td colspan="10" style="padding:0;border:none">${editRow}</td></tr>`:''}`
        }).join('')}
      </tbody>
    </table>`;
}

function fillDataLists(){
  // Считаем частоту использования каждого дрона за последние 30 дней
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-30);
  const freq={};
  state.flights.forEach(x=>{
    if(!x.drone)return;
    const d=new Date(x.date);
    const w=d>=cutoff?3:1; // свежие весят больше
    freq[x.drone]=(freq[x.drone]||0)+w;
  });
  // Все известные дроны: сначала из склада и расчётов, потом каталог
  const known=new Set([
    ...state.stock.map(d=>d.name),
    ...state.squads.flatMap(sq=>sq.drones.map(d=>d.name)),
    ...DRONE_CATALOG
  ]);
  // Сортируем: частые вверху, остальные по алфавиту
  const sorted=[...known].sort((a,b)=>(freq[b]||0)-(freq[a]||0)||(a.localeCompare(b,'ru')));
  const opts=sorted.map(v=>`<option value="${v}">`).join('');
  document.querySelectorAll('datalist[id^="dl-drones"]').forEach(dl=>dl.innerHTML=opts);

  // Пилоты
  const pilots=[...new Set(state.flights.map(x=>x.pilot).filter(Boolean))].sort();
  const pilotOpts=pilots.map(v=>`<option value="${v}">`).join('');
  const dlp=document.getElementById('dl-pilots');if(dlp)dlp.innerHTML=pilotOpts;

  // Боеприпасы
  const ammos=[...new Set(state.flights.map(x=>x.ammo).filter(Boolean))].sort();
  const ammoOpts=ammos.map(v=>`<option value="${v}">`).join('');
  const dla=document.getElementById('dl-ammo');if(dla)dla.innerHTML=ammoOpts;

  // Точки
  const targets=[...new Set(state.flights.map(x=>x.target).filter(Boolean))].sort();
  const tgtOpts=targets.map(v=>`<option value="${v}">`).join('');
  const dlt=document.getElementById('dl-targets');if(dlt)dlt.innerHTML=tgtOpts;

  // Обновляем селекты передачи пилотами из расчётов
  const pilotNames=state.squads.map(sq=>sq.pilot);
  const fromSel=document.getElementById('transFrom');
  const toSel=document.getElementById('transTo');
  if(fromSel){
    fromSel.innerHTML='<option value="склад">Склад</option>'+pilotNames.map(p=>`<option value="${p}">Пилот ${p}</option>`).join('');
  }
  if(toSel){
    toSel.innerHTML='<option value="склад">На склад</option>'+pilotNames.map(p=>`<option value="${p}">Пилот ${p}</option>`).join('');
  }
  rebuildRoleSelector();
  // Обновляем фильтр пилотов в журнале
  const fp=document.getElementById('filterPilot');
  if(fp){
    const cur=fp.value;
    const pilots=[...new Set(state.flights.map(x=>x.pilot).filter(Boolean))].sort();
    fp.innerHTML='<option value="">Все пилоты</option>'+pilots.map(p=>`<option value="${p}">${p}</option>`).join('');
    if(cur)[...fp.options].forEach(o=>{if(o.value===cur)o.selected=true;});
  }
  // Обновляем datalist боеприпасов
  ammoFillDatalist();
}

// ============ SQUAD EDITOR ============
function toggleSquadEditor(){
  const ed=document.getElementById('squadEditor');
  const show=ed.style.display==='none';
  ed.style.display=show?'block':'none';
  if(show)renderSquadEditor();
}

function renderSquadEditor(){
  const el=document.getElementById('squadEditorList');
  el.innerHTML=state.squads.map((sq,si)=>`
    <div style="border:0.5px solid var(--border2);padding:10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <input style="flex:1;font-weight:600" value="${sq.pilot}" onchange="squadEditPilot(${si},this.value)" placeholder="Имя пилота">
        <button class="btn btn-sm btn-primary" onclick="squadCleanZeros(${si})">Удалить нули</button>
        <button class="btn btn-danger btn-sm" onclick="squadDeletePilot(${si})">Удалить расчёт</button>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600">БПЛА расчёта:</div>
      ${sq.drones.map((d,di)=>`
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px${d.qty===0?';opacity:0.5':''}">
          <input style="flex:1" list="dl-drones-smart" value="${d.name}" onchange="squadEditDrone(${si},${di},'name',this.value)" autocomplete="off">
          <input type="number" style="width:60px${d.qty===0?';color:var(--red)':''}" min="0" value="${d.qty}" onchange="squadEditDrone(${si},${di},'qty',parseInt(this.value)||0)">
          <button class="btn btn-sm" style="color:var(--red)" onclick="squadDeleteDrone(${si},${di})">✕</button>
        </div>`).join('')}
      <button class="btn btn-sm btn-primary" style="font-size:11px;padding:3px 10px" onclick="squadAddDrone(${si})">+ БПЛА</button>
    </div>`).join('');
}

function squadCleanZeros(si){
  state.squads[si].drones=state.squads[si].drones.filter(d=>d.qty!==0);
  saveLocal();
  localStorage.setItem('last_local_change',Date.now().toString());
  syncStockAndSquads();
  renderSquadEditor();
  renderInventory();
}
function squadEditPilot(si,val){state.squads[si].pilot=val;saveLocal();renderInventory();}
function squadEditDrone(si,di,field,val){state.squads[si].drones[di][field]=val;saveLocal();renderInventory();}
function squadDeleteDrone(si,di){
  state.squads[si].drones.splice(di,1);
  saveLocal();renderSquadEditor();renderInventory();
}
function squadAddDrone(si){
  state.squads[si].drones.push({name:'',qty:1});
  saveLocal();renderSquadEditor();
}
function squadDeletePilot(si){
  if(!confirm('Удалить расчёт '+state.squads[si].pilot+'?'))return;
  state.squads.splice(si,1);
  saveLocal();renderSquadEditor();renderInventory();rebuildRoleSelector();
}
function squadAddPilot(){
  const p=document.getElementById('sq-newPilot').value.trim();
  const ds=document.getElementById('sq-newDrones').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!p){alert('Укажите имя пилота');return;}
  state.squads.push({pilot:p,drones:ds.map(n=>({name:n,qty:1}))});
  saveLocal();
  renderSquadEditor();
  renderInventory();
  rebuildRoleSelector();
  document.getElementById('sq-newPilot').value='';
  document.getElementById('sq-newDrones').value='';
}

// Списать дрон при потере — ищем сначала у пилота, потом на складе
function writeDroneLoss(pilot, drone, date, time){
  if(!drone)return;
  const dn=drone.toLowerCase();

  // Всегда списываем у пилота — даже если уйдёт в минус
  let sq=state.squads.find(s=>s.pilot===pilot);
  if(!sq){
    // Пилот не в расчётах — создаём запись с -1
    sq={pilot,drones:[]};
    state.squads.push(sq);
  }
  const di=sq.drones.find(d=>d.name.toLowerCase()===dn);
  if(di){
    di.qty--;
  } else {
    // Борта не было в списке пилота — добавляем с qty=-1
    sq.drones.push({name:drone,qty:-1});
  }

  // Логируем в историю перемещений
  if(!state.transfers)state.transfers=[];
  const lossOp={
    id:Date.now()+'_loss_'+Math.random().toString(36).slice(2),
    type:'loss',
    date:date||new Date().toISOString().slice(0,10),
    time:time||new Date().toTimeString().slice(0,5),
    pilot,drone,qty:1,note:''
  };
  state.transfers.unshift(lossOp);
  // Сразу синхронизируем с облаком
  appendToCloud('transfers',lossOp);
}

function saveManualFlight(){
  const fn=document.getElementById('mf-flightnum').value;
  const f={
    date:document.getElementById('mf-date').value||new Date().toISOString().slice(0,10),
    time:document.getElementById('mf-time').value||new Date().toTimeString().slice(0,5),
    pilot:document.getElementById('mf-pilot').value.trim(),
    target:document.getElementById('mf-target').value.trim(),
    ammo:document.getElementById('mf-ammo').value.trim(),
    drone:document.getElementById('mf-drone').value.trim(),
    result:document.getElementById('mf-result').value,
    returned:document.getElementById('mf-returned').value,
    flightnum:fn?parseInt(fn):null,
    note:document.getElementById('mf-note').value.trim(),
  };
  if(!f.pilot){alert('Укажите пилота');return;}
  if(f.returned==='no'&&f.drone){writeDroneLoss(f.pilot,f.drone,f.date,f.time);setTimeout(()=>syncStockAndSquads(),500);}
  f.id=f.id||Date.now()+'_'+Math.random().toString(36).slice(2);
  f._savedTs=Date.now();
  f._submittedBy=authUser.login||'';
  if(!navigator.onLine)state.offlineQueue.push(f);
  state.flights.unshift(f);
  saveLocal();
  checkNet();
  renderFlights();
  renderInventory();
  renderDashboard();
  appendToCloud('flights',f);
  logAction('flight','add','Вылет '+f.pilot+' #'+f.flightnum+' '+f.drone+(f.returned==='no'?' [потеря]':''));
  ['mf-pilot','mf-target','mf-ammo','mf-drone','mf-note','mf-flightnum'].forEach(id=>document.getElementById(id).value='');
  fillDataLists();
}

// ============ API KEY ============
function saveApiKey(val){
  try{localStorage.setItem('anthropicKey',val);}catch(e){}
  const st=document.getElementById('apiKeyStatus');
  if(val.startsWith('sk-ant')){st.textContent='✓ ключ сохранён';st.style.color='#166534';}
  else if(val){st.textContent='⚠ ключ должен начинаться с sk-ant-';st.style.color='#dc2626';}
  else{st.textContent='';} 
}
function loadApiKey(){
  try{
    const k=localStorage.getItem('anthropicKey')||'';
    const inp=document.getElementById('apiKeyInput');
    if(inp&&k){inp.value=k;saveApiKey(k);}
  }catch(e){}
}

// ============ IMPORT / PARSE ============
async function parseMessages(){
  const raw=document.getElementById('rawMsg').value.trim();
  if(!raw)return;
  const apiKey=(document.getElementById('apiKeyInput').value||'').trim();
  const st=document.getElementById('parseStatus');
  if(!apiKey||!apiKey.startsWith('sk-ant')){
    st.textContent='Укажите API-ключ Anthropic выше (начинается с sk-ant-...)';
    st.style.color='#dc2626';
    return;
  }
  st.textContent='Распознаю...';
  st.style.color='var(--muted)';
  document.getElementById('parsedCards').innerHTML='';
  // Подготавливаем строки ДО запроса — передаём парсеру с номерами
  const srcLines=raw.split('\n').map(l=>l.trim());
  const srcNonEmpty=srcLines.filter(Boolean);
  const numberedInput=srcLines.map((l,i)=>`[${i}] ${l}`).join('\n');
  try{
    const resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({
        model:'claude-sonnet-4-6',
        max_tokens:2000,
        system:`Ты парсер военных сообщений о вылетах дронов ФПВ. Из входного текста извлеки КАЖДЫЙ вылет отдельно.
Каждая строка входного текста помечена номером в квадратных скобках [N]. Используй этот номер как _line.
Верни ТОЛЬКО валидный JSON-массив без лишнего текста, пример:
[{"_line":0,"date":"2026-05-23","time":"08:34","pilot":"Рама","flightnum":1,"target":"305 Вишня","ammo":"Доставка","drone":"Гамаюн13","result":"yes","returned":"yes","note":""},...]
Правила:
- _line: ТОЧНЫЙ номер строки [N] из которой взят этот вылет — обязателен и уникален для каждого вылета
- время всегда в формате HH:MM с ведущим нулём (08:34, не 8:34)
- flightnum: число вылета если упомянуто ("первый вылет"=1, "второй вылет"=2 и т.д.), иначе null
- note: ТОЛЬКО дополнительные обстоятельства (перебили видео, потеря управления, спикировал и т.п.) — НЕ номер вылета
- returned: вернул/борт вернул = yes; не вернули/спикировал/перебили/потеря управления/борт остался/борт не вернул = no
- result: на месте/выполнена = yes; не на месте/не выполнена = no
- drone: нормализуй написание к ближайшему из словаря: ${DRONE_CATALOG.join(', ')}
Верни ТОЛЬКО JSON-массив.`,
        messages:[{role:'user',content:numberedInput}]
      })
    });
    if(!resp.ok){
      const err=await resp.json().catch(()=>({}));
      throw new Error(`HTTP ${resp.status}: ${err.error?.message||resp.statusText}`);
    }
    const data=await resp.json();
    const txt=data.content.map(i=>i.text||'').join('');
    const parsed=JSON.parse(txt.replace(/```json|```/g,'').trim());
    parsed.forEach((item,i)=>{
      const lineIdx=typeof item._line==='number'?item._line:null;
      if(lineIdx!==null&&srcLines[lineIdx]&&srcLines[lineIdx].trim()){
        item._src=srcLines[lineIdx].trim();
      } else {
        item._src=srcNonEmpty[i]||'';
      }
      delete item._line;
    });
    st.textContent=`Распознано: ${parsed.length} вылет(ов). Проверьте и сохраните.`;
    st.style.color='var(--green2)';
    renderParsedCards(parsed);
  }catch(e){
    st.textContent='Ошибка: '+e.message;
    st.style.color='#dc2626';
  }
}

function renderParsedCards(items){
  document.getElementById('parsedCards').innerHTML=items.map((x,i)=>`
    <div class="card" style="margin-bottom:8px" id="pcard-${i}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700;color:var(--muted)">Вылет ${x.flightnum||i+1} — ${x.pilot||'?'} · ${x.date||''} ${x.time||''}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-success btn-sm" id="pbtn-save-${i}" onclick="confirmParsed(${i})">✓ Сохранить</button>
          <button class="btn btn-sm" style="color:var(--muted)" onclick="hideCard(${i})">Скрыть</button>
        </div>
      </div>
      ${x._src?`<div id="psrc-${i}" style="font-size:11px;color:var(--muted);background:var(--bg2);border:1px solid var(--border);padding:5px 8px;margin-bottom:8px;font-family:monospace;white-space:pre-wrap">${x._src}</div>`:''}
      <div class="form-row cols3">
        <div><label>Дата</label><input id="p${i}-date" type="date" value="${x.date}"></div>
        <div><label>Время</label><input id="p${i}-time" type="time" value="${x.time}"></div>
        <div><label>Пилот</label><input id="p${i}-pilot" value="${x.pilot||''}"></div>
      </div>
      <div class="form-row cols3">
        <div><label>Точка</label><input id="p${i}-target" value="${x.target||''}"></div>
        <div><label>Боеприпас / груз</label><input id="p${i}-ammo" value="${x.ammo||''}"></div>
        <div><label>Номер вылета</label><input id="p${i}-flightnum" type="number" min="1" value="${x.flightnum||''}"></div>
      </div>
      <div class="form-row cols3">
        <div><label>БПЛА</label><input id="p${i}-drone" value="${x.drone||''}"></div>
        <div><label>Задача</label>
          <select id="p${i}-result"><option value="yes" ${x.result==='yes'?'selected':''}>Выполнена</option><option value="no" ${x.result==='no'?'selected':''}>Не выполнена</option></select>
        </div>
        <div><label>Борт</label>
          <select id="p${i}-returned"><option value="yes" ${x.returned==='yes'?'selected':''}>Вернул</option><option value="no" ${x.returned==='no'?'selected':''}>Потерян</option></select>
        </div>
      </div>
      <div><label>Примечание</label><input id="p${i}-note" value="${x.note||''}"></div>
    </div>`).join('');
}

function hideCard(i){
  const card=document.getElementById(`pcard-${i}`);
  if(card)card.style.display='none';
}

function confirmParsed(i){
  const fn=document.getElementById(`p${i}-flightnum`).value;
  const f={
    date:document.getElementById(`p${i}-date`).value,
    time:document.getElementById(`p${i}-time`).value,
    pilot:document.getElementById(`p${i}-pilot`).value,
    target:document.getElementById(`p${i}-target`).value,
    ammo:document.getElementById(`p${i}-ammo`).value,
    drone:document.getElementById(`p${i}-drone`).value,
    result:document.getElementById(`p${i}-result`).value,
    returned:document.getElementById(`p${i}-returned`).value,
    flightnum:fn?parseInt(fn):null,
    note:document.getElementById(`p${i}-note`).value,
  };
  if(f.returned==='no'&&f.drone){writeDroneLoss(f.pilot,f.drone,f.date,f.time);setTimeout(()=>syncStockAndSquads(),500);}
  f.id=f.id||Date.now()+'_'+Math.random().toString(36).slice(2);
  if(!navigator.onLine)state.offlineQueue.push(f);
  state.flights.unshift(f);
  saveLocal();
  checkNet();
  renderDashboard();
  renderInventory();
  appendToCloud('flights',f);
  const card=document.getElementById(`pcard-${i}`);
  // Скрываем исходную строку сразу
  const src=document.getElementById(`psrc-${i}`);
  if(src)src.style.display='none';
  card.style.background='var(--green-dim)';
  card.style.border='1px solid var(--green3)';
  const btn=card.querySelector(`#pbtn-save-${i}`);
  btn.textContent='✓ Сохранено';btn.disabled=true;
  card.style.pointerEvents='none';
  setTimeout(()=>{card.style.display='none';},800);
}

function clearParse(){
  document.getElementById('rawMsg').value='';
  document.getElementById('parsedCards').innerHTML='';
  document.getElementById('parseStatus').textContent='';
}

// ============ REPORT ============
function fillReportFilters(){
  const pilotSel=document.getElementById('repPilot');
  const droneSel=document.getElementById('repDrone');
  if(!pilotSel||!droneSel)return;
  const curPilot=pilotSel.value;
  const curDrone=droneSel.value;
  const pilots=[...new Set(state.flights.map(x=>x.pilot).filter(Boolean))].sort();
  const drones=[...new Set(state.flights.map(x=>x.drone).filter(Boolean))].sort();
  pilotSel.innerHTML='<option value="">Все пилоты</option>'+pilots.map(p=>`<option value="${p}">${p}</option>`).join('');
  droneSel.innerHTML='<option value="">Все борты</option>'+drones.map(d=>`<option value="${d}">${d}</option>`).join('');
  if(curPilot)[...pilotSel.options].forEach(o=>{if(o.value===curPilot)o.selected=true;});
  if(curDrone)[...droneSel.options].forEach(o=>{if(o.value===curDrone)o.selected=true;});
}

function buildReport(){
  fillReportFilters();
  const type=document.getElementById('repType').value;
  const from=document.getElementById('repFrom').value;
  const to=document.getElementById('repTo').value;
  const filterPilot=document.getElementById('repPilot').value;
  const filterDrone=document.getElementById('repDrone').value;
  const out=document.getElementById('reportOutput');

  // Базовая фильтрация вылетов — применяется везде кроме складского
  function getFlights(){
    let f=[...state.flights];
    if(from)f=f.filter(x=>x.date>=from);
    if(to)f=f.filter(x=>x.date<=to);
    if(filterPilot)f=f.filter(x=>x.pilot===filterPilot);
    if(filterDrone)f=f.filter(x=>x.drone===filterDrone);
    return f;
  }

  // Подпись активных фильтров
  const filterLabel=[
    filterPilot?`пилот: ${filterPilot}`:'',
    filterDrone?`борт: ${filterDrone}`:'',
    from||to?`${from||'...'} — ${to||'...'}`:'',
  ].filter(Boolean).join(' · ');

  if(type==='stock'){
    const stockBG=state.stock.filter(d=>d.status==='bg');
    const stockNBG=state.stock.filter(d=>d.status!=='bg');

    // Перемещения за последние 24 часа
    const now=Date.now();
    const day=24*60*60*1000;
    const todayStr=new Date().toISOString().slice(0,10);
    const recentTransfers=(state.transfers||[]).filter(op=>{
      const dt=new Date(op.date+'T'+(op.time||'00:00'));
      return (now-dt.getTime())<=day;
    }).sort((a,b)=>{
      const ta=a.date+(a.time||'00:00');
      const tb=b.date+(b.time||'00:00');
      return tb.localeCompare(ta);
    });
    // Префикс даты: если запись вчерашняя — пишем "Вчера HH:MM", если сегодняшняя — просто HH:MM
    const datePrefix=op=>{
      if(!op.date)return '';
      if(op.date<todayStr)return 'Вчера '+(op.time||'');
      return op.time||'';
    };
    // Формируем строки перемещений — потери не дедуплицируем, остальные по уникальному тексту
    const moveFmt=op=>{
      const prefix=datePrefix(op);
      const pfx=prefix?'('+prefix+') ':'';
      if(op.type==='loss') return pfx+'✈ Потеря: '+op.drone+' — пилот '+op.pilot;
      if(op.type==='exchange') return pfx+'⇄ Обмен с '+op.unit+': отдали '+op.give+' — '+op.giveQty+' шт., получили '+op.get+' — '+op.getQty+' шт.'+(op.note?' ('+op.note+')':'');
      if(op.type==='arrival') return pfx+'📦 Поступление: '+op.drone+' — '+op.qty+' шт.'+(op.note?' ('+op.note+')':'');
      return pfx+'→ '+op.from+' → '+op.to+': '+op.drone+' — '+op.qty+' шт.'+(op.note?' ('+op.note+')':'');
    };
    // Дедупликация только для не-потерь (передачи могут задваиваться технически)
    const seenNonLoss=new Set();
    const seenLoss=new Set();
    const moveItems=recentTransfers.filter(op=>{
      if(op.type==='loss'){
        // Дедуплицируем потери по ключу пилот+борт+дата+время
        const lk=(op.pilot||'')+'|'+(op.drone||'')+'|'+(op.date||'')+'|'+(op.time||'');
        if(seenLoss.has(lk))return false;
        seenLoss.add(lk);
        return true;
      }
      const k=moveFmt(op);
      if(seenNonLoss.has(k))return false;
      seenNonLoss.add(k);
      return true;
    });
    const moveKeys=moveItems.map(moveFmt);
    const moveIsRed=(_,i)=>moveItems[i]&&moveItems[i].type==='loss';

    // Текст для копирования
    window._reportText=[
      'ФПВ ИСР',
      ...state.squads.flatMap(sq=>['','✅ Пилот '+sq.pilot,...sq.drones.filter(d=>d.qty!==0).map(d=>d.name+' — '+d.qty+' шт.')]),
      '','✅ Склад:',...stockBG.filter(d=>d.qty>0).map(d=>d.name+' — '+d.qty+' шт.'),
      ...(stockNBG.length?['','Не БГ:',...stockNBG.map(d=>d.name+' — '+d.qty+' шт.')]:[]),
      ...(moveKeys.length?['','Изменения (последние 24ч):',...moveKeys]:[]),
    ].join('\n');

    const movementsBlock=moveKeys.length
      ?'<div style="margin:10px 0 4px;font-weight:700">Изменения (последние 24ч):</div>'
        +moveKeys.map((k,i)=>'<div class="rb-line"'+(moveIsRed(k,i)?' style="color:var(--red)"':'')+'>'+k+'</div>').join('')
      :'<div style="color:var(--muted);font-size:11px;margin-top:8px">Изменений за последние 24ч нет</div>';
    out.innerHTML='<div class="report-block">'
      +'<div class="rb-head">ФПВ ИСР</div>'
      +state.squads.map(sq=>'<div style="margin:8px 0 4px;font-weight:700">✅ Пилот '+sq.pilot+'</div>'+sq.drones.filter(d=>d.qty!==0).map(d=>'<div class="rb-line">'+d.name+' — '+d.qty+' шт.</div>').join('')).join('')
      +'<div style="margin:10px 0 4px;font-weight:700">✅ Склад:</div>'
      +stockBG.filter(d=>d.qty>0).map(d=>'<div class="rb-line">'+d.name+' — '+d.qty+' шт.</div>').join('')
      +(stockNBG.length?'<div style="margin:10px 0 4px;font-weight:700">Не БГ:</div>'+stockNBG.map(d=>'<div class="rb-line">'+d.name+' — '+d.qty+' шт.</div>').join(''):'')
      +movementsBlock
      +'</div>';

  } else if(type==='flights'){
    let f=getFlights();
    const byPilot={};
    f.forEach(x=>{if(!byPilot[x.pilot])byPilot[x.pilot]=[];byPilot[x.pilot].push(x);});
    out.innerHTML=Object.entries(byPilot).map(([p,fs])=>`
      <div class="report-block">
        <div class="rb-head">Пилот: ${p} — ${fs.length} вылетов</div>
        ${fs.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map((x,i)=>`
          <div class="rb-line">${i+1}. ${x.date} ${x.time} · ${x.target||'—'} · ${x.drone||'—'} · ${x.result==='yes'?'✅':'❌'} · ${x.returned==='yes'?'борт вернул':'борт потерян'}${x.note?' · '+x.note:''}</div>`).join('')}
      </div>`).join('')||'<div style="color:var(--muted);padding:16px">Нет данных за период</div>';

  } else if(type==='losses'){
    let f=getFlights().filter(x=>x.returned==='no');
    out.innerHTML=`<div class="report-block">
      <div class="rb-head">Потери БПЛА — ${f.length} борт(ов)</div>
      ${f.map(x=>`<div class="rb-line">${x.date} ${x.time} · Пилот: ${x.pilot} · ${x.drone} · ${x.note||'причина не указана'}</div>`).join('')||'<div class="rb-line">Потерь нет</div>'}
    </div>`;

  } else if(type==='summary'){
    let f=getFlights();
    const byPilot={};
    f.forEach(x=>{
      if(!byPilot[x.pilot])byPilot[x.pilot]={total:0,done:0,lost:0,returned:0};
      byPilot[x.pilot].total++;
      if(x.result==='yes')byPilot[x.pilot].done++;
      if(x.returned==='no')byPilot[x.pilot].lost++;
      else byPilot[x.pilot].returned++;
    });
    const rows=Object.entries(byPilot);
    out.innerHTML=`<div class="report-block">
      <div class="rb-head">Сводка по расчётам</div>
      <table style="width:100%;border-collapse:collapse;font-family:inherit;font-size:12px;margin-top:8px">
        <thead>
          <tr style="border-bottom:1px solid var(--border2)">
            <th style="text-align:left;padding:5px 10px 5px 0;color:var(--green3);font-size:10px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap">Пилот</th>
            <th style="text-align:center;padding:5px 10px;color:var(--green3);font-size:10px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap">Вылетов</th>
            <th style="text-align:center;padding:5px 10px;color:var(--green3);font-size:10px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap">Выполнено</th>
            <th style="text-align:center;padding:5px 10px;color:var(--green3);font-size:10px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap">Не выполнено</th>
            <th style="text-align:center;padding:5px 10px;color:var(--green3);font-size:10px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap">Борт вернул</th>
            <th style="text-align:center;padding:5px 10px;color:var(--green3);font-size:10px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap">Потерь</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([p,s])=>`
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:6px 10px 6px 0;color:var(--text);font-weight:700">${p}</td>
            <td style="text-align:center;padding:6px 10px;color:var(--text)">${s.total}</td>
            <td style="text-align:center;padding:6px 10px;color:var(--green2)">${s.done}</td>
            <td style="text-align:center;padding:6px 10px;color:${s.total-s.done>0?'var(--red)':'var(--text)'}">${s.total-s.done}</td>
            <td style="text-align:center;padding:6px 10px;color:var(--text)">${s.returned}</td>
            <td style="text-align:center;padding:6px 10px;color:${s.lost>0?'var(--red)':'var(--text)'}">${s.lost}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="border-top:1px solid var(--border2)">
            <td style="padding:6px 10px 4px 0;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:1px">Итого</td>
            <td style="text-align:center;padding:6px 10px;color:var(--text);font-weight:700">${rows.reduce((s,[,v])=>s+v.total,0)}</td>
            <td style="text-align:center;padding:6px 10px;color:var(--green2);font-weight:700">${rows.reduce((s,[,v])=>s+v.done,0)}</td>
            <td style="text-align:center;padding:6px 10px;font-weight:700;color:${rows.reduce((s,[,v])=>s+(v.total-v.done),0)>0?'var(--red)':'var(--text)'}">${rows.reduce((s,[,v])=>s+(v.total-v.done),0)}</td>
            <td style="text-align:center;padding:6px 10px;font-weight:700;color:var(--text)">${rows.reduce((s,[,v])=>s+v.returned,0)}</td>
            <td style="text-align:center;padding:6px 10px;font-weight:700;color:${rows.reduce((s,[,v])=>s+v.lost,0)>0?'var(--red)':'var(--text)'}">${rows.reduce((s,[,v])=>s+v.lost,0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  } else if(type==='detailed'){
    buildDetailedReport(getFlights(),filterLabel,out);
  }
}

function isDelivery(ammo){
  if(!ammo)return false;
  const a=ammo.toLowerCase();
  return a.includes('доставк') || a.includes('провизи') || a.includes('груз');
}

function buildDetailedReport(f,filterLabel,out){
  f=f.filter(x=>x.pilot&&x.pilot!=='[ПЕРЕДАЧА]');

  // Собираем уникальных пилотов из вылетов (с учётом фильтра)
  const pilotNames=[...new Set(f.map(x=>x.pilot))].filter(Boolean);

  // Статистика по каждому пилоту
  function stats(flights){
    const total=flights.length;
    const done=flights.filter(x=>x.result==='yes').length;
    const ret=flights.filter(x=>x.returned==='yes').length;
    const lost=flights.filter(x=>x.returned==='no').length;
    const delivery=flights.filter(x=>isDelivery(x.ammo));
    const mining=flights.filter(x=>!isDelivery(x.ammo));
    const pct=(a,b)=>b?'('+Math.round(a/b*100)+'%)':'—';
    return {total,done,notDone:total-done,ret,lost,
      delivery:{total:delivery.length,done:delivery.filter(x=>x.result==='yes').length,notDone:delivery.filter(x=>x.result==='no').length},
      mining:{total:mining.length,done:mining.filter(x=>x.result==='yes').length,notDone:mining.filter(x=>x.result==='no').length},
      pct};
  }

  const pilotStats=pilotNames.map(p=>({
    name:p,
    s:stats(f.filter(x=>x.pilot===p))
  }));
  const totalS=stats(f);
  const {pct}=totalS;

  const thStyle=`style="padding:8px 10px;border:1px solid var(--border2);color:var(--green3);font-size:10px;letter-spacing:1px;text-transform:uppercase;text-align:center;background:var(--bg2)"`;
  const th1Style=`style="padding:8px 10px;border:1px solid var(--border2);color:var(--green3);font-size:10px;letter-spacing:1px;text-transform:uppercase;text-align:left;background:var(--bg2)"`;
  const tdStyle=(val,bold,color)=>`style="padding:7px 10px;border:1px solid var(--border);text-align:center;${bold?'font-weight:700;':''}${color?'color:'+color+';':''}"`;
  const td1Style=`style="padding:7px 10px;border:1px solid var(--border);text-align:left"`;
  const trHead=`style="background:var(--bg2)"`;
  const trSection=`style="background:var(--green-dim)"`;

  const col=(s,val,pctVal,bold,isRed)=>{
    const color=isRed&&val>0?'var(--red)':bold?'var(--green)':'';
    return `<td ${tdStyle(val,bold,color)}>${val}${pctVal!==undefined?' '+s.pct(val,pctVal):''}`;
  };
  const colT=(val,pctVal,bold,isRed)=>col(totalS,val,pctVal,bold,isRed);

  const period=filterLabel||'за всё время';

  out.innerHTML=`<div class="report-block" style="overflow-x:auto">
    <div class="rb-head">Подробный отчёт по расчётам · ${period}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;min-width:500px">
      <thead>
        <tr ${trHead}>
          <th ${th1Style}>Показатель</th>
          ${pilotStats.map((p,i)=>`<th ${thStyle}>Расчёт ${i+1}<br><span style="color:var(--text)">(${p.name})</span></th>`).join('')}
          <th ${thStyle}>ИТОГО</th>
        </tr>
      </thead>
      <tbody>
        <tr ${trSection}>
          <td ${td1Style} style="font-weight:700;color:var(--green)">Всего вылетов</td>
          ${pilotStats.map(p=>`<td ${tdStyle(0,true,'var(--green)')}>${p.s.total}</td>`).join('')}
          <td ${tdStyle(0,true,'var(--green)')}>${totalS.total}</td>
        </tr>
        <tr>
          <td ${td1Style}>Задача выполнена</td>
          ${pilotStats.map(p=>`<td ${tdStyle(0,false,'')}>${p.s.done} ${p.s.pct(p.s.done,p.s.total)}</td>`).join('')}
          <td ${tdStyle(0,false,'')}>${totalS.done} ${pct(totalS.done,totalS.total)}</td>
        </tr>
        <tr>
          <td ${td1Style}>Задача не выполнена</td>
          ${pilotStats.map(p=>`<td style="padding:7px 10px;border:1px solid var(--border);text-align:center;${p.s.notDone>0?'color:var(--red)':''}">${p.s.notDone} ${p.s.pct(p.s.notDone,p.s.total)}</td>`).join('')}
          <td style="padding:7px 10px;border:1px solid var(--border);text-align:center;${totalS.notDone>0?'color:var(--red)':''}">${totalS.notDone} ${pct(totalS.notDone,totalS.total)}</td>
        </tr>
        <tr>
          <td ${td1Style}>Борт вернулся</td>
          ${pilotStats.map(p=>`<td ${tdStyle(0,false,'')}>${p.s.ret} ${p.s.pct(p.s.ret,p.s.total)}</td>`).join('')}
          <td ${tdStyle(0,false,'')}>${totalS.ret} ${pct(totalS.ret,totalS.total)}</td>
        </tr>
        <tr>
          <td ${td1Style}>Борт потерян</td>
          ${pilotStats.map(p=>`<td style="padding:7px 10px;border:1px solid var(--border);text-align:center;${p.s.lost>0?'color:var(--red)':''}">${p.s.lost} ${p.s.pct(p.s.lost,p.s.total)}</td>`).join('')}
          <td style="padding:7px 10px;border:1px solid var(--border);text-align:center;${totalS.lost>0?'color:var(--red)':''}">${totalS.lost} ${pct(totalS.lost,totalS.total)}</td>
        </tr>

        <tr ${trSection}>
          <td ${td1Style} style="font-weight:700;color:var(--green)">Минирование (всего)</td>
          ${pilotStats.map(p=>`<td ${tdStyle(0,true,'var(--green)')}>${p.s.mining.total}</td>`).join('')}
          <td ${tdStyle(0,true,'var(--green)')}>${totalS.mining.total}</td>
        </tr>
        <tr>
          <td ${td1Style}>— удачных</td>
          ${pilotStats.map(p=>`<td ${tdStyle(0,false,'')}>${p.s.mining.done} ${p.s.pct(p.s.mining.done,p.s.mining.total)}</td>`).join('')}
          <td ${tdStyle(0,false,'')}>${totalS.mining.done} ${pct(totalS.mining.done,totalS.mining.total)}</td>
        </tr>
        <tr>
          <td ${td1Style}>— неудачных</td>
          ${pilotStats.map(p=>`<td style="padding:7px 10px;border:1px solid var(--border);text-align:center;${p.s.mining.notDone>0?'color:var(--red)':''}">${p.s.mining.notDone} ${p.s.pct(p.s.mining.notDone,p.s.mining.total)}</td>`).join('')}
          <td style="padding:7px 10px;border:1px solid var(--border);text-align:center;${totalS.mining.notDone>0?'color:var(--red)':''}">${totalS.mining.notDone} ${pct(totalS.mining.notDone,totalS.mining.total)}</td>
        </tr>

        <tr ${trSection}>
          <td ${td1Style} style="font-weight:700;color:var(--green)">Доставка (всего)</td>
          ${pilotStats.map(p=>`<td ${tdStyle(0,true,'var(--green)')}>${p.s.delivery.total}</td>`).join('')}
          <td ${tdStyle(0,true,'var(--green)')}>${totalS.delivery.total}</td>
        </tr>
        <tr>
          <td ${td1Style}>— удачных</td>
          ${pilotStats.map(p=>`<td ${tdStyle(0,false,'')}>${p.s.delivery.done} ${p.s.pct(p.s.delivery.done,p.s.delivery.total)}</td>`).join('')}
          <td ${tdStyle(0,false,'')}>${totalS.delivery.done} ${pct(totalS.delivery.done,totalS.delivery.total)}</td>
        </tr>
        <tr>
          <td ${td1Style}>— неудачных</td>
          ${pilotStats.map(p=>`<td style="padding:7px 10px;border:1px solid var(--border);text-align:center;${p.s.delivery.notDone>0?'color:var(--red)':''}">${p.s.delivery.notDone} ${p.s.pct(p.s.delivery.notDone,p.s.delivery.total)}</td>`).join('')}
          <td style="padding:7px 10px;border:1px solid var(--border);text-align:center;${totalS.delivery.notDone>0?'color:var(--red)':''}">${totalS.delivery.notDone} ${pct(totalS.delivery.notDone,totalS.delivery.total)}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

function buildReportText(){
  // Собираем текст из отчёта с правильными отступами и пустыми строками
  const out=document.getElementById('reportOutput');
  const lines=[];
  // rb-head
  out.querySelectorAll('.rb-head').forEach(el=>{
    lines.push('');
    lines.push(el.innerText.trim());
    lines.push('');
  });
  // Если rb-head есть — строим заново весь блок
  if(out.querySelector('.rb-head')){
    lines.length=0;
    const block=out.querySelector('.report-block');
    if(block){
      let prevWasSection=false;
      block.childNodes.forEach(node=>{
        if(node.nodeType!==1)return;
        const txt=node.innerText?.trim();
        if(!txt)return;
        const isBold=node.style?.fontWeight==='700'||node.tagName==='DIV'&&node.querySelector('b');
        // секционные заголовки (✅ Пилот, Склад, Не БГ, Перемещения)
        const isSection=txt.startsWith('✅')||txt.startsWith('Не БГ')||txt.startsWith('Перемещения');
        if(isSection){lines.push('');lines.push(txt);prevWasSection=true;}
        else{lines.push(txt);prevWasSection=false;}
      });
    }
    // fallback — берём весь innerText и добавляем пустую строку перед секциями
    if(lines.length===0){
      const raw=out.innerText;
      raw.split('\n').forEach(l=>{
        const t=l.trim();
        if(!t)return;
        if(t.startsWith('✅')||t.startsWith('Не БГ')||t.startsWith('Перемещения'))lines.push('');
        lines.push(t);
      });
    }
  }
  // Дедуплицируем перемещения — уникальные строки в секции перемещений
  const seen=new Set();
  const deduped=[];
  let inMoves=false;
  lines.forEach(l=>{
    if(l.startsWith('Перемещения'))inMoves=true;
    if(inMoves&&l){
      if(seen.has(l))return;
      seen.add(l);
    }
    deduped.push(l);
  });
  // Убираем множественные пустые строки подряд
  const result=[];
  let lastEmpty=false;
  deduped.forEach(l=>{
    if(l===''){if(!lastEmpty)result.push('');lastEmpty=true;}
    else{result.push(l);lastEmpty=false;}
  });
  return result.join('\n').trim();
}

function copyReport(){
  const txt=window._reportText||document.getElementById('reportOutput').innerText;
  navigator.clipboard.writeText(txt).then(()=>{
    const btns=document.querySelectorAll('[onclick="copyReport()"]');
    btns.forEach(btn=>{const orig=btn.textContent;btn.textContent='✓ Скопировано';setTimeout(()=>{btn.textContent=orig;},1500);});
  }).catch(()=>{
    const el=document.createElement('textarea');
    el.value=txt;document.body.appendChild(el);el.select();document.execCommand('copy');document.body.removeChild(el);
  });
}

function printReport(){
  const content=document.getElementById('reportOutput').innerHTML;
  const win=window.open('','_blank','width=800,height=600');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Отчёт</title>
  <style>
    body{font-family:'Courier New',monospace;font-size:13px;color:#000;background:#fff;padding:20px;margin:0}
    .rb-head{font-size:15px;font-weight:700;margin-bottom:10px}
    .rb-line{padding:2px 0;font-size:13px}
    div[style*="font-weight:700"]{margin-top:10px;margin-bottom:4px;font-weight:700}
    @media print{body{padding:10px}}
  </style></head><body>${content}<script>window.onload=function(){window.print();window.close();}<\/script></body></html>`);
  win.document.close();
}

// ============ THEMES ============
const THEMES={
  terminal:{
    '--bg':'#050a05','--bg2':'#0a110a','--card':'#060c06',
    '--text':'#b8f0b8','--text2':'#6aaf6a','--muted':'#3d6b3d',
    '--border':'#112211','--border2':'#1f4d1f',
    '--green':'#39ff14','--green2':'#22c55e','--green3':'#16a34a','--green-dim':'#0d1f0d',
    '--amber':'#ffd700','--red':'#ff3333',
    '--font':"'Share Tech Mono','Courier New',monospace",
    body:'background:#050a05;color:#b8f0b8;',
    topbarBg:'#000',topbarColor:'#39ff14',topbarBorder:'#16a34a',
    selectBg:'#000',selectColor:'#39ff14',selectBorder:'#1f4d1f',
    scanlines:true,blink:true
  },
  wb:{
    '--bg':'#0a0a0a','--bg2':'#111','--card':'#050505',
    '--text':'#e8e8e8','--text2':'#aaa','--muted':'#666',
    '--border':'#1a1a1a','--border2':'#333',
    '--green':'#fff','--green2':'#ccc','--green3':'#888','--green-dim':'#1a1a1a',
    '--amber':'#ccc','--red':'#ff5555',
    '--font':"'Share Tech Mono','Courier New',monospace",
    body:'background:#0a0a0a;color:#e8e8e8;',
    topbarBg:'#000',topbarColor:'#fff',topbarBorder:'#333',
    selectBg:'#111',selectColor:'#fff',selectBorder:'#333',
    scanlines:false,blink:true
  },
  bw:{
    '--bg':'#f5f5f0','--bg2':'#ececec','--card':'#fff',
    '--text':'#111','--text2':'#444','--muted':'#888',
    '--border':'#ddd','--border2':'#bbb',
    '--green':'#111','--green2':'#333','--green3':'#555','--green-dim':'#eee',
    '--amber':'#222','--red':'#c00',
    '--font':"'Share Tech Mono','Courier New',monospace",
    body:'background:#f5f5f0;color:#111;',
    topbarBg:'#111',topbarColor:'#fff',topbarBorder:'#333',
    selectBg:'#222',selectColor:'#fff',selectBorder:'#444',
    scanlines:false,blink:false
  },
  field:{
    '--bg':'#3d3a28','--bg2':'#343120','--card':'#2e2b1c',
    '--text':'#d4c99a','--text2':'#b0a070','--muted':'#7a6e48',
    '--border':'#2a2718','--border2':'#4a4530',
    '--green':'#c8b870','--green2':'#a89850','--green3':'#8a7a3a','--green-dim':'#252310',
    '--amber':'#e8c840','--red':'#c84040',
    '--font':"Georgia,'Times New Roman',serif",
    body:'background:#3d3a28;color:#d4c99a;',
    topbarBg:'#1e1c10',topbarColor:'#c8b870',topbarBorder:'#4a4530',
    selectBg:'#1e1c10',selectColor:'#c8b870',selectBorder:'#4a4530',
    scanlines:false,blink:false
  }
};

function applyTheme(name){
  const map={terminal:'theme-terminal',wb:'theme-white',bw:'theme-paper',field:'theme-field'};
  const cls=map[name]||'theme-terminal';
  document.body.className=document.body.className
    .replace(/theme-\w+/g,'').trim()+' '+cls;
  // Полевой планшет — сетка на фоне
  if(name==='field'){
    document.body.style.backgroundImage='repeating-linear-gradient(0deg,transparent,transparent 29px,rgba(0,0,0,0.06) 29px,rgba(0,0,0,0.06) 30px),repeating-linear-gradient(90deg,transparent,transparent 29px,rgba(0,0,0,0.04) 29px,rgba(0,0,0,0.04) 30px)';
  } else {
    document.body.style.backgroundImage='';
  }
  // Обновляем themeStyle — очищаем старые инлайн-переменные
  const ts=document.getElementById('themeStyle');
  if(ts)ts.textContent='';
  try{localStorage.setItem('theme',name);}catch(e){}
}

function applyFontSize(sz){
  const base=parseInt(sz)||14;
  // Устанавливаем CSS переменную — все размеры масштабируются относительно неё
  document.documentElement.style.setProperty('--base',base+'px');
  document.documentElement.style.fontSize=base+'px';
  document.body.style.fontSize=base+'px';
  // Принудительно обновляем элементы с жёстко заданным font-size через scale
  const scale=base/14; // 14px — базовый размер
  const styleId='fontScaleStyle';
  let styleEl=document.getElementById(styleId);
  if(!styleEl){styleEl=document.createElement('style');styleEl.id=styleId;document.head.appendChild(styleEl);}
  styleEl.textContent=`
    body, input, select, textarea, button { font-size: ${base}px !important; }
    .adm-flight-table, .adm-flight-table input, .adm-flight-table select, .adm-flight-table td, .adm-flight-table th { font-size: 12px !important; }
    .card-title { font-size: ${Math.round(10*scale)}px !important; }
    .stat { font-size: ${Math.round(30*scale)}px !important; }
    .stat-sub, label { font-size: ${Math.round(10*scale)}px !important; }
    th { font-size: ${Math.round(10*scale)}px !important; }
    td { font-size: ${base}px !important; }
    .tag { font-size: ${Math.round(11*scale)}px !important; }
    .nav button { font-size: ${Math.round(11*scale)}px !important; }
    .section-title { font-size: ${Math.round(15*scale)}px !important; }
    .flight-pilot { font-size: ${base}px !important; }
    .flight-time, .flight-cell { font-size: ${base}px !important; }
    .report-block .rb-head { font-size: ${Math.round(13*scale)}px !important; }
    .report-block .rb-line { font-size: ${base}px !important; }
    .dp-day { font-size: ${base}px !important; }
    .dp-nav-label { font-size: ${Math.round(12*scale)}px !important; }
    .notice { font-size: ${base}px !important; }
    .qty { font-size: ${Math.round(13*scale)}px !important; }
    .drone-name { font-size: ${base}px !important; }
  `;
  try{localStorage.setItem('fontSize',sz);}catch(e){}
}

// ============ CUSTOM DATEPICKER ============
(function(){
  const MONTHS_RU=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const DAYS_RU=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  // Создаём один попап на всю страницу
  const popup=document.createElement('div');
  popup.className='dp-popup';
  popup.id='dp-popup';
  popup.innerHTML=`
    <div class="dp-nav">
      <button class="dp-nav-btn" id="dp-prev-y">◀◀</button>
      <div style="display:flex;gap:4px;align-items:center">
        <button class="dp-nav-btn" id="dp-prev-m">◀</button>
        <span class="dp-nav-label" id="dp-month-label"></span>
        <button class="dp-nav-btn" id="dp-next-m">▶</button>
      </div>
      <button class="dp-nav-btn" id="dp-next-y">▶▶</button>
    </div>
    <div class="dp-year-row">
      <span class="dp-year-label" id="dp-year-label"></span>
    </div>
    <div class="dp-weekdays">${DAYS_RU.map(d=>`<div class="dp-weekday">${d}</div>`).join('')}</div>
    <div class="dp-days" id="dp-days"></div>`;
  document.body.appendChild(popup);

  let currentInput=null, curYear=0, curMonth=0;

  function parseVal(v){
    if(!v)return null;
    const [y,m,d]=v.split('-').map(Number);
    return isNaN(y)?null:{y,m,d};
  }
  function toISO(y,m,d){return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}

  function render(){
    document.getElementById('dp-month-label').textContent=MONTHS_RU[curMonth-1];
    document.getElementById('dp-year-label').textContent=curYear+' г.';
    const sel=parseVal(currentInput?.value);
    const todayISO=new Date().toISOString().slice(0,10);
    const firstDow=(new Date(curYear,curMonth-1,1).getDay()+6)%7; // 0=Пн
    const daysInMonth=new Date(curYear,curMonth,0).getDate();
    const daysInPrev=new Date(curYear,curMonth-1,0).getDate();
    const cells=[];
    // Предыдущий месяц
    for(let i=firstDow-1;i>=0;i--)cells.push({d:daysInPrev-i,cur:false,prev:true});
    // Текущий месяц
    for(let d=1;d<=daysInMonth;d++){
      const iso=toISO(curYear,curMonth,d);
      cells.push({d,cur:true,today:iso===todayISO,selected:sel&&iso===toISO(sel.y,sel.m,sel.d)});
    }
    // Следующий месяц
    let next=1;
    while(cells.length%7!==0)cells.push({d:next++,cur:false,next:true});

    document.getElementById('dp-days').innerHTML=cells.map(c=>{
      if(!c.cur)return`<div class="dp-day other-month">${c.d}</div>`;
      let cls='dp-day';
      if(c.today)cls+=' today';
      if(c.selected)cls+=' selected';
      return`<div class="${cls}" data-d="${c.d}">${c.d}</div>`;
    }).join('');

    document.getElementById('dp-days').querySelectorAll('.dp-day[data-d]').forEach(el=>{
      el.addEventListener('click',()=>{
        const iso=toISO(curYear,curMonth,parseInt(el.dataset.d));
        currentInput.value=iso;
        currentInput.dispatchEvent(new Event('change',{bubbles:true}));
        close();
      });
    });
  }

  function open(input){
    currentInput=input;
    const v=parseVal(input.value);
    const now=new Date();
    curYear=v?v.y:now.getFullYear();
    curMonth=v?v.m:now.getMonth()+1;
    // Позиционируем под полем
    const rect=input.getBoundingClientRect();
    const pw=260;
    let left=rect.left+window.scrollX;
    if(left+pw>window.innerWidth)left=window.innerWidth-pw-8;
    let top=rect.bottom+window.scrollY+4;
    if(top+300>window.innerHeight+window.scrollY)top=rect.top+window.scrollY-304;
    popup.style.left=left+'px';
    popup.style.top=top+'px';
    popup.classList.add('open');
    render();
  }

  function close(){popup.classList.remove('open');currentInput=null;}

  document.getElementById('dp-prev-m').onclick=e=>{e.stopPropagation();curMonth--;if(curMonth<1){curMonth=12;curYear--;}render();};
  document.getElementById('dp-next-m').onclick=e=>{e.stopPropagation();curMonth++;if(curMonth>12){curMonth=1;curYear++;}render();};
  document.getElementById('dp-prev-y').onclick=e=>{e.stopPropagation();curYear--;render();};
  document.getElementById('dp-next-y').onclick=e=>{e.stopPropagation();curYear++;render();};
  popup.addEventListener('click',e=>e.stopPropagation());
  document.addEventListener('click',()=>close());

  // Подключаем ко всем date-инпутам — сейчас и при появлении новых
  function attachDP(input){
    if(input._dpAttached)return;
    input._dpAttached=true;
    input.classList.add('dp-input');
    input.readOnly=true;
    input.addEventListener('click',e=>{e.stopPropagation();open(input);});
    input.addEventListener('keydown',e=>{if(e.key==='Delete'||e.key==='Backspace'){input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));}});
  }

  function attachAll(){document.querySelectorAll('input[type="date"]').forEach(attachDP);}
  attachAll();
  // Наблюдаем за новыми инпутами
  new MutationObserver(attachAll).observe(document.body,{childList:true,subtree:true});
})();


// ============ AUTH ============
let authToken='';
let authUser={login:'',role:''};

async function sha256(str){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function showLoginScreen(){
  const ls=document.getElementById('loginScreen');
  if(ls)ls.style.display='flex';
  document.querySelector('.app').style.display='none';
}
function hideLoginScreen(){
  const ls=document.getElementById('loginScreen');
  if(ls)ls.style.display='none';
  document.querySelector('.app').style.display='flex';
}

async function doLogin(){
  const login=document.getElementById('loginInput').value.trim();
  const pass=document.getElementById('passwordInput').value;
  const err=document.getElementById('loginError');
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  if(!url){err.textContent='URL сервера не настроен';return;}
  if(!login||!pass){err.textContent='Введите логин и пароль';return;}
  err.textContent='Проверяю...';
  // Ищем пользователя через readAll и сверяем хэш локально
  try{
    const r=await fetch(url+'?action=read&token=__login__');
    const d=await r.json();
    // read без токена вернёт ошибку — используем специальный эндпоинт
    // Получаем хэш пароля локально и ищем токен
    err.textContent='Используйте ссылку от администратора';
  }catch(e){err.textContent='Ошибка: '+e.message;}
}

async function authByToken(token){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  if(!url||!token)return false;
  try{
    const r=await fetch(url+'?action=auth&token='+encodeURIComponent(token)+'&_='+Date.now(),{redirect:'follow'});
    const d=await r.json();
    if(d.ok){
      authToken=token;
      authUser={login:d.login,role:d.role};
      localStorage.setItem('auth_token',token);
      return true;
    }
    return false;
  }catch(e){return false;}
}

async function initAuth(){
  // Убеждаемся что cfg загружен из localStorage
  if(!cfg.url)cfg.url=localStorage.getItem('cfg_url')||'';
  if(!cfg.key)cfg.key=localStorage.getItem('cfg_key')||'';

  // ЛОКАЛЬНЫЙ РЕЖИМ — если открыто с file:// или передан параметр ?local=1
  const isLocal=window.location.protocol==='file:'||new URLSearchParams(window.location.search).get('local')==='1';
  if(isLocal){
    hideLoginScreen();
    authUser={login:'local',role:'admin'};
    state.role='admin';
    applyRoleFromAuth();
    console.log('[AUTH] Локальный режим — авторизация пропущена');
    return;
  }

  // 1. Проверяем URL параметры
  const params=new URLSearchParams(window.location.search);
  const urlToken=params.get('t');
  const urlUser=params.get('u');
  const urlKey=params.get('k');
  const urlServer=params.get('s');

  if(urlToken){
    window.history.replaceState({},'',window.location.pathname);
    if(urlServer){
      cfg.url=urlServer;
      localStorage.setItem('cfg_url',urlServer);
      const uf=document.getElementById('cfg-url');
      if(uf)uf.value=urlServer;
    }
    if(urlKey){
      cfg.key=urlKey;
      localStorage.setItem('cfg_key',urlKey);
      const kf=document.getElementById('cfg-key');
      if(kf)kf.value=urlKey;
    }
    authToken=urlToken;
    localStorage.setItem('auth_token',urlToken);
    const ok=await authByToken(urlToken);
    if(ok){
      applyRoleFromAuth();
      hideLoginScreen();
      logAction('auth','login','Вход по ссылке: '+(urlUser||''));
      if(cfg.url)await syncFromCloudSilent();
      return;
    } else {
      showLoginError('Ссылка недействительна или устарела');
      authToken='';
      localStorage.removeItem('auth_token');
    }
  }

  // 2. Проверяем сохранённый токен
  const saved=localStorage.getItem('auth_token');
  if(saved&&cfg.url){
    authToken=saved;
    // Пробуем дважды — сеть может быть нестабильна
    let ok=await authByToken(saved);
    if(!ok){
      await new Promise(r=>setTimeout(r,1500));
      ok=await authByToken(saved);
    }
    if(ok){
      applyRoleFromAuth();
      hideLoginScreen();
      return;
    } else {
      authToken='';
      // НЕ удаляем токен — возможно временная ошибка сети
      // localStorage.removeItem('auth_token');
    }
  }

  // 3. Если URL не настроен — работаем локально без авторизации
  if(!cfg.url){
    hideLoginScreen();
    return;
  }

  // 4. URL настроен но токен не прошёл — показываем экран входа
  showLoginScreen();
}

function showLoginError(msg){
  const err=document.getElementById('loginError');
  if(err)err.textContent=msg;
}

function applyRoleFromAuth(){
  const lb=document.getElementById('logoutBtn');
  if(lb)lb.style.display='';

  const isAdminUser=authUser.role==='admin'||authUser.login==='local'||authUser.login==='admin';
  const roleSwitch=document.getElementById('roleSwitch');

  if(isAdminUser){
    // Администратор — показываем переключатель, применяем текущую выбранную роль
    if(roleSwitch)roleSwitch.style.display='';
    const savedRole=localStorage.getItem('role')||'admin';
    const r=(['admin','cmd','tech','pilot1','pilot2','pilot3'].includes(savedRole))?savedRole:'admin';
    if(roleSwitch){
      const optExists=[...roleSwitch.options].some(o=>o.value===r);
      roleSwitch.value=optExists?r:'admin';
    }
    switchRole(r);
  } else {
    // Остальные — скрываем переключатель, роль из учётной записи
    if(roleSwitch)roleSwitch.style.display='none';
    const roleMap={admin:'admin',cmd:'cmd',tech:'tech',pilot:'pilot1',pilot1:'pilot1',pilot2:'pilot2',pilot3:'pilot3'};
    const r=roleMap[authUser.role]||'cmd';
    if(roleSwitch)roleSwitch.value=r;
    switchRole(r);
    const badge=document.getElementById('roleBadge');
    if(badge)badge.innerHTML='<b>'+authUser.login+'</b>';
  }
  setTimeout(applyRoleRestrictions,100);
  setTimeout(initQuickForm,150);
}


function logout(){
  localStorage.removeItem('auth_token');
  authToken='';authUser={login:'',role:''};
  location.reload();
}

// ============ УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ============
function nuRoleChange(){
  const role=document.getElementById('nu-role').value;
  const row=document.getElementById('nu-callsign-row');
  const sel=document.getElementById('nu-callsign');
  if(role==='pilot'){
    row.style.display='';
    // Заполняем список из расчётов
    sel.innerHTML='<option value="">— выбрать из расчётов —</option>'
      +state.squads.map(sq=>`<option value="${sq.pilot}">${sq.pilot}</option>`).join('');
  } else {
    row.style.display='none';
  }
}

async function createUser(){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  if(!url){alert('URL не настроен');return;}
  if(!authToken){alert('Нет прав администратора');return;}
  const login=document.getElementById('nu-login').value.trim();
  const pass=document.getElementById('nu-password').value.trim();
  const role=document.getElementById('nu-role').value;
  const encKey=document.getElementById('nu-enckey').value.trim()||cfg.key;
  const callsign=role==='pilot'?(document.getElementById('nu-callsign')?.value||''):'';
  if(!login||!pass){alert('Введите логин и пароль');return;}
  if(role==='pilot'&&!callsign){alert('Выберите позывной пилота из расчётов');return;}

  try{
    await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({action:'create_user',admin_token:authToken,login,password:pass,role})});
    await new Promise(r=>setTimeout(r,2500));
    const rList=await fetch(url+'?action=read&token='+encodeURIComponent(authToken));
    const dList=await rList.json();
    const newUser=(dList.users||[]).find(u=>u.login===login);
    if(!newUser||!newUser.token){
      alert('Пользователь создан, но не удалось получить токен автоматически.\nОткройте лист users в Google Sheets и скопируйте токен вручную.');
      loadUsersList();
      return;
    }
    const token=newUser.token;

    // Если пилот — переименовываем позывной в расчётах и вылетах на логин
    if(role==='pilot'&&callsign&&callsign!==login){
      let changed=false;
      // Обновляем расчёты
      state.squads.forEach(sq=>{if(sq.pilot===callsign){sq.pilot=login;changed=true;}});
      // Обновляем вылеты
      state.flights.forEach(f=>{if(f.pilot===callsign){f.pilot=login;changed=true;}});
      // Обновляем передачи
      (state.transfers||[]).forEach(t=>{
        if(t.pilot===callsign)t.pilot=login;
        if(t.from===callsign)t.from=login;
        if(t.to===callsign)t.to=login;
      });
      if(changed){
        saveLocal();
        await syncToCloud(true);
        renderInventory();renderFlights();renderDashboard();
        showSyncToast('✓ Позывной «'+callsign+'» → логин «'+login+'»');
      }
    }

    // Генерируем ссылку
    const base=window.location.origin+window.location.pathname;
    const serverUrl=cfg.url||localStorage.getItem('cfg_url')||'';
    const link=base+'?u='+encodeURIComponent(login)+'&t='+token+'&k='+encodeURIComponent(encKey)+'&s='+encodeURIComponent(serverUrl);
    document.getElementById('nu-link-text').textContent=link;
    document.getElementById('nu-link-result').style.display='block';
    document.getElementById('nu-login').value='';
    document.getElementById('nu-password').value='';
    loadUsersList();
  }catch(e){alert('Ошибка: '+e.message);}
}

function copyUserLink(){
  const txt=document.getElementById('nu-link-text').textContent;
  navigator.clipboard.writeText(txt).catch(()=>{
    const el=document.createElement('textarea');
    el.value=txt;document.body.appendChild(el);el.select();document.execCommand('copy');document.body.removeChild(el);
  });
  showSyncToast('✓ Ссылка скопирована');
}

async function loadUsersList(){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  if(!url||!authToken)return;
  try{
    const r=await fetch(url+'?action=read&token='+encodeURIComponent(authToken));
    const d=await r.json();
    const users=d.users||[];
    const el=document.getElementById('usersList');
    if(!el)return;
    el.innerHTML=users.length?`
      <table style="width:100%;font-size:12px">
        <thead><tr><th>Логин</th><th>Роль</th><th>Статус</th><th>Действие</th></tr></thead>
        <tbody>${users.map(u=>`<tr>
          <td style="padding:6px 8px">${u.login}</td>
          <td style="padding:6px 8px">${u.role}</td>
          <td style="padding:6px 8px"><span class="tag ${u.active?'tag-ok':'tag-danger'}">${u.active?'активен':'заблокирован'}</span></td>
          <td style="padding:6px 8px;display:flex;gap:4px">
            <button class="btn btn-sm btn-primary" onclick="regenerateToken('${u.login}')">Новая ссылка</button>
            <button class="btn btn-sm btn-danger" onclick="toggleUser('${u.login}',${!u.active})">${u.active?'Блок':'Разблок'}</button>
          </td>
        </tr>`).join('')}</tbody>
      </table>`:'<div style="color:var(--muted);font-size:12px">Нет пользователей</div>';
  }catch(e){}
}

async function regenerateToken(login){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  if(!url||!authToken)return;
  try{
    // Отправляем запрос на смену токена
    await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({action:'update_user',admin_token:authToken,login,new_token:true})});
    // Ждём пока Apps Script обработает
    await new Promise(r=>setTimeout(r,2000));
    // Читаем обновлённый список пользователей
    const r=await fetch(url+'?action=read&token='+encodeURIComponent(authToken));
    const d=await r.json();
    const updUser=(d.users||[]).find(u=>u.login===login);
    if(!updUser||!updUser.token){
      alert('Токен сменён. Откройте лист users в Google Sheets и скопируйте новый токен вручную.');
      return;
    }
    const base=window.location.origin+window.location.pathname;
    const encKey=cfg.key;
    const serverUrl=cfg.url||'';
    const link=base+'?u='+encodeURIComponent(login)+'&t='+updUser.token+'&k='+encodeURIComponent(encKey)+'&s='+encodeURIComponent(serverUrl);
    document.getElementById('nu-link-text').textContent=link;
    document.getElementById('nu-link-result').style.display='block';
    showSyncToast('✓ Новая ссылка сгенерирована');
    loadUsersList();
  }catch(e){alert('Ошибка: '+e.message);}
}

async function toggleUser(login,active){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  if(!url||!authToken)return;
  try{
    await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({action:'update_user',admin_token:authToken,login,active})});
    await new Promise(r=>setTimeout(r,1000));
    loadUsersList();
  }catch(e){alert('Ошибка: '+e.message);}
}


// ============ РЕДАКТИРОВАНИЕ ВЫЛЕТА (10 минут для пилота) ============
function canEditFlight(f){
  // Администратор редактирует через свой раздел — в общем журнале полоса не нужна
  if(state.role==='admin'||authUser.role==='admin')return false;
  // Проверяем 10-минутное окно
  const savedTs=f._savedTs||0;
  if(!savedTs)return false; // нет метки времени — не показываем
  const minsLeft=(10*60*1000-(Date.now()-savedTs));
  if(minsLeft<=0)return false;
  // Кто подал — тот и может редактировать
  const submitter=f._submittedBy||f.pilot||'';
  return submitter===authUser.login||f.pilot===authUser.login;
}

function renderFlightEditRow(x, realIdx){
  if(!canEditFlight(x))return '';
  const minsLeft=Math.max(1,Math.round((10*60*1000-(Date.now()-(x._savedTs||0)))/60000));
  return '<div style="display:flex;gap:5px;align-items:center;padding:3px 10px 3px 12px;background:rgba(57,255,20,0.03);border-left:2px solid var(--green3);flex-wrap:wrap">'
    +'<span style="font-size:10px;color:var(--green3);letter-spacing:1px;white-space:nowrap">✏ '+minsLeft+' мин</span>'
    +'<input style="width:90px;font-size:11px;padding:2px 5px" list="dl-ammo-catalog" value="'+(x.ammo||'')+'" placeholder="Боеприпас" id="edit-ammo-'+realIdx+'" autocomplete="off">'
    +'<input style="width:75px;font-size:11px;padding:2px 5px" list="dl-drones-smart" value="'+(x.drone||'')+'" placeholder="БПЛА" id="edit-drone-'+realIdx+'" autocomplete="off">'
    +'<input style="width:36px;font-size:11px;padding:2px 5px;text-align:center" type="number" min="1" value="'+(x.flightnum||'')+'" placeholder="#" id="edit-flightnum-'+realIdx+'">'
    +'<select style="font-size:11px;padding:2px 3px" id="edit-result-'+realIdx+'">'
    +'<option value="yes" '+(x.result==='yes'?'selected':'')+'>✅ выполнена</option>'
    +'<option value="no" '+(x.result==='no'?'selected':'')+'>❌ нет</option></select>'
    +'<select style="font-size:11px;padding:2px 3px" id="edit-returned-'+realIdx+'">'
    +'<option value="yes" '+(x.returned==='yes'?'selected':'')+'>вернул</option>'
    +'<option value="no" '+(x.returned==='no'?'selected':'')+'>потерян</option></select>'
    +'<input style="flex:1;min-width:80px;font-size:11px;padding:2px 5px" value="'+(x.note||'')+'" placeholder="Примечание" id="edit-note-'+realIdx+'">'
    +'<button class="btn btn-success btn-sm" style="padding:2px 8px;font-size:10px;letter-spacing:0" onclick="saveFlightEdit('+realIdx+')">✓</button>'
    +'</div>';
}

function saveFlightEdit(idx){
  const f=state.flights[idx];
  if(!f||!canEditFlight(f))return;
  f.ammo=document.getElementById('edit-ammo-'+idx)?.value||f.ammo;
  f.drone=document.getElementById('edit-drone-'+idx)?.value||f.drone;
  f.result=document.getElementById('edit-result-'+idx)?.value||f.result;
  f.returned=document.getElementById('edit-returned-'+idx)?.value||f.returned;
  f.note=document.getElementById('edit-note-'+idx)?.value??f.note;
  const fn=document.getElementById('edit-flightnum-'+idx)?.value;
  if(fn)f.flightnum=parseInt(fn);
  f._edited=true;
  saveLocal();
  appendToCloud('flights',f);
  renderFlights();
  renderDashboard();
  logAction('flight','edit','Вылет #'+f.flightnum+' '+f.pilot+' отредактирован');
}
// Умный список точек — часто используемые вверху, не используемые 7 дней скрыты
function getSmartTargets(){
  const cutoff=new Date();
  cutoff.setDate(cutoff.getDate()-7);
  const cutoffStr=cutoff.toISOString().slice(0,10);
  const pilot=document.getElementById('qf-pilot')?.value||'';
  // Берём вылеты текущего пилота за последние 7 дней
  const recent=state.flights.filter(f=>
    (!pilot||f.pilot===pilot)&&f.target&&f.date>=cutoffStr
  );
  // Считаем частоту
  const freq={};
  recent.forEach(f=>{freq[f.target]=(freq[f.target]||0)+1;});
  // Сортируем по частоте убыванием
  return Object.entries(freq)
    .sort((a,b)=>b[1]-a[1])
    .map(([t])=>t);
}

// ============ QUICK PICKER ============
(function(){
  const popup=document.createElement('div');
  popup.className='qp-popup';popup.id='qp-popup';
  document.body.appendChild(popup);
  let _cb=null,_open=false;

  window.showQuickPicker=function(input,items,cb){
    // Если уже открыт для этого же поля — закрываем
    if(_open&&popup.dataset.inputId===input.id){
      popup.classList.remove('open');_open=false;return;
    }
    _cb=cb;_open=true;
    popup.dataset.inputId=input.id||'';
    popup.innerHTML=items.filter(Boolean).map(v=>`<div class="qp-item" data-v="${v.replace(/"/g,'&quot;')}">${v}</div>`).join('');
    popup.querySelectorAll('.qp-item').forEach(el=>{
      el.addEventListener('click',e=>{
        e.stopPropagation();
        if(input)input.value=el.dataset.v;
        if(_cb)_cb(el.dataset.v);
        popup.classList.remove('open');_open=false;
      });
    });
    const rect=input.getBoundingClientRect();
    let l=rect.left+window.scrollX;
    if(l+180>window.innerWidth)l=window.innerWidth-185;
    let t=rect.bottom+window.scrollY+2;
    popup.style.cssText='left:'+l+'px;top:'+t+'px;min-width:'+Math.max(rect.width,140)+'px';
    popup.classList.add('open');
  };

  document.addEventListener('click',e=>{
    if(_open&&!popup.contains(e.target)){
      popup.classList.remove('open');_open=false;
    }
  });
})();

let ammoCatalog=[]; // [{name, category, aliases:[]}]

function ammoLoad(){
  try{
    const saved=localStorage.getItem('ammo_catalog');
    if(saved)ammoCatalog=JSON.parse(saved);
  }catch(e){}
  ammoFillDatalist();
}

function ammoSave(){
  try{localStorage.setItem('ammo_catalog',JSON.stringify(ammoCatalog));}catch(e){}
  ammoFillDatalist();
}

function ammoFillDatalist(){
  const dl=document.getElementById('dl-ammo-catalog');
  if(!dl)return;
  dl.innerHTML=ammoCatalog.map(a=>`<option value="${a.name}">`).join('');
}

// Нормализация названия боеприпаса по справочнику
function ammoNormalizeName(raw){
  if(!raw||!ammoCatalog.length)return raw;
  const r=raw.toLowerCase().trim();
  for(const item of ammoCatalog){
    if(item.name.toLowerCase()===r)return item.name;
    if((item.aliases||[]).some(a=>a.toLowerCase().trim()===r))return item.name;
  }
  return raw; // не найдено — оставляем как есть
}

function renderAmmoList(){
  const el=document.getElementById('ammoList');
  if(!el)return;

  // Собираем все уникальные значения боеприпасов из базы вылетов
  const rawAmmo=[...new Set(state.flights.map(f=>f.ammo).filter(Boolean))].sort();
  // Определяем какие из них уже покрыты справочником (эталон или алиас)
  const covered=new Set();
  ammoCatalog.forEach(a=>{
    covered.add(a.name.toLowerCase().trim());
    (a.aliases||[]).forEach(al=>covered.add(al.toLowerCase().trim()));
  });
  const uncovered=rawAmmo.filter(v=>!covered.has(v.toLowerCase().trim()));

  // Блок необработанных значений из базы
  const rawBlock=rawAmmo.length?`
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">
        В базе вылетов (${rawAmmo.length} вариантов)
        ${uncovered.length?`<span class="tag tag-warn" style="margin-left:8px">⚠ ${uncovered.length} не в справочнике</span>`:'<span class="tag tag-ok" style="margin-left:8px">✓ все покрыты</span>'}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${rawAmmo.map(v=>{
          const isCovered=covered.has(v.toLowerCase().trim());
          return `<span class="tag ${isCovered?'tag-ok':'tag-warn'}" style="cursor:pointer" title="${isCovered?'Покрыт справочником':'Нет в справочнике — нажмите чтобы добавить в алиасы'}" onclick="ammoQuickAdd('${v.replace(/'/g,"\\'")}')">
            ${v}${isCovered?'':' ⚡'}
          </span>`;
        }).join('')}
      </div>
    </div>`:'';

  if(!ammoCatalog.length){
    el.innerHTML=rawBlock+'<div style="color:var(--muted);font-size:12px">Справочник пуст — добавьте эталонные названия ниже</div>';
    return;
  }

  el.innerHTML=rawBlock+`<table style="width:100%;font-size:12px">
    <thead><tr><th>Название (эталон)</th><th>Категория</th><th>Алиасы</th><th>Действие</th></tr></thead>
    <tbody>${ammoCatalog.map((a,i)=>`<tr>
      <td style="padding:5px 8px"><input style="width:100%" value="${a.name}" onchange="ammoCatalog[${i}].name=this.value;ammoSave();renderAmmoList();"></td>
      <td style="padding:5px 8px">
        <select onchange="ammoCatalog[${i}].category=this.value;ammoSave();">
          <option value="минирование" ${a.category==='минирование'?'selected':''}>Минирование</option>
          <option value="доставка" ${a.category==='доставка'?'selected':''}>Доставка</option>
        </select>
      </td>
      <td style="padding:5px 8px"><input style="width:100%" value="${(a.aliases||[]).join(', ')}" onchange="ammoCatalog[${i}].aliases=this.value.split(',').map(s=>s.trim()).filter(Boolean);ammoSave();renderAmmoList();"></td>
      <td style="padding:5px 8px"><button class="btn btn-danger btn-sm" onclick="ammoDelete(${i})">✕</button></td>
    </tr>`).join('')}
    </tbody>
  </table>`;
}

// Быстрое добавление из базы — открывает форму с заполненным алиасом
function ammoQuickAdd(rawName){
  const nameEl=document.getElementById('ammo-new-name');
  const aliasEl=document.getElementById('ammo-new-aliases');
  if(!nameEl||!aliasEl)return;
  // Если точно такое название уже есть — добавляем в алиасы первого подходящего
  const existing=ammoCatalog.find(a=>a.name.toLowerCase()===rawName.toLowerCase());
  if(existing){
    // Уже есть как эталон — ничего не делать
    return;
  }
  // Проверяем не является ли алиасом
  const asAlias=ammoCatalog.find(a=>(a.aliases||[]).some(al=>al.toLowerCase()===rawName.toLowerCase()));
  if(asAlias){
    // Уже алиас — ничего
    return;
  }
  // Заполняем форму — пусть администратор решит как назвать эталон
  nameEl.value=rawName;
  aliasEl.value=rawName;
  nameEl.focus();
  nameEl.scrollIntoView({behavior:'smooth',block:'center'});
}

function ammoAdd(){
  const name=document.getElementById('ammo-new-name').value.trim();
  const cat=document.getElementById('ammo-new-cat').value;
  const aliases=document.getElementById('ammo-new-aliases').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!name){alert('Введите название');return;}
  if(ammoCatalog.some(a=>a.name.toLowerCase()===name.toLowerCase())){alert('Уже есть');return;}
  ammoCatalog.push({name,category:cat,aliases});
  ammoSave();
  renderAmmoList();
  document.getElementById('ammo-new-name').value='';
  document.getElementById('ammo-new-aliases').value='';
}

function ammoDelete(i){
  if(!confirm('Удалить "'+ammoCatalog[i].name+'"?'))return;
  ammoCatalog.splice(i,1);
  ammoSave();
  renderAmmoList();
}

function ammoNormalize(){
  let count=0;
  state.flights.forEach(f=>{
    if(!f.ammo)return;
    const norm=ammoNormalizeName(f.ammo);
    if(norm!==f.ammo){f.ammo=norm;count++;}
  });
  saveLocal();
  renderFlights();
  const st=document.getElementById('ammo-status');
  st.textContent=`✓ Исправлено ${count} записей`;
  st.style.color='var(--green2)';
  setTimeout(()=>{if(st)st.textContent='';},3000);
}

async function ammoSaveToCloud(){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  const token=authToken||localStorage.getItem('auth_token')||'';
  if(!url||!token){alert('Нет подключения к облаку');return;}
  const st=document.getElementById('ammo-status');
  st.textContent='Сохраняю...';
  try{
    const body=JSON.stringify({action:'update_ammo',admin_token:token,items:ammoCatalog});
    try{
      await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body,mode:'cors',redirect:'follow'});
    }catch(e){
      await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body,mode:'no-cors'});
    }
    st.textContent='✓ Сохранено в облако';st.style.color='var(--green2)';
  }catch(e){st.textContent='Ошибка: '+e.message;st.style.color='var(--red)';}
}

// ============ QUICK FLIGHT FORM ============
function initQuickForm(){
  const qp=document.getElementById('qf-pilot');
  const qpWrap=document.getElementById('qf-pilot-wrap');
  if(!qp)return;
  // state.role — текущая роль в переключателе, authUser.role — роль учётной записи
  const role=state.role||authUser.role||'';
  const isPilot=role==='pilot'||role==='pilot1'||role==='pilot2'||role==='pilot3';
  if(isPilot){
    if(qpWrap)qpWrap.style.display='none';
    // Для локальной учётки берём имя из переключателя расчётов
    const pilotName=authUser.login&&authUser.login!=='local'&&authUser.login!=='admin'
      ?authUser.login
      :(state.squads[0]?.pilot||'');
    qp.value=pilotName;
  } else {
    if(qpWrap)qpWrap.style.display='';
    if(authUser.login&&authUser.login!=='local'&&authUser.login!=='admin')
      qp.value=authUser.login;
  }
  autoFillFlightNum();
}

function autoFillFlightNum(){
  const pilot=document.getElementById('qf-pilot')?.value;
  if(!pilot)return;
  const today=new Date().toISOString().slice(0,10);
  const todayFlights=state.flights.filter(f=>f.pilot===pilot&&f.date===today);
  const maxNum=todayFlights.reduce((m,f)=>Math.max(m,f.flightnum||0),0);
  const nf=document.getElementById('qf-num');
  if(nf)nf.value=maxNum+1;
}

function saveQuickFlight(){
  const pilot=(document.getElementById('qf-pilot').value||'').trim();
  // Автонумерация: считаем вылеты пилота за сегодня
  const today2=new Date().toISOString().slice(0,10);
  const todayPilotFlights=state.flights.filter(f=>f.pilot===pilot&&f.date===today2);
  const maxNum2=todayPilotFlights.reduce((m,f)=>Math.max(m,f.flightnum||0),0);
  const num=maxNum2+1;
  const target=(document.getElementById('qf-target').value||'').trim();
  const ammoRaw=(document.getElementById('qf-ammo').value||'').trim();
  const drone=(document.getElementById('qf-drone').value||'').trim();
  const done=document.getElementById('qf-result').value==='yes';
  const returned=document.getElementById('qf-returned').value==='yes';
  const note=(document.getElementById('qf-note').value||'').trim();
  if(!pilot){alert('Укажите пилота');return;}
  if(!drone){alert('Укажите БПЛА');return;}
  const ammo=ammoNormalizeName(ammoRaw)||ammoRaw;
  const now=new Date();
  const f={
    id:Date.now()+'_'+Math.random().toString(36).slice(2),
    _savedTs:Date.now(),
    _submittedBy:authUser.login||'',
    date:now.toISOString().slice(0,10),
    time:now.toTimeString().slice(0,5),
    pilot,
    flightnum:num,
    target,ammo,drone,
    result:done?'yes':'no',
    returned:returned?'yes':'no',
    note
  };
  if(f.returned==='no'&&f.drone){writeDroneLoss(f.pilot,f.drone,f.date,f.time);setTimeout(()=>syncStockAndSquads(),500);}
  state.flights.unshift(f);
  saveLocal();
  appendToCloud('flights',f);
  renderFlights();renderDashboard();
  // Сбрасываем форму частично
  document.getElementById('qf-target').value='';
  document.getElementById('qf-ammo').value='';
  document.getElementById('qf-note').value='';
  document.getElementById('qf-result').value='yes';
  document.getElementById('qf-returned').value='yes';
  autoFillFlightNum();
  const st=document.getElementById('qf-status');
  st.textContent='✓ Вылет #'+f.flightnum+' записан — '+f.time;
  st.style.color='var(--green2)';
  logAction('flight','add','Вылет #'+f.flightnum+' '+pilot+' '+drone+(f.returned==='no'?' [потеря]':''));
  setTimeout(()=>{if(st)st.textContent='';},3000);
}

// ============ ACTIVITY LOG ============
let actLog=[];

function logAction(type, action, details){
  const entry={
    id:Date.now()+'_'+Math.random().toString(36).slice(2),
    ts:Date.now(),
    date:new Date().toISOString().slice(0,10),
    time:new Date().toTimeString().slice(0,5),
    user:authUser.login||'unknown',
    role:authUser.role||'',
    type,action,details
  };
  actLog.unshift(entry);
  if(actLog.length>500)actLog=actLog.slice(0,500);
  try{localStorage.setItem('act_log',JSON.stringify(actLog));}catch(e){}
  // Отправляем в облако
  appendToCloud('actlog',entry);
}

function actLogLoad(){
  try{
    const saved=localStorage.getItem('act_log');
    if(saved)actLog=JSON.parse(saved);
  }catch(e){}
}

async function loadActLogFromCloud(){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  const key=cfg.key||localStorage.getItem('cfg_key')||'';
  const token=authToken||localStorage.getItem('auth_token')||'';
  if(!url||!token)return;
  try{
    const r=await fetch(url+'?action=read&token='+encodeURIComponent(token));
    const d=await r.json();
    if(d.error||!d.actlog)return;
    const entries=await Promise.all(d.actlog.map(async row=>{
      try{return JSON.parse(key?await aesDecrypt(row.data,key):row.data);}catch(e){return null;}
    })).then(a=>a.filter(Boolean));
    // Сливаем с локальным
    entries.forEach(e=>{if(e&&e.id&&!actLog.some(x=>x.id===e.id))actLog.unshift(e);});
    actLog.sort((a,b)=>b.ts-a.ts);
    if(actLog.length>500)actLog=actLog.slice(0,500);
    try{localStorage.setItem('act_log',JSON.stringify(actLog));}catch(e){}
  }catch(e){console.warn('[ACTLOG]',e.message);}
}

function renderActLog(){
  const el=document.getElementById('actLogList');
  if(!el)return;
  const from=document.getElementById('actlog-from')?.value||'';
  const to=document.getElementById('actlog-to')?.value||'';
  const user=(document.getElementById('actlog-user')?.value||'').toLowerCase();
  const type=document.getElementById('actlog-type')?.value||'';
  let entries=[...actLog];
  if(from)entries=entries.filter(e=>e.date>=from);
  if(to)entries=entries.filter(e=>e.date<=to);
  if(user)entries=entries.filter(e=>(e.user||'').toLowerCase().includes(user));
  if(type)entries=entries.filter(e=>e.type===type);
  if(!entries.length){el.innerHTML='<div style="color:var(--muted);font-size:12px;padding:12px">Нет записей</div>';return;}
  el.innerHTML=`<table style="width:100%;font-size:12px">
    <thead><tr><th>Дата/Время</th><th>Пользователь</th><th>Роль</th><th>Тип</th><th>Действие</th><th>Детали</th></tr></thead>
    <tbody>${entries.map(e=>`<tr>
      <td style="padding:5px 8px;white-space:nowrap">${e.date} ${e.time}</td>
      <td style="padding:5px 8px;font-weight:700;color:var(--green)">${e.user}</td>
      <td style="padding:5px 8px;color:var(--muted)">${e.role}</td>
      <td style="padding:5px 8px"><span class="tag tag-gray">${e.type}</span></td>
      <td style="padding:5px 8px">${e.action}</td>
      <td style="padding:5px 8px;color:var(--text2)">${e.details||''}</td>
    </tr>`).join('')}
    </tbody>
  </table>`;
}

function actlogClearFilters(){
  ['actlog-from','actlog-to','actlog-user'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const ts=document.getElementById('actlog-type');if(ts)ts.value='';
  renderActLog();
}

// ============ ПРАВА ДОСТУПА ============
function applyRoleRestrictions(){
  const role=state.role||authUser.role||'';
  const isPilot=role.startsWith('pilot')||role==='pilot';
  const isTech=role==='tech';
  const isCmd=role==='cmd';
  const isAdmin=role==='admin';

  // Быстрая форма — только для пилотов и выше
  const qfc=document.getElementById('quickFlightCard');

  // Склад — кнопки добавления и передачи только для техника+
  const addBtn=document.getElementById('addDroneBtn');
  const trBtn=document.getElementById('transferBtnArea');
  if(addBtn)addBtn.style.display=(isTech||isAdmin)?'':'none';
  if(trBtn)trBtn.style.display=(isTech||isAdmin)?'':'none';

  // Форма ручного ввода вылета — скрываем для не-пилотов (они используют быструю)
  // Все роли могут добавлять вылеты — только синхронизация ограничена

  // Заполняем пилота в быстрой форме
  if(isPilot)initQuickForm();
}

// Делегирование для кнопки копирования вылета
document.addEventListener('click',function(e){
  const btn=e.target.closest('.copy-flight-btn');
  if(!btn)return;
  const text=btn.dataset.copy||'';
  navigator.clipboard.writeText(text).then(()=>{
    btn.textContent='✓';
    btn.style.color='var(--green)';
    setTimeout(()=>{btn.textContent='⎘';btn.style.color='';},1500);
  }).catch(()=>{
    // Фолбек для старых браузеров
    const ta=document.createElement('textarea');
    ta.value=text;document.body.appendChild(ta);ta.select();
    document.execCommand('copy');document.body.removeChild(ta);
    btn.textContent='✓';setTimeout(()=>btn.textContent='⎘',1500);
  });
});

// ============ CONFIG & SYNC ENGINE ============
let cfg={url:'',key:''};

function cfgLoad(){
  try{
    cfg.url=localStorage.getItem('cfg_url')||'';
    // Не перезаписываем ключ если он уже установлен (например из URL параметра)
    if(!cfg.key) cfg.key=localStorage.getItem('cfg_key')||'';
    const u=document.getElementById('cfg-url');
    const k=document.getElementById('cfg-key');
    if(u)u.value=cfg.url;
    if(k&&cfg.key)k.value=cfg.key;
    updateEncryptBadge();
  }catch(e){}
}

function cfgSaveSettings(){
  cfg.url=(document.getElementById('cfg-url').value||'').trim();
  const keyField=(document.getElementById('cfg-key').value||'').trim();
  // Не затираем ключ если поле пустое — берём текущий из памяти
  if(keyField) cfg.key=keyField;
  try{
    localStorage.setItem('cfg_url',cfg.url);
    if(cfg.key)localStorage.setItem('cfg_key',cfg.key);
  }catch(e){}
  // Синхронизируем поле с актуальным ключом
  const kField=document.getElementById('cfg-key');
  if(kField&&cfg.key)kField.value=cfg.key;
  updateEncryptBadge();
  const nuke2=document.getElementById('nu-enckey');if(nuke2)nuke2.value=cfg.key||'';
  const st=document.getElementById('cfg-conn-status');
  st.textContent='✓ Настройки сохранены';st.style.color='var(--green2)';
  renderSettingsStatus();
}

function updateEncryptBadge(){
  const el=document.getElementById('cfg-encrypt-on');
  if(el)el.style.display=cfg.key?'block':'none';
  const rb=document.getElementById('cfg-reencrypt-block');
  if(rb)rb.style.display=(cfg.key&&state.role==='admin')?'block':'none';
}

async function cfgTestConnection(){
  const url=(document.getElementById('cfg-url').value||'').trim();
  const st=document.getElementById('cfg-conn-status');
  if(!url){st.textContent='Укажите URL';st.style.color='var(--red)';return;}
  st.textContent='Проверяю...';st.style.color='var(--muted)';
  try{
    const r=await fetch(url+'?action=ping',{redirect:'follow'});
    const d=await r.json();
    if(d.status==='ok'){st.textContent='✓ Соединение установлено';st.style.color='var(--green2)';}
    else{st.textContent='Ответ: '+JSON.stringify(d);st.style.color='var(--amber)';}
  }catch(e){st.textContent='Ошибка: '+e.message;st.style.color='var(--red)';}
}

function renderSettingsStatus(){
  const el=document.getElementById('cfg-last-sync');if(!el)return;
  const last=localStorage.getItem('last_sync');
  if(!cfg.url){el.textContent='URL не настроен';el.style.color='var(--muted)';return;}
  if(!cfg.key){el.innerHTML='<span style="color:var(--amber)">⚠ Ключ не задан — данные хранятся открыто</span>';return;}
  el.textContent=last?'Последняя синхронизация: '+new Date(parseInt(last)).toLocaleString('ru'):'Ещё не синхронизировано';
  el.style.color=last?'var(--green2)':'var(--muted)';
}

// AES-256-GCM
async function getKey(password){
  const enc=new TextEncoder();
  const km=await crypto.subtle.importKey('raw',enc.encode(password),{name:'PBKDF2'},false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:enc.encode('asu-bpla-v1'),iterations:100000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function aesEncrypt(text,password){
  const key=await getKey(password);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const enc=new TextEncoder();
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(text));
  const buf=new Uint8Array(iv.length+cipher.byteLength);
  buf.set(iv,0);buf.set(new Uint8Array(cipher),iv.length);
  return btoa(String.fromCharCode(...buf));
}
async function aesDecrypt(b64,password){
  const key=await getKey(password);
  const buf=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(0,12)},key,buf.slice(12));
  return new TextDecoder().decode(plain);
}

async function syncToCloud(silent=false){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  const key=cfg.key||localStorage.getItem('cfg_key')||'';
  if(!url){if(!silent)alert('Укажите URL в настройках');return;}
  const st=document.getElementById('cfg-sync-status');
  const ind=document.getElementById('syncIndicator');
  if(st)st.textContent='Шифрую и отправляю...';
  if(ind){ind.className='sync-indicator syncing';ind.textContent='↑ синхр...';}
  try{
    const token=authToken||localStorage.getItem('auth_token')||'';
    const ts=Date.now();
    async function encRow(obj){
      const json=JSON.stringify(obj);
      if(!key)return{id:obj.id||ts,data:json};
      return{id:obj.id||ts,data:await aesEncrypt(json,key)};
    }
    const flights=await Promise.all(state.flights.map((f,i)=>encRow({...f,id:f.id||(ts+i)})));
    const stock=await Promise.all(state.stock.map((d,i)=>encRow({...d,id:d.id||(ts+i)})));
    const squads=await Promise.all(state.squads.map((sq,i)=>encRow({...sq,id:sq.id||(ts+i)})));
    const transfers=await Promise.all((state.transfers||[]).map((t,i)=>encRow({...t,id:t.id||(ts+i)})));
    const body=JSON.stringify({action:'write',token,data:{flights,stock,squads,transfers}});
    console.log('[SYNC] body size:',body.length,'flights:',state.flights.length);
    let syncOk=false;
    // Пробуем cors сначала
    try{
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body,mode:'cors',redirect:'follow'});
      const d=await r.json();
      if(d.error)throw new Error(d.error);
      syncOk=true;
      console.log('[SYNC] cors OK, ts:',d.ts);
    }catch(e1){
      console.warn('[SYNC] cors failed:',e1.message,', trying no-cors');
      // Любая ошибка — пробуем no-cors
      try{
        await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body,mode:'no-cors'});
        syncOk=true;
        console.log('[SYNC] no-cors sent (unverified)');
      }catch(e2){
        throw new Error('Не удалось отправить данные: '+e2.message);
      }
    }
    localStorage.setItem('last_sync',Date.now().toString());
    if(st){st.textContent='✓ Выгружено — '+new Date().toLocaleTimeString('ru');st.style.color='var(--green2)';}
    if(ind){ind.className='sync-indicator saved';ind.textContent='● онлайн';}
    renderSettingsStatus();
    if(!silent)showSyncToast('✓ Данные выгружены в облако');
  }catch(e){
    if(st){st.textContent='Ошибка: '+e.message;st.style.color='var(--red)';}
    if(ind){ind.className='sync-indicator';ind.textContent='⚠ ошибка';}
    if(!silent)alert('Ошибка синхронизации: '+e.message);
  }
}

async function decryptRows(rows, key){
  if(!rows||!rows.length)return[];
  return Promise.all(rows.map(async r=>{
    try{
      const json=key?await aesDecrypt(r.data,key):r.data;
      return JSON.parse(json);
    }catch(e){console.warn('[DEC] row error:',e.message,r.id);return null;}
  })).then(arr=>arr.filter(Boolean));
}

async function loadFromCloud(url, token, key){
  // cache-buster чтобы браузер не отдавал кешированный ответ
  const r=await fetch(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(),{redirect:'follow'});
  const d=await r.json();
  if(d.error)throw new Error(d.error);
  // Загружаем журнал действий если есть
  if(d.actlog&&d.actlog.length){
    const entries=await Promise.all(d.actlog.map(async row=>{
      try{return JSON.parse(key?await aesDecrypt(row.data,key):row.data);}catch(e){return null;}
    })).then(a=>a.filter(Boolean));
    // Сливаем с локальным
    entries.forEach(e=>{if(!actLog.some(x=>x.id===e.id))actLog.unshift(e);});
    actLog.sort((a,b)=>b.ts-a.ts);
    if(actLog.length>500)actLog=actLog.slice(0,500);
    try{localStorage.setItem('act_log',JSON.stringify(actLog));}catch(e){}
  }
  return {
    flights: await decryptRows(d.flights,key),
    stock:   await decryptRows(d.stock,key),
    squads:  (await decryptRows(d.squads,key)).map(sq=>({...sq,drones:Array.isArray(sq.drones)?sq.drones:[]})),
    transfers: await decryptRows(d.transfers,key),
    users: d.users||[]
  };
}

async function syncFromCloudSilent(){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  const key=cfg.key||localStorage.getItem('cfg_key')||'';
  if(!url)return;
  const ind=document.getElementById('syncIndicator');
  if(ind){ind.className='sync-indicator syncing';ind.textContent='↓ загрузка...';}
  try{
    const token=authToken||localStorage.getItem('auth_token')||'';
    const loaded=await loadFromCloud(url,token,key);
    const lastSync=parseInt(localStorage.getItem('last_sync')||'0');
    const lastLocalChange=parseInt(localStorage.getItem('last_local_change')||'0');
    const hasUnsyncedChanges=lastLocalChange>lastSync;
    // Вылеты всегда обновляем из облака
    state.flights=loaded.flights;
    if(!hasUnsyncedChanges){
      // Нет несинхронизированных изменений — безопасно обновляем всё
      state.stock=loaded.stock;
      state.squads=loaded.squads;
      state.transfers=loaded.transfers;
    } else {
      // Есть несинхронизированные изменения — сливаем transfers (добавляем новые из облака)
      console.log('[SYNC] Защита локальных изменений — сливаем transfers вместо замены');
      const localIds=new Set((state.transfers||[]).map(t=>t.id).filter(Boolean));
      const newFromCloud=(loaded.transfers||[]).filter(t=>t.id&&!localIds.has(t.id));
      state.transfers=[...(state.transfers||[]),...newFromCloud]
        .sort((a,b)=>((b.date||'')+(b.time||'')).localeCompare((a.date||'')+(a.time||'')));
    }
    state.offlineQueue=[];
    try{localStorage.setItem('droneState',JSON.stringify(state));}catch(e){}
    localStorage.setItem('last_sync',Date.now().toString());
    localStorage.removeItem('last_local_change');
    renderDashboard();renderInventory();renderFlights();fillDataLists();rebuildRoleSelector();
    if(ind){ind.className='sync-indicator saved';ind.textContent='● онлайн';}
    renderSettingsStatus();
  }catch(e){
    if(ind){ind.className='sync-indicator';ind.textContent='⚠ ошибка';}
    console.error('[SYNC] silent error:',e.message);
  }
}
async function syncFromCloud(){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  const key=cfg.key||localStorage.getItem('cfg_key')||'';
  if(!url){alert('Укажите URL в настройках');return;}
  const st=document.getElementById('cfg-sync-status');
  const ind=document.getElementById('syncIndicator');
  if(st)st.textContent='Загружаю...';
  if(ind){ind.className='sync-indicator syncing';ind.textContent='↓ загрузка...';}
  try{
    const token=authToken||localStorage.getItem('auth_token')||'';
    if(!confirm('Загрузить данные из облака? Локальные данные будут заменены.'))return;
    const loaded=await loadFromCloud(url,token,key);
    state.flights=loaded.flights;state.stock=loaded.stock;
    state.squads=loaded.squads;state.transfers=loaded.transfers;state.offlineQueue=[];
    saveLocalOnly();localStorage.setItem('last_sync',Date.now().toString());
    renderDashboard();renderInventory();renderFlights();fillDataLists();rebuildRoleSelector();
    if(st){st.textContent='✓ Загружено — '+new Date().toLocaleTimeString('ru');st.style.color='var(--green2)';}
    if(ind){ind.className='sync-indicator saved';ind.textContent='● онлайн';}
    renderSettingsStatus();showSyncToast('✓ Данные загружены из облака');
  }catch(e){
    if(st){st.textContent='Ошибка: '+e.message;st.style.color='var(--red)';}
    if(ind){ind.className='sync-indicator';ind.textContent='⚠ ошибка';}
    alert('Ошибка загрузки: '+e.message);
  }
}
async function cfgReencrypt(){
  const nk=(document.getElementById('cfg-newkey').value||'').trim();
  const nk2=(document.getElementById('cfg-newkey2').value||'').trim();
  if(!nk){alert('Введите новый ключ');return;}
  if(nk!==nk2){alert('Ключи не совпадают');return;}
  if(!confirm('Сменить ключ и перешифровать данные в облаке?'))return;
  cfg.key=nk;localStorage.setItem('cfg_key',nk);
  document.getElementById('cfg-key').value=nk;
  document.getElementById('cfg-newkey').value='';document.getElementById('cfg-newkey2').value='';
  await syncToCloud(false);
  alert('Ключ сменён. Сообщите новый ключ всем пользователям.');
  updateEncryptBadge();
}

function showSyncToast(msg){
  let t=document.getElementById('syncToast');
  if(!t){t=document.createElement('div');t.id='syncToast';
    t.style.cssText='position:fixed;bottom:16px;right:16px;background:var(--green-dim);border:1px solid var(--green3);color:var(--green);padding:8px 16px;font-size:12px;z-index:9999;font-family:inherit;letter-spacing:1px';
    document.body.appendChild(t);}
  t.textContent=msg;t.style.display='block';
  setTimeout(()=>{t.style.display='none';},3000);
}

// Автосинхронизация через 2 сек после каждого сохранения
// saveLocalOnly — тихое сохранение без запуска синхронизации (для pollCloud)
function saveLocalOnly(){
  try{localStorage.setItem('droneState',JSON.stringify(state));}catch(e){}
}


// ============ APPEND TO CLOUD (одна запись) ============
async function appendToCloud(sheet, obj){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  const key=cfg.key||localStorage.getItem('cfg_key')||'';
  const token=authToken||localStorage.getItem('auth_token')||'';
  if(!url||!token)return;
  try{
    const json=JSON.stringify(obj);
    const data=key?await aesEncrypt(json,key):json;
    const body=JSON.stringify({action:'append_one',token,sheet,row:{id:obj.id||Date.now(),data}});
    // Пробуем cors, потом no-cors
    try{
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body,mode:'cors',redirect:'follow'});
      await r.json();
    }catch(e){
      await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body,mode:'no-cors'});
    }
  }catch(e){console.warn('[APPEND] error:',e.message);}
}

// ============ АВТОПОЛЛИНГ — читаем новые записи других пользователей ============
let _lastPollTs=Date.now();
let _lastStockTs=0; // Начинаем с текущего момента — не грузим всю историю
async function pollCloud(){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  const key=cfg.key||localStorage.getItem('cfg_key')||'';
  const token=authToken||localStorage.getItem('auth_token')||'';
  if(!url||!token)return;
  const ind=document.getElementById('syncIndicator');
  try{
    // Берём время последнего поллинга — только новее него
    const since=_lastPollTs;
    const r=await fetch(url+'?action=read_since&token='+encodeURIComponent(token)+'&since='+since+'&_='+Date.now(),{redirect:'follow'});
    const d=await r.json();
    if(d.error){console.warn('[POLL]',d.error);return;}
    const newFlights=(d.flights||[]).length;
    const newTransfers=(d.transfers||[]).length;
    if(newFlights||newTransfers)
      console.log('[POLL]',new Date().toLocaleTimeString('ru'),'новых:',newFlights,'вылетов,',newTransfers,'операций');
    _lastPollTs=Date.now(); // Обновляем ПОСЛЕ успешного запроса

    async function mergeRows(remoteRows, localArr){
      if(!remoteRows||!remoteRows.length)return false;
      let added=false;
      for(const row of remoteRows){
        try{
          const json=key?await aesDecrypt(row.data,key):row.data;
          const obj=JSON.parse(json);
          const objId=obj.id;
          const exists=localArr.some(x=>x.id===objId);
          if(!exists){
            localArr.unshift(obj);
            added=true;
            if(localArr===state.flights&&obj.returned==='no'&&obj.drone){
              writeDroneLoss(obj.pilot,obj.drone,obj.date,obj.time);
              setTimeout(()=>syncStockAndSquads(),500);
            }
          }
        }catch(e){console.warn('[POLL] row error:',e.message);}
      }
      return added;
    }

    let changed=false;
    if(await mergeRows(d.flights,state.flights))changed=true;
    if(await mergeRows(d.transfers,state.transfers||(state.transfers=[])))changed=true;
    // Сливаем записи журнала действий
    if(d.actlog&&d.actlog.length){
      for(const row of d.actlog){
        try{
          const obj=JSON.parse(key?await aesDecrypt(row.data,key):row.data);
          if(!actLog.some(e=>e.id===obj.id)){
            actLog.unshift(obj);changed=true;
          }
        }catch(e){}
      }
      actLog.sort((a,b)=>b.ts-a.ts);
      if(actLog.length>500)actLog=actLog.slice(0,500);
      try{localStorage.setItem('act_log',JSON.stringify(actLog));}catch(e){}
    }

    // Для склада и расчётов — если timestamp склада в облаке новее нашего, запрашиваем полную синхронизацию
    if(d.stock_updated_ts&&d.stock_updated_ts>(_lastStockTs||0)){
      console.log('[POLL] Склад обновился в облаке, загружаем только склад и расчёты');
      _lastStockTs=d.stock_updated_ts;
      try{
        const r2=await fetch(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(),{redirect:'follow'});
        const d2=await r2.json();
        if(!d2.error){
          // Расшифровываем только stock и squads — flights НЕ трогаем
          const decStock=await Promise.all((d2.stock||[]).map(async r=>{
            try{return JSON.parse(key?await aesDecrypt(r.data,key):r.data);}catch(e){return null;}
          })).then(a=>a.filter(Boolean));
          const decSquads=await Promise.all((d2.squads||[]).map(async r=>{
            try{const o=JSON.parse(key?await aesDecrypt(r.data,key):r.data);
              if(!Array.isArray(o.drones))o.drones=[];return o;}catch(e){return null;}
          })).then(a=>a.filter(Boolean));
          if(decStock.length||d2.stock?.length===0){state.stock=decStock;changed=true;}
          if(decSquads.length||d2.squads?.length===0){state.squads=decSquads;changed=true;}
          console.log('[POLL] Склад обновлён:',decStock.length,'позиций, расчётов:',decSquads.length);
        }
      }catch(e){console.warn('[POLL] stock sync error:',e.message);}
    }

    if(changed){
      saveLocalOnly(); // Не запускаем автосинхронизацию — только localStorage
      renderDashboard();
      renderFlights();
      renderInventory();
      rebuildRoleSelector();
      if(ind){ind.className='sync-indicator saved';ind.textContent='● онлайн';}
      if(newFlights>0)showSyncToast('↓ '+newFlights+' новых вылетов');
    } else {
      // Обновляем время последней проверки в индикаторе
      if(ind){
        ind.className='sync-indicator saved';
        ind.textContent='● '+new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
      }
    }
  }catch(e){
    console.warn('[POLL] error:',e.message);
    if(ind){ind.className='sync-indicator';ind.textContent='⚠ нет связи';}
  }
}

// Запускаем автополлинг каждые 30 сек
// Синхронизирует только склад и расчёты (после изменений дронов)
async function syncStockAndSquads(){
  const url=cfg.url||localStorage.getItem('cfg_url')||'';
  const key=cfg.key||localStorage.getItem('cfg_key')||'';
  const token=authToken||localStorage.getItem('auth_token')||'';
  if(!url||!token)return;
  try{
    const ts=Date.now();
    async function encRow(obj){
      const json=JSON.stringify(obj);
      if(!key)return{id:obj.id||ts,data:json};
      return{id:obj.id||ts,data:await aesEncrypt(json,key)};
    }
    const stock=await Promise.all(state.stock.map((d,i)=>encRow({...d,id:d.id||(ts+i)})));
    const squads=await Promise.all(state.squads.map((sq,i)=>encRow({...sq,id:sq.id||(ts+i)})));
    // flights и transfers НЕ передаём (null) — writeAll их не тронет
    const body=JSON.stringify({action:'write',token,data:{stock,squads}});
    try{
      await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body,mode:'cors',redirect:'follow'});
    }catch(e){
      await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body,mode:'no-cors'});
    }
    localStorage.setItem('last_sync',Date.now().toString());
    localStorage.removeItem('last_local_change');
    console.log('[SYNC] stock+squads OK');
  }catch(e){console.warn('[SYNC STOCK]',e.message);}
}

function startPolling(){
  if(window._pollInterval)clearInterval(window._pollInterval);
  window._pollInterval=setInterval(()=>{
    const url=cfg.url||localStorage.getItem('cfg_url')||'';
    const token=authToken||localStorage.getItem('auth_token')||'';
    if(url&&token&&navigator.onLine)pollCloud();
  },30000);
  // Полная синхронизация раз в 5 минут — подхватывает удаления
  if(window._fullSyncInterval)clearInterval(window._fullSyncInterval);
  window._fullSyncInterval=setInterval(()=>{
    const url=cfg.url||localStorage.getItem('cfg_url')||'';
    const token=authToken||localStorage.getItem('auth_token')||'';
    if(url&&token&&navigator.onLine){
      console.log('[SYNC] Плановая полная синхронизация');
      syncFromCloudSilent();
    }
  },5*60*1000);
}

rebuildRoleSelector();
renderDashboard();
renderInventory();
renderFlights();
loadApiKey();
fillDataLists();
// Дефолтные даты в отчётах — первое число текущего месяца и сегодня
(function(){
  const now=new Date();
  const today=now.toISOString().slice(0,10);
  const firstDay=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
  const repFrom=document.getElementById('repFrom');
  const repTo=document.getElementById('repTo');
  if(repFrom&&!repFrom.value)repFrom.value=firstDay;
  if(repTo&&!repTo.value)repTo.value=today;
})();
// Восстановить тему, размер и роль
try{
  const savedTheme=localStorage.getItem('theme')||'terminal';
  const savedSize=localStorage.getItem('fontSize')||'14';
  const savedRole=localStorage.getItem('role')||'cmd';
  document.getElementById('themeSwitch').value=savedTheme;
  document.getElementById('fontSizeSwitch').value=savedSize;
  applyTheme(savedTheme);
  applyFontSize(savedSize);
  // Синхронизируем селектор роли и применяем
  const roleSel=document.getElementById('roleSwitch');
  const optExists=[...roleSel.options].some(o=>o.value===savedRole);
  roleSel.value=optExists?savedRole:'cmd';
  switchRole(roleSel.value);
}catch(e){applyTheme('terminal');applyFontSize('14');switchRole('cmd');}
// ВАЖНО: cfgLoad до initAuth — нужен URL для синхронизации
cfgLoad();
renderSettingsStatus();
ammoLoad();
actLogLoad();
document.getElementById('nu-enckey').value=cfg.key||'';
// initAuth вызываем последним — он использует cfg.url и cfg.key
initAuth().then(()=>startPolling());
