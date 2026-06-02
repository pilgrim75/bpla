
// ============ STATE ============
const ROLES_BASE={admin:'Администратор',cmd:'Командир',tech:'Техник'};
const DRONE_CATALOG=['Гамаюн13','Гамаюн13д','Гамаюн13т','Гамаюн12','КИРМ','ПВХ1','Упырь11','Упырь18','Курьер21'];

function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ============ UTILS ============
// Уникальный id. prefix помечает источник: 'f' вылет, 't' transfer, 'a' actlog и т.п.
function genId(prefix){return Date.now()+'_'+(prefix?prefix+'_':'')+Math.random().toString(36).slice(2);}
// Текущая дата ISO (YYYY-MM-DD) и время (HH:MM) — локальные
function todayISO(){return new Date().toISOString().slice(0,10);}
function nowHM(){return new Date().toTimeString().slice(0,5);}

// Статус-сообщение в элемент с цветом из дизайн-системы.
// kind: 'ok'|'err'|'warn'|'muted' (по умолчанию muted)
const STATUS_COLORS={ok:'var(--green2)',err:'var(--red)',warn:'var(--amber)',muted:'var(--muted)'};
function setStatus(elId,text,kind){
  const el=typeof elId==='string'?document.getElementById(elId):elId;
  if(!el)return;
  el.textContent=text;
  el.style.color=STATUS_COLORS[kind]||STATUS_COLORS.muted;
}

// Единая проверка роли пилота (формы: 'pilot', 'pilot_0', 'pilot1' и т.п.)
function isPilotRole(role){return !!role&&role.startsWith('pilot');}

// Затемнённый модальный оверлей. Возвращает контейнер (.appendChild уже сделан).
function modalOverlay(innerHTML){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center';
  ov.innerHTML=innerHTML;
  document.body.appendChild(ov);
  return ov;
}

// Конструктор записи перемещения с дефолтами id/date/time.
// type: 'transfer'|'arrival'|'loss'|'exchange'
function makeTransfer(type,fields){
  return {id:genId('t'),type,date:todayISO(),time:nowHM(),...fields};
}

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
    {pilot:'Поп',drones:[{name:'Гамаюн13д',qty:2},{name:'ПВХ1',qty:1}]},
    {pilot:'Толстый',drones:[{name:'Гамаюн13д',qty:1},{name:'КИРМ',qty:1}]},
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
  transfers: []
};

function saveLocal(){
  try{localStorage.setItem('droneState',JSON.stringify(state));}catch(e){}
  // Debounce — отправляем в облако через 2 сек после последнего изменения
  clearTimeout(saveLocal._timer);
  saveLocal._timer=setTimeout(()=>{
    const {url,token}=syncGetCfg();
    if(url&&token&&navigator.onLine)syncPushAll(true);
  },2000);
}
function loadLocal(){
  try{
    const s=localStorage.getItem('droneState');
    if(s){
      state=JSON.parse(s);
      // Чистим невалидные записи transfers (с undefined полями)
      if(state.transfers){
        state.transfers=state.transfers.filter(t=>
          t&&t.type&&(t.drone||t.from||t.to)
        );
      }
    }
  }catch(e){}
}
loadLocal();

function migrateSquadsToTransfers(){
  if(localStorage.getItem('_transfers_migrated_v1'))return;
  const existing=new Set(
    (state.transfers||[]).filter(t=>t.type==='transfer'&&t.to!=='склад').map(t=>t.to+'||'+t.drone)
  );
  const toAdd=[];
  (state.squads||[]).forEach(sq=>{
    (sq.drones||[]).forEach(d=>{
      if(d.qty>0&&d.name&&!existing.has(sq.pilot+'||'+d.name)){
        toAdd.push(makeTransfer('transfer',{
          id:genId('mig'),
          date:'2000-01-01',time:'00:00',
          from:'склад',to:sq.pilot,
          drone:d.name,qty:d.qty,
          note:'начальные данные'
        }));
      }
    });
  });
  if(toAdd.length){
    if(!state.transfers)state.transfers=[];
    state.transfers.push(...toAdd);
    saveLocal();
  }
  localStorage.setItem('_transfers_migrated_v1','1');
}
migrateSquadsToTransfers();

// ============ NETWORK ============
function checkNet(){
  const bar=document.getElementById('netBar');
  const ind=document.getElementById('syncIndicator');
  if(navigator.onLine){
    bar.innerHTML='';
    ind.className='sync-indicator saved';
    ind.textContent='● онлайн';
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
  document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
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
      showPage('dashboard',document.querySelector('#nav button'));
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
  syncEditFlight(idx,field,val);
}

function adminDeleteFlight(idx){
  if(!confirm('Удалить этот вылет?'))return;
  syncDeleteFlight(idx);
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
  const op=makeTransfer('arrival',{drone:n,qty:q,note:'статус: '+s});
  if(!state.transfers)state.transfers=[];
  state.transfers.unshift(op);
  saveLocal();
  syncAddTransfer(op);
  syncPushStockSquads();
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

function _logAdminTransfer(pilot,drone,delta,note){
  if(!pilot||!drone||delta===0)return;
  if(!state.transfers)state.transfers=[];
  state.transfers.unshift(makeTransfer('transfer',{
    from:delta>0?'склад':pilot,
    to:delta>0?pilot:'склад',
    drone,qty:Math.abs(delta),
    note:note||'адм'
  }));
}

function adminEditSquadPilot(si,val){
  if(state.squads[si])state.squads[si].pilot=val;
  saveLocal();
}
function adminEditSquadDrone(si,di,field,val){
  const sq=state.squads[si];const d=sq&&sq.drones[di];
  if(d){
    if(field==='qty'){const delta=(parseInt(val)||0)-d.qty;if(delta&&d.name)_logAdminTransfer(sq.pilot,d.name,delta,'адм');}
    else if(field==='name'&&val&&!d.name&&d.qty>0)_logAdminTransfer(sq.pilot,val,d.qty,'адм');
    d[field]=val;
  }
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
  ds.forEach(n=>_logAdminTransfer(p,n,1,'адм: новый расчёт'));
  saveLocal();
  renderAdminSquads();
  renderDashboard();
  document.getElementById('adm-newPilot').value='';
  document.getElementById('adm-newPilotDrones').value='';
}

function adminManualSave(){
  saveLocal();
  setStatus('saveStatus','✓ Сохранено в браузер — '+new Date().toLocaleString('ru'),'ok');
}

function adminExportJSON(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='bpla_backup_'+todayISO()+'.json';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('saveStatus','✓ Файл скачан — '+a.download,'ok');
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
      setStatus('saveStatus','✓ Данные загружены из файла: '+file.name,'ok');
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
  setStatus('saveStatus','Все вылеты удалены — '+new Date().toLocaleString('ru'),'err');
}

function adminResetAll(){
  if(!confirm('ПОЛНЫЙ СБРОС всех данных? Склад, расчёты и вылеты будут удалены. Необратимо.'))return;
  if(!confirm('Вы уверены? Данные будут потеряны.'))return;
  localStorage.removeItem('droneState');
  location.reload();
}

// Удаляет записи о потерях, у которых нет соответствующего вылета
// (остаются когда вылет удаляют или меняют returned: no → yes без очистки)
function adminCleanOrphanLosses(){
  const losses=(state.transfers||[]).filter(t=>t.type==='loss');
  if(!losses.length){
    setStatus('saveStatus','Записей о потерях в журнале нет','muted');
    return;
  }
  // Строим ключи вылетов с потерей: pilot+drone+date (без времени — допуск на редактирование)
  const lostFlightKeys=new Set(
    state.flights
      .filter(f=>f.returned==='no')
      .map(f=>(f.pilot||'').toLowerCase()+'|'+(f.drone||'').toLowerCase()+'|'+(f.date||''))
  );
  const before=(state.transfers||[]).length;
  state.transfers=(state.transfers||[]).filter(t=>{
    if(t.type!=='loss')return true;
    const key=(t.pilot||'').toLowerCase()+'|'+(t.drone||'').toLowerCase()+'|'+(t.date||'');
    return lostFlightKeys.has(key);
  });
  const removed=before-(state.transfers||[]).length;
  saveLocal();
  if(removed>0){
    syncPushStockSquads();
    renderInventory();
  }
  setStatus('saveStatus',
    removed>0
      ?`✓ Удалено ${removed} осирот. ${removed===1?'запись':'записей'} о потерях — ${new Date().toLocaleString('ru')}`
      :'✓ Осиротевших записей не найдено — журнал чистый',
    removed>0?'ok':'muted');
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
      `<div class="stat-row"><span>${n}</span><span style="${q<0?'color:var(--color-text-danger)':''}">${q}</span></div>`
    ).join('');

  document.getElementById('st-stock').textContent=totalStock;
  document.getElementById('st-stock-detail').innerHTML=
    Object.entries(stockByName).length
      ? Object.entries(stockByName).sort((a,b)=>b[1]-a[1]).map(([n,q])=>
          `<div class="stat-row"><span>${n}</span><span>${q}</span></div>`
        ).join('')
      :'<span style="color:var(--color-text-secondary)">склад пуст</span>';

  // --- Вылеты ---
  const fAll=state.flights;
  const fToday=fAll.filter(x=>x.date===today);
  const fWeek=fAll.filter(x=>x.date>=weekAgo);
  const fMonth=fAll.filter(x=>x.date>=monthStart);
  const lossToday=fToday.filter(x=>x.returned==='no').length;
  const doneToday=fToday.filter(x=>x.result==='yes').length;
  const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';

  document.getElementById('st-flights').textContent=fToday.length;
  const lossWeek=fWeek.filter(x=>x.returned==='no').length;
  document.getElementById('st-flights-detail').innerHTML=
    `<div class="stat-row"><span>Сегодня — выполнено ${pct(doneToday,fToday.length)}</span>${lossToday?`<span class="tag-danger" style="font-size:11px;color:var(--color-text-danger);font-weight:500">потеря: ${lossToday}</span>`:''}</div>`+
    `<div class="stat-row"><span>За неделю: ${fWeek.length}</span>${lossWeek?`<span class="tag-danger" style="font-size:11px;color:var(--color-text-danger);font-weight:500">потери: ${lossWeek}</span>`:''}</div>`+
    `<div class="stat-row"><span>За месяц: ${fMonth.length}</span><span style="font-size:11px;color:var(--color-text-secondary)">база: ${fAll.length}</span></div>`;

  // --- Расчёты ---
  document.getElementById('dashSquads').innerHTML=state.squads.map(sq=>{
    const sqFlightsToday=fToday.filter(x=>x.pilot===sq.pilot);
    const sqFlightsWeek=fWeek.filter(x=>x.pilot===sq.pilot);
    const sqLossWeek=sqFlightsWeek.filter(x=>x.returned==='no').length;
    const lastFlight=[...fAll].filter(x=>x.pilot===sq.pilot).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time))[0];
    const drones=sq.drones.filter(d=>d.qty!==0);
    return `<div class="crew-item">
      <div class="crew-header">
        <div>
          <div class="crew-name">Пилот ${sq.pilot}</div>
          <div class="crew-sub">Последний вылет: ${lastFlight?lastFlight.date+' '+lastFlight.time:'нет данных'}</div>
        </div>
        <div class="crew-flights">${sqFlightsToday.length?sqFlightsToday.length+' сегодня':'нет вылетов'}</div>
      </div>
      <div class="crew-tags">
        ${drones.map(d=>`<div class="crew-tag">${d.name} × ${d.qty}</div>`).join('')}
        ${drones.length===0?'<div class="crew-tag" style="color:var(--color-text-secondary)">нет дронов</div>':''}
      </div>
      <div style="font-size:11px;color:var(--color-text-secondary);margin-top:6px">За неделю: ${sqFlightsWeek.length} вылетов${sqLossWeek?` · <span style="color:var(--color-text-danger)">потери: ${sqLossWeek}</span>`:''}</div>
    </div>`;
  }).join('')||'<div style="color:var(--color-text-secondary);padding:12px 16px">Нет расчётов</div>';

  // --- Вылеты сегодня / вчера ---
  const sortDesc=(a,b)=>(b.date+b.time).localeCompare(a.date+a.time);
  const todayFlights=[...fAll].filter(x=>x.date===today).sort(sortDesc);
  const yesterdayFlights=[...fAll].filter(x=>x.date===yest).sort(sortDesc);

  const flightRow=x=>`
    <div class="flight-item">
      <div class="flight-time">${x.time}</div>
      <div class="flight-pilot">${x.pilot}</div>
      <div class="flight-status ${x.returned==='no'?'s-loss':'s-ok'}">${x.returned==='no'?'потеря':'вылет'}</div>
      <div class="flight-drone">${x.drone||'—'}</div>
      <div class="flight-target"><i class="ti ti-map-pin"></i> ${x.target||'—'}${x.returned==='no'?' · <span style="font-size:11px;color:var(--color-text-danger)">борт потерян</span>':''}</div>
    </div>`;

  let html='';
  if(todayFlights.length){
    html+=`<div class="day-label">Сегодня <span class="day-count">${todayFlights.length} вылетов</span></div>`;
    html+=todayFlights.map(flightRow).join('');
  }
  if(yesterdayFlights.length){
    html+=`<div class="day-label">Вчера <span class="day-count">${yesterdayFlights.length} вылетов</span></div>`;
    html+=yesterdayFlights.slice(0,8).map(flightRow).join('');
    if(yesterdayFlights.length>8)html+=`<div style="font-size:11px;color:var(--color-text-secondary);padding:8px 16px">... ещё ${yesterdayFlights.length-8}</div>`;
  }
  if(!todayFlights.length&&!yesterdayFlights.length){
    const last=[...fAll].sort(sortDesc).slice(0,5);
    html='<div style="font-size:11px;color:var(--color-text-secondary);padding:12px 16px">Вылетов сегодня и вчера нет</div>';
    if(last.length)html+=`<div class="day-label">Последние вылеты <span class="day-count">${last.length}</span></div>`+last.map(flightRow).join('');
  }
  document.getElementById('dashRecent').innerHTML=html;
}

