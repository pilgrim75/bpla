
// ============ STATE ============
// Базовый каталог моделей (страховочный список). Реальный парк может опережать его —
// для словарей/автодополнения/AI-парсера используется getDroneVocab() (каталог ∪ склад ∪ расчёты).
// 'Рейд'→'Рейс15' (02.07.2026): adminRenameModel правил массив только в рантайме —
// после перезагрузки 'Рейд' воскресал в getDroneVocab() и подсказках AI-парсера.
const DRONE_CATALOG=['Гамаюн13','Гамаюн13д','Гамаюн13т','Гамаюн12','КИРМ','ПВХ1','ПВХ2д','ПВХ2т','Упырь11','Упырь18','Курьер21','Изделие580','Изделие548','Гамаюн13з','Упырь16','Рейс15'];

// Полный словарь моделей в обороте: каталог + всё, что реально есть на складе и в расчётах.
// Так словарь не отстаёт от парка (новые борта появляются в stock/squads сразу). Дедуп,
// пустые отброшены. Вызывать ТОЛЬКО в рантайме (читает state — app.js грузится последним).
function getDroneVocab(){
  const s=(typeof state!=='undefined'&&state)||{};
  return [...new Set([
    ...DRONE_CATALOG,
    ...((s.stock||[]).map(d=>d.name)),
    ...((s.squads||[]).flatMap(sq=>(sq.drones||[]).map(d=>d.name)))
  ].filter(Boolean))];
}

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

// Единая проверка роли пилота (формы: 'pilot', 'pilot:Поп', 'pilot_0', 'pilot1' и т.п.)
function isPilotRole(role){return !!role&&role.startsWith('pilot');}

// ===== «ВЗГЛЯД ПИЛОТА»: значение роли несёт КЛЮЧ РАСЧЁТА, а не его номер (04.09.2026) =====
// Было 'pilot_<N>' — порядковый индекс в state.squads. Индекс переживает не всё: облачный
// merge пересобирает расчёты, удаление сдвигает список — и сохранённый «взгляд» показывал
// ЧУЖОГО пилота (медали, форма вылета, щиты в topbar). Теперь 'pilot:<squadKey>'.
// Легаси-форма 'pilot_<N>' по-прежнему читается (сохранённая роль со старой версии) и
// нормализуется при входе — см. normalizePilotRole.
function isPilotViewRole(r){ return /^pilot[:_]/.test(String(r==null?'':r)); }
function pilotRoleValue(sq){ return 'pilot:'+squadKeyOf((sq&&sq.pilot)||''); }
// Имя расчёта из значения роли ('' если такого расчёта больше нет — «взгляд» не восстанавливаем)
function pilotRoleName(r){
  const s=String(r==null?'':r), sq=state.squads||[];
  if(s.slice(0,6)==='pilot:'){
    const key=_rowN(s.slice(6));
    const found=sq.find(q=>_rowN(squadKeyOf(q.pilot))===key);
    return found?found.pilot:'';
  }
  const m=/^pilot_(\d+)$/.exec(s);          // легаси: индекс
  return m&&sq[+m[1]]?sq[+m[1]].pilot:'';
}
// Разовая нормализация сохранённой роли старого формата. Пустые squads (первый вход на
// чистом устройстве, данные ещё не подтянулись) НЕ трогаем — applyRoleFromAuth зовётся
// повторно после syncPullOnLogin и нормализует тогда.
function normalizePilotRole(r){
  const m=/^pilot_(\d+)$/.exec(String(r==null?'':r));
  if(!m||!(state.squads||[]).length)return r;
  const sq=state.squads[+m[1]];
  return sq?pilotRoleValue(sq):'admin';
}

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
// Админская УЧЁТНАЯ ЗАПИСЬ (не роль представления и не замещение). Единственный
// источник правды для ОПАСНЫХ операций: перешифровка облака, URL Apps Script,
// управление пользователями/токенами. Не зависит ни от переключателя ролей, ни от
// acting_role — «и.о. admin» не существует (админ единственный, замещать можно только
// cmd/tech/pilot, см. AR_OPTS). Предикат (без alert) — для видимости элементов;
// для действий — guardAdmin() ниже, он же с сообщением.
function isAdminAccount(){
  return authUser.role==='admin'||authUser.login==='local'||authUser.login==='admin';
}
// Guard операций администратора (создание пользователей, смена токенов и т.п.).
// Проверка по УЧЁТКЕ (authUser), а не по переключателю — admin в роли cmd сохраняет права.
function guardAdmin(){
  if(isAdminAccount())return true;
  alert('Доступно только администратору');
  return false;
}

// ===== Предикаты роли (Фаза 2: actingRole — замещение) =====
// currentRole() — роль ПРЕДСТАВЛЕНИЯ/идентичности: переключатель (state.role), при
// пустом — роль учётки. По ней определяется ВИД (пилотская форма, бейдж, вкладки).
// Вызовы из reports.js/writeoff.js — только в рантайме (файлы грузятся раньше app.js).
function currentRole(){return state.role||authUser.role||'';}
// actingRole() — назначенное админом ЗАМЕЩЕНИЕ (доп. роль на период, колонка
// acting_role листа users, Backend v7.6). Расширяет ПРАВА, но НЕ меняет идентичность:
// привязка sq.pilot===login, squadKeyOf, вид пилота — всё по базовой роли/логину.
function actingRole(){return (authUser&&authUser.actingRole)||'';}
// Проверка ЭФФЕКТИВНОЙ роли: текущая ИЛИ замещение. Пример: pilot + acting tech →
// hasRole('tech')=true (права техника), isPilotRole(currentRole())=true (вид пилота).
// Про роль УЧЁТКИ ничего не говорит — для прав учётки guardAdmin()/authUser.role.
function hasRole(role){return currentRole()===role||(!!actingRole()&&actingRole()===role);}
function hasAnyRole(roles){return roles.includes(currentRole())||(!!actingRole()&&roles.includes(actingRole()));}

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
// _submittedBy — автор записи (как у вылетов): для окна правки в «Изменениях»
// (у записей до 14.08.2026 поля нет — их правят только tech/cmd/admin).
// `_cut` — момент СОЗДАНИЯ записи (мс). По нему черта (Этап 3 МАРШРУТа) решает «до/после».
// Почему отдельный штамп, а не t.date и не timestamp из id:
//   • t.date — дата СОБЫТИЯ, её вводит оператор задним числом (импорт сводок, exDate),
//     а старая модель (qty) применяет эффект в момент ЗАПИСИ → критерии разъехались бы;
//   • id — безыдной записи id выдаётся при пуше, это момент выгрузки, а не записи.
// `...fields` идёт последним намеренно: marshrutCut ставит своим записям _cut черты.
function makeTransfer(type,fields){
  const by=(typeof authUser!=='undefined'&&authUser&&authUser.login)||'';
  // Штамп не может оказаться РАНЬШЕ черты: у устройства с отстающими часами запись,
  // созданную после черты, иначе заморозило бы (движение выпало бы из баланса, а наличие
  // сдвинулось). Черта уже в данных → эта запись заведомо после неё.
  const cut=(typeof marshrutCutTs==='function'&&marshrutCutTs())||0;
  const now=Date.now();
  return {id:genId('t'),type,date:todayISO(),time:nowHM(),_cut:(cut&&now<=cut)?cut+1:now,...(by?{_submittedBy:by}:{}),...fields};
}

// ===== ЛОКАЦИЯ СТРОКИ СКЛАДА (единая точка, 04.09.2026 — подготовка к черте) =====
// Статус строки склада ↔ локация журнала движений. Соответствие обязано совпадать
// с qty-стороной marshrutCompare (marshrut.js: bg→'склад', nbg→'не бг', lost→'lost'),
// иначе наличие и журнал считают одну и ту же строку в разных локациях.
// Раньше эта формула была продублирована инлайном в adminEditStock/adminDeleteStock.
// ===== АДРЕСАЦИЯ СТРОК СКЛАДА И РАСЧЁТОВ ПО КЛЮЧУ, А НЕ ПО ИНДЕКСУ (04.09.2026) =====
// Индекс, зашитый в onchange при рендере, устаревает: облачный приём склада ПЕРЕСОБИРАЕТ
// state.stock/state.squads целиком (sync.js syncStockMerge3 — меняются и длина, и порядок),
// а таблицы админки/редактора расчётов после этого не перерисовываются. Правка уходила
// в чужую строку — тот же класс, что чинили для вылетов в v0.27 (адресация полосы по id).
//
// ПОЧЕМУ НЕ СИНТЕТИЧЕСКИЙ id: merge берёт строку-источник из ОБЛАКА
// (`const src=rRow.get(k)||lRow.get(k)`), поэтому заведённый локально id при первом же
// merge заменяется облачным; у squads[].drones id нет вовсе — их не выдаёт даже
// _syncPushStockSquadsNow (он штампует id только строкам stock и самим расчётам).
// Стабилен НАТУРАЛЬНЫЙ ключ — ровно тот, по которому merge и отождествляет строки:
// склад «модель|статус» (sync.js _stKey), борт расчёта «расчёт|модель», расчёт «пилот».
// Безымянная строка идентичности не имеет — для неё фолбэк на индекс (как 'i'+idx
// у _flightByKey); после merge она не адресуется, но merge её и так схлопывает.
// Дубль-ключи (две строки одной пары модель|статус) разрешаются в первую — как в merge.
function _rowN(s){ return String(s==null?'':s).trim().toLowerCase(); }
// Строка-ключ в inline-обработчик: экранируем для JS-литерала И для HTML-атрибута.
// Перевод строки внутри имени тоже экранируем — иначе он рвёт JS-литерал в атрибуте
// и обработчик молча не компилируется (строка становится нередактируемой).
function _attrJs(s){ return esc(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r/g,'\\r').replace(/\n/g,'\\n')); }

// Дубль-строки (две с одним натуральным ключом) видны в таблице по отдельности, поэтому
// второй и последующим носителям ключа рендер добавляет суффикс '~n' — иначе правка
// второй строки уходила бы в первую. Один счётчик на весь проход рендера.
function _keySeq(){ const seen=Object.create(null); return k=>{ const n=(seen[k]=(seen[k]||0)+1)-1; return n?k+'~'+n:k; }; }
function _occ(k){ const m=/^([\s\S]*)~(\d+)$/.exec(k); return m?{base:m[1],n:+m[2]}:{base:k,n:0}; }

function _stockRowKey(d,i){ return _rowN(d&&d.name) ? 's|'+_rowN(d.name)+'|'+((d&&d.status)||'bg') : 's#'+i; }
function _stockRowByKey(key){
  // Резолв ТОЛЬКО сравнением вычисленного ключа — позиционный фолбэк ('s#i') тоже
  // проверяется: на позиции i должна стоять по-прежнему БЕЗЫМЯННАЯ строка, иначе промах.
  const k=String(key==null?'':key), arr=state.stock||[];
  const pick=(base,n)=>{ let c=0;
    for(let i=0;i<arr.length;i++) if(_stockRowKey(arr[i],i)===base && c++===n) return {row:arr[i],idx:i};
    return null; };
  const o=_occ(k);
  return pick(k,0) || (o.n?pick(o.base,o.n):null) || {row:null,idx:-1};
}
function _squadRowKey(sq,si){ return _rowN(sq&&sq.pilot) ? 'q|'+_rowN(sq.pilot) : 'q#'+si; }
function _squadRowByKey(key){
  const k=String(key==null?'':key), arr=state.squads||[];
  const pick=(base,n)=>{ let c=0;
    for(let i=0;i<arr.length;i++) if(_squadRowKey(arr[i],i)===base && c++===n) return {sq:arr[i],si:i};
    return null; };
  const o=_occ(k);
  return pick(k,0) || (o.n?pick(o.base,o.n):null) || {sq:null,si:-1};
}
// Борт безымянного расчёта натурального ключа не имеет (иначе борта разных безымянных
// расчётов схлопнулись бы в один ключ 'd||модель') — для него тоже позиционный фолбэк.
function _droneRowKey(sq,d,si,di){
  return (_rowN(d&&d.name)&&_rowN(sq&&sq.pilot)) ? 'd|'+_rowN(sq.pilot)+'|'+_rowN(d.name) : 'd#'+si+'#'+di;
}
function _droneRowByKey(key){
  const k=String(key==null?'':key), arr=state.squads||[], miss={sq:null,si:-1,drone:null,di:-1};
  const pick=(base,n)=>{ let c=0;
    for(let si=0;si<arr.length;si++){
      const ds=arr[si].drones||[];
      for(let di=0;di<ds.length;di++) if(_droneRowKey(arr[si],ds[di],si,di)===base && c++===n) return {sq:arr[si],si,drone:ds[di],di};
    }
    return null; };
  const o=_occ(k);
  return pick(k,0) || (o.n?pick(o.base,o.n):null) || miss;
}
// Единая реакция «строка не найдена». Причина чаще не в чужой синхронизации, а в СВОЕЙ же
// правке в соседнем представлении (переименование меняет ключ), поэтому текст нейтральный.
function _rowGone(what,rerender){
  alert('Не найдено: '+what+'.\n\nСписок изменился после того, как таблица была отрисована\n(своя правка в другом разделе либо синхронизация с другого устройства).\nТаблица обновлена — повторите правку.');
  if(typeof rerender==='function'){ try{ rerender(); }catch(e){} }
}

function _isLostStatus(status){ const s=String(status||'').toLowerCase(); return s==='lost'||s==='списан'; }
function _stockLoc(status){
  // Легаси-написание 'списан' сводим к 'lost' — ровно как qty-сторона marshrutCompare
  // (marshrut.js:173). Прежний инлайн отдавал 'списан' как есть, и коррекция такой строки
  // уходила в ledger-локацию 'списан', которую сверка ИСКЛЮЧАЕТ (marshrut.js:179) → расхождение.
  if(_isLostStatus(status))return 'lost';
  return status==='bg'?'склад':(status==='nbg'?'не бг':(status||'склад'));
}

