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
  // Всегда cors+redirect:follow; при ошибке/таймауте — no-cors
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

function _qid(x){ return (x.data&&x.data.id)||x.id; }
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
    const body = JSON.stringify({
      action:'append_one', token,
      sheet: item.type==='flight'?'flights':'transfers',
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

// Добавить вылет — кэшируем в очередь, сразу пробуем отправить (если есть сеть)
async function syncAddFlight(flight){
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
  tombstones.add(f.id);
  removedTransfers.forEach(t=>{ if(t.id) tombstones.add(t.id); });
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
  // Risk 3: правка поля вылета не должна тянуть полный write массива flights.
  // Сохраняем локально без авто-выгрузки; правка попадёт в облако при ближайшем
  // ambient-полном write (у бэкенда нет update_one для точечного обновления строки).
  saveLocalQuiet();
}

// Добавить transfer/arrival/loss — кэшируем в очередь, сразу пробуем отправить
async function syncAddTransfer(op){
  if(!op.id) op.id = genId('t');
  if(op && (op.geo_points_db||op.geo||op.color_key)) return; // ГЕО не синхронизируется
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;                       // локальный режим — облака нет, очередь не нужна
  pendingQueue.add({type:'transfer', data:op});  // кэш до подтверждения доставки
  if(!navigator.onLine) return;
  await trySendQueueItem({type:'transfer', data:op}, url, key, token);
}

// Отправить склад и расчёты (last-write-wins)
async function syncPushStockSquads(){
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;
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
  const res = await syncPost(url, body);
  if(res.ok){
    _lastStockTs = _stockVersion; // Помним что эту версию мы сами отправили — не перезагружаем
    console.log('[SYNC] stock+squads OK, sv:', _stockVersion);
  }
  else console.warn('[SYNC] stock push failed:', res.error);
}

// Отправить полный снимок (flights + transfers).
// НЕРАЗРУШАЮЩИЙ: перед записью доливаем из облака flights/transfers, которых нет
// локально (merge по id, исключая tombstones) — чтобы полный write не стёр чужие
// записи, ещё не полученные поллингом. Локальные данные при этом не теряются:
// итоговый снимок = (локальное) ∪ (облачное) − (удалённое локально).
async function syncPushAll(silent=false){
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
      const tb = tombstones.load();
      const [cloudF, cloudT] = await Promise.all([
        syncDecryptRows(d.flights||[], key),
        syncDecryptRows(d.transfers||[], key)
      ]);
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
    }catch(e){
      console.warn('[SYNC] pushAll merge пропущен (чтение не удалось):', e.message);
    }
  }

  // Склад/расчёты (stock/squads) НЕ пишем здесь — только flights/transfers.
  // Версионируемые листы выгружает исключительно syncPushStockSquads (с актуальным
  // _sv). Раньше ambient-syncPushAll писал stock/squads с устаревшим _sv из объектов
  // state и откатывал версию → гейт remoteVersion>_stockVersion отвергал изменение
  // на других устройствах. writeAll пропускает undefined-листы → склад не трогаем.
  const ts = Date.now();
  const encRow = async (obj,i) => syncEncrypt({...obj, id:obj.id||(ts+i)}, key);
  const [flights,transfers] = await Promise.all([
    Promise.all(state.flights.map((f,i)=>encRow(f,i))),
    Promise.all((state.transfers||[]).map((t,i)=>encRow(t,i)))
  ]);
  const data = geoStripFromSync({flights,transfers}); // ГЕО НИКОГДА не уходит в облако; stock/squads не трогаем
  const body = JSON.stringify({action:'write', token, data});
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

// Точечная выгрузка ТОЛЬКО листа flights (action:'write' с data={flights}).
// writeAll пропускает остальные листы (stock/squads/transfers — undefined),
// поэтому _sv склада, записанный syncPushStockSquads, НЕ затирается.
// Используется для возврата флага _lossWritten в облако (Risk 4) — у бэкенда нет
// update_one, обновить строку вылета можно только перезаписью листа flights.
async function syncPushFlightsOnly(){
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;
  const ts = Date.now();
  const flights = await Promise.all(state.flights.map((f,i)=>syncEncrypt({...f, id:f.id||(ts+i)}, key)));
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
      flights:   await syncDecryptRows(d.flights||[], key),
      stock:     await syncDecryptRows(d.stock||[], key),
      squads:    (await syncDecryptRows(d.squads||[], key)).map(sq=>({...sq,drones:Array.isArray(sq.drones)?sq.drones:[]})),
      transfers: await syncDecryptRows(d.transfers||[], key),
      users: d.users||[]
    };
    // Фильтруем tombstones (и удалённые вылеты, и удалённые loss-передачи)
    const tb = tombstones.load();
    loaded.flights   = loaded.flights.filter(f=>!tb.has(f.id));
    loaded.transfers = loaded.transfers.filter(t=>!tb.has(t.id));
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
  // Подтверждаем доставку по полному снимку облака
  pendingQueue.confirmDelivered(new Set([
    ...loaded.flights.map(f=>f.id),
    ...loaded.transfers.map(t=>t.id)
  ].filter(Boolean)));
  const hasPending = pendingQueue.all().length > 0;
  // Склад/расчёты — last-write-wins по _sv. Берём из облака ТОЛЬКО если версия
  // облака новее локальной — иначе затрём несохранённые локальные правки
  // (stock/squads НЕ кэшируются в pendingQueue, поэтому "нет pending" ещё не значит
  //  "локальные данные склада уже выгружены").
  const remoteStockVersion = Math.max(0,...loaded.stock.map(s=>s._sv||0));
  const stockNewer = remoteStockVersion > _stockVersion;
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
    if(stockNewer){
      state.stock   = loaded.stock;
      state.squads  = loaded.squads;
      _stockVersion = remoteStockVersion;   // синхронизируем версию после замены
    }
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
    if(stockNewer){
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
    let newFlights = 0;      // фактически добавленные чужие вылеты (для тоста — не вся дельта)
    let lossFlagSet = false; // выставили _lossWritten при приёме чужой потери — надо вернуть в облако
    const tb = tombstones.load();
    const deliveredIds = new Set(); // id, вернувшиеся из облака — подтверждение доставки

    // Новые вылеты от других пользователей
    for(const row of (d.flights||[])){
      const obj = await syncDecrypt(row, key);
      if(!obj) continue;
      deliveredIds.add(obj.id);
      if(tb.has(obj.id)) continue; // Удалён локально
      if(!state.flights.some(f=>f.id===obj.id)){
        state.flights.unshift(obj);
        changed = true;
        newFlights++;
        // Списываем дрон если потеря — но только если списание ещё не зафиксировано
        // на устройстве-источнике (флаг приходит вместе с вылетом).
        if(obj.returned==='no' && obj.drone && !obj._lossWritten){
          writeDroneLoss(obj.pilot, obj.drone, obj.date, obj.time, obj.id);
          obj._lossWritten=true;
          lossFlagSet = true;                       // Risk 4: вернём флаг в облако ниже
          setTimeout(()=>syncPushStockSquads(), 500); // списание + версия склада
        }
      }
    }

    // Новые передачи
    for(const row of (d.transfers||[])){
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