// ============ INVENTORY ============
function renderInventory(){
  const bg=state.stock.filter(d=>d.status==='bg');
  const nbg=state.stock.filter(d=>d.status!=='bg'&&d.qty!==0);
  document.getElementById('stockListBG').innerHTML=bg.length?bg.map(d=>
    `<div class="stock-row"><div class="stock-name">${d.name}</div><div class="stock-count">${d.qty}</div></div>`
  ).join(''):'<div style="color:var(--color-text-secondary);padding:12px 16px">Пусто</div>';
  document.getElementById('stockListNBG').innerHTML=nbg.length?nbg.map(d=>
    `<div class="offstock-row"><div class="offstock-name">${d.name}</div><div style="display:flex;align-items:center;gap:8px"><div class="${d.status==='loss'?'badge-danger':'badge-warn'}">${d.status==='loss'?'списан':'не БГ'}</div><div class="offstock-count">${d.qty}</div></div></div>`
  ).join(''):'<div style="color:var(--color-text-secondary);padding:12px 16px">Нет</div>';

  document.getElementById('squadTable').innerHTML=state.squads.map(sq=>{
    const drones=sq.drones.filter(d=>d.qty!==0);
    const abbr=sq.pilot.slice(0,2).toUpperCase();
    return `<div class="crew-header-row">
        <div class="crew-abbr">${abbr}</div>
        <div class="crew-pname">Пилот ${sq.pilot}</div>
        <div class="crew-status-badge">БГ</div>
      </div>
      ${drones.map((d,i)=>`<div class="drone-subrow">
        <div class="drone-label">${i===0?'БПЛА':''}</div>
        <div class="drone-name" style="${d.qty<0?'color:var(--color-text-danger)':''}">${d.name}${d.qty<0?' ⚠':''}</div>
        <div class="drone-qty" style="${d.qty<0?'color:var(--color-text-danger);border-color:var(--color-border-danger)':''}">${d.qty}</div>
      </div>`).join('')}
      ${drones.length===0?`<div class="drone-subrow"><div class="drone-label"></div><div class="drone-name" style="color:var(--color-text-secondary)">нет дронов</div></div>`:''}`;
  }).join('');
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
  const op=makeTransfer('arrival',{drone:n,qty:q,note:''});
  if(!state.transfers)state.transfers=[];
  state.transfers.unshift(op);
  saveLocal();
  syncAddTransfer(op);
  syncPushStockSquads();
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
  document.getElementById('exDate').value=todayISO();
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
      if(item){item.qty-=qty;}
      else{state.stock.push({name:drone,qty:-qty,status:'bg'});}
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
        if(di){di.qty-=qty;}
        else{sq.drones.push({name:drone,qty:-qty});}
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
  const op=makeTransfer('transfer',{from,to,drone,qty,note});
  state.transfers.unshift(op);
  saveLocal();
  syncAddTransfer(op);
  setTimeout(()=>syncPushStockSquads(),300);
  renderInventory();
  renderDashboard();
  document.getElementById('transferCard').style.display='none';
  document.getElementById('transDrone').value='';
  document.getElementById('transNote').value='';
  logAction('transfer','add',from+' → '+to+': '+drone+' ×'+qty);
}

