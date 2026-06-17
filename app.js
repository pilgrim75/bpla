
// ============ STATE ============
const DRONE_CATALOG=['Гамаюн13','Гамаюн13д','Гамаюн13т','Гамаюн12','КИРМ','ПВХ1','Упырь11','Упырь18','Курьер21','Изделие580','Изделие548','Гамаюн13з','Упырь16'];

function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ============ UTILS ============
// Уникальный id. prefix помечает источник: 'f' вылет, 't' transfer, 'a' actlog и т.п.
function genId(prefix){return Date.now()+'_'+(prefix?prefix+'_':'')+Math.random().toString(36).slice(2);}
// Локальная дата (YYYY-MM-DD) — НЕ UTC (toISOString сдвигает день на границе часовых поясов)
function localISO(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// Текущая дата ISO (YYYY-MM-DD) и время (HH:MM) — локальные
function todayISO(){return localISO();}
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

// Роль только-чтение: наблюдатель (viewer) — видит Обзор/Вылеты/Отчёты, ничего не меняет
function isViewerRole(role){return role==='viewer';}
// Guard мутирующих операций: для viewer блокируем изменение данных на уровне функций,
// а не только скрытием кнопок (защита от вызова из консоли/обходных путей UI).
// Запись в облако дополнительно блокирует sync-слой (syncReadOnly в sync.js).
function guardWrite(){
  if(!isViewerRole(state.role)&&!isViewerRole(authUser.role))return true;
  alert('Роль «Наблюдатель» — только просмотр');
  return false;
}
// Guard операций администратора (создание пользователей, смена токенов и т.п.).
// Проверка по УЧЁТКЕ (authUser), а не по переключателю — admin в роли cmd сохраняет права.
function guardAdmin(){
  if(authUser.role==='admin'||authUser.login==='local'||authUser.login==='admin')return true;
  alert('Доступно только администратору');
  return false;
}

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
    state.squads.map((sq,i)=>`<option value="pilot_${i}">Пилот ${esc(sq.pilot)}</option>`).join('');
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

// Однократное предупреждение при переполнении localStorage (иначе данные тихо теряются)
let _lsQuotaWarned=false;
function lsQuotaWarn(e){
  console.error('[STORAGE] localStorage write failed:', e&&e.name);
  if(_lsQuotaWarned)return;
  _lsQuotaWarned=true;
  try{ if(typeof showSyncToast==='function') showSyncToast('⚠ Хранилище переполнено — данные не сохранены локально', 6000); }catch(_){}
}
function saveLocal(){
  try{localStorage.setItem('droneState',JSON.stringify(state));}catch(e){lsQuotaWarn(e);}
  // Debounce — отправляем в облако через 2 сек после последнего изменения
  clearTimeout(saveLocal._timer);
  saveLocal._timer=setTimeout(()=>{
    const {url,token}=syncGetCfg();
    if(url&&token&&navigator.onLine)syncPushAll(true);
  },2000);
}
// Сохранить локально БЕЗ авто-выгрузки полного снимка (syncPushAll).
// Для операций, которые сами выгружают нужные листы точечно (append/stock),
// чтобы не делать деструктивный полный write массива flights (Risk 3).
function saveLocalQuiet(){
  try{localStorage.setItem('droneState',JSON.stringify(state));}catch(e){lsQuotaWarn(e);}
  clearTimeout(saveLocal._timer); // отменяем отложенный полный write, если был запланирован
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
  updateQueueIndicator();
}
window.addEventListener('online',checkNet);
window.addEventListener('offline',checkNet);
// При восстановлении сети — сразу досылаем накопленную очередь
window.addEventListener('online',()=>{
  const {url,token}=syncGetCfg();
  if(url&&token&&typeof syncFlushQueue==='function') syncFlushQueue();
});
checkNet();

// ============ NAV ============
function showPage(id,btn){
  // Наблюдателю недоступны Склад/Импорт/Администратор (вкладки скрыты + guard от прямого вызова)
  if((isViewerRole(state.role)||isViewerRole(authUser.role))&&(id==='inventory'||id==='import'||id==='admin'))return;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(id==='flights')renderFlights();
  if(id==='dashboard')renderDashboard();
  if(id==='inventory')renderInventory();
  if(id==='report'){fillReportFilters();buildReport();}
  if(id==='settings'){
    applySettingsVisibility(); // секции по ролям: admin — всё, остальные — ключ+статус
    const isAdminAcc=authUser.role==='admin'||authUser.login==='local'||authUser.login==='admin';
    const nuke=document.getElementById('nu-enckey');
    if(nuke&&isAdminAcc)nuke.value=cfg.key||localStorage.getItem('cfg_key')||'';
    if(authToken&&isAdminAcc)loadUsersList(); // список пользователей не грузим не-админам
    renderSettingsStatus();
    if(typeof nuRoleChange==='function')nuRoleChange();
  }
  if(id==='admin'){
    // Инициализируем дефолтные даты фильтра
    const now=new Date();
    const firstDay=localISO(new Date(now.getFullYear(),now.getMonth(),1));
    const today=localISO(now);
    const ff=document.getElementById('adm-filterFrom');
    const ft=document.getElementById('adm-filterTo');
    if(ff&&!ff.value)ff.value=firstDay;
    if(ft&&!ft.value)ft.value=today;
    renderAdminFlights();renderAdminStock();renderAdminSquads();
  }
}

function switchRole(r){
  // Не-админская учётка не может переключить роль (защита от вызова из консоли) —
  // принудительно возвращаем роль учётки. Пустой login = до авторизации/локальный режим.
  const _adminAcc=!authUser.login||authUser.login==='local'||authUser.login==='admin'||authUser.role==='admin';
  if(!_adminAcc){const fixed=accountRole();if(fixed&&r!==fixed)r=fixed;}
  state.role=r;
  let label='';
  let pilotName='';
  if(r==='admin')label='Администратор';
  else if(r==='cmd')label='Командир';
  else if(r==='tech')label='Техник';
  else if(r==='viewer')label='Наблюдатель';
  else if(r.startsWith('pilot_')){
    const idx=parseInt(r.split('_')[1]);
    pilotName=state.squads[idx]?state.squads[idx].pilot:'?';
    label='Пилот '+pilotName;
  }
  // Для роли пилота — золотые щиты рядом с именем в topbar (под высоту заглавных букв)
  const tbShields=r.startsWith('pilot_')&&pilotName&&pilotName!=='?'?goldShieldsHtml(pilotName,{inline:true}):'';
  document.getElementById('roleBadge').innerHTML='<b>'+esc(label)+'</b>'+tbShields;
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
  applyViewerUI(r); // скрытие вкладок Склад/Импорт и форм для наблюдателя
  applySettingsVisibility(); // секции страницы Настройки по роли
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
  if(tab==='geo')renderGeoTab();
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
        <th style="min-width:36px">#</th>
        <th style="min-width:75px">Пилот</th>
        <th style="min-width:100px">Точка</th>
        <th style="min-width:82px">Боеприпас</th>
        <th style="min-width:82px">БПЛА</th>
        <th style="min-width:46px">Задача</th>
        <th style="min-width:82px">Борт</th>
        <th style="min-width:60px">Дальн</th>
        <th style="width:100%">Примечание</th>
        <th style="min-width:24px"></th>
      </tr></thead>
      <tbody>${indexed.map(({x,i})=>`<tr>
        <td><input style="width:100px" type="date" value="${x.date}" onchange="adminEditFlight(${i},'date',this.value)"></td>
        <td><input style="width:76px;min-width:76px" type="time" value="${x.time}" onchange="adminEditFlight(${i},'time',this.value)"></td>
        <td><input style="width:36px" type="number" min="1" value="${x.flightnum||''}" onchange="adminEditFlight(${i},'flightnum',this.value?parseInt(this.value):null)"></td>
        <td><input style="width:72px" value="${esc(x.pilot||'')}" onchange="adminEditFlight(${i},'pilot',this.value)"></td>
        <td><input style="width:100px" value="${esc(x.target||'')}" onchange="adminEditFlight(${i},'target',this.value)"></td>
        <td><input style="width:80px" value="${esc(x.ammo||'')}" onchange="adminEditFlight(${i},'ammo',this.value)" onclick="event.stopPropagation();const ammoList=ammoCatalog.length?ammoCatalog.map(a=>a.name):[...new Set(state.flights.map(f=>f.ammo).filter(Boolean))].sort();showQuickPicker(this,ammoList,v=>{adminEditFlight(${i},'ammo',v)})" autocomplete="off"></td>
        <td><input style="width:85px" value="${esc(x.drone||'')}" onchange="adminEditFlight(${i},'drone',this.value)" onclick="event.stopPropagation();showQuickPicker(this,[...new Set([...state.stock.map(d=>d.name),...state.squads.flatMap(sq=>sq.drones.map(d=>d.name))])].sort(),v=>{adminEditFlight(${i},'drone',v)})" autocomplete="off"></td>
        <td><select style="width:46px;padding:1px 2px;font-size:13px" onchange="adminEditFlight(${i},'result',this.value)"><option value="yes" ${x.result==='yes'?'selected':''}>✅</option><option value="no" ${x.result==='no'?'selected':''}>❌</option></select></td>
        <td><select style="width:80px" onchange="adminEditFlight(${i},'returned',this.value)"><option value="yes" ${x.returned==='yes'?'selected':''}>вернул</option><option value="no" ${x.returned==='no'?'selected':''}>потерян</option></select></td>
        <td style="white-space:nowrap;color:var(--muted)">${x.range_km!=null?x.range_km+' км':''}</td>
        <td><input style="width:100%;min-width:120px" value="${esc(x.note||'')}" onchange="adminEditFlight(${i},'note',this.value)"></td>
        <td style="white-space:nowrap">${x.geo_locked?'<span title="Дистанция зафиксирована (🔒). Защищена от пересчёта">🔒</span> ':''}<button class="btn btn-danger btn-sm" style="padding:1px 5px;font-size:9px" onclick="adminDeleteFlight(${i})">✕</button></td>
      </tr>`).join('')}
      </tbody>
    </table>`:'<div style="color:var(--muted);padding:12px">Нет вылетов</div>';
}

function adminEditFlight(idx,field,val){
  if(!guardWrite())return;
  // Смена статуса «вернул ↔ потерян» → списать/вернуть борт у пилота
  if(field==='returned'){
    const f=state.flights[idx];
    if(f && f.returned!==val && (val==='no'||val==='yes')){
      adminEditReturned(idx,val);
      return;
    }
  }
  // Смена борта в вылете-потере → пересчитать списание у пилота
  if(field==='drone'){
    const f=state.flights[idx];
    const oldDrone=(f?f.drone||'':'').trim();
    const newDrone=(val||'').trim();
    // Вылет помечен как потеря и борт реально изменился — пересчитать списание.
    // Флаг _lossWritten не проверяем: у исторических вылетов он не выставлен.
    if(f && f.returned==='no' && oldDrone && newDrone && oldDrone.toLowerCase()!==newDrone.toLowerCase()){
      adminEditLossDrone(idx,oldDrone,newDrone);
      return;
    }
  }
  syncEditFlight(idx,field,val);
  const fl=state.flights[idx];
  logAction('flight','edit','Адм: '+(fl?(fl.pilot||'')+' '+(fl.date||'')+' '+(fl.time||''):'#'+idx)+' — '+field+' = '+String(val??'').slice(0,40));
}

// Пересчёт списания при смене борта в вылете-потере (returned='no').
// Спрашивает подтверждение: применять ли изменения к складу/расчёту.
// «Нет» — меняем только текст вылета, склад не трогаем.
async function adminEditLossDrone(idx, oldDrone, newDrone){
  const f=state.flights[idx];
  if(!f) return;
  const pilot=f.pilot;
  const apply=await confirmLossDroneChange(oldDrone,newDrone,pilot);

  // Текст вылета меняем в любом случае
  f.drone=newDrone;

  if(apply){
    let sq=state.squads.find(s=>s.pilot===pilot);
    if(!sq){ sq={pilot,drones:[]}; state.squads.push(sq); }
    // 1) вернуть старый борт пилоту
    const od=sq.drones.find(d=>d.name.toLowerCase()===oldDrone.toLowerCase());
    if(od) od.qty++; else sq.drones.push({name:oldDrone,qty:1});
    // 2) списать новый борт у пилота (если есть — иначе не плодим фантом qty:-1)
    const nd=sq.drones.find(d=>d.name.toLowerCase()===newDrone.toLowerCase());
    if(nd){ nd.qty--; if(nd.qty<=0) sq.drones=sq.drones.filter(d=>d!==nd); }
    // 3) обновить запись о потере в transfers
    updateLossTransferDrone(f, oldDrone, newDrone);
    syncBumpStockVersion();
  }

  // Дефект C (10.06.2026): saveLocal вместо saveLocalQuiet — правка f.drone и запись
  // о потере уходят debounce-write'ом (syncPushAll неразрушающий), иначе плановый
  // syncPullOnLogin (5 мин) успевал откатить их облачной версией. Склад — точечно.
  saveLocal();
  if(apply) syncPushStockSquads();
  logAction('flight','edit','Адм: смена борта в потере '+oldDrone+' → '+newDrone+' у '+(pilot||'')+(apply?'':' — без пересчёта склада'));
  renderAdminFlights(); renderDashboard(); renderInventory();
}

// Находит запись о потере для вылета (по flightId → пилот+борт+дата+время → +дата)
// и меняет в ней борт. Запись уйдёт в облако полным снимком (syncPushAll).
function updateLossTransferDrone(f, oldDrone, newDrone){
  const ts=state.transfers||[];
  const pLow=(f.pilot||'').toLowerCase();
  const dLow=oldDrone.toLowerCase();
  let rec=null;
  if(f.id) rec=ts.find(t=>t.type==='loss'&&t.flightId===f.id);
  if(!rec) rec=ts.find(t=>t.type==='loss'&&(t.pilot||'').toLowerCase()===pLow&&(t.drone||'').toLowerCase()===dLow&&t.date===f.date&&t.time===f.time);
  if(!rec) rec=ts.find(t=>t.type==='loss'&&(t.pilot||'').toLowerCase()===pLow&&(t.drone||'').toLowerCase()===dLow&&t.date===f.date);
  if(rec) rec.drone=newDrone;
}

// Диалог подтверждения смены борта в потере. Возвращает Promise<bool>.
function confirmLossDroneChange(oldDrone,newDrone,pilot){
  return new Promise(resolve=>{
    const ov=modalOverlay(`<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px 24px;max-width:400px;width:92%;box-shadow:0 8px 32px #0008">
      <div style="font-size:13px;font-weight:700;color:var(--amber,#f59e0b);margin-bottom:10px">Борт изменён</div>
      <div style="font-size:12px;color:var(--text);margin-bottom:16px;line-height:1.5"><b>${esc(oldDrone)}</b> возвращён пилоту${pilot?' '+esc(pilot):''}, <b>${esc(newDrone)}</b> списан как потеря.<br>Применить изменения к складу?</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-success btn-sm" id="lds-yes">Да</button>
        <button class="btn btn-sm" id="lds-no">Нет</button>
      </div>
    </div>`);
    ov.querySelector('#lds-yes').onclick=()=>{ov.remove();resolve(true);};
    ov.querySelector('#lds-no').onclick=()=>{ov.remove();resolve(false);};
  });
}

// Смена статуса вылета «вернул ↔ потерян» с пересчётом склада.
// «Нет» — меняем только статус вылета, склад/расчёт не трогаем.
async function adminEditReturned(idx, newReturned){
  const f=state.flights[idx];
  if(!f) return;
  const drone=(f.drone||'').trim();
  const pilot=f.pilot;
  const loss = newReturned==='no'; // yes→no списание, no→yes возврат

  // Без борта списывать/возвращать нечего — просто меняем статус
  if(!drone){ syncEditFlight(idx,'returned',newReturned); return; }

  const msg = loss
    ? `Борт <b>${esc(drone)}</b> будет списан как потеря у пилота${pilot?' '+esc(pilot):''}. Применить?`
    : `Борт <b>${esc(drone)}</b> будет возвращён пилоту${pilot?' '+esc(pilot):''}. Применить?`;
  const apply = await confirmReturnedChange(msg);

  // Статус вылета меняем в любом случае
  f.returned=newReturned;

  if(apply){
    if(loss){
      // списать борт у пилота + запись о потере в transfers
      writeDroneLoss(f.pilot, drone, f.date, f.time, f.id);
      f._lossWritten=true;
    } else {
      // вернуть борт пилоту + убрать запись о потере (сам пушит склад)
      returnLossDrone(f);
      f._lossWritten=false;
    }
  }

  // Дефект C (10.06.2026): saveLocal вместо saveLocalQuiet — статус и флаг _lossWritten
  // уходят debounce-write'ом (syncPushAll неразрушающий), иначе плановый syncPullOnLogin
  // откатывал их облачной версией (и другое устройство списывало борт повторно).
  // Склад точечно: для потери — здесь (writeDroneLoss не пушит сам), для возврата — returnLossDrone.
  saveLocal();
  if(apply && loss) syncPushStockSquads(); // syncPushStockSquads сам бампит версию
  logAction('flight','edit','Адм: '+(loss?'вернул → потерян':'потерян → вернул')+' '+(f.pilot||'')+' '+(f.date||'')+' '+(f.time||'')+' ('+drone+')'+(apply?'':' — без пересчёта склада'));
  renderAdminFlights(); renderDashboard(); renderInventory();
}

// Возврат борта пилоту (+1) и удаление записи о потере.
// Поиск записи — тем же трёхуровневым проходом, что и в syncDeleteFlight.
function returnLossDrone(f){
  const pLow=(f.pilot||'').toLowerCase();
  const dLow=(f.drone||'').toLowerCase();
  const sq=state.squads.find(s=>s.pilot===f.pilot);
  if(sq){
    const d=sq.drones.find(d=>d.name.toLowerCase()===dLow);
    if(d) d.qty++; else sq.drones.push({name:f.drone,qty:1});
  }
  const before=(state.transfers||[]).length;
  let removedTransfers=[];
  const removeLoss=(pred)=>{
    const keep=[], removed=[];
    (state.transfers||[]).forEach(t=>(pred(t)?removed:keep).push(t));
    state.transfers=keep; return removed;
  };
  if(f.id){
    removedTransfers=removeLoss(t=>t.type==='loss'&&t.flightId===f.id);
  }
  if((state.transfers||[]).length===before){
    removedTransfers=removeLoss(t=>
      t.type==='loss' &&
      (t.pilot||'').toLowerCase()===pLow &&
      (t.drone||'').toLowerCase()===dLow &&
      t.date===f.date && t.time===f.time
    );
  }
  if((state.transfers||[]).length===before){
    removedTransfers=removeLoss(t=>
      t.type==='loss' &&
      (t.pilot||'').toLowerCase()===pLow &&
      (t.drone||'').toLowerCase()===dLow &&
      t.date===f.date
    );
  }
  // tombstone удалённых loss-передач — чтобы неразрушающий merge не вернул их из облака
  // Путь Б: публикуем удаление в облачный лист tombstones (распространение на устройства)
  syncPublishTombstones(removedTransfers.map(t=>t.id));
  syncBumpStockVersion();
  setTimeout(()=>syncPushStockSquads(),300);
}

// Диалог подтверждения смены статуса потери. Возвращает Promise<bool>.
function confirmReturnedChange(msgHtml){
  return new Promise(resolve=>{
    const ov=modalOverlay(`<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px 24px;max-width:400px;width:92%;box-shadow:0 8px 32px #0008">
      <div style="font-size:13px;font-weight:700;color:var(--amber,#f59e0b);margin-bottom:10px">Изменение статуса вылета</div>
      <div style="font-size:12px;color:var(--text);margin-bottom:16px;line-height:1.5">${msgHtml}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-success btn-sm" id="rch-yes">Да</button>
        <button class="btn btn-sm" id="rch-no">Нет</button>
      </div>
    </div>`);
    ov.querySelector('#rch-yes').onclick=()=>{ov.remove();resolve(true);};
    ov.querySelector('#rch-no').onclick=()=>{ov.remove();resolve(false);};
  });
}

function adminDeleteFlight(idx){
  if(!guardWrite())return;
  if(!confirm('Удалить этот вылет?'))return;
  syncDeleteFlight(idx);
}

function renderAdminStock(){
  document.getElementById('adminStockList').innerHTML=state.stock.length?`
    <table>
      <thead><tr><th>Название</th><th>Кол-во</th><th>Статус</th><th>Действие</th></tr></thead>
      <tbody>${state.stock.map((d,i)=>`<tr>
        <td><input style="width:120px" value="${esc(d.name)}" onchange="adminEditStock(${i},'name',this.value)"></td>
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
  if(!guardWrite())return;
  if(state.stock[idx])state.stock[idx][field]=val;
  saveLocal();
  syncBumpStockVersion();   // версионируем — иначе поллинг затрёт правку
  syncPushStockSquads();
  renderDashboard();
}

function adminDeleteStock(idx){
  if(!guardWrite())return;
  if(!confirm('Удалить позицию со склада?'))return;
  const it=state.stock[idx];
  state.stock.splice(idx,1);
  logAction('stock','delete','Удалена позиция склада: '+(it?it.name+' ×'+it.qty+' ('+it.status+')':'#'+idx));
  saveLocal();
  syncBumpStockVersion();
  syncPushStockSquads();
  renderAdminStock();
  renderDashboard();
}

function adminAddStock(){
  if(!guardWrite())return;
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
      <thead><tr><th>Пилот</th><th>Точка старта</th><th>БПЛА</th><th>Кол-во</th><th>Действие</th></tr></thead>
      <tbody>${state.squads.flatMap((sq,si)=>sq.drones.map((d,di)=>`<tr>
        <td>${di===0?`<input style="width:90px" value="${esc(sq.pilot)}" onchange="adminEditSquadPilot(${si},this.value)">`:'&nbsp;'}</td>
        <td>${di===0?`<input style="width:110px" value="${esc(sq.start_point||'')}" placeholder="45 вишня" onchange="squadEditStartPoint(${si},this.value)" autocomplete="off"><br><button id="geo-rc-btn-adm-${si}" class="btn btn-sm" style="margin-top:4px;font-size:10px;display:${geoStartBtnShow(sq)?'':'none'}" onclick="geoRecalcPilotMissing(${si},'geo-rc-prog-adm-${si}','geo-rc-btn-adm-${si}')">Пересчитать вылеты без дистанций</button><span id="geo-rc-prog-adm-${si}" style="font-size:10px;color:var(--muted)"></span>`:'&nbsp;'}</td>
        <td><input style="width:90px" value="${esc(d.name)}" onchange="adminEditSquadDrone(${si},${di},'name',this.value)"></td>
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
  if(!guardWrite())return;
  const old=state.squads[si]?state.squads[si].pilot:'';
  if(state.squads[si])state.squads[si].pilot=val;
  if(old!==val)logAction('squad','edit','Переименован пилот '+old+' → '+val);
  saveLocal();
  syncBumpStockVersion();
  syncPushStockSquads();
}
function adminEditSquadDrone(si,di,field,val){
  if(!guardWrite())return;
  const sq=state.squads[si];const d=sq&&sq.drones[di];
  if(d){
    const old=d[field];
    if(field==='qty'){const delta=(parseInt(val)||0)-d.qty;if(delta&&d.name)_logAdminTransfer(sq.pilot,d.name,delta,'адм');}
    else if(field==='name'&&val&&!d.name&&d.qty>0)_logAdminTransfer(sq.pilot,val,d.qty,'адм');
    d[field]=val;
    if(old!==val)logAction('squad','edit','Расчёт '+(sq.pilot||'')+': '+(field==='name'?('борт '+(old||'(новый)')+' → '+val):('борт '+(d.name||'?')+' — кол-во '+old+' → '+val)));
  }
  saveLocal();
  syncBumpStockVersion();
  syncPushStockSquads();
}
function adminDeleteSquad(si){
  if(!guardWrite())return;
  if(!confirm('Удалить расчёт '+state.squads[si].pilot+'?'))return;
  const pName=state.squads[si].pilot;
  state.squads.splice(si,1);
  logAction('squad','delete','Удалён расчёт '+pName);
  saveLocal();
  syncBumpStockVersion();
  syncPushStockSquads();
  renderAdminSquads();
  renderDashboard();
}
function adminAddSquad(){
  if(!guardWrite())return;
  const p=document.getElementById('adm-newPilot').value.trim();
  const ds=document.getElementById('adm-newPilotDrones').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!p)return;
  state.squads.push({pilot:p,drones:ds.map(n=>({name:n,qty:1}))});
  ds.forEach(n=>_logAdminTransfer(p,n,1,'адм: новый расчёт'));
  logAction('squad','add','Создан расчёт '+p+(ds.length?' ('+ds.join(', ')+')':''));
  saveLocal();
  syncBumpStockVersion();
  syncPushStockSquads();
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
  if(!guardWrite())return;
  const file=input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const imported=JSON.parse(e.target.result);
      if(!imported.flights||!imported.stock)throw new Error('Неверный формат');
      if(!confirm('Заменить все текущие данные данными из файла?\n\nВнимание: импорт НЕ удаляет данные из облака — записи, которые есть в облаке, но отсутствуют в файле, вернутся при ближайшей синхронизации.'))return;
      state=imported;
      saveLocal();
      // Импортированные склад/расчёты выгружаем явно: syncPushAll после Дефекта B
      // (09.06) их не пишет — только flights/transfers. syncToCloud догоняет flights/transfers.
      syncBumpStockVersion();
      syncPushStockSquads();
      syncToCloud(true);
      renderDashboard();
      renderAdminFlights();
      renderAdminStock();
      renderAdminSquads();
      logAction('admin','import','Импорт из файла '+file.name+': вылетов '+(state.flights||[]).length+', передач '+(state.transfers||[]).length);
      setStatus('saveStatus','✓ Данные загружены из файла: '+file.name,'ok');
    }catch(err){
      alert('Ошибка загрузки файла: '+err.message);
    }
  };
  reader.readAsText(file);
  input.value='';
}

