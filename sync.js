// sync.js — Sync Module v2 (часть app.js, грузить ПЕРВЫМ)
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

// Роль только-чтение: устройство наблюдателя (viewer) НЕ пишет данные в облако.
// Защита на уровне sync-слоя — все точки записи проходят через эти функции,
// поэтому работает независимо от скрытия кнопок в UI. Исключение — actlog
// (appendToCloud): аудит входов наблюдателя должен фиксироваться.
function syncReadOnly(){
  try{
    return ((typeof state!=='undefined'&&state.role)||(window.authUser&&authUser.role)||'')==='viewer';
  }catch(e){ return false; }
}

// === Защита шифртекста от порчи Google Sheets (#ERROR!) ===
// Sheets трактует значение ячейки как ФОРМУЛУ, если оно начинается с = + - @,
// и затирает её на «#ERROR!». base64-шифртекст начинается со случайного символа
// алфавита — примерно в 1.6% случаев это «+» → ячейка ломается, запись гибнет
// безвозвратно (atob('#ERROR!') → «not correctly encoded»). Риск ОБЩИЙ для всех
// листов (flights/transfers/stock/squads/actlog); actlog заметнее лишь из-за частых
// login-записей. Решение: триггерные значения помечаем ведущим «~» (нет ни в
// алфавите base64, ни в начале JSON-строки) — Sheets хранит их как текст. Помечаем
// ТОЛЬКО триггерные → 98% записей остаются в прежнем формате, и старые клиенты
// читают их как раньше (а испорченные «+...» всё равно ломались бы — регрессии нет).
// Маркер снимается при чтении, если он есть; записи без маркера читаются как прежде.
// Точки применения — единые: syncEncrypt (все writes) / syncDecrypt (все reads).
const SHEET_FORMULA_TRIGGER=/^[=+\-@]/;
function syncMarkData(data){
  return (typeof data==='string' && SHEET_FORMULA_TRIGGER.test(data)) ? '~'+data : data;
}
function syncUnmarkData(data){
  return (typeof data==='string' && data.charCodeAt(0)===0x7e /* ~ */) ? data.slice(1) : data;
}

async function syncEncrypt(obj, key){
  const json = JSON.stringify(obj);
  const data = key ? await aesEncrypt(json, key) : json;
  return { id: obj.id, data: syncMarkData(data) };
}

async function syncDecrypt(row, key){
  try{
    const data = syncUnmarkData(row.data);
    const json = key ? await aesDecrypt(data, key) : data;
    return JSON.parse(json);
  }catch(e){ console.warn('[SYNC] decrypt error:', e.message, row.id); return null; }
}

// Листы, где отброшенная при расшифровке запись = потеря реальных данных.
// actlog здесь намеренно нет (журнал аудита, битые записи допустимы — тихо).
const SYNC_VALUABLE_SHEETS=['flights','stock','squads','transfers'];
// Дедуп журнальных записей о потере на сессию по сигнатуре «лист|количество»:
// syncDecryptRows для flights зовётся из ambient-merge (debounce 2с после каждого
// сохранения) — без дедупа одна битая запись залила бы actLog одинаковыми
// строками (паттерн login_logged_date). Тост дедупа не имеет — показывается всегда.
const _syncLossLogged=new Set();
async function syncDecryptRows(rows, key, sheet=''){
  if(!rows||!rows.length) return [];
  const results = await Promise.all(rows.map(r => syncDecrypt(r, key)));
  const ok = results.filter(Boolean);
  // Нерасшифрованные записи по-прежнему отбрасываются (приложение не падает),
  // но для ценных листов — заметная сигнализация вместо тихого console.warn:
  // пользователь должен узнать о потере данных (битая запись/неверный ключ).
  // Инвентаризация битых записей — syncAuditEncryption() из консоли.
  const dropped = rows.length - ok.length;
  if(dropped>0 && SYNC_VALUABLE_SHEETS.includes(sheet)){
    console.error('[SYNC] ⚠ ПОТЕРЯ ДАННЫХ: отброшено '+dropped+' нерасшифрованных записей из листа '+sheet);
    try{ showSyncToast('⚠ Потеря данных: не расшифровано '+dropped+' зап. листа «'+sheet+'»', 8000); }catch(e){}
    // Постоянный след в журнале действий (тост гаснет через 8с): logAction (app.js,
    // вызов в рантайме) сохраняет локально и шлёт в облако штатной очередью actlog.
    // Петли нет: сбои расшифровки самого actlog тихие (лист не в SYNC_VALUABLE_SHEETS).
    try{
      const sig=sheet+'|'+dropped;
      if(!_syncLossLogged.has(sig)){
        _syncLossLogged.add(sig);
        logAction('sync','decrypt_loss','⚠ Потеря данных: не удалось расшифровать '+dropped+' записей из листа '+sheet);
      }
    }catch(e){}
  }
  return ok;
}

// Дедупликация по id: в облаке возможны дубль-строки одного id (повторный append
// очереди при неподтверждённой доставке). Первое вхождение выигрывает.
function syncDedupeById(rows){
  const seen=new Set();
  return rows.filter(x=>{ if(!x.id) return true; if(seen.has(x.id)) return false; seen.add(x.id); return true; });
}