function saveExchange(){
  const date=document.getElementById('exDate').value||todayISO();
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
  const exOp=makeTransfer('exchange',{date,unit,give,giveQty,get,getQty,note});
  state.transfers.unshift(exOp);
  saveLocal();
  syncAddTransfer(exOp);
  syncPushStockSquads();
  renderInventory();
  renderDashboard();
  document.getElementById('exchangeCard').style.display='none';
  ['exUnit','exGive','exGet','exNote'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('exGiveQty').value='1';
  document.getElementById('exGetQty').value='1';
}

function renderTransfersLog(){
  if(!state.transfers||!state.transfers.length){
    document.getElementById('transfersLog').innerHTML='<div style="color:var(--color-text-secondary);font-size:12px;padding:12px 16px">Нет операций</div>';
    return;
  }
  document.getElementById('transfersLog').innerHTML=state.transfers.slice(0,30).map(op=>{
    if(op.type==='loss'){
      return `<div class="change-row">
        <div class="badge-danger">Потеря</div>
        <div class="change-detail"><span>${op.drone}</span> · пилот: ${op.pilot}</div>
        <div class="change-time">${op.date} ${op.time||''}</div>
      </div>`;
    } else if(op.type==='arrival'){
      return `<div class="change-row">
        <div class="change-badge-in">Поступление</div>
        <div class="change-detail"><span>${op.drone} × ${op.qty}</span>${op.note?` · ${op.note}`:''}</div>
        <div class="change-time">${op.date} ${op.time||''}</div>
      </div>`;
    } else if(op.type==='exchange'){
      return `<div class="change-row">
        <div class="badge-warn">Обмен</div>
        <div class="change-detail"><span>${op.unit}</span> · отдали: ${op.give} × ${op.giveQty} → получили: ${op.get} × ${op.getQty}${op.note?` · ${op.note}`:''}</div>
        <div class="change-time">${op.date} ${op.time||''}</div>
      </div>`;
    } else {
      return `<div class="change-row">
        <div class="change-badge-in">Передача</div>
        <div class="change-detail">${op.from} → ${op.to} · <span>${op.drone} × ${op.qty}</span>${op.note?` · ${op.note}`:''}</div>
        <div class="change-time">${op.date} ${op.time||''}</div>
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
  // Автонумерация без мутации объектов вылетов
  const pilotDayCount={};
  const autoNums=new Map();
  [...f].sort((a,b)=>((a.date||'')+(a.time||'')).localeCompare((b.date||'')+(b.time||''))).forEach(x=>{
    const key=(x.pilot||'')+'|'+(x.date||'');
    pilotDayCount[key]=(pilotDayCount[key]||0)+1;
    autoNums.set(x,pilotDayCount[key]);
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
          const num=autoNums.get(x)||x.flightnum||'';
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
  syncPushStockSquads();
  renderSquadEditor();
  renderInventory();
}
function squadEditPilot(si,val){state.squads[si].pilot=val;saveLocal();renderInventory();}
function squadEditDrone(si,di,field,val){
  const sq=state.squads[si];const d=sq&&sq.drones[di];
  if(d){
    if(field==='qty'){const delta=(parseInt(val)||0)-d.qty;if(delta&&d.name)_logAdminTransfer(sq.pilot,d.name,delta,'инв');}
    else if(field==='name'&&val&&!d.name&&d.qty>0)_logAdminTransfer(sq.pilot,val,d.qty,'инв');
    d[field]=val;
  }
  saveLocal();renderInventory();
}
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
  ds.forEach(n=>_logAdminTransfer(p,n,1,'инв: новый расчёт'));
  saveLocal();
  renderSquadEditor();
  renderInventory();
  rebuildRoleSelector();
  document.getElementById('sq-newPilot').value='';
  document.getElementById('sq-newDrones').value='';
}

// Списать дрон при потере — ищем сначала у пилота, потом на складе
function writeDroneLoss(pilot, drone, date, time, flightId){
  if(!drone)return;
  const dn=drone.toLowerCase();

  // Всегда списываем у пилота — даже если уйдёт в минус
  let sq=state.squads.find(s=>s.pilot===pilot);
  if(!sq){
    sq={pilot,drones:[]};
    state.squads.push(sq);
  }
  const di=sq.drones.find(d=>d.name.toLowerCase()===dn);
  if(di){
    di.qty--;
    if(di.qty<=0)sq.drones=sq.drones.filter(d=>d!==di);
  } else {
    // Борта нет в списке — логируем расхождение, но не создаём запись qty:-1
    // чтобы не засорять список пилота фантомными бортами
  }

  // Логируем в историю перемещений
  if(!state.transfers)state.transfers=[];
  const lossOp=makeTransfer('loss',{
    id:genId('loss'),
    flightId:flightId||null,
    date:date||todayISO(),
    time:time||nowHM(),
    pilot,drone,qty:1,note:''
  });
  state.transfers.unshift(lossOp);
  syncAddTransfer(lossOp);
}


// ============ API KEY ============
function saveApiKey(val){
  try{localStorage.setItem('anthropicKey',val);}catch(e){}
  if(val.startsWith('sk-ant'))setStatus('apiKeyStatus','✓ ключ сохранён','ok');
  else if(val)setStatus('apiKeyStatus','⚠ ключ должен начинаться с sk-ant-','err');
  else setStatus('apiKeyStatus','','muted');
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
    setStatus(st,'Укажите API-ключ Anthropic выше (начинается с sk-ant-...)','err');
    return;
  }
  setStatus(st,'Распознаю...','muted');
  document.getElementById('parsedCards').innerHTML='';
  // Подготавливаем строки ДО запроса — передаём парсеру с номерами
  const srcLines=raw.split('\n').map(l=>l.trim());
  const srcNonEmpty=srcLines.filter(Boolean);
  const numberedInput=srcLines.map((l,i)=>`[${i}] ${l}`).join('\n');
  const ammoKnown=ammoCatalog.flatMap(a=>[a.name,...(a.aliases||[])]).filter(Boolean);
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
[{"_line":0,"date":"2026-05-23","time":"08:34","pilot":"Рама","flightnum":1,"target":"305 Вишня","ammo":"пом2","drone":"Гамаюн13","result":"yes","returned":"yes","note":""},...]
Правила:
- _line: ТОЧНЫЙ номер строки [N] из которой взят этот вылет — обязателен и уникален для каждого вылета
- время всегда в формате HH:MM с ведущим нулём (08:34, не 8:34)
- flightnum: число вылета если упомянуто ("первый вылет"=1, "второй вылет"=2 и т.д.), иначе null
- target: комбинация "ЧИСЛО + СЛОВО-ЦВЕТ" (янтарь, красный, синий, зелёный, белый, чёрный, жёлтый, фиолетовый, серый, оранжевый, розовый) — это ВСЕГДА точка/цель; пиши оба слова в target, не разбивай, не путай с позывным
- ammo: если токен совпадает (точно или приблизительно) с одним из известных боеприпасов [${ammoKnown.length?ammoKnown.join(', '):'—'}] — это груз/боеприпас, пиши в ammo; НЕ путай с позывным или целью${ammoKnown.length?'':'; если список пуст — определяй по контексту'}
- note: ТОЛЬКО дополнительные обстоятельства (перебили видео, потеря управления, спикировал и т.п.) — НЕ номер вылета, НЕ цель, НЕ боеприпас
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
    setStatus(st,`Распознано: ${parsed.length} вылет(ов). Проверьте и сохраните.`,'ok');
    renderParsedCards(parsed);
  }catch(e){
    setStatus(st,'Ошибка: '+e.message,'err');
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

function levenshtein(a,b){
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function getKnownPilots(){
  return state.squads.map(sq=>sq.pilot).filter(Boolean);
}

// Возвращает все кандидаты в пределах порога, отсортированные по расстоянию
function findClosestCandidates(input,candidates){
  if(!candidates.length)return[];
  const lo=input.toLowerCase();
  const threshold=Math.max(3,Math.floor(input.length/2));
  return candidates
    .map(name=>({name,dist:levenshtein(lo,name.toLowerCase())}))
    .filter(r=>r.dist<=threshold)
    .sort((a,b)=>a.dist-b.dist);
}

// Борты конкретного пилота с qty>0. Возвращает [] если пилот не в расчётах — НЕ падает на всю базу
function getKnownDronesForPilot(pilotName){
  const sq=state.squads.find(s=>s.pilot.toLowerCase()===pilotName.toLowerCase());
  if(!sq)return[];
  return sq.drones.filter(d=>d.qty>0).map(d=>d.name).filter(Boolean);
}

// Диалог выбора одного значения из нескольких кандидатов.
// cfg.showManual — показывать кнопку "Ввести вручную" (default true)
// cfg.cancelLabel — текст кнопки отмены (default 'Пропустить')
// Возвращает: выбранное имя | 'manual' | null (отмена/пропустить)
function showFuzzySelectDialog(fieldLabel,inputName,options,cfg={}){
  const showManual=cfg.showManual!==false;
  const cancelLabel=cfg.cancelLabel||'Пропустить';
  return new Promise(resolve=>{
    const optBtns=options.map((name,idx)=>
      `<button class="btn btn-success btn-sm" id="fuz-opt-${idx}">${esc(name)}</button>`
    ).join('');
    const ov=modalOverlay(`<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px 24px;max-width:400px;width:92%;box-shadow:0 8px 32px #0008">
      <div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:10px">${esc(fieldLabel)} не найден</div>
      <div style="font-size:12px;color:var(--text);margin-bottom:12px">«<b>${esc(inputName)}</b>» отсутствует. Выберите:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${optBtns}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px">
        ${showManual?'<button class="btn btn-sm" id="fuz-manual">Ввести вручную</button>':''}
        <button class="btn btn-sm" id="fuz-skip" style="color:var(--muted)">${esc(cancelLabel)}</button>
      </div>
    </div>`);
    options.forEach((name,idx)=>{
      ov.querySelector(`#fuz-opt-${idx}`).onclick=()=>{ov.remove();resolve(name);};
    });
    if(showManual)ov.querySelector('#fuz-manual').onclick=()=>{ov.remove();resolve('manual');};
    ov.querySelector('#fuz-skip').onclick=()=>{ov.remove();resolve(null);};
  });
}

// Показывает блокирующую ошибку на карточке импорта (innerHTML — уже экранирован вызывающим)
function showCardError(cardIndex,html){
  const card=document.getElementById(`pcard-${cardIndex}`);
  if(!card)return;
  const existing=card.querySelector('.import-block-err');
  if(existing)existing.remove();
  const err=document.createElement('div');
  err.className='import-block-err';
  err.style.cssText='background:#3f1212;border:1px solid #dc2626;border-radius:6px;padding:8px 12px;font-size:11px;color:#fca5a5;margin-top:8px';
  err.innerHTML=html;
  card.appendChild(err);
}

function showImportBlockError(cardIndex,label,inputName,srcText){
  showCardError(cardIndex,
    `⛔ ${esc(label)} «<b>${esc(inputName)}</b>» не найден в базе. Отредактируйте поле вручную и попробуйте снова.`
    +(srcText?`<div style="margin-top:4px;color:var(--muted);font-family:monospace;white-space:pre-wrap">${esc(srcText)}</div>`:''));
}

// Возвращает существующий вылет или null
function findFlightDuplicate(date,time,pilot){
  return state.flights.find(f=>
    f.date===date&&f.time===time&&f.pilot.toLowerCase()===pilot.toLowerCase()
  )||null;
}

// Проверяет дубль и при необходимости показывает диалог.
// Возвращает true если можно сохранять, false если пользователь отменил.
async function confirmDuplicateOrAbort(date,time,pilot){
  if(!findFlightDuplicate(date,time,pilot))return true;
  const choice=await showDuplicateDialog(date,time,pilot);
  return choice!=='cancel';
}

// Списывает борт как потерю — РОВНО ОДИН РАЗ за вылет. Флаг _lossWritten
// фиксирует, что списание уже выполнено, чтобы повторные вызовы (например при
// редактировании или приёме того же вылета из облака) не вычитали борт снова.
function applyLossIfNeeded(f){
  if(f.returned==='no'&&f.drone&&!f._lossWritten){
    writeDroneLoss(f.pilot,f.drone,f.date,f.time,f.id);
    f._lossWritten=true;
    setTimeout(()=>syncPushStockSquads(),500);
  }
}

// Диалог подтверждения дубликата. Возвращает: 'save'|'cancel'
function showDuplicateDialog(date,time,pilot){
  return new Promise(resolve=>{
    const ov=modalOverlay(`<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px 24px;max-width:380px;width:92%;box-shadow:0 8px 32px #0008">
      <div style="font-size:13px;font-weight:700;color:var(--amber,#f59e0b);margin-bottom:10px">⚠ Вылет уже существует</div>
      <div style="font-size:12px;color:var(--text);margin-bottom:16px"><b>${esc(date)} ${esc(time)}</b> · пилот <b>${esc(pilot)}</b><br>Добавить повторно?</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm" id="dup-add" style="color:var(--red);border-color:var(--red)">Всё равно добавить</button>
        <button class="btn btn-success btn-sm" id="dup-cancel">Отмена</button>
      </div>
    </div>`);
    ov.querySelector('#dup-add').onclick=()=>{ov.remove();resolve('save');};
    ov.querySelector('#dup-cancel').onclick=()=>{ov.remove();resolve('cancel');};
  });
}