function adminClearFlights(){
  if(!guardWrite())return;
  if(!confirm('Удалить ВСЕ вылеты из базы? Это действие необратимо.'))return;
  // tombstone на каждый id — иначе неразрушающий merge (syncPushAll) и поллинг
  // вернут все вылеты из облака в течение секунд, и «удаление» не сработает
  const _cnt=state.flights.length;
  syncPublishTombstones(state.flights.map(f=>f.id).filter(Boolean)); // Путь Б: публикуем массовое удаление
  state.flights=[];
  logAction('flight','clear','Удалены ВСЕ вылеты ('+_cnt+' зап.)');
  saveLocal();
  renderAdminFlights();
  renderDashboard();
  setStatus('saveStatus','Все вылеты удалены — '+new Date().toLocaleString('ru'),'err');
}

function adminResetAll(){
  if(!guardWrite())return;
  if(!confirm('ПОЛНЫЙ СБРОС всех данных? Склад, расчёты и вылеты будут удалены. Необратимо.'))return;
  if(!confirm('Вы уверены? Данные будут потеряны.'))return;
  // Запись попадает в pendingQueue (свой ключ localStorage, переживает сброс droneState)
  // и уйдёт в облако после перезагрузки
  logAction('admin','reset','ПОЛНЫЙ СБРОС локальных данных');
  localStorage.removeItem('droneState');
  location.reload();
}