function rebuildRoleSelector(){
  const sel=document.getElementById('roleSwitch');
  const cur=sel.value;
  sel.innerHTML=
    '<option value="admin">Администратор</option>'+
    '<option value="cmd">Командир</option>'+
    '<option value="tech">Техник</option>'+
    // Значение опции — КЛЮЧ расчёта (не индекс): esc обязателен, в значении теперь имя
    state.squads.map(sq=>`<option value="${esc(pilotRoleValue(sq))}">Пилот ${esc(sq.pilot)}</option>`).join('');
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

// Отказ localStorage НЕ должен быть молчаливым (21.08.2026): прежнее однократное
// 6-секундное предупреждение за сессию пропускалось, droneState месяц не сохранялся
// (квота съедена geo_points_db) — устройство жило с устаревшим складом и затирало облако.
// Теперь: console.error при КАЖДОМ отказе + несгораемый красный баннер #lsQuotaBar
// поверх интерфейса + тост (не чаще раза в 15 с) + saveStatus. Баннер снимается при
// первой же успешной записи (lsQuotaOk).
let _lsQuotaLastToast=0, _lsQuotaActive=false;
function lsQuotaWarn(e){
  console.error('[STORAGE] localStorage write failed — ДАННЫЕ НЕ СОХРАНЕНЫ ЛОКАЛЬНО:', e&&e.name, e&&e.message);
  _lsQuotaActive=true;
  try{
    let bar=document.getElementById('lsQuotaBar');
    if(!bar){
      bar=document.createElement('div'); bar.id='lsQuotaBar';
      bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:10001;background:#b91c1c;color:#fff;font:600 13px/1.4 var(--font-sans,sans-serif);padding:8px 14px;text-align:center;box-shadow:0 2px 8px #0006';
      document.body.appendChild(bar);
    }
    bar.textContent='⛔ ХРАНИЛИЩЕ ПЕРЕПОЛНЕНО — данные НЕ сохраняются локально (localStorage). Освободите место (гео-база/бэкапы) или обратитесь к администратору. Записи уходят в облако только через очередь.';
    const now=Date.now();
    if(now-_lsQuotaLastToast>15000){ _lsQuotaLastToast=now; if(typeof showSyncToast==='function') showSyncToast('⛔ ХРАНИЛИЩЕ ПЕРЕПОЛНЕНО — данные НЕ сохранены локально', 10000); }
    setStatus('saveStatus','⛔ Хранилище переполнено — не сохранено локально','err');
  }catch(_){}
}
function lsQuotaOk(){
  if(!_lsQuotaActive)return;
  _lsQuotaActive=false;
  const bar=document.getElementById('lsQuotaBar'); if(bar)bar.remove();
  console.log('[STORAGE] localStorage снова пишется');
}
// Единственная точка записи droneState: бросает наружу ТОЛЬКО через lsQuotaWarn (видимо).
function lsWriteState(){
  try{ localStorage.setItem('droneState',JSON.stringify(state)); lsQuotaOk(); return true; }
  catch(e){ lsQuotaWarn(e); return false; }
}
function saveLocal(){
  lsWriteState();
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
  lsWriteState();
  clearTimeout(saveLocal._timer); // отменяем отложенный полный write, если был запланирован
}
function loadLocal(){
  try{
    const s=localStorage.getItem('droneState');
    if(s){
      state=JSON.parse(s);
      // Чистим невалидные записи transfers (с undefined полями).
      // ВАЖНО: exchange-передачи (saveExchange) НЕ имеют drone/from/to — у них
      // give/get/unit. Раньше фильтр их отбрасывал при загрузке из localStorage,
      // и передачи наружу «пропадали» из state (diff склада не сходился: +N по отданным
      // бортам), хотя в облаке записи были. Держим запись, если у неё есть тип и любое
      // содержательное поле любого типа (drone/from/to ИЛИ give/get/unit ИЛИ location).
      // location добавлена 04.09.2026 (подготовка к черте, Этап 3.1): у adjust и у
      // будущего startbalance локация лежит ТОЛЬКО в t.location — без неё запись,
      // заполненная одной локацией, молча стиралась бы при каждой загрузке (класс БАГа 3).
      if(state.transfers){
        state.transfers=state.transfers.filter(t=>
          t&&t.type&&(t.drone||t.from||t.to||t.give||t.get||t.unit||t.location)
        );
      }
    }
  }catch(e){}
}
loadLocal();
// Сверка склада со своей базой (sync.js, LWW-защита 21.08.2026): если другая вкладка
// перезаписала droneState устаревшим складом при уже принятой новой версии — берём базу.
if(typeof syncStockReconcileOnLoad==='function') try{ syncStockReconcileOnLoad(); }catch(e){ console.warn('[SYNC] reconcile on load:', e.message); }

// Разовая миграция легаси-выдач (01.06.2026) в transfers ('_mig_', дата 2000-01-01).
// ГЕЙТ — ПО ДАННЫМ, не по устройству (форензика 21.08.2026): прежний флаг
// `_transfers_migrated_v1` жил в localStorage устройства, и каждое новое/очищенное
// устройство, загрузившееся с squads, но без transfers, переливало легаси заново —
// 6 прогонов (05.06, 10.06, 09.07 ×2, 11.07, 14.08), дубли ломали баланс по пилотам
// (getBalance). Теперь: есть хоть одна '_mig_'-запись → миграция уже была (везде, т.к.
// transfers общие в облаке) → выход; transfers пусты → данных для вывода нет → выход
// БЕЗ флага (после загрузки облака '_mig_' будут видны). Флаг оставлен как вторичный.
function migrateSquadsToTransfers(){
  if(localStorage.getItem('_transfers_migrated_v1'))return;
  // ЧЕРТА: после неё легаси-выдачи создались бы как ПОСТ-чертовые движения и задвоили бы
  // стартовый остаток (их эффект уже внутри него). Тихо выходим — функция зовётся при
  // каждой загрузке; страховка на случай, если маркер `_mig_` исчезнет из данных.
  if(typeof marshrutCutTs==='function'&&marshrutCutTs()){ localStorage.setItem('_transfers_migrated_v1','1'); return; }
  const tr=state.transfers||[];
  if(tr.some(t=>t&&typeof t.id==='string'&&t.id.includes('_mig_'))){ localStorage.setItem('_transfers_migrated_v1','1'); return; }
  if(!tr.length) return; // нечего сверять — не плодим легаси из одних squads
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
  if((isViewerRole(state.role)||isViewerRole(authUser.role))&&(id==='inventory'||id==='import'||id==='admin'||id==='vtx'))return;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(id==='flights'){
    // Дефолт при первом показе вкладки — последние 7 дней (потом уважаем выбор пользователя)
    if(!window._flightsInit){
      window._flightsInit=true;
      const ff=document.getElementById('filterFrom');
      if(ff&&!ff.value)ff.value=localISO(new Date(Date.now()-7*864e5));
    }
    renderFlights();
  }
  if(id==='dashboard')renderDashboard();
  if(id==='inventory')renderInventory();
  if(id==='vtx'&&typeof vtxRenderTab==='function')vtxRenderTab();
  if(id==='report'){fillReportFilters();buildReport();}
  if(id==='settings'){
    applySettingsVisibility(); // секции по ролям: admin — всё, остальные — ключ+статус
    // Управление пользователями переехало в Администратор → Пользователи (v0.26)
    renderSettingsStatus();
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
  else if(isPilotViewRole(r)){
    pilotName=pilotRoleName(r)||'?';   // ключ расчёта, не индекс (легаси 'pilot_N' тоже читается)
    label='Пилот '+pilotName;
  }
  // Для роли пилота — золотые щиты рядом с именем в topbar (под высоту заглавных букв)
  const tbShields=isPilotViewRole(r)&&pilotName&&pilotName!=='?'?goldShieldsHtml(pilotName,{inline:true}):'';
  document.getElementById('roleBadge').innerHTML='<b>'+esc(label)+'</b>'+tbShields;
  const canEdit=hasAnyRole(['cmd','tech','admin']); // state.role=r уже установлена выше
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
    const isPilot=isPilotViewRole(r);
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
  document.querySelectorAll('.adm-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(tab==='flights')renderAdminFlights();
  if(tab==='users'){
    // Пользователи (переехали из Настроек, v0.26): мгновенный рендер из кэша actLog,
    // затем повтор после подтяжки свежего журнала («Последний вход» без отставания)
    const nuke=document.getElementById('nu-enckey');
    if(nuke)nuke.value=cfg.key||localStorage.getItem('cfg_key')||'';
    if(typeof nuRoleChange==='function')nuRoleChange();
    loadUsersList();
    loadActLogFromCloud().then(()=>loadUsersList());
  }
  if(tab==='stock')renderAdminStock();
  if(tab==='squads')renderAdminSquads();
  if(tab==='ammo')renderAmmoList();
  if(tab==='data')renderRenameModelSelect();
  if(tab==='geo')renderGeoTab();
  if(tab==='actlog'){loadActLogFromCloud().then(()=>renderActLog());};
}

// ===== Мобильное ☰-меню навигации =====
function navMenuClose(){const p=document.getElementById('navMenu');if(p)p.classList.remove('open');}
function navMenuToggle(e){
  if(e)e.stopPropagation();
  const panel=document.getElementById('navMenu');
  if(!panel)return;
  if(panel.classList.contains('open')){navMenuClose();return;}
  // Зеркалим видимость пунктов по инлайн-display реальных кнопок (роли: viewer/non-admin)
  [['navMenuImport','importNavBtn'],['navMenuAdmin','adminNavBtn'],['navMenuSettings','settingsNavBtn']].forEach(([item,real])=>{
    const it=document.getElementById(item),rb=document.getElementById(real);
    if(it&&rb)it.style.display=(rb.style.display==='none')?'none':'';
  });
  panel.classList.add('open');
}
function navMenuGo(page,btnId){
  const b=document.getElementById(btnId);
  if(b)showPage(page,b); // штатный роутинг + подсветка на реальной (скрытой) кнопке
  const mb=document.getElementById('navMenuBtn');
  if(mb)mb.classList.add('active');
  navMenuClose();
}
// Закрытие по клику вне меню
document.addEventListener('click',e=>{
  if(!(e.target.closest&&e.target.closest('.nav-menu-wrap')))navMenuClose();
});

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
      <tbody>${indexed.map(({x,i})=>{
        // Ключ записи, а не индекс: syncPushAll доливает облачные вылеты и ПЕРЕСОРТИРОВЫВАЕТ
        // state.flights (sync.js), эту таблицу при этом никто не перерисовывает — зашитый
        // индекс начинал указывать на чужой вылет. Те же _flEditKey/_flKeyJs, что у полосы
        // правки в журнале (id записи, фолбэк 'i'+индекс для исторических без id).
        const k=_flKeyJs(_flEditKey(x,i));
        return `<tr>
        <td><input style="width:100px" type="date" value="${esc(x.date||'')}" onchange="adminEditFlight('${k}','date',this.value)"></td>
        <td><input style="width:76px;min-width:76px" type="time" value="${esc(x.time||'')}" onchange="adminEditFlight('${k}','time',this.value)"></td>
        <td><input style="width:36px" type="number" min="1" value="${x.flightnum||''}" onchange="adminEditFlight('${k}','flightnum',this.value?parseInt(this.value):null)"></td>
        <td><input style="width:72px" value="${esc(x.pilot||'')}" onchange="adminEditFlight('${k}','pilot',this.value)"></td>
        <td><input style="width:100px" value="${esc(x.target||'')}" onchange="adminEditFlight('${k}','target',this.value)"></td>
        <td><input style="width:80px" value="${esc(x.ammo||'')}" onchange="adminEditFlight('${k}','ammo',this.value)" onclick="event.stopPropagation();const ammoList=ammoCatalog.length?ammoCatalog.map(a=>a.name):[...new Set(state.flights.map(f=>f.ammo).filter(Boolean))].sort();showQuickPicker(this,ammoList,v=>{adminEditFlight('${k}','ammo',v)})" autocomplete="off"></td>
        <td><input style="width:85px" value="${esc(x.drone||'')}" onchange="adminEditFlight('${k}','drone',this.value)" onclick="event.stopPropagation();showQuickPicker(this,[...new Set([...state.stock.map(d=>d.name),...state.squads.flatMap(sq=>sq.drones.map(d=>d.name))])].sort(),v=>{adminEditFlight('${k}','drone',v)})" autocomplete="off"></td>
        <td><select style="width:46px;padding:1px 2px;font-size:13px" onchange="adminEditFlight('${k}','result',this.value)"><option value="yes" ${x.result==='yes'?'selected':''}>✅</option><option value="no" ${x.result==='no'?'selected':''}>❌</option></select></td>
        <td><select style="width:80px" onchange="adminEditFlight('${k}','returned',this.value)"><option value="yes" ${x.returned==='yes'?'selected':''}>вернул</option><option value="no" ${x.returned==='no'?'selected':''}>потерян</option></select></td>
        <td style="white-space:nowrap;color:var(--muted)">${x.range_km!=null?'<span title="Пересчитать дистанцию по текущей точке" style="cursor:pointer" onclick="adminRecalcFlightDist(\''+k+'\')">🔒</span>&nbsp;&nbsp;'+x.range_km+' км':''}</td>
        <td><input style="width:100%;min-width:120px" value="${esc(x.note||'')}" onchange="adminEditFlight('${k}','note',this.value)"></td>
        <td style="white-space:nowrap"><button class="btn btn-danger btn-sm" style="padding:1px 5px;font-size:9px" onclick="adminDeleteFlight('${k}')">✕</button></td>
      </tr>`;}).join('')}
      </tbody>
    </table>`:'<div style="color:var(--muted);padding:12px">Нет вылетов</div>';
}

function adminEditFlight(key,field,val){
  if(!guardWrite())return;
  // Ключ → запись → СВЕЖИЙ индекс (нижележащие syncEditFlight/adminEditReturned/
  // adminEditLossDrone работают по индексу и вызываются не только отсюда).
  const rec=_flightByKey(key);
  if(!rec){ _rowGone('вылет',renderAdminFlights); return; }
  const idx=state.flights.indexOf(rec);
  // Смена статуса «вернул ↔ потерян» → списать/вернуть борт у пилота
  if(field==='returned'){
    const f=rec;
    if(f && f.returned!==val && (val==='no'||val==='yes')){
      // ЧЕРТА: у до-чертового вылета запись о потере заморожена — пересчёт склада вокруг
      // неё сдвинул бы наличие, не тронув журнал. Меняем только статус вылета.
      if(_isPreCutFlight(f)){
        const m='Вылет записан до черты: статус изменён, склад НЕ пересчитан (история заморожена).';
        if(typeof showSyncToast==='function')showSyncToast('⚠ '+m,8000); else alert(m);
      } else {
        adminEditReturned(idx,val);
        return;
      }
    }
  }
  // Смена борта в вылете-потере → пересчитать списание у пилота
  if(field==='drone'){
    const f=rec;
    const oldDrone=(f?f.drone||'':'').trim();
    const newDrone=(val||'').trim();
    // Вылет помечен как потеря и борт реально изменился — пересчитать списание.
    // Флаг _lossWritten не проверяем: у исторических вылетов он не выставлен.
    if(f && f.returned==='no' && oldDrone && newDrone && oldDrone.toLowerCase()!==newDrone.toLowerCase()){
      // ЧЕРТА: у до-чертового вылета запись о потере заморожена — пересчёт склада сдвинул
      // бы наличие, не тронув журнал. Правим только ТЕКСТ вылета (опечатку исправить можно).
      if(_isPreCutFlight(f)){
        if(typeof showSyncToast==='function')showSyncToast('Вылет до черты: борт исправлен только в записи вылета, склад не пересчитан (история заморожена)',8000);
        else alert('Вылет записан до черты — борт исправлен в вылете, склад не пересчитан (история заморожена).');
      } else {
        adminEditLossDrone(idx,oldDrone,newDrone);
        return;
      }
    }
  }
  syncEditFlight(idx,field,val);
  const fl=rec;
  logAction('flight','edit','Адм: '+(fl?(fl.pilot||'')+' '+(fl.date||'')+' '+(fl.time||''):'#'+idx)+' — '+field+' = '+String(val??'').slice(0,40));
}

// Точечный пересчёт дистанции одного вылета по ТЕКУЩЕЙ точке (клик на замок в колонке «Дальн»).
// Разблокировать → пересчитать из координат (geoComputeFlight сам берёт точку старта/цели)
// → снова зафиксировать (geo_locked=true). Не трогает остальные вылеты. Уходит в облако
// штатно (saveLocal → неразрушающий syncPushAll merge flights), как любая правка вылета.
function adminRecalcFlightDist(key){
  if(!guardWrite())return;
  const f=_flightByKey(key);                         // ключ, а не индекс
  if(!f){ _rowGone('вылет',renderAdminFlights); return; }
  if(typeof geoComputeFlight!=='function'){alert('Геомодуль недоступен');return;}
  const r=geoComputeFlight(f);
  if(!r){alert('Не удалось рассчитать дистанцию: точка не найдена в геоданных.');return;}
  f.range_km=r.range_km;
  f.distance_km=r.distance_km;
  f.geo_locked=true; // снова под защитой глобального пересчёта (includeLocked:false)
  saveLocal();
  logAction('flight','edit','Адм: пересчёт дистанции '+(f.pilot||'')+' '+(f.date||'')+' '+(f.time||'')+' → '+f.range_km+' км');
  renderAdminFlights();
  renderFlights();
  renderDashboard();
}

// Пересчёт списания при смене борта в вылете-потере (returned='no').
// Спрашивает подтверждение: применять ли изменения к складу/расчёту.
// «Нет» — меняем только текст вылета, склад не трогаем.
async function adminEditLossDrone(idx, oldDrone, newDrone){
  let f=state.flights[idx];
  if(!f) return;
  const pilot=f.pilot;
  const apply=await confirmLossDroneChange(oldDrone,newDrone,pilot);

  // Перерезолв после модалки — см. подробный комментарий в adminEditReturned:
  // Promise-оверлей не блокирует цикл, полная синхронизация могла заменить объекты.
  const live=(f.id!=null&&_flightByKey(String(f.id)))||(state.flights.includes(f)?f:null);
  if(!live){ _rowGone('вылет',renderAdminFlights); return; }
  f=live;

  // Текст вылета меняем в любом случае
  f.drone=newDrone;

  if(apply){
    let sq=state.squads.find(s=>s.pilot===pilot);
    if(!sq){ sq={pilot,drones:[]}; state.squads.push(sq); }
    // 1) вернуть старый борт пилоту
    const od=sq.drones.find(d=>d.name.toLowerCase()===oldDrone.toLowerCase());
    if(od) od.qty++; else sq.drones.push({name:oldDrone,qty:1});
    // 2) списать новый борт у пилота — в минус, если его нет (ADR-001 §4: минус = сигнал,
    //    как в writeDroneLoss; строка снимается только при точном нуле)
    let nd=sq.drones.find(d=>d.name.toLowerCase()===newDrone.toLowerCase());
    if(!nd){ nd={name:newDrone,qty:0}; sq.drones.push(nd); }
    nd.qty--;
    if(nd.qty===0) sq.drones=sq.drones.filter(d=>d!==nd);
    if(nd.qty<0) lossDeficitWarn({deficit:true,pilot,drone:newDrone,qty:nd.qty});
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
  let f=state.flights[idx];
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

  // ПЕРЕРЕЗОЛВ ПОСЛЕ МОДАЛКИ (04.09.2026). Это НЕ window.confirm: confirmReturnedChange —
  // Promise-оверлей, цикл событий он не блокирует, и плановая полная синхронизация
  // (раз в 5 мин) заменяет state.flights ЦЕЛИКОМ новыми объектами (sync.js: `state.flights
  // = loaded.flights`). Захваченная до модалки запись тогда отвязана: списание со склада
  // и loss-запись применились бы к живому состоянию, а f.returned/_lossWritten ушли бы
  // в мусор — вылет остался бы «вернул» при списанном борте (осиротевшая потеря).
  // Делаем ДО любых мутаций: ранний выход ничего не меняет.
  const live=(f.id!=null&&_flightByKey(String(f.id)))||(state.flights.includes(f)?f:null);
  if(!live){ _rowGone('вылет',renderAdminFlights); return; }
  f=live;

  // Статус вылета меняем в любом случае
  f.returned=newReturned;

  if(apply){
    if(loss){
      // списать борт у пилота + запись о потере в transfers
      lossDeficitWarn(writeDroneLoss(f.pilot, drone, f.date, f.time, f.id));
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
// ===== ВОЗВРАТ НАЛИЧИЯ ПРИ СНЯТИИ LOSS-ЗАПИСИ (04.09.2026, блокер §2а) =====
// Симметрия ledger↔qty: снятая loss-запись — это снятое движение −qty, значит наличие
// обязано вырасти ровно на qty снятых записей. Раньше чистки журнала
// (adminCleanOrphanLosses / adminDedupeLossTransfers) удаляли движения, не трогая
// наличие, а syncDeleteFlight компенсировал по флагу f.returned, а не по фактически
// снятым записям. Минус закрывается точным нулём — строка снимается (как в returnLossDrone).
function _restoreSquadQty(pilot,drone,qty){
  if(!pilot||!drone||!qty)return;
  const dl=String(drone).toLowerCase();
  let sq=(state.squads||[]).find(s=>s.pilot===pilot);
  if(!sq){sq={pilot,drones:[]};(state.squads=state.squads||[]).push(sq);}
  sq.drones=sq.drones||[];
  const d=sq.drones.find(x=>String(x.name||'').toLowerCase()===dl);
  if(d){ d.qty=(d.qty||0)+qty; if(d.qty===0)sq.drones=sq.drones.filter(x=>x!==d); }
  else sq.drones.push({name:drone,qty});
}
// Компенсировать наличие по списку снятых loss-записей. Возвращает сколько бортов вернулось.
function _compensateRemovedLosses(list){
  let n=0, frozen=0;
  (list||[]).forEach(t=>{
    if(!t||t.type!=='loss')return;
    // ЧЕРТА: до-чертовая запись в баланс НЕ входит (заморожена), значит её снятие меняет
    // ledger на 0 — и наличие обязано остаться на месте. Иначе qty поедет без журнала.
    if(_isPreCutTransfer(t)){ frozen++; return; }
    const q=parseInt(t.qty,10)||1;              // qty по умолчанию 1 — как в writeDroneLoss
    _restoreSquadQty(t.pilot,t.drone,q); n+=q;
  });
  if(frozen)console.warn('[учёт] Снято '+frozen+' до-чертовых записей о потере — наличие не менялось (история заморожена чертой).');
  return n;
}
// Человекочитаемая сводка возврата для confirm/статуса: «Поп: ПВХ1 ×2; Толстый: КИРМ ×1»
function _describeRestored(list){
  const acc={};
  (list||[]).forEach(t=>{
    if(!t||t.type!=='loss')return;
    const k=(t.pilot||'?')+'|'+(t.drone||'?');
    acc[k]=(acc[k]||0)+(parseInt(t.qty,10)||1);
  });
  return Object.keys(acc).map(k=>{const p=k.split('|');return p[0]+': '+p[1]+' ×'+acc[k];}).join('; ');
}

function returnLossDrone(f){
  const pLow=(f.pilot||'').toLowerCase();
  const dLow=(f.drone||'').toLowerCase();
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
  // Возврат борта — ПОСЛЕ снятия записей (04.09.2026): при действующей черте снятие
  // ЗАМОРОЖЕННОЙ (до-чертовой) записи не меняет ledger, значит и наличие двигать нельзя.
  // Без черты и для пост-чертовых записей поведение прежнее: +1 борт пилоту, в т.ч. когда
  // записи о потере не нашлось (исторические вылеты долга «42 потери без loss»).
  // При действующей черте наличие двигаем ТОЛЬКО если сняли хотя бы одну пост-чертовую
  // запись. Ноль снятых записей — это легаси-вылет из долга «42 потери без loss»: его
  // списания в журнале нет, возвращать нечего (симметрично syncDeleteFlight).
  const cutOn=typeof marshrutCutTs==='function'&&marshrutCutTs()>0;
  const frozenOnly=cutOn&&!removedTransfers.some(t=>!_isPreCutTransfer(t));
  if(!frozenOnly){
    const sq=state.squads.find(s=>s.pilot===f.pilot);
    if(sq){
      const d=sq.drones.find(d=>d.name.toLowerCase()===dLow);
      if(d){ d.qty++; if(d.qty===0) sq.drones=sq.drones.filter(x=>x!==d); } // −1→0: минус закрыт, строку снимаем
      else sq.drones.push({name:f.drone,qty:1});
    }
  } else {
    const msg=removedTransfers.length
      ?'Потеря записана до черты — наличие не изменено (история заморожена).'
      :'У вылета не было записи о потере в журнале — наличие не изменено (возвращать нечего).';
    console.warn('[учёт] '+msg);
    if(typeof showSyncToast==='function')showSyncToast('⚠ '+msg,8000);
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

function adminDeleteFlight(key){
  if(!guardWrite())return;
  const rec=_flightByKey(key);                       // ключ, а не индекс
  if(!rec){ _rowGone('вылет',renderAdminFlights); return; }
  if(!confirm('Удалить этот вылет?\n\n'+(rec.date||'')+' '+(rec.time||'')+' · '+(rec.pilot||'')+' · '+(rec.drone||'')))return;
  syncDeleteFlight(state.flights.indexOf(rec));      // свежий индекс на момент подтверждения
}

function renderAdminStock(){
  document.getElementById('adminStockList').innerHTML=state.stock.length?`
    <table>
      <thead><tr><th>Название</th><th>Кол-во</th><th>Статус</th><th>Действие</th></tr></thead>
      <tbody>${(sk=>state.stock.map((d,i)=>{
        const k=_attrJs(sk(_stockRowKey(d,i))); // ключ строки, а не индекс (см. _stockRowKey)
        return `<tr>
        <td><input style="width:120px" value="${esc(d.name)}" onchange="adminEditStock('${k}','name',this.value)"></td>
        <td><input style="width:60px${d.qty<0?';color:var(--red);border-color:var(--red)':''}" type="number" value="${d.qty}"${d.qty<0?' title="Остаток в минусе — выбытие оформлено без прихода (ADR-001 §4: сигнал, не ошибка)"':''} onchange="adminEditStock('${k}','qty',parseInt(this.value)||0)">${d.qty<0?' <span style="color:var(--red)" title="минус = сигнал недостающего прихода">⚠</span>':''}</td>
        <td><select onchange="adminEditStock('${k}','status',this.value)">
          <option value="bg" ${d.status==='bg'?'selected':''}>БГ</option>
          <option value="nbg" ${d.status==='nbg'?'selected':''}>Не БГ</option>
          <option value="lost" ${_isLostStatus(d.status)?'selected':''}>Списан</option>
        </select></td>
        <td><button class="btn btn-danger btn-sm" onclick="adminDeleteStock('${k}')">Удалить</button></td>
      </tr>`;}).join(''))(_keySeq())}
      </tbody>
    </table>`:'<div style="color:var(--muted);padding:8px">Нет позиций</div>';
}

function adminEditStock(key,field,val){
  if(!guardWrite())return;
  const {row:it,idx}=_stockRowByKey(key);           // ключ, а не индекс — см. _stockRowKey
  if(!it){ _rowGone('строка склада',renderAdminStock); return; }
  if(field==='qty'){
    const newQ=parseInt(val,10)||0;
    const delta=newQ-(it.qty||0);
    if(delta){
      const loc=_stockLoc(it.status);
      const reason=adjustReason(it.name+' ('+loc+'): '+(it.qty||0)+'→'+newQ);
      if(!reason){renderAdminStock();return;} // отмена — восстановить поле из state
      it.qty=newQ;
      recordAdjust(it.name,delta,loc,reason);
      logAction('stock','edit','Адм: коррекция '+it.name+' ('+loc+') '+(newQ-delta)+'→'+newQ+' — '+reason);
    } else { it.qty=newQ; }
  } else if(field==='status'){
    // Смена статуса = ПЕРЕМЕЩЕНИЕ между локациями, а не переклейка ярлыка (04.09.2026).
    // Обе ветки сами сохраняют/рендерят; отказ или отмена — перерисовка вернёт поле из state.
    if(!adminMoveStockStatus(idx,val))renderAdminStock();
    return;
  } else if(field==='name'){
    if(!adminRenameStockRow(idx,val))renderAdminStock();
    return;
  } else {
    it[field]=val;
  }
  saveLocal();
  syncBumpStockVersion();   // версионируем — иначе поллинг затрёт правку
  syncPushStockSquads();
  renderDashboard();
}

// ===== СМЕНА СТАТУСА СТРОКИ СКЛАДА = ДВИЖЕНИЕ (04.09.2026, блокер §2а диагностики) =====
// Раньше ветка else в adminEditStock делала `it[field]=val`: qty переезжал между
// локациями 'склад' / 'не бг' / 'lost' БЕЗ единого движения — наличие меняло локацию,
// журнал движений оставался на прежней, и сверка получала расхождение сразу по двум
// парам (подпись этого механизма видна в базовой линии ADR §8: зеркальные ±1
// «Гамаюн12 не бг / склад», «Курьер21 не бг / склад»).
// Теперь количество физически переезжает в строку целевого статуса и порождает
// запись type='transfer' — ровно ту же, что создаёт штатная передача «склад → не бг».
// Возвращает true, если правка применена (или применять нечего).
function adminMoveStockStatus(idx,newStatus){
  const it=state.stock[idx]; if(!it)return false;
  const oldStatus=it.status||'bg';
  if(newStatus===oldStatus)return true;
  // 'Списан' — ВЫБЫТИЕ, а не локация остатка: в журнале движений локации 'lost' нет,
  // и остаток, уехавший туда сменой статуса, из учёта пропадает. Оформляется
  // передачей «→ списан» либо потерей через вылет.
  if(_isLostStatus(newStatus)){
    alert('Статус «Списан» здесь не выставляется.\n\nСписание оформляется передачей «→ списан» (Склад → Передача),\nбоевая потеря — через вылет.\n\nИначе остаток уходит в локацию, которой нет в журнале движений.');
    return false;
  }
  if(_isLostStatus(oldStatus)){
    alert('Строка со статусом «Списан» не возвращается в оборот сменой статуса.\n\nОформите поступление (Склад → Добавить БПЛА) или коррекцию количества.');
    return false;
  }
  const q=it.qty||0;
  const from=_stockLoc(oldStatus), to=_stockLoc(newStatus);
  const nl=String(it.name||'').toLowerCase();
  const tgt=state.stock.find(d=>d!==it&&String(d.name||'').toLowerCase()===nl&&d.status===newStatus);
  if(q===0){ // двигать нечего — ярлык пустой строки, движение не нужно
    if(tgt)state.stock.splice(idx,1); else it.status=newStatus; // не плодим вторую строку той же пары
    saveLocal(); syncBumpStockVersion(); syncPushStockSquads();
    renderAdminStock(); renderInventory(); renderDashboard();
    return true;
  }
  if(!confirm('Перевести '+it.name+' ×'+q+': '+from+' → '+to+'?\n\nБудет создана запись движения в журнале изменений (как у обычной передачи).'))return false;
  // Количество переезжает в строку целевого статуса (схлоп с существующей, если есть)
  if(tgt){ tgt.qty=(tgt.qty||0)+q; state.stock.splice(idx,1); }
  else { it.status=newStatus; }
  const op=makeTransfer('transfer',{from,to,drone:it.name,qty:q,note:'смена статуса строки склада'});
  if(!state.transfers)state.transfers=[];
  state.transfers.unshift(op);
  syncAddTransfer(op);
  logAction('stock','edit','Смена статуса: '+it.name+' ×'+q+' — '+from+' → '+to);
  saveLocal(); syncBumpStockVersion(); syncPushStockSquads();
  renderAdminStock(); renderInventory(); renderDashboard(); renderTransfersLog();
  return true;
}

// ===== ПРАВКА ИМЕНИ МОДЕЛИ В СТРОКЕ СКЛАДА = ПЕРЕНОС ОСТАТКА (04.09.2026) =====
// Раньше `it.name=val` переносил остаток с модели на модель без движения. Теперь —
// ПАРА adjust (−qty у старой модели, +qty у новой, та же локация) с обязательной
// причиной: обе модели (наличие и журнал) двигаются на одну и ту же дельту.
// Массовое переименование модели во ВСЕХ данных — отдельная операция adminRenameModel.
function adminRenameStockRow(idx,newName){
  const it=state.stock[idx]; if(!it)return false;
  const oldName=String(it.name||'').trim();
  newName=String(newName||'').trim();
  if(!newName){alert('Название модели не может быть пустым');return false;}
  if(newName===oldName)return true;
  const q=it.qty||0, loc=_stockLoc(it.status);
  const nl=newName.toLowerCase();
  const merge=()=>{ // схлоп с существующей строкой той же модели и статуса
    const tgt=state.stock.find(d=>d!==it&&String(d.name||'').toLowerCase()===nl&&d.status===it.status);
    if(tgt){ tgt.qty=(tgt.qty||0)+q; state.stock.splice(idx,1); } else { it.name=newName; }
  };
  if(q===0){ // пустая строка — просто ярлык, движения не требуется
    merge();
    saveLocal(); syncBumpStockVersion(); syncPushStockSquads();
    renderAdminStock(); renderInventory(); renderDashboard();
    return true;
  }
  const reason=adjustReason('строка склада ('+loc+'): '+oldName+' ×'+q+' → '+newName
    +'\nОстаток переносится с модели на модель — будет создана пара коррекций.'
    +'\nМассовое переименование модели во всех данных: Администратор → Данные.');
  if(!reason)return false;
  recordAdjust(oldName,-q,loc,'перенос остатка в «'+newName+'»: '+reason);
  recordAdjust(newName, q,loc,'перенос остатка из «'+oldName+'»: '+reason);
  merge();
  logAction('stock','edit','Строка склада ('+loc+'): '+oldName+' ×'+q+' → '+newName+' — '+reason);
  saveLocal(); syncBumpStockVersion(); syncPushStockSquads();
  renderAdminStock(); renderInventory(); renderDashboard(); renderTransfersLog();
  return true;
}

function adminDeleteStock(key){
  if(!guardWrite())return;
  const {row:it,idx}=_stockRowByKey(key);           // ключ, а не индекс
  if(!it){ _rowGone('строка склада',renderAdminStock); return; }
  // Причина-запрос служит подтверждением; при наличии qty — adjust(−qty) для прослеживаемости
  const loc=_stockLoc(it.status);
  const reason=adjustReason('удаление позиции '+it.name+' ×'+it.qty+' ('+loc+')');
  if(!reason)return;
  if(it.qty) recordAdjust(it.name,-it.qty,loc,'удаление позиции: '+reason);
  state.stock.splice(idx,1);
  logAction('stock','delete','Удалена позиция склада: '+it.name+' ×'+it.qty+' ('+it.status+') — '+reason);
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
  // Локация в записи ОБЯЗАТЕЛЬНА (04.09.2026, блокер §2а): без неё _marshrutWalk кладёт
  // любой приход на 'склад' (marshrut.js:62), а наличие при статусе «Не БГ» оседает
  // в локации 'не бг' → расхождение по двум парам на каждый такой приход. Старый аудит
  // этого не видит (intake и onhand гасятся), поэтому дефект всплыл бы только после черты.
  const op=makeTransfer('arrival',{drone:n,qty:q,to:_stockLoc(s),location:_stockLoc(s),note:'статус: '+s});
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
      <tbody>${((qs,ds)=>state.squads.flatMap((sq,si)=>{
        // Ячейки шапки расчёта (имя/точка старта/удаление) — общие для строки с бортами и
        // для расчёта с ПУСТЫМ складом, чтобы пилот не исчезал из списка (см. ниже).
        const qk=_attrJs(qs(_squadRowKey(sq,si))); // ключ расчёта, а не индекс (см. _squadRowKey)
        const pilotCell=`<input style="width:90px" value="${esc(sq.pilot)}" onchange="adminEditSquadPilot('${qk}',this.value)">`;
        const startCell=`<input style="width:110px" value="${esc(sq.start_point||'')}" placeholder="45 вишня" onchange="squadEditStartPoint('${qk}',this.value)" autocomplete="off"><br><button id="geo-rc-btn-adm-${si}" class="btn btn-sm" style="margin-top:4px;font-size:10px;display:${geoStartBtnShow(sq)?'':'none'}" onclick="geoRecalcPilotMissing('${qk}','geo-rc-prog-adm-${si}','geo-rc-btn-adm-${si}')">Пересчитать вылеты без дистанций</button><span id="geo-rc-prog-adm-${si}" style="font-size:10px;color:var(--muted)"></span>`;
        const delCell=`<button class="btn btn-danger btn-sm" onclick="adminDeleteSquad('${qk}')">Удалить расчёт</button>`;
        // Пустой склад → одна строка-заглушка, но расчётом всё равно можно управлять
        // (точка старта, удаление; виден как получатель при выдаче борта).
        if(!sq.drones.length) return [`<tr>
          <td>${pilotCell}</td>
          <td>${startCell}</td>
          <td colspan="2" style="color:var(--muted)">нет бортов</td>
          <td>${delCell}</td>
        </tr>`];
        return sq.drones.map((d,di)=>{
          const dk=_attrJs(ds(_droneRowKey(sq,d,si,di))); // ключ борта «расчёт|модель»
          return `<tr>
          <td>${di===0?pilotCell:'&nbsp;'}</td>
          <td>${di===0?startCell:'&nbsp;'}</td>
          <td><input style="width:90px" value="${esc(d.name)}" onchange="adminEditSquadDrone('${dk}','name',this.value)"></td>
          <td><input style="width:55px${d.qty<0?';color:var(--red);border-color:var(--red)':''}" type="number" value="${d.qty}"${d.qty<0?' title="Баланс в минусе — борт списан без передачи со склада"':''} onchange="adminEditSquadDrone('${dk}','qty',parseInt(this.value)||0)">${d.qty<0?' <span style="color:var(--red)" title="минус = сигнал недостающего прихода">⚠</span>':''}</td>
          <td>${di===0?delCell:'&nbsp;'}</td>
        </tr>`;});
      }).join(''))(_keySeq(),_keySeq())}
      </tbody>
    </table>`:'<div style="color:var(--muted);padding:8px">Нет расчётов</div>';
}

// ===== Ручные коррекции наличия (type='adjust') =====
// Любая ручная правка qty (склад/расчёт) фиксируется записью движения 'adjust' со ЗНАКОВОЙ
// дельтой и причиной — чтобы НИ ОДНО изменение наличия не было невидимым, а syncAuditStock
// сводил баланс (дельта adjust входит в intake-сторону, см. _stockAuditCompute).
// Запрос причины (обязателен для правок/удалений). '' или отмена → null (правку не применять).
function adjustReason(what){
  const r=prompt('Причина коррекции количества'+(what?'\n('+what+')':'')+'\nОбязательно к заполнению:');
  return r&&r.trim()?r.trim():null;
}
// Корректирующая запись движения. delta — со знаком (+ приход/исправление вверх, − выбытие).
// location — squadKey расчёта либо 'склад' (сейчас squadKey = имя пилота; склад-семантика).
// Резолв через squadKeyOf (marshrut.js) ЗДЕСЬ — одна точка на всех вызывающих
// (adminEditStock/squadEditDrone/adminEditSquadDrone/_logAdminTransfer и т.д.).
function recordAdjust(name,delta,location,reason){
  if(!name||!delta)return;
  if(!state.transfers)state.transfers=[];
  const loc=squadKeyOf(location||''); // squadKey, сейчас = pilot (не-пилотские 'склад' — насквозь)
  const op=makeTransfer('adjust',{
    drone:name,qty:delta,location:loc,
    from:delta<0?loc:'',to:delta>0?loc:'',
    note:'коррекция: '+(reason||'')+' ['+(authUser.login||state.role||'admin')+']'
  });
  state.transfers.unshift(op);
  syncAddTransfer(op);
}
// Создание состава (новый расчёт/именование борта) — adjust без запроса причины (авто-нота):
// это не «коррекция», а установление наличия; раньше писалась фиктивная transfer-запись
// склад↔пилот, которую аудит как внутреннюю игнорировал (баланс не сходился).
function _logAdminTransfer(pilot,drone,delta,note){
  if(!pilot||!drone||delta===0)return;
  recordAdjust(drone,delta,pilot,note||'адм');
}

// ===== ПЕРЕИМЕНОВАНИЕ РАСЧЁТА/ПИЛОТА — КАНОНИЧЕСКОЕ (04.09.2026, блокер §2а) =====
// Аналог adminRenameModel, но для ЛОКАЦИЙ. Имя пилота — это одновременно ключ локации
// склада (squadKeyOf) и субъект статистики. Раньше переименование правило ТОЛЬКО
// squads[].pilot: наличие переезжало на новое имя, а журнал движений
// (t.pilot у loss, t.from/t.to у передач, t.location у adjust) оставался на старом —
// ledger и qty расходились сразу по двум парам на каждую модель расчёта.
// Правим атомарно ВСЕ вхождения + явная выгрузка (ambient-debounce тут недостаточен).
//
// _submittedBy НЕ трогаем намеренно: это логин автора записи, а не имя расчёта.
function _renamePilotApply(oldName,newName){
  const eqOld=v=>String(v||'').trim()===oldName;
  let n=0;
  (state.squads||[]).forEach(sq=>{ if(eqOld(sq.pilot)){sq.pilot=newName;n++;} });
  (state.flights||[]).forEach(f=>{ if(eqOld(f.pilot)){f.pilot=newName;n++;} }); // субъект статистики
  (state.transfers||[]).forEach(t=>{
    if(eqOld(t.pilot)){t.pilot=newName;n++;}       // loss — локация расчёта
    if(eqOld(t.from)){t.from=newName;n++;}         // передача — источник
    if(eqOld(t.to)){t.to=newName;n++;}             // передача — приёмник
    if(eqOld(t.location)){t.location=newName;n++;} // adjust (и будущий startbalance) — локация
  });
  // Коллизия имён = СЛИЯНИЕ расчётов: борта схлопываются по модели в первый расчёт.
  // Сравнение регистронезависимое — ledger нормализует локации (marshrut.js:37), и два
  // расчёта «Поп»/«поп» для него одна локация; оставить их раздельными = вечное расхождение.
  const nrm=v=>String(v||'').trim().toLowerCase();
  const same=(state.squads||[]).filter(sq=>nrm(sq.pilot)===nrm(newName));
  if(same.length>1){
    const first=same[0];
    first.drones=first.drones||[];
    same.slice(1).forEach(sq=>{
      if(!first.start_point&&sq.start_point)first.start_point=sq.start_point; // точка старта (гео) не теряется
      (sq.drones||[]).forEach(d=>{
        const nl=nrm(d.name);
        const ex=first.drones.find(x=>nrm(x.name)===nl);
        if(ex)ex.qty=(ex.qty||0)+(d.qty||0); else first.drones.push(d);
      });
      n++; // слияние — тоже правка (иначе вызывающий решит, что менять нечего, и не сохранит)
    });
    const drop=new Set(same.slice(1));
    state.squads=state.squads.filter(sq=>!drop.has(sq));
  }
  return n;
}
function adminRenamePilot(oldName,newName){
  if(!guardAdmin())return false;
  oldName=String(oldName||'').trim();
  newName=String(newName||'').trim();
  if(!oldName){alert('Не указан расчёт для переименования');return false;}
  if(!newName){alert('Имя расчёта не может быть пустым');return false;}
  if(oldName===newName)return true;
  const eqOld=v=>String(v||'').trim()===oldName;
  const cntSquad=(state.squads||[]).filter(sq=>eqOld(sq.pilot)).length;
  const cntFlight=(state.flights||[]).filter(f=>eqOld(f.pilot)).length;
  const cntTransfer=(state.transfers||[]).filter(t=>eqOld(t.pilot)||eqOld(t.from)||eqOld(t.to)||eqOld(t.location)).length;
  // Коллизию ищем регистронезависимо — как её увидит ledger (marshrut.js нормализует локации)
  const _n=v=>String(v||'').trim().toLowerCase();
  const mergeInto=(state.squads||[]).some(sq=>_n(sq.pilot)===_n(newName)&&_n(sq.pilot)!==_n(oldName));
  let msg='Переименовать расчёт «'+oldName+'» → «'+newName+'»?\n\n'
    +'Затронуто записей: расчёты '+cntSquad+', вылеты '+cntFlight+', журнал движений '+cntTransfer+'.\n'
    +'Имя расчёта — это ключ локации склада, поэтому журнал движений правится вместе с наличием.';
  if(mergeInto){
    msg='⚠ ВНИМАНИЕ: расчёт «'+newName+'» УЖЕ существует.\n'
      +'Это СЛИЯНИЕ двух расчётов в один (борта сложатся), а НЕ простое переименование.\n\n'+msg;
  }
  if(!confirm(msg))return false;
  if(mergeInto&&!confirm('Подтвердите СЛИЯНИЕ «'+oldName+'» в существующий «'+newName+'». Откат — только из .bak/экспорта.'))return false;

  // Включён ли сейчас «взгляд» именно этого расчёта — фиксируем ДО правки данных
  // (после неё старого имени в squads уже нет и определить по нему нельзя)
  const roleKey=String(state.role||'').slice(0,6)==='pilot:'?String(state.role).slice(6):'';
  const roleFollows=!!roleKey&&_rowN(roleKey)===_rowN(oldName);

  const n=_renamePilotApply(oldName,newName);

  // Явная синхронизация — как в adminRenameModel (операция атомарна у инициатора)
  saveLocalQuiet();          // localStorage без отложенного полного write
  syncBumpStockVersion();    // §11 — иначе поллинг затрёт правку
  syncPushStockSquads();     // stock/squads
  syncToCloud(true);         // flights+transfers полным неразрушающим write (id стабилен)

  logAction('admin','rename_pilot','Переименован расчёт «'+oldName+'» → «'+newName+'»'+(mergeInto?' (СЛИЯНИЕ)':'')+'; правок: '+n);
  // fillDataLists ОБЯЗАТЕЛЕН: селекты передачи (#transFrom/#transTo) и фильтр пилотов
  // строятся из state.squads один раз; со старым именем передача «от» расчёта ничего не
  // списала бы (ветка `if(sq)` в saveTransfer), но запись движения создала — разрыв инварианта.
  if(typeof fillDataLists==='function')fillDataLists(); // внутри и rebuildRoleSelector()
  // «Взгляд пилота» держит КЛЮЧ расчёта — после переименования ключ сменился, переносим
  // роль следом (иначе вид показывал бы «Пилот ?», а селектор перескочил бы на первую опцию).
  // Строго ПОСЛЕ fillDataLists: опции селектора уже с новым именем.
  if(roleFollows){
    const nr='pilot:'+squadKeyOf(newName);
    switchRole(nr);
    const _sel=document.getElementById('roleSwitch');
    if(_sel&&[..._sel.options].some(o=>o.value===nr))_sel.value=nr;
  }
  renderInventory(); renderDashboard(); renderTransfersLog();
  if(typeof renderFlights==='function')renderFlights();
  // Обе таблицы расчётов: имя расчёта входит в ключ строки борта (_droneRowKey) — после
  // переименования ключи в НЕперерисованной таблице устаревают (правка тогда не пройдёт
  // вовсе — резолвер вернёт null и покажет _rowGone; но лучше перерисовать сразу).
  if(typeof renderAdminSquads==='function')renderAdminSquads();
  if(typeof renderSquadEditor==='function')renderSquadEditor();
  if(typeof showSyncToast==='function')showSyncToast('✓ Расчёт «'+oldName+'» → «'+newName+'» (правок: '+n+')');
  return true;
}

function adminEditSquadPilot(key,val){
  if(!guardWrite())return;
  const {sq}=_squadRowByKey(key);   // ключ, а не индекс
  if(!sq){ _rowGone('расчёт',renderAdminSquads); return; }
  adminRenamePilot(sq.pilot,val);  // отказ/отмена — поле восстановит перерисовка из state
  renderAdminSquads();
}
function adminEditSquadDrone(key,field,val){
  if(!guardWrite())return;
  const {sq,drone:d}=_droneRowByKey(key);           // ключ «расчёт|модель», а не пара индексов
  if(!d){ _rowGone('борт расчёта',renderAdminSquads); return; }
  {
    const old=d[field];
    if(field==='qty'){
      const delta=(parseInt(val)||0)-d.qty;
      if(delta&&d.name){
        const reason=adjustReason(d.name+' у '+sq.pilot+': '+d.qty+'→'+(parseInt(val)||0));
        if(!reason){renderAdminSquads();return;} // отмена — восстановить поле
        recordAdjust(d.name,delta,sq.pilot,reason);
      }
    }
    else if(field==='name'){
      if(!_squadRenameDrone(sq,d,val,'адм')){renderAdminSquads();return;} // отказ/отмена — вернуть поле из state
      setTimeout(renderAdminSquads,0); // борт мог схлопнуться с одноимённым — перерисовать индексы
    }
    if(field!=='name')d[field]=val; // имя проставляет _squadRenameDrone (со схлопом дублей)
    if(old!==val)logAction('squad','edit','Расчёт '+(sq.pilot||'')+': '+(field==='name'?('борт '+(old||'(новый)')+' → '+val):('борт '+(d.name||'?')+' — кол-во '+old+' → '+val)));
  }
  saveLocal();
  syncBumpStockVersion();
  syncPushStockSquads();
}

// ===== ПЕРЕИМЕНОВАНИЕ БОРТА В РАСЧЁТЕ = ПЕРЕНОС ОСТАТКА (04.09.2026, блокер §2а) =====
// Раньше движение писалось ТОЛЬКО когда старое имя было пустым (_logAdminTransfer при
// !d.name) — переименование заполненного борта уводило qty на другую модель молча:
// наличие переезжало, журнал движений оставался на старой модели.
// Теперь непустое → непустое даёт ПАРУ adjust (−qty старой, +qty новой у того же
// расчёта) с обязательной причиной. Возвращает false, если правку применять нельзя.
function _squadRenameDrone(sq,d,newName,tag){
  if(!sq||!d)return false;
  const oldName=String(d.name||'').trim();
  newName=String(newName||'').trim();
  if(newName===oldName)return true;
  const q=d.qty||0;
  // Схлоп с уже существующим бортом той же модели в этом расчёте. Нужен ВО ВСЕХ ветках:
  // две строки одной модели в одном расчёте — одна и та же пара модель×локация, и в
  // таблице они получают один ключ (правка второй ушла бы в первую). Merge их всё равно
  // схлопывает, поэтому делаем это сразу и предсказуемо.
  const dedupe=()=>{
    const nl=_rowN(newName);
    let first=null;
    sq.drones=(sq.drones||[]).filter(x=>{
      if(_rowN(x.name)!==nl)return true;
      if(first){first.qty=(first.qty||0)+(x.qty||0);return false;}
      first=x;return true;
    });
  };
  if(!oldName){ // именование НОВОГО борта — установление наличия, причину не спрашиваем
    d.name=newName;
    if(newName&&q>0)_logAdminTransfer(sq.pilot,newName,q,tag||'адм');
    dedupe();
    return true;
  }
  if(!newName){alert('Название борта не может быть пустым');return false;}
  if(q===0){ d.name=newName; dedupe(); return true; } // переносить нечего
  const reason=adjustReason('борт у '+sq.pilot+': '+oldName+' ×'+q+' → '+newName
    +'\nОстаток переносится с модели на модель — будет создана пара коррекций.'
    +'\nМассовое переименование модели во всех данных: Администратор → Данные.');
  if(!reason)return false;
  recordAdjust(oldName,-q,sq.pilot,'перенос остатка в «'+newName+'»: '+reason); // локация — squadKeyOf внутри recordAdjust
  recordAdjust(newName, q,sq.pilot,'перенос остатка из «'+oldName+'»: '+reason);
  d.name=newName;
  dedupe();
  return true;
}
function adminDeleteSquad(key){
  if(!guardWrite())return;
  const {sq,si}=_squadRowByKey(key);                // ключ, а не индекс
  if(!sq){ _rowGone('расчёт',renderAdminSquads); return; }
  const pName=sq.pilot;
  const held=(sq.drones||[]).filter(d=>d.name&&d.qty);
  let reason='';
  if(held.length){
    reason=adjustReason('удаление расчёта '+pName+' — спишутся борта');
    if(!reason)return;
    held.forEach(d=>recordAdjust(d.name,-d.qty,pName,'удаление расчёта: '+reason));
  } else {
    if(!confirm('Удалить расчёт '+pName+'?'))return;
  }
  state.squads.splice(si,1);
  logAction('squad','delete','Удалён расчёт '+pName+(reason?' — '+reason:''));
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
  // Два расчёта с одним именем — для журнала движений и для облачного merge это ОДНА
  // локация (они схлопнутся при ближайшей синхронизации), а в таблице до этого видны
  // порознь. Не создаём: иначе операции над «вторым» уходят в первый.
  if((state.squads||[]).some(sq=>_rowN(sq.pilot)===_rowN(p))){
    alert('Расчёт «'+p+'» уже есть — имя расчёта это ключ его склада, двух одноимённых не бывает.\nДобавьте борта в существующий расчёт или назовите новый иначе.');
    return;
  }
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
      syncStockForgetBase(); // импорт = полная замена снимка, не дельта (без 3-way merge)
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
  syncStockForgetBase(); // иначе сверка при загрузке восстановила бы склад из базы
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
  // Сначала считаем без мутации — снятие записи возвращает наличие, это надо подтвердить
  const keep=[], drop=[];
  (state.transfers||[]).forEach(t=>{
    if(t.type!=='loss'){keep.push(t);return;}
    const key=(t.pilot||'').toLowerCase()+'|'+(t.drone||'').toLowerCase()+'|'+(t.date||'');
    (lostFlightKeys.has(key)?keep:drop).push(t);
  });
  const removed=drop.length;
  if(!removed){
    setStatus('saveStatus','✓ Осиротевших записей не найдено — журнал чистый','muted');
    return;
  }
  // Замороженные (до-чертовые) записи наличие не вернут — в диалоге обещать их нельзя
  const dropLive=drop.filter(t=>!_isPreCutTransfer(t));
  const frozenN=drop.length-dropLive.length;
  const back=(dropLive.length?_describeRestored(dropLive):'— (нечего возвращать)')
    +(frozenN?'\n(ещё '+frozenN+' записей — до черты: снимутся, но наличие не изменят)':'');
  // «Сирота» определяется по state.flights — если журнал вылетов загружен НЕ полностью
  // (не доехала синхронизация, часть записей не расшифровалась), живые потери выглядят
  // осиротевшими, и чистка не только сотрёт движения, но и вернёт борта в наличие.
  if(!confirm('Найдено '+removed+' осиротевших записей о потерях (вылета с такой потерей нет).\n\n'
    +'Записи будут удалены, а списанные ими борта ВЕРНУТСЯ в наличие:\n'+back
    +'\n\nСнятое движение обязано вернуть остаток — иначе журнал и наличие разойдутся.'
    +'\n\n⚠ Запускать только на ПОЛНОСТЬЮ синхронизированном устройстве: «сирота» ищется по\n'
    +'загруженному журналу вылетов ('+(state.flights||[]).length+' записей). Если вылеты доехали не все —\n'
    +'живые потери будут приняты за осиротевшие.'))return;
  state.transfers=keep;
  const restored=_compensateRemovedLosses(drop); // симметрия ledger↔qty
  // tombstone удалённых loss-записей — иначе неразрушающий merge/поллинг вернёт их из облака
  syncPublishTombstones(drop.map(t=>t.id)); // Путь Б: публикуем удаление осиротевших потерь в облако
  saveLocal();
  syncBumpStockVersion();
  syncPushStockSquads();
  renderInventory(); renderDashboard(); renderTransfersLog();
  logAction('transfer','clean_orphans','Удалено '+removed+' осиротевших записей о потерях; возвращено в наличие: '+restored+' ('+back+')');
  setStatus('saveStatus',
    `✓ Удалено ${removed} осирот. ${removed===1?'запись':'записей'}, возвращено бортов: ${restored} — ${new Date().toLocaleString('ru')}`,'ok');
}

// Удаляет ДУБЛИ записей о потерях: type='loss' с одинаковыми date+time+pilot+drone
// (наследие бага двойного списания до Risk 4 — каждое устройство писало свою
// loss-запись, пока флаг _lossWritten не возвращался в облако; в бэкапах находили
// до 100+ копий одной потери). Первая запись в массиве остаётся, id остальных
// уходят в tombstones — иначе неразрушающий merge/поллинг вернёт их из облака.
function adminDedupeLossTransfers(){
  // По УЧЁТКЕ admin (isAdminAccount), не по роли представления: массовое удаление
  // записей о потерях не должно зависеть от «взгляда» переключателя (12.08.2026)
  if(!isAdminAccount()){alert('Доступно только администратору');return;}
  if(!(state.transfers||[]).some(t=>t.type==='loss')){
    setStatus('saveStatus','Записей о потерях в журнале нет','muted');
    return;
  }
  // Сначала считаем (без мутации) — чтобы показать число в подтверждении
  const seen=new Set();
  const drop=[];
  const kept=[];
  (state.transfers||[]).forEach(t=>{
    if(t.type!=='loss'){kept.push(t);return;}
    const key=(t.date||'')+'|'+(t.time||'')+'|'+(t.pilot||'').toLowerCase()+'|'+(t.drone||'').toLowerCase();
    if(seen.has(key)){drop.push(t);return;}
    seen.add(key);kept.push(t);
  });
  const removed=drop.length;
  if(!removed){
    setStatus('saveStatus','✓ Дублей потерь не найдено — журнал чистый','muted');
    return;
  }
  // Замороженные (до-чертовые) записи наличие не вернут — в диалоге обещать их нельзя
  const dropLive=drop.filter(t=>!_isPreCutTransfer(t));
  const frozenN=drop.length-dropLive.length;
  const back=(dropLive.length?_describeRestored(dropLive):'— (нечего возвращать)')
    +(frozenN?'\n(ещё '+frozenN+' записей — до черты: снимутся, но наличие не изменят)':'');
  if(!confirm('Найдено '+removed+' дублей записей о потерях (одинаковые дата+время+пилот+борт).\n\n'
    +'Оставить по одной записи в каждой группе, остальные удалить?'))return;
  // Компенсация — ОТДЕЛЬНЫЙ вопрос, и ответ на него знает только оператор.
  // Снятое движение −qty обязано вернуть остаток (симметрия ledger↔qty, §2а 04.09.2026),
  // НО в эпоху двойной записи (до Risk 4) на N одинаковых loss-записей приходилось одно
  // списание qty — там возврат раздует наличие. Провенанс по записи неразличим.
  const restore=confirm('Вернуть списанные дублями борта в наличие?\n\n'+back+'\n\n'
    +'ДА — если каждый дубль реально списывал борт (нормальный случай: снятое движение возвращает остаток).\n'
    +'НЕТ — если дубли пришли из эпохи двойной записи (до 04.06.2026), когда списание было однократным:\n'
    +'тогда возврат раздует наличие.');
  syncPublishTombstones(drop.map(t=>t.id)); // Путь Б: публикуем удаление дублей потерь в облако
  state.transfers=kept;
  const restored=restore?_compensateRemovedLosses(drop):0;
  // Немедленная выгрузка полным write (merge исключит tombstoned-записи);
  // saveLocalQuiet — чтобы не плодить второй отложенный push через debounce
  saveLocalQuiet();
  if(restored){ syncBumpStockVersion(); syncPushStockSquads(); } // наличие изменилось — выгружаем явно
  syncToCloud(true);
  renderInventory(); renderDashboard(); renderTransfersLog();
  logAction('transfer','dedupe','Удалено '+removed+' дублей записей о потерях; возвращено в наличие: '+restored+(restored?' ('+back+')':' (оператор отказался от возврата)'));
  setStatus('saveStatus','✓ Удалено '+removed+' дублей потерь, возвращено бортов: '+restored+' — '+new Date().toLocaleString('ru'),'ok');
}

// ===== ПЕРЕИМЕНОВАНИЕ МОДЕЛИ БПЛА (вариант А — каноническое, ВСЕ вхождения вкл. transfers) =====
// Атомарно у инициатора: правит stock/squads/flights/transfers + DRONE_CATALOG, затем явная
// выгрузка (stock/squads через _sv-бамп; flights/transfers — полный неразрушающий write
// syncPushAll, id стабилен → merge не вернёт старые имена). Если newName уже существует как
// отдельная модель — это СЛИЯНИЕ: второе подтверждение + схлопываем дубль-строки (склад по
// name+status, дроны расчёта по name). Замена только ТОЧНОГО совпадения имени, не подстроки.
function adminRenameModel(oldName,newName){
  if(!guardAdmin())return;
  oldName=String(oldName||'').trim();
  newName=String(newName||'').trim();
  if(!oldName){alert('Не выбрана модель для переименования');return;}
  if(!newName){alert('Укажите новое название модели');return;}
  if(oldName===newName){alert('Новое название совпадает со старым');return;}

  const eqOld=v=>String(v||'').trim()===oldName;
  const eqNew=v=>String(v||'').trim()===newName;

  // Аудит вхождений старого имени (для подтверждения и проверки существования)
  const cntStock=(state.stock||[]).filter(d=>eqOld(d.name)).length;
  const cntSquad=(state.squads||[]).reduce((s,sq)=>s+(sq.drones||[]).filter(d=>eqOld(d.name)).length,0);
  const cntFlight=(state.flights||[]).filter(f=>eqOld(f.drone)).length;
  const cntTransfer=(state.transfers||[]).filter(t=>eqOld(t.drone)||eqOld(t.give)||eqOld(t.get)).length;
  const total=cntStock+cntSquad+cntFlight+cntTransfer;
  if(!total){alert('Модель «'+oldName+'» не найдена ни в складе, ни в расчётах, ни в вылетах, ни в журнале передач');return;}

  // Коллизия: newName уже существует как отдельная модель → это СЛИЯНИЕ, не переименование
  const mergeInto=(state.stock||[]).some(d=>eqNew(d.name))
    ||(state.squads||[]).some(sq=>(sq.drones||[]).some(d=>eqNew(d.name)))
    ||(state.flights||[]).some(f=>eqNew(f.drone))
    ||(state.transfers||[]).some(t=>eqNew(t.drone)||eqNew(t.give)||eqNew(t.get));

  let msg='Переименовать модель «'+oldName+'» → «'+newName+'»?\n\n'
    +'Затронуто записей: склад '+cntStock+', расчёты '+cntSquad+', вылеты '+cntFlight+', передачи '+cntTransfer+' (всего '+total+').\n'
    +'Исторические передачи правятся тоже — аудит целостности останется сведённым.';
  if(mergeInto){
    msg='⚠ ВНИМАНИЕ: модель «'+newName+'» УЖЕ существует.\n'
      +'Это СЛИЯНИЕ двух моделей в одну (количества сложатся, дубль-строки схлопнутся), а НЕ простое переименование.\n\n'+msg;
  }
  if(!confirm(msg))return;
  if(mergeInto&&!confirm('Подтвердите СЛИЯНИЕ «'+oldName+'» в существующую «'+newName+'». Откат — только из .bak/экспорта.'))return;

  // 1. Локальные данные — точное совпадение oldName
  let n=0;
  (state.stock||[]).forEach(d=>{ if(eqOld(d.name)){d.name=newName;n++;} });
  (state.squads||[]).forEach(sq=>(sq.drones||[]).forEach(d=>{ if(eqOld(d.name)){d.name=newName;n++;} }));
  (state.flights||[]).forEach(f=>{ if(eqOld(f.drone)){f.drone=newName;n++;} });
  (state.transfers||[]).forEach(t=>{
    if(eqOld(t.drone)){t.drone=newName;n++;}
    if(eqOld(t.give)){t.give=newName;n++;}
    if(eqOld(t.get)){t.get=newName;n++;}
  });

  // Схлопнуть дубль-строки (появляются при слиянии; при обычном переименовании — no-op)
  // Склад: по name+status, qty суммируется в первую строку (id/_sv первой сохраняются)
  const stSeen={};
  state.stock=(state.stock||[]).filter(d=>{
    if(!eqNew(d.name))return true;
    const k=d.status||'bg';
    if(stSeen[k]){stSeen[k].qty=(stSeen[k].qty||0)+(d.qty||0);return false;}
    stSeen[k]=d;return true;
  });
  // Расчёты: по name внутри расчёта
  (state.squads||[]).forEach(sq=>{
    let first=null;
    sq.drones=(sq.drones||[]).filter(d=>{
      if(!eqNew(d.name))return true;
      if(first){first.qty=(first.qty||0)+(d.qty||0);return false;}
      first=d;return true;
    });
  });

  // 2. DRONE_CATALOG (const-массив — мутируем содержимое). Нет старого имени — молча пропустить.
  const ci=DRONE_CATALOG.indexOf(oldName);
  if(ci>=0){ if(DRONE_CATALOG.indexOf(newName)<0)DRONE_CATALOG[ci]=newName; else DRONE_CATALOG.splice(ci,1); }

  // 3. Сохранение + ЯВНАЯ синхронизация (не ambient-debounce — операция атомарна у инициатора)
  saveLocalQuiet();          // localStorage без отложенного push
  syncBumpStockVersion();    // §11 — иначе поллинг затрёт правку (last-write-wins по _sv)
  syncPushStockSquads();     // stock/squads
  syncToCloud(true);         // flights+transfers полным неразрушающим write (id стабилен)

  // 4. След в журнале действий
  logAction('admin','rename_model','Переименована модель «'+oldName+'» → «'+newName+'»'+(mergeInto?' (СЛИЯНИЕ)':'')+'; правок: '+n);

  // 5. UI
  renderInventory(); renderDashboard(); renderTransfersLog();
  if(typeof renderAdminStock==='function')renderAdminStock();
  if(typeof renderAdminSquads==='function')renderAdminSquads();
  if(typeof renderAdminFlights==='function')renderAdminFlights();
  renderRenameModelSelect();
  const ne=document.getElementById('renameModelNew'); if(ne)ne.value='';
  setStatus('saveStatus','✓ Модель «'+oldName+'» → «'+newName+'»: '+n+' правок'+(mergeInto?' (слияние)':'')+' — '+new Date().toLocaleString('ru'),'ok');
}

// Заполнить выпадающий список моделей для переименования (живые имена из всего парка)
function renderRenameModelSelect(){
  const sel=document.getElementById('renameModelOld');
  if(!sel)return;
  const cur=sel.value;
  const models=[...new Set([
    ...((state.stock||[]).map(d=>d.name)),
    ...((state.squads||[]).flatMap(sq=>(sq.drones||[]).map(d=>d.name))),
    ...((state.flights||[]).map(f=>f.drone)),
    ...((state.transfers||[]).flatMap(t=>[t.drone,t.give,t.get]))
  ].filter(Boolean).map(s=>String(s).trim()))].sort((a,b)=>a.localeCompare(b,'ru'));
  sel.innerHTML='<option value="">— выберите модель —</option>'+models.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
  if(models.includes(cur))sel.value=cur;
}

// Запуск из формы (адм. вкладка «Данные»)
function adminRenameModelRun(){
  adminRenameModel(document.getElementById('renameModelOld').value,document.getElementById('renameModelNew').value);
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
    if(!models[k])models[k]={model:String(name).trim(),intake:0,onhandAll:0,onhandActive:0,lost:0,exGive:0,lossSum:0,writeoffT:0,nbgT:0,adjust:0};
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
    else if(t.type==='adjust'){ const m=get(t.drone); if(m)m.adjust+=t.qty||0; } // знаковая дельта ручной коррекции
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
    const intakeAdj=m.intake+m.adjust; // ручные коррекции — на сторону прихода (знаковые)
    return {
      model:m.model, intake:m.intake, adjust:m.adjust, onhand:m.onhandAll, lost:m.lost, outflow,
      writeoff_t:m.writeoffT, nbg_t:m.nbgT,
      diff_A:intakeAdj-(m.onhandAll+outflow),      // lost-строки = наличие
      diff_B:intakeAdj-(m.onhandActive+outflow),   // lost-строки = дубль loss-передач
      diff_adj:intakeAdj-(m.onhandAll+outflow+m.writeoffT) // diff_A + списания через форму передачи
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
// ЧЕРТА: легаси-приходы после неё ВРЕДНЫ — они добавляют движение, не трогая наличие,
// и ledger уезжает вверх ровно на внесённое количество (расхождение, неотличимое от бага
// семантики). Дыры в приходе до черты закрыты стартовым остатком, после — коррекцией.
function _cutBlocksLegacyFix(tag){
  if(typeof marshrutCutTs!=='function'||!marshrutCutTs())return false;
  console.error('['+tag+'] ОТКАЗ: черта проведена — легаси-приходы больше не оформляются.\n'+
    'Они попали бы в баланс, не изменив наличие. Недостающий приход после черты оформляется '+
    'обычным поступлением (Склад → Добавить БПЛА) или коррекцией количества.');
  return true;
}
function syncStockLegacyPlan(){
  if(_cutBlocksLegacyFix('PLAN'))return null;
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
  // По УЧЁТКЕ admin (isAdminAccount), не по роли представления: создание легаси-приходов
  // в журнале движений не должно зависеть от «взгляда» переключателя (12.08.2026)
  if(!isAdminAccount()){alert('Доступно только администратору');return;}
  if(_cutBlocksLegacyFix('FIX'))return null;
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

// ===================== ЧЕРТА (МАРШРУТ, Этап 3) =====================
// Стартовый остаток `startbalance` из текущего наличия; вся история ДО черты
// замораживается и в getBalance больше не входит (отсечка — в _marshrutWalk по
// моменту записи, marshrut.js). Пишущая часть намеренно здесь, а не в marshrut.js:
// тот остаётся read-only вычислителем; образец пары «план / применение» —
// syncStockLegacyPlan + syncStockFixLegacy выше.
//
// ПОРЯДОК (подробно — ДИАГНОСТИКА_ЭТАП3_2026-09-04.md §7):
//   1) все устройства синхронизированы, очередь пуста, работа остановлена;
//   2) бэкап state в IndexedDB;
//   3) syncAuditStock() 15/15 и marshrutCompare() = базовая линия;
//   4) marshrutCutPlan() — сверить пары и цифры ГЛАЗАМИ (и с натурой);
//   5) marshrutCut(true);
//   6) приёмка: marshrutCompare() → 0 расхождений / 0 минусов / total = N из плана.

// Сухой план черты. ТОЛЬКО ЧТЕНИЕ. Печатает по локациям, что станет startbalance.
// N — ожидаемое `total` в marshrutCompare после черты (число пар qty-карты: ledger
// после черты ⊆ пары плана ⊆ пары qty-карты).
function marshrutCutPlan(quiet){
  if(typeof _marshrutQtyMap!=='function'){ console.error('[ЧЕРТА] marshrut.js не загружен'); return null; }
  const N=_mNorm, qtyMap=_marshrutQtyMap();
  const rows=Object.keys(qtyMap).map(k=>qtyMap[k]);
  const plan=[], zero=[], sink=[], neg=[], bad=[];
  rows.forEach(r=>{
    // assert: пустая модель/локация в ledger не существует (_mAdd её отбрасывает молча) —
    // такую пару нельзя завести стартовым остатком, она сразу даст расхождение
    if(!N(r.model)||!N(r.location)){ bad.push(r); return; }
    if(MARSHRUT_SINK_LOCS.indexOf(N(r.location))>=0){ if(r.qty)sink.push(r); return; } // выбытие — не остаток
    if(r.qty<0){ neg.push(r); return; }
    if(r.qty===0){ zero.push(r); return; }   // нулевой startbalance не существует (_mAdd)
    plan.push(r);
  });
  const byLoc=(a,b)=>a.location.localeCompare(b.location,'ru')||a.model.localeCompare(b.model,'ru');
  plan.sort(byLoc); neg.sort(byLoc); sink.sort(byLoc); zero.sort(byLoc);
  const already=(state.transfers||[]).filter(t=>t&&t.type==='startbalance').length;
  // Записи БЕЗ id и БЕЗ штампа: сейчас они до-чертовые (фолбэк по дате), но при первой же
  // полной выгрузке syncPushAll выдаст им id с ТЕКУЩИМ timestamp — и после черты они
  // «омолодятся» до пост-чертовых, а их эффект уже внутри стартового остатка (двойной счёт).
  // `!t.id` (а не `t.id==null`): syncPushAll выдаёт id по тому же условию — '' и 0 тоже
  const noId=(state.transfers||[]).filter(t=>t&&!t.id&&t._cut==null);
  // Штампы «из будущего» — часы устройства спешат. Такая запись создана ДО черты (её
  // эффект уже в наличии), но окажется ПОСЛЕ неё по времени → двойной счёт.
  const future=(state.transfers||[]).filter(t=>t&&_mRecTs(t)>Date.now()+60000);
  // Пустое имя модели/расчёта: пара молча выпадает из ОБЕИХ моделей (qty-карта её
  // отбрасывает, ledger тоже) — инвариант цел, но оператор борта не увидит.
  const empty=[];
  (state.stock||[]).forEach(s=>{ if(!N(s.name)&&(s.qty||0)!==0)empty.push({где:'склад ('+(s.status||'')+')',qty:s.qty}); });
  (state.squads||[]).forEach(sq=>(sq.drones||[]).forEach(d=>{
    if((!N(d.name)||!N(sq.pilot))&&(d.qty||0)!==0)empty.push({где:'расчёт «'+(sq.pilot||'')+'»',модель:d.name||'(пусто)',qty:d.qty});
  }));
  const out={plan,neg,zero,sink,bad,noId,future,empty,total:rows.length,already};
  if(quiet)return out;

  console.log('[ЧЕРТА] План: пар со стартовым остатком '+plan.length+
    ', бортов '+plan.reduce((a,r)=>a+r.qty,0)+'. Ожидаемое total в marshrutCompare после черты: N = '+rows.length);
  [...new Set(plan.map(r=>r.location))].forEach(l=>{
    console.log('— локация: '+l);
    console.table(plan.filter(r=>r.location===l).map(r=>({модель:r.model,qty:r.qty,'по факту (заполнить)':''})));
  });
  if(zero.length)console.log('[ЧЕРТА] Нулевые (в черту НЕ идут, пара останется с 0=0): '+zero.map(r=>r.model+'@'+r.location).join(', '));
  if(neg.length){ console.warn('[ЧЕРТА] ⚠ ОТРИЦАТЕЛЬНЫЕ остатки — черта их не заводит. Закройте приходом/коррекцией ДО черты (ADR §4) либо проводите с {carryNegative:true}:'); console.table(neg); }
  if(sink.length){ console.warn('[ЧЕРТА] ⚠ Строки выбытия (статус «Списан») с ненулевым qty — стартового остатка у них нет, после черты дадут расхождение. Разберите ДО черты:'); console.table(sink); }
  if(bad.length){ console.error('[ЧЕРТА] ⚠ Пары с пустой моделью/локацией — их ledger не примет:'); console.table(bad); }
  if(noId.length)console.warn('[ЧЕРТА] ⚠ Движений без id: '+noId.length+' — при первой полной выгрузке им выдадут id с текущим временем, и после черты они станут «пост-чертовыми» (двойной счёт). Сделайте syncToCloud(true), дождитесь выгрузки и повторите план.');
  if(future.length){ console.error('[ЧЕРТА] ⚠ Движения со штампом ИЗ БУДУЩЕГО ('+future.length+') — часы устройства-автора спешат. Их эффект уже в наличии, но по времени они окажутся ПОСЛЕ черты → двойной счёт. Разберитесь с часами и записями:'); console.table(future.map(t=>({id:t.id,тип:t.type,модель:t.drone,штамп:new Date(_mRecTs(t)).toLocaleString('ru')}))); }
  if(empty.length){ console.warn('[ЧЕРТА] ⚠ Строки с пустым именем модели/расчёта и ненулевым количеством — в учёте их не видит НИ ОДНА модель (стартового остатка не получат):'); console.table(empty); }
  if(typeof pendingQueue!=='undefined'&&pendingQueue&&typeof pendingQueue.count==='function'&&pendingQueue.count())
    console.error('[ЧЕРТА] ⚠ Очередь отправки НЕ пуста ('+pendingQueue.count()+') — часть движений ещё не в облаке. Дождитесь доставки.');
  if(already)console.warn('[ЧЕРТА] ⚠ startbalance уже есть ('+already+' шт.) — черта проводилась, повтор задвоит остаток.');
  console.log('[ЧЕРТА] СУХОЙ ПРОГОН — ничего не создано. Выполнение: marshrutCut(true)');
  return out;
}

// Провести черту. Без аргумента — сухой прогон. marshrutCut(true) — выполнить.
// opts.carryNegative — перенести отрицательные остатки как есть (по умолчанию отказ).
function marshrutCut(confirm,opts){
  if(!isAdminAccount()){alert('Черта проводится только с админской учётки');return;}
  opts=opts||{};
  // ГЕЙТ ПО ДАННЫМ, не по устройству (урок `_mig_`: per-device флаг дал 6 прогонов миграции)
  const already=(state.transfers||[]).filter(t=>t&&t.type==='startbalance');
  if(already.length){
    console.error('[ЧЕРТА] ОТКАЗ: черта уже проведена — в журнале '+already.length+' записей startbalance от '+
      new Date(marshrutCutTs()).toLocaleString('ru')+'. Повтор задвоил бы стартовый остаток.');
    return null;
  }
  const p=marshrutCutPlan(true);
  if(!p)return null;
  if(p.bad.length){ console.error('[ЧЕРТА] ОТКАЗ: есть пары с пустой моделью/локацией — сначала почините их.'); console.table(p.bad); return null; }
  if(typeof pendingQueue!=='undefined'&&pendingQueue&&typeof pendingQueue.count==='function'&&pendingQueue.count()){
    console.error('[ЧЕРТА] ОТКАЗ: очередь отправки не пуста ('+pendingQueue.count()+'). Часть движений ещё не доехала до облака — черта, построенная из такого наличия, заморозит их навсегда. Дождитесь доставки (индикатор «в очереди») и повторите.');
    return null;
  }
  if(p.future.length){ console.error('[ЧЕРТА] ОТКАЗ: '+p.future.length+' движений со штампом из будущего (часы устройства-автора спешат) — после черты они дали бы двойной счёт. Разберитесь с ними и повторите.'); console.table(p.future.map(t=>({id:t.id,тип:t.type,модель:t.drone}))); return null; }
  if(p.noId.length){ console.error('[ЧЕРТА] ОТКАЗ: '+p.noId.length+' движений без id. При первой полной выгрузке им выдадут id с текущим временем — после черты они станут «пост-чертовыми», хотя их эффект уже внутри стартового остатка (двойной счёт). Выполните syncToCloud(true), дождитесь выгрузки, повторите.'); return null; }
  if(p.sink.length){ console.error('[ЧЕРТА] ОТКАЗ: строки со статусом «Списан» имеют ненулевой остаток — у выбытия стартового остатка нет, после черты они дадут вечное расхождение. Разберите их (списать по-настоящему либо обнулить), затем повторите.'); console.table(p.sink); return null; }
  if(p.neg.length&&!opts.carryNegative){
    console.error('[ЧЕРТА] ОТКАЗ: есть отрицательные остатки. Черта заводит ВЕРНЫЙ остаток из инвентаризации — '+
      'закройте дыру приходом (недостающая выдача) или коррекцией (ошибочная запись) ДО черты. '+
      'Осознанно перенести минус через черту: marshrutCut(true,{carryNegative:true})');
    console.table(p.neg); return null;
  }
  const rows=opts.carryNegative?p.plan.concat(p.neg):p.plan;
  if(!rows.length){ console.error('[ЧЕРТА] ОТКАЗ: заводить нечего — наличие пусто.'); return null; }

  if(!confirm){
    marshrutCutPlan(); // печать полного плана
    console.log('[ЧЕРТА] СУХОЙ ПРОГОН. Будет создано записей startbalance: '+rows.length+
      '. Наличие (qty) НЕ изменится. Выполнение: marshrutCut(true)');
    return rows;
  }

  const ts=Date.now(), date=todayISO(), time=nowHM();
  const note='стартовый остаток (черта '+date+')';
  // Детерминированные id <CUT_TS>_sb_<n>: предсказуемы и парсятся _transferTs.
  // Идемпотентность — гейт по данным выше плюс регламент (работа остановлена):
  // на разных устройствах CUT_TS различался бы, серверный дедуп по id не спас бы.
  const created=rows.map((r,i)=>makeTransfer('startbalance',{
    id: ts+'_sb_'+i,
    _cut: ts,                       // сама черта: момент записи = момент черты
    drone:r.model, qty:r.qty, location:r.location,
    to:r.location, from:'',         // to — для _marshrutWalk и предиката loadLocal; from — чтобы не печатать undefined
    date, time, note
  }));
  if(!state.transfers)state.transfers=[];
  created.forEach(op=>state.transfers.unshift(op));
  // saveLocalQuiet, НЕ saveLocal: отложенный полный write (writeAll) обнулил бы append_ts
  // всему листу transfers, и свежие записи выпали бы из дельта-поллинга других устройств.
  saveLocalQuiet();
  created.forEach(op=>syncAddTransfer(op)); // append-путь: append_ts>0, доставка очередью
  logAction('admin','marshrut_cut','ЧЕРТА (Этап 3): создано '+created.length+' записей стартового остатка, бортов '+
    created.reduce((a,o)=>a+(o.qty||0),0)+'; момент черты '+new Date(ts).toISOString());
  renderTransfersLog(); renderInventory(); renderDashboard();
  console.log('[ЧЕРТА] ✅ Проведена. Записей: '+created.length+', бортов: '+created.reduce((a,o)=>a+(o.qty||0),0)+
    '. Момент черты: '+new Date(ts).toLocaleString('ru'));
  console.log('[ЧЕРТА] ПРИЁМКА: marshrutCompare() → 0 расхождений / '+(opts.carryNegative?p.neg.length+' минусов (перенесены осознанно)':'0 минусов')+
    ' / total = '+p.total+'.  syncAuditStock() → без изменений (startbalance старому аудиту неизвестен, qty не менялся).');
  return created;
}

// ============ DASHBOARD ============
// ===== МЕДАЛИ ПИЛОТОВ (Обзор → Расчёты) =====
// Каталог: id → {icon, name, color}. Текст описания (desc) формируется
// динамически с конкретными цифрами в calcPilotMedals.
const MEDALS = {
  raidback:  {icon:'🎖️', name:'Дальний рейд',  color:'#b45309'},
  longshot:  {icon:'🚀', name:'Дальнобойщик', color:'#6366f1'},
  workhorse: {icon:'⚡', name:'Трудяга',      color:'#f59e0b'},
  sniper:    {icon:'🥇', name:'Снайпер',      color:'#eab308'},
  thrifty:   {icon:'🛡️', name:'Бережливый',   color:'#10b981'},
  streak:    {icon:'🔥', name:'На волне',     color:'#ef4444'},
  veteran:   {icon:'💎', name:'Ветеран',      color:'#06b6d4'},
  progress:  {icon:'📈', name:'Прогресс',     color:'#22c55e'},
  bestday:   {icon:'🌟', name:'Лучший день',  color:'#a855f7'},
  raid:      {icon:'🎯', name:'Дальний вылет', color:'#ec4899'},
};

// ISO-дата n дней назад от текущего момента
function medalIsoDaysAgo(n){ return localISO(new Date(Date.now()-n*864e5)); }
// Есть ли у пилота ≥1 вылет в периоде [from, to): from включительно, to (ISO)
// исключительно; to=null → без верхней границы. Гейт холодного старта для
// двухпериодных (сравнение текущий vs прошлый) медалей — см. 📈 Прогресс.
function pilotActiveInPeriod(pilot, from, to){
  return (state.flights||[]).some(f=>f.pilot===pilot && f.date && f.date>=from && (!to || f.date<to));
}
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

  // 🎖️ Дальний рейд — рекорд дальности среди ВЕРНУВШИХСЯ (returned==='yes'): далеко И обратно
  if(hasGeo){
    const c=pilots.map(p=>{ const far=at(p).filter(x=>x.range_km!=null&&x.returned==='yes').sort((a,b)=>b.range_km-a.range_km)[0]; return {pilot:p, value:far?far.range_km:null, _f:far}; });
    const r=nomRatioTop(c);
    if(r) w.raidback={pilot:r.pilot, km:r.value, desc:`Самый дальний вылет с возвратом борта среди всех пилотов: ${r.value} км${r._f&&r._f.date?` (${medalFmtDate(r._f.date)})`:''}.`};
  }
  // 🚀 Дальнобойщик — рекорд дальности одного вылета (нужно гео; возврат не учитывается)
  if(hasGeo){
    const c=pilots.map(p=>{ const far=at(p).filter(x=>x.range_km!=null).sort((a,b)=>b.range_km-a.range_km)[0]; return {pilot:p, value:far?far.range_km:null, _f:far}; });
    const r=nomRatioTop(c);
    if(r) w.longshot={pilot:r.pilot, km:r.value, desc:`Абсолютный рекорд дальности одного вылета среди всех пилотов: ${r.value} км${r._f&&r._f.date?` (${medalFmtDate(r._f.date)})`:''}.`};
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
  // 📈 Прогресс — рост к прошлой неделе (мин. +3). Гейт холодного старта:
  // выдаётся ТОЛЬКО если у пилота есть активность в ОБОИХ периодах (текущая И
  // прошлая неделя ≥1 вылет) — иначе «рост с 0» у новичка/вернувшегося из
  // отпуска ложно срабатывал бы как лучшая динамика.
  {
    const thisW0=medalIsoDaysAgo(6), prevW0=medalIsoDaysAgo(13);
    const thisCnt=p=>flights.filter(f=>f.pilot===p && f.date>=thisW0).length;
    const prevCnt=p=>flights.filter(f=>f.pilot===p && f.date>=prevW0 && f.date<thisW0).length;
    const c=pilots.map(p=>{
      const both=pilotActiveInPeriod(p, thisW0, null) && pilotActiveInPeriod(p, prevW0, thisW0);
      const g=thisCnt(p)-prevCnt(p);
      return {pilot:p, value:(both && g>=3)?g:null};
    });
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
  ['raidback','longshot','workhorse','sniper','thrifty','progress','bestday'].forEach(id=>{
    if(w[id] && w[id].pilot===pilot) add(id, w[id].desc);
  });
  // 🎖️ Дальний рейд старше 🚀 Дальнобойщика, но 🚀 убираем ТОЛЬКО при равной дальности
  // (рекордный вылет и так вернулся → 🚀 дублирует 🎖️). Если 🚀 дальше (рекорд был в один
  // конец) — это отдельное достижение, показываем обе.
  if(w.raidback&&w.longshot&&w.raidback.pilot===pilot&&w.longshot.pilot===pilot&&w.raidback.km===w.longshot.km){
    const i=out.findIndex(m=>m.id==='longshot'); if(i>=0) out.splice(i,1);
  }

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
  raidback:  {icon:'🎖️', name:'Дальний рейд'},
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

  // 🎖️ Дальний рейд — самый дальний одиночный вылет С ВОЗВРАТОМ за всё время
  {
    const c=pilots.map(p=>{ const far=at(p).filter(x=>x.range_km!=null&&x.returned==='yes').sort((a,b)=>b.range_km-a.range_km)[0]; return {pilot:p, value:far?far.range_km:null, _f:far}; });
    const r=_absWinner(c,true,'ratio');
    if(r) res.raidback={pilot:r.pilot, km:r.value, desc:`Самый дальний одиночный вылет с возвратом за всё время: ${r.value} км${r._f&&r._f.date?` (${medalFmtDate(r._f.date)})`:''}.`};
  }
  // 🚀 Дальнобойщик — самый дальний одиночный вылет за всё время (возврат не учитывается)
  {
    const c=pilots.map(p=>{ const far=at(p).filter(x=>x.range_km!=null).sort((a,b)=>b.range_km-a.range_km)[0]; return {pilot:p, value:far?far.range_km:null, _f:far}; });
    const r=_absWinner(c,true,'ratio');
    if(r) res.longshot={pilot:r.pilot, km:r.value, desc:`Самый дальний одиночный вылет за всё время: ${r.value} км${r._f&&r._f.date?` (${medalFmtDate(r._f.date)})`:''}.`};
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
  // 🎖️ старше 🚀, но 🚀 снимаем ТОЛЬКО при равной дальности у одного пилота (рекордный вылет
  // и так вернулся → дубль). Если 🚀-рекорд дальше (был в один конец) — присуждаются обе.
  if(res.raidback && res.longshot && res.raidback.pilot===res.longshot.pilot && res.raidback.km===res.longshot.km) delete res.longshot;
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
  // Скрываем пилота только если ОДНОВРЕМЕННО: нет вылетов ЗА НЕДЕЛЮ (fWeek — то же
  // окно, что «За неделю: N» выше), НЕТ БОРТОВ НА РУКАХ и нет обычных медалей
  // (calcPilotMedals — окно 10 дней). Борта добавлены 12.08.2026: расчёт с техникой
  // на руках, но без вылетов за неделю (отпуск/ремонт/затишье), исчезал с Обзора
  // ВМЕСТЕ СО СВОИМ СКЛАДОМ — борта переставали быть видны. Проверка бортов стоит
  // ДО медалей: она дешёвая, а calcPilotMedals гоняет computeMedalWinners на каждого.
  // Золотые щиты в критерий не входят (щит без бортов и без активности — история,
  // не текущее состояние). Пустой расчёт без вылетов по-прежнему скрыт.
  // Сортировка: вылеты за сегодня убыв., при равенстве — по имени.
  document.getElementById('dashSquads').innerHTML=state.squads
    .filter(sq=>fWeek.some(x=>x.pilot===sq.pilot)
      ||(sq.drones||[]).some(d=>(d.qty||0)!==0)   // минус тоже виден — это сигнал (ADR-001 §4)
      ||calcPilotMedals(sq.pilot).length>0)
    .sort((a,b)=>{
      const ca=fToday.filter(x=>x.pilot===a.pilot).length;
      const cb=fToday.filter(x=>x.pilot===b.pilot).length;
      return cb-ca||a.pilot.localeCompare(b.pilot,'ru');
    })
    .map(sq=>{
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
        ${drones.map(d=>`<div class="crew-tag"${d.qty<0?' style="color:var(--color-text-danger);border-color:var(--color-border-danger)" title="Баланс в минусе — борт списан без передачи со склада. Оформите передачу склад → пилот"':''}>${esc(d.name)} × ${d.qty}${d.qty<0?' ⚠':''}</div>`).join('')}
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
  const bg=state.stock.filter(d=>d.status==='bg'&&d.qty!==0);
  const nbg=state.stock.filter(d=>d.status!=='bg'&&d.qty!==0);
  document.getElementById('stockListBG').innerHTML=bg.length?bg.map(d=>
    `<div class="stock-row"><div class="stock-name">${esc(d.name)}</div><div class="stock-count">${d.qty}</div></div>`
  ).join(''):'<div style="color:var(--color-text-secondary);padding:12px 16px">Пусто</div>';
  document.getElementById('stockListNBG').innerHTML=nbg.length?nbg.map(d=>
    // Статус списания в данных — 'lost' (легаси-написание 'списан' тоже встречается).
    // Было сравнение с 'loss' — опечатка: списанные строки показывались как «не БГ» (04.09.2026)
    `<div class="offstock-row"><div class="offstock-name">${esc(d.name)}</div><div style="display:flex;align-items:center;gap:8px"><div class="${_isLostStatus(d.status)?'badge-danger':'badge-warn'}">${_isLostStatus(d.status)?'списан':'не БГ'}</div><div class="offstock-count">${d.qty}</div></div></div>`
  ).join(''):'<div style="color:var(--color-text-secondary);padding:12px 16px">Нет</div>';

  // Расчёты с пустым складом (drones[] пуст или все qty===0) скрываем — как на Обзоре.
  // Селекты передачи (#transFrom/#transTo) строятся в fillDataLists из state.squads
  // независимо от этих карточек — скрытый пилот остаётся получателем.
  const squadsShown=state.squads.filter(sq=>(sq.drones||[]).some(d=>(d.qty||0)!==0)); // критерий как в renderDashboard
  document.getElementById('squadTable').innerHTML=squadsShown.length
    ? `<div class="crew-grid">`+squadsShown.map(sq=>{
        const drones=sq.drones.filter(d=>d.qty!==0);
        const abbr=sq.pilot.slice(0,2).toUpperCase();
        const chips=drones.map(d=>`<span class="drone-chip"${d.qty<0?' style="color:var(--color-text-danger);border-color:var(--color-border-danger)"':''}>${esc(d.name)}${d.qty<0?' ⚠':''} <span class="num">×${d.qty}</span></span>`).join('');
        return `<div class="crew-block">
          <div class="crew-head">
            <div class="crew-abbr">${esc(abbr)}</div>
            <div class="crew-pname">Пилот ${esc(sq.pilot)}</div>
            <div class="crew-status-badge">БГ</div>
          </div>
          <div class="crew-drones">${chips}</div>
        </div>`;
      }).join('')+`</div>`
    : '';
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

  // Спецприёмники: перевод в «не бг» (строка склада со статусом nbg) или «списан» (выбытие).
  if(to==='не бг'||to==='списан'){
    if(!hasAnyRole(['admin','cmd','tech'])){alert('Недостаточно прав');return;}
    const dl=drone.toLowerCase();

    // Списать qty у ИСТОЧНИКА по from. БАГ 2 (исправлен 17.06): раньше эта ветка ВСЕГДА
    // списывала со склада (bg) и писала запись как from:'склад' — поэтому «пилот → не бг»
    // снимало борт со склада, а у пилота он оставался (обход был: пилот→склад, затем склад→не бг).
    if(from==='склад'){
      const bg=state.stock.find(d=>d.name.toLowerCase()===dl&&d.status==='bg');
      if(!bg||bg.qty<qty){
        if(!confirm(`На складе недостаточно боеготовых "${drone}". Всё равно оформить?`))return;
      }
      if(to==='не бг'){
        if(bg){bg.qty-=qty;if(bg.qty===0)state.stock=state.stock.filter(d=>d!==bg);}
        else{state.stock.push({name:drone,qty:-qty,status:'bg'});}
      } else { // списан со склада — выбытие
        // Клэмп Math.max(0,…) убран 04.09.2026 (блокер §2а): запись движения писалась на
        // ПОЛНОЕ qty, а наличие останавливалось на нуле — журнал уезжал дальше склада.
        // Минус не маскируем (ADR-001 §4 — сигнал недостающего прихода), как в ветке «не бг».
        if(bg){bg.qty-=qty;if(bg.qty===0)state.stock=state.stock.filter(d=>d!==bg);}
        else{state.stock.push({name:drone,qty:-qty,status:'bg'});}
      }
    } else if(from==='не бг'){ // не бг → списан: списываем из не боеготовых
      const nbgSrc=state.stock.find(d=>d.name.toLowerCase()===dl&&d.status==='nbg');
      if(!nbgSrc||nbgSrc.qty<qty){
        if(!confirm(`Не боеготовых "${drone}" недостаточно. Всё равно оформить?`))return;
        if(nbgSrc){nbgSrc.qty-=qty;}
        else{state.stock.push({name:drone,qty:-qty,status:'nbg'});}
      } else {
        nbgSrc.qty-=qty;
        if(nbgSrc.qty===0)state.stock=state.stock.filter(d=>d!==nbgSrc);
      }
    } else { // from = конкретный пилот: списываем У ПИЛОТА (а не со склада)
      const sq=state.squads.find(s=>s.pilot===from);
      const di=sq&&sq.drones.find(d=>d.name.toLowerCase()===dl);
      if(!di||di.qty<qty){
        if(!confirm(`У пилота ${from} недостаточно "${drone}". Всё равно оформить?`))return;
        if(di){di.qty-=qty;}
        else if(sq){sq.drones.push({name:drone,qty:-qty});}
      } else {
        di.qty-=qty;
        if(di.qty===0)sq.drones=sq.drones.filter(d=>d!==di);
      }
    }

    // Зачислить в приёмник: «не бг» → строка склада со статусом nbg; «списан» → приёмника нет (выбытие)
    if(to==='не бг'){
      const nbg=state.stock.find(d=>d.name.toLowerCase()===dl&&d.status==='nbg');
      if(nbg){nbg.qty+=qty;}
      else{state.stock.push({name:drone,qty,status:'nbg'});}
    }

    if(!state.transfers)state.transfers=[];
    const op=makeTransfer('transfer',{from,to,drone,qty,note}); // реальный from (раньше хардкод 'склад')
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
    logAction('transfer','add',from+' → '+to+': '+drone+' ×'+qty);
    return;
  }

  // Списать у отправителя
  if(from==='не бг'){
    // Возврат из ремонта: списываем из не боеготовых
    if(!hasAnyRole(['admin','cmd','tech'])){alert('Недостаточно прав');return;}
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
    if(di){di.qty+=qty; if(di.qty===0)sq.drones=sq.drones.filter(d=>d!==di);} // минус закрыт передачей → строку снимаем
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

  // Списать отданный борт со склада. Слепой путь закрыт по ADR-001 §4 (21.08.2026,
  // минус = сигнал): раньше клэмп Math.max(0,…) и «не найден — всё равно оформить»
  // писали exchange-движение БЕЗ списания qty → наличие расходилось с движениями
  // (onhand > движ.), а недостающий приход на склад прятался. Теперь qty уходит в
  // минус (строка создаётся при отсутствии), строка снимается только при точном нуле,
  // оператору — НЕ блокирующее предупреждение (lossDeficitWarn — общий механизм).
  let giveDeficit=null;
  if(give){
    let giveItem=state.stock.find(d=>d.name.toLowerCase()===give.toLowerCase()&&d.status==='bg');
    if(!giveItem){ giveItem={name:give,qty:0,status:'bg'}; state.stock.push(giveItem); }
    giveItem.qty-=giveQty;
    if(giveItem.qty===0)state.stock=state.stock.filter(d=>d!==giveItem);
    if(giveItem.qty<0) giveDeficit={deficit:true,pilot:'склад',drone:give,qty:giveItem.qty};
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
  if(giveDeficit){
    const msg=`⚠ Склад (БГ) не имеет ${give} ×${giveQty} — остаток уходит в минус (${giveDeficit.qty}). Обмен оформлен; если борт был на складе без прихода — оформите приход/коррекцию (минус закроется).`;
    console.warn('[учёт] '+msg);
    if(typeof showSyncToast==='function')showSyncToast(msg,8000);
    setStatus('saveStatus',msg,'warn');
  }
  logAction('transfer','exchange','Обмен с '+unit+': '+[give?('отдали '+give+' ×'+giveQty):'',get?('получили '+get+' ×'+getQty):''].filter(Boolean).join(', ')+(giveDeficit?' [склад в минус: '+giveDeficit.qty+']':''));
  renderInventory();
  renderDashboard();
  document.getElementById('exchangeCard').style.display='none';
  ['exUnit','exGive','exGet','exNote'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('exGiveQty').value='1';
  document.getElementById('exGetQty').value='1';
  document.getElementById('exOneWay').checked=false;
}

function renderTransfersLog(){
  _stripCapture(_trEditState,_trEditDraft,'tredit',TR_STRIP_FIELDS); // открытые полосы: снять ввод до перерисовки
  if(!state.transfers||!state.transfers.length){
    document.getElementById('transfersLog').innerHTML='<div style="color:var(--color-text-secondary);font-size:12px;padding:12px 16px">Нет операций</div>';
    return;
  }
  document.getElementById('transfersLog').innerHTML=state.transfers.slice(0,30).map(op=>{
    // Серая фиксация правок (паттерн вылетов): 'sent'/'locked' приглушают строку
    const _tst=op.id!=null?_trEditState.get(String(op.id)):undefined;
    const grey=(_tst==='sent'||_tst==='locked')?' tr-row-sent':'';
    // Свёрнутая полоса (состояние пусто, окно открыто) — кнопка «✏ N мин» справа от времени
    const kjs=op.id!=null?String(op.id).replace(/\\/g,'\\\\').replace(/'/g,"\\'"):'';
    const pen=(_tst==null&&canEditTransfer(op))
      ?`<button class="edit-pen-btn" onclick="trEditOpen('${kjs}')" title="Править (окно ${_trMinsLeft(op)} мин)">✏ ${_trMinsLeft(op)} мин</button>`:'';
    let row;
    if(op.type==='loss'){
      row=`<div class="change-row${grey}">
        <div class="badge-danger">Потеря</div>
        <div class="change-detail"><span>${esc(op.drone)}</span> · пилот: ${esc(op.pilot)}</div>
        <div class="change-time">${esc(op.date)} ${esc(op.time||'')}</div>${pen}
      </div>`;
    } else if(op.type==='arrival'){
      row=`<div class="change-row${grey}">
        <div class="change-badge-in">Поступление</div>
        <div class="change-detail"><span>${esc(op.drone)} × ${op.qty}</span>${op.note?` · ${esc(op.note)}`:''}</div>
        <div class="change-time">${esc(op.date)} ${esc(op.time||'')}</div>${pen}
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
      row=`<div class="change-row${grey}">
        <div class="badge-warn">${op.give&&op.get?'Обмен':'Передача'}</div>
        <div class="change-detail"><span>${esc(op.unit)}</span> · ${exDetail}${op.note?` · ${esc(op.note)}`:''}</div>
        <div class="change-time">${esc(op.date)} ${esc(op.time||'')}</div>${pen}
      </div>`;
    } else if(op.type==='adjust'){
      row=`<div class="change-row${grey}">
        <div class="badge-warn">Коррекция</div>
        <div class="change-detail">${esc(op.location||'')} · <span>${esc(op.drone)} ${op.qty>0?'+':''}${op.qty}</span>${op.note?` · ${esc(op.note)}`:''}</div>
        <div class="change-time">${esc(op.date)} ${esc(op.time||'')}</div>${pen}
      </div>`;
    } else if(op.type==='startbalance'){
      // Черта (Этап 3): стартовый остаток локации. Своя ветка — иначе запись падала бы
      // в общий else и рисовалась как «Передача → →» с пустыми направлениями.
      row=`<div class="change-row${grey}">
        <div class="change-badge-in">Стартовый остаток</div>
        <div class="change-detail">${esc(op.location||op.to||'')} · <span>${esc(op.drone)} ${op.qty>0?'+':''}${esc(op.qty)}</span>${op.note?` · ${esc(op.note)}`:''}</div>
        <div class="change-time">${esc(op.date)} ${esc(op.time||'')}</div>${pen}
      </div>`;
    } else {
      row=`<div class="change-row${grey}">
        <div class="change-badge-in">Передача</div>
        <div class="change-detail">${esc(op.from)} → ${esc(op.to)} · <span>${esc(op.drone)} × ${op.qty}</span>${op.note?` · ${esc(op.note)}`:''}</div>
        <div class="change-time">${esc(op.date)} ${esc(op.time||'')}</div>${pen}
      </div>`;
    }
    return row+renderTransferEditRow(op);
  }).join('');
  _stripRestore(_trEditState,_trEditDraft,'tredit',TR_STRIP_FIELDS); // вернуть ввод в открытые полосы
}

// ============ РЕДАКТИРОВАНИЕ ЗАПИСЕЙ СКЛАДА В «ИЗМЕНЕНИЯХ» (окно 10 минут) ============
// Гибрид по диагностике 14.08.2026: note/date/time — правка НА МЕСТЕ (остатки не трогаются,
// id стабилен, перешифровка штатным push); qty/модель/направление — СТОРНО (откат эффекта
// старой записи + tombstone + новая запись с новым id и новым эффектом). LOSS не правится
// (владелец — вылет, биекция ADR-001; подсказка вместо полосы). ADJUST — только реквизиты
// (запись документирует ручную правку остатка, её эффект к остаткам не применялся).
// EXCHANGE — только полное сторно (обе стороны разом). Состояние серой фиксации —
// рантайм-Map (НЕ поле t._*: syncEncrypt сериализует запись целиком, вычистки _* нет).
const TRANSFER_EDIT_WINDOW_MS=10*60*1000;
const _trEditState=new Map(); // id → 'sent'|'editing'|'locked' (паттерн _flEditState)

// Момент создания записи: id из genId начинается с Date.now() (мс) — надёжнее date+time
// (это время ОПЕРАЦИИ, не ввода); фолбэк для нестандартных id — date+time.
function _transferTs(t){
  const n=parseInt(t&&t.id,10);
  if(Number.isFinite(n)&&n>1e12)return n;
  const d=Date.parse((t&&t.date||'')+'T'+(t&&t.time||'00:00'));
  return Number.isFinite(d)?d:0;
}
function _transferByKey(key){
  if(key==null)return null;
  const k=String(key);
  return state.transfers.find(t=>t&&t.id!=null&&String(t.id)===k)||null;
}
// Роли: tech/cmd/admin (эффективная роль) — любую запись; автор (_submittedBy) — свою.
function _trRolesOk(t){
  if(isViewerRole(state.role)||isViewerRole(authUser.role))return false;
  if(hasAnyRole(['tech','cmd','admin'])||authUser.role==='admin')return true;
  return !!(t&&t._submittedBy&&t._submittedBy===authUser.login);
}
// Запись сделана ДО черты? Резолвер живёт в marshrut.js (грузится раньше app.js).
// Черты нет — всегда false, поведение прежнее.
function _isPreCutTransfer(t){
  return typeof isBeforeCut==='function' && typeof _mRecTs==='function' && isBeforeCut(_mRecTs(t));
}
function _isPreCutFlight(f){
  return typeof isBeforeCut==='function' && isBeforeCut((f&&f._savedTs)||0);
}
function canEditTransfer(t){
  if(!t||t.id==null)return false;                 // без id не адресуемся и не tombstone-им
  if(t.type==='loss')return false;                // правится только через вылет
  if(t.type==='startbalance')return false;        // черта (Этап 3): стартовый остаток не правится — только коррекцией
  // ЧЕРТА: до-чертовые записи заморожены. Правка/сторно сдвинули бы наличие, не тронув
  // замороженный журнал → вечное расхождение, неотличимое от бага семантики (ADR §6).
  if(_isPreCutTransfer(t))return false;
  if(_trEditState.get(String(t.id))==='locked')return false; // финализировано
  if(!_trRolesOk(t))return false;
  const ts=_transferTs(t);
  return !!ts&&(Date.now()-ts<TRANSFER_EDIT_WINDOW_MS);
}
function _trMinsLeft(t){return Math.max(1,Math.round((TRANSFER_EDIT_WINDOW_MS-(Date.now()-_transferTs(t)))/60000));}

// Применение (sign=+1) / откат (−1) эффекта записи на остатки. Балансовая семантика —
// как _stockAuditCompute/getBalance. БЕЗ клампов и confirm: сторно обязано быть
// симметричным; минус не маскируется (сигнал расхождения, отобразится красным).
// adjust/loss сюда НЕ попадают (adjust остатков сам не менял, loss не правится).
function _trEffect(t,sign){
  const q=n=>sign*(parseInt(n)||1);
  // Типы БЕЗ эффекта на остатки — явный выход (04.09.2026). loss/adjust сюда и раньше
  // не доходили (полоса их не открывает), startbalance добавлен под черту Этапа 3:
  // молчаливое «нет ветки» неотличимо от забытого типа, а цена ошибки — сторно,
  // сдвигающее журнал без наличия. Новый тип движения обязан появиться ЗДЕСЬ.
  if(t.type==='loss'||t.type==='adjust'||t.type==='startbalance')return;
  if(t.type==='arrival'){
    _trStockAdd(t.drone,'bg',q(t.qty));
  } else if(t.type==='exchange'){
    if(t.give)_trStockAdd(t.give,'bg',-q(t.giveQty));
    if(t.get)_trStockAdd(t.get,'bg',q(t.getQty));
  } else if(t.type==='transfer'){
    const d=q(t.qty);
    const side=(loc,delta)=>{
      if(loc==='склад')_trStockAdd(t.drone,'bg',delta);
      else if(loc==='не бг')_trStockAdd(t.drone,'nbg',delta);
      else if(loc==='списан'){} // выбытие — физической строки-приёмника нет
      else _trSquadAdd(loc,t.drone,delta);
    };
    side(t.from,-d);
    side(t.to,d);
  }
}
function _trStockAdd(name,status,delta){
  if(!name||!delta)return;
  const nl=String(name).toLowerCase();
  let r=state.stock.find(d=>d.name.toLowerCase()===nl&&d.status===status);
  if(!r){r={id:genId('s'),name:String(name),qty:0,status};state.stock.push(r);}
  r.qty+=delta;
  if(r.qty===0)state.stock=state.stock.filter(d=>d!==r); // нулевые строки не копим
}
function _trSquadAdd(pilot,name,delta){
  if(!pilot||!name||!delta)return;
  let sq=state.squads.find(s=>s.pilot===pilot);
  if(!sq){sq={id:genId('sq'),pilot,drones:[]};state.squads.push(sq);} // как writeDroneLoss
  const nl=String(name).toLowerCase();
  let d=sq.drones.find(x=>x.name.toLowerCase()===nl);
  if(!d){d={name:String(name),qty:0};sq.drones.push(d);}
  d.qty+=delta;
  if(d.qty===0)sq.drones=sq.drones.filter(x=>x!==d);
}

// Селект от/кому для полосы transfer: склад + пилоты + спецприёмники (легаси-значение не теряем)
function _trFromToSel(which,cur,fid){
  const opts=['склад',...state.squads.map(s=>s.pilot),'не бг'].concat(which==='to'?['списан']:[]);
  if(cur&&!opts.includes(cur))opts.unshift(cur);
  return '<select style="font-size:11px;padding:2px 3px" id="tredit-'+which+'-'+fid+'">'
    +opts.map(o=>'<option value="'+esc(o)+'"'+(o===cur?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select>';
}

function renderTransferEditRow(t){
  if(!t||t.id==null)return '';
  const key=String(t.id);
  const st=_trEditState.get(key);
  if(st==='locked')return '';
  // LOSS / STARTBALANCE: в окне и при правах — подсказка вместо полосы.
  // loss — владелец записи вылет (биекция ADR-001 §4); startbalance — стартовый остаток
  // черты (Этап 3): правка сдвинула бы ledger, не тронув наличие (_trEffect эффекта не имеет).
  if(t.type==='loss'||t.type==='startbalance'){
    const ts=_transferTs(t);
    const inWin=!!ts&&(Date.now()-ts<TRANSFER_EDIT_WINDOW_MS);
    const hint=t.type==='loss'
      ? '✎ Запись потери правится через вылет (журнал / Администратор → Вылеты)'
      : '✎ Стартовый остаток черты не правится — расхождение закрывается коррекцией количества';
    return (inWin&&_trRolesOk(t))
      ?'<div class="tr-edit-row" style="padding:2px 10px 4px 12px;font-size:10px;color:var(--muted);border-left:2px solid var(--muted)">'+hint+'</div>'
      :'';
  }
  if(!canEditTransfer(t))return '';
  if(st==null)return ''; // свёрнуто — кнопка «✏ N мин» в строке (renderTransfersLog), полоса по клику
  const minsLeft=_trMinsLeft(t);
  const fid=esc(key);
  const kjs=key.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  if(st==='sent'){
    return '<div class="tr-edit-row" style="display:flex;gap:8px;align-items:center;padding:3px 10px 3px 12px;background:var(--inset);border-left:2px solid var(--muted);flex-wrap:wrap">'
      +'<span style="font-size:10px;color:var(--muted);letter-spacing:1px;white-space:nowrap">✓ отправлено</span>'
      +'<button class="btn btn-sm" style="padding:2px 8px;font-size:10px;letter-spacing:0" onclick="trEditReopen(\''+kjs+'\')">✏ Править ('+minsLeft+' мин)</button>'
      +'<button class="btn btn-sm" style="padding:2px 8px;font-size:10px;letter-spacing:0" onclick="trEditFinalize(\''+kjs+'\')">✓ Зафиксировать</button>'
      +'</div>';
  }
  const inp=(f,val,w,ph)=>'<input style="width:'+w+'px;font-size:11px;padding:2px 5px" value="'+esc(val==null?'':val)+'" placeholder="'+ph+'" id="tredit-'+f+'-'+fid+'" autocomplete="off">';
  const num=(f,val,w)=>'<input type="number" min="1" style="width:'+w+'px;font-size:11px;padding:2px 5px;text-align:center" value="'+(parseInt(val)||1)+'" id="tredit-'+f+'-'+fid+'">';
  let body='';
  if(t.type==='arrival'){
    body=inp('drone',t.drone,90,'БПЛА')+num('qty',t.qty,46);
  } else if(t.type==='transfer'){
    body=inp('drone',t.drone,90,'БПЛА')+num('qty',t.qty,46)+_trFromToSel('from',t.from,fid)+'<span style="color:var(--muted)">→</span>'+_trFromToSel('to',t.to,fid);
  } else if(t.type==='exchange'){
    body=inp('unit',t.unit,90,'Подразделение')+inp('give',t.give,80,'Отдали')+num('giveQty',t.giveQty,46)+inp('get',t.get,80,'Получили')+num('getQty',t.getQty,46);
  } else if(t.type==='adjust'){
    body='<span style="font-size:10px;color:var(--muted)">кол-во/модель коррекции не правятся — при необходимости новая коррекция в складе</span>';
  } else {
    return ''; // неизвестный тип — не правим
  }
  return '<div class="tr-edit-row" style="display:flex;gap:5px;align-items:center;padding:3px 10px 3px 12px;background:rgba(57,255,20,0.03);border-left:2px solid var(--green3);flex-wrap:wrap">'
    +'<span style="font-size:10px;color:var(--green3);letter-spacing:1px;white-space:nowrap">✏ '+minsLeft+' мин</span>'
    +'<input type="date" style="width:106px;font-size:11px;padding:2px 5px" value="'+esc(t.date||'')+'" id="tredit-date-'+fid+'">'
    +'<input type="time" style="width:66px;font-size:11px;padding:2px 5px" value="'+esc(t.time||'')+'" id="tredit-time-'+fid+'">'
    +body
    +'<input style="flex:1;min-width:80px;font-size:11px;padding:2px 5px" value="'+esc(t.note||'')+'" placeholder="Примечание" id="tredit-note-'+fid+'">'
    +'<button class="btn btn-success btn-sm" style="padding:2px 8px;font-size:10px;letter-spacing:0" onclick="trSaveEdit(\''+kjs+'\')">✓</button>'
    +'</div>';
}

function trSaveEdit(key){
  const t=_transferByKey(key);
  if(!t){alert('Запись не найдена — журнал изменился. Обновите страницу (F5) и повторите правку.');return;}
  if(!canEditTransfer(t)){
    const locked=_trEditState.get(String(t.id))==='locked';
    alert(_isPreCutTransfer(t)
      ?'Запись сделана ДО черты — правка запрещена.\n\nСтарая история заморожена: правка сдвинула бы наличие,\nне тронув журнал движений. Оформите коррекцию количества (Администратор → Склад).'
      :(locked?'Запись зафиксирована — правка закрыта.':'Окно правки (10 мин) истекло или нет прав.'));
    renderTransfersLog();
    return;
  }
  // Dirty-only (см. блок «ПОЛОСЫ РЕДАКТИРОВАНИЯ»): берём из полосы ТОЛЬКО поля, изменённые
  // оператором относительно снапшота открытия; нетронутые — текущее значение записи (оно
  // могло измениться извне, пока полоса была открыта — не откатываем).
  const rd=f=>_stripDirty(_trEditDraft,'tredit',f,key);
  const dt=rd('date'), tm=rd('time'), nt=rd('note');
  const date=(dt.dirty&&dt.value)?dt.value:t.date;
  const time=(tm.dirty&&tm.value)?tm.value:t.time;
  const note=nt.dirty?String(nt.value).trim():(t.note||'');
  // Типизированные (сторно) поля: любое отличие → полное пересоздание записи
  let changed=false;
  const take=(f,old,isNum)=>{
    const r=rd(f);
    if(!r.dirty)return old;
    const nv=isNum?(parseInt(r.value)||1):String(r.value).trim();
    if(String(nv)!==String(old==null?'':old))changed=true;
    return nv;
  };
  let typed={};
  if(t.type==='arrival'){
    typed={drone:take('drone',t.drone),qty:take('qty',t.qty,true)};
    if(!typed.drone){alert('Укажите БПЛА');return;}
  } else if(t.type==='transfer'){
    typed={drone:take('drone',t.drone),qty:take('qty',t.qty,true),from:take('from',t.from),to:take('to',t.to)};
    if(!typed.drone){alert('Укажите БПЛА');return;}
    if(typed.from===typed.to){alert('Отправитель и получатель совпадают');return;}
  } else if(t.type==='exchange'){
    typed={unit:take('unit',t.unit),give:take('give',t.give),giveQty:take('giveQty',t.giveQty,true),get:take('get',t.get),getQty:take('getQty',t.getQty,true)};
    if(!typed.give&&!typed.get){alert('Заполните отданный или полученный борт');return;}
  } // adjust: typed нет — только реквизиты
  let finalId=String(t.id);
  if(changed){
    // СТОРНО: откат эффекта старой записи → tombstone → новая запись с новым эффектом.
    // Синхронно, без await между шагами — остатки не остаются в промежуточном состоянии.
    _trEffect(t,-1);
    state.transfers=state.transfers.filter(x=>x!==t);
    if(typeof syncPublishTombstones==='function')syncPublishTombstones([String(t.id)]);
    const newOp={...t,...typed,id:genId('t'),_cut:Date.now(),date,time,note}; // _cut — момент ЭТОЙ записи, не исходной
    if(authUser&&authUser.login)newOp._submittedBy=authUser.login;
    state.transfers.unshift(newOp);
    _trEffect(newOp,1);
    finalId=String(newOp.id);
    syncBumpStockVersion();
    syncPushStockSquads();
    syncAddTransfer(newOp);
    logAction('transfer','edit','Сторно-правка записи склада ('+t.type+'): '+(t.drone||t.give||t.get||'')+' → '+(newOp.drone||newOp.give||newOp.get||''));
  } else {
    // Правка НА МЕСТЕ: только реквизиты, остатки не трогаются, id стабилен —
    // перешифрованная версия уедет штатным debounce-push (merge по id не вернёт старую)
    t.date=date;t.time=time;t.note=note;
    logAction('transfer','edit','Правка реквизитов записи склада ('+t.type+')');
  }
  // Серая фиксация (паттерн вылетов): первый ✓ → 'sent'; ✓ из переоткрытой → 'locked'.
  // После сторно состояние переезжает на НОВЫЙ id (старая запись удалена).
  const prev=_trEditState.get(String(t.id));
  _trEditState.delete(String(t.id));
  _trEditDraft.delete(String(t.id)); // черновик закрыт — полоса сворачивается в плашку
  _trEditState.set(finalId,prev==='editing'?'locked':'sent');
  saveLocal();
  renderTransfersLog();
  renderInventory();
  renderDashboard();
}

// ✏ в строке (свёрнутая полоса) → развернуть; ✏ в серой плашке → повторное открытие
function trEditOpen(key){
  const t=_transferByKey(key);
  if(!t||!canEditTransfer(t)){renderTransfersLog();return;}
  _stripOpen(_trEditState,_trEditDraft,t.id,'open');
  renderTransfersLog();
}
function trEditReopen(key){
  const t=_transferByKey(key);
  if(!t||!canEditTransfer(t)){renderTransfersLog();return;}
  _stripOpen(_trEditState,_trEditDraft,t.id,'editing');
  renderTransfersLog();
}
function trEditFinalize(key){
  const t=_transferByKey(key);
  if(t&&t.id!=null)_trEditState.set(String(t.id),'locked');
  renderTransfersLog();
}

// ============ ПОЛОСЫ РЕДАКТИРОВАНИЯ (вылеты + склад): свёртка, черновик, dirty-поля ============
// Общий механизм обеих полос: журнал вылетов (поля `edit-<f>-<id>`) и «Изменения» склада
// (`tredit-<f>-<id>`). Состояния (рантайм-Map по id записи, см. _flEditState/_trEditState):
//   undefined — СВЁРНУТО: обычная строка + кнопка «✏ N мин» справа (окно 10 мин открыто);
//   'open'    — развёрнуто кликом ✏ (первый раз);        'sent' — после ✓ серая плашка;
//   'editing' — развёрнуто повторно из плашки (серость снята);  'locked' — финализировано.
// Черновик (draft, Map id → {snap,dirty}): snap — значения, которыми поля полосы заполнены
// ИЗ ЗАПИСИ (снимаются с DOM сразу после рендера — та же нормализация, что в контролах);
// dirty — что оператор изменил относительно snap.
//  • Перерисовка списка (поллинг 30с при изменениях / полная 5 мин / фильтры / чужие
//    операции) раньше пересобирала innerHTML и ТЕРЯЛА ввод. Теперь: перед innerHTML —
//    _stripCapture (dirty = DOM ≠ snap), после — _stripRestore (dirty возвращается в поля;
//    для нетронутых полей snap обновляется свежим значением записи). Полоса остаётся
//    открытой; теряются только фокус/каретка — приемлемо.
//  • ✓ заливает ТОЛЬКО dirty-поля. Поле, изменённое ИЗВНЕ (админ-раздел не перерисовывает
//    журнал; чужое устройство через поллинг), которое оператор в полосе не трогал, больше
//    не перезаписывается устаревшим значением полосы (гонка «админ-правка vs полоса»,
//    25.08.2026: время из админки откатывалось ✓-ом полосы).
const FL_STRIP_FIELDS=['date','time','flightnum','target','ammo','drone','result','returned','note'];
const TR_STRIP_FIELDS=['date','time','note','drone','qty','from','to','unit','give','giveQty','get','getQty'];
const _flEditDraft=new Map(), _trEditDraft=new Map();
function _stripIsOpen(st){return st==='open'||st==='editing';}
function _stripEl(prefix,field,key){return document.getElementById(prefix+'-'+field+'-'+String(key));}
// Перед перерисовкой: снять текущий ввод открытых полос (dirty = отличается от snap)
function _stripCapture(stateMap,draftMap,prefix,fields){
  stateMap.forEach((st,key)=>{
    if(!_stripIsOpen(st))return;
    const d=draftMap.get(key); if(!d)return;
    fields.forEach(f=>{
      const el=_stripEl(prefix,f,key); if(!el||d.snap[f]===undefined)return;
      if(el.value!==d.snap[f]) d.dirty[f]=el.value; else delete d.dirty[f];
    });
  });
}
// После перерисовки: вернуть dirty-ввод в поля; для нетронутых — snap = свежее значение записи
function _stripRestore(stateMap,draftMap,prefix,fields){
  stateMap.forEach((st,key)=>{
    if(!_stripIsOpen(st))return;
    let d=draftMap.get(key); if(!d){d={snap:{},dirty:{}};draftMap.set(key,d);}
    fields.forEach(f=>{
      const el=_stripEl(prefix,f,key); if(!el)return;
      if(f in d.dirty) el.value=d.dirty[f]; else d.snap[f]=el.value;
    });
  });
}
// При ✓: поле dirty, если DOM ≠ snap (нет snap — считаем изменённым: прежнее поведение)
function _stripDirty(draftMap,prefix,field,key){
  const el=_stripEl(prefix,field,key);
  if(!el)return {dirty:false,value:undefined,el:null};
  const d=draftMap.get(String(key)); const s=d?d.snap[field]:undefined;
  return {dirty:s===undefined||el.value!==s, value:el.value, el};
}
function _stripOpen(stateMap,draftMap,key,st){ stateMap.set(String(key),st); draftMap.set(String(key),{snap:{},dirty:{}}); }

// ============ FLIGHTS ============
// Селектор периода журнала: Неделя (−7) / Месяц (−30) / Весь период.
// Меняет только значения #filterFrom/#filterTo; фильтрацию делает renderFlights.
function flightPeriodChange(v){
  const ff=document.getElementById('filterFrom'),ft=document.getElementById('filterTo');
  if(!ff||!ft)return;
  if(v==='all'){ff.value='';ft.value='';}
  else if(v==='month'){ff.value=localISO(new Date(Date.now()-30*864e5));ft.value='';}
  else{ff.value=localISO(new Date(Date.now()-7*864e5));ft.value='';} // week (по умолчанию)
  renderFlights();
}
// Ручной ввод даты в журнале → переключаем селектор периода на «Произвольный»
function flightDateManual(){
  const sel=document.getElementById('flightPeriod'); if(sel)sel.value='custom';
  renderFlights();
}

// ===== ФИЛЬТР ЖУРНАЛА: мультиселект борта/боеприпаса (UI поверх периода/пилота) =====
// Храним МНОЖЕСТВО СНЯТЫХ значений (kind: 'Drone'|'Ammo'). По умолчанию все отмечены
// (пустой Set). Новое значение, не попавшее в Set, — отмечено. Снятое значение остаётся
// снятым при пересборке списка. Сняты ВСЕ из текущего списка (пустой выбор) → показать всё.
window._flMsDesel=window._flMsDesel||{Drone:new Set(),Ammo:new Set()};
window._flMsLastOpts=window._flMsLastOpts||{Drone:[],Ammo:[]};
const FL_MS_FIELD={Drone:'drone',Ammo:'ammo'};
const FL_MS_NAME={Drone:'Борт',Ammo:'Боеприпас'};
// Уникальные непустые значения поля в переданном (период+пилот) списке вылетов
function flMsOptions(list,kind){
  const fld=FL_MS_FIELD[kind];
  return [...new Set(list.map(x=>(x[fld]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
// Выбранные = опции, не попавшие в множество снятых
function flMsSelected(opts,kind){
  const d=window._flMsDesel[kind];
  return opts.filter(o=>!d.has(o));
}
// Рендер чекбоксов + лейбла «Борт: все» / «Борт: N из M»
function flMsRender(opts,kind){
  const list=document.getElementById('fl'+kind+'List');
  const lbl=document.getElementById('fl'+kind+'Label');
  const d=window._flMsDesel[kind];
  if(list){
    list.innerHTML=opts.length
      ? opts.map(o=>`<label class="ms-item"><input type="checkbox" value="${esc(o)}" ${d.has(o)?'':'checked'} onchange="flMsCheck('${kind}',this)"><span>${esc(o)}</span></label>`).join('')
      : '<div class="ms-empty">Нет вылетов за период</div>';
  }
  if(lbl){
    const sel=flMsSelected(opts,kind);
    const all=!sel.length||sel.length===opts.length; // все ИЛИ ни одного → показать всё
    lbl.textContent=FL_MS_NAME[kind]+': '+(all?'все':`${sel.length} из ${opts.length}`);
  }
}
// Чек/снятие галочки → перерисовать журнал (панель остаётся открытой)
function flMsCheck(kind,cb){
  const d=window._flMsDesel[kind];
  if(cb.checked)d.delete(cb.value); else d.add(cb.value);
  renderFlights();
}
// Открыть/закрыть выпадашку (закрывает соседнюю; направление вверх если снизу мало места)
function flMsToggle(kind,e){
  if(e)e.stopPropagation();
  const panel=document.getElementById('fl'+kind+'Panel');
  const field=document.getElementById('fl'+kind+'Field');
  if(!panel||!field)return;
  if(panel.classList.contains('open')){panel.classList.remove('open','up');field.classList.remove('open');return;}
  ['Drone','Ammo'].forEach(k=>{const p=document.getElementById('fl'+k+'Panel'),fi=document.getElementById('fl'+k+'Field');if(p)p.classList.remove('open','up');if(fi)fi.classList.remove('open');});
  panel.classList.add('open');field.classList.add('open');
  const r=field.getBoundingClientRect(),ph=panel.offsetHeight;
  const below=window.innerHeight-r.bottom;
  if(below<ph+8&&r.top>below)panel.classList.add('up');
}
// «Все» — снять отметки снятого (отметить всё)
function flMsSelectAll(kind,e){
  if(e)e.stopPropagation();
  window._flMsDesel[kind].clear();
  renderFlights();
}
// «Снять все» — занести все текущие опции в снятые (пустой выбор = показать всё)
function flMsClearAll(kind,e){
  if(e)e.stopPropagation();
  (window._flMsLastOpts[kind]||[]).forEach(o=>window._flMsDesel[kind].add(o));
  renderFlights();
}
// Закрытие выпадашек борта/боеприпаса кликом вне
document.addEventListener('click',e=>{
  ['Drone','Ammo'].forEach(kind=>{
    const wrap=document.getElementById('fl'+kind+'Wrap');
    const panel=document.getElementById('fl'+kind+'Panel');
    if(!panel||!panel.classList.contains('open'))return;
    if(wrap&&wrap.contains(e.target))return;
    panel.classList.remove('open','up');
    const fi=document.getElementById('fl'+kind+'Field'); if(fi)fi.classList.remove('open');
  });
});

// ===== ФИЛЬТР ЖУРНАЛА: результат / возврат борта ('all'|'yes'|'no', состояние в модуле) =====
window._flResult=window._flResult||'all';
window._flReturned=window._flReturned||'all';
function flSetResult(v){window._flResult=v||'all';renderFlights();}
function flSetReturned(v){window._flReturned=v||'all';renderFlights();}
// Кнопка «Отчёт» в журнале → вкладка «Отчёты» со сводкой по текущей выборке (снимок renderFlights)
function flGotoReport(){
  if(!window._flLastFiltered)renderFlights(); // гарантируем снимок
  const rt=document.getElementById('repType'); if(rt)rt.value='byfilter';
  const btn=[...document.querySelectorAll('#nav button')].find(b=>(b.getAttribute('onclick')||'').includes("'report'"));
  if(btn)showPage('report',btn); // showPage('report') → fillReportFilters()+buildReport() → reportByFilter
}

function renderFlights(){
  _stripCapture(_flEditState,_flEditDraft,'edit',FL_STRIP_FIELDS); // открытые полосы: снять ввод до перерисовки
  const fp=document.getElementById('filterPilot').value;
  const from=document.getElementById('filterFrom').value;
  const to=document.getElementById('filterTo').value;
  let f=[...state.flights];
  if(fp)f=f.filter(x=>x.pilot&&x.pilot.includes(fp));
  if(from)f=f.filter(x=>x.date>=from);
  if(to)f=f.filter(x=>x.date<=to);
  // Мультиселект борта/боеприпаса: опции из ТЕКУЩЕГО (период+пилот) списка; применяется поверх.
  const _flDroneOpts=flMsOptions(f,'Drone'), _flAmmoOpts=flMsOptions(f,'Ammo');
  window._flMsLastOpts={Drone:_flDroneOpts,Ammo:_flAmmoOpts};
  flMsRender(_flDroneOpts,'Drone'); flMsRender(_flAmmoOpts,'Ammo');
  const _flDroneSel=flMsSelected(_flDroneOpts,'Drone'), _flAmmoSel=flMsSelected(_flAmmoOpts,'Ammo');
  if(_flDroneSel.length&&_flDroneSel.length<_flDroneOpts.length){const s=new Set(_flDroneSel);f=f.filter(x=>s.has((x.drone||'').trim()));}
  if(_flAmmoSel.length&&_flAmmoSel.length<_flAmmoOpts.length){const s=new Set(_flAmmoSel);f=f.filter(x=>s.has((x.ammo||'').trim()));}
  // Результат/возврат: модуль — источник истины; синхронизируем select. Строгое равенство:
  // при активном фильтре пустой/неопределённый признак не проходит; «Все» — показывает.
  const _rs=document.getElementById('filterResult'); if(_rs)_rs.value=window._flResult;
  const _rt=document.getElementById('filterReturned'); if(_rt)_rt.value=window._flReturned;
  if(window._flResult==='yes'||window._flResult==='no')f=f.filter(x=>x.result===window._flResult);
  if(window._flReturned==='yes'||window._flReturned==='no')f=f.filter(x=>x.returned===window._flReturned);
  // Снимок текущей выборки журнала для кнопки «Отчёт» (reportByFilter не пересчитывает заново).
  // drones/ammo попадают в заголовок только когда реально сужают (не «все» и не «ничего»).
  window._flLastFiltered=f.slice();
  window._flLastFilter={
    from,to,pilot:fp,
    drones:(_flDroneSel.length&&_flDroneSel.length<_flDroneOpts.length)?_flDroneSel.slice():[],
    ammo:(_flAmmoSel.length&&_flAmmoSel.length<_flAmmoOpts.length)?_flAmmoSel.slice():[],
    result:window._flResult,returned:window._flReturned
  };
  const toMs=x=>{
    const t=(x.time||'00:00').trim();
    const norm=t.includes(':')?t.split(':').map(p=>p.padStart(2,'0')).join(':'):'00:00';
    return new Date((x.date||'2000-01-01')+'T'+norm);
  };
  f.sort((a,b)=>toMs(b)-toMs(a));
  const _fc=document.getElementById('flightCount');
  if(_fc)_fc.textContent=f.length+' '+ruPlural(f.length,'запись','записи','записей');
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
  // Группировка по дням: счётчики на дату + метка «Сегодня/Вчера/дата»
  const dayCounts={};
  f.forEach(x=>{const d=x.date||'';dayCounts[d]=(dayCounts[d]||0)+1;});
  const _today=todayISO();
  const _yest=(()=>{const d=new Date();d.setDate(d.getDate()-1);return localISO(d);})();
  const dayHeadLabel=d=>{
    const n=dayCounts[d]||0;
    const cnt=n+' '+ruPlural(n,'вылет','вылета','вылетов');
    if(!d) return 'Без даты · '+cnt;
    const dd=d.split('-').reverse().join('.');
    const prefix=d===_today?'Сегодня · ':(d===_yest?'Вчера · ':'');
    return prefix+dd+' · '+cnt;
  };
  document.getElementById('flightList').innerHTML=`
    <table style="table-layout:auto;width:100%">
      <thead><tr>
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
        <th></th>
      </tr></thead>
      <tbody>
        ${f.map((x,i)=>{
          const idx=state.flights.indexOf(x);
          const editRow=renderFlightEditRow(x,idx);
          const num=autoNums.get(x)||x.flightnum||'';
          // Заголовок дня перед первой строкой новой даты (f отсортирован по дате убыв.)
          const curDate=x.date||'';
          const dayHead=(i===0||curDate!==(f[i-1].date||''))
            ?`<tr class="day-head"><td colspan="11">${esc(dayHeadLabel(curDate))}</td></tr>`:'';
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
          // Серая фиксация: после ✓ строка приглушена ('sent' и 'locked'). Свёрнутая полоса
          // (состояние пусто, окно открыто) — кнопка «✏ N мин» в последней ячейке рядом с ⎘
          const _key=_flEditKey(x,idx);
          const _st=_flEditState.get(_key);
          const sentCls=(_st==='sent'||_st==='locked')?' class="fl-row-sent"':'';
          const penBtn=(_st==null&&canEditFlight(x))
            ?'<button class="edit-pen-btn" onclick="flEditOpen(\''+_flKeyJs(_key)+'\')" title="Править (окно '+_flMinsLeft(x)+' мин)">✏ '+_flMinsLeft(x)+' мин</button>':'';
          return `${dayHead}<tr${sentCls} style="${x.returned==='no'?'background:rgba(220,38,38,0.04)':''}">
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
            <td style="padding:2px 4px;white-space:nowrap"><div style="display:flex;gap:4px;align-items:center;justify-content:flex-end">${penBtn}<button class="copy-flight-btn" data-copy="${esc(copyStr).replace(/\n/g,' ')}" style="background:rgba(57,255,20,0.06);border:1px solid #22c55e;color:var(--green);cursor:pointer;font-size:16px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit" title="Копировать">⎘</button></div></td>
          </tr>${editRow?`<tr><td colspan="11" style="padding:0;border:none">${editRow}</td></tr>`:''}`
        }).join('')}
      </tbody>
    </table>`;
  _stripRestore(_flEditState,_flEditDraft,'edit',FL_STRIP_FIELDS); // вернуть ввод в открытые полосы
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
  // Все известные дроны (каталог ∪ склад ∪ расчёты) — общий словарь getDroneVocab
  const known=getDroneVocab();
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
  const _canStatus=hasAnyRole(['admin','cmd','tech']);
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
  const qs=_keySeq(), ds=_keySeq(); // счётчики дублей на весь проход рендера
  el.innerHTML=state.squads.map((sq,si)=>{
    const qk=_attrJs(qs(_squadRowKey(sq,si))); // ключ расчёта, а не индекс (см. _squadRowKey)
    return `
    <div style="border:0.5px solid var(--border2);padding:10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <input style="flex:1;font-weight:600" value="${esc(sq.pilot)}" onchange="squadEditPilot('${qk}',this.value)" placeholder="Имя пилота">
        <button class="btn btn-sm btn-primary" onclick="squadCleanZeros('${qk}')">Удалить нули</button>
        <button class="btn btn-danger btn-sm" onclick="squadDeletePilot('${qk}')">Удалить расчёт</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
        <label style="margin:0;white-space:nowrap;text-transform:none;letter-spacing:normal;font-size:11px;color:var(--muted)">Точка старта:</label>
        <input style="flex:1;min-width:120px" value="${esc(sq.start_point||'')}" placeholder="напр. 45 вишня" onchange="squadEditStartPoint('${qk}',this.value)" autocomplete="off">
        <button id="geo-rc-btn-inv-${si}" class="btn btn-sm" style="font-size:10px;display:${geoStartBtnShow(sq)?'':'none'}" onclick="geoRecalcPilotMissing('${qk}','geo-rc-prog-inv-${si}','geo-rc-btn-inv-${si}')">Пересчитать вылеты без дистанций</button>
        <span id="geo-rc-prog-inv-${si}" style="font-size:10px;color:var(--muted)"></span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600">БПЛА расчёта:</div>
      ${sq.drones.map((d,di)=>{
        const dk=_attrJs(ds(_droneRowKey(sq,d,si,di))); // ключ борта «расчёт|модель»
        return `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px${d.qty===0?';opacity:0.5':''}">
          <input style="flex:1" list="dl-drones-smart" value="${esc(d.name)}" onchange="squadEditDrone('${dk}','name',this.value)" autocomplete="off">
          <input type="number" style="width:60px${d.qty<=0?';color:var(--red)':''}${d.qty<0?';border-color:var(--red)':''}" value="${d.qty}"${d.qty<0?' title="Баланс в минусе — борт списан без передачи со склада. Оформите передачу склад → пилот"':''} onchange="squadEditDrone('${dk}','qty',parseInt(this.value)||0)">${d.qty<0?'<span style="color:var(--red)" title="минус = сигнал недостающего прихода">⚠</span>':''}
          <button class="btn btn-sm" style="color:var(--red)" onclick="squadDeleteDrone('${dk}')">✕</button>
        </div>`;}).join('')}
      <button class="btn btn-sm btn-primary" style="font-size:11px;padding:3px 10px" onclick="squadAddDrone('${qk}')">+ БПЛА</button>
    </div>`;}).join('');
}

function squadCleanZeros(key){
  if(!guardWrite())return;
  const {sq}=_squadRowByKey(key);                   // ключ, а не индекс
  if(!sq){ _rowGone('расчёт',renderSquadEditor); return; }
  sq.drones=(sq.drones||[]).filter(d=>d.qty!==0);
  saveLocal();
  syncPushStockSquads();
  renderSquadEditor();
  renderInventory();
}
function squadEditPilot(key,val){
  if(!guardWrite())return;
  const {sq}=_squadRowByKey(key);                   // ключ, а не индекс
  if(!sq){ _rowGone('расчёт',renderSquadEditor); return; }
  adminRenamePilot(sq.pilot,val); // каноническое переименование (правит и журнал движений)
  renderInventory();              // отказ/отмена — поле восстановит перерисовка из state
  if(typeof renderSquadEditor==='function')renderSquadEditor();
}
// Сколько вылетов пилота без посчитанной дистанции
function geoPilotMissingCount(pilot){
  const lo=(pilot||'').toLowerCase();
  return (state.flights||[]).filter(f=>(f.pilot||'').toLowerCase()===lo && (f.range_km==null||f.distance_km==null)).length;
}
// Показывать ли кнопку пересчёта: есть точка старта И есть вылеты без дистанций
function geoStartBtnShow(sq){ return !!(sq && sq.start_point && geoPilotMissingCount(sq.pilot)>0); }
// (geoUpdateRecalcBtn удалена 04.09.2026 — точечно дёргала кнопку по индексу расчёта,
//  а id кнопок в DOM несут индекс момента рендера; видимость пересчитывает сам рендер.)

function squadEditStartPoint(key,val){
  if(!guardWrite())return;
  const {sq}=_squadRowByKey(key);                   // ключ, а не индекс
  if(!sq){ _rowGone('расчёт',renderSquadEditor); return; }
  sq.start_point=(val||'').trim();
  saveLocal();
  syncPushStockSquads();        // start_point синхронизируется как обычные данные squads
  // Старые вылеты НЕ пересчитываются — новая точка применяется только к новым вылетам.
  // Для существующих есть кнопка «Пересчитать вылеты без дистанций»: её видимость
  // пересчитывает сам рендер. Раньше здесь дёргалась кнопка по индексу (geoUpdateRecalcBtn),
  // но id кнопок в DOM несут индекс МОМЕНТА РЕНДЕРА — после пересборки squads это чужая кнопка.
  if(typeof renderSquadEditor==='function')renderSquadEditor();
  if(typeof renderAdminSquads==='function')renderAdminSquads();
}

// Пересчёт вылетов конкретного пилота без дистанций (force=false), прогресс inline
function geoRecalcPilotMissing(key, progId, btnId){
  const {sq}=_squadRowByKey(key);                   // ключ расчёта, а не индекс
  const prog=progId?document.getElementById(progId):null;
  const btn=btnId?document.getElementById(btnId):null;
  // Промах ключа не должен выглядеть сломанной кнопкой (раньше был молчаливый return)
  if(!sq){ if(prog) prog.textContent=' — расчёт не найден, список устарел: обновите раздел'; return; }
  if(!sq.start_point){ if(prog) prog.textContent=' — нет точки старта'; return; }
  // Без базы точек пересчитывать нечем: страж в geoRecomputeFlights вызовет onDone(0), и ниже
  // это выглядело бы зелёным «✓ Пересчитано: 0» — то есть отказ выдавался бы за успех
  if(typeof geoHasBase==='function' && !geoHasBase()){
    if(prog) prog.textContent=(typeof geoIsReady==='function'&&!geoIsReady())
      ? ' — база точек ещё загружается, повторите'
      : ' — база точек не загружена (.ldk)';
    return;
  }
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

// Пересчитывать нечем, если база точек не загружена: geoComputeFlight вернёт null по всем
// вылетам. Для «Пересчитать...» это просто пустая работа, а для «Сбросить блокировки» —
// потеря: замки 🔒 снимаются безусловно ДО пересчёта, и вернуть их нечем (05.09.2026).
function geoGuardBase(){
  if(typeof geoHasBase==='function' && geoHasBase()) return true;
  const loading=(typeof geoIsReady==='function' && !geoIsReady());
  const msg=loading?'Гео-база ещё загружается из хранилища — повторите через несколько секунд.'
                   :'Гео-база не загружена — дистанции считать не из чего.\nСначала загрузите .ldk (Администратор → Карта/Гео).';
  setStatus('geo-status',loading?'База точек ещё загружается — повторите через несколько секунд.'
                                :'База точек не загружена — пересчитывать нечем. Загрузите .ldk.','err');
  alert(msg);
  return false;
}

// Общий пересчёт всех пилотов без дистанций (из вкладки Карта/Гео)
function geoRecalcAllMissing(){
  if(!geoGuardBase()) return;
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
  if(!geoGuardBase()) return;
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
  if(!geoGuardBase()) return;   // иначе замки снимутся, а пересчитать будет нечем
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
function squadEditDrone(key,field,val){
  if(!guardWrite())return;
  const {sq,drone:d}=_droneRowByKey(key);           // ключ «расчёт|модель», а не пара индексов
  if(!d){ _rowGone('борт расчёта',renderSquadEditor); return; }
  {
    const old=d[field];
    if(field==='qty'){
      const delta=(parseInt(val,10)||0)-d.qty;
      if(delta&&d.name){
        const reason=adjustReason(d.name+' у '+sq.pilot+': '+d.qty+'→'+(parseInt(val,10)||0));
        if(!reason){renderSquadEditor();return;} // отмена — восстановить поле
        recordAdjust(d.name,delta,sq.pilot,reason);
      }
    }
    else if(field==='name'){
      if(!_squadRenameDrone(sq,d,val,'инв')){renderSquadEditor();return;} // отказ/отмена — вернуть поле из state
      setTimeout(renderSquadEditor,0); // борт мог схлопнуться с одноимённым — перерисовать индексы
    }
    if(field!=='name')d[field]=val; // имя проставляет _squadRenameDrone (со схлопом дублей)
    if(old!==val)logAction('squad','edit','Расчёт '+(sq.pilot||'')+': '+(field==='name'?('борт '+(old||'(новый)')+' → '+val):('борт '+(d.name||'?')+' — кол-во '+old+' → '+val)));
  }
  saveLocal();syncPushStockSquads();renderInventory(); // версионируем — иначе поллинг затрёт правку (last-write-wins по _sv)
}
function squadDeleteDrone(key){
  if(!guardWrite())return;
  const {sq,drone:d,di}=_droneRowByKey(key);        // ключ «расчёт|модель», а не пара индексов
  if(!d){ _rowGone('борт расчёта',renderSquadEditor); return; }
  let reason='';
  if(d.name&&d.qty){ // непустой борт с количеством — причина + adjust(−qty)
    reason=adjustReason('удаление борта '+d.name+' ×'+d.qty+' у '+sq.pilot);
    if(!reason)return;
    recordAdjust(d.name,-d.qty,sq.pilot,'удаление борта: '+reason);
  }
  if(d.name)logAction('squad','edit','Расчёт '+(sq.pilot||'')+': удалён борт '+d.name+' ×'+d.qty+(reason?' — '+reason:''));
  sq.drones.splice(di,1);
  saveLocal();syncPushStockSquads();renderSquadEditor();renderInventory();
}
function squadAddDrone(key){
  if(!guardWrite())return;
  const {sq}=_squadRowByKey(key);                   // ключ, а не индекс
  if(!sq){ _rowGone('расчёт',renderSquadEditor); return; }
  (sq.drones=sq.drones||[]).push({name:'',qty:1});
  saveLocal();syncPushStockSquads();renderSquadEditor();
}
function squadDeletePilot(key){
  if(!guardWrite())return;
  const {sq,si}=_squadRowByKey(key);                // ключ, а не индекс
  if(!sq){ _rowGone('расчёт',renderSquadEditor); return; }
  const pName=sq.pilot;
  const held=(sq.drones||[]).filter(d=>d.name&&d.qty);
  let reason='';
  if(held.length){
    reason=adjustReason('удаление расчёта '+pName+' — спишутся борта');
    if(!reason)return;
    held.forEach(d=>recordAdjust(d.name,-d.qty,pName,'удаление расчёта: '+reason));
  } else {
    if(!confirm('Удалить расчёт '+pName+'?'))return;
  }
  state.squads.splice(si,1);
  logAction('squad','delete','Удалён расчёт '+pName+(reason?' — '+reason:''));
  saveLocal();syncPushStockSquads();renderSquadEditor();renderInventory();rebuildRoleSelector();
}
function squadAddPilot(){
  if(!guardWrite())return;
  const p=document.getElementById('sq-newPilot').value.trim();
  const ds=document.getElementById('sq-newDrones').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!p){alert('Укажите имя пилота');return;}
  // Одноимённых расчётов не бывает — имя это ключ склада расчёта (см. adminAddSquad)
  if((state.squads||[]).some(sq=>_rowN(sq.pilot)===_rowN(p))){
    alert('Расчёт «'+p+'» уже есть — имя расчёта это ключ его склада, двух одноимённых не бывает.\nДобавьте борта в существующий расчёт или назовите новый иначе.');
    return;
  }
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

// Списать дрон при потере — всегда у пилота-исполнителя.
// Слепой путь закрыт по ADR-001 §4 (минус = сигнал, не ошибка; 21.08.2026):
// если у пилота нет строки модели (или qty уже 0) — loss-запись ВСЁ РАВНО создаётся
// (биекция вылет↔loss не рвётся), а баланс пилота уходит в минус: строка qty:-1
// создаётся/декрементируется и НЕ удаляется (раньше «не плодим фантом» + клэмп `<=0`
// молча прятали недостающий приход — борт, выданный со склада без передачи, исчезал
// из учёта без следа). Строка снимается только при точном нуле (приход/возврат закрыл минус).
// Возвращает {deficit:true, pilot, drone, qty} если списание ушло в минус — вызывающий
// показывает оператору НЕ блокирующее предупреждение (см. lossDeficitWarn).
function writeDroneLoss(pilot, drone, date, time, flightId){
  if(!drone)return null;
  const dn=drone.toLowerCase();

  let sq=state.squads.find(s=>s.pilot===pilot);
  if(!sq){
    sq={pilot,drones:[]};
    state.squads.push(sq);
  }
  let di=sq.drones.find(d=>d.name.toLowerCase()===dn);
  if(!di){ di={name:drone,qty:0}; sq.drones.push(di); }
  di.qty--;
  if(di.qty===0)sq.drones=sq.drones.filter(d=>d!==di);
  const deficit=di.qty<0;

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
  return deficit?{deficit:true,pilot,drone,qty:di.qty}:null;
}

// Текст/показ предупреждения о списании в минус (ADR-001 §4). Не блокирует —
// вылет уже сохранён, потеря списана; минус закроется оформлением передачи склад→пилот.
function lossDeficitMsg(r){
  return `⚠ ${r.pilot} не имеет ${r.drone} на балансе — баланс уходит в минус (${r.qty}). `+
    'Если борт был выдан со склада, оформите передачу склад → пилот (минус закроется).';
}
function lossDeficitWarn(r){
  if(!r||!r.deficit)return;
  const msg=lossDeficitMsg(r);
  console.warn('[учёт] '+msg);
  if(typeof showSyncToast==='function')showSyncToast(msg,8000);
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
    .topbar, .topbar * { font-size: 13px !important; }
    .topbar .logo { font-size: 15px !important; }
    .nav-tab { font-size: 13px !important; }
    .nav-tab i { font-size: 15px !important; }
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
let authUser={login:'',role:'',actingRole:''};

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
      // actingRole (замещение, Backend v7.6) приходит при каждой авторизации —
      // и по ссылке, и по сохранённому токену; отдельно не персистится
      authUser={login:d.login,role:d.role,actingRole:String(d.acting_role||'').toLowerCase().trim()};
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
    authUser={login:'local',role:'admin',actingRole:''};
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
    const sq=(state.squads||[]).find(q=>q.pilot===authUser.login);
    return sq?pilotRoleValue(sq):'cmd';   // ключ расчёта, не индекс
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
    // Роль пилота — 'pilot:<ключ расчёта>'; сохранённая роль старого формата 'pilot_N'
    // нормализуется здесь (иначе значение не совпало бы с опцией селектора и «взгляд»
    // мог указать на чужой расчёт после пересборки списка)
    const savedRole=normalizePilotRole(localStorage.getItem('role')||'admin');
    const r=(savedRole==='admin'||savedRole==='cmd'||savedRole==='tech'||isPilotViewRole(savedRole))?savedRole:'admin';
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
      const tbShields=isPilotViewRole(r)?goldShieldsHtml(authUser.login,{inline:true}):'';
      // «и.о.» — видимый признак действующего замещения (acting_role)
      const actingBadge=authUser.actingRole?' · <span style="color:var(--accent2)">и.о. '+esc(authUser.actingRole)+'</span>':'';
      badge.innerHTML='<b>'+esc(authUser.login)+'</b>'+tbShields+(authUser.role==='viewer'?' · Наблюдатель':'')+actingBadge;
    }
  }
  setTimeout(applyRoleRestrictions,100);
  setTimeout(initQuickForm,150);
}


function logout(){
  localStorage.removeItem('auth_token');
  authToken='';authUser={login:'',role:'',actingRole:''};
  location.reload();
}

// Подтяжка actingRole из блока users полного чтения (зовёт syncPullAll в рантайме —
// раз в 5 мин и при входе). Замещение, назначенное/снятое админом, доезжает до
// устройства без перелогина; при изменении — перерисовка прав (switchRole идемпотентен).
function syncApplyActingRole(users){
  if(!authUser.login||authUser.login==='local')return;
  const u=(users||[]).find(x=>x.login===authUser.login);
  if(!u)return;
  const acting=String(u.acting_role||'').toLowerCase().trim();
  if(acting===(authUser.actingRole||''))return;
  authUser.actingRole=acting;
  showSyncToast(acting?('Вам назначено замещение: '+acting):'Замещение снято');
  switchRole(state.role);          // canEdit-кнопки/панели под новую эффективную роль
  applyRoleFromAuth();             // бейдж «и.о.» в topbar
  if(typeof fillDataLists==='function')fillDataLists(); // опции «не бг»/«списан» в передаче
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
      // Каноническое переименование локации (04.09.2026): раньше здесь правились
      // squads/flights и t.pilot/t.from/t.to, но НЕ t.location — локация adjust-записей
      // оставалась на позывном, и ledger расходился с наличием. Теперь общая точка
      // с adminRenamePilot (без confirm — переименование уже подтверждено созданием
      // пользователя; выгрузка своя, ниже).
      // Коллизия «логин уже есть как расчёт» = СЛИЯНИЕ, и оно разрушительно — раньше этот
      // путь только переименовывал. Спрашиваем явно (в adminRenamePilot то же слияние
      // требует двойного подтверждения); отказ — учётка создана, переименование пропущено.
      const _n=v=>String(v||'').trim().toLowerCase();
      const collide=(state.squads||[]).some(sq=>_n(sq.pilot)===_n(login)&&_n(sq.pilot)!==_n(callsign));
      const okRename=!collide||confirm('⚠ Расчёт «'+login+'» уже существует.\n\n'
        +'Переименование позывного «'+callsign+'» в логин «'+login+'» СОЛЬЁТ два расчёта в один\n'
        +'(борта сложатся, вылеты и журнал движений перейдут на «'+login+'»).\n\n'
        +'Продолжить? Отмена — учётка будет создана, но позывной в данных останется прежним.');
      const changed=okRename&&_renamePilotApply(callsign,login)>0;
      if(changed){
        if(typeof fillDataLists==='function')fillDataLists(); // селекты передачи — на новое имя
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

// Последний вход пользователя — по login-записям журнала действий (type='auth').
// actLog может отставать от облака: showAdminTab('users') освежает его loadActLogFromCloud.
function _userLastLogin(login){
  const e=actLog.find(x=>x.type==='auth'&&x.action==='login'&&x.user===login); // actLog отсортирован по ts убыв.
  return e?(e.date+' '+e.time):'—';
}

async function loadUsersList(){
  // Список пользователей (логины/роли/токен-операции) — только админской УЧЁТКЕ
  if(!isAdminAccount())return;
  const {url}=syncGetCfg();
  if(!url||!authToken)return;
  try{
    const r=await fetch(url+'?action=read&token='+encodeURIComponent(authToken)+'&_='+Date.now());
    const d=await r.json();
    const users=d.users||[];
    const el=document.getElementById('usersList');
    if(!el)return;
    // Селект замещения: '' = нет; значение из листа users (acting_role, Backend v7.6).
    // ЗАМЕЩАТЬ МОЖНО ТОЛЬКО cmd/tech/pilot (аудит 12.08.2026):
    //  • VIEWER — сужение прав, а замещение только РАСШИРЯЕТ. Ломается тихо: серверный
    //    viewerGuard (backend.gs) считает ЭФФЕКТИВНУЮ роль и режет запись, клиент
    //    (guardWrite/syncReadOnly) смотрит на базовую и писать разрешает → POST уходит
    //    no-cors, ответ непроверяем, на экране «сохранено», в облаке пусто = ТИХАЯ
    //    ПОТЕРЯ ДАННЫХ. Снятие прав — блокировкой учётки («Блок») или сменой роли.
    //  • ADMIN — админ единственный, «и.о. admin» не существует. Сервер и так не давал
    //    замещающему админ-операций (ADMIN_ACTIONS по БАЗОВОЙ роли), но клиент по
    //    hasRole('admin') открывал ему опасное: перешифровку облака, URL Apps Script.
    //    Опасные операции теперь строго по УЧЁТКЕ — isAdminAccount(), см. ниже.
    const AR_OPTS=['','cmd','tech','pilot'];
    el.innerHTML=users.length?`
      <table style="width:100%;font-size:12px">
        <thead><tr><th>Логин</th><th>Роль</th><th>Замещение</th><th>Статус</th><th>Последний вход</th><th>Действие</th></tr></thead>
        <tbody>${users.map((u,i)=>{const lj=esc(u.login).replace(/'/g,"\\'");const ar=String(u.acting_role||'').toLowerCase().trim();return `<tr>
          <td style="padding:6px 8px">${esc(u.login)}</td>
          <td style="padding:6px 8px">${esc(u.role)}</td>
          <td style="padding:6px 8px">${ar?`<span class="tag tag-warn">и.о. ${esc(ar)}</span>`:'<span style="color:var(--muted)">—</span>'}</td>
          <td style="padding:6px 8px"><span class="tag ${u.active?'tag-ok':'tag-danger'}">${u.active?'активен':'заблокирован'}</span></td>
          <td style="padding:6px 8px;white-space:nowrap;color:var(--muted)">${esc(_userLastLogin(u.login))}</td>
          <td style="padding:6px 8px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">
            <select id="ar-sel-${i}" style="width:110px;font-size:11px;padding:2px 4px">
              ${AR_OPTS.map(o=>`<option value="${o}"${o===ar?' selected':''}>${o?('и.о. '+o):'— нет —'}</option>`).join('')}
            </select>
            <button class="btn btn-sm" onclick="setActingRole('${lj}',document.getElementById('ar-sel-${i}').value)">Замещение</button>
            <button class="btn btn-sm btn-primary" onclick="regenerateToken('${lj}')">Новая ссылка</button>
            <button class="btn btn-sm btn-danger" onclick="toggleUser('${lj}',${!u.active})">${u.active?'Блок':'Разблок'}</button>
          </td>
        </tr>`;}).join('')}</tbody>
      </table>`:'<div style="color:var(--muted);font-size:12px">Нет пользователей</div>';
  }catch(e){}
}

// Назначить/снять замещение (acting_role, Backend v7.6). Пустое значение = снять.
// Только admin (клиентский guard; сервер гейтит по БАЗОВОЙ роли admin_token).
async function setActingRole(login,acting){
  if(!guardAdmin())return;
  const {url}=syncGetCfg();
  if(!url||!authToken)return;
  const val=String(acting||'').toLowerCase().trim();
  try{
    await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({action:'set_acting_role',admin_token:authToken,login,acting_role:val})});
    await new Promise(r=>setTimeout(r,1500));
    logAction('user','acting',val?('Назначено замещение «'+val+'» пользователю '+login):('Снято замещение у '+login));
    showSyncToast(val?('✓ Замещение «'+val+'» — '+login):('✓ Замещение снято — '+login));
    // Правка самого себя — применяем сразу, не дожидаясь 5-минутного sync
    if(login===authUser.login){authUser.actingRole=val;switchRole(state.role);applyRoleFromAuth();}
    loadUsersList();
  }catch(e){alert('Ошибка: '+e.message);}
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


// ============ РЕДАКТИРОВАНИЕ ВЫЛЕТА В ЖУРНАЛЕ (окно 10 минут) ============
// Единая точка окна правки — editWindowMs(f): 10 мин от МОМЕНТА ВВОДА (f._savedTs,
// не f.time). tech/cmd/admin (эффективная роль) — любой вылет; пилот — свой
// (исполнитель или автор записи); остальные — 0 (нет доступа). Полный доступ
// админа через раздел Администратор → Вылеты — отдельный путь, окном не ограничен.
const FLIGHT_EDIT_WINDOW_MS=10*60*1000;

// Серая фиксация после ✓ (ключ — id вылета): 'sent' — правка отправлена, строка серая,
// полоса свёрнута в плашку «Править/Зафиксировать»; 'editing' — серость снята повторным
// открытием, полоса обычная; 'locked' — финализация (второй ✓ или кнопка «Зафиксировать»),
// правка в журнале закрыта досрочно (canEditFlight=false). СОЗНАТЕЛЬНО НЕ поле f._*:
// syncPushAll шифрует запись целиком, _savedTs/_edited уходят в облако как есть — новый
// флаг стал бы вечным мусорным полем во всех копиях. Плата за рантайм-Map: после F5
// состояние сбрасывается (запись снова просто в окне 10 мин — приемлемо).
const _flEditState=new Map();
function editWindowMs(f){
  if(isViewerRole(state.role)||isViewerRole(authUser.role))return 0;
  if(hasAnyRole(['tech','cmd','admin'])||authUser.role==='admin')return FLIGHT_EDIT_WINDOW_MS;
  const submitter=f._submittedBy||f.pilot||'';
  return (submitter===authUser.login||f.pilot===authUser.login)?FLIGHT_EDIT_WINDOW_MS:0;
}

function canEditFlight(f){
  if(f&&f.id!=null&&_flEditState.get(String(f.id))==='locked')return false; // финализировано досрочно
  if(_isPreCutFlight(f))return false; // ЧЕРТА (Этап 3): вылет записан до черты — заморожен
  const win=editWindowMs(f);
  const savedTs=f._savedTs||0;
  if(!win||!savedTs)return false; // нет доступа или нет метки времени
  return Date.now()-savedTs<win;
}

// Резолв вылета по ключу полосы редактирования: сначала стабильный id, затем
// индексный фолбэк 'iN' (записи без id) и голое число (совместимость со старой
// разметкой, оставшейся в DOM до перерисовки).
function _flightByKey(key){
  if(key==null)return null;
  const k=String(key);
  const byId=state.flights.find(f=>f&&f.id!=null&&String(f.id)===k);
  if(byId)return byId;
  // Позиционный фолбэк — только для ИСТОРИЧЕСКИХ записей без id, и только если на этой
  // позиции по-прежнему запись без id (04.09.2026). Раньше возвращалась любая запись:
  // pollCloud делает unshift чужих вылетов, все позиции съезжают — и правка молча
  // уходила в соседний вылет. Не нашли — честный промах (вызывающий покажет сообщение).
  const m=/^i?(\d+)$/.exec(k);
  const byIdx=m?state.flights[+m[1]]:null;
  return (byIdx&&byIdx.id==null)?byIdx:null;
}

// Ключ полосы/состояния: стабильный id, фолбэк 'i'+индекс для исторических записей без id
function _flEditKey(x,realIdx){return x.id?String(x.id):('i'+realIdx);}
// Ключ в inline-обработчик: экранирование для JS-литерала И для HTML-атрибута.
// esc добавлен 04.09.2026: id приходит из облака (чужое устройство / правка листа руками),
// то есть внешние данные — по правилу CLAUDE §11 в разметку они идут только через esc.
function _flKeyJs(key){return esc(String(key).replace(/\\/g,'\\\\').replace(/'/g,"\\'"));}
function _flMinsLeft(x){return Math.max(1,Math.round((editWindowMs(x)-(Date.now()-(x._savedTs||0)))/60000));}

function renderFlightEditRow(x, realIdx){
  const key=_flEditKey(x,realIdx);
  const st=_flEditState.get(key);
  if(st==='locked')return ''; // финализировано — полоса больше не открывается
  if(!canEditFlight(x))return '';
  if(st==null)return ''; // свёрнуто — кнопка «✏ N мин» в строке (renderFlights), полоса по клику
  const minsLeft=_flMinsLeft(x);
  // Нормализация времени для type="time": «9:53» (легаси AI-импорта) — невалидный
  // атрибут, Chromium рендерит контрол пустым; паддинг как в toMs (renderFlights)
  const _hm=(x.time||'').trim();
  const hmNorm=_hm.includes(':')?_hm.split(':').map(p=>p.padStart(2,'0')).join(':'):_hm;
  // Адресация полосы — по СТАБИЛЬНОМУ id записи, не по индексу: syncPushAll при merge
  // доливает облачные вылеты и пересортировывает state.flights БЕЗ перерисовки
  // (sync.js), поэтому зашитый в DOM индекс устаревал — правка уходила в чужой вылет
  // либо тихо не проходила (canEditFlight у соседа false → молчаливый return).
  // Фолбэк 'i'+realIdx — только для исторических записей без id.
  const fid=esc(key);                                          // в id атрибутов
  const kjs=_flKeyJs(key);                                     // в inline-JS (одинарные кавычки)
  // Серая фиксация: после ✓ полоса свёрнута — «Править» снимает серость (правка
  // продолжается), «Зафиксировать» финализирует досрочно (как второй ✓)
  if(st==='sent'){
    return '<div class="fl-edit-row fl-edit-sent" style="display:flex;gap:8px;align-items:center;padding:3px 10px 3px 12px;background:var(--inset);border-left:2px solid var(--muted);flex-wrap:wrap">'
      +'<span style="font-size:10px;color:var(--muted);letter-spacing:1px;white-space:nowrap">✓ отправлено</span>'
      +'<button class="btn btn-sm" style="padding:2px 8px;font-size:10px;letter-spacing:0" onclick="flEditReopen(\''+kjs+'\')">✏ Править ('+minsLeft+' мин)</button>'
      +'<button class="btn btn-sm" style="padding:2px 8px;font-size:10px;letter-spacing:0" onclick="flEditFinalize(\''+kjs+'\')">✓ Зафиксировать</button>'
      +'</div>';
  }
  // Пилот записи для picker'ов — резолвим в рантайме (не вшиваем имя в inline-JS)
  const pj='(_flightByKey(\''+kjs+'\')||{}).pilot||\'\'';
  return '<div class="fl-edit-row" style="display:flex;gap:5px;align-items:center;padding:3px 10px 3px 12px;background:rgba(57,255,20,0.03);border-left:2px solid var(--green3);flex-wrap:wrap">'
    +'<span style="font-size:10px;color:var(--green3);letter-spacing:1px;white-space:nowrap">✏ '+minsLeft+' мин</span>'
    +'<input style="width:106px;font-size:11px;padding:2px 5px" type="date" value="'+esc(x.date||'')+'" id="edit-date-'+fid+'">'
    +'<input style="width:66px;font-size:11px;padding:2px 5px" type="time" value="'+esc(hmNorm)+'" id="edit-time-'+fid+'">'
    +'<input style="width:36px;font-size:11px;padding:2px 5px;text-align:center" type="number" min="1" value="'+(x.flightnum||'')+'" placeholder="#" id="edit-flightnum-'+fid+'">'
    +'<input style="width:90px;font-size:11px;padding:2px 5px" value="'+esc(x.target||'')+'" placeholder="Точка" id="edit-target-'+fid+'" autocomplete="off">'
    +'<input style="width:90px;font-size:11px;padding:2px 5px" value="'+esc(x.ammo||'')+'" placeholder="Боеприпас" id="edit-ammo-'+fid+'" autocomplete="off" onclick="event.stopPropagation();showQuickPicker(this,getSmartAmmo('+pj+'),v=>{this.value=v})">'
    +'<input style="width:75px;font-size:11px;padding:2px 5px" value="'+esc(x.drone||'')+'" placeholder="БПЛА" id="edit-drone-'+fid+'" autocomplete="off" onclick="event.stopPropagation();showQuickPicker(this,getSmartDrones('+pj+'),v=>{this.value=v})">'
    +'<select style="font-size:11px;padding:2px 3px" id="edit-result-'+fid+'">'
    +'<option value="yes" '+(x.result==='yes'?'selected':'')+'>✅ выполнена</option>'
    +'<option value="no" '+(x.result==='no'?'selected':'')+'>❌ нет</option></select>'
    +'<select style="font-size:11px;padding:2px 3px" id="edit-returned-'+fid+'">'
    +'<option value="yes" '+(x.returned==='yes'?'selected':'')+'>вернул</option>'
    +'<option value="no" '+(x.returned==='no'?'selected':'')+'>потерян</option></select>'
    +'<input style="flex:1;min-width:80px;font-size:11px;padding:2px 5px" value="'+esc(x.note||'')+'" placeholder="Примечание" id="edit-note-'+fid+'">'
    +'<button class="btn btn-success btn-sm" style="padding:2px 8px;font-size:10px;letter-spacing:0" onclick="saveFlightEdit(\''+kjs+'\')">✓</button>'
    +'</div>';
}

// key — стабильный id вылета (фолбэк 'iN' для записей без id), см. renderFlightEditRow.
// Молчаливый провал недопустим: раньше при устаревшем индексе функция просто выходила,
// и клик по ✓ выглядел как сохранение (ни очереди, ни записи, после F5 старое значение).
function saveFlightEdit(key){
  const f=_flightByKey(key);
  if(!f){ alert('Запись не найдена — журнал изменился. Обновите страницу (F5) и повторите правку.'); return; }
  if(!canEditFlight(f)){
    const locked=f.id!=null&&_flEditState.get(String(f.id))==='locked';
    alert(_isPreCutFlight(f)
      ?'Вылет записан ДО черты — правка запрещена (старая история заморожена).'
      :(locked?'Запись зафиксирована — правка в журнале закрыта. Полный доступ — Администратор → Вылеты.'
              :'Окно правки (10 мин) истекло или нет прав. Полный доступ — Администратор → Вылеты.'));
    renderFlights();   // убрать устаревшую полосу из DOM
    return;
  }
  const sfx=String(key); // суффикс id полей полосы = ключ кнопки (esc в разметке декодируется браузером)
  const oldReturned=f.returned;
  // DIRTY-ONLY (блок «ПОЛОСЫ РЕДАКТИРОВАНИЯ»): заливаем ТОЛЬКО поля, изменённые оператором
  // относительно снапшота открытия полосы. Нетронутое поле не пишется вовсе — если его тем
  // временем поменяли извне (Администратор → Вылеты не перерисовывает журнал; чужое
  // устройство через поллинг), значение остаётся. Раньше полоса заливала ВСЕ поля своими
  // значениями на момент рендера → время из админки откатывалось.
  const rd=fld=>_stripDirty(_flEditDraft,'edit',fld,sfx);
  let touched=0;
  // Дата/время: связка с loss-записью не рвётся — поиск идёт по flightId первым
  // уровнем (writeDroneLoss пишет f.id), дата+время — только фолбэк для исторических
  const dt=rd('date'); if(dt.dirty&&dt.value){f.date=dt.value;touched++;}
  // Время: у частично заполненного time-контрола value==='' (спецификация), молчаливый
  // фолбэк выглядел как «откат при сохранении». badInput отличает недобитый ввод
  // (например «15:--») от нетронутого пустого поля — предупреждаем, не глотаем.
  const tm=rd('time');
  if(tm.dirty){
    if(tm.value){f.time=tm.value;touched++;}
    else if(tm.el&&tm.el.validity&&tm.el.validity.badInput) alert('Время введено не полностью (часы И минуты) — оставлено прежнее: '+(f.time||'—'));
  }
  ['target','ammo','drone','result','returned'].forEach(fld=>{
    const r=rd(fld); if(r.dirty&&r.value){f[fld]=r.value;touched++;}
  });
  const nt=rd('note'); if(nt.dirty){f.note=nt.value;touched++;}
  const fn=rd('flightnum'); if(fn.dirty&&fn.value){f.flightnum=parseInt(fn.value);touched++;}
  if(touched)f._edited=true;
  // Смена статуса борта в окне редактирования — пересчёт склада, как в админском пути
  // (раньше «вернул↔потерян» здесь менял только текст и склад расходился с журналом)
  if(oldReturned!==f.returned&&(f.drone||'').trim()){
    if(f.returned==='no'){
      lossDeficitWarn(applyLossIfNeeded(f)); // списание ровно один раз (_lossWritten) + push склада; минус → предупреждение
    } else {
      returnLossDrone(f);               // возврат борта + удаление loss-записи (сам пушит склад)
      f._lossWritten=false;
    }
  }
  // Дистанции зависят от returned (×2 при возврате, ×1 при потере) — пересчитываем
  if(oldReturned!==f.returned){
    if(f.result==='no'&&f.returned==='no'){ delete f.range_km; delete f.distance_km; } // борт не долетел
    else {
      const r=geoComputeFlight(f);
      if(r){ f.range_km=r.range_km; f.distance_km=r.distance_km; f.geo_locked=true; }
      else if(typeof geoRedistance==='function' && geoRedistance(f)){
        // База не загружена или точка не нашлась. Дальность (старт→цель) от статуса не зависит
        // и остаётся верной, а путь пересчитывается из неё арифметикой (×2 при возврате).
        // Раньше здесь оставался путь ОТ ПРЕЖНЕГО статуса под 🔒 — заведомо неверное число,
        // которое не чинил ни один массовый пересчёт.
        if(typeof geoNoBaseNotice==='function') geoNoBaseNotice('правка вылета');
      }
    }
  }
  // Серая фиксация: первый ✓ → 'sent' (серая, полоса свёрнута); ✓ из переоткрытой
  // полосы ('editing') → 'locked' (финализация, правка закрыта досрочно).
  // Записи без id (исторические) состояние не ведут — ведут себя как раньше.
  if(f.id!=null){
    const k=String(f.id);
    _flEditState.set(k,_flEditState.get(k)==='editing'?'locked':'sent');
  } else _flEditState.delete(sfx); // без id состояние не ведём — полоса просто сворачивается
  _flEditDraft.delete(sfx);        // черновик закрыт
  saveLocal();
  renderFlights();
  renderDashboard();
  renderInventory();
  logAction('flight','edit','Вылет #'+f.flightnum+' '+f.pilot+' отредактирован'+(oldReturned!==f.returned?' [смена статуса борта]':''));
}

// Кнопки серой плашки: повторное открытие полосы (серость снимается, правка продолжается)
// и досрочная финализация (замок; окно 10 мин в остальном добивает само).
// ✏ в строке (свёрнутая полоса) → развернуть ('open'); ✏ в серой плашке → 'editing'
function flEditOpen(key){
  const f=_flightByKey(key);
  if(!f||!canEditFlight(f)){renderFlights();return;} // окно истекло/замок — просто перерисовать
  _stripOpen(_flEditState,_flEditDraft,key,'open');
  renderFlights();
}
function flEditReopen(key){
  const f=_flightByKey(key);
  if(!f||!canEditFlight(f)){renderFlights();return;}
  _stripOpen(_flEditState,_flEditDraft,key,'editing');
  renderFlights();
}
function flEditFinalize(key){
  const f=_flightByKey(key);
  if(f&&f.id!=null)_flEditState.set(String(f.id),'locked');
  renderFlights();
}
// Частотный список значений поля вылета для пилота: окно 7 дней, при пустом
// результате фолбэки (вся история пилота → вся история всех) — попап никогда не пустой
function _smartFieldList(field,pilot){
  const cutoff=new Date();
  cutoff.setDate(cutoff.getDate()-7);
  const cutoffStr=localISO(cutoff);
  const byFreq=list=>{
    const freq={};
    list.forEach(f=>{freq[f[field]]=(freq[f[field]]||0)+1;});
    return Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([v])=>v);
  };
  let recent=state.flights.filter(f=>(!pilot||f.pilot===pilot)&&f[field]&&f.date>=cutoffStr);
  if(!recent.length)recent=state.flights.filter(f=>(!pilot||f.pilot===pilot)&&f[field]);
  if(!recent.length)recent=state.flights.filter(f=>f[field]);
  return byFreq(recent);
}

// Умный список точек — часто используемые текущим пилотом вверху
function getSmartTargets(){
  const pilot=document.getElementById('qf-pilot')?.value||'';
  return _smartFieldList('target',pilot);
}

// Умный список боеприпасов — частота по пилоту, справочник ammoCatalog хвостом
function getSmartAmmo(pilot){
  if(pilot==null)pilot=document.getElementById('qf-pilot')?.value||'';
  const list=_smartFieldList('ammo',pilot);
  ammoCatalog.forEach(a=>{if(a.name&&!list.includes(a.name))list.push(a.name);});
  return list;
}

// Умный список бортов: пилот выбран и найден в расчётах → только его борта (qty>0);
// иначе — борта всех расчётов (qty>0) + склад со статусом БГ (qty>0), без nbg/lost.
// Список нестрогий — свободный ввод модели в поле сохранён.
// Без аргумента — пилот из формы подачи (qf-pilot); полоса журнала передаёт пилота записи.
function getSmartDrones(pilot){
  if(pilot==null)pilot=document.getElementById('qf-pilot')?.value||'';
  pilot=(pilot||'').trim();
  const sq=pilot?state.squads.find(s=>s.pilot===pilot):null;
  if(sq){
    const own=[...new Set(sq.drones.filter(d=>d.qty>0).map(d=>d.name))].sort((a,b)=>a.localeCompare(b,'ru'));
    if(own.length)return own;
  }
  return [...new Set([
    ...state.squads.flatMap(s=>s.drones.filter(d=>d.qty>0).map(d=>d.name)),
    ...state.stock.filter(d=>d.status==='bg'&&d.qty>0).map(d=>d.name)
  ])].sort((a,b)=>a.localeCompare(b,'ru'));
}

// Модели, реально доступные у ИСТОЧНИКА передачи (читает селект «От кого» #transFrom
// в момент клика — смена источника при открытой форме сразу даёт актуальный список):
// склад → stock qty>0 со статусами bg И nbg (передача не вылет — «не бг → склад/пилот»
// легитимна, lost исключён); «не бг» → только nbg; пилот → его drones qty>0.
// Список нестрогий — свободный ввод сохранён; пусто у источника → picker не открывается.
function getTransferDrones(){
  const from=(document.getElementById('transFrom')?.value||'склад').trim();
  let names=[];
  if(from==='склад'){
    names=state.stock.filter(d=>d.qty>0&&(d.status==='bg'||d.status==='nbg')).map(d=>d.name);
  } else if(from==='не бг'){
    names=state.stock.filter(d=>d.qty>0&&d.status==='nbg').map(d=>d.name);
  } else {
    const sq=state.squads.find(s=>s.pilot===from);
    names=sq?sq.drones.filter(d=>d.qty>0).map(d=>d.name):[];
  }
  return [...new Set(names)].sort((a,b)=>a.localeCompare(b,'ru'));
}

// Модели, доступные к отдаче в обмене: строго склад БГ qty>0 —
// saveExchange списывает отданное только со строки status='bg'
function getExchangeGiveDrones(){
  return [...new Set(state.stock.filter(d=>d.status==='bg'&&d.qty>0).map(d=>d.name))]
    .sort((a,b)=>a.localeCompare(b,'ru'));
}

// Список пилотов для пикера: расчёты (канонический источник, §9), фолбэк — вылеты
function getSmartPilots(){
  const sq=state.squads.map(s=>s.pilot).filter(Boolean);
  const src=sq.length?sq:state.flights.map(f=>f.pilot).filter(Boolean);
  return [...new Set(src)].sort((a,b)=>a.localeCompare(b,'ru'));
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
  if(isPilotRole(currentRole())){
    if(qpWrap)qpWrap.style.display='none';
    // Для локальной/админской учётки — имя из ВЫБРАННОГО в переключателе расчёта
    // (04.09.2026: было state.squads[0] — во «взгляде пилота» форма подставляла первого
    //  по списку, а не того, кого выбрали; теперь имя берётся из ключа в значении роли)
    const pilotName=authUser.login&&authUser.login!=='local'&&authUser.login!=='admin'
      ?authUser.login
      :pilotRoleName(currentRole()); // не резолвится — оставляем пусто: подставить
                                     // «первого по списку» хуже, чем пустое поле
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
  const lossDef=applyLossIfNeeded(f);  // {deficit} если списание ушло в минус (ADR-001 §4)
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
  // Списание в минус — вылет сохранён и потеря списана; оператору сигнал, не ошибка
  if(lossDef){
    setStatus('qf-status','✓ Вылет #'+f.flightnum+' записан — '+f.time+'. '+lossDeficitMsg(lossDef),'warn');
    lossDeficitWarn(lossDef);
  } else {
    setStatus('qf-status','✓ Вылет #'+f.flightnum+' записан — '+f.time,'ok');
  }
  logAction('flight','add','Вылет #'+f.flightnum+' '+pilot+' '+drone+(f.returned==='no'?' [потеря]':'')+(lossDef?' [баланс в минус: '+lossDef.qty+']':''));
  setTimeout(()=>{const st=document.getElementById('qf-status');if(st)st.textContent='';},lossDef?12000:3000);
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
      try{const data=syncUnmarkData(row.data);return JSON.parse(key?await aesDecrypt(data,key):data);}catch(e){return null;}
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
//  admin            — всё (Синхронизация/URL, Шифрование+смена ключа, Статус);
//  cmd/tech/pilot   — ключ шифрования (со своей кнопкой сохранения) + Статус с «Синхронизировать сейчас»;
//  viewer           — ключ шифрования + только текст статуса (без кнопок).
// Пользователи переехали в Администратор → Пользователи (v0.26, вкладка видна только admin).
// Карточка синхронизации (URL Apps Script) и блок смены ключа — по УЧЁТКЕ admin
// (isAdminAccount), не по эффективной роли: это опасные операции, а «и.о. admin» не
// существует (12.08.2026). Побочно: админ во «взгляде командира/пилота» их теперь видит —
// переключатель ролей меняет представление данных, а не права учётки.
function applySettingsVisibility(){
  const isAdmin=isAdminAccount();
  const isViewer=isViewerRole(currentRole())||isViewerRole(authUser.role);
  const show=(id,v)=>{ const el=document.getElementById(id); if(el)el.style.display=v?'':'none'; };
  show('cfg-sync-card',isAdmin);        // URL Apps Script, проверка, загрузка/выгрузка
  show('cfg-key-save-btn',!isAdmin);    // не-админам — своя кнопка сохранения ключа (общая «Сохранить настройки» скрыта вместе с картой синхронизации)
  show('cfg-status-actions',!isViewer); // viewer — только текст последней синхронизации
  updateEncryptBadge();                 // блок смены ключа — только admin (и только при заданном ключе)
}

// Видимость вкладок/форм для роли только-чтение (viewer). Вызывается из switchRole.
function applyViewerUI(r){
  const v=isViewerRole(r);
  ['invNavBtn','importNavBtn','vtxNavBtn'].forEach(id=>{
    const b=document.getElementById(id);
    if(b)b.style.display=v?'none':'';
  });
  const qfc=document.getElementById('quickFlightCard');
  if(qfc)qfc.style.display=v?'none':'';
  // Если наблюдатель оказался на скрытой странице — уводим на Обзор
  if(v){
    const active=document.querySelector('.page.active');
    if(active&&['page-inventory','page-import','page-admin','page-vtx'].includes(active.id)){
      showPage('dashboard',document.querySelector('#nav button'));
    }
  }
}

function applyRoleRestrictions(){
  const isPilot=isPilotRole(currentRole());
  const isTech=hasRole('tech');
  const isCmd=hasRole('cmd');
  const isAdmin=hasRole('admin');

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
  if(keyField&&keyField!==cfg.key) getKeyCacheClear(); // ключ реально сменился — сбросить кэш деривации
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
  if(keyField!==cfg.key) getKeyCacheClear(); // смена ключа — сбросить кэш деривации
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
  // Смена ключа — опасная операция: гейт по УЧЁТКЕ admin, не по эффективной роли
  if(rb)rb.style.display=(cfg.key&&isAdminAccount())?'block':'none';
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
  // Перешифровка ВСЕГО облака — самая опасная операция приложения: строго по УЧЁТКЕ
  // admin (isAdminAccount). Раньше «роль ИЛИ учётка» с hasRole('admin') пускало сюда
  // и.о. admin — замещение admin запрещено (AR_OPTS), гейт приведён к учётке явно.
  const isAdmin=isAdminAccount();

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

    // 5. Сохраняем новый ключ локально. Кэш деривации чистим ЗДЕСЬ, а не раньше:
    // выше в этой же функции старый ключ ещё нужен (чтение облака старым → запись новым).
    getKeyCacheClear();
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
// Кэш выведенных ключей (аудит 12.08.2026). PBKDF2 100k итераций ≈40 мс, а getKey
// звался на КАЖДУЮ запись: полная загрузка (~1700 строк) ≈69 с CPU, ambient-merge
// syncPushAll (чтение+шифрование ~1200 записей через 2 с после каждой правки) ≈97 с.
// Теперь деривация одна на ключ. Соль/итерации/алгоритм ПРЕЖНИЕ — формат данных не
// меняется, старые записи читаются как раньше.
// Кэшируем сам Promise, а не разрешённый ключ: строки шифруются/расшифровываются
// пачкой через Promise.all — к моменту возврата первой деривации остальные вызовы
// уже стартовали бы, и кэш «готового ключа» их не поймал бы.
const _keyCache=new Map();
// Сброс — при смене ключа шифрования (cfgReencrypt / сохранение нового ключа),
// чтобы в памяти не оставался старый выведенный ключ. Корректность от этого не
// зависит (кэш адресуется паролем), это гигиена.
function getKeyCacheClear(){ _keyCache.clear(); }
function getKey(password){
  const pw=String(password??'');
  const hit=_keyCache.get(pw);
  if(hit) return hit;
  const enc=new TextEncoder();
  const p=crypto.subtle.importKey('raw',enc.encode(pw),{name:'PBKDF2'},false,['deriveKey'])
    .then(km=>crypto.subtle.deriveKey({name:'PBKDF2',salt:enc.encode('asu-bpla-v1'),iterations:100000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']))
    .catch(e=>{ _keyCache.delete(pw); throw e; }); // неудачную деривацию не кэшируем
  if(_keyCache.size>8) _keyCache.clear(); // страховка от роста при опечатках в поле ключа
  _keyCache.set(pw,p);
  return p;
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
  // Синхронизируем селектор роли и применяем.
  // «Взгляд пилота» может отсутствовать в опциях: список расчётов в селекторе строит
  // rebuildRoleSelector позже (fillDataLists/applyRoleFromAuth). Раньше в этом случае
  // безусловно ставилась 'cmd', а switchRole тут же ПЕРЕЗАПИСЫВАЛ localStorage['role'] —
  // сохранённый «взгляд» терялся навсегда, и нормализация легаси-формата ('pilot_N')
  // до него не доживала. Теперь роль пилота применяем как есть, селектор досинхронизирует
  // applyRoleFromAuth (он же пересоберёт опции и нормализует значение).
  const roleSel=document.getElementById('roleSwitch');
  const savedRoleN=normalizePilotRole(savedRole);
  const optExists=[...roleSel.options].some(o=>o.value===savedRoleN);
  if(optExists)roleSel.value=savedRoleN;
  else if(!isPilotViewRole(savedRoleN))roleSel.value='cmd';
  switchRole((optExists||isPilotViewRole(savedRoleN))?savedRoleN:'cmd');
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