async function confirmParsed(i){
  const droneInput=document.getElementById(`p${i}-drone`);
  const pilotInput=document.getElementById(`p${i}-pilot`);
  const srcEl=document.getElementById(`psrc-${i}`);
  const srcText=srcEl?srcEl.textContent.trim():'';
  const hideThisCard=()=>{const card=document.getElementById(`pcard-${i}`);if(card)card.style.display='none';};

  // Шаг 1: пилот — при несовпадении показываем всех пилотов из базы
  const pilotName=(pilotInput.value||'').trim();
  const knownPilots=getKnownPilots();
  if(pilotName&&knownPilots.length){
    const exactPilot=knownPilots.some(n=>n.toLowerCase()===pilotName.toLowerCase());
    if(!exactPilot){
      const chosen=await showFuzzySelectDialog('Пилот',pilotName,knownPilots,{showManual:false,cancelLabel:'Отмена'});
      if(chosen===null){hideThisCard();return;}
      pilotInput.value=chosen;
    }
  }

  // Шаг 2: борт — читаем имя ПОСЛЕ шага 1, проверяем только по списку подтверждённого пилота
  const resolvedPilot=pilotInput.value.trim();
  const droneName=(droneInput.value||'').trim();
  const pilotDrones=getKnownDronesForPilot(resolvedPilot);
  if(droneName&&pilotDrones.length){
    const canonical=pilotDrones.find(n=>n.toLowerCase()===droneName.toLowerCase());
    if(canonical){
      // Точное совпадение — нормализуем регистр к каноническому из базы
      droneInput.value=canonical;
    }else{
      const candidates=findClosestCandidates(droneName,pilotDrones);
      if(!candidates.length){showImportBlockError(i,'Борт',droneName,srcText);return;}
      const chosen=await showFuzzySelectDialog('Борт',droneName,candidates.map(c=>c.name));
      if(chosen===null){hideThisCard();return;}
      if(chosen==='manual'){droneInput.focus();droneInput.select();return;}
      droneInput.value=chosen;
    }
  }

  const fn=document.getElementById(`p${i}-flightnum`).value;
  const f={
    date:document.getElementById(`p${i}-date`).value,
    time:document.getElementById(`p${i}-time`).value,
    pilot:pilotInput.value,
    target:document.getElementById(`p${i}-target`).value,
    ammo:document.getElementById(`p${i}-ammo`).value,
    drone:droneInput.value,
    result:document.getElementById(`p${i}-result`).value,
    returned:document.getElementById(`p${i}-returned`).value,
    flightnum:fn?parseInt(fn):null,
    note:document.getElementById(`p${i}-note`).value,
  };

  // Потеря обязана указывать борт — он будет списан
  if(f.returned==='no'&&!(f.drone||'').trim()){
    showCardError(i,'⛔ Укажите борт — он будет списан как потеря');
    droneInput.focus();
    return;
  }

  if(!await confirmDuplicateOrAbort(f.date,f.time,f.pilot)){hideThisCard();return;}

  f.id=f.id||genId('f');
  applyLossIfNeeded(f);
  state.flights.unshift(f);
  saveLocal();
  checkNet();
  renderDashboard();
  renderInventory();
  const card=document.getElementById(`pcard-${i}`);
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

// Базовая фильтрация вылетов по периоду/пилоту/борту — общая для отчётов
function reportFilterFlights(from,to,filterPilot,filterDrone){
  let f=[...state.flights];
  if(from)f=f.filter(x=>x.date>=from);
  if(to)f=f.filter(x=>x.date<=to);
  if(filterPilot)f=f.filter(x=>x.pilot===filterPilot);
  if(filterDrone)f=f.filter(x=>x.drone===filterDrone);
  return f;
}

// Точка входа: читает фильтры и диспетчеризует по типу отчёта
function buildReport(){
  window._reportText=null;
  fillReportFilters();
  const type=document.getElementById('repType').value;
  const from=document.getElementById('repFrom').value;
  const to=document.getElementById('repTo').value;
  const filterPilot=document.getElementById('repPilot').value;
  const filterDrone=document.getElementById('repDrone').value;
  const out=document.getElementById('reportOutput');
  const f=reportFilterFlights(from,to,filterPilot,filterDrone);
  // Подпись активных фильтров
  const filterLabel=[
    filterPilot?`пилот: ${filterPilot}`:'',
    filterDrone?`борт: ${filterDrone}`:'',
    from||to?`${from||'...'} — ${to||'...'}`:'',
  ].filter(Boolean).join(' · ');

  if(type==='stock') reportStock(out);
  else if(type==='flights') reportFlights(out,f);
  else if(type==='losses') reportLosses(out,f);
  else if(type==='summary') reportSummary(out,f);
  else if(type==='detailed') buildDetailedReport(f,filterLabel,out);
  else if(type==='issued') reportIssued(out,from,to,filterPilot,filterDrone);
}

function reportStock(out){
    const stockBG=state.stock.filter(d=>d.status==='bg');
    const stockNBG=state.stock.filter(d=>d.status!=='bg');

    // Перемещения за последние 24 часа
    const now=Date.now();
    const day=24*60*60*1000;
    const todayStr=todayISO();
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

}

function reportFlights(out,f){
    const byPilot={};
    f.forEach(x=>{if(!byPilot[x.pilot])byPilot[x.pilot]=[];byPilot[x.pilot].push(x);});
    const entries=Object.entries(byPilot);
    if(!entries.length){
      out.innerHTML='<div style="color:var(--muted);padding:16px">Нет данных за период</div>';
    } else {
      const wTarget=Math.max(...f.map(x=>(x.target||'—').length),1);
      const wDrone=Math.max(...f.map(x=>(x.drone||'—').length),1);
      const fmtLine=(x,i)=>{
        const tgt=(x.target||'—').padEnd(wTarget);
        const drn=(x.drone||'—').padEnd(wDrone);
        const res=x.result==='yes'?'✅':'❌';
        const ret=x.returned==='yes'?'борт вернул':'борт потерян';
        const note=x.note?' · '+x.note:'';
        return `${i+1}. ${x.date} ${x.time} · ${tgt} · ${drn} · ${res} · ${ret}${note}`;
      };
      const textLines=[];
      entries.forEach(([p,fs])=>{
        fs.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
        textLines.push(`Пилот: ${p} — ${fs.length} вылетов`);
        fs.forEach((x,i)=>textLines.push(fmtLine(x,i)));
        textLines.push('');
      });
      window._reportText=textLines.join('\n').trimEnd();
      out.innerHTML=entries.map(([p,fs])=>`
        <div class="report-block">
          <div class="rb-head">Пилот: ${esc(p)} — ${fs.length} вылетов</div>
          ${fs.map((x,i)=>`<div class="rb-line" style="font-family:'Courier New',monospace;white-space:pre">${esc(fmtLine(x,i))}</div>`).join('')}
        </div>`).join('');
    }

}

function reportLosses(out,f){
    f=f.filter(x=>x.returned==='no');
    if(!f.length){
      window._reportText='Потери БПЛА — 0 борт(ов)\nПотерь нет';
      out.innerHTML=`<div class="report-block"><div class="rb-head">Потери БПЛА — 0 борт(ов)</div><div class="rb-line">Потерь нет</div></div>`;
    } else {
      const wPilot=Math.max(...f.map(x=>(x.pilot||'—').length),1);
      const wDrone=Math.max(...f.map(x=>(x.drone||'—').length),1);
      const fmtLine=x=>{
        const plt=(x.pilot||'—').padEnd(wPilot);
        const drn=(x.drone||'—').padEnd(wDrone);
        return `${x.date} ${x.time} · Пилот: ${plt} · ${drn} · ${x.note||'причина не указана'}`;
      };
      window._reportText=[`Потери БПЛА — ${f.length} борт(ов)`,...f.map(fmtLine)].join('\n');
      out.innerHTML=`<div class="report-block">
        <div class="rb-head">Потери БПЛА — ${f.length} борт(ов)</div>
        ${f.map(x=>`<div class="rb-line" style="font-family:'Courier New',monospace;white-space:pre">${esc(fmtLine(x))}</div>`).join('')}
      </div>`;
    }

}

function reportSummary(out,f){
    const byPilot={};
    f.forEach(x=>{
      if(!byPilot[x.pilot])byPilot[x.pilot]={total:0,done:0,lost:0,returned:0};
      byPilot[x.pilot].total++;
      if(x.result==='yes')byPilot[x.pilot].done++;
      if(x.returned==='no')byPilot[x.pilot].lost++;
      else byPilot[x.pilot].returned++;
    });
    const rows=Object.entries(byPilot);
    if(!rows.length){
      out.innerHTML=`<div class="report-block"><div class="rb-head">Сводка по расчётам</div><div class="rb-line">Нет данных</div></div>`;
    } else {
      const mono="font-family:'Courier New',monospace;white-space:pre";
      const hdrCols=['Пилот','Вылетов','Выполнено','Не выполнено','Борт вернул','Потерь'];
      const dataRows=rows.map(([p,s])=>[p,s.total,s.done,s.total-s.done,s.returned,s.lost]);
      const totRow=['Итого',
        rows.reduce((s,[,v])=>s+v.total,0),
        rows.reduce((s,[,v])=>s+v.done,0),
        rows.reduce((s,[,v])=>s+(v.total-v.done),0),
        rows.reduce((s,[,v])=>s+v.returned,0),
        rows.reduce((s,[,v])=>s+v.lost,0)
      ];
      const allForW=[...dataRows,totRow];
      const widths=hdrCols.map((h,i)=>Math.max(h.length,...allForW.map(r=>String(r[i]).length)));
      const last=widths.length-1;
      const pad=(val,i)=>i<last?String(val).padEnd(widths[i]):String(val);
      const mkCell=(val,i,color,bold)=>{
        const s=pad(val,i);
        const style=(bold?'font-weight:700;':'')+(color?'color:'+color+';':'');
        if(style)return `<span style="${style}">${esc(s)}</span>`;
        return esc(s);
      };
      const hdr=hdrCols.map((h,i)=>pad(h,i)).join(' · ');
      const sep='─'.repeat(hdr.length);
      const mkDataRow=([p,s])=>{
        const v=[p,s.total,s.done,s.total-s.done,s.returned,s.lost];
        return [mkCell(v[0],0,'',false),mkCell(v[1],1,'',false),mkCell(v[2],2,'var(--green2)',false),
          mkCell(v[3],3,v[3]>0?'var(--red)':'',false),mkCell(v[4],4,'',false),mkCell(v[5],5,v[5]>0?'var(--red)':'',false)].join(' · ');
      };
      const mkTotRow=r=>[mkCell(r[0],0,'',true),mkCell(r[1],1,'',true),mkCell(r[2],2,'var(--green2)',true),
        mkCell(r[3],3,r[3]>0?'var(--red)':'',true),mkCell(r[4],4,'',true),mkCell(r[5],5,r[5]>0?'var(--red)':'',true)].join(' · ');
      out.innerHTML=`<div class="report-block">
        <div class="rb-head">Сводка по расчётам</div>
        <div class="rb-line" style="${mono}">${esc(hdr)}</div>
        <div class="rb-line" style="${mono};color:var(--border2)">${esc(sep)}</div>
        ${rows.map(r=>`<div class="rb-line" style="${mono}">${mkDataRow(r)}</div>`).join('')}
        <div class="rb-line" style="${mono};color:var(--border2)">${esc(sep)}</div>
        <div class="rb-line" style="${mono}">${mkTotRow(totRow)}</div>
      </div>`;
    }
}

function reportIssued(out,from,to,filterPilot,filterDrone){
    let transList=(state.transfers||[]).filter(t=>t.type==='transfer'&&t.to!=='склад');
    if(from) transList=transList.filter(t=>t.date>=from);
    if(to)   transList=transList.filter(t=>t.date<=to);
    if(filterPilot) transList=transList.filter(t=>t.to===filterPilot);
    if(filterDrone) transList=transList.filter(t=>(t.drone||'').toLowerCase()===filterDrone.toLowerCase());
    const agg=new Map();
    transList.forEach(t=>{
      const key=t.to+'||'+t.drone;
      if(!agg.has(key)) agg.set(key,{pilot:t.to,drone:t.drone,qty:0});
      agg.get(key).qty+=(t.qty||1);
    });
    const rows=[...agg.values()];
    const hasFilter=from||to||filterPilot||filterDrone;
    if(!rows.length){
      const msg=hasFilter?'Нет данных за выбранный период':'Нет данных';
      window._reportText='Выдано бортов\n'+msg;
      out.innerHTML=`<div class="report-block"><div class="rb-head">Выдано бортов</div><div class="rb-line">${msg}</div></div>`;
    } else {
      const wPilot=Math.max(...rows.map(r=>r.pilot.length),'Пилот'.length);
      const wDrone=Math.max(...rows.map(r=>r.drone.length),'Борт'.length);
      const wQty=Math.max(...rows.map(r=>String(r.qty).length),'Количество'.length);
      const hdr=`${'Пилот'.padEnd(wPilot)} · ${'Борт'.padEnd(wDrone)} · Количество`;
      const sep='─'.repeat(wPilot+wDrone+wQty+6);
      const fmtRow=r=>`${r.pilot.padEnd(wPilot)} · ${r.drone.padEnd(wDrone)} · ${r.qty}`;
      const totalQty=rows.reduce((s,r)=>s+r.qty,0);
      const uniqueDrones=[...new Set(rows.map(r=>r.drone))].length;
      window._reportText=['Выдано бортов',hdr,sep,...rows.map(fmtRow),'',`Итого выдано: ${totalQty} бортов, ${uniqueDrones} типов`].join('\n');
      const mono="font-family:'Courier New',monospace;white-space:pre";
      out.innerHTML=`<div class="report-block">
        <div class="rb-head">Выдано бортов</div>
        <div class="rb-line" style="${mono}">${esc(hdr)}</div>
        <div class="rb-line" style="${mono};color:var(--border2)">${esc(sep)}</div>
        ${rows.map(r=>`<div class="rb-line" style="${mono}">${esc(fmtRow(r))}</div>`).join('')}
        <div class="rb-line" style="margin-top:8px;font-weight:700">Итого выдано: ${totalQty} бортов, ${uniqueDrones} типов</div>
      </div>`;
    }
}

function isDelivery(ammo){
  if(!ammo)return false;
  const a=ammo.toLowerCase();
  return a.includes('доставк') || a.includes('провизи') || a.includes('груз');
}

function buildDetailedReport(f,filterLabel,out){
  f=f.filter(x=>x.pilot&&x.pilot!=='[ПЕРЕДАЧА]');
  const pilotNames=[...new Set(f.map(x=>x.pilot))].filter(Boolean);

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

  const pilotStats=pilotNames.map(p=>({name:p,s:stats(f.filter(x=>x.pilot===p))}));
  const totalS=stats(f);
  const period=filterLabel||'за всё время';

  if(!pilotStats.length){
    out.innerHTML=`<div class="report-block"><div class="rb-head">Подробный отчёт по расчётам · ${esc(period)}</div><div class="rb-line">Нет данных</div></div>`;
    return;
  }

  const allStats=[...pilotStats.map(p=>p.s),totalS];
  const colHdrs=['Показатель',...pilotStats.map((p,i)=>`Расчёт ${i+1} (${p.name})`),'Итого'];

  // null = пустая строка-разделитель между секциями
  const metricDefs=[
    {label:'Всего вылетов',section:true,fn:s=>String(s.total)},
    {label:'Задача выполнена',fn:s=>`${s.done} ${s.pct(s.done,s.total)}`},
    {label:'Задача не выполнена',fn:s=>`${s.notDone} ${s.pct(s.notDone,s.total)}`,red:s=>s.notDone>0},
    {label:'Борт вернулся',fn:s=>`${s.ret} ${s.pct(s.ret,s.total)}`},
    {label:'Борт потерян',fn:s=>`${s.lost} ${s.pct(s.lost,s.total)}`,red:s=>s.lost>0},
    null,
    {label:'Минирование (всего)',section:true,fn:s=>String(s.mining.total)},
    {label:'— удачных',fn:s=>`${s.mining.done} ${s.pct(s.mining.done,s.mining.total)}`},
    {label:'— неудачных',fn:s=>`${s.mining.notDone} ${s.pct(s.mining.notDone,s.mining.total)}`,red:s=>s.mining.notDone>0},
    null,
    {label:'Доставка (всего)',section:true,fn:s=>String(s.delivery.total)},
    {label:'— удачных',fn:s=>`${s.delivery.done} ${s.pct(s.delivery.done,s.delivery.total)}`},
    {label:'— неудачных',fn:s=>`${s.delivery.notDone} ${s.pct(s.delivery.notDone,s.delivery.total)}`,red:s=>s.delivery.notDone>0},
  ];

  const textRows=metricDefs.filter(Boolean).map(m=>[m.label,...allStats.map(s=>m.fn(s))]);
  const widths=colHdrs.map((h,i)=>Math.max(h.length,...textRows.map(r=>r[i].length)));
  const last=widths.length-1;
  const pad=(val,i)=>i<last?String(val).padEnd(widths[i]):String(val);
  const mono="font-family:'Courier New',monospace;white-space:pre";
  const hdr=colHdrs.map((h,i)=>pad(h,i)).join(' · ');
  const sep='─'.repeat(hdr.length);

  const mkCell=(val,i,color,bold)=>{
    const s=pad(val,i);
    const style=(bold?'font-weight:700;':'')+(color?'color:'+color+';':'');
    if(style)return `<span style="${style}">${esc(s)}</span>`;
    return esc(s);
  };

  const renderRow=m=>{
    if(!m)return `<div class="rb-line" style="${mono}"> </div>`;
    const parts=[
      mkCell(m.label,0,m.section?'var(--green)':'',!!m.section),
      ...allStats.map((s,si)=>{
        const val=m.fn(s);
        const isRed=m.red&&m.red(s);
        return mkCell(val,si+1,isRed?'var(--red)':m.section?'var(--green)':'',!!m.section);
      })
    ];
    return `<div class="rb-line" style="${mono}">${parts.join(' · ')}</div>`;
  };

  out.innerHTML=`<div class="report-block" style="overflow-x:auto">
    <div class="rb-head">Подробный отчёт по расчётам · ${esc(period)}</div>
    <div class="rb-line" style="${mono}">${esc(hdr)}</div>
    <div class="rb-line" style="${mono};color:var(--border2)">${esc(sep)}</div>
    ${metricDefs.map(renderRow).join('\n    ')}
  </div>`;
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
  </style></head><body>${content}</body></html>`);
  win.document.close();
  win.focus();
  win.onafterprint = function(){ win.close(); };
  win.print();
}

function applyTheme(name){
  const map={terminal:'theme-terminal',wb:'theme-gray',gray:'theme-gray',white:'theme-gray',bw:'theme-paper',field:'theme-field'};
  const cls=map[name]||'theme-gray';
  document.body.className=document.body.className.replace(/theme-\w+/g,'').trim()+' '+cls;
  if(name==='field'){
    document.body.style.backgroundImage='repeating-linear-gradient(0deg,transparent,transparent 29px,rgba(0,0,0,0.06) 29px,rgba(0,0,0,0.06) 30px),repeating-linear-gradient(90deg,transparent,transparent 29px,rgba(0,0,0,0.04) 29px,rgba(0,0,0,0.04) 30px)';
  } else {
    document.body.style.backgroundImage='';
  }
  const ts=document.getElementById('themeStyle');
  if(ts)ts.textContent='';
  try{localStorage.setItem('theme',name);}catch(e){}
}

function applyFontSize(sz){
  const base=parseInt(sz)||16;
  document.documentElement.style.setProperty('--base',base+'px');
  document.documentElement.style.fontSize=base+'px';
  document.body.style.fontSize=base+'px';
  // Явные размеры для каждого уровня (S=12, M=16, L=20, XL=24)
  const tbl={
    section: {12:11, 16:12, 20:13, 24:14}, // .section-title, .page-title, .card-title
    content: {12:13, 16:14, 20:15, 24:16}, // пилоты, борта, время, данные таблиц
    stat:    {12:28, 16:32, 20:36, 24:40}, // большие цифры статистики
    label:   {12:11, 16:12, 20:12, 24:13}, // подписи, метки, th, теги
  };
  const ss=tbl.section[base]||12;
  const sc=tbl.content[base]||14;
  const st=tbl.stat[base]||32;
  const sl=tbl.label[base]||12;
  const styleId='fontScaleStyle';
  let styleEl=document.getElementById(styleId);
  if(!styleEl){styleEl=document.createElement('style');styleEl.id=styleId;document.head.appendChild(styleEl);}
  styleEl.textContent=`
    body, input, select, textarea, button { font-size: ${sc}px !important; }
    .adm-flight-table, .adm-flight-table input, .adm-flight-table select, .adm-flight-table td, .adm-flight-table th { font-size: 12px !important; }
    .section-title, .page-title, .card-title { font-size: ${ss}px !important; }
    .stat, .stat-num { font-size: ${st}px !important; }
    .stat-sub, .stat-meta, .day-label, .crew-sub, .crew-flights, label, th { font-size: ${sl}px !important; }
    .tag { font-size: ${sl}px !important; }
    td, .flight-pilot, .flight-time, .flight-cell, .drone-name, .crew-name, .stock-name, .offstock-name, .change-detail { font-size: ${sc}px !important; }
    .report-block .rb-head, .report-block .rb-line { font-size: ${sc}px !important; }
    .dp-day { font-size: ${sc}px !important; }
    .dp-nav-label { font-size: ${sl}px !important; }
    .notice { font-size: ${sc}px !important; }
    .qty { font-size: ${sc}px !important; }
    .topbar, .topbar * { font-size: 14px !important; }
    .nav-tab, .nav-tab * { font-size: 20px !important; }
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
    const todayStr=todayISO();
    const firstDow=(new Date(curYear,curMonth-1,1).getDay()+6)%7; // 0=Пн
    const daysInMonth=new Date(curYear,curMonth,0).getDate();
    const daysInPrev=new Date(curYear,curMonth-1,0).getDate();
    const cells=[];
    // Предыдущий месяц
    for(let i=firstDow-1;i>=0;i--)cells.push({d:daysInPrev-i,cur:false,prev:true});
    // Текущий месяц
    for(let d=1;d<=daysInMonth;d++){
      const iso=toISO(curYear,curMonth,d);
      cells.push({d,cur:true,today:iso===todayStr,selected:sel&&iso===toISO(sel.y,sel.m,sel.d)});
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

// Вход логином/паролем не реализован — авторизация только по ссылке от
// администратора (см. authByToken). Кнопка/Enter формы показывают подсказку.
function doLogin(){
  setStatus('loginError','Вход только по ссылке от администратора','muted');
}

async function authByToken(token){
  const {url}=syncGetCfg();
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
      if(cfg.url)await syncPullOnLogin();
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
    let r='cmd';
    if(authUser.role==='admin')r='admin';
    else if(authUser.role==='cmd')r='cmd';
    else if(authUser.role==='tech')r='tech';
    else if(authUser.role==='pilot'){
      const idx=state.squads.findIndex(sq=>sq.pilot===authUser.login);
      r=idx>=0?'pilot_'+idx:'cmd';
    }
    if(roleSwitch){
      rebuildRoleSelector();
      const optExists=[...roleSwitch.options].some(o=>o.value===r);
      roleSwitch.value=optExists?r:'cmd';
    }
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
  const {url}=syncGetCfg();
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
    const link=base+'?u='+encodeURIComponent(login)+'&t='+token+'&k='+encodeURIComponent(encKey)+'&s='+encodeURIComponent(url);
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
  const {url}=syncGetCfg();
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
  const {url,key}=syncGetCfg();
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
    const link=base+'?u='+encodeURIComponent(login)+'&t='+updUser.token+'&k='+encodeURIComponent(key)+'&s='+encodeURIComponent(url);
    document.getElementById('nu-link-text').textContent=link;
    document.getElementById('nu-link-result').style.display='block';
    showSyncToast('✓ Новая ссылка сгенерирована');
    loadUsersList();
  }catch(e){alert('Ошибка: '+e.message);}
}

async function toggleUser(login,active){
  const {url}=syncGetCfg();
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
  const {url,token}=syncGetCfg();
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
  if(isPilotRole(role)){
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
}

async function saveQuickFlight(){
  const pilot=(document.getElementById('qf-pilot').value||'').trim();
  // Автонумерация: считаем вылеты пилота за сегодня
  const date=todayISO();
  const todayPilotFlights=state.flights.filter(f=>f.pilot===pilot&&f.date===date);
  const num=todayPilotFlights.reduce((m,f)=>Math.max(m,f.flightnum||0),0)+1;
  const target=(document.getElementById('qf-target').value||'').trim();
  const ammoRaw=(document.getElementById('qf-ammo').value||'').trim();
  const drone=(document.getElementById('qf-drone').value||'').trim();
  const done=document.getElementById('qf-result').value==='yes';
  const returned=document.getElementById('qf-returned').value==='yes';
  const note=(document.getElementById('qf-note').value||'').trim();
  if(!pilot){alert('Укажите пилота');return;}
  // Потеря обязана указывать борт — он будет списан
  if(!returned&&!drone){setStatus('qf-status','Укажите борт — он будет списан как потеря','err');return;}
  if(!drone){alert('Укажите БПЛА');return;}
  const ammo=ammoNormalizeName(ammoRaw)||ammoRaw;
  const time=nowHM();

  if(!await confirmDuplicateOrAbort(date,time,pilot))return;

  const f={
    id:genId('f'),
    _savedTs:Date.now(),
    _submittedBy:authUser.login||'',
    date,time,pilot,
    flightnum:num,
    target,ammo,drone,
    result:done?'yes':'no',
    returned:returned?'yes':'no',
    note
  };
  applyLossIfNeeded(f);
  state.flights.unshift(f);
  saveLocal();
  renderFlights();renderDashboard();
  // Сбрасываем форму частично
  document.getElementById('qf-target').value='';
  document.getElementById('qf-ammo').value='';
  document.getElementById('qf-note').value='';
  document.getElementById('qf-result').value='yes';
  document.getElementById('qf-returned').value='yes';
  setStatus('qf-status','✓ Вылет #'+f.flightnum+' записан — '+f.time,'ok');
  logAction('flight','add','Вылет #'+f.flightnum+' '+pilot+' '+drone+(f.returned==='no'?' [потеря]':''));
  setTimeout(()=>{const st=document.getElementById('qf-status');if(st)st.textContent='';},3000);
}

// ============ ACTIVITY LOG ============
let actLog=[];

function logAction(type, action, details){
  const entry={
    id:genId('a'),
    ts:Date.now(),
    date:todayISO(),
    time:nowHM(),
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
  const {url,key,token}=syncGetCfg();
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
  const isPilot=isPilotRole(role);
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

// Смена ключа шифрования: читает все зашифрованные листы старым ключом,
// перешифровывает новым и перезаписывает облако. Шифруются только листы данных
// (flights/stock/squads/transfers/actlog); users и ammo_catalog ключом не шифруются.
async function cfgReencrypt(){
  const STAT='cfg-reencrypt-status';
  const btn=document.getElementById('cfg-reencrypt-btn');
  const oldKey=cfg.key||localStorage.getItem('cfg_key')||'';
  const newKey=(document.getElementById('cfg-newkey').value||'').trim();
  const newKey2=(document.getElementById('cfg-newkey2').value||'').trim();
  const {url,token}=syncGetCfg();
  const isAdmin=state.role==='admin'||authUser.role==='admin';

  if(!isAdmin){setStatus(STAT,'Только администратор может менять ключ','err');return;}
  if(!url||!token){setStatus(STAT,'Нет подключения к облаку или прав','err');return;}
  if(!newKey){setStatus(STAT,'Введите новый ключ','err');return;}
  if(newKey!==newKey2){setStatus(STAT,'Новый ключ и подтверждение не совпадают','err');return;}
  if(newKey===oldKey){setStatus(STAT,'Новый ключ совпадает со старым','err');return;}
  if(!confirm('Сменить ключ и перешифровать ВСЕ данные в облаке?\nПосле этого все пользователи должны будут ввести новый ключ.'))return;

  const sheets=['flights','stock','squads','transfers','actlog'];
  if(btn)btn.disabled=true;
  try{
    // 1. Читаем сырые строки всех листов
    setStatus(STAT,'Загрузка из облака...','muted');
    const r=await fetch(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(),{redirect:'follow'});
    const d=await r.json();
    if(d.error)throw new Error(d.error);

    // 2. Расшифровываем каждый лист старым ключом + 3. перешифровываем новым
    const data={};
    let totalRaw=0, totalOk=0;
    for(const sheet of sheets){
      const rows=d[sheet]||[];
      totalRaw+=rows.length;
      const objs=await syncDecryptRows(rows,oldKey);
      // Защита от затирания: если строки есть, но ни одна не расшифровалась —
      // старый ключ неверный, прерываем (иначе перезапишем лист пустым).
      if(rows.length&&!objs.length){
        throw new Error(`Лист «${sheet}»: не удалось расшифровать ни одной записи — проверьте текущий ключ`);
      }
      totalOk+=objs.length;
      data[sheet]=await Promise.all(objs.map(o=>syncEncrypt(o,newKey)));
      setStatus(STAT,`Перешифровано: ${sheet} (${objs.length})`,'muted');
    }

    // 4. Записываем всё обратно в облако
    setStatus(STAT,'Отправка в облако...','muted');
    const res=await syncPost(url,JSON.stringify({action:'write',token,data}));
    if(!res.ok)throw new Error(res.error||'ошибка записи');

    // 5. Сохраняем новый ключ локально
    cfg.key=newKey;
    try{localStorage.setItem('cfg_key',newKey);}catch(e){}
    const kField=document.getElementById('cfg-key');
    if(kField)kField.value=newKey;
    const nuke=document.getElementById('nu-enckey');
    if(nuke)nuke.value=newKey;
    document.getElementById('cfg-newkey').value='';
    document.getElementById('cfg-newkey2').value='';
    updateEncryptBadge();
    logAction('settings','reencrypt',`Ключ шифрования изменён, перешифровано ${totalOk} записей`);

    // 6. Результат
    const tail=res.unverified?' (запись не подтверждена — проверьте синхронизацию)':'';
    setStatus(STAT,`✓ Готово: перешифровано ${totalOk} из ${totalRaw} записей${tail}`,'ok');
    showSyncToast('✓ Ключ изменён, данные перешифрованы');
  }catch(e){
    setStatus(STAT,'Ошибка: '+e.message+' — ключ НЕ изменён','err');
  }finally{
    if(btn)btn.disabled=false;
  }
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

// ============================================================
// SYNC MODULE v2 — переписан с нуля
// Принципы:
//   1. Очередь отправки (pendingQueue) — гарантия доставки
//   2. flights/transfers — append-only + tombstones для удалений
//   3. stock/squads — last-write-wins по версии
//   4. pollCloud — только дельта (read_since)
//   5. Полная загрузка — только при первом входе или вручную
// ============================================================

// --- Toast уведомления ---
function showSyncToast(msg, duration=2500){
  let el=document.getElementById('syncToast');
  if(!el){
    el=document.createElement('div');
    el.id='syncToast';
    el.style.cssText='position:fixed;bottom:16px;right:16px;z-index:9999;background:var(--card);border:1px solid var(--accent2);color:var(--accent);padding:6px 14px;font-size:12px;font-family:inherit;letter-spacing:1px;pointer-events:none;opacity:0;transition:opacity .2s';
    document.body.appendChild(el);
  }
  el.textContent=msg;
  el.style.opacity='1';
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.style.opacity='0',duration);
}

// --- Вспомогательные функции ---

function syncGetCfg(){
  return {
    url:   cfg.url  || localStorage.getItem('cfg_url')  || '',
    key:   cfg.key  || localStorage.getItem('cfg_key')  || '',
    token: authToken || localStorage.getItem('auth_token') || ''
  };
}

async function syncEncrypt(obj, key){
  const json = JSON.stringify(obj);
  if(!key) return { id: obj.id, data: json };
  return { id: obj.id, data: await aesEncrypt(json, key) };
}

async function syncDecrypt(row, key){
  try{
    const json = key ? await aesDecrypt(row.data, key) : row.data;
    return JSON.parse(json);
  }catch(e){ console.warn('[SYNC] decrypt error:', e.message, row.id); return null; }
}

async function syncDecryptRows(rows, key){
  if(!rows||!rows.length) return [];
  const results = await Promise.all(rows.map(r => syncDecrypt(r, key)));
  return results.filter(Boolean);
}

async function syncPost(url, body){
  // Всегда cors+redirect:follow; при ошибке — no-cors
  try{
    const r = await fetch(url, {
      method:'POST', headers:{'Content-Type':'text/plain'},
      body, mode:'cors', redirect:'follow'
    });
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    return { ok:true, data:d };
  }catch(e){
    try{
      await fetch(url, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body, mode:'no-cors'
      });
      return { ok:true, data:null, unverified:true };
    }catch(e2){
      return { ok:false, error:e2.message };
    }
  }
}

function syncIndicator(state){
  const ind = document.getElementById('syncIndicator');
  if(!ind) return;
  if(state==='syncing'){ ind.className='sync-indicator syncing'; ind.textContent='↑ синхр...'; }
  else if(state==='ok'){ ind.className='sync-indicator saved';
    ind.textContent='● '+new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}); }
  else if(state==='loading'){ ind.className='sync-indicator syncing'; ind.textContent='↓ загрузка...'; }
  else { ind.className='sync-indicator'; ind.textContent='⚠ нет связи'; }
}

function syncRenderAll(){
  renderDashboard(); renderInventory(); renderFlights();
  fillDataLists(); rebuildRoleSelector();
}

// --- Очередь отправки ---
// Гарантирует что изменения не потеряются даже если сеть упала

const pendingQueue = {
  _key: 'sync_pending_queue',
  load(){ try{ return JSON.parse(localStorage.getItem(this._key)||'[]'); }catch(e){ return []; } },
  save(q){ try{ localStorage.setItem(this._key, JSON.stringify(q)); }catch(e){} },
  add(item){ const q=this.load(); q.push({...item, addedAt:Date.now()}); this.save(q); },
  remove(id){ const q=this.load().filter(x=>x.id!==id); this.save(q); },
  clear(){ this.save([]); },
  all(){ return this.load(); }
};

// --- Tombstones (удалённые вылеты) ---
const tombstones = {
  _key: 'sync_tombstones',
  load(){ try{ return new Set(JSON.parse(localStorage.getItem(this._key)||'[]')); }catch(e){ return new Set(); } },
  add(id){ const s=this.load(); s.add(id); try{ localStorage.setItem(this._key, JSON.stringify([...s])); }catch(e){} },
  has(id){ return this.load().has(id); },
  all(){ return [...this.load()]; }
};

// --- Версия склада ---
let _stockVersion = parseInt(localStorage.getItem('sync_stock_version')||'0');
function syncBumpStockVersion(){
  _stockVersion = Date.now();
  localStorage.setItem('sync_stock_version', String(_stockVersion));
}

// --- Время последнего поллинга ---
let _lastPollTs = Date.now();
let _lastStockTs = Date.now(); // Инициализируем текущим временем — не грузим старые изменения склада

// ============================================================
// ЗАПИСЬ ИЗМЕНЕНИЙ — единая точка входа для всех операций
// ============================================================

// Добавить вылет — append + сразу в облако
async function syncAddFlight(flight){
  if(!flight.id) flight.id = genId('f');
  state.flights.unshift(flight);
  saveLocal();
  const {url,key,token} = syncGetCfg();
  if(!url||!token){ pendingQueue.add({type:'flight',data:flight}); return; }
  const enc = await syncEncrypt(flight, key);
  const body = JSON.stringify({action:'append_one', token, sheet:'flights', row:enc});
  const res = await syncPost(url, body);
  if(!res.ok) pendingQueue.add({type:'flight', data:flight});
  else console.log('[SYNC] flight appended:', flight.id);
}

// Удалить вылет — tombstone + полная запись
async function syncDeleteFlight(idx){
  const f = state.flights[idx];
  if(!f) return;

  const pLow=(f.pilot||'').toLowerCase();
  const dLow=(f.drone||'').toLowerCase();

  // Компенсируем квоту дрона только если вылет числится как потеря
  if(f.returned==='no' && f.drone && f.pilot){
    const sq = state.squads.find(s=>s.pilot===f.pilot);
    if(sq){
      const d = sq.drones.find(d=>d.name.toLowerCase()===dLow);
      if(d) d.qty++; else sq.drones.push({name:f.drone, qty:1});
    }
    syncBumpStockVersion();
    setTimeout(()=>syncPushStockSquads(), 300);
  }

  // Всегда чистим связанные записи о потере — они могут остаться
  // если вылет был отредактирован (returned: no→yes) перед удалением.
  // Три прохода от точного к нестрогому:

  const before=(state.transfers||[]).length;

  // Проход 1: по flightId (для записей, созданных после обновления)
  if(f.id){
    state.transfers=(state.transfers||[]).filter(t=>!(t.type==='loss'&&t.flightId===f.id));
  }

  // Проход 2: пилот + борт + дата + время (регистронезависимо)
  if((state.transfers||[]).length===before){
    state.transfers=(state.transfers||[]).filter(t=>!(
      t.type==='loss' &&
      (t.pilot||'').toLowerCase()===pLow &&
      (t.drone||'').toLowerCase()===dLow &&
      t.date===f.date &&
      t.time===f.time
    ));
  }

  // Проход 3: пилот + борт + дата (без времени — для вылетов,
  // чьё время менялось после первичной записи потери)
  if((state.transfers||[]).length===before){
    state.transfers=(state.transfers||[]).filter(t=>!(
      t.type==='loss' &&
      (t.pilot||'').toLowerCase()===pLow &&
      (t.drone||'').toLowerCase()===dLow &&
      t.date===f.date
    ));
  }

  tombstones.add(f.id);
  state.flights.splice(idx,1);
  saveLocal();
  logAction('flight','delete','Удалён вылет '+(f.pilot||'')+' '+(f.date||'')+' '+(f.time||''));
  syncPushAll(true);
  renderAdminFlights(); renderDashboard(); renderInventory();
}

// Обновить поле вылета
function syncEditFlight(idx, field, val){
  if(state.flights[idx]) state.flights[idx][field] = val;
  saveLocal();
  // Отправляем полный список вылетов через debounce
  clearTimeout(syncEditFlight._timer);
  syncEditFlight._timer = setTimeout(()=>syncPushAll(true), 2000);
}

// Добавить transfer/arrival/loss — только отправляет в облако, не добавляет локально
async function syncAddTransfer(op){
  if(!op.id) op.id = genId('t');
  const {url,key,token} = syncGetCfg();
  if(!url||!token){ pendingQueue.add({type:'transfer',data:op}); return; }
  const enc = await syncEncrypt(op, key);
  const body = JSON.stringify({action:'append_one', token, sheet:'transfers', row:enc});
  const res = await syncPost(url, body);
  if(!res.ok) pendingQueue.add({type:'transfer', data:op});
}

// Отправить склад и расчёты (last-write-wins)
async function syncPushStockSquads(){
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;
  syncBumpStockVersion();
  const ts = Date.now();
  const encRow = async (obj,i) => {
    const o = {...obj, id:obj.id||(ts+i), _sv:_stockVersion};
    return syncEncrypt(o, key);
  };
  const stock  = await Promise.all(state.stock.map((d,i)=>encRow(d,i)));
  const squads = await Promise.all(state.squads.map((sq,i)=>encRow(sq,i)));
  const body = JSON.stringify({action:'write', token, data:{stock, squads}});
  const res = await syncPost(url, body);
  if(res.ok){
    _lastStockTs = _stockVersion; // Помним что эту версию мы сами отправили — не перезагружаем
    console.log('[SYNC] stock+squads OK, sv:', _stockVersion);
  }
  else console.warn('[SYNC] stock push failed:', res.error);
}

// Отправить полный снимок (flights + transfers)
async function syncPushAll(silent=false){
  const {url,key,token} = syncGetCfg();
  if(!url) return;
  if(!silent) syncIndicator('syncing');
  const ts = Date.now();
  const encRow = async (obj,i) => syncEncrypt({...obj, id:obj.id||(ts+i)}, key);
  const [flights,stock,squads,transfers] = await Promise.all([
    Promise.all(state.flights.map((f,i)=>encRow(f,i))),
    Promise.all(state.stock.map((d,i)=>encRow(d,i))),
    Promise.all(state.squads.map((sq,i)=>encRow(sq,i))),
    Promise.all((state.transfers||[]).map((t,i)=>encRow(t,i)))
  ]);
  const body = JSON.stringify({action:'write', token, data:{flights,stock,squads,transfers}});
  console.log('[SYNC] pushAll flights:', state.flights.length, 'size:', body.length);
  const res = await syncPost(url, body);
  if(res.ok){
    _lastStockTs = _stockVersion; // Не перезагружаем склад который только что сами отправили
    console.log('[SYNC] pushAll OK');
    await syncFlushQueue();
    if(!silent){ syncIndicator('ok'); showSyncToast('✓ Данные выгружены'); }
    const st=document.getElementById('cfg-sync-status');
    if(st){ st.textContent='✓ Выгружено — '+new Date().toLocaleTimeString('ru'); st.style.color='var(--green2)'; }
    renderSettingsStatus();
  } else {
    console.warn('[SYNC] pushAll failed:', res.error);
    if(!silent){ syncIndicator('error'); }
  }
  return res.ok;
}

// --- Очередь pending: отправить накопленное ---
async function syncFlushQueue(){
  const q = pendingQueue.all();
  if(!q.length) return;
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;
  for(const item of q){
    try{
      const enc = await syncEncrypt(item.data, key);
      const body = JSON.stringify({
        action:'append_one', token,
        sheet: item.type==='flight'?'flights':'transfers',
        row: enc
      });
      const res = await syncPost(url, body);
      if(res.ok) pendingQueue.remove(item.id||item.data?.id);
    }catch(e){ console.warn('[SYNC] flush error:', e.message); }
  }
}

// ============================================================
// ЧТЕНИЕ ИЗ ОБЛАКА
// ============================================================

// Полная загрузка — только при входе или вручную
async function syncPullAll(confirm_=false){
  const {url,key,token} = syncGetCfg();
  if(!url) return null;
  if(confirm_ && !confirm('Загрузить данные из облака? Локальные изменения будут заменены.')) return null;
  syncIndicator('loading');
  try{
    const r = await fetch(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(), {redirect:'follow'});
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    const loaded = {
      flights:   await syncDecryptRows(d.flights||[], key),
      stock:     await syncDecryptRows(d.stock||[], key),
      squads:    (await syncDecryptRows(d.squads||[], key)).map(sq=>({...sq,drones:Array.isArray(sq.drones)?sq.drones:[]})),
      transfers: await syncDecryptRows(d.transfers||[], key),
      users: d.users||[]
    };
    // Фильтруем tombstones
    const tb = tombstones.load();
    loaded.flights = loaded.flights.filter(f=>!tb.has(f.id));
    // Актлог
    if(d.actlog&&d.actlog.length){
      const entries = await syncDecryptRows(d.actlog, key);
      entries.forEach(e=>{ if(!actLog.some(x=>x.id===e.id)) actLog.unshift(e); });
      actLog.sort((a,b)=>b.ts-a.ts);
      if(actLog.length>500) actLog=actLog.slice(0,500);
      try{ localStorage.setItem('act_log',JSON.stringify(actLog)); }catch(e){}
    }
    if(d.stock&&d.stock.length){
      const remoteStockVersion = Math.max(...(await syncDecryptRows(d.stock,key)).map(s=>s._sv||0));
      _lastStockTs = remoteStockVersion;
    }
    return loaded;
  }catch(e){
    console.error('[SYNC] pullAll error:', e.message);
    syncIndicator('error');
    return null;
  }
}

// Тихая загрузка при входе — не перезаписывает если есть pending
async function syncPullOnLogin(){
  const loaded = await syncPullAll(false);
  if(!loaded){ syncIndicator('error'); return; }
  const hasPending = pendingQueue.all().length > 0;
  if(!hasPending){
    state.flights   = loaded.flights;
    state.stock     = loaded.stock;
    state.squads    = loaded.squads;
    state.transfers = loaded.transfers;
  } else {
    // Есть несинхронизированное — сливаем только новое из облака
    console.log('[SYNC] pending queue not empty, merging only new records');
    const localFIds = new Set(state.flights.map(f=>f.id).filter(Boolean));
    const newF = loaded.flights.filter(f=>f.id&&!localFIds.has(f.id));
    state.flights = [...state.flights,...newF].sort((a,b)=>((b.date||'')+(b.time||'')).localeCompare((a.date||'')+(a.time||'')));
    const localTIds = new Set((state.transfers||[]).map(t=>t.id).filter(Boolean));
    const newT = loaded.transfers.filter(t=>t.id&&!localTIds.has(t.id));
    state.transfers = [...(state.transfers||[]),...newT].sort((a,b)=>((b.date||'')+(b.time||'')).localeCompare((a.date||'')+(a.time||'')));
    // Склад берём из облака только если наша версия старее
    const remoteStockVersion = Math.max(0,...loaded.stock.map(s=>s._sv||0));
    if(remoteStockVersion > _stockVersion){
      state.stock   = loaded.stock;
      state.squads  = loaded.squads;
      _stockVersion = remoteStockVersion;
    }
    // Отправляем накопленное
    setTimeout(()=>syncFlushQueue(), 1000);
  }
  saveLocal();
  syncIndicator('ok');
  syncRenderAll();
  renderSettingsStatus();
}

// Принудительная загрузка вручную (кнопка)
async function syncFromCloud(){
  const {url} = syncGetCfg();
  if(!url){ alert('Укажите URL в настройках'); return; }
  const st=document.getElementById('cfg-sync-status');
  const ind=document.getElementById('syncIndicator');
  if(st){ st.textContent='Загружаю из облака...'; st.style.color='var(--amber)'; }
  if(ind){ ind.className='sync-indicator syncing'; ind.textContent='↓ загрузка...'; }
  const loaded = await syncPullAll(true);
  if(!loaded){
    if(st){ st.textContent='Ошибка загрузки'; st.style.color='var(--red)'; }
    return;
  }
  state.flights   = loaded.flights;
  state.stock     = loaded.stock;
  state.squads    = loaded.squads;
  state.transfers = loaded.transfers;
  pendingQueue.clear();
  saveLocal();
  syncIndicator('ok');
  syncRenderAll();
  if(st){ st.textContent='✓ Загружено — '+new Date().toLocaleTimeString('ru'); st.style.color='var(--green2)'; }
  renderSettingsStatus();
  showSyncToast('✓ Данные загружены из облака');
}

// Принудительная выгрузка вручную (кнопка)
async function syncToCloud(silent=false){
  const ok = await syncPushAll(silent);
  if(!ok && !silent) alert('Ошибка синхронизации. Проверьте соединение.');
}

// ============================================================
// ПОЛЛИНГ — только дельта каждые 30 сек
// ============================================================

async function pollCloud(){
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;
  const ind = document.getElementById('syncIndicator');
  try{
    const since = _lastPollTs;
    const r = await fetch(url+'?action=read_since&token='+encodeURIComponent(token)+'&since='+since+'&_='+Date.now(), {redirect:'follow'});
    const d = await r.json();
    if(d.error){ console.warn('[POLL]', d.error); return; }
    _lastPollTs = Date.now();

    let changed = false;
    const tb = tombstones.load();

    // Новые вылеты от других пользователей
    for(const row of (d.flights||[])){
      const obj = await syncDecrypt(row, key);
      if(!obj) continue;
      if(tb.has(obj.id)) continue; // Удалён локально
      if(!state.flights.some(f=>f.id===obj.id)){
        state.flights.unshift(obj);
        changed = true;
        // Списываем дрон если потеря — но только если списание ещё не зафиксировано
        // на устройстве-источнике (флаг приходит вместе с вылетом).
        if(obj.returned==='no' && obj.drone && !obj._lossWritten){
          writeDroneLoss(obj.pilot, obj.drone, obj.date, obj.time, obj.id);
          obj._lossWritten=true;
          setTimeout(()=>syncPushStockSquads(), 500);
        }
      }
    }

    // Новые передачи
    for(const row of (d.transfers||[])){
      const obj = await syncDecrypt(row, key);
      if(!obj) continue;
      if(!(state.transfers||[]).some(t=>t.id===obj.id)){
        if(!state.transfers) state.transfers=[];
        state.transfers.unshift(obj);
        changed = true;
      }
    }

    // Актлог
    for(const row of (d.actlog||[])){
      const obj = await syncDecrypt(row, key);
      if(!obj) continue;
      if(!actLog.some(e=>e.id===obj.id)){
        actLog.unshift(obj); changed=true;
      }
    }
    if(d.actlog&&d.actlog.length){
      actLog.sort((a,b)=>b.ts-a.ts);
      if(actLog.length>500) actLog=actLog.slice(0,500);
      try{ localStorage.setItem('act_log',JSON.stringify(actLog)); }catch(e){}
    }

    // Склад обновился у другого пользователя
    if(d.stock_updated_ts && d.stock_updated_ts > _lastStockTs){
      console.log('[POLL] Склад обновился, загружаем');
      _lastStockTs = d.stock_updated_ts;
      try{
        const r2 = await fetch(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(), {redirect:'follow'});
        const d2 = await r2.json();
        if(!d2.error){
          const remoteStock  = await syncDecryptRows(d2.stock||[], key);
          const remoteSquads = (await syncDecryptRows(d2.squads||[], key)).map(sq=>({...sq,drones:Array.isArray(sq.drones)?sq.drones:[]}));
          // Берём только если версия новее нашей
          const remoteVersion = Math.max(0,...remoteStock.map(s=>s._sv||0));
          if(remoteVersion > _stockVersion){
            state.stock   = remoteStock;
            state.squads  = remoteSquads;
            _stockVersion = remoteVersion;
            changed = true;
            console.log('[POLL] Склад обновлён, версия:', _stockVersion);
          }
        }
      }catch(e){ console.warn('[POLL] stock sync error:', e.message); }
    }

    if(changed){
      saveLocal();
      renderDashboard(); renderFlights(); renderInventory(); rebuildRoleSelector();
      const newF = (d.flights||[]).length;
      if(newF>0) showSyncToast('↓ '+newF+' новых вылетов');
    }
    if(ind){ ind.className='sync-indicator saved'; ind.textContent='● '+new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}); }
  }catch(e){
    console.warn('[POLL] error:', e.message);
    if(ind){ ind.className='sync-indicator'; ind.textContent='⚠ нет связи'; }
  }
}