// Удаляет записи о потерях, у которых нет соответствующего вылета
// (остаются когда вылет удаляют или меняют returned: no → yes без очистки)
function adminCleanOrphanLosses(){
  if(!guardWrite())return;
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
  const removedIds=[];
  state.transfers=(state.transfers||[]).filter(t=>{
    if(t.type!=='loss')return true;
    const key=(t.pilot||'').toLowerCase()+'|'+(t.drone||'').toLowerCase()+'|'+(t.date||'');
    if(lostFlightKeys.has(key))return true;
    if(t.id)removedIds.push(t.id);
    return false;
  });
  const removed=before-(state.transfers||[]).length;
  // tombstone удалённых loss-записей — иначе неразрушающий merge/поллинг вернёт их из облака
  syncPublishTombstones(removedIds); // Путь Б: публикуем удаление осиротевших потерь в облако
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

// Удаляет ДУБЛИ записей о потерях: type='loss' с одинаковыми date+time+pilot+drone
// (наследие бага двойного списания до Risk 4 — каждое устройство писало свою
// loss-запись, пока флаг _lossWritten не возвращался в облако; в бэкапах находили
// до 100+ копий одной потери). Первая запись в массиве остаётся, id остальных
// уходят в tombstones — иначе неразрушающий merge/поллинг вернёт их из облака.
function adminDedupeLossTransfers(){
  const role=state.role||authUser.role||'';
  if(role!=='admin'){alert('Доступно только администратору');return;}
  if(!(state.transfers||[]).some(t=>t.type==='loss')){
    setStatus('saveStatus','Записей о потерях в журнале нет','muted');
    return;
  }
  // Сначала считаем (без мутации) — чтобы показать число в подтверждении
  const seen=new Set();
  const removedIds=[];
  const kept=[];
  let removed=0;
  (state.transfers||[]).forEach(t=>{
    if(t.type!=='loss'){kept.push(t);return;}
    const key=(t.date||'')+'|'+(t.time||'')+'|'+(t.pilot||'').toLowerCase()+'|'+(t.drone||'').toLowerCase();
    if(seen.has(key)){removed++;if(t.id)removedIds.push(t.id);return;}
    seen.add(key);kept.push(t);
  });
  if(!removed){
    setStatus('saveStatus','✓ Дублей потерь не найдено — журнал чистый','muted');
    return;
  }
  if(!confirm('Найдено '+removed+' дублей записей о потерях (одинаковые дата+время+пилот+борт).\nОставить по одной записи в каждой группе, остальные удалить?'))return;
  syncPublishTombstones(removedIds); // Путь Б: публикуем удаление дублей потерь в облако
  state.transfers=kept;
  // Немедленная выгрузка полным write (merge исключит tombstoned-записи);
  // saveLocalQuiet — чтобы не плодить второй отложенный push через debounce
  saveLocalQuiet();
  syncToCloud(true);
  renderInventory();
  logAction('transfer','dedupe','Удалено '+removed+' дублей записей о потерях');
  setStatus('saveStatus','✓ Удалено '+removed+' дублей потерь — '+new Date().toLocaleString('ru'),'ok');
}

// Аудит целостности склада: закон сохранения бортов по моделям — «поступило» против
// «есть сейчас + выбыло». Вызов из консоли: syncAuditStock() (синхронная, await не нужен).
//
// ОГРАНИЧЕНИЯ (не нарушать при доработке) — по образцу syncAuditEncryption (sync.js):
//  • ТОЛЬКО ЧТЕНИЕ — не мутирует state/actLog/pendingQueue, не пишет в localStorage
//    и облако, ничего не удаляет. После вызова перезагрузка не нужна.
//  • Никакого spread на больших массивах (String.fromCharCode(...buf) и т.п.).
//
// Баланс: intake = arrival.qty + exchange.getQty; выбытие = exchange.giveQty + loss
// (qty или 1). type='transfer' — внутреннее перемещение, баланс не меняет, КРОМЕ
// передачи в «списан» (saveTransfer уменьшает qty — фактическое выбытие): она
// считается отдельно (writeoff_t) и входит в diff_adj; перевод в «не бг» — внутреннее
// (nbg_t — справочно, в баланс не входит).
// Две гипотезы о stock-строках со статусом lost/«списан» (формулы расходятся ровно
// на их сумму, колонка lost): diff_A — независимое наличие (intake − (всё наличие +
// give + loss)); diff_B — дубль учёта loss-передач, игнорируются (intake − (наличие
// без lost + give + loss)). По коду верна A: writeDroneLoss lost-строк НЕ создаёт.
// Ненулевой diff при verdict обеих гипотез — легаси-приход до складского учёта
// (transfers ведутся с 01.06.2026, начальный склад без arrival-записей) либо баг.
// План фиксации легаси-остатка — syncStockLegacyPlan() (ниже, тот же расчёт).

// Чистый расчёт аудита (без вывода) — общий для syncAuditStock и syncStockLegacyPlan
function _stockAuditCompute(){
  const norm=s=>(s||'').toLowerCase().trim();
  const models={};
  const get=name=>{
    const k=norm(name);
    if(!k)return null;
    if(!models[k])models[k]={model:String(name).trim(),intake:0,onhandAll:0,onhandActive:0,lost:0,exGive:0,lossSum:0,writeoffT:0,nbgT:0};
    return models[k];
  };

  // Наличие: склад (все статусы; lost/«списан» — отдельно) + расчёты
  (state.stock||[]).forEach(d=>{
    const m=get(d.name); if(!m)return;
    const q=d.qty||0;
    m.onhandAll+=q;
    const st=norm(d.status);
    if(st==='lost'||st==='списан') m.lost+=q;
    else m.onhandActive+=q;
  });
  (state.squads||[]).forEach(sq=>(sq.drones||[]).forEach(d=>{
    const m=get(d.name); if(!m)return;
    m.onhandAll+=d.qty||0; m.onhandActive+=d.qty||0;
  }));

  // Журнал операций: приход/выбытие (transfer — внутреннее, игнор)
  (state.transfers||[]).forEach(t=>{
    if(t.type==='arrival'){ const m=get(t.drone); if(m)m.intake+=t.qty||0; }
    else if(t.type==='exchange'){
      if(t.get){ const m=get(t.get); if(m)m.intake+=t.getQty||0; }
      if(t.give){ const m=get(t.give); if(m)m.exGive+=t.giveQty||0; }
    }
    else if(t.type==='loss'){ const m=get(t.drone); if(m)m.lossSum+=t.qty||1; }
    else if(t.type==='transfer'){
      // Внутреннее перемещение — игнор, кроме спецприёмников saveTransfer:
      // «списан» = фактическое выбытие (qty уменьшен без loss-записи), «не бг» — справочно
      const to=norm(t.to);
      if(to==='списан'){ const m=get(t.drone); if(m)m.writeoffT+=t.qty||0; }
      else if(to==='не бг'){ const m=get(t.drone); if(m)m.nbgT+=t.qty||0; }
    }
  });

  const summary=Object.values(models).map(m=>{
    const outflow=m.exGive+m.lossSum;
    return {
      model:m.model, intake:m.intake, onhand:m.onhandAll, lost:m.lost, outflow,
      writeoff_t:m.writeoffT, nbg_t:m.nbgT,
      diff_A:m.intake-(m.onhandAll+outflow),      // lost-строки = наличие
      diff_B:m.intake-(m.onhandActive+outflow),   // lost-строки = дубль loss-передач
      diff_adj:m.intake-(m.onhandAll+outflow+m.writeoffT) // как diff_A + списания через форму передачи
    };
  }).sort((a,b)=>a.model.localeCompare(b.model,'ru'));

  // Отрицательные количества — явные баги (расхождение учёта)
  const negatives=[];
  (state.stock||[]).forEach(d=>{ if((d.qty||0)<0)negatives.push({where:'склад ('+(d.status||'?')+')',model:d.name,qty:d.qty}); });
  (state.squads||[]).forEach(sq=>(sq.drones||[]).forEach(d=>{ if((d.qty||0)<0)negatives.push({where:'расчёт '+sq.pilot,model:d.name,qty:d.qty}); }));

  // Осиротевшие loss-записи — ключ pilot|drone|date, как в adminCleanOrphanLosses (только счёт)
  const lostFlightKeys=new Set(
    (state.flights||[]).filter(f=>f.returned==='no')
      .map(f=>norm(f.pilot)+'|'+norm(f.drone)+'|'+(f.date||''))
  );
  const orphans=(state.transfers||[]).filter(t=>
    t.type==='loss'&&!lostFlightKeys.has(norm(t.pilot)+'|'+norm(t.drone)+'|'+(t.date||''))
  ).length;

  // Дубли loss — ключ date|time|pilot|drone, как в adminDedupeLossTransfers (только счёт)
  const seen=new Set();
  let dupes=0;
  (state.transfers||[]).forEach(t=>{
    if(t.type!=='loss')return;
    const k=(t.date||'')+'|'+(t.time||'')+'|'+norm(t.pilot)+'|'+norm(t.drone);
    if(seen.has(k))dupes++; else seen.add(k);
  });

  return {summary, negatives, orphans, dupes};
}

// Отчёт аудита в консоль (модель учёта и ограничения — в комментарии выше)
function syncAuditStock(){
  const {summary, negatives, orphans, dupes}=_stockAuditCompute();
  console.table(summary);
  if(negatives.length){ console.log('[AUDIT] ⚠ Отрицательные количества ('+negatives.length+'):'); console.table(negatives); }
  else console.log('[AUDIT] Отрицательных количеств нет');
  console.log('[AUDIT] Осиротевших loss-записей (без вылета-потери): '+orphans);
  console.log('[AUDIT] Дублей loss-записей (date|time|pilot|drone): '+dupes);
  const okA=summary.filter(s=>s.diff_A===0).length;
  const okB=summary.filter(s=>s.diff_B===0).length;
  console.log('[AUDIT] Сходится моделей: гипотеза A (lost = наличие) — '+okA+' из '+summary.length+', гипотеза B (lost = дубль loss) — '+okB+' из '+summary.length);
  const off=summary.filter(s=>s.diff_A!==0&&s.diff_B!==0);
  if(off.length)console.log('[AUDIT] Расхождение по обеим гипотезам (легаси-приход до складского учёта либо баг): '+off.map(s=>s.model+' (A: '+s.diff_A+', B: '+s.diff_B+')').join('; '));
  // Классификация по diff_adj (учитывает списания через форму передачи в «списан»)
  const adjOk=summary.filter(s=>s.diff_adj===0);
  const legacy=summary.filter(s=>s.diff_adj<0&&s.intake===0);
  const manual=summary.filter(s=>s.diff_adj!==0&&!legacy.includes(s));
  console.log('[AUDIT] С учётом списаний через форму (diff_adj=0) сходится: '+adjOk.length+' из '+summary.length);
  if(legacy.length)console.log('[AUDIT] Легаси-приход (intake=0, поступили до складского учёта): '+legacy.map(s=>s.model+' ('+s.diff_adj+')').join('; '));
  if(manual.length)console.log('[AUDIT] ⚠ Требуют ручной проверки (расхождение при ненулевом приходе): '+manual.map(s=>s.model+' (adj: '+s.diff_adj+')').join('; '));
  return {summary, negatives, orphans, dupes};
}

// План фиксации легаси-остатка: сколько стартовых бортов по каждой модели не хватает
// в журнале операций (diff_adj < 0 → legacy = −diff_adj). Вызов: syncStockLegacyPlan().
// ПЛАНИРОВЩИК, НЕ ИСПОЛНИТЕЛЬ — только чтение и вывод: ничего не создаёт и не мутирует
// (никаких makeTransfer/arrival/saveLocal/sync). Записи пользователь вносит вручную
// через Администратор → Склад (adminAddStock сам создаст arrival-передачу, после
// чего diff_adj модели уйдёт в 0 при следующем syncAuditStock).
function syncStockLegacyPlan(){
  const {summary}=_stockAuditCompute();
  const plan=[], skipped=[];
  summary.forEach(s=>{
    if(s.diff_adj<0) plan.push({model:s.model, legacy_qty:-s.diff_adj});
    else if(s.diff_adj>0) skipped.push(s.model+' (+'+s.diff_adj+')');
  });
  if(plan.length){
    console.table(plan);
    const total=plan.reduce((a,p)=>a+p.legacy_qty,0);
    console.log('[PLAN] Итого: '+total+' легаси-бортов, моделей: '+plan.length);
    console.log('[PLAN] Для ручного ввода (Администратор → Склад, поступление):');
    console.log(plan.map(p=>p.model+' ×'+p.legacy_qty+' — статус bg, note: легаси/стартовый учёт').join('\n'));
  } else {
    console.log('[PLAN] Легаси-остатка нет — все модели сходятся');
  }
  if(skipped.length)console.log('[PLAN] Пропущены (diff_adj > 0 — положительного легаси не бывает, см. «ручную проверку» в syncAuditStock): '+skipped.join('; '));
  return plan;
}

// Оформление недостающего стартового прихода (легаси) явными arrival-записями в
// журнале движений — БЕЗ изменения наличия. Вызов: syncStockFixLegacy() — сухой
// прогон (план, ничего не создаёт); syncStockFixLegacy(true) — выполнить. Только admin.
//
// Смысл: legacy-борта физически есть и учтены в qty, но поступили до ведения журнала —
// arrival-записей нет, и intake не сходится с наличием (diff_adj<0 в syncAuditStock).
// Дописываем приход честными arrival-записями (ранняя дата '2000-01-01', как
// «начальные данные» migrateSquadsToTransfers, и говорящий note) — записи видны в
// журнале поступлений как обычные, никакой скрытой логики.
//
// ОТЛИЧИЕ ОТ adminAddStock: тот увеличивает stock.qty — здесь это НЕДОПУСТИМО
// (наличие верное, раздувать нельзя). Создаются ТОЛЬКО записи в state.transfers;
// stock/squads qty не трогаются ни при каком сценарии.
// Количества — только из живого расчёта _stockAuditCompute() на текущем state
// (никакого хардкода). Идемпотентность: модель, по которой легаси-arrival уже
// существует (note со «стартовый учёт (легаси)»), пропускается с предупреждением;
// плюс после успешного прогона diff_adj=0 и план сам становится пустым.
function syncStockFixLegacy(confirm){
  const role=state.role||authUser.role||'';
  if(role!=='admin'){alert('Доступно только администратору');return;}
  const LEGACY_NOTE='стартовый учёт (легаси), принято до ведения журнала';
  const LEGACY_DATE='2000-01-01';
  const norm=s=>(s||'').toLowerCase().trim();

  const {summary}=_stockAuditCompute();
  const plan=summary.filter(s=>s.diff_adj<0)
    .map(s=>({model:s.model, qty:-s.diff_adj, note:LEGACY_NOTE, date:LEGACY_DATE}));
  if(!plan.length){ console.log('[FIX] Легаси-расхождений нет (моделей с diff_adj < 0 не найдено) — делать нечего'); return []; }

  // Идемпотентность: повторный вызов не задваивает приход
  const already=new Set(
    (state.transfers||[]).filter(t=>t.type==='arrival'&&(t.note||'').includes('стартовый учёт (легаси)'))
      .map(t=>norm(t.drone))
  );
  const todo=plan.filter(p=>!already.has(norm(p.model)));
  const skippedDone=plan.filter(p=>already.has(norm(p.model)));
  if(skippedDone.length)console.warn('[FIX] ⚠ Пропущены — легаси-arrival уже существует, повтор не задваиваем (diff_adj у них всё ещё <0 — разбираться вручную): '+skippedDone.map(p=>p.model+' ('+p.qty+')').join(', '));
  if(!todo.length){ console.log('[FIX] Создавать нечего'); return []; }

  if(!confirm){
    // ФАЗА 1: сухой прогон — только показать план
    console.table(todo);
    console.log('[FIX] СУХОЙ ПРОГОН — ничего не создано. Это ЗАПИСЬ в журнал движений (arrival). Наличие (qty) НЕ изменится. Для выполнения вызови syncStockFixLegacy(true)');
    return todo;
  }

  // ФАЗА 2: одна arrival-запись на модель; только transfers — qty наличия не трогаем.
  // Синхронизация — как у arrival в adminAddStock, но без stock-части:
  // unshift + saveLocal + syncAddTransfer (штатная очередь).
  const created=[];
  todo.forEach(p=>{
    const op=makeTransfer('arrival',{date:LEGACY_DATE,time:'00:00',drone:p.model,qty:p.qty,note:LEGACY_NOTE});
    if(!state.transfers)state.transfers=[];
    state.transfers.unshift(op);
    created.push(op);
  });
  saveLocal();
  created.forEach(op=>syncAddTransfer(op));
  logAction('stock','legacy_fix','Оформлен стартовый приход (легаси), наличие не менялось: '+created.map(o=>o.drone+' ×'+o.qty).join(', '));
  console.log('[FIX] Создано arrival-записей: '+created.length+' (бортов: '+created.reduce((a,o)=>a+(o.qty||0),0)+'). Наличие (qty) не изменено. Проверка: syncAuditStock() — diff_adj по этим моделям должен стать 0');
  return created;
}

// ============ DASHBOARD ============
// ===== МЕДАЛИ ПИЛОТОВ (Обзор → Расчёты) =====
// Каталог: id → {icon, name, color}. Текст описания (desc) формируется
// динамически с конкретными цифрами в calcPilotMedals.
const MEDALS = {
  longshot:  {icon:'🚀', name:'Дальнобойщик', color:'#6366f1'},
  workhorse: {icon:'⚡', name:'Трудяга',      color:'#f59e0b'},
  sniper:    {icon:'🥇', name:'Снайпер',      color:'#eab308'},
  thrifty:   {icon:'🛡️', name:'Бережливый',   color:'#10b981'},
  streak:    {icon:'🔥', name:'На волне',     color:'#ef4444'},
  veteran:   {icon:'💎', name:'Ветеран',      color:'#06b6d4'},
  progress:  {icon:'📈', name:'Прогресс',     color:'#22c55e'},
  bestday:   {icon:'🌟', name:'Лучший день',  color:'#a855f7'},
  raid:      {icon:'🎯', name:'Дальний рейд', color:'#ec4899'},
};

// ISO-дата n дней назад от текущего момента
function medalIsoDaysAgo(n){ return localISO(new Date(Date.now()-n*864e5)); }
// 'YYYY-MM-DD' → 'DD.MM'
function medalFmtDate(iso){ const p=(iso||'').split('-'); return p.length===3?`${p[2]}.${p[1]}`:iso; }

// Определяет единственного победителя каждой сравнительной медали с учётом
// правил отрыва (общий движок nomRatioTop/nomPctTop/nomStreakTop из reports.js).
// Возвращает { medalId: {pilot, desc} } — только для медалей с победителем.
// Окно — последние 10 дней (кроме ветерана: за всё время).
function computeMedalWinners(){
  const flights = state.flights||[];
  const d10 = medalIsoDaysAgo(9);
  const f10 = flights.filter(f=>f.date>=d10);
  const pilots = [...new Set(
    state.squads.map(s=>s.pilot).concat(flights.map(f=>f.pilot)).filter(Boolean)
  )];
  const at = p => f10.filter(f=>f.pilot===p);
  const hasGeo = f10.some(f=>f.range_km!=null);
  const w = {};

  // 🚀 Дальнобойщик — рекорд дальности одного вылета (нужно гео)
  if(hasGeo){
    const c=pilots.map(p=>{ const far=at(p).filter(x=>x.range_km!=null).sort((a,b)=>b.range_km-a.range_km)[0]; return {pilot:p, value:far?far.range_km:null, _f:far}; });
    const r=nomRatioTop(c);
    if(r) w.longshot={pilot:r.pilot, desc:`Абсолютный рекорд дальности одного вылета среди всех пилотов: ${r.value} км${r._f&&r._f.date?` (${medalFmtDate(r._f.date)})`:''}.`};
  }
  // ⚡ Трудяга — больше всего вылетов за 10 дней
  {
    const c=pilots.map(p=>({pilot:p, value:at(p).length}));
    const r=nomRatioTop(c);
    if(r) w.workhorse={pilot:r.pilot, desc:`${r.value} вылетов за 10 дней — больше всех с явным отрывом.`};
  }
  // 🥇 Снайпер — наибольший % выполнения (мин. 5 вылетов; ужесточено с 3 — 10.06.2026)
  {
    const c=pilots.map(p=>{ const a=at(p); return {pilot:p, value:a.length>=5?a.filter(x=>x.result==='yes').length/a.length*100:null}; });
    const r=nomPctTop(c, true);
    if(r){ const a=at(r.pilot); const done=a.filter(x=>x.result==='yes').length; w.sniper={pilot:r.pilot, desc:`${Math.round(r.value)}% выполненных задач (${done} из ${a.length}) за 10 дней — лучший результат.`}; }
  }
  // 🛡️ Бережливый — наименьший % потерь (мин. 5 вылетов; ужесточено с 3 — 10.06.2026)
  {
    const c=pilots.map(p=>{ const a=at(p); return {pilot:p, value:a.length>=5?a.filter(x=>x.returned==='no').length/a.length*100:null}; });
    const r=nomPctTop(c, false);
    if(r){ const a=at(r.pilot); const lost=a.filter(x=>x.returned==='no').length; w.thrifty={pilot:r.pilot, desc:`Потерь всего ${Math.round(r.value)}% (${lost} из ${a.length}) за 10 дней — меньше всех.`}; }
  }
  // 💎 Ветеран — больше всего вылетов за всё время. Особое правило: лидер +
  // все, кто в пределах 10% от лидера (несколько носителей). w.veteran — карта
  // {пилот: desc} по всем носителям верхнего яруса.
  {
    const vals=pilots.map(p=>({pilot:p, value:flights.filter(f=>f.pilot===p).length})).filter(x=>x.value>0);
    if(vals.length){
      const max=Math.max(...vals.map(x=>x.value));
      const tier=vals.filter(x=>x.value>=max*0.9);   // лидер и все в пределах 10%
      w.veteran={};
      tier.forEach(x=>{
        w.veteran[x.pilot]=tier.length>1
          ? `Всего вылетов за всё время: ${x.value} — в числе лидеров подразделения.`
          : `Всего вылетов за всё время: ${x.value} — больше всех в подразделении.`;
      });
    }
  }
  // 📈 Прогресс — рост к прошлой неделе (мин. +3)
  {
    const thisW0=medalIsoDaysAgo(6), prevW0=medalIsoDaysAgo(13);
    const thisCnt=p=>flights.filter(f=>f.pilot===p && f.date>=thisW0).length;
    const prevCnt=p=>flights.filter(f=>f.pilot===p && f.date>=prevW0 && f.date<thisW0).length;
    const c=pilots.map(p=>{ const g=thisCnt(p)-prevCnt(p); return {pilot:p, value:g>=3?g:null}; });
    const r=nomRatioTop(c);
    if(r) w.progress={pilot:r.pilot, desc:`Рост к прошлой неделе: +${r.value} вылетов (было ${prevCnt(r.pilot)}, стало ${thisCnt(r.pilot)}) — лучшая динамика.`};
  }
  // 🌟 Лучший день — рекорд за один календарный день (мин. 2)
  {
    const dm=p=>{ const by={}; at(p).forEach(x=>{by[x.date]=(by[x.date]||0)+1;}); let b=0,d=null; for(const k in by){ if(by[k]>b){ b=by[k]; d=k; } } return {v:b, d}; };
    const c=pilots.map(p=>{ const x=dm(p); return {pilot:p, value:x.v>=2?x.v:null, _d:x.d}; });
    const r=nomRatioTop(c);
    if(r) w.bestday={pilot:r.pilot, desc:`Рекорд за один день: ${r.value} вылетов${r._d?` (${medalFmtDate(r._d)})`:''} — больше всех за 10 дней.`};
  }
  return w;
}

// Возвращает массив заработанных медалей пилота: [{id,icon,name,color,desc}].
// Три категории присуждения:
//  • Единственный носитель (правило 10%): 🚀 ⚡ 🥇 🛡️ 📈 🌟 — computeMedalWinners.
//  • Верхний ярус (лидер + все в пределах 10%): 💎 Ветеран.
//  • Абсолютное условие (несколько носителей): 🔥 серия ≥5, 🎯 вылет >20 км.
function calcPilotMedals(pilot){
  const flights = state.flights||[];
  const d10 = medalIsoDaysAgo(9);
  const w = computeMedalWinners();
  const out = [];
  const add = (id,desc)=>{ const m=MEDALS[id]; out.push({id, icon:m.icon, name:m.name, color:m.color, desc}); };

  // Единственный носитель — победитель совпал с пилотом
  ['longshot','workhorse','sniper','thrifty','progress','bestday'].forEach(id=>{
    if(w[id] && w[id].pilot===pilot) add(id, w[id].desc);
  });

  // 💎 Ветеран — верхний ярус (карта носителей)
  if(w.veteran && w.veteran[pilot]) add('veteran', w.veteran[pilot]);

  // 🔥 На волне — абсолютное: текущая серия без потерь ≥5 (каждому, кто выполнил)
  {
    const mine=flights.filter(f=>f.pilot===pilot).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
    let streak=0;
    for(const f of mine){ if(f.returned==='no') break; streak++; }
    if(streak>=5) add('streak', `Текущая серия без потерь: ${streak} вылетов подряд.`);
  }

  // 🎯 Дальний рейд — абсолютное: вылет >20 км за 10 дней (каждому, кто выполнил)
  const hasGeo=flights.some(f=>f.date>=d10 && f.range_km!=null);
  if(hasGeo){
    const far=flights.filter(f=>f.pilot===pilot && f.date>=d10 && f.range_km!=null && f.range_km>20).sort((a,b)=>b.range_km-a.range_km)[0];
    if(far) add('raid', `Дальний вылет на ${far.range_km} км${far.date?` (${medalFmtDate(far.date)})`:''} — свыше 20 км.`);
  }

  // Порядок отображения — как в каталоге MEDALS
  const order=Object.keys(MEDALS);
  out.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
  return out;
}

// Бейджи медалей для строки имени пилота. Заполняет window._pilotMedals для модалки.
function medalsHtml(pilot){
  const medals=calcPilotMedals(pilot);
  (window._pilotMedals||(window._pilotMedals={}))[pilot]=medals;
  if(!medals.length) return '';
  const pj=esc(pilot).replace(/'/g,"\\'");
  return `<span class="medal-row">`+medals.map((m,i)=>
    `<span class="medal-badge" style="background:${m.color}22;border-color:${m.color}77" title="${esc(m.name)}" onclick="event.stopPropagation();showMedalModal('${pj}',${i})">${m.icon}</span>`
  ).join('')+`</span>`;
}

// Модальное окно медали: большая иконка, название, описание с цифрами
function showMedalModal(pilot, idx){
  const m=((window._pilotMedals||{})[pilot]||[])[idx];
  if(!m) return;
  const ov=modalOverlay(`<div class="medal-modal">
    <div class="medal-modal-icon" style="filter:drop-shadow(0 2px 12px ${m.color}99)">${m.icon}</div>
    <div class="medal-modal-name" style="color:${m.color}">${esc(m.name)}</div>
    <div class="medal-modal-pilot">Пилот ${esc(pilot)}</div>
    <div class="medal-modal-desc">${esc(m.desc)}</div>
    <button class="btn btn-sm" id="medal-close">Закрыть</button>
  </div>`);
  ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); });
  ov.querySelector('#medal-close').onclick=()=>ov.remove();
}