async function syncPost(url, body){
  // Всегда cors+redirect:follow; при сетевой ошибке/таймауте — no-cors
  try{
    const ctrl = new AbortController();
    const tid = setTimeout(()=>ctrl.abort(), 30000); // 30с — иначе зависший запрос держит индикатор/очередь
    let r;
    try{
      r = await fetch(url, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body, mode:'cors', redirect:'follow', signal:ctrl.signal
      });
    } finally { clearTimeout(tid); }
    let d;
    try{ d = await r.json(); }
    catch(je){
      // Ответ получен, но это не JSON (редирект/HTML-страница): запрос ДОШЁЛ до
      // сервера — повторная отправка через no-cors создала бы дубль-строку (append_one).
      return { ok:true, data:null, unverified:true };
    }
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

// Отметка времени успешной синхронизации с облаком. Читается renderSettingsStatus
// (app.js, «Последняя синхронизация: …»). До 12.08.2026 ключ 'last_sync' только
// ЧИТАЛСЯ и никем не писался — индикатор в Настройках всегда показывал
// «Ещё не синхронизировано», даже когда обмен шёл нормально.
// Ставится в двух точках успеха: полное чтение (syncPullAll) и полная выгрузка
// (syncPushAll). Дельта-поллинг не отмечаем — он идёт каждые 30 с и обесценил бы
// показатель; точечные выгрузки (stock/flights-only) тоже, чтобы «последняя
// синхронизация» означала полный обмен, а не частичный.
function syncStampLastSync(){
  try{ localStorage.setItem('last_sync', String(Date.now())); }catch(e){}
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

function _qid(x){
  const base=(x.data&&x.data.id)||x.id;
  // tombstone делит id с самой записью (id строки-tombstone = id удалённого вылета).
  // Разводим их в очереди/подтверждении префиксом, иначе flight и его tombstone
  // схлопнулись бы в один элемент очереди и подтверждение доставки путалось бы.
  return x.type==='tombstone' ? 'tomb:'+base : base;
}
const pendingQueue = {
  _key: 'sync_pending_queue',
  load(){ try{ return JSON.parse(localStorage.getItem(this._key)||'[]'); }catch(e){ return []; } },
  save(q){ try{ localStorage.setItem(this._key, JSON.stringify(q)); }catch(e){} updateQueueIndicator(); },
  add(item){
    const id=_qid(item);
    const q=this.load();
    if(id&&q.some(x=>_qid(x)===id)) return; // уже в очереди — не дублируем
    q.push({...item, id, addedAt:Date.now(), lastTryTs:0});
    this.save(q);
  },
  remove(id){ const q=this.load().filter(x=>_qid(x)!==id); this.save(q); },
  markTried(id){ const q=this.load(); const it=q.find(x=>_qid(x)===id); if(it){ it.lastTryTs=Date.now(); this.save(q); } },
  // Подтверждение доставки: элементы, чьи id вернулись из облака, удаляем из кэша
  confirmDelivered(ids){
    if(ids&&ids.size){
      const q=this.load();
      const kept=q.filter(x=>!ids.has(_qid(x)));
      if(kept.length!==q.length){ console.log('[SYNC] подтверждено доставкой:', q.length-kept.length); this.save(kept); }
    }
    // Всегда обновляем индикатор после подтверждения — чтобы «в очереди N» не «висел»:
    // save() вызывает updateQueueIndicator лишь при фактическом удалении записей.
    updateQueueIndicator();
  },
  clear(){ this.save([]); },
  all(){ return this.load(); },
  count(){ return this.load().length; }
};

// Русское склонение для счётчика очереди
function ruPlural(n, one, few, many){
  const m10=n%10, m100=n%100;
  if(m10===1&&m100!==11) return one;
  if(m10>=2&&m10<=4&&(m100<10||m100>=20)) return few;
  return many;
}

// Индикатор "в очереди N изменений" — читаем localStorage напрямую (безопасно вызывать до инициализации очереди)
function updateQueueIndicator(){
  const el=document.getElementById('queueIndicator');
  if(!el) return;
  let n=0;
  try{ n=JSON.parse(localStorage.getItem('sync_pending_queue')||'[]').length; }catch(e){}
  if(n>0){ el.style.display=''; el.textContent='⏳ в очереди '+n+' '+ruPlural(n,'изменение','изменения','изменений'); }
  else { el.style.display='none'; }
}

// Отправка одного элемента очереди (append-only). Не удаляет из очереди —
// удаление произойдёт только после подтверждения поллингом (confirmDelivered).
async function trySendQueueItem(item, url, key, token){
  try{
    const enc = await syncEncrypt(item.data, key);
    const sheet = item.type==='flight'?'flights'
                : item.type==='actlog'?'actlog'
                : item.type==='tombstone'?'tombstones'   // Путь Б: append удаления в общий лист
                : 'transfers';
    const body = JSON.stringify({
      action:'append_one', token,
      sheet,
      row: enc
    });
    const res = await syncPost(url, body);
    if(res.ok) pendingQueue.markTried(_qid(item));
  }catch(e){ console.warn('[SYNC] send error:', e.message); }
}

// Диагностика очереди при старте + очистка зависших записей в локальном режиме.
// Вызывается после initAuth, когда cfg.url/token уже определены.
function syncQueueStartupCheck(){
  const q = pendingQueue.all();
  if(q.length){
    console.log('[QUEUE] При старте в очереди '+q.length+' зап.:');
    q.forEach(x=>console.log('  •', x.type, '| id:', _qid(x),
      '| запись:', ((x.data&&x.data.date)||'?')+' '+((x.data&&x.data.time)||''),
      '| добавлено:', new Date(x.addedAt||0).toLocaleString('ru'),
      '| последняя попытка:', x.lastTryTs?new Date(x.lastTryTs).toLocaleString('ru'):'— ни разу'));
  } else {
    console.log('[QUEUE] Очередь пуста при старте');
  }
  // Облако не настроено (file:// / ?local=1 / нет URL) — отправлять некуда,
  // записи зависнут навсегда. Чистим, чтобы индикатор не врал.
  const {url,token} = syncGetCfg();
  if(!url||!token){
    if(q.length){
      console.warn('[QUEUE] Облако не настроено (url/token пусты) — очередь очищена ('+q.length+' зап. отправить некуда)');
      pendingQueue.clear();
    }
  }
  updateQueueIndicator();
}

// --- Tombstones (удалённые вылеты/loss-передачи) ---
// Хранение: [{id,ts}] — ts нужен для чистки старых записей (раньше — массив id,
// рос бесконечно; старый формат мигрируется на лету с ts=сейчас).
const tombstones = {
  _key: 'sync_tombstones',
  _load(){
    try{
      const raw=JSON.parse(localStorage.getItem(this._key)||'[]');
      if(!Array.isArray(raw)) return [];
      const now=Date.now();
      return raw.map(x=>(x&&typeof x==='object'&&'id' in x)?x:{id:x,ts:now});
    }catch(e){ return []; }
  },
  _save(list){ try{ localStorage.setItem(this._key, JSON.stringify(list)); }catch(e){} },
  load(){ return new Set(this._load().map(x=>x.id)); },
  add(id){ this.addMany([id]); },
  // Массовое добавление одним чтением/записью localStorage (adminClearFlights и т.п.)
  addMany(ids){
    const list=this._load();
    const have=new Set(list.map(x=>x.id));
    const now=Date.now();
    let changed=false;
    ids.forEach(id=>{ if(id!=null&&id!==''&&!have.has(id)){ list.push({id,ts:now}); have.add(id); changed=true; } });
    if(changed) this._save(list);
  },
  has(id){ return this.load().has(id); },
  all(){ return [...this.load()]; },
  // Чистка записей старше maxAgeMs (по умолчанию 90 дней). За это время удаление
  // гарантированно дошло до облака ambient-write'ом — tombstone больше не нужен.
  prune(maxAgeMs){
    const cutoff=Date.now()-(maxAgeMs||90*864e5);
    const list=this._load();
    const kept=list.filter(x=>(x.ts||0)>=cutoff);
    if(kept.length!==list.length){
      console.log('[SYNC] tombstones: удалено '+(list.length-kept.length)+' записей старше 90 дней');
      this._save(kept);
    }
  }
};
tombstones.prune(); // при каждом запуске

// ============================================================
// Путь Б — ОБЩИЕ ОБЛАЧНЫЕ TOMBSTONES (распространение удалений)
// ============================================================
// Публикация удаления: пометить локально + дописать id в облачный лист 'tombstones'
// через ту же очередь с гарантией доставки (append_one + pendingQueue + ретраи).
// Зовётся ИЗ ВСЕХ путей удаления: syncDeleteFlight, returnLossDrone,
// adminClearFlights / adminCleanOrphanLosses / adminDedupeLossTransfers.
// ВАЖНО: слияние ВХОДЯЩИХ облачных tombstones (syncMergeCloudTombstones) пишет в
// набор через tombstones.addMany НАПРЯМУЮ, без публикации — иначе полученные с
// другого устройства удаления уходили бы обратно в облако по кругу.
function syncPublishTombstones(ids){
  const arr=(Array.isArray(ids)?ids:[ids]).filter(x=>x!=null&&x!=='');
  if(!arr.length) return;
  tombstones.addMany(arr);                  // локальная страховка (как было раньше)
  if(syncReadOnly()) return;                // наблюдатель в облако не пишет
  const {url,token}=syncGetCfg();
  if(!url||!token) return;                   // локальный режим — публиковать некуда
  // id строки-tombstone = id удаляемой записи → серверный appendOne идемпотентен
  // (дубль id → {status:'duplicate'}), повторное удаление безопасно.
  arr.forEach(id=>pendingQueue.add({type:'tombstone', data:{id}}));
  if(navigator.onLine) syncFlushQueue();     // попытка немедленной отправки (иначе уйдёт при онлайне)
}

// Слить облачный лист tombstones в локальный набор. id в листе открытый (колонка id),
// расшифровка не нужна. Возвращает raw-id'шники (для подтверждения доставки строятся
// как 'tomb:'+id, см. _qid).
function syncMergeCloudTombstones(rows){
  if(!rows||!rows.length) return [];
  const ids=rows.map(r=>r.id).filter(x=>x!=null&&x!=='').map(String);
  if(ids.length) tombstones.addMany(ids);
  return ids;
}

// Убрать из state записи, попавшие в tombstones. Существующие фильтры чтения гейтят
// только ДОБАВЛЕНИЕ из облака — этот проход чистит уже присутствующие записи (удалённые
// на другом устройстве могли отрендериться до прихода tombstone). Порядок прихода не
// важен. Возвращает true, если что-то удалено.
function syncPruneStateByTombstones(){
  const tb=tombstones.load();
  let removed=false;
  if(Array.isArray(state.flights)){
    const n=state.flights.length;
    state.flights=state.flights.filter(f=>!f.id||!tb.has(f.id));
    if(state.flights.length!==n) removed=true;
  }
  if(Array.isArray(state.transfers)){
    const n=state.transfers.length;
    state.transfers=state.transfers.filter(t=>!t.id||!tb.has(t.id));
    if(state.transfers.length!==n) removed=true;
  }
  return removed;
}

// --- Версия склада ---
let _stockVersion = parseInt(localStorage.getItem('sync_stock_version')||'0');
function syncBumpStockVersion(){
  _stockVersion = Date.now();
  localStorage.setItem('sync_stock_version', String(_stockVersion));
}
function syncPersistStockVersion(){ try{ localStorage.setItem('sync_stock_version', String(_stockVersion)); }catch(e){} }

// ===== Склад/расчёты: защита от LWW-гонки (форензика 21.08.2026) =====
// Раньше stock/squads выгружались полным снимком «последний пишущий побеждает» по _sv:
// вкладка с устаревшим складом любой операцией затирала облако на часы назад, а
// flights/transfers (append-only + merge) оставались полными → наличие расходилось с
// движениями ровно на «чужие» операции. Плюс гейт приёма был строгим `remote > local`:
// вкладка, унаследовавшая из localStorage НОВУЮ версию при СТАРОМ содержимом
// (две вкладки одного устройства, стейл-перезапись droneState), замену не получала.
// Механика:
//  • _stockBase — последний снимок, ПРИНЯТЫЙ из облака или УСПЕШНО выгруженный нами
//    (персистится в localStorage `sync_stock_base`). Дельта «локаль − база» = наши
//    несинхронизированные правки.
//  • Перед пушем — дешёвая проверка `read_since&since=∞` → stock_updated_ts (серверное
//    время последней записи склада). Если новее нашей отметки — читаем облачный снимок и
//    НЕ затираем его, а накладываем на него нашу дельту (3-way merge количеств:
//    остатки аддитивны, поэтому корректно и для разных, и для одних и тех же позиций),
//    затем пушим объединённое. Отказ/«повторите действие» не годится: записи
//    transfers/loss уже созданы и доставляются очередью — повтор задвоил бы их.
//  • Гейт приёма: remote.version > local ИЛИ (== и содержимое отличается от БАЗЫ) —
//    закрывает «равная версия, старое содержимое». Сравнение с базой, а не со state:
//    state может нести ещё не выгруженную локальную дельту — её не теряем (merge).
//  • При загрузке страницы — сверка state со своей же базой по max(_sv) строк:
//    если строки state старее базы (другая вкладка перезаписала droneState старым
//    складом), stock/squads берутся из базы.
//  • Пуши сериализуются (_stockPushChain) и схлопываются — параллельные вызовы
//    syncPushStockSquads не гоняются друг с другом.
// pendingQueue (flights/transfers/actlog) не затрагивается — склад в очереди не живёт.
let _stockBase = null;
function syncStockLoadBase(){ try{ _stockBase = JSON.parse(localStorage.getItem('sync_stock_base')||'null'); }catch(e){ _stockBase=null; } }
syncStockLoadBase();
function syncStockSetBase(stock, squads, version){
  _stockBase = { stock: JSON.parse(JSON.stringify(stock||[])), squads: JSON.parse(JSON.stringify(squads||[])), version: version||0 };
  try{ localStorage.setItem('sync_stock_base', JSON.stringify(_stockBase)); }catch(e){}
}
// Забыть базу — для операций полной замены state (импорт JSON, сброс): следующий пуш
// идёт без merge (импорт = полная замена, а не дельта к прежнему снимку).
function syncStockForgetBase(){ _stockBase=null; try{ localStorage.removeItem('sync_stock_base'); }catch(e){} }
const _stN = s => String(s||'').trim().toLowerCase();
const _stKey = r => _stN(r.name)+'|'+(r.status||'bg');
// Канонический отпечаток содержимого (без id/_sv): сортированные количества по ключам.
function syncStockHash(stock, squads){
  const st=new Map(); (stock||[]).forEach(r=>{ const k=_stKey(r); st.set(k,(st.get(k)||0)+(+r.qty||0)); });
  const sq=new Map(); (squads||[]).forEach(q=>{
    const k=_stN(q.pilot); const cur=sq.get(k)||{sp:'',d:new Map()};
    cur.sp = q.start_point||cur.sp;
    (q.drones||[]).forEach(d=>{ const dk=_stN(d.name); cur.d.set(dk,(cur.d.get(dk)||0)+(+d.qty||0)); });
    sq.set(k,cur);
  });
  const a=[...st.entries()].sort((x,y)=>x[0].localeCompare(y[0]));
  const b=[...sq.entries()].sort((x,y)=>x[0].localeCompare(y[0])).map(([k,v])=>[k,v.sp,[...v.d.entries()].sort((x,y)=>x[0].localeCompare(y[0]))]);
  return JSON.stringify([a,b]);
}
function syncStockMaxSv(stock, squads){ return Math.max(0, ...(stock||[]).map(r=>+r._sv||0), ...(squads||[]).map(r=>+r._sv||0)); }

// 3-way merge: результат = remote + (local − base) по количествам. Структурные изменения
// (новая строка/расчёт, удаление, точка старта) — локальные, если локаль отличается от базы,
// иначе облачные. Возвращает {stock,squads}.
function syncStockMerge3(base, local, remote){
  const clone=o=>JSON.parse(JSON.stringify(o));
  // --- stock ---
  const qtyIdx=arr=>{ const m=new Map(); (arr||[]).forEach(r=>{ const k=_stKey(r); m.set(k,(m.get(k)||0)+(+r.qty||0)); }); return m; };
  const rowIdx=arr=>{ const m=new Map(); (arr||[]).forEach(r=>{ const k=_stKey(r); if(!m.has(k)) m.set(k,r); }); return m; };
  const bS=qtyIdx(base.stock), lS=qtyIdx(local.stock), rS=qtyIdx(remote.stock);
  const rRow=rowIdx(remote.stock), lRow=rowIdx(local.stock);
  const stock=[];
  new Set([...bS.keys(),...lS.keys(),...rS.keys()]).forEach(k=>{
    const inL=lS.has(k), inR=rS.has(k), inB=bS.has(k);
    if(!inL&&!inR) return;                                   // было только в базе — удалено везде
    const delta=(lS.get(k)||0)-(bS.get(k)||0);
    if(!inL&&inR&&inB&&delta===-(bS.get(k)||0)&&(rS.get(k)||0)===(bS.get(k)||0)) return; // удалено локально, облако не трогало
    const qty=(rS.get(k)||0)+delta;
    if(!inR&&qty===0) return;                                // локальная строка, сведённая в ноль
    const src=rRow.get(k)||lRow.get(k);
    stock.push(Object.assign(clone(src),{qty}));
  });
  // --- squads ---
  const sqIdx=arr=>{ const m=new Map(); (arr||[]).forEach(q=>{ const k=_stN(q.pilot); if(!m.has(k)) m.set(k,q); }); return m; };
  const bQ=sqIdx(base.squads), lQ=sqIdx(local.squads), rQ=sqIdx(remote.squads);
  const sqHash=q=>q?syncStockHash([], [q]):'';
  const squads=[];
  new Set([...bQ.keys(),...lQ.keys(),...rQ.keys()]).forEach(k=>{
    const b=bQ.get(k), l=lQ.get(k), r=rQ.get(k);
    if(!l&&!r) return;
    if(l&&!r){ if(b&&sqHash(l)===sqHash(b)) return; squads.push(clone(l)); return; } // облако удалило, локаль не меняла → удаляем; иначе — локальная
    if(r&&!l){ if(b&&sqHash(r)===sqHash(b)) return; squads.push(clone(r)); return; } // локаль удалила, облако не меняло → удаляем; иначе — облачная
    const out=clone(r);
    if((l.start_point||'')!==((b&&b.start_point)||'')) out.start_point=l.start_point||'';
    const dq=arr=>{ const m=new Map(); (arr||[]).forEach(d=>{ const dk=_stN(d.name); m.set(dk,(m.get(dk)||0)+(+d.qty||0)); }); return m; };
    const drow=arr=>{ const m=new Map(); (arr||[]).forEach(d=>{ const dk=_stN(d.name); if(!m.has(dk)) m.set(dk,d); }); return m; };
    const bD=dq(b&&b.drones), lD=dq(l.drones), rD=dq(r.drones), rDr=drow(r.drones), lDr=drow(l.drones);
    const drones=[];
    new Set([...bD.keys(),...lD.keys(),...rD.keys()]).forEach(dk=>{
      const inL=lD.has(dk), inR=rD.has(dk), inB=bD.has(dk);
      if(!inL&&!inR) return;
      const delta=(lD.get(dk)||0)-(bD.get(dk)||0);
      if(!inL&&inR&&inB&&delta===-(bD.get(dk)||0)&&(rD.get(dk)||0)===(bD.get(dk)||0)) return;
      const qty=(rD.get(dk)||0)+delta;
      if(!inR&&qty===0) return;
      const src=rDr.get(dk)||lDr.get(dk);
      drones.push(Object.assign(clone(src),{qty}));
    });
    out.drones=drones;
    squads.push(out);
  });
  return {stock, squads};
}

// Облачный снимок новее нашего? (строго по версии ИЛИ равная версия с иным содержимым, чем БАЗА)
function syncStockRemoteIsNewer(remote){
  if(remote.version > _stockVersion) return true;
  if(remote.version === _stockVersion && _stockBase && syncStockHash(remote.stock,remote.squads)!==syncStockHash(_stockBase.stock,_stockBase.squads)) return true;
  return false;
}
// Единая точка приёма облачного снимка склада. Локальная дельта относительно базы
// накладывается поверх (merge), иначе — чистая замена. Возвращает true, если локальная
// дельта была (вызывающий планирует пуш объединённого снимка).
function syncAcceptRemoteStock(remote){
  const hadDelta = !!(_stockBase && syncStockHash(state.stock,state.squads)!==syncStockHash(_stockBase.stock,_stockBase.squads));
  if(hadDelta){
    const m=syncStockMerge3(_stockBase, {stock:state.stock,squads:state.squads}, remote);
    state.stock=m.stock; state.squads=m.squads;
    console.warn('[SYNC] склад: облачный снимок новее — локальная дельта объединена (3-way merge)');
  } else {
    state.stock=remote.stock; state.squads=remote.squads;
  }
  _stockVersion=remote.version; syncPersistStockVersion();
  syncStockSetBase(remote.stock, remote.squads, remote.version);
  return hadDelta;
}
// Сверка при загрузке страницы: state (из droneState) против своей же базы.
// Строки state старее базы при равной/большей версии в localStorage → state перезаписан
// другой вкладкой устаревшим складом → берём базу. Вызывается из app.js после loadLocal().
function syncStockReconcileOnLoad(){
  if(!_stockBase||!state) return;
  const stateSv=syncStockMaxSv(state.stock,state.squads);
  if(stateSv < (_stockBase.version||0) && syncStockHash(state.stock,state.squads)!==syncStockHash(_stockBase.stock,_stockBase.squads)){
    console.warn('[SYNC] склад в droneState старее принятой базы ('+stateSv+' < '+_stockBase.version+') — восстановлен из базы');
    state.stock=JSON.parse(JSON.stringify(_stockBase.stock));
    state.squads=JSON.parse(JSON.stringify(_stockBase.squads));
    if(_stockVersion < _stockBase.version){ _stockVersion=_stockBase.version; syncPersistStockVersion(); }
    try{ localStorage.setItem('droneState',JSON.stringify(state)); }catch(e){}
  }
}
// Дешёвая проверка серверного времени последней записи склада (пустые дельты + stock_updated_ts).
async function syncFetchStockTs(){
  const {url,token}=syncGetCfg(); if(!url||!token) return null;
  try{
    const r=await fetch(url+'?action=read_since&since=9000000000000000&token='+encodeURIComponent(token)+'&_='+Date.now(),{redirect:'follow'});
    const d=await r.json(); if(d.error) return null;
    return +d.stock_updated_ts||0;
  }catch(e){ return null; }
}
// Полный облачный снимок склада → {stock,squads,version} | null
async function syncFetchStockSnapshot(){
  const {url,key,token}=syncGetCfg(); if(!url||!token) return null;
  try{
    const r=await fetch(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(),{redirect:'follow'});
    const d=await r.json(); if(d.error) return null;
    const stock=await syncDecryptRows(d.stock||[],key,'stock');
    const squads=(await syncDecryptRows(d.squads||[],key,'squads')).map(sq=>({...sq,drones:Array.isArray(sq.drones)?sq.drones:[]}));
    return {stock,squads,version:syncStockMaxSv(stock,squads)};
  }catch(e){ return null; }
}

// --- Время последнего поллинга ---
let _lastPollTs = Date.now();
let _lastStockTs = Date.now(); // Инициализируем текущим временем — не грузим старые изменения склада

// ============================================================
// ЗАПИСЬ ИЗМЕНЕНИЙ — единая точка входа для всех операций
// ============================================================

// Добавить вылет — кэшируем в очередь, сразу пробуем отправить (если есть сеть)
async function syncAddFlight(flight){
  if(syncReadOnly()) return; // viewer не добавляет вылеты
  if(!flight.id) flight.id = genId('f');
  state.flights.unshift(flight);
  saveLocal();
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;                          // локальный режим — облака нет, очередь не нужна
  pendingQueue.add({type:'flight', data:flight});   // кэш до подтверждения доставки
  if(!navigator.onLine) return;                     // нет сети — лежит в очереди до восстановления
  await trySendQueueItem({type:'flight', data:flight}, url, key, token);
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
  let removedTransfers=[];
  // Удаляем по предикату, возвращая удалённые записи (чтобы занести их id в tombstones)
  const removeLoss = (pred)=>{
    const keep=[], removed=[];
    (state.transfers||[]).forEach(t=>(pred(t)?removed:keep).push(t));
    state.transfers=keep; return removed;
  };

  // Проход 1: по flightId (для записей, созданных после обновления)
  if(f.id){
    removedTransfers = removeLoss(t=>t.type==='loss'&&t.flightId===f.id);
  }

  // Проход 2: пилот + борт + дата + время (регистронезависимо)
  if((state.transfers||[]).length===before){
    removedTransfers = removeLoss(t=>
      t.type==='loss' &&
      (t.pilot||'').toLowerCase()===pLow &&
      (t.drone||'').toLowerCase()===dLow &&
      t.date===f.date &&
      t.time===f.time
    );
  }

  // Проход 3: пилот + борт + дата (без времени — для вылетов,
  // чьё время менялось после первичной записи потери)
  if((state.transfers||[]).length===before){
    removedTransfers = removeLoss(t=>
      t.type==='loss' &&
      (t.pilot||'').toLowerCase()===pLow &&
      (t.drone||'').toLowerCase()===dLow &&
      t.date===f.date
    );
  }

  // tombstone и для вылета, и для удалённых loss-передач — чтобы неразрушающий
  // merge в syncPushAll/pollCloud/syncPullAll не вернул их из облака обратно.
  // Путь Б: пометить локально + опубликовать удаление в облачный лист tombstones
  // (доставка с ретраем) — чтобы удаление дошло до других устройств.
  syncPublishTombstones([f.id, ...removedTransfers.map(t=>t.id)]);
  state.flights.splice(idx,1);
  // Risk 3: НЕ делаем syncPushAll (полный write затирает чужие, ещё не сполленные
  // вылеты/передачи). Удаление держится локально на tombstone; склад/расчёты
  // (если была компенсация потери) уже выгружены через syncPushStockSquads выше.
  // У бэкенда нет delete_one — фактическое удаление из облака произойдёт при
  // ближайшем ambient-полном write от другой операции.
  saveLocalQuiet();
  logAction('flight','delete','Удалён вылет '+(f.pilot||'')+' '+(f.date||'')+' '+(f.time||''));
  renderAdminFlights(); renderDashboard(); renderInventory();
}

// Обновить поле вылета
function syncEditFlight(idx, field, val){
  if(state.flights[idx]) state.flights[idx][field] = val;
  // Дефект C (10.06.2026): раньше saveLocalQuiet оставлял правку только локально —
  // если до следующего ambient-write успевал плановый syncPullOnLogin (5 мин),
  // полная замена flights откатывала правку облачной версией. syncPushAll теперь
  // неразрушающий (merge), поэтому правка безопасно уходит обычным debounce-write.
  saveLocal();
}

// Добавить transfer/arrival/loss — кэшируем в очередь, сразу пробуем отправить
async function syncAddTransfer(op){
  if(syncReadOnly()) return; // viewer не пишет передачи
  if(!op.id) op.id = genId('t');
  if(op && (op.geo_points_db||op.geo||op.color_key)) return; // ГЕО не синхронизируется
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;                       // локальный режим — облака нет, очередь не нужна
  pendingQueue.add({type:'transfer', data:op});  // кэш до подтверждения доставки
  if(!navigator.onLine) return;
  await trySendQueueItem({type:'transfer', data:op}, url, key, token);
}

// Отправить склад и расчёты (last-write-wins)
// Сериализация + схлопывание пушей склада: параллельные вызовы (setTimeout 300/500 мс из
// разных функций) раньше могли перегонять друг друга; теперь — по одному, повторный вызов
// во время пуша планирует ровно один дополнительный прогон.
let _stockPushChain = Promise.resolve(), _stockPushQueued = false;
function syncPushStockSquads(){
  if(_stockPushQueued) return _stockPushChain;
  _stockPushQueued = true;
  _stockPushChain = _stockPushChain
    .then(()=>{ _stockPushQueued=false; return _syncPushStockSquadsNow(); })
    .catch(e=>console.warn('[SYNC] stock push error:', e&&e.message));
  return _stockPushChain;
}
async function _syncPushStockSquadsNow(){
  if(syncReadOnly()) return; // viewer не выгружает склад
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;
  // Защита от LWW-гонки: чужая запись склада, которой мы ещё не видели? Тогда сначала
  // принять её (с наложением нашей дельты), и только потом писать объединённый снимок.
  // Без базы (первый пуш после обновления) дельту не вычислить — приём облака здесь
  // затёр бы только что сделанную правку; в этом окне — прежнее поведение, база
  // фиксируется ниже после пуша.
  const remoteTs = _stockBase ? await syncFetchStockTs() : null;
  if(remoteTs!==null && remoteTs > _lastStockTs){
    const remote = await syncFetchStockSnapshot();
    if(remote && syncStockRemoteIsNewer(remote)){
      const hadDelta = syncAcceptRemoteStock(remote);
      showSyncToast(hadDelta ? '⚠ Склад изменён на другом устройстве — изменения объединены' : '↓ Склад обновлён с другого устройства', 5000);
      if(typeof renderInventory==='function') try{ renderInventory(); renderDashboard(); }catch(e){}
      if(!hadDelta){ _lastStockTs = remoteTs; return; } // нашей дельты нет — пушить нечего
    }
    _lastStockTs = remoteTs;
  }
  syncBumpStockVersion();
  const ts = Date.now();
  // Пишем актуальные id/_sv ОБРАТНО в объекты state — чтобы любые последующие
  // операции и чтения несли корректный штамп версии (раньше _sv ставился только
  // в шифруемую копию, объекты state хранили устаревший _sv из последней загрузки).
  const encRow = async (obj,i) => {
    if(!obj.id) obj.id = ts+i;
    obj._sv = _stockVersion;
    return syncEncrypt(obj, key);
  };
  const stock  = await Promise.all(state.stock.map((d,i)=>encRow(d,i)));
  const squads = await Promise.all(state.squads.map((sq,i)=>encRow(sq,i)));
  const data = geoStripFromSync({stock, squads}); // ГЕО (geo_points_db) НИКОГДА не уходит в облако
  const body = JSON.stringify({action:'write', token, data});
  const prevTs = _lastStockTs;
  const res = await syncPost(url, body);
  if(res.ok){
    // POST no-cors непроверяем → подтверждаем запись сдвигом СЕРВЕРНОГО stock_updated_ts
    // (заодно отметка «свою запись видели» в серверном времени, без смешения часов).
    const srvTs = await syncFetchStockTs();
    const landed = srvTs!==null ? srvTs>prevTs : null; // null — проверить не удалось (сеть)
    if(landed!==false){
      _lastStockTs = srvTs!==null ? srvTs : _stockVersion;
      // Выгруженное = новая база. При недоступной проверке базу ставим только если её
      // ещё нет (bootstrap); иначе оставляем прежнюю — дельта сохранится до следующего пуша.
      if(landed===true || !_stockBase) syncStockSetBase(state.stock, state.squads, _stockVersion);
      try{ localStorage.setItem('droneState',JSON.stringify(state)); }catch(e){} // _sv строк в droneState (сверка при загрузке)
      console.log('[SYNC] stock+squads OK, sv:', _stockVersion, landed===true?'(подтверждено)':'(без подтверждения)');
    } else {
      console.warn('[SYNC] stock push: запись в облако НЕ подтверждена (stock_updated_ts не сдвинулся) — дельта сохранена, повтор при следующем пуше');
      showSyncToast('⚠ Склад не записан в облако — повтор при следующей синхронизации', 5000);
    }
  }
  else console.warn('[SYNC] stock push failed:', res.error);
}

// Отправить полный снимок (flights + transfers).
// НЕРАЗРУШАЮЩИЙ: перед записью доливаем из облака flights/transfers, которых нет
// локально (merge по id, исключая tombstones) — чтобы полный write не стёр чужие
// записи, ещё не полученные поллингом. Локальные данные при этом не теряются:
// итоговый снимок = (локальное) ∪ (облачное) − (удалённое локально).
async function syncPushAll(silent=false){
  if(syncReadOnly()) return; // viewer не пишет в облако (ambient-write в т.ч.)
  const {url,key,token} = syncGetCfg();
  if(!url) return;
  if(!silent) syncIndicator('syncing');

  // Merge с облаком. Если чтение не удалось — пишем как есть (деградация к прежнему
  // поведению), append-записи всё равно дублируются через pendingQueue.
  if(token){
    try{
      const r = await fetch(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(), {redirect:'follow'});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      syncMergeCloudTombstones(d.tombstones); // Путь Б: подтянуть чужие удаления ДО merge
      const tb = tombstones.load();
      const [cloudFRaw, cloudTRaw] = await Promise.all([
        syncDecryptRows(d.flights||[], key, 'flights'),
        syncDecryptRows(d.transfers||[], key, 'transfers')
      ]);
      // Дедуп дубль-строк облака — иначе обе копии одного id пройдут фильтр !localFIds
      const cloudF=syncDedupeById(cloudFRaw), cloudT=syncDedupeById(cloudTRaw);
      const localFIds = new Set(state.flights.map(f=>f.id).filter(Boolean));
      const addF = cloudF.filter(f=>f.id && !localFIds.has(f.id) && !tb.has(f.id));
      const localTIds = new Set((state.transfers||[]).map(t=>t.id).filter(Boolean));
      const addT = cloudT.filter(t=>t.id && !localTIds.has(t.id) && !tb.has(t.id));
      if(addF.length){
        state.flights = [...state.flights, ...addF]
          .sort((a,b)=>((b.date||'')+(b.time||'')).localeCompare((a.date||'')+(a.time||'')));
      }
      if(addT.length){
        if(!state.transfers) state.transfers=[];
        state.transfers = [...state.transfers, ...addT]
          .sort((a,b)=>((b.date||'')+(b.time||'')).localeCompare((a.date||'')+(a.time||'')));
      }
      if(addF.length || addT.length){
        console.log('[SYNC] pushAll merge: +'+addF.length+' flights, +'+addT.length+' transfers из облака');
        try{ saveLocalQuiet(); }catch(e){}
      }
      // Путь Б: не выгружать обратно записи, помеченные удалёнными (свои/чужие).
      // Бонус: полный write листа flights ниже физически уберёт их из облака (GC).
      if(syncPruneStateByTombstones()){ try{ saveLocalQuiet(); }catch(e){} }
    }catch(e){
      console.warn('[SYNC] pushAll merge пропущен (чтение не удалось):', e.message);
    }
  }

  // Склад/расчёты (stock/squads) НЕ пишем здесь — только flights/transfers.
  // Версионируемые листы выгружает исключительно syncPushStockSquads (с актуальным
  // _sv). Раньше ambient-syncPushAll писал stock/squads с устаревшим _sv из объектов
  // state и откатывал версию → гейт remoteVersion>_stockVersion отвергал изменение
  // на других устройствах. writeAll пропускает undefined-листы → склад не трогаем.
  // id безыдных записей пишем ОБРАТНО в объект state (как в syncPushStockSquads):
  // раньше id генерировался только в шифруемой копии, при каждой выгрузке был новым,
  // и другие устройства накапливали копии одной записи через поллинг.
  const encRow = async (obj) => { if(!obj.id) obj.id = genId('x'); return syncEncrypt(obj, key); };
  const [flights,transfers] = await Promise.all([
    Promise.all(state.flights.map(f=>encRow(f))),
    Promise.all((state.transfers||[]).map(t=>encRow(t)))
  ]);
  const data = geoStripFromSync({flights,transfers}); // ГЕО НИКОГДА не уходит в облако; stock/squads не трогаем
  const body = JSON.stringify({action:'write', token, data});
  console.log('[SYNC] pushAll flights:', state.flights.length, 'size:', body.length);
  const res = await syncPost(url, body);
  if(res.ok){
    // (_lastStockTs здесь НЕ трогаем — pushAll склад не пишет; прежняя строка
    //  `_lastStockTs=_stockVersion` прятала чужие записи склада, сделанные до нашего bump)
    syncStampLastSync();          // полная выгрузка удалась — отметка для индикатора
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

// Точечная выгрузка ТОЛЬКО листа flights (action:'write' с data={flights}).
// writeAll пропускает остальные листы (stock/squads/transfers — undefined),
// поэтому _sv склада, записанный syncPushStockSquads, НЕ затирается.
// Используется для возврата флага _lossWritten в облако (Risk 4) — у бэкенда нет
// update_one, обновить строку вылета можно только перезаписью листа flights.
async function syncPushFlightsOnly(){
  if(syncReadOnly()) return; // viewer не пишет в облако
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;
  // id безыдных вылетов пишем обратно в state (см. комментарий в syncPushAll)
  const flights = await Promise.all(state.flights.map(f=>{ if(!f.id) f.id=genId('x'); return syncEncrypt(f, key); }));
  const data = geoStripFromSync({flights});
  const body = JSON.stringify({action:'write', token, data});
  const res = await syncPost(url, body);
  if(!res.ok) console.warn('[SYNC] flights-only push failed:', res.error);
}

// --- Очередь pending: повторная отправка накопленного ---
// Не удаляет элементы — удаление только после подтверждения поллингом.
// Повторно шлёт лишь те, что давно не пробовали (или ещё ни разу), чтобы
// не плодить дубли между отправкой и подтверждением.
const QUEUE_RETRY_MS = 25000;
async function syncFlushQueue(){
  const q = pendingQueue.all();
  if(!q.length) return;
  const {url,key,token} = syncGetCfg();
  if(!url||!token||!navigator.onLine) return;
  const now = Date.now();
  for(const item of q){
    if(item.lastTryTs && now-item.lastTryTs < QUEUE_RETRY_MS) continue; // ждём подтверждения
    await trySendQueueItem(item, url, key, token);
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
      // flights/transfers — дедуп по id: дубль-строки облака иначе попадут в журнал
      // парой при полной замене (pollCloud дедупит сам, полная загрузка — нет)
      flights:   syncDedupeById(await syncDecryptRows(d.flights||[], key, 'flights')),
      stock:     await syncDecryptRows(d.stock||[], key, 'stock'),
      squads:    (await syncDecryptRows(d.squads||[], key, 'squads')).map(sq=>({...sq,drones:Array.isArray(sq.drones)?sq.drones:[]})),
      transfers: syncDedupeById(await syncDecryptRows(d.transfers||[], key, 'transfers')),
      users: d.users||[]
    };
    // Путь Б: подтянуть облачные tombstones (чужие удаления) в локальный набор ДО
    // фильтрации — иначе удалённое на другом устройстве здесь бы не скрылось.
    loaded.tombstoneIds = syncMergeCloudTombstones(d.tombstones);
    // actingRole (замещение, v0.26): освежить из блока users — назначение/снятие
    // доезжает планово (5 мин) без перелогина. Рантайм-вызов функции app.js.
    if(typeof syncApplyActingRole==='function') syncApplyActingRole(loaded.users);
    // Фильтруем tombstones (и удалённые вылеты, и удалённые loss-передачи)
    const tb = tombstones.load();
    loaded.flights   = loaded.flights.filter(f=>!tb.has(f.id));
    loaded.transfers = loaded.transfers.filter(t=>!tb.has(t.id));
    // Актлог
    if(d.actlog&&d.actlog.length){
      const entries = await syncDecryptRows(d.actlog, key, 'actlog');
      entries.forEach(e=>{ if(!actLog.some(x=>x.id===e.id)) actLog.unshift(e); });
      actLog.sort((a,b)=>b.ts-a.ts);
      if(actLog.length>500) actLog=actLog.slice(0,500);
      try{ localStorage.setItem('act_log',JSON.stringify(actLog)); }catch(e){}
      // Подтверждение доставки actlog-записей очереди по полному снимку — критично
      // для viewer: у него нет 30-секундного поллинга, только эта полная загрузка.
      // По открытому id строки (а не только расшифрованных entries): испорченная
      // (#ERROR!) actlog-запись иначе никогда не подтвердится и зависнет в очереди
      // viewer'а (у него нет 30-сек поллинга — только этот полный путь).
      pendingQueue.confirmDelivered(new Set([...entries.map(e=>e.id), ...d.actlog.map(r=>r.id)].filter(Boolean)));
    }
    if(d.stock&&d.stock.length){
      // без имени листа (тихо): те же строки d.stock уже просигналили при сборке loaded выше
      const remoteStockVersion = Math.max(...(await syncDecryptRows(d.stock,key)).map(s=>s._sv||0));
      _lastStockTs = remoteStockVersion;
    }
    syncStampLastSync(); // облако прочитано целиком — отметка для индикатора в Настройках
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
  // Путь Б: убрать из state записи, удалённые на других устройствах (облачные tombstones
  // уже слиты в набор внутри syncPullAll) — иначе ветка «localOnly» ниже сохранила бы их
  // как «локальные, которых нет в облаке».
  syncPruneStateByTombstones();
  // Подтверждаем доставку по полному снимку облака (вкл. tombstones)
  pendingQueue.confirmDelivered(new Set([
    ...loaded.flights.map(f=>f.id),
    ...loaded.transfers.map(t=>t.id),
    ...(loaded.tombstoneIds||[]).map(id=>'tomb:'+id)
  ].filter(Boolean)));
  const hasPending = pendingQueue.all().length > 0;
  // Склад/расчёты — last-write-wins по _sv. Берём из облака ТОЛЬКО если версия
  // облака новее локальной — иначе затрём несохранённые локальные правки
  // (stock/squads НЕ кэшируются в pendingQueue, поэтому "нет pending" ещё не значит
  //  "локальные данные склада уже выгружены").
  const remoteStock = {stock:loaded.stock, squads:loaded.squads, version:syncStockMaxSv(loaded.stock,loaded.squads)};
  // Гейт приёма: версия новее ИЛИ равная с иным содержимым, чем база (см. блок LWW выше).
  const stockNewer = syncStockRemoteIsNewer(remoteStock);
  let stockDelta = false;
  if(!hasPending){
    // Защита от потери только что добавленных вылетов/передач: полная замена
    // допустима ТОЛЬКО если локальный массив является подмножеством облачного
    // (все локальные id есть в облаке). Иначе локально есть запись, ещё не
    // доехавшая до облака (напр. отправка не подтверждена при пустой очереди) —
    // сливаем: облачные ∪ локальные, которых нет в облаке.
    const cloudFIds = new Set(loaded.flights.map(f=>f.id).filter(Boolean));
    if(state.flights.every(f=>!f.id || cloudFIds.has(f.id))){
      state.flights = loaded.flights;
    } else {
      const localOnlyF = state.flights.filter(f=>f.id && !cloudFIds.has(f.id));
      state.flights = [...loaded.flights, ...localOnlyF]
        .sort((a,b)=>((b.date||'')+(b.time||'')).localeCompare((a.date||'')+(a.time||'')));
      console.warn('[SYNC] syncPullOnLogin: сохранено '+localOnlyF.length+' локальных вылетов вне облака');
    }
    const cloudTIds = new Set(loaded.transfers.map(t=>t.id).filter(Boolean));
    if((state.transfers||[]).every(t=>!t.id || cloudTIds.has(t.id))){
      state.transfers = loaded.transfers;
    } else {
      const localOnlyT = (state.transfers||[]).filter(t=>t.id && !cloudTIds.has(t.id));
      state.transfers = [...loaded.transfers, ...localOnlyT]
        .sort((a,b)=>((b.date||'')+(b.time||'')).localeCompare((a.date||'')+(a.time||'')));
    }
    if(stockNewer) stockDelta = syncAcceptRemoteStock(remoteStock); // замена либо merge локальной дельты
  } else {
    // Есть несинхронизированное — сливаем только новое из облака
    console.log('[SYNC] pending queue not empty, merging only new records');
    const localFIds = new Set(state.flights.map(f=>f.id).filter(Boolean));
    const newF = loaded.flights.filter(f=>f.id&&!localFIds.has(f.id));
    state.flights = [...state.flights,...newF].sort((a,b)=>((b.date||'')+(b.time||'')).localeCompare((a.date||'')+(a.time||'')));
    const localTIds = new Set((state.transfers||[]).map(t=>t.id).filter(Boolean));
    const newT = loaded.transfers.filter(t=>t.id&&!localTIds.has(t.id));
    state.transfers = [...(state.transfers||[]),...newT].sort((a,b)=>((b.date||'')+(b.time||'')).localeCompare((a.date||'')+(a.time||'')));
    // Склад берём из облака только если его снимок новее (merge локальной дельты)
    if(stockNewer) stockDelta = syncAcceptRemoteStock(remoteStock);
    // Отправляем накопленное
    setTimeout(()=>syncFlushQueue(), 1000);
  }
  if(stockDelta) setTimeout(()=>syncPushStockSquads(), 800); // объединённый снимок — в облако
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
  // Принудительная загрузка = облако авторитетно: версия и база — облачные
  _stockVersion = syncStockMaxSv(loaded.stock,loaded.squads); syncPersistStockVersion();
  syncStockSetBase(loaded.stock, loaded.squads, _stockVersion);
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
  if(syncReadOnly()){ if(!silent) alert('Роль «Наблюдатель» — только просмотр, выгрузка недоступна'); return; }
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
    let newFlights = 0;      // фактически добавленные чужие вылеты (для тоста — не вся дельта)
    let lossFlagSet = false; // выставили _lossWritten при приёме чужой потери — надо вернуть в облако
    // Путь Б: слить облачные tombstones (чужие удаления) ДО обработки вылетов/передач —
    // иначе только что удалённое на другом устройстве снова добавилось бы из дельты.
    const tombIds = syncMergeCloudTombstones(d.tombstones);
    const tb = tombstones.load(); // уже включает облачные tombstones
    const deliveredIds = new Set(); // id, вернувшиеся из облака — подтверждение доставки
    tombIds.forEach(id=>deliveredIds.add('tomb:'+id)); // подтверждаем доставку наших tombstone'ов
    if(syncPruneStateByTombstones()) changed = true;   // убрать уже отрисованные удалённые записи

    // Новые вылеты от других пользователей
    for(const row of (d.flights||[])){
      if(row.id) deliveredIds.add(row.id); // подтверждаем доставку по открытому id даже у испорченной (#ERROR!) строки — ретрай не поможет, appendOne идемпотентен
      const obj = await syncDecrypt(row, key);
      if(!obj) continue;
      deliveredIds.add(obj.id);
      if(tb.has(obj.id)) continue; // Удалён локально
      if(!state.flights.some(f=>f.id===obj.id)){
        state.flights.unshift(obj);
        changed = true;
        newFlights++;
        // Списываем дрон если потеря — но только если списание ещё не зафиксировано
        // на устройстве-источнике (флаг приходит вместе с вылетом). Viewer не участвует:
        // не списывает и не пушит — ждёт авторитетный склад от пишущего устройства.
        if(obj.returned==='no' && obj.drone && !obj._lossWritten && !syncReadOnly()){
          // минус у пилота (борт без передачи) — сигнал тостом/консолью, не блок (ADR-001 §4)
          lossDeficitWarn(writeDroneLoss(obj.pilot, obj.drone, obj.date, obj.time, obj.id));
          obj._lossWritten=true;
          lossFlagSet = true;                       // Risk 4: вернём флаг в облако ниже
          setTimeout(()=>syncPushStockSquads(), 500); // списание + версия склада
        }
      }
    }

    // Новые передачи
    for(const row of (d.transfers||[])){
      if(row.id) deliveredIds.add(row.id); // подтверждение по открытому id (см. flights выше) — испорченную строку из очереди не держим
      const obj = await syncDecrypt(row, key);
      if(!obj) continue;
      deliveredIds.add(obj.id);
      if(tb.has(obj.id)) continue; // удалена локально (напр. loss-передача удалённого вылета)
      if(!(state.transfers||[]).some(t=>t.id===obj.id)){
        if(!state.transfers) state.transfers=[];
        state.transfers.unshift(obj);
        changed = true;
      }
    }

    // Актлог
    for(const row of (d.actlog||[])){
      if(row.id) deliveredIds.add(row.id); // подтверждение по открытому id (см. flights выше) — иначе испорченная (#ERROR!) login-запись висела бы в очереди вечно
      const obj = await syncDecrypt(row, key);
      if(!obj) continue;
      deliveredIds.add(obj.id); // подтверждение доставки записей очереди (actlog тоже в pendingQueue)
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
          const remoteStock  = await syncDecryptRows(d2.stock||[], key, 'stock');
          const remoteSquads = (await syncDecryptRows(d2.squads||[], key, 'squads')).map(sq=>({...sq,drones:Array.isArray(sq.drones)?sq.drones:[]}));
          const remote = {stock:remoteStock, squads:remoteSquads, version:syncStockMaxSv(remoteStock,remoteSquads)};
          // Гейт: версия новее ИЛИ равная с иным содержимым, чем база. Локальная
          // несинхронизированная дельта накладывается (merge) и допушивается.
          if(syncStockRemoteIsNewer(remote)){
            const hadDelta = syncAcceptRemoteStock(remote);
            changed = true;
            console.log('[POLL] Склад обновлён, версия:', _stockVersion, hadDelta?'(+локальная дельта → пуш)':'');
            if(hadDelta) setTimeout(()=>syncPushStockSquads(), 500);
          }
        }
      }catch(e){ console.warn('[POLL] stock sync error:', e.message); }
    }

    // Подтверждаем доставку отправленного: весь полный список id из ответа read_since
    // убираем из очереди СРАЗУ и обновляем индикатор (не ждём re-send/QUEUE_RETRY).
    pendingQueue.confirmDelivered(deliveredIds);
    updateQueueIndicator();
    // Досылаем то, что ещё не подтверждено (с защитой от частых повторов)
    syncFlushQueue();

    if(changed){
      saveLocal();
      renderDashboard(); renderFlights(); renderInventory(); rebuildRoleSelector();
      if(newFlights>0) showSyncToast('↓ '+newFlights+' '+ruPlural(newFlights,'новый вылет','новых вылета','новых вылетов'));
    }
    // Risk 4: вернуть выставленный _lossWritten в облако, чтобы другие устройства
    // не списали тот же борт повторно. Точечный write листа flights сразу после
    // поллинга (состояние максимально свежее → риск затирания минимален).
    if(lossFlagSet) syncPushFlightsOnly();
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
  if(window._fullSyncInterval) clearInterval(window._fullSyncInterval);
  // Viewer: быстрый поллинг (30с) не запускаем — наблюдателю хватает полной тихой
  // синхронизации раз в 5 минут (первое полное обновление уже сделал syncPullOnLogin
  // при входе). Снижает нагрузку на Apps Script: ~10 запросов за 5 мин → 1.
  // Остальные роли — без изменений: дельта 30с + полная 5 мин.
  const viewer = syncReadOnly();
  if(!viewer){
    window._pollInterval = setInterval(()=>{
      const {url,token} = syncGetCfg();
      if(url&&token&&navigator.onLine&&!syncReadOnly()) pollCloud();
    }, 30000);
  }
  window._fullSyncInterval = setInterval(()=>{
    const {url,token} = syncGetCfg();
    if(url&&token&&navigator.onLine){
      console.log('[SYNC] Плановая полная синхронизация');
      syncPullOnLogin();
    }
  }, 5*60*1000);
  console.log('[SYNC] Поллинг запущен: '+(viewer?'viewer — только полная синхронизация раз в 5 мин':'дельта 30с + полная 5 мин'));
}

// Отправка в облако по имени листа. actlog — через pendingQueue (раньше слался
// напрямую без очереди: офлайн-действия терялись безвозвратно — самые интересные
// для аудита записи). Подтверждение доставки — поллингом/полной загрузкой по id,
// как у flights/transfers. Остальное — как transfer.
function appendToCloud(sheet, obj){
  if(sheet==='actlog'){
    if(!obj.id) obj.id=genId('a');
    const {url,key,token}=syncGetCfg();
    if(!url||!token){
      // cfg ещё не загружен (ранний вызов до/во время initAuth)? Раньше запись молча
      // ТЕРЯЛАСЬ (локально была, в облако не попадала — например login-записи).
      // Откладываем в очередь — досыл когда cfg появится (syncFlushQueue).
      // В реально локальном режиме (file:// / ?local=1) облака нет вообще — не кэшируем,
      // иначе очередь копится вечно; страховка — syncQueueStartupCheck чистит при старте.
      const isLocal=location.protocol==='file:'||new URLSearchParams(location.search).get('local')==='1';
      if(!isLocal) pendingQueue.add({type:'actlog', data:obj});
      return;
    }
    pendingQueue.add({type:'actlog', data:obj});  // кэш до подтверждения доставки
    if(!navigator.onLine)return;                  // нет сети — досыл при восстановлении
    trySendQueueItem({type:'actlog', data:obj}, url, key, token);
    return;
  }
  // transfers, flights и т.д.
  return syncAddTransfer(obj);
}

// ============================================================
// ДИАГНОСТИКА (вызов из консоли)
// ============================================================

// Инвентаризация битых (нерасшифровываемых) записей в облаке.
// Появилась после бага aesEncrypt 12.06.2026 (spread в String.fromCharCode →
// битый base64 у длинных записей, см. CLAUDE.md §6): показывает, сколько таких
// записей осталось в каждом листе. Вызов из консоли: await syncAuditEncryption()
//
// ОГРАНИЧЕНИЯ (не нарушать при доработке):
//  • ТОЛЬКО ЧТЕНИЕ — никаких write/syncPushAll/localStorage.setItem; state,
//    actLog, pendingQueue не мутируются. После вызова перезагрузка не нужна.
//  • Никакого spread на больших массивах (String.fromCharCode(...buf) и т.п.) —
//    общий принцип проекта после бага с base64.
async function syncAuditEncryption(){
  const {url,key,token}=syncGetCfg();
  if(!url||!token){ console.warn('[AUDIT] Облако не настроено (нет url/token)'); return null; }
  const r=await fetch(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(),{redirect:'follow'});
  const d=await r.json();
  if(d.error){ console.warn('[AUDIT]', d.error); return null; }
  const sheets=['flights','stock','squads','transfers','actlog'];
  const summary=[], bad=[];
  for(const sheet of sheets){
    const rows=d[sheet]||[];
    let ok=0;
    for(const row of rows){
      // null → битая запись (сам decrypt error syncDecrypt уже вывел в консоль).
      // id облачной строки открытый (не шифруется) — по формату <ts>_<суффикс>
      // видно тип и время создания записи.
      const obj=await syncDecrypt(row,key);
      if(obj) ok++;
      else bad.push({sheet, id:row.id||'(без id)'});
    }
    summary.push({sheet, total:rows.length, ok, bad:rows.length-ok});
  }
  console.table(summary);
  if(bad.length){
    console.log('[AUDIT] Битых записей: '+bad.length);
    console.table(bad);
  } else {
    console.log('[AUDIT] Битых записей нет — все строки расшифровались');
  }
  return {summary, bad};
}

// РАЗОВАЯ ЧИСТКА: инвентаризация ячеек, затёртых Google Sheets на «#ERROR!»
// (шифртекст принят за формулу — корень повторяющихся decrypt-ошибок). Данные
// таких строк невосстановимы (Sheets их затёрла) — функция только НАХОДИТ их и
// чистит соответствующие зависшие записи очереди. Физически удалить строки из
// облака точечного action нет (см. CLAUDE.md §4): для actlog проще оставить
// (журнал аудита, битые строки тихо отбрасываются при чтении), для flights/
// transfers строка самозалечится при ближайшем полном write листа (syncPushAll
// пишет корректное значение поверх). Вызов из консоли: await syncPurgeErrorRows()
// ОГРАНИЧЕНИЯ: только чтение облака; локально трогает ТОЛЬКО pendingQueue
// (снимает заведомо непроходимые записи), state/actLog не мутирует.
async function syncPurgeErrorRows(){
  const {url,token}=syncGetCfg();
  if(!url||!token){ console.warn('[PURGE] Облако не настроено (нет url/token)'); return null; }
  const r=await fetch(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(),{redirect:'follow'});
  const d=await r.json();
  if(d.error){ console.warn('[PURGE]', d.error); return null; }
  const sheets=['flights','stock','squads','transfers','actlog'];
  const errors=[], errIds=new Set();
  for(const sheet of sheets){
    for(const row of (d[sheet]||[])){
      // Затёртая ячейка: data === '#ERROR!' (Sheets) или иное не-base64/не-JSON,
      // но «#ERROR!» — характерный маркер именно формульной порчи.
      if(typeof row.data==='string' && /^#(ERROR!|REF!|NAME\?|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)/.test(row.data)){
        errors.push({sheet, id:row.id||'(без id)', data:row.data});
        if(row.id) errIds.add(row.id);
      }
    }
  }
  if(errors.length){
    console.log('[PURGE] Затёртых Google Sheets ячеек (#ERROR! и т.п.): '+errors.length);
    console.table(errors);
    // Снимаем из очереди записи, чьи id затёрты в облаке — ретрай заведомо бесполезен
    // (appendOne идемпотентен по id: повтор вернёт duplicate, новой строки не создаст).
    const q=pendingQueue.all();
    const kept=q.filter(x=>!errIds.has((x.data&&x.data.id)||x.id));
    if(kept.length!==q.length){
      pendingQueue.save(kept);
      console.log('[PURGE] Снято из очереди (непроходимые): '+(q.length-kept.length));
    }
    console.log('[PURGE] Данные затёртых строк невосстановимы. Строки можно вручную удалить в листах (после бэкапа); flights/transfers самозалечатся при следующем полном write.');
  } else {
    console.log('[PURGE] Затёртых ячеек не найдено');
  }
  return {errors};
}