// ============================================================
// ТАЙМЕРЫ
// ============================================================

function startPolling(){
  if(window._pollInterval) clearInterval(window._pollInterval);
  window._pollInterval = setInterval(()=>{
    const {url,token} = syncGetCfg();
    if(url&&token&&navigator.onLine) pollCloud();
  }, 30000);
  if(window._fullSyncInterval) clearInterval(window._fullSyncInterval);
  window._fullSyncInterval = setInterval(()=>{
    const {url,token} = syncGetCfg();
    if(url&&token&&navigator.onLine){
      console.log('[SYNC] Плановая полная синхронизация');
      syncPullOnLogin();
    }
  }, 5*60*1000);
}

// Отправка в облако по имени листа. actlog шлём напрямую, остальное — как transfer.
function appendToCloud(sheet, obj){
  if(sheet==='actlog'){
    // Журнал действий — отправляем отдельно напрямую
    const {url,key,token}=syncGetCfg();
    if(!url||!token)return;
    (async()=>{
      const enc=await syncEncrypt({...obj,id:obj.id||genId('a')},key);
      const body=JSON.stringify({action:'append_one',token,sheet:'actlog',row:enc});
      await syncPost(url,body);
    })();
    return;
  }
  // transfers, flights и т.д.
  return syncAddTransfer(obj);
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
  const savedSize=localStorage.getItem('fontSize')||'16';
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
}catch(e){applyTheme('terminal');applyFontSize('16');switchRole('cmd');}
// ВАЖНО: cfgLoad до initAuth — нужен URL для синхронизации
cfgLoad();
renderSettingsStatus();
ammoLoad();
actLogLoad();
document.getElementById('nu-enckey').value=cfg.key||'';
// initAuth вызываем последним — он использует cfg.url и cfg.key
initAuth().then(()=>startPolling());