// ===== АБСОЛЮТНЫЕ РЕКОРДЫ (золотые щиты) =====
// Отдельная система поверх медалей: рекорды ЗА ВСЁ ВРЕМЯ по правилу 1%.
// Не хранятся в localStorage — пересчитываются из state.flights при каждом renderDashboard().
const ABS_RECORDS = {
  longshot:  {icon:'🚀', name:'Дальнобойщик'},
  workhorse: {icon:'⚡', name:'Трудяга'},
  bestday:   {icon:'🌟', name:'Лучший день'},
  sniper:    {icon:'🥇', name:'Снайпер'},
  thrifty:   {icon:'🛡️', name:'Бережливый'},
  streak:    {icon:'🔥', name:'На волне'},
  veteran:   {icon:'💎', name:'Ветеран'},
};

// Победитель абсолютного рекорда по ПРАВИЛУ 1%.
// cands: [{pilot,value,...}] (value=null → пилот не участвует).
// higherBetter — больше значение = лучше. mode: 'ratio' (отрыв >1% относительно) | 'pct' (>1 п.п.).
// 0 или 1 активный пилот → щит присуждается всегда; приблизились в пределах 1% → щит исчезает.
function _absWinner(cands, higherBetter, mode){
  const c=cands.filter(x=>x.value!=null);
  if(!c.length) return null;
  c.sort((a,b)=> higherBetter ? b.value-a.value : a.value-b.value);
  const best=c[0];
  if(higherBetter && mode==='ratio' && !(best.value>0)) return null; // нулевой числовой максимум не награждаем
  if(c.length===1) return best;                                       // 0/1 активный — всегда
  const second=c[1];
  if(best.value===second.value) return null;                         // ничья
  const dominates = mode==='pct'
    ? Math.abs(best.value-second.value) > 1                          // >1 процентного пункта
    : (higherBetter ? best.value > second.value*1.01 : best.value < second.value*0.99); // >1% относительно
  return dominates ? best : null;
}

// Максимум вылетов за любую неделю (скользящее окно 7 дней) для набора вылетов
function maxFlightsInWeek(fs){
  const counts={}; fs.forEach(f=>{ if(f.date)counts[f.date]=(counts[f.date]||0)+1; });
  const uniq=Object.keys(counts);
  if(!uniq.length) return 0;
  const toMs=d=>new Date(d+'T00:00:00').getTime();
  let best=0;
  uniq.forEach(d0=>{
    const start=toMs(d0), end=start+6*864e5;
    let c=0;
    uniq.forEach(d=>{ const t=toMs(d); if(t>=start&&t<=end)c+=counts[d]; });
    if(c>best)best=c;
  });
  return best;
}

// Пересчитывает все абсолютные рекорды из state.flights.
// → { recordId: {pilot, desc} } (только для рекордов с действующим держателем).
function computeAbsoluteRecords(){
  const flights=state.flights||[];
  const pilots=[...new Set(state.squads.map(s=>s.pilot).concat(flights.map(f=>f.pilot)).filter(Boolean))];
  const at=p=>flights.filter(f=>f.pilot===p);
  const res={};

  // 🚀 Дальнобойщик — самый дальний одиночный вылет за всё время
  {
    const c=pilots.map(p=>{ const far=at(p).filter(x=>x.range_km!=null).sort((a,b)=>b.range_km-a.range_km)[0]; return {pilot:p, value:far?far.range_km:null, _f:far}; });
    const r=_absWinner(c,true,'ratio');
    if(r) res.longshot={pilot:r.pilot, desc:`Самый дальний одиночный вылет за всё время: ${r.value} км${r._f&&r._f.date?` (${medalFmtDate(r._f.date)})`:''}.`};
  }
  // ⚡ Трудяга — максимум вылетов за любую одну неделю за всё время
  {
    const c=pilots.map(p=>{ const v=maxFlightsInWeek(at(p)); return {pilot:p, value:v||null}; });
    const r=_absWinner(c,true,'ratio');
    if(r) res.workhorse={pilot:r.pilot, desc:`Максимум вылетов за одну неделю: ${r.value}.`};
  }
  // 🌟 Лучший день — максимум вылетов за один календарный день за всё время
  {
    const dayMax=fs=>{ const by={}; fs.forEach(x=>{by[x.date]=(by[x.date]||0)+1;}); let b=0,d=null; for(const k in by)if(by[k]>b){b=by[k];d=k;} return {v:b,d}; };
    const c=pilots.map(p=>{ const x=dayMax(at(p)); return {pilot:p, value:x.v||null, _d:x.d}; });
    const r=_absWinner(c,true,'ratio');
    if(r) res.bestday={pilot:r.pilot, desc:`Максимум вылетов за один день: ${r.value}${r._d?` (${medalFmtDate(r._d)})`:''}.`};
  }
  // 🥇 Снайпер — лучший % выполнения за всё время, мин. 20 вылетов
  {
    const c=pilots.map(p=>{ const a=at(p); return {pilot:p, value:a.length>=20?a.filter(x=>x.result==='yes').length/a.length*100:null}; });
    const r=_absWinner(c,true,'pct');
    if(r){ const a=at(r.pilot); const done=a.filter(x=>x.result==='yes').length; res.sniper={pilot:r.pilot, desc:`Лучший % выполнения за всё время: ${Math.round(r.value)}% (${done} из ${a.length}).`}; }
  }
  // 🛡️ Бережливый — минимальный % потерь за всё время, мин. 20 вылетов
  {
    const c=pilots.map(p=>{ const a=at(p); return {pilot:p, value:a.length>=20?a.filter(x=>x.returned==='no').length/a.length*100:null}; });
    const r=_absWinner(c,false,'pct');
    if(r){ const a=at(r.pilot); const lost=a.filter(x=>x.returned==='no').length; res.thrifty={pilot:r.pilot, desc:`Минимальный % потерь за всё время: ${Math.round(r.value)}% (${lost} из ${a.length}).`}; }
  }
  // 🔥 На волне — самая длинная серия вылетов без потерь за всё время (мин. 5).
  // Считаем хронологически: returned==='no' обнуляет серию, остальные продолжают.
  {
    const c=pilots.map(p=>{
      const fs=at(p).slice().sort((a,b)=>((a.date||'')+(a.time||'')).localeCompare((b.date||'')+(b.time||'')));
      let cur=0, best=0;
      fs.forEach(f=>{ if(f.returned==='no'){ cur=0; } else { cur++; if(cur>best) best=cur; } });
      return {pilot:p, value:best>=5?best:null};
    });
    const r=_absWinner(c,true,'ratio');
    if(r) res.streak={pilot:r.pilot, desc:`Самая длинная серия вылетов без потерь за всё время: ${r.value} подряд.`};
  }
  // 💎 Ветеран — наибольшее общее число вылетов за всё время
  {
    const c=pilots.map(p=>({pilot:p, value:at(p).length||null}));
    const r=_absWinner(c,true,'ratio');
    if(r) res.veteran={pilot:r.pilot, desc:`Наибольшее общее число вылетов за всё время: ${r.value}.`};
  }
  return res;
}

// Текущая карта рекордов. Кэш `window._absRecords` обновляется в renderDashboard
// (по разу на рендер) — здесь переиспользуем его, чтобы не пересчитывать на каждый щит.
function getAbsRecords(){ return window._absRecords || (window._absRecords=computeAbsoluteRecords()); }

// Список золотых щитов пилота: [{id,icon,name,desc}] в порядке каталога
function pilotGoldShields(pilot){
  const recs=getAbsRecords();
  return Object.keys(ABS_RECORDS).filter(id=>recs[id]&&recs[id].pilot===pilot)
    .map(id=>({id, icon:ABS_RECORDS[id].icon, name:ABS_RECORDS[id].name, desc:recs[id].desc}));
}

// HTML золотых щитов пилота. opts.inline — компактный вариант (под высоту заглавных букв имени).
function goldShieldsHtml(pilot, opts){
  opts=opts||{};
  const recs=pilotGoldShields(pilot);
  if(!recs.length) return '';
  const pj=esc(pilot).replace(/'/g,"\\'");
  const inner=recs.map(r=>
    `<span class="gold-shield" title="${esc(r.name)} — абсолютный рекорд" onclick="event.stopPropagation();showAbsRecordModal('${pj}','${r.id}')"><span class="gs-emoji">${r.icon}</span></span>`
  ).join('');
  return `<span class="gold-row${opts.inline?' gold-inline':''}">${inner}</span>`;
}

// Модалка золотого щита
function showAbsRecordModal(pilot, id){
  const recs=window._absRecords||computeAbsoluteRecords();
  const r=recs[id], c=ABS_RECORDS[id];
  if(!r||!c) return;
  const ov=modalOverlay(`<div class="medal-modal abs-modal">
    <div class="abs-modal-shield"><span class="gold-shield" style="font-size:46px"><span class="gs-emoji">${c.icon}</span></span></div>
    <div class="medal-modal-name" style="color:#D99A00">${esc(c.name)}</div>
    <div class="medal-modal-pilot">Абсолютный рекорд · Пилот ${esc(pilot)}</div>
    <div class="medal-modal-desc">${esc(r.desc)}</div>
    <button class="btn btn-sm" id="abs-close">Закрыть</button>
  </div>`);
  ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); });
  ov.querySelector('#abs-close').onclick=()=>ov.remove();
}

function renderDashboard(){
  window._absRecords=computeAbsoluteRecords(); // пересчёт абсолютных рекордов при каждом рендере
  const now=new Date();
  const today=localISO(now);
  const yest=localISO(new Date(now-864e5));
  const weekAgo=localISO(new Date(now-7*864e5));
  const monthStart=localISO(new Date(now.getFullYear(),now.getMonth(),1));

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
      `<div class="stat-row"><span>${esc(n)}</span><span style="${q<0?'color:var(--color-text-danger)':''}">${q}</span></div>`
    ).join('');

  document.getElementById('st-stock').textContent=totalStock;
  document.getElementById('st-stock-detail').innerHTML=
    Object.entries(stockByName).length
      ? Object.entries(stockByName).sort((a,b)=>b[1]-a[1]).map(([n,q])=>
          `<div class="stat-row"><span>${esc(n)}</span><span>${q}</span></div>`
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
    // Рядом с именем — только золотые щиты (под высоту заглавных букв);
    // внизу карточки — только обычные медали (10 дней), щиты уже показаны у имени
    const goldName=goldShieldsHtml(sq.pilot,{inline:true});
    const medalsBottom=medalsHtml(sq.pilot);
    const achRow=medalsBottom?`<div class="crew-achievements">${medalsBottom}</div>`:'';
    return `<div class="crew-item">
      <div class="crew-header">
        <div>
          <div class="crew-name">Пилот ${esc(sq.pilot)}${goldName}</div>
          <div class="crew-sub">Последний вылет: ${lastFlight?lastFlight.date+' '+lastFlight.time:'нет данных'}</div>
        </div>
        <div class="crew-flights">${sqFlightsToday.length?sqFlightsToday.length+' сегодня':'нет вылетов'}</div>
      </div>
      <div class="crew-tags">
        ${drones.map(d=>`<div class="crew-tag">${esc(d.name)} × ${d.qty}</div>`).join('')}
        ${drones.length===0?'<div class="crew-tag" style="color:var(--color-text-secondary)">нет дронов</div>':''}
      </div>
      <div style="font-size:11px;color:var(--color-text-secondary);margin-top:6px">За неделю: ${sqFlightsWeek.length} вылетов${sqLossWeek?` · <span style="color:var(--color-text-danger)">потери: ${sqLossWeek}</span>`:''}</div>
      ${achRow}
    </div>`;
  }).join('')||'<div style="color:var(--color-text-secondary);padding:12px 16px">Нет расчётов</div>';

  // --- Вылеты сегодня / вчера ---
  const sortDesc=(a,b)=>(b.date+b.time).localeCompare(a.date+a.time);
  const todayFlights=[...fAll].filter(x=>x.date===today).sort(sortDesc);
  const yesterdayFlights=[...fAll].filter(x=>x.date===yest).sort(sortDesc);

  const flightRow=x=>`
    <div class="flight-item">
      <div class="flight-time">${esc(x.time)}</div>
      <div class="flight-pilot">${esc(x.pilot)}</div>
      <div class="flight-status ${x.returned==='no'?'s-loss':'s-ok'}">${x.returned==='no'?'потеря':'вылет'}</div>
      <div class="flight-drone">${esc(x.drone||'—')}</div>
      <div class="flight-target"><i class="ti ti-map-pin"></i> ${esc(x.target||'—')}${x.returned==='no'?' · <span style="font-size:11px;color:var(--color-text-danger)">борт потерян</span>':''}</div>
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
    `<div class="stock-row"><div class="stock-name">${esc(d.name)}</div><div class="stock-count">${d.qty}</div></div>`
  ).join(''):'<div style="color:var(--color-text-secondary);padding:12px 16px">Пусто</div>';
  document.getElementById('stockListNBG').innerHTML=nbg.length?nbg.map(d=>
    `<div class="offstock-row"><div class="offstock-name">${esc(d.name)}</div><div style="display:flex;align-items:center;gap:8px"><div class="${d.status==='loss'?'badge-danger':'badge-warn'}">${d.status==='loss'?'списан':'не БГ'}</div><div class="offstock-count">${d.qty}</div></div></div>`
  ).join(''):'<div style="color:var(--color-text-secondary);padding:12px 16px">Нет</div>';

  document.getElementById('squadTable').innerHTML=state.squads.map(sq=>{
    const drones=sq.drones.filter(d=>d.qty!==0);
    const abbr=sq.pilot.slice(0,2).toUpperCase();
    return `<div class="crew-header-row">
        <div class="crew-abbr">${esc(abbr)}</div>
        <div class="crew-pname">Пилот ${esc(sq.pilot)}</div>
        <div class="crew-status-badge">БГ</div>
      </div>
      ${drones.map((d,i)=>`<div class="drone-subrow">
        <div class="drone-label">${i===0?'БПЛА':''}</div>
        <div class="drone-name" style="${d.qty<0?'color:var(--color-text-danger)':''}">${esc(d.name)}${d.qty<0?' ⚠':''}</div>
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
  if(!guardWrite())return;
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
  document.getElementById('exOneWay').checked=false;
  const giveRadio=document.querySelector('input[name="exDir"][value="give"]');
  if(giveRadio)giveRadio.checked=true;
  exToggleOneWay();
}

// Переключение режима обмен / односторонняя передача
function exToggleOneWay(){
  const oneWay=document.getElementById('exOneWay').checked;
  const dir=(document.querySelector('input[name="exDir"]:checked')||{}).value||'give';
  document.getElementById('exDirRow').style.display=oneWay?'block':'none';
  document.getElementById('exArrow').style.display=oneWay?'none':'';
  // В обычном обмене показаны оба блока; в односторонней — только по направлению
  document.getElementById('exGiveBlock').style.display=(!oneWay||dir==='give')?'':'none';
  document.getElementById('exGetBlock').style.display=(!oneWay||dir==='get')?'':'none';
}

function saveTransfer(){
  if(!guardWrite())return;
  const from=document.getElementById('transFrom').value;
  const to=document.getElementById('transTo').value;
  const drone=document.getElementById('transDrone').value.trim();
  const qty=parseInt(document.getElementById('transQty').value)||1;
  const note=document.getElementById('transNote').value.trim();
  if(!drone){alert('Укажите БПЛА');return;}
  if(from===to){alert('Отправитель и получатель совпадают');return;}

  // Спецприёмники: перевод в Не БГ или списание (всегда со склада)
  if(to==='не бг'||to==='списан'){
    const role=state.role||authUser.role||'';
    if(!(role==='admin'||role==='cmd'||role==='tech')){alert('Недостаточно прав');return;}
    const bg=state.stock.find(d=>d.name.toLowerCase()===drone.toLowerCase()&&d.status==='bg');
    if(!bg||bg.qty<qty){
      if(!confirm(`На складе недостаточно боеготовых "${drone}". Всё равно оформить?`))return;
    }
    if(to==='не бг'){
      // bg -= qty
      if(bg){bg.qty-=qty;if(bg.qty===0)state.stock=state.stock.filter(d=>d!==bg);}
      else{state.stock.push({name:drone,qty:-qty,status:'bg'});}
      // nbg += qty
      const nbg=state.stock.find(d=>d.name.toLowerCase()===drone.toLowerCase()&&d.status==='nbg');
      if(nbg){nbg.qty+=qty;}
      else{state.stock.push({name:drone,qty,status:'nbg'});}
    } else { // списан: уменьшить qty, при 0 запись оставить
      if(bg){bg.qty=Math.max(0,bg.qty-qty);}
      else{state.stock.push({name:drone,qty:0,status:'bg'});}
    }
    if(!state.transfers)state.transfers=[];
    const op=makeTransfer('transfer',{from:'склад',to,drone,qty,note});
    state.transfers.unshift(op);
    syncBumpStockVersion();
    saveLocal();
    syncAddTransfer(op);
    syncPushStockSquads();
    renderInventory();
    renderDashboard();
    document.getElementById('transferCard').style.display='none';
    document.getElementById('transDrone').value='';
    document.getElementById('transNote').value='';
    logAction('transfer','add','склад → '+to+': '+drone+' ×'+qty);
    return;
  }

  // Списать у отправителя
  if(from==='не бг'){
    // Возврат из ремонта: списываем из не боеготовых
    const role=state.role||authUser.role||'';
    if(!(role==='admin'||role==='cmd'||role==='tech')){alert('Недостаточно прав');return;}
    const nbg=state.stock.find(d=>d.name.toLowerCase()===drone.toLowerCase()&&d.status==='nbg');
    if(!nbg||nbg.qty<qty){
      if(!confirm(`Не боеготовых "${drone}" недостаточно. Всё равно оформить?`))return;
      if(nbg){nbg.qty-=qty;}
      else{state.stock.push({name:drone,qty:-qty,status:'nbg'});}
    } else {
      nbg.qty-=qty;
      if(nbg.qty===0)state.stock=state.stock.filter(d=>d!==nbg);
    }
  } else if(from==='склад'){
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
  if(!guardWrite())return;
  const date=document.getElementById('exDate').value||todayISO();
  const unit=document.getElementById('exUnit').value.trim();
  const note=document.getElementById('exNote').value.trim();
  const oneWay=document.getElementById('exOneWay').checked;
  const dir=(document.querySelector('input[name="exDir"]:checked')||{}).value||'give';
  let give='',giveQty=0,get='',getQty=0;
  if(!oneWay||dir==='give'){
    give=document.getElementById('exGive').value.trim();
    giveQty=parseInt(document.getElementById('exGiveQty').value)||1;
  }
  if(!oneWay||dir==='get'){
    get=document.getElementById('exGet').value.trim();
    getQty=parseInt(document.getElementById('exGetQty').value)||1;
  }
  if(!unit){alert('Укажите подразделение');return;}
  if(oneWay){
    if(dir==='give'&&!give){alert('Укажите отданный борт');return;}
    if(dir==='get'&&!get){alert('Укажите полученный борт');return;}
  } else if(!give||!get){
    alert('Заполните отданный и полученный борт');return;
  }

  // Списать отданный борт со склада
  if(give){
    const giveItem=state.stock.find(d=>d.name.toLowerCase()===give.toLowerCase()&&d.status==='bg');
    if(giveItem){
      giveItem.qty=Math.max(0,giveItem.qty-giveQty);
      if(giveItem.qty===0)state.stock=state.stock.filter(d=>d!==giveItem);
    } else {
      if(!confirm(`"${give}" не найден на складе. Всё равно оформить?`))return;
    }
  }

  // Оприходовать полученный борт на склад
  if(get){
    const getItem=state.stock.find(d=>d.name.toLowerCase()===get.toLowerCase()&&d.status==='bg');
    if(getItem){getItem.qty+=getQty;}
    else{state.stock.push({name:get,qty:getQty,status:'bg'});}
  }

  // Записать в историю
  if(!state.transfers)state.transfers=[];
  const exOp=makeTransfer('exchange',{date,unit,give,giveQty,get,getQty,note});
  state.transfers.unshift(exOp);
  saveLocal();
  syncAddTransfer(exOp);
  syncPushStockSquads();
  logAction('transfer','exchange','Обмен с '+unit+': '+[give?('отдали '+give+' ×'+giveQty):'',get?('получили '+get+' ×'+getQty):''].filter(Boolean).join(', '));
  renderInventory();
  renderDashboard();
  document.getElementById('exchangeCard').style.display='none';
  ['exUnit','exGive','exGet','exNote'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('exGiveQty').value='1';
  document.getElementById('exGetQty').value='1';
  document.getElementById('exOneWay').checked=false;
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
        <div class="change-detail"><span>${esc(op.drone)}</span> · пилот: ${esc(op.pilot)}</div>
        <div class="change-time">${esc(op.date)} ${esc(op.time||'')}</div>
      </div>`;
    } else if(op.type==='arrival'){
      return `<div class="change-row">
        <div class="change-badge-in">Поступление</div>
        <div class="change-detail"><span>${esc(op.drone)} × ${op.qty}</span>${op.note?` · ${esc(op.note)}`:''}</div>
        <div class="change-time">${esc(op.date)} ${esc(op.time||'')}</div>
      </div>`;
    } else if(op.type==='exchange'){
      let exDetail;
      if(op.give&&op.get){
        exDetail=`отдали: ${esc(op.give)} × ${op.giveQty} → получили: ${esc(op.get)} × ${op.getQty}`;
      } else if(op.give){
        exDetail=`отдали: ${esc(op.give)} × ${op.giveQty}`;
      } else {
        exDetail=`получили: ${esc(op.get)} × ${op.getQty}`;
      }
      return `<div class="change-row">
        <div class="badge-warn">${op.give&&op.get?'Обмен':'Передача'}</div>
        <div class="change-detail"><span>${esc(op.unit)}</span> · ${exDetail}${op.note?` · ${esc(op.note)}`:''}</div>
        <div class="change-time">${esc(op.date)} ${esc(op.time||'')}</div>
      </div>`;
    } else {
      return `<div class="change-row">
        <div class="change-badge-in">Передача</div>
        <div class="change-detail">${esc(op.from)} → ${esc(op.to)} · <span>${esc(op.drone)} × ${op.qty}</span>${op.note?` · ${esc(op.note)}`:''}</div>
        <div class="change-time">${esc(op.date)} ${esc(op.time||'')}</div>
      </div>`;
    }
  }).join('');
}

// ============ FLIGHTS ============
function renderFlights(){
  const fp=document.getElementById('filterPilot').value;
  const from=document.getElementById('filterFrom').value;
  const to=document.getElementById('filterTo').value;
  let f=[...state.flights];
  if(fp)f=f.filter(x=>x.pilot&&x.pilot.includes(fp));
  if(from)f=f.filter(x=>x.date>=from);
  if(to)f=f.filter(x=>x.date<=to);
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
        <th style="width:34px">#</th>
        <th style="width:80px">Пилот</th>
        <th style="width:120px">Точка</th>
        <th style="width:90px">Боеприпас</th>
        <th style="white-space:nowrap">БПЛА</th>
        <th style="width:90px">Задача</th>
        <th style="width:75px">Борт</th>
        <th style="width:60px">Дальн</th>
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
            <td style="white-space:nowrap">${esc(x.date||'—')}</td>
            <td style="white-space:nowrap;color:var(--muted)">${esc(x.time||'—')}</td>
            <td style="text-align:center;color:var(--muted);font-size:10px;white-space:nowrap">${num?'#'+num:''}</td>
            <td style="font-weight:700;color:var(--green);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.pilot||'—')}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.target||'—')}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.ammo||'—')}</td>
            <td style="white-space:nowrap;padding-right:14px">${esc(x.drone||'—')}</td>
            <td><span class="tag ${x.result==='yes'?'tag-ok':'tag-danger'}" style="font-size:10px">${x.result==='yes'?'✅ выполнена':'❌ нет'}</span></td>
            <td><span class="tag ${x.returned==='yes'?'tag-info':'tag-danger'}" style="font-size:10px">${x.returned==='yes'?'вернул':'потерян'}</span></td>
            <td style="white-space:nowrap;color:var(--muted)">${x.range_km!=null?x.range_km+' км':''}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10px">${esc(x.note||'')}</td>
            <td style="padding:2px 4px;width:36px"><button class="copy-flight-btn" data-copy="${esc(copyStr).replace(/\n/g,' ')}" style="background:rgba(57,255,20,0.06);border:1px solid #22c55e;color:var(--green);cursor:pointer;font-size:16px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit" title="Копировать">⎘</button></td>
          </tr>${editRow?`<tr><td colspan="12" style="padding:0;border:none">${editRow}</td></tr>`:''}`
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
  const opts=sorted.map(v=>`<option value="${esc(v)}">`).join('');
  document.querySelectorAll('datalist[id^="dl-drones"]').forEach(dl=>dl.innerHTML=opts);

  // Пилоты
  const pilots=[...new Set(state.flights.map(x=>x.pilot).filter(Boolean))].sort();
  const pilotOpts=pilots.map(v=>`<option value="${esc(v)}">`).join('');
  const dlp=document.getElementById('dl-pilots');if(dlp)dlp.innerHTML=pilotOpts;

  // Боеприпасы
  const ammos=[...new Set(state.flights.map(x=>x.ammo).filter(Boolean))].sort();
  const ammoOpts=ammos.map(v=>`<option value="${esc(v)}">`).join('');
  const dla=document.getElementById('dl-ammo');if(dla)dla.innerHTML=ammoOpts;

  // Точки
  const targets=[...new Set(state.flights.map(x=>x.target).filter(Boolean))].sort();
  const tgtOpts=targets.map(v=>`<option value="${esc(v)}">`).join('');
  const dlt=document.getElementById('dl-targets');if(dlt)dlt.innerHTML=tgtOpts;

  // Обновляем селекты передачи пилотами из расчётов
  const pilotNames=state.squads.map(sq=>sq.pilot);
  const fromSel=document.getElementById('transFrom');
  const toSel=document.getElementById('transTo');
  const _r=state.role||authUser.role||'';
  const _canStatus=(_r==='admin'||_r==='cmd'||_r==='tech');
  if(fromSel){
    fromSel.innerHTML='<option value="склад">Склад</option>'+pilotNames.map(p=>`<option value="${esc(p)}">Пилот ${esc(p)}</option>`).join('')+(_canStatus?'<option value="не бг">Не БГ (из ремонта)</option>':'');
  }
  if(toSel){
    toSel.innerHTML='<option value="склад">На склад</option>'+pilotNames.map(p=>`<option value="${esc(p)}">Пилот ${esc(p)}</option>`).join('')+(_canStatus?'<option value="не бг">Не БГ (не боеготов)</option><option value="списан">Списан</option>':'');
  }
  rebuildRoleSelector();
  // Обновляем фильтр пилотов в журнале
  const fp=document.getElementById('filterPilot');
  if(fp){
    const cur=fp.value;
    const pilots=[...new Set(state.flights.map(x=>x.pilot).filter(Boolean))].sort();
    fp.innerHTML='<option value="">Все пилоты</option>'+pilots.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');
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
        <input style="flex:1;font-weight:600" value="${esc(sq.pilot)}" onchange="squadEditPilot(${si},this.value)" placeholder="Имя пилота">
        <button class="btn btn-sm btn-primary" onclick="squadCleanZeros(${si})">Удалить нули</button>
        <button class="btn btn-danger btn-sm" onclick="squadDeletePilot(${si})">Удалить расчёт</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
        <label style="margin:0;white-space:nowrap;text-transform:none;letter-spacing:normal;font-size:11px;color:var(--muted)">Точка старта:</label>
        <input style="flex:1;min-width:120px" value="${esc(sq.start_point||'')}" placeholder="напр. 45 вишня" onchange="squadEditStartPoint(${si},this.value)" autocomplete="off">
        <button id="geo-rc-btn-inv-${si}" class="btn btn-sm" style="font-size:10px;display:${geoStartBtnShow(sq)?'':'none'}" onclick="geoRecalcPilotMissing(${si},'geo-rc-prog-inv-${si}','geo-rc-btn-inv-${si}')">Пересчитать вылеты без дистанций</button>
        <span id="geo-rc-prog-inv-${si}" style="font-size:10px;color:var(--muted)"></span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600">БПЛА расчёта:</div>
      ${sq.drones.map((d,di)=>`
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px${d.qty===0?';opacity:0.5':''}">
          <input style="flex:1" list="dl-drones-smart" value="${esc(d.name)}" onchange="squadEditDrone(${si},${di},'name',this.value)" autocomplete="off">
          <input type="number" style="width:60px${d.qty===0?';color:var(--red)':''}" min="0" value="${d.qty}" onchange="squadEditDrone(${si},${di},'qty',parseInt(this.value)||0)">
          <button class="btn btn-sm" style="color:var(--red)" onclick="squadDeleteDrone(${si},${di})">✕</button>
        </div>`).join('')}
      <button class="btn btn-sm btn-primary" style="font-size:11px;padding:3px 10px" onclick="squadAddDrone(${si})">+ БПЛА</button>
    </div>`).join('');
}

function squadCleanZeros(si){
  if(!guardWrite())return;
  state.squads[si].drones=state.squads[si].drones.filter(d=>d.qty!==0);
  saveLocal();
  syncPushStockSquads();
  renderSquadEditor();
  renderInventory();
}
function squadEditPilot(si,val){
  if(!guardWrite())return;
  const old=state.squads[si].pilot;
  state.squads[si].pilot=val;
  if(old!==val)logAction('squad','edit','Переименован пилот '+old+' → '+val);
  saveLocal();syncBumpStockVersion();syncPushStockSquads();renderInventory();
}
// Сколько вылетов пилота без посчитанной дистанции
function geoPilotMissingCount(pilot){
  const lo=(pilot||'').toLowerCase();
  return (state.flights||[]).filter(f=>(f.pilot||'').toLowerCase()===lo && (f.range_km==null||f.distance_km==null)).length;
}
// Показывать ли кнопку пересчёта: есть точка старта И есть вылеты без дистанций
function geoStartBtnShow(sq){ return !!(sq && sq.start_point && geoPilotMissingCount(sq.pilot)>0); }
// Обновить видимость кнопок пересчёта расчёта (обе карточки)
function geoUpdateRecalcBtn(si){
  const sq=state.squads[si];
  const show=geoStartBtnShow(sq);
  ['geo-rc-btn-adm-'+si,'geo-rc-btn-inv-'+si].forEach(id=>{
    const b=document.getElementById(id);
    if(b) b.style.display=show?'':'none';
  });
}

function squadEditStartPoint(si,val){
  if(!guardWrite())return;
  const sq=state.squads[si];
  if(!sq)return;
  sq.start_point=(val||'').trim();
  saveLocal();
  syncPushStockSquads();        // start_point синхронизируется как обычные данные squads
  // Старые вылеты НЕ пересчитываются — новая точка применяется только к новым вылетам.
  // Для существующих есть кнопка «Пересчитать вылеты без дистанций».
  geoUpdateRecalcBtn(si);
}

// Пересчёт вылетов конкретного пилота без дистанций (force=false), прогресс inline
function geoRecalcPilotMissing(si, progId, btnId){
  const sq=state.squads[si];
  if(!sq) return;
  const prog=progId?document.getElementById(progId):null;
  const btn=btnId?document.getElementById(btnId):null;
  if(!sq.start_point){ if(prog) prog.textContent=' — нет точки старта'; return; }
  // Уже всё посчитано — нечего делать
  if(geoPilotMissingCount(sq.pilot)===0){
    if(prog) prog.textContent=' Все вылеты уже имеют дистанции';
    if(btn) btn.style.display='none';
    return;
  }
  geoRecomputeFlights({
    force:false, pilot:sq.pilot,
    onProgress:(done,tot)=>{ if(prog) prog.textContent=' Пересчёт: '+done+'/'+tot+'...'; },
    onDone:(changed)=>{
      const left=geoPilotMissingCount(sq.pilot);
      if(left===0){
        if(prog) prog.textContent=' ✓ Все вылеты посчитаны';
        if(btn) btn.style.display='none';
      } else {
        // часть не удалось посчитать (нет точки в гео) — кнопку оставляем
        if(prog) prog.textContent=' ✓ Пересчитано: '+changed+', без координат: '+left;
      }
      if(document.getElementById('page-report')?.classList.contains('active')) buildReport();
    }
  });
}

// Общий пересчёт всех пилотов без дистанций (из вкладки Карта/Гео)
function geoRecalcAllMissing(){
  geoRecomputeFlights({
    force:false,
    onProgress:(done,tot)=>setStatus('geo-status', tot?'Пересчёт: '+done+'/'+tot+'...':'Нет вылетов без дистанций','muted'),
    onDone:(changed)=>{
      setStatus('geo-status','✓ Пересчитано вылетов: '+changed,'ok');
      renderFlights();
      if(document.getElementById('page-report')?.classList.contains('active')) buildReport();
    }
  });
}

// Пересчёт всех НЕзаблокированных вылетов (зафиксированные 🔒 не трогаются)
function geoRecalcAllForce(){
  geoRecomputeFlights({
    force:true, includeLocked:false,
    onProgress:(done,tot)=>setStatus('geo-status', tot?'Пересчёт: '+done+'/'+tot+'...':'Нет незаблокированных вылетов','muted'),
    onDone:(changed)=>{
      setStatus('geo-status','✓ Пересчитано незаблокированных: '+changed,'ok');
      renderFlights(); renderAdminFlights();
      if(document.getElementById('page-report')?.classList.contains('active')) buildReport();
    }
  });
}

// Сбросить ВСЕ блокировки и пересчитать всё (перезапись зафиксированных) — двойное подтверждение
function geoRecalcAllResetLocks(){
  if(!confirm('Сбросить блокировки и пересчитать ВСЕ вылеты? Зафиксированные (🔒) дистанции будут перезаписаны.')) return;
  if(!confirm('Точно перезаписать даже вручную зафиксированные дистанции? Действие необратимо.')) return;
  (state.flights||[]).forEach(f=>{ delete f.geo_locked; });
  geoRecomputeFlights({
    force:true, includeLocked:true,
    onProgress:(done,tot)=>setStatus('geo-status', tot?'Пересчёт: '+done+'/'+tot+'...':'Нет вылетов','muted'),
    onDone:(changed)=>{
      setStatus('geo-status','✓ Блокировки сброшены, пересчитано: '+changed,'ok');
      renderFlights(); renderAdminFlights();
      if(document.getElementById('page-report')?.classList.contains('active')) buildReport();
    }
  });
}
function squadEditDrone(si,di,field,val){
  if(!guardWrite())return;
  const sq=state.squads[si];const d=sq&&sq.drones[di];
  if(d){
    const old=d[field];
    if(field==='qty'){const delta=(parseInt(val,10)||0)-d.qty;if(delta&&d.name)_logAdminTransfer(sq.pilot,d.name,delta,'инв');}
    else if(field==='name'&&val&&!d.name&&d.qty>0)_logAdminTransfer(sq.pilot,val,d.qty,'инв');
    d[field]=val;
    if(old!==val)logAction('squad','edit','Расчёт '+(sq.pilot||'')+': '+(field==='name'?('борт '+(old||'(новый)')+' → '+val):('борт '+(d.name||'?')+' — кол-во '+old+' → '+val)));
  }
  saveLocal();syncPushStockSquads();renderInventory(); // версионируем — иначе поллинг затрёт правку (last-write-wins по _sv)
}
function squadDeleteDrone(si,di){
  if(!guardWrite())return;
  const sq=state.squads[si];const d=sq&&sq.drones[di];
  if(d&&d.name)logAction('squad','edit','Расчёт '+(sq.pilot||'')+': удалён борт '+d.name+' ×'+d.qty);
  state.squads[si].drones.splice(di,1);
  saveLocal();syncPushStockSquads();renderSquadEditor();renderInventory();
}
function squadAddDrone(si){
  if(!guardWrite())return;
  state.squads[si].drones.push({name:'',qty:1});
  saveLocal();syncPushStockSquads();renderSquadEditor();
}
function squadDeletePilot(si){
  if(!guardWrite())return;
  if(!confirm('Удалить расчёт '+state.squads[si].pilot+'?'))return;
  const pName=state.squads[si].pilot;
  state.squads.splice(si,1);
  logAction('squad','delete','Удалён расчёт '+pName);
  saveLocal();syncPushStockSquads();renderSquadEditor();renderInventory();rebuildRoleSelector();
}
function squadAddPilot(){
  if(!guardWrite())return;
  const p=document.getElementById('sq-newPilot').value.trim();
  const ds=document.getElementById('sq-newDrones').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!p){alert('Укажите имя пилота');return;}
  state.squads.push({pilot:p,drones:ds.map(n=>({name:n,qty:1}))});
  ds.forEach(n=>_logAdminTransfer(p,n,1,'инв: новый расчёт'));
  logAction('squad','add','Создан расчёт '+p+(ds.length?' ('+ds.join(', ')+')':''));
  saveLocal();
  syncPushStockSquads();
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

// Заставка (#splashScreen, index.html) показана с первой отрисовки страницы;
// прячется при любом исходе initAuth — вместе со снятием скрытия .app либо
// при показе экрана входа.
function hideSplash(){
  const sp=document.getElementById('splashScreen');
  if(sp)sp.style.display='none';
}
function showLoginScreen(){
  hideSplash();
  const ls=document.getElementById('loginScreen');
  if(ls)ls.style.display='flex';
  document.querySelector('.app').style.display='none';
}
function hideLoginScreen(){
  hideSplash();
  const ls=document.getElementById('loginScreen');
  if(ls)ls.style.display='none';
  const app=document.querySelector('.app');
  app.style.display='flex';
  // Снятие стартового скрытия (index.html: visibility:hidden на .app). К этому
  // моменту роль уже применена — applyRoleFromAuth в ветках входа initAuth
  // вызывается ДО hideLoginScreen (в локальном режиме роль admin, скрывать нечего).
  app.style.visibility='visible';
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
      // ВАЖНО: logAction — только ПОСЛЕ установки cfg.url/authToken (строки выше),
      // иначе appendToCloud не увидит облако. Штамп даты — чтобы F5 в тот же день
      // не дал дубль login-записи из ветки 2 (сохранённый токен).
      logAction('auth','login','Вход по ссылке: '+(urlUser||''));
      try{ localStorage.setItem('login_logged_date',todayISO()); }catch(e){}
      if(cfg.url)await syncPullOnLogin();
      // Повторное применение роли ПОСЛЕ загрузки данных: accountRole() для учётки
      // pilot ищет позывной в state.squads, которые на чистом устройстве пусты до
      // syncPullOnLogin — switchRole выше получал 'cmd', и пилотский вид с медалями
      // появлялся только после F5. Плюс контрольная перерисовка Обзора (медали/щиты).
      applyRoleFromAuth();
      renderDashboard();
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
      // Логируем вход по сохранённому токену. Раньше логировался ТОЛЬКО первый вход
      // по ссылке (ветка 1) — отсюда «все login-записи одной датой»: ежедневные входы
      // не записывались вовсе. Дата/время — из todayISO()/nowHM() в момент вызова.
      // Не чаще раза в сутки на устройство: эта ветка срабатывает на каждый F5.
      try{
        if(localStorage.getItem('login_logged_date')!==todayISO()){
          logAction('auth','login','Вход: '+(authUser.login||'')+' (сохранённый токен)');
          localStorage.setItem('login_logged_date',todayISO());
        }
      }catch(e){}
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

// Фиксированная роль учётной записи (для не-админов; '' если не определена)
function accountRole(){
  const ar=authUser.role;
  if(ar==='admin'||ar==='cmd'||ar==='tech'||ar==='viewer')return ar;
  if(ar==='pilot'){
    const idx=state.squads.findIndex(sq=>sq.pilot===authUser.login);
    return idx>=0?'pilot_'+idx:'cmd';
  }
  return '';
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
    // Роли пилотов имеют вид pilot_N (раньше список содержал несуществующие pilot1..3 —
    // сохранённый «взгляд пилота» никогда не восстанавливался)
    const r=(savedRole==='admin'||savedRole==='cmd'||savedRole==='tech'||/^pilot_\d+$/.test(savedRole))?savedRole:'admin';
    if(roleSwitch){
      const optExists=[...roleSwitch.options].some(o=>o.value===r);
      roleSwitch.value=optExists?r:'admin';
    }
    switchRole(r);
  } else {
    // Остальные — скрываем переключатель, роль из учётной записи (включая viewer)
    if(roleSwitch)roleSwitch.style.display='none';
    const r=accountRole()||'cmd';
    if(roleSwitch){
      rebuildRoleSelector();
      const optExists=[...roleSwitch.options].some(o=>o.value===r);
      roleSwitch.value=optExists?r:'cmd';
    }
    switchRole(r);
    const badge=document.getElementById('roleBadge');
    if(badge){
      // Золотые щиты и у самой учётки пилота: switchRole ставит их в label, но бейдж
      // здесь перезаписывается логином — без добавки щиты видел только админ во
      // «взгляде пилота» (через переключатель, где бейдж не перезаписывается).
      const tbShields=r.startsWith('pilot_')?goldShieldsHtml(authUser.login,{inline:true}):'';
      badge.innerHTML='<b>'+esc(authUser.login)+'</b>'+tbShields+(authUser.role==='viewer'?' · Наблюдатель':'');
    }
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
      +state.squads.map(sq=>`<option value="${esc(sq.pilot)}">${esc(sq.pilot)}</option>`).join('');
  } else {
    row.style.display='none';
  }
}

async function createUser(){
  if(!guardAdmin())return; // клиентский guard; сервер (Backend v7) проверяет роль admin сам
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
    const rList=await fetch(url+'?action=read&token='+encodeURIComponent(authToken)+'&_='+Date.now());
    const dList=await rList.json();
    const newUser=(dList.users||[]).find(u=>u.login===login);
    if(!newUser||!newUser.token){
      alert('Пользователь создан, но не удалось получить токен автоматически.\nОткройте лист users в Google Sheets и скопируйте токен вручную.');
      loadUsersList();
      return;
    }
    const token=newUser.token;
    logAction('user','create','Создан пользователь '+login+' ('+role+(callsign?', позывной '+callsign:'')+')');

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
        // squads-переименование выгружаем явно: syncToCloud/syncPushAll после
        // Дефекта B (09.06) склад/расчёты НЕ пишет — только flights/transfers.
        syncBumpStockVersion();
        syncPushStockSquads();
        await syncToCloud(true); // flights/transfers (переименование пилота в них)
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
  // Список пользователей (логины/роли/токен-операции) — только админской учётке
  if(!(authUser.role==='admin'||authUser.login==='local'||authUser.login==='admin'))return;
  const {url}=syncGetCfg();
  if(!url||!authToken)return;
  try{
    const r=await fetch(url+'?action=read&token='+encodeURIComponent(authToken)+'&_='+Date.now());
    const d=await r.json();
    const users=d.users||[];
    const el=document.getElementById('usersList');
    if(!el)return;
    el.innerHTML=users.length?`
      <table style="width:100%;font-size:12px">
        <thead><tr><th>Логин</th><th>Роль</th><th>Статус</th><th>Действие</th></tr></thead>
        <tbody>${users.map(u=>{const lj=esc(u.login).replace(/'/g,"\\'");return `<tr>
          <td style="padding:6px 8px">${esc(u.login)}</td>
          <td style="padding:6px 8px">${esc(u.role)}</td>
          <td style="padding:6px 8px"><span class="tag ${u.active?'tag-ok':'tag-danger'}">${u.active?'активен':'заблокирован'}</span></td>
          <td style="padding:6px 8px;display:flex;gap:4px">
            <button class="btn btn-sm btn-primary" onclick="regenerateToken('${lj}')">Новая ссылка</button>
            <button class="btn btn-sm btn-danger" onclick="toggleUser('${lj}',${!u.active})">${u.active?'Блок':'Разблок'}</button>
          </td>
        </tr>`;}).join('')}</tbody>
      </table>`:'<div style="color:var(--muted);font-size:12px">Нет пользователей</div>';
  }catch(e){}
}

async function regenerateToken(login){
  if(!guardAdmin())return;
  const {url,key}=syncGetCfg();
  if(!url||!authToken)return;
  try{
    // Отправляем запрос на смену токена
    await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({action:'update_user',admin_token:authToken,login,new_token:true})});
    // Ждём пока Apps Script обработает
    await new Promise(r=>setTimeout(r,2000));
    // Читаем обновлённый список пользователей
    const r=await fetch(url+'?action=read&token='+encodeURIComponent(authToken)+'&_='+Date.now());
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
    logAction('user','token','Новая ссылка (смена токена) для '+login);
    showSyncToast('✓ Новая ссылка сгенерирована');
    loadUsersList();
  }catch(e){alert('Ошибка: '+e.message);}
}

async function toggleUser(login,active){
  if(!guardAdmin())return;
  const {url}=syncGetCfg();
  if(!url||!authToken)return;
  try{
    await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({action:'update_user',admin_token:authToken,login,active})});
    await new Promise(r=>setTimeout(r,1000));
    logAction('user',active?'unblock':'block',(active?'Разблокирован':'Заблокирован')+' пользователь '+login);
    loadUsersList();
  }catch(e){alert('Ошибка: '+e.message);}
}


// ============ РЕДАКТИРОВАНИЕ ВЫЛЕТА (10 минут для пилота) ============
function canEditFlight(f){
  // Наблюдатель — только просмотр, окно редактирования не показываем
  if(isViewerRole(state.role)||isViewerRole(authUser.role))return false;
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
    +'<input style="width:36px;font-size:11px;padding:2px 5px;text-align:center" type="number" min="1" value="'+(x.flightnum||'')+'" placeholder="#" id="edit-flightnum-'+realIdx+'">'
    +'<input style="width:90px;font-size:11px;padding:2px 5px" list="dl-ammo-catalog" value="'+esc(x.ammo||'')+'" placeholder="Боеприпас" id="edit-ammo-'+realIdx+'" autocomplete="off">'
    +'<input style="width:75px;font-size:11px;padding:2px 5px" list="dl-drones-smart" value="'+esc(x.drone||'')+'" placeholder="БПЛА" id="edit-drone-'+realIdx+'" autocomplete="off">'
    +'<select style="font-size:11px;padding:2px 3px" id="edit-result-'+realIdx+'">'
    +'<option value="yes" '+(x.result==='yes'?'selected':'')+'>✅ выполнена</option>'
    +'<option value="no" '+(x.result==='no'?'selected':'')+'>❌ нет</option></select>'
    +'<select style="font-size:11px;padding:2px 3px" id="edit-returned-'+realIdx+'">'
    +'<option value="yes" '+(x.returned==='yes'?'selected':'')+'>вернул</option>'
    +'<option value="no" '+(x.returned==='no'?'selected':'')+'>потерян</option></select>'
    +'<input style="flex:1;min-width:80px;font-size:11px;padding:2px 5px" value="'+esc(x.note||'')+'" placeholder="Примечание" id="edit-note-'+realIdx+'">'
    +'<button class="btn btn-success btn-sm" style="padding:2px 8px;font-size:10px;letter-spacing:0" onclick="saveFlightEdit('+realIdx+')">✓</button>'
    +'</div>';
}

function saveFlightEdit(idx){
  const f=state.flights[idx];
  if(!f||!canEditFlight(f))return;
  const oldReturned=f.returned;
  f.ammo=document.getElementById('edit-ammo-'+idx)?.value||f.ammo;
  f.drone=document.getElementById('edit-drone-'+idx)?.value||f.drone;
  f.result=document.getElementById('edit-result-'+idx)?.value||f.result;
  f.returned=document.getElementById('edit-returned-'+idx)?.value||f.returned;
  f.note=document.getElementById('edit-note-'+idx)?.value??f.note;
  const fn=document.getElementById('edit-flightnum-'+idx)?.value;
  if(fn)f.flightnum=parseInt(fn);
  f._edited=true;
  // Смена статуса борта в окне редактирования — пересчёт склада, как в админском пути
  // (раньше «вернул↔потерян» здесь менял только текст и склад расходился с журналом)
  if(oldReturned!==f.returned&&(f.drone||'').trim()){
    if(f.returned==='no'){
      applyLossIfNeeded(f);             // списание ровно один раз (_lossWritten) + push склада
    } else {
      returnLossDrone(f);               // возврат борта + удаление loss-записи (сам пушит склад)
      f._lossWritten=false;
    }
  }
  // Дистанции зависят от returned (×2 при возврате, ×1 при потере) — пересчитываем
  if(oldReturned!==f.returned){
    if(f.result==='no'&&f.returned==='no'){ delete f.range_km; delete f.distance_km; } // борт не долетел
    else { const r=geoComputeFlight(f); if(r){ f.range_km=r.range_km; f.distance_km=r.distance_km; f.geo_locked=true; } }
  }
  saveLocal();
  renderFlights();
  renderDashboard();
  renderInventory();
  logAction('flight','edit','Вылет #'+f.flightnum+' '+f.pilot+' отредактирован'+(oldReturned!==f.returned?' [смена статуса борта]':''));
}
// Умный список точек — часто используемые вверху, не используемые 7 дней скрыты
function getSmartTargets(){
  const cutoff=new Date();
  cutoff.setDate(cutoff.getDate()-7);
  const cutoffStr=localISO(cutoff);
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
    popup.innerHTML=items.filter(Boolean).map(v=>`<div class="qp-item" data-v="${esc(v)}">${esc(v)}</div>`).join('');
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
    // Сначала рендерим, чтобы измерить реальную высоту (с учётом max-height)
    popup.style.cssText='left:'+l+'px;top:0;min-width:'+Math.max(rect.width,140)+'px';
    popup.classList.add('open');
    // Выбираем направление: вверх, если снизу мало места, а сверху больше
    const ph=popup.offsetHeight;
    const spaceBelow=window.innerHeight-rect.bottom;
    const spaceAbove=rect.top;
    const openUp=spaceBelow<ph+8&&spaceAbove>spaceBelow;
    const t=openUp?(rect.top+window.scrollY-ph-2):(rect.bottom+window.scrollY+2);
    popup.style.top=t+'px';
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
  dl.innerHTML=ammoCatalog.map(a=>`<option value="${esc(a.name)}">`).join('');
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
          return `<span class="tag ${isCovered?'tag-ok':'tag-warn'}" style="cursor:pointer" title="${isCovered?'Покрыт справочником':'Нет в справочнике — нажмите чтобы добавить в алиасы'}" onclick="ammoQuickAdd('${esc(v).replace(/'/g,"\\'")}')">
            ${esc(v)}${isCovered?'':' ⚡'}
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
      <td style="padding:5px 8px"><input style="width:100%" value="${esc(a.name)}" onchange="ammoCatalog[${i}].name=this.value;ammoSave();renderAmmoList();"></td>
      <td style="padding:5px 8px">
        <select onchange="ammoCatalog[${i}].category=this.value;ammoSave();">
          <option value="минирование" ${a.category==='минирование'?'selected':''}>Минирование</option>
          <option value="доставка" ${a.category==='доставка'?'selected':''}>Доставка</option>
        </select>
      </td>
      <td style="padding:5px 8px"><input style="width:100%" value="${esc((a.aliases||[]).join(', '))}" onchange="ammoCatalog[${i}].aliases=this.value.split(',').map(s=>s.trim()).filter(Boolean);ammoSave();renderAmmoList();"></td>
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
  if(!guardWrite())return;
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
  if(!guardWrite())return;
  if(!confirm('Удалить "'+ammoCatalog[i].name+'"?'))return;
  ammoCatalog.splice(i,1);
  ammoSave();
  renderAmmoList();
}

function ammoNormalize(){
  if(!guardWrite())return;
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
  if(!guardWrite())return;
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
  if(!guardWrite())return;
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
  geoApplyToFlight(f);  // дистанции если есть гео и точка старта
  applyLossIfNeeded(f);
  // unshift+saveLocal+pendingQueue выполняются синхронно (гарантия доставки),
  // сетевая отправка — в фоне; UI (статус/сброс формы) её НЕ ждёт (без await).
  syncAddFlight(f);
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
    // cache-buster — иначе Apps Script может отдать закэшированный журнал без свежих чужих записей
    const r=await fetch(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now());
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
      <td style="padding:5px 8px;white-space:nowrap">${esc(e.date)} ${esc(e.time)}</td>
      <td style="padding:5px 8px;font-weight:700;color:var(--green)">${esc(e.user)}</td>
      <td style="padding:5px 8px;color:var(--muted)">${esc(e.role)}</td>
      <td style="padding:5px 8px"><span class="tag tag-gray">${esc(e.type)}</span></td>
      <td style="padding:5px 8px">${esc(e.action)}</td>
      <td style="padding:5px 8px;color:var(--text2)">${esc(e.details||'')}</td>
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
// Видимость секций страницы Настройки по ролям. Вызывается из switchRole и showPage('settings').
//  admin            — всё (Синхронизация/URL, Шифрование+смена ключа, Пользователи, Статус);
//  cmd/tech/pilot   — ключ шифрования (со своей кнопкой сохранения) + Статус с «Синхронизировать сейчас»;
//  viewer           — ключ шифрования + только текст статуса (без кнопок).
function applySettingsVisibility(){
  const role=state.role||authUser.role||'';
  const isAdmin=role==='admin';
  const isViewer=isViewerRole(role)||isViewerRole(authUser.role);
  const show=(id,v)=>{ const el=document.getElementById(id); if(el)el.style.display=v?'':'none'; };
  show('cfg-sync-card',isAdmin);        // URL Apps Script, проверка, загрузка/выгрузка
  show('usersCard',isAdmin);            // список пользователей + создание (ключ в открытом виде)
  show('cfg-key-save-btn',!isAdmin);    // не-админам — своя кнопка сохранения ключа (общая «Сохранить настройки» скрыта вместе с картой синхронизации)
  show('cfg-status-actions',!isViewer); // viewer — только текст последней синхронизации
  updateEncryptBadge();                 // блок смены ключа — только admin (и только при заданном ключе)
}

// Видимость вкладок/форм для роли только-чтение (viewer). Вызывается из switchRole.
function applyViewerUI(r){
  const v=isViewerRole(r);
  ['invNavBtn','importNavBtn'].forEach(id=>{
    const b=document.getElementById(id);
    if(b)b.style.display=v?'none':'';
  });
  const qfc=document.getElementById('quickFlightCard');
  if(qfc)qfc.style.display=v?'none':'';
  // Если наблюдатель оказался на скрытой странице — уводим на Обзор
  if(v){
    const active=document.querySelector('.page.active');
    if(active&&['page-inventory','page-import','page-admin'].includes(active.id)){
      showPage('dashboard',document.querySelector('#nav button'));
    }
  }
}

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

// Сохранение ТОЛЬКО ключа шифрования — для не-админских ролей (cmd/tech/pilot/viewer):
// карточка синхронизации с общей кнопкой «Сохранить настройки» у них скрыта.
// Локальная операция (localStorage), в облако ничего не пишет — guard не нужен.
function cfgSaveKeyOnly(){
  const keyField=(document.getElementById('cfg-key').value||'').trim();
  if(!keyField){ showSyncToast('⚠ Введите ключ шифрования'); return; }
  cfg.key=keyField;
  try{ localStorage.setItem('cfg_key',cfg.key); }catch(e){}
  updateEncryptBadge();
  showSyncToast('✓ Ключ сохранён');
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
  // Поблочно (по 32 КБ): spread в String.fromCharCode(...buf) на длинных записях
  // (большой actlog-payload) переполнял стек аргументов → битый base64,
  // который aesDecrypt не мог прочитать («not correctly encoded»)
  let bin='';
  for(let i=0;i<buf.length;i+=0x8000){ bin+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000)); }
  return btoa(bin);
}
async function aesDecrypt(b64,password){
  const key=await getKey(password);
  const buf=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(0,12)},key,buf.slice(12));
  return new TextDecoder().decode(plain);
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
  const today=localISO(now);
  const firstDay=localISO(new Date(now.getFullYear(),now.getMonth(),1));
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
// catch — страховка от вечно скрытого .app (visibility:hidden в index.html):
// при неожиданной ошибке initAuth показываем интерфейс, а не пустую страницу.
initAuth().catch(e=>{ console.error('[AUTH] initAuth error:', e); hideLoginScreen(); })
  .then(()=>{ startPolling(); syncQueueStartupCheck(); });
