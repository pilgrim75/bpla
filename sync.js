(globalThis.__FILE_BUILDS=globalThis.__FILE_BUILDS||{})['sync.js']=2026092504; // сборка файла — ставит tools/bump-version.js, руками не править
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
// С v0.29 (контроль версии) сюда же входят два состояния устройства, при которых писать
// в облако НЕЛЬЗЯ, даже если роль позволяет (update.js):
//  • «версия устарела» — сборка ниже min_client_build сервера (сервер v7.10 всё равно отклонит
//    запись; отказ здесь нужен, чтобы клиент не бился в стену и не строил иллюзию «сохранено»);
//  • «смешанная загрузка» — файлы разных сборок в одной вкладке (новый index + старый sync.js).
// Очередь при этом НЕ трогается: отложенные записи доедут после обновления (подтверждение
// доставки — по id из облака, формат очереди между версиями стабилен). actlog разрешён, как
// наблюдателю: событие «устарел» должно попасть в журнал (сервер принимает actlog всегда).
function syncReadOnly(){
  if(syncWriteBlockedByVersion()) return true;
  return syncIsViewer();
}
// Только роль (без состояний версии): решения о РЕЖИМЕ поллинга — наблюдателю быстрый
// поллинг не нужен, а устаревшему устройству нужен (узнать, что минимум снят, и читать данные).
function syncIsViewer(){
  try{
    return ((typeof state!=='undefined'&&state.role)||(window.authUser&&authUser.role)||'')==='viewer';
  }catch(e){ return false; }
}
function syncWriteBlockedByVersion(){
  try{ return typeof updWriteBlocked==='function' && updWriteBlocked(); }catch(e){ return false; }
}
// Номер сборки этого клиента (version.js). typeof — для vm-тестов, где version.js не грузят.
function syncClientBuild(){
  try{ return typeof APP_BUILD==='number' ? APP_BUILD : 0; }catch(e){ return 0; }
}
// min_client_build из ответа read/read_since (Backend v7.10) — основной канал: GET читается
// всегда, поэтому устройство узнаёт о минимуме ДО попытки записи (ответ no-cors POST нечитаем).
function syncNoteMinBuild(d){
  try{ if(d && d.min_client_build!==undefined && typeof updSetMinBuild==='function') updSetMinBuild(d.min_client_build, 'read'); }catch(e){}
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
// K2 (R0, 25.09.2026; дважды переделан по ревью R0): облачные строки ценных листов, которые это
// устройство НЕ смогло расшифровать (кроме невосстановимых '#ERROR!'), — по листам, по ПОСЛЕДНЕМУ
// чтению листа ТЕКУЩИМ ключом: {bad, total}. Раньше такие строки молча отбрасывались, и полная
// выгрузка (облако ∪ локаль) стирала их из облака, а выгрузка склада перезаписывала чужой склад
// снимком под чужим ключом. Правила:
//  • БЛОК ПО КЛЮЧУ (syncKeyBlocked) — не читается хотя бы ПОЛОВИНА строк flights или transfers:
//    неверный ключ. Запись в облако запрещена (updWriteBlocked, как «устарел»), красная полоса,
//    очередь цела. Считается ТОЛЬКО по листам с дозаписью: одна строка, дописанная устройством со
//    старым ключом, не блокирует (первый вариант запирал запись у всех по одной строке), а склад
//    пишется целым листом и при чужом ключе не читается ЦЕЛИКОМ — блок по нему запер бы запись и
//    устройствам с верным ключом, включая admin (второе ревью R0).
//  • МЕНЬШИНСТВО нечитаемых строк flights/transfers — не блок: полная выгрузка возвращает их в облако
//    КАК ЕСТЬ (сырые id+data). Устройство, записавшее их старым ключом, после смены ключа выгрузит
//    свои записи заново — локальная версия того же id вытесняет сырую строку.
//  • СКЛАД (stock/squads) — любая нечитаемая строка: снимок неполный (syncStockUnreadable), он не
//    принимается и склад не выгружается. Перед выгрузкой склада снимок облака обязан быть хоть раз
//    прочитан ЭТИМ ключом в сессии (_stockReadKey), иначе склад читается заново — устройство со
//    старым ключом не перепишет склад облака вслепую. Выход, если склад в облаке записан чужим
//    ключом, — syncStockOverwriteCloud() (только учётка admin, с подтверждением).
//  • Результат чтения относится к КЛЮЧУ, которым оно шло: если ключ сменили, пока чтение было в
//    полёте, счётчики и данные такого чтения отбрасываются (второе ревью R0: иначе чтение старым
//    ключом «снимало» блок новому неверному ключу или ставило ложный блок верному).
//  • Отдельной «проверки ключа за сессию» НЕТ (была в первой переделке): она держала очередь до
//    полного чтения (~1.5 МБ) — на слабой связи вылеты не уходили вовсе. Дописанная старым ключом
//    строка — это меньшинство (см. выше), а целые листы без чтения облака не пишутся никогда.
// 25.09 в облаке 0 нечитаемых строк во всех листах (syncAuditEncryption) — ложной блокировки нет.
const _syncUndecryptable = {};
const SYNC_KEYBLOCK_SHEETS=['flights','transfers'];
let _stockReadKey=null;   // ключ, которым в этой сессии снимок склада прочитан ЦЕЛИКОМ
let _stockUnreadTs=0;     // stock_updated_ts нечитаемого снимка — поллинг не перечитывает его каждые 30 с
function _syncSheetKeyBlocked(s){ const c=_syncUndecryptable[s]; return !!c && c.bad>0 && c.bad*2>=c.total; }
function syncKeyBlocked(){ return SYNC_KEYBLOCK_SHEETS.some(_syncSheetKeyBlocked); }
function syncStockUnreadable(){ return ['stock','squads'].some(s=>{ const c=_syncUndecryptable[s]; return !!c && c.bad>0; }); }
function syncKeyBlockedInfo(){
  return SYNC_VALUABLE_SHEETS.filter(s=>_syncUndecryptable[s]&&_syncUndecryptable[s].bad>0)
    .map(s=>s+': '+_syncUndecryptable[s].bad+' из '+_syncUndecryptable[s].total).join(', ');
}
// Ключ сменился с момента начала чтения — результат чтения не относится к текущему ключу
function syncKeyChanged(key){ return key!==syncGetCfg().key; }
// out (необязательно) — массив, куда кладутся СЫРЫЕ нерасшифрованные строки (для выгрузки как есть)
async function syncDecryptRows(rows, key, sheet='', out){
  if(!rows||!rows.length){ if(SYNC_VALUABLE_SHEETS.includes(sheet)) syncNoteUndecryptable(sheet,0,0,key); return []; }
  const results = await Promise.all(rows.map(r => syncDecrypt(r, key)));
  const ok = results.filter(Boolean);
  if(SYNC_VALUABLE_SHEETS.includes(sheet)){
    // '#ERROR!' (затёртая Sheets ячейка) и пустые — невосстановимы, их отбрасывание нормально
    const real = (r)=>r && r.data && r.data!=='#ERROR!';
    const badRows = rows.filter((r,i)=>!results[i] && real(r));
    if(Array.isArray(out)) out.push(...badRows);
    syncNoteUndecryptable(sheet, badRows.length, rows.filter(real).length, key);
  }
  // Нерасшифрованные записи из state отбрасываются (приложение не падает), но для ценных
  // листов — заметная сигнализация. Инвентаризация — syncAuditEncryption() из консоли.
  const dropped = rows.length - ok.length;
  if(dropped>0 && SYNC_VALUABLE_SHEETS.includes(sheet) && !syncKeyChanged(key)){
    console.error('[SYNC] ⚠ не расшифровано '+dropped+' записей листа '+sheet+' (на этом устройстве не видны)');
    // Дедуп на сессию по сигнатуре «лист|количество» — и для тоста: ambient-выгрузка читает
    // облако через 2 с после каждой правки, тост на каждое чтение был бы шумом.
    try{
      const sig=sheet+'|'+dropped;
      if(!_syncLossLogged.has(sig)){
        _syncLossLogged.add(sig);
        try{ showSyncToast('⚠ Не расшифровано '+dropped+' зап. листа «'+sheet+'» — на этом устройстве они не видны', 8000); }catch(e){}
        // Постоянный след в журнале действий (тост гаснет через 8с). Петли нет: сбои
        // расшифровки самого actlog тихие (лист не в SYNC_VALUABLE_SHEETS).
        logAction('sync','decrypt_loss','⚠ Не удалось расшифровать '+dropped+' записей из листа '+sheet);
      }
    }catch(e){}
  }
  return ok;
}

let _syncKeyBlockLogged=false, _syncStockUnreadLogged=false;
function syncNoteUndecryptable(sheet, bad, total, key){
  if(key!==undefined && syncKeyChanged(key)) return; // чтение шло прежним ключом — к текущему не относится
  const was=syncKeyBlocked();
  _syncUndecryptable[sheet]={bad:bad||0, total:Math.max(total||0, bad||0)};
  if((sheet==='stock'||sheet==='squads') && bad>0) _stockReadKey=null; // снимок склада этим ключом больше не читается
  const now=syncKeyBlocked();
  if(now&&!was){
    console.error('[SYNC] ⛔ облачные записи не расшифровываются ('+syncKeyBlockedInfo()+') — неверный ключ? Запись в облако запрещена');
    if(!_syncKeyBlockLogged){ _syncKeyBlockLogged=true; syncLogKeyMismatch(); }
  }
  if(!now && (sheet==='stock'||sheet==='squads') && bad>0 && !_syncStockUnreadLogged){
    _syncStockUnreadLogged=true;
    const msg='В облачном листе '+sheet+' не расшифровывается '+bad+' строк из '+total+' — приём и выгрузка склада остановлены (снимок неполный). '+
      (bad>=total?'Весь лист записан другим ключом (устройство со старым ключом). ':'')+
      'Администратору: проверить syncAuditEncryption(); если склад облака записан чужим ключом — syncStockOverwriteCloud() с устройства с верным ключом и актуальным складом';
    console.error('[SYNC] ⛔ '+msg);
    try{ showSyncToast('⛔ Склад не синхронизируется: склад в облаке не расшифровывается', 10000); }catch(e){}
    syncLogEvent('stock_unreadable', msg);
  }
  if(now!==was){
    try{ if(typeof updRenderBars==='function') updRenderBars(); }catch(e){}
    // Блок снят (ключ исправлен, облако восстановлено) — дослать то, что стояло: правки и склад
    if(!now) setTimeout(()=>{ try{ syncFlushLocalChanges('key-ok'); }catch(e){} },0);
  }
}
// Снимок склада прочитан ЦЕЛИКОМ ключом key (все строки stock и squads расшифрованы)
function syncNoteStockRead(key){
  if(syncKeyChanged(key)||syncStockUnreadable()) return;
  _stockReadKey=key; _stockUnreadTs=0;
}
// Смена ключа (Настройки, перешифровка): прежние счётчики относятся к старому ключу
function syncKeyStateReset(){
  const was=syncKeyBlocked();
  Object.keys(_syncUndecryptable).forEach(k=>delete _syncUndecryptable[k]);
  _syncKeyBlockLogged=false; _syncStockUnreadLogged=false; _stockReadKey=null; _stockUnreadTs=0;
  _keyCheckRun=null; // идущая проверка — старым ключом; новая начнётся заново
  _syncLossLogged.clear();
  if(was){ try{ if(typeof updRenderBars==='function') updRenderBars(); }catch(e){} }
}
// Перечитать облако текущим ключом (после смены ключа / перешифровки) — однопоточно ДЛЯ ЭТОГО КЛЮЧА:
// syncKeyStateReset обнуляет _keyCheckRun, поэтому проверка нового ключа не присоединится к чтению
// старым. Результат: true — ключ подходит (flights/transfers не в блоке), false — блок/не прочиталось.
let _keyCheckRun=null;
function syncKeyRecheck(){
  if(_keyCheckRun) return _keyCheckRun;
  const key=syncGetCfg().key;
  const run=(async()=>{
    try{ await syncPullOnLogin(); return !syncKeyChanged(key) && !syncKeyBlocked() && !!_syncUndecryptable.flights; }
    catch(e){ return false; }
    finally{ if(_keyCheckRun===run) _keyCheckRun=null; }
  })();
  _keyCheckRun=run;
  return run;
}
// Запись sync/key_mismatch шифруется ключом ЭТОГО устройства — неверным, и администратор её не
// прочитает (ревью R0). Признак выносим в ОТКРЫТЫЙ id строки actlog: 'km~<время>~<логин в hex>'
// (safeId_ сервера пропускает только латиницу/цифры/_.:~-, логины бывают кириллицей).
// Читается без ключа — syncKeyMismatchEntry (журнал и «Последний вход» у администратора).
function _syncHex(s){ try{ return Array.from(new TextEncoder().encode(String(s))).map(b=>b.toString(16).padStart(2,'0')).join(''); }catch(e){ return ''; } }
function _syncUnhex(h){ try{ const b=new Uint8Array((h.match(/../g)||[]).map(x=>parseInt(x,16))); return new TextDecoder().decode(b); }catch(e){ return ''; } }
function syncLogKeyMismatch(){
  try{
    if(typeof logAction!=='function'||typeof authUser==='undefined') return;
    const login=(authUser&&authUser.login)||'unknown';
    const ts=Date.now();
    const d=new Date(ts), p=n=>String(n).padStart(2,'0');
    const entry={
      // id ≤ 80 символов (safeId_): hex логина режем по ЧЁТНОЙ длине — не посреди байта
      id:'km~'+ts+'~'+_syncHex(login).slice(0, (80-4-String(ts).length) & ~1), ts,
      date:d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()), time:p(d.getHours())+':'+p(d.getMinutes()),
      user:login, role:(authUser&&authUser.role)||'', build:syncClientBuild(),
      type:'sync', action:'key_mismatch',
      details:'Не расшифровываются записи облака ('+syncKeyBlockedInfo()+') — запись с этого устройства отключена, чтобы не стереть и не перешифровать чужим ключом'
    };
    if(typeof actLog!=='undefined'&&Array.isArray(actLog)){ actLog.unshift(entry); try{ localStorage.setItem('act_log',JSON.stringify(actLog.slice(0,500))); }catch(e){} }
    appendToCloud('actlog', entry);
  }catch(e){}
}
// Сырая строка actlog с открытым признаком key_mismatch → запись журнала (без расшифровки)
function syncKeyMismatchEntry(row){
  const m=row&&typeof row.id==='string'?/^km~(\d{12,14})~([0-9a-f]*)$/.exec(row.id):null;
  if(!m) return null;
  const ts=+m[1], d=new Date(ts), p=n=>String(n).padStart(2,'0');
  return { id:row.id, ts, date:d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()), time:p(d.getHours())+':'+p(d.getMinutes()),
    user:_syncUnhex(m[2])||'?', role:'', type:'sync', action:'key_mismatch',
    details:'Устройство не расшифровывает облако своим ключом (неверный ключ) — запись с него отключена; сама запись журнала зашифрована его ключом и недоступна' };
}
// Приостановка ВСЕЙ отправки на время перешифровки облака (cfgReencrypt): элемент очереди,
// отправленный между чтением и записью, лёг бы в облако старым ключом (ревью R0).
function syncWritesPaused(){ try{ return !!(typeof window!=='undefined'&&window._reencryptBusy); }catch(e){ return false; } }
// Дождаться уже идущих отправок (очередь, полная выгрузка, склад) — перед перешифровкой
async function syncWaitIdle(){
  for(let i=0;i<3;i++){
    const ps=[_flushRun,_pushAllRun,_stockPushChain].filter(Boolean);
    if(!ps.length) return;
    try{ await Promise.all(ps.map(p=>Promise.resolve(p).catch(()=>{}))); }catch(e){}
  }
}

// Дедупликация по id: в облаке возможны дубль-строки одного id (повторный append
// очереди при неподтверждённой доставке). Первое вхождение выигрывает.
function syncDedupeById(rows){
  const seen=new Set();
  return rows.filter(x=>{ if(!x.id) return true; if(seen.has(x.id)) return false; seen.add(x.id); return true; });
}

// Сборка клиента в КАЖДОМ POST (v0.29): единственная точка — сервер v7.10 сверяет её с
// meta.min_client_build и отклоняет write/append_one устаревших клиентов (кроме actlog).
// Правка строки, а не JSON.parse/stringify: полный write — мегабайты шифртекста, разбирать
// его ради одного поля незачем. Ключ ставится ПЕРВЫМ — поле тела с тем же именем (если
// когда-нибудь появится) перекроет его при разборе на сервере, как и положено явному значению.
function syncWithClientBuild(body){
  if(typeof body!=='string' || body.charAt(0)!=='{') return body;
  const cb='"client_build":'+syncClientBuild();
  return body==='{}' ? '{'+cb+'}' : '{'+cb+','+body.slice(1);
}
async function syncPost(url, body){
  body = syncWithClientBuild(body);
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
    // Сервер ОТВЕТИЛ ошибкой — запрос дошёл; повтор через no-cors бессмыслен и раньше
    // МАСКИРОВАЛ ошибку как «unverified успех» (v7.8: конфликт версий склада должен быть виден).
    if(d.error){
      // Второй канал контроля версии: сервер отклонил запись как устаревшую — включить режим
      // «только чтение» сразу, не дожидаясь очередного read_since.
      if(d.error==='client_outdated'){ try{ if(typeof updSetMinBuild==='function') updSetMinBuild(d.min_build, 'post'); }catch(e){} }
      return { ok:false, error:d.error, serverError:true, data:d };
    }
    return { ok:true, data:d };
  }catch(e){
    // Запасной no-cors — тоже с таймаутом (ревью R0, lint fetch-timeout): зависший запрос
    // держал бы очередь/выгрузку (однопоточные) навсегда
    const ctrl2 = new AbortController();
    const tid2 = setTimeout(()=>ctrl2.abort(), 30000);
    try{
      await fetch(url, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body, mode:'no-cors', signal:ctrl2.signal
      });
      return { ok:true, data:null, unverified:true };
    }catch(e2){
      return { ok:false, error:e2.message };
    }finally{ clearTimeout(tid2); }
  }
}

// GET с таймаутом (06.09.2026). Раньше ни один GET (read_since/read) таймаута не имел:
// зависший запрос в пре-чеке пуша блокировал _stockPushChain навсегда (склад молча
// переставал выгружаться), а зависший поллинг накапливал параллельные вызовы.
const SYNC_GET_TIMEOUT_MS  = 25000; // лёгкие запросы: read_since
const SYNC_READ_TIMEOUT_MS = 60000; // полный read всех листов (~1700 шифрованных строк)
async function syncFetchJson(u, ms){
  const ctrl = new AbortController();
  const tid = setTimeout(()=>ctrl.abort(), ms||SYNC_GET_TIMEOUT_MS);
  try{
    const r = await fetch(u, {redirect:'follow', signal:ctrl.signal});
    return await r.json();
  } finally { clearTimeout(tid); }
}
// Запись в журнал действий из sync-слоя (logAction живёт в app.js — рантайм-вызов с гардом).
function syncLogEvent(action, details){
  try{ if(typeof logAction==='function' && typeof authUser!=='undefined') logAction('sync', action, details); }catch(e){}
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

// Невыгруженные правки (ревью v0.29, 25.09.2026) — метка в localStorage, переживает перезагрузку.
// Правка СУЩЕСТВУЮЩЕЙ записи (вылет/передача) в очередь не попадает — её выгружает только полная
// запись syncPushAll (debounce saveLocal 2 с). Если до неё страница перезагрузилась (F5,
// автообновление версии), пропала сеть, устройство вошло офлайн (PWA) или запись запрещена
// («версия устарела»), плановая полная загрузка при пустой очереди ЗАМЕНЯЛА локальные записи
// облачными — правка молча откатывалась (вплоть до осиротевшей потери: loss уже в облаке,
// а «вернул→потерян» откатился). Теперь saveLocal ставит метку-поколение, успешная полная запись
// снимает её, ТОЛЬКО если поколение не выросло за время выгрузки; при метке полная загрузка лишь
// доливает новое из облака (как при непустой очереди), а досыл идёт первым (syncFlushLocalChanges).
// Ограничение модели прежнее: одновременная правка одной записи на двух устройствах — last-write-wins.
const SYNC_DIRTY_KEY='sync_full_dirty';
function syncDirtyGen(){ try{ return +(localStorage.getItem(SYNC_DIRTY_KEY)||0)||0; }catch(e){ return 0; } }
function syncHasDirty(){ return syncDirtyGen()>0; }
function syncMarkDirty(){
  if(syncIsViewer()) return; // наблюдатель не правит — у него метка не снималась бы никогда
  try{ localStorage.setItem(SYNC_DIRTY_KEY, String(Math.max(syncDirtyGen()+1, Date.now()))); }catch(e){}
}
function syncClearDirty(gen){ try{ if(gen===undefined||syncDirtyGen()===gen) localStorage.removeItem(SYNC_DIRTY_KEY); }catch(e){} }

// Досыл ВСЕГО невыгруженного: очередь, полные правки (метка), склад (неподтверждённый пуш или
// дельта «локаль − база»). Точки: старт после входа, появление сети, снятие блокировки версии,
// подтверждение офлайн-входа. Раньше склад и правки ждали следующей операции оператора.
async function syncFlushLocalChanges(reason){
  const {url,token}=syncGetCfg();
  if(!url||!token||!navigator.onLine) return;
  // Очередь — ДО проверки «только чтение»: у наблюдателя и «устаревшего» устройства в ней actlog,
  // который досылается всегда (фильтр — в самой очереди; ревью v0.29, раунд 2).
  try{ syncFlushQueue(); }catch(e){}
  if(syncReadOnly()) return;
  if(syncHasDirty()){
    console.log('[SYNC] досыл невыгруженных правок ('+(reason||'')+')');
    try{ await syncPushAll(true); }catch(e){}
  }
  try{
    const delta=!!_stockBase&&syncStockHash(state.stock,state.squads)!==syncStockHash(_stockBase.stock,_stockBase.squads);
    if(syncStockHasPending()||delta) syncPushStockSquads();
  }catch(e){}
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
  save(q){ try{ localStorage.setItem(this._key, JSON.stringify(q)); }catch(e){ if(typeof lsQuotaWarn==='function') lsQuotaWarn(e); else console.error('[STORAGE] queue write failed', e&&e.name); } updateQueueIndicator(); },
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
    // Backend v7.10: id уже в листе tombstones (запись удалена) — сервер её не примет НИКОГДА
    // и не вернёт в read, т.е. подтверждения доставки не будет. Снимаем из очереди, иначе
    // элемент ретраился бы вечно (удалённое отправлять незачем — удаление уже в облаке).
    if(res.ok && res.data && res.data.status==='skipped'){
      pendingQueue.remove(_qid(item));
      console.log('[SYNC] append_one пропущен сервером (запись удалена):', _qid(item));
      return;
    }
    if(res.ok||res.serverError) pendingQueue.markTried(_qid(item)); // ответ сервера (в т.ч. ошибка) = попытка была
    if(res.serverError) console.warn('[SYNC] append_one отклонён сервером:', res.error);
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

// Set с нормализацией ключа к строке: has(1779899523574) === has('1779899523574')
class _TombSet extends Set{
  constructor(it){ super(); if(it) for(const v of it) this.add(v); }
  add(v){ return super.add(String(v)); }
  has(v){ return super.has(String(v)); }
  delete(v){ return super.delete(String(v)); }
  // Удалена ли запись ЭТОГО листа ('flights'|'transfers'). Для всех id — как has(), кроме
  // неоднозначных легаси-id (TOMB_AMBIGUOUS): там действует только удаление со своим листом.
  hasIn(sheet,v){
    const s=String(v);
    if(super.has(sheet+':'+s)) return true;
    if(!super.has(s)) return false;
    if(TOMB_AMBIGUOUS.has(s)) return TOMB_LEGACY_SCOPE[s]===sheet;
    return true;
  }
}
// Неоднозначные легаси-id (ревью v0.29, 25.09.2026). 13 майских id выдавались одной пачкой и
// существуют И в flights, И в transfers (1779879431152…164). Набор удалённых id общий для
// обоих листов, поэтому tombstone одной записи скрывал и стирал вторую: 25.09, когда id стали
// сравниваться строкой (_TombSet), пропал вылет …160 (Поп, ПВХ1, 26.05 08:14) — tombstone плана Б
// 21.08 предназначался ДУБЛЮ ПЕРЕДАЧИ с тем же id. Для этих id удаление действует только на свой
// лист: новое публикуется с префиксом ('flights:'/'transfers:'+id, syncPublishTombstones), старый
// беспрефиксный tombstone …160 относится к transfers. Новые id (<ts>_<тип>_<случайное>)
// пересечься не могут — для них всё как раньше. Те же константы — в backend.gs (v7.10).
const TOMB_AMBIGUOUS=new Set(['1779879431152','1779879431153','1779879431154','1779879431155','1779879431156',
  '1779879431157','1779879431158','1779879431159','1779879431160','1779879431161','1779879431162','1779879431163','1779879431164']);
const TOMB_LEGACY_SCOPE={'1779879431160':'transfers'};
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
  _save(list){ try{ localStorage.setItem(this._key, JSON.stringify(list)); }catch(e){ if(typeof lsQuotaWarn==='function') lsQuotaWarn(e); else console.error('[STORAGE] tombstones write failed', e&&e.name); } },
  // Набор сравнивает id КАК СТРОКИ (25.09.2026). Облачные tombstones сливаются строками
  // (syncMergeCloudTombstones → String), а у легаси-записей id — ЧИСЛО (1779899523574):
  // tb.has(число) по набору строк давал false → удаление с другого устройства по легаси-id
  // НИКОГДА не применялось (форензика «207 дублей»: стейл-устройство не узнавало об удалениях).
  load(){ return new _TombSet(this._load().map(x=>x.id)); },
  add(id){ this.addMany([id]); },
  // Массовое добавление одним чтением/записью localStorage (adminClearFlights и т.п.)
  addMany(ids){
    const list=this._load();
    const have=new Set(list.map(x=>String(x.id)));
    const now=Date.now();
    let changed=false;
    ids.forEach(id=>{ if(id!=null&&id!==''&&!have.has(String(id))){ list.push({id,ts:now}); have.add(String(id)); changed=true; } });
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
// scope — лист удаляемых записей ('flights'|'transfers'). Обязателен для неоднозначных легаси-id
// (TOMB_AMBIGUOUS): им публикуется 'лист:id', без листа такой id НЕ публикуется — иначе удаление
// задело бы одноимённую запись другого листа (так пропал вылет …160, см. TOMB_AMBIGUOUS).
function syncPublishTombstones(ids, scope){
  const arr=(Array.isArray(ids)?ids:[ids]).filter(x=>x!=null&&x!=='').map(id=>{
    const s=String(id);
    if(!TOMB_AMBIGUOUS.has(s)) return id;
    if(scope==='flights'||scope==='transfers') return scope+':'+s;
    console.warn('[TOMB] неоднозначный легаси-id '+s+' без указания листа — удаление не публикуется');
    return null;
  }).filter(x=>x!=null);
  if(!arr.length) return;
  tombstones.addMany(arr);                  // локальная страховка (как было раньше)
  // По РОЛИ: наблюдатель не публикует. Устаревшая версия (update.js) — в очередь можно, её
  // отправку держит syncFlushQueue до обновления; иначе удаление, сделанное за миг до перехода
  // в «только чтение», не дошло бы до облака никогда.
  if(syncIsViewer()) return;
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

// Разовая публикация ЛОКАЛЬНЫХ tombstone'ов устройства в облачный лист (v0.29, из консоли).
// С Backend v7.10 лист tombstones — источник истины «что удалено» и для сервера: append_one/
// write не принимают такие id, read их не отдаёт. Удаление, сделанное до Пути Б (17.06) или
// не доехавшее до облака, живёт только в localStorage этого устройства — сервер о нём не знает,
// и стейл-устройство может вернуть запись. Сухой прогон по умолчанию; только учётка admin.
// Опасный случай — локальный tombstone на запись, ЖИВУЮ в облаке: публикация скроет её на
// всех устройствах. Такие id только перечисляются; публикуются лишь с {includeLive:true}.
// id публикуются в ИСХОДНОМ типе (число у легаси-записей) — как чистка 25.09.
async function syncPublishLocalTombstones(confirm_=false, opts={}){
  if(typeof isAdminAccount==='function' && !isAdminAccount()){ console.warn('[TOMB] только учётка admin'); return null; }
  const {url,token}=syncGetCfg();
  if(!url||!token){ console.warn('[TOMB] облако не настроено'); return null; }
  const d=await syncFetchJson(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(), SYNC_READ_TIMEOUT_MS);
  if(d.error){ console.warn('[TOMB]', d.error); return null; }
  const cloud=new _TombSet((d.tombstones||[]).map(r=>r&&r.id).filter(x=>x!=null&&x!==''));
  const ids=rows=>new _TombSet((rows||[]).map(r=>r&&r.id).filter(x=>x!=null&&x!==''));
  const liveF=ids(d.flights), liveT=ids(d.transfers);
  // Tombstone с префиксом листа ('flights:id'/'transfers:id', неоднозначные легаси-id) живым считаем
  // только по своему листу (раунд 2 ревью v0.29)
  const isLive=id=>{ const m=/^(flights|transfers):(.+)$/.exec(String(id)); if(m) return (m[1]==='flights'?liveF:liveT).has(m[2]); return liveF.has(id)||liveT.has(id); };
  const seen=new _TombSet(), missing=[];
  tombstones._load().forEach(x=>{ const id=x.id; if(id==null||id===''||seen.has(id)||cloud.has(id)) return; seen.add(id); missing.push(id); });
  const liveIds=missing.filter(isLive);
  const toPublish=opts.includeLive ? missing : missing.filter(id=>!isLive(id));
  const plan={local:tombstones._load().length, cloud:cloud.size, missing:missing.length, liveInCloud:liveIds, toPublish:toPublish.length};
  console.log('[TOMB] план:', plan);
  if(liveIds.length) console.warn('[TOMB] '+liveIds.length+' локальных tombstone на ЖИВЫЕ записи облака — публикуются только с {includeLive:true}:', liveIds);
  if(!confirm_ || !toPublish.length) return plan;
  if(syncReadOnly()){ console.warn('[TOMB] запись сейчас запрещена (наблюдатель / версия устарела)'); return plan; }
  toPublish.forEach(id=>pendingQueue.add({type:'tombstone', data:{id}}));
  if(navigator.onLine) syncFlushQueue();
  syncLogEvent('tomb_publish_local', 'Разовая публикация локальных tombstone: '+toPublish.length+(opts.includeLive?' (в т.ч. живых: '+liveIds.length+')':''));
  return {...plan, published:toPublish.length};
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
    state.flights=state.flights.filter(f=>!f.id||!tb.hasIn('flights',f.id));
    if(state.flights.length!==n) removed=true;
  }
  if(Array.isArray(state.transfers)){
    const n=state.transfers.length;
    // Снятые по ЧУЖОМУ tombstone записи о потере: наличие здесь НЕ компенсируем — его несёт
    // снимок склада устройства, сделавшего удаление (syncDeleteFlight → _compensateRemovedLosses
    // → push); локальная компенсация задвоила бы её тем же merge (форензика 06.09, §7).
    // Только считаем — pollCloud после приёма запускает самопроверку qty vs ledger.
    syncPruneStateByTombstones.lastLoss=state.transfers.filter(t=>t.id&&tb.hasIn('transfers',t.id)&&t.type==='loss').length;
    state.transfers=state.transfers.filter(t=>!t.id||!tb.hasIn('transfers',t.id));
    if(state.transfers.length!==n) removed=true;
  }
  return removed;
}

// ============================================================
// ЗАЩИТА ОТ ВОСКРЕШЕНИЯ ДО-ЧЕРТОВЫХ ЗАПИСЕЙ (25.09.2026, форензика «207 дублей»)
// ============================================================
// Устройство с устаревшим localStorage держит удалённые записи как «локальные вне
// облака» (ветка localOnly syncPullOnLogin) и возвращает их в облако полной выгрузкой
// (syncPushAll = облако ∪ локаль). Пока удаливший держал локальный tombstone, его
// выгрузка их вычищала; tombstones.prune (90 дней) снял защиту — 207 дублей потерь
// 27.05 и 19 старых версий вылетов вернулись навсегда.
// Правило: ПОСЛЕ ЧЕРТЫ до-чертовая история в облаке полна (черта требует пустой
// очереди), поэтому до-чертовая запись, которой НЕТ в облаке и НЕТ в очереди этого
// устройства, — воскрешение. Её не выгружаем: снимаем локально + предупреждение в actlog.
// Черты нет → ничего не делаем (поведение прежнее).
let _syncStaleChecked=false; // была ли в этой сессии проверка на свежем полном чтении облака
// Момент ЗАПИСИ для проверки. id вида '<ts>_x_…' выдан при выгрузке безыдной записи —
// это время выгрузки, а не записи (старая запись «помолодела» бы), поэтому такой id
// не используем; последний фолбэк — дата+время события.
function _syncStaleRecTs(r,kind){
  const own=kind==='f'?+r._savedTs:+r._cut;
  if(Number.isFinite(own)&&own>0) return own;
  const sid=String(r.id==null?'':r.id);
  if(sid.indexOf('_x_')<0){ const n=parseInt(sid,10); if(Number.isFinite(n)&&n>1e12) return n; }
  const d=Date.parse((r.date||'')+'T'+(r.time||'00:00'));
  return Number.isFinite(d)?d:0;
}
// cloudF/cloudT — Set открытых id строк облака (сырые строки, в т.ч. нерасшифрованные:
// запись с затёртой #ERROR! ячейкой в облаке ЕСТЬ, её локальную копию снимать нельзя).
// Возвращает число снятых записей.
function syncDropStaleLocal(cloudF,cloudT,where){
  const cut=(typeof marshrutCutTs==='function')?marshrutCutTs():0;
  if(!cut||!cloudF||!cloudT) return 0;
  _syncStaleChecked=true;
  const queued=new Set(pendingQueue.all().map(x=>(x.data&&x.data.id)||x.id).filter(x=>x!=null).map(String));
  const stale=(r,kind,cloud)=>!!r&&r.id!=null&&r.id!==''&&!cloud.has(String(r.id))&&!queued.has(String(r.id))&&_syncStaleRecTs(r,kind)<cut;
  const dropF=(state.flights||[]).filter(f=>stale(f,'f',cloudF));
  const dropT=(state.transfers||[]).filter(t=>stale(t,'t',cloudT));
  if(!dropF.length&&!dropT.length) return 0;
  const dF=new Set(dropF), dT=new Set(dropT);
  state.flights=state.flights.filter(f=>!dF.has(f));
  state.transfers=(state.transfers||[]).filter(t=>!dT.has(t));
  const who=(typeof authUser!=='undefined'&&authUser&&authUser.login)||'?';
  const role=(typeof authUser!=='undefined'&&authUser&&authUser.role)||'';
  const ua=(typeof navigator!=='undefined'&&navigator.userAgent)?navigator.userAgent.slice(0,60):'';
  const ids=[...dropF.map(f=>'F:'+f.id),...dropT.map(t=>'T:'+t.id)];
  const msg='Воскрешение до-чертовых записей остановлено ('+where+'): устройство '+who+(role?'/'+role:'')+
    ' — вылетов '+dropF.length+', движений '+dropT.length+' нет в облаке, в облако НЕ выгружены и сняты локально. id: '+
    ids.slice(0,40).join(', ')+(ids.length>40?' … (+'+(ids.length-40)+')':'')+(ua?' | '+ua:'');
  console.warn('[SYNC] '+msg);
  syncLogEvent('stale_drop', msg);
  if(typeof showSyncToast==='function') showSyncToast('⚠ Устаревшие записи ('+ids.length+') не выгружены — см. журнал действий', 8000);
  return dropF.length+dropT.length;
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
  try{ localStorage.setItem('sync_stock_base', JSON.stringify(_stockBase)); }catch(e){ if(typeof lsQuotaWarn==='function') lsQuotaWarn(e); else console.error('[STORAGE] stock base write failed', e&&e.name); }
}
// Забыть базу — для операций полной замены state (импорт JSON, сброс): следующий пуш
// идёт без merge (импорт = полная замена, а не дельта к прежнему снимку).
function syncStockForgetBase(){ _stockBase=null; syncStockClearPending(); try{ localStorage.removeItem('sync_stock_base'); }catch(e){} }

// ===== Неподтверждённый пуш склада (06.09.2026, ФОРЕНЗИКА_2026-09-06_ПВХ2д.md) =====
// Последний отправленный снимок, чья доставка не подтверждена. Персистентен (localStorage
// 'sync_stock_pending'): переживает F5. Подтверждение — ТОЖДЕСТВОМ версии (ответ writeAll,
// версия снимка облака, цепочка версий v7.8), никогда — неравенством времени.
let _stockPending=null;
try{ _stockPending=JSON.parse(localStorage.getItem('sync_stock_pending')||'null'); }catch(e){ _stockPending=null; }
function syncStockSetPending(p, reason){
  _stockPending={version:p.version, hash:syncStockHash(p.stock,p.squads), stock:p.stock, squads:p.squads, reason:reason||'', ts:Date.now()};
  try{ localStorage.setItem('sync_stock_pending', JSON.stringify(_stockPending)); }catch(e){ if(typeof lsQuotaWarn==='function') lsQuotaWarn(e); }
}
function syncStockClearPending(version){
  if(_stockPending && version && _stockPending.version>version) return; // более поздний пуш ещё не подтверждён
  _stockPending=null;
  try{ localStorage.removeItem('sync_stock_pending'); }catch(e){}
}
function syncStockHasPending(){ return !!_stockPending; }
// Ограниченный автоповтор ТОЧНО не севшего пуша (раньше дельта ждала следующей операции оператора).
const _stockRepush={};
function syncStockScheduleRepush(version, delayMs){
  const k=String(version||0);
  _stockRepush[k]=(_stockRepush[k]||0)+1;
  if(_stockRepush[k]>3){ console.warn('[SYNC] stock push: 3 повтора не удались — жду следующей операции/восстановления сети'); return; }
  setTimeout(()=>syncPushStockSquads(), delayMs||3000);
}
// Облако показало НАШ пуш (равная версия) — база := снимок облака, без merge.
// Возвращает true, если база действительно двигалась.
function syncStockRebaseOwn(remote){
  const same=_stockBase && _stockBase.version===remote.version &&
    syncStockHash(_stockBase.stock,_stockBase.squads)===syncStockHash(remote.stock,remote.squads);
  if(same){ syncStockClearPending(remote.version); return false; }
  syncStockSetBase(remote.stock, remote.squads, remote.version);
  syncStockClearPending(remote.version);
  console.warn('[SYNC] склад: облако показало наш пуш '+remote.version+' — база перебазирована без merge (подтверждение по версии)');
  syncLogEvent('stock_confirm','пуш склада '+remote.version+' подтверждён по версии снимка (подтверждение записи ранее не прошло, база отставала)');
  return true;
}
// Пары модель×локация, у которых количество изменилось между двумя снимками — для журнала действий.
function syncStockDiffKeys(before, after){
  const idx=s=>{ const m=new Map();
    (s.stock||[]).forEach(r=>{ const k='склад:'+_stKey(r); m.set(k,(m.get(k)||0)+(+r.qty||0)); });
    (s.squads||[]).forEach(q=>(q.drones||[]).forEach(d=>{ const k=_stN(q.pilot)+'/'+_stN(d.name); m.set(k,(m.get(k)||0)+(+d.qty||0)); }));
    return m; };
  const a=idx(before), b=idx(after), out=[];
  new Set([...a.keys(),...b.keys()]).forEach(k=>{ const x=a.get(k)||0, y=b.get(k)||0; if(x!==y) out.push(k+': '+x+'→'+y); });
  return out;
}
// Самопроверка «наличие vs журнал движений» после события, которое могло их развести
// (merge с дельтой, снятие loss по чужому tombstone). Только рост числа расхождений — тост
// + запись в журнал; не блокирует (транзиентные расхождения до прихода снимка допустимы).
let _stockSelfCheckBase=null;
function syncStockSelfCheck(reason){
  if(typeof marshrutCompare!=='function') return;
  try{
    const r=marshrutCompare({quiet:true});
    const n=r.diffs.length;
    if(_stockSelfCheckBase!==null && n>_stockSelfCheckBase){
      showSyncToast('⚠ Склад разошёлся с журналом движений: '+n+' пар — '+reason, 10000);
      syncLogEvent('stock_selfcheck', reason+': '+r.diffs.map(d=>d.model+'|'+d.location+' qty '+d.qty+' ≠ ledger '+d.balance).join('; '));
    }
    _stockSelfCheckBase=n;
  }catch(e){}
}
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

// Облачный снимок новее нашего? Строго по версии — да. РАВНАЯ версия — это по построению
// НАШ пуш (версия = Date.now() устройства-писателя, коллизия по миллисекунде между
// устройствами исключена). Если строки state несут тот же штамп _sv (encRow пишет его в
// объекты state при пуше), state ПРОИСХОДИТ от этого пуша (плюс, возможно, ещё не
// выгруженные операции): облако показывает наш собственный снимок, а база просто отстала
// (подтверждение записи не прошло) → ПЕРЕБАЗИРОВАТЬ, НЕ сливать. merge(старая база, state,
// remote) наложил бы дельту ВТОРОЙ раз — так 05.09.2026 19:52 склад получил {не бг 4,
// Толстый 4} (ФОРЕНЗИКА_2026-09-06_ПВХ2д.md). Строки state СТАРЕЕ версии — стейл droneState
// другой вкладки (случай 21.08) — прежняя логика: содержимое ≠ базе → принять.
function syncStockRemoteIsNewer(remote){
  // (0) Это НАШ снимок (подтверждённый или ещё нет): строки state несут его штамп _sv, либо он
  //     совпадает с неподтверждённым пушем. База := он, merge НЕ выполнять (иначе дельта дважды).
  const own = (syncStockMaxSv(state.stock,state.squads) === remote.version) ||
              (!!_stockPending && _stockPending.version === remote.version);
  if(own){ syncStockRebaseOwn(remote); return false; }
  // (1) Строго новее нашей версии — чужая запись, принять.
  if(remote.version > _stockVersion) return true;
  // (2) Версия ≠ версии базы — запись, которой мы ещё НЕ ВИДЕЛИ, даже если её номер меньше нашего
  //     bump (спецветки saveTransfer/trSaveEdit бампят версию ДО пуша; чужой пуш, сделанный чуть
  //     раньше и ещё не полученный поллингом, иначе отвергался и ПЕРЕЗАПИСЫВАЛСЯ нашим снимком).
  //     Merge наложит нашу дельту относительно базы — последнего виденного снимка.
  if(_stockBase && remote.version !== _stockBase.version &&
     syncStockHash(remote.stock,remote.squads)!==syncStockHash(_stockBase.stock,_stockBase.squads)) return true;
  // (3) Равная версия, но строки state старее (стейл droneState другой вкладки, случай 21.08):
  //     содержимое ≠ базе → принять.
  if(remote.version === _stockVersion && _stockBase &&
     syncStockHash(remote.stock,remote.squads)!==syncStockHash(_stockBase.stock,_stockBase.squads)) return true;
  return false;
}
// Единая точка приёма облачного снимка склада. Локальная дельта относительно базы
// накладывается поверх (merge), иначе — чистая замена. Возвращает true, если локальная
// дельта была (вызывающий планирует пуш объединённого снимка).
function syncAcceptRemoteStock(remote){
  const hadDelta = !!(_stockBase && syncStockHash(state.stock,state.squads)!==syncStockHash(_stockBase.stock,_stockBase.squads));
  if(hadDelta){
    const before={stock:state.stock,squads:state.squads};
    const m=syncStockMerge3(_stockBase, before, remote);
    const ch=syncStockDiffKeys(before,m); // что изменилось в НАШЕМ состоянии (чужие правки + наложение дельты)
    state.stock=m.stock; state.squads=m.squads;
    console.warn('[SYNC] склад: облачный снимок новее — локальная дельта объединена (3-way merge)'+(ch.length?': '+ch.join('; '):''));
    // Аудируемый след: инцидент 05.09 восстанавливался только по суточному бэкапу листа —
    // сам merge нигде не логировался. Записей — единицы в неделю, кап actlog не страдает.
    if(ch.length) syncLogEvent('stock_merge','3-way merge склада (база '+(_stockBase.version||0)+', облако '+(remote.version||0)+', локаль '+_stockVersion+'): '+ch.join('; '));
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
    if(typeof lsWriteState==='function') lsWriteState(); else try{ localStorage.setItem('droneState',JSON.stringify(state)); }catch(e){ console.error('[STORAGE] write failed', e&&e.name); }
  }
}
// Дешёвая проверка серверных метаданных склада (пустые дельты read_since): ts — серверное
// время последней записи (stock_updated_ts); version/chain — серверная версия и цепочка
// последних версий (Backend v7.8; на старом бэкенде 0/[]). null — проверить не удалось.
async function syncFetchStockMeta(){
  const {url,token}=syncGetCfg(); if(!url||!token) return null;
  try{
    const d=await syncFetchJson(url+'?action=read_since&since=9000000000000000&token='+encodeURIComponent(token)+'&_='+Date.now(), SYNC_GET_TIMEOUT_MS);
    if(!d||d.error) return null;
    return { ts:+d.stock_updated_ts||0, version:+d.stock_version||0, chain:Array.isArray(d.stock_chain)?d.stock_chain.map(Number):[] };
  }catch(e){ return null; }
}
async function syncFetchStockTs(){ const m=await syncFetchStockMeta(); return m?m.ts:null; }
// Полный облачный снимок склада → {stock,squads,version,ts} | null (ts — серверное время строк)
async function syncFetchStockSnapshot(){
  const {url,key,token}=syncGetCfg(); if(!url||!token) return null;
  try{
    const d=await syncFetchJson(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(), SYNC_READ_TIMEOUT_MS);
    if(!d||d.error) return null;
    const stock=await syncDecryptRows(d.stock||[],key,'stock');
    const squads=(await syncDecryptRows(d.squads||[],key,'squads')).map(sq=>({...sq,drones:Array.isArray(sq.drones)?sq.drones:[]}));
    const ts=Math.max(0, ...(d.stock||[]).map(r=>+r.ts||0), ...(d.squads||[]).map(r=>+r.ts||0));
    // K2 (R0): часть строк склада не расшифровалась — снимок ЧАСТИЧНЫЙ. Принять его = затереть
    // локальный склад, подтвердить им пуш = ложь. Для вызывающих это «прочитать не удалось».
    // Ключ сменили во время чтения — снимок старым ключом к текущему не относится.
    if(syncKeyChanged(key)||syncStockUnreadable()) return null;
    syncNoteStockRead(key);
    return {stock,squads,version:syncStockMaxSv(stock,squads),ts};
  }catch(e){ return null; }
}

// Выход из «склад облака не читается» (второе ревью R0, K2): лист склада записан ЧУЖИМ ключом
// (устройство со старым ключом после перешифровки) — устройство с верным ключом его не прочтёт и
// штатно не перепишет (выгрузка склада без читаемого снимка запрещена). Из консоли, только учётка
// admin, с устройства с верным ключом и актуальным складом: без аргумента — план (что прочитано,
// что будет записано), (true) — записать СВОЙ снимок склада поверх облачного. Нечитаемый облачный
// склад при этом теряется — только осознанно, после syncAuditEncryption().
async function syncStockOverwriteCloud(confirm_=false){
  if(typeof isAdminAccount==='function' && !isAdminAccount()){ console.warn('[SYNC] только учётка admin'); return null; }
  const {url,key,token}=syncGetCfg();
  if(!url||!token){ console.warn('[SYNC] облако не настроено'); return null; }
  if(syncReadOnly()){ console.warn('[SYNC] запись сейчас запрещена'+(typeof updWriteBlockedText==='function'?': '+updWriteBlockedText():'')); return null; }
  // Свежее чтение: склад облака действительно не читается, а flights/transfers — читаются (ключ верен)
  const d=await syncFetchJson(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(), SYNC_READ_TIMEOUT_MS);
  if(!d||d.error){ console.warn('[SYNC] чтение облака не удалось', d&&d.error); return null; }
  for(const sh of ['flights','transfers','stock','squads']) await syncDecryptRows(d[sh]||[], key, sh);
  if(syncKeyChanged(key)) return null;
  const plan={ cloudStockRows:(d.stock||[]).length, cloudSquadRows:(d.squads||[]).length, unreadable:syncKeyBlockedInfo(),
    keyOk:!syncKeyBlocked(), localStock:(state.stock||[]).length, localSquads:(state.squads||[]).length };
  console.log('[SYNC] перезапись склада облака — план:', plan);
  if(syncKeyBlocked()){ console.warn('[SYNC] отказ: flights/transfers не читаются — неверный ключ У ЭТОГО устройства'); return plan; }
  if(!syncStockUnreadable()){ console.warn('[SYNC] отказ: склад облака читается — перезапись не нужна (штатная синхронизация)'); return plan; }
  if(!confirm_) return plan;
  const meta=await syncFetchStockMeta();
  if(!meta){ console.warn('[SYNC] метаданные склада не получены — повторите'); return plan; }
  syncBumpStockVersion();
  const ts=Date.now();
  const enc=async(obj,i)=>{ if(!obj.id) obj.id=ts+i; obj._sv=_stockVersion; return syncEncrypt(obj,key); };
  const stock=await Promise.all((state.stock||[]).map(enc)), squads=await Promise.all((state.squads||[]).map(enc));
  const pushed={stock:JSON.parse(JSON.stringify(state.stock||[])),squads:JSON.parse(JSON.stringify(state.squads||[])),version:_stockVersion};
  // CAS по текущей версии сервера: параллельная запись склада (кем-то ещё) → отказ, а не затирание
  const body=JSON.stringify({action:'write',token,data:geoStripFromSync({stock,squads}),stock_version:pushed.version,stock_expect:meta.version||0});
  const res=await syncPost(url,body);
  if(!res.ok){ console.warn('[SYNC] перезапись склада не выполнена:', res.error); return {...plan, written:false, error:res.error}; }
  syncStockSetBase(pushed.stock,pushed.squads,pushed.version); syncStockClearPending(pushed.version);
  if(res.data&&+res.data.ts>0) _lastStockTs=+res.data.ts;
  delete _syncUndecryptable.stock; delete _syncUndecryptable.squads; _stockReadKey=key; _stockUnreadTs=0; _syncStockUnreadLogged=false;
  try{ if(typeof lsWriteState==='function') lsWriteState(); }catch(e){}
  syncLogEvent('stock_overwrite','Склад облака перезаписан снимком этого устройства (облачный не расшифровывался: '+plan.unreadable+'); версия '+pushed.version+(res.unverified?' (ответ не прочитан)':''));
  return {...plan, written:true, version:pushed.version, unverified:!!res.unverified};
}

// --- Время последнего поллинга ---
let _lastPollTs = Date.now();
// _lastStockTs — СЕРВЕРНОЕ время последней виденной записи склада (stock_updated_ts / ts строк).
// Никогда не клиентское: смешение часов после каждой полной синхронизации открывало гейт
// поллинга на собственную запись (серверный ts на ~2.5 с позже клиентского bump — форензика 06.09).
// 0 = ещё ничего не видели: первый поллинг прочитает снимок и сверится с версией (дёшево, один раз).
let _lastStockTs = 0;

// ============================================================
// ЗАПИСЬ ИЗМЕНЕНИЙ — единая точка входа для всех операций
// ============================================================

// Добавить вылет — кэшируем в очередь, сразу пробуем отправить (если есть сеть)
async function syncAddFlight(flight){
  // По РОЛИ, а не syncReadOnly(): вызывающий уже прошёл guardWrite, но между ним и этой строкой
  // бывает await (диалог дубля) — устройство могло стать «устаревшим» (update.js). Тихий return
  // здесь потерял бы вылет; вместо этого он сохраняется и ждёт в очереди обновления.
  if(syncIsViewer()) return; // viewer не добавляет вылеты
  if(!flight.id) flight.id = genId('f');
  state.flights.unshift(flight);
  saveLocal();
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;                          // локальный режим — облака нет, очередь не нужна
  pendingQueue.add({type:'flight', data:flight});   // кэш до подтверждения доставки
  if(!navigator.onLine||syncWriteBlockedByVersion()) return; // нет сети / версия устарела — ждёт в очереди
  if(syncWritesPaused()) return; // идёт перешифровка облака — ждёт в очереди (уйдёт после неё)
  await trySendQueueItem({type:'flight', data:flight}, url, key, token);
}

// Удалить вылет — tombstone + полная запись
async function syncDeleteFlight(idx){
  const f = state.flights[idx];
  if(!f) return;

  const pLow=(f.pilot||'').toLowerCase();
  const dLow=(f.drone||'').toLowerCase();

  // Компенсация наличия перенесена НИЖЕ — она делается по фактически снятым
  // loss-записям, а не по флагу f.returned (04.09.2026, блокер §2а диагностики):
  // осиротевшая запись при returned='yes' снималась без компенсации, а легаси-вылет
  // без записи компенсировался «в воздух» (движения не было — возвращать нечего).

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

  // Нестрогие проходы не должны забирать запись, которая принадлежит ДРУГОМУ живому вылету
  // (04.09.2026): раньше это стирало чужое движение, а теперь ещё и вернуло бы борт в наличие.
  // + для вылета после черты — не замороженная до-чертовая запись (ревью R0, _lossFreeFor в app.js)
  const notOthers = typeof _lossFreeFor==='function'
    ? t => _lossFreeFor(t,f)
    : t => !(t.flightId && t.flightId!==f.id && state.flights.some(x=>x.id===t.flightId));

  // Проход 2: пилот + борт + дата + время (регистронезависимо)
  if((state.transfers||[]).length===before){
    removedTransfers = removeLoss(t=>
      t.type==='loss' &&
      (t.pilot||'').toLowerCase()===pLow &&
      (t.drone||'').toLowerCase()===dLow &&
      t.date===f.date &&
      t.time===f.time &&
      notOthers(t)
    );
  }

  // Проход 3: пилот + борт + дата (без времени — для вылетов,
  // чьё время менялось после первичной записи потери)
  if((state.transfers||[]).length===before){
    removedTransfers = removeLoss(t=>
      t.type==='loss' &&
      (t.pilot||'').toLowerCase()===pLow &&
      (t.drone||'').toLowerCase()===dLow &&
      t.date===f.date &&
      notOthers(t)
    );
  }

  // Компенсация наличия — РОВНО по снятым записям о потере (симметрия ledger↔qty).
  // Ноль снятых записей при returned='no' — это легаси-вылет без движения (долг 42
  // потерь, МАРШРУТ): наличие не трогаем, но говорим об этом вслух, а не молчим.
  const restored = (typeof _compensateRemovedLosses==='function')
    ? _compensateRemovedLosses(removedTransfers) : 0;
  if(restored){
    syncBumpStockVersion();
    setTimeout(()=>syncPushStockSquads(), 300);
  } else if(f.returned==='no' && f.drone && f.pilot){
    const msg='Удалён вылет-потеря без записи о потере в журнале движений ('+f.pilot+' / '+f.drone+' / '+(f.date||'')+') — наличие не изменено: возвращать нечего.';
    console.warn('[учёт] '+msg);
    if(typeof showSyncToast==='function') showSyncToast('⚠ '+msg, 8000);
  }

  // tombstone и для вылета, и для удалённых loss-передач — чтобы неразрушающий
  // merge в syncPushAll/pollCloud/syncPullAll не вернул их из облака обратно.
  // Путь Б: пометить локально + опубликовать удаление в облачный лист tombstones
  // (доставка с ретраем) — чтобы удаление дошло до других устройств.
  syncPublishTombstones([f.id],'flights'); // лист — для неоднозначных легаси-id (TOMB_AMBIGUOUS)
  syncPublishTombstones(removedTransfers.map(t=>t.id),'transfers');
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
  if(syncIsViewer()) return; // viewer не пишет передачи (по роли — см. syncAddFlight)
  if(!op.id) op.id = genId('t');
  if(op && (op.geo_points_db||op.geo||op.color_key)) return; // ГЕО не синхронизируется
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;                       // локальный режим — облака нет, очередь не нужна
  pendingQueue.add({type:'transfer', data:op});  // кэш до подтверждения доставки
  if(!navigator.onLine||syncWriteBlockedByVersion()) return; // версия устарела — ждёт в очереди
  if(syncWritesPaused()) return; // идёт перешифровка облака — ждёт в очереди
  await trySendQueueItem({type:'transfer', data:op}, url, key, token);
}

// Отправить склад и расчёты (last-write-wins)
// Сериализация + схлопывание пушей склада: параллельные вызовы (setTimeout 300/500 мс из
// разных функций) раньше могли перегонять друг друга; теперь — по одному, повторный вызов
// во время пуша планирует ровно один дополнительный прогон.
let _stockPushChain = Promise.resolve(), _stockPushQueued = false;
// Пуш склада в полёте (запланирован или идёт). Читает update.js: автоперезагрузка в этот
// момент оборвала бы merge/подтверждение (неподтверждённый пуш переживает перезагрузку
// через _stockPending, но пре-чек и слияние лучше не рвать без нужды).
let _stockPushPending = 0;
function syncStockPushBusy(){ return _stockPushPending>0; }
function syncPushStockSquads(){
  if(_stockPushQueued) return _stockPushChain;
  _stockPushQueued = true;
  _stockPushPending++;
  _stockPushChain = _stockPushChain
    .then(()=>{ _stockPushQueued=false; return _syncPushStockSquadsNow(); })
    .catch(e=>console.warn('[SYNC] stock push error:', e&&e.message))
    .finally(()=>{ _stockPushPending--; });
  return _stockPushChain;
}
async function _syncPushStockSquadsNow(){
  if(syncReadOnly()) return; // viewer не выгружает склад
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;
  if(syncWritesPaused()) return; // идёт перешифровка облака — дельта остаётся (база не сдвинута)
  // Последнее чтение ЭТИМ ключом видело нечитаемый склад облака — лист целиком не переписываем (выход —
  // syncStockOverwriteCloud у admin); смена ключа сбрасывает счётчики, новое чтение их обновит
  if(syncStockUnreadable()) return;
  // Защита от LWW-гонки: чужая запись склада, которой мы ещё не видели? Тогда сначала
  // принять её (с наложением нашей дельты), и только потом писать объединённый снимок.
  // Ревью R0 (K2): лист склада пишется ЦЕЛИКОМ — вслепую писать нельзя. Метаданные не получены →
  // не пишем (повтор позже; раньше — запись вслепую). Снимок облака ещё не читался ЭТИМ ключом в
  // сессии (F5, смена ключа) → читаем, даже если отметка времени не сдвинулась: устройство со старым
  // ключом иначе переписало бы весь склад облака чужим ключом. Снимок не читается → не пишем.
  const meta = await syncFetchStockMeta();
  if(!meta){ syncStockScheduleRepush(_stockVersion); return; }
  const remoteTs = meta.ts;
  const mustRead = _stockReadKey!==key;
  if(remoteTs > _lastStockTs || mustRead){
    const remote = await syncFetchStockSnapshot();
    if(syncKeyChanged(key)) return; // ключ сменили во время чтения — повтор новым ключом придёт сам
    if(syncKeyBlocked()||syncStockUnreadable()) return; // K2: облачный склад не читается (целиком — ключ, частично — неполный снимок) — не писать
    if(!remote){ syncStockScheduleRepush(_stockVersion); return; } // снимок не прочитан (сеть) — не писать вслепую
    // Без базы (первый пуш после обновления) дельту не вычислить — приём облака затёр бы только что
    // сделанную правку; снимок здесь нужен лишь для проверки читаемости, дальше — прежнее поведение.
    if(!_stockBase){ if(remoteTs > _lastStockTs) _lastStockTs = remoteTs; }
    else {
    if(remote && syncStockRemoteIsNewer(remote)){
      const hadDelta = syncAcceptRemoteStock(remote);
      showSyncToast(hadDelta ? '⚠ Склад изменён на другом устройстве — изменения объединены' : '↓ Склад обновлён с другого устройства', 5000);
      if(typeof renderInventory==='function') try{ renderInventory(); renderDashboard(); }catch(e){}
      if(hadDelta) syncStockSelfCheck('merge перед выгрузкой склада');
      if(!hadDelta){ _lastStockTs = Math.max(_lastStockTs, remoteTs); return; } // нашей дельты нет — пушить нечего
    }
    _lastStockTs = Math.max(_lastStockTs, remoteTs);
    }
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
  // Снимок, который РЕАЛЬНО уходит (id/_sv уже проставлены): база := он, а не state в момент
  // подтверждения — операция оператора во время POST иначе попадала в базу, не побывав в облаке.
  const pushed = { stock: JSON.parse(JSON.stringify(state.stock)), squads: JSON.parse(JSON.stringify(state.squads)), version: _stockVersion,
                   expect: (_stockBase && _stockBase.version) || 0 };
  const data = geoStripFromSync({stock, squads}); // ГЕО (geo_points_db) НИКОГДА не уходит в облако
  // v7.8: stock_version/stock_expect — серверный compare-and-swap (старый бэкенд их игнорирует)
  const body = JSON.stringify({action:'write', token, data, stock_version:pushed.version, stock_expect:pushed.expect});
  syncStockSetPending(pushed,'inflight');
  const res = await syncPost(url, body);
  if(!res.ok){
    if(res.serverError && res.data && res.data.error==='stock_conflict'){
      // v7.8 CAS: облако ушло дальше нашей базы, запись НЕ сделана. Перечитать снимок, принять
      // (наша дельта наложится merge'ем на актуальное), повторить пуш. Если в цепочке версий есть
      // наш прежний неподтверждённый пуш — сначала база := он (точное подтверждение).
      console.warn('[SYNC] stock push: конфликт версий (облако '+res.data.current+', ожидали '+pushed.expect+') — перечитываю снимок');
      syncLogEvent('stock_conflict','пуш склада '+pushed.version+' отклонён сервером: облако '+res.data.current+', ожидали '+pushed.expect);
      await syncStockResolveConflict(res.data, pushed);
      return;
    }
    console.warn('[SYNC] stock push failed:', res.error);
    syncStockSetPending(pushed,'send_failed');
    syncStockScheduleRepush(pushed.version);
    return;
  }
  // ПОДТВЕРЖДЕНИЕ — только тождеством, никогда неравенством времени (форензика 06.09):
  // (a) ответ writeAll {status:'ok',ts} атомарен с записью, ts = будущий stock_updated_ts;
  let srvTs=null, how='';
  if(res.data && res.data.status==='ok' && +res.data.ts>0){ srvTs=+res.data.ts; how='ответом сервера'; }
  else {
    // (b) ответ нечитаем (no-cors/HTML): подтверждаем ТОЖДЕСТВОМ версии снимка облака
    const snap = await syncFetchStockSnapshot();
    if(snap && snap.version===pushed.version){ srvTs=snap.ts||null; how='снимком (версия совпала)'; }
    else if(snap && snap.version>pushed.version){
      // Облако ушло дальше: кто-то записал после нас. Легла ли наша запись — точно знает только
      // цепочка версий v7.8; без неё считаем, что легла (слепая чужая запись поверх нашей
      // несевшей требует двух отказов транспорта подряд), и говорим об этом вслух.
      const m2 = await syncFetchStockMeta();
      const inChain = !!(m2 && m2.chain.length && m2.chain.includes(pushed.version));
      const assumed = !(m2 && m2.chain.length);
      if(inChain || assumed){ syncStockSetBase(pushed.stock,pushed.squads,pushed.version); syncStockClearPending(pushed.version); }
      const msg='облако ушло дальше пуша '+pushed.version+' (версия '+snap.version+'): '+(inChain?'наш пуш в цепочке версий — подтверждён':(assumed?'цепочки версий нет — считаем пуш доставленным':'наш пуш НЕ в цепочке — не доставлен'));
      console.warn('[SYNC] stock push: '+msg);
      syncLogEvent(inChain?'stock_confirm':(assumed?'stock_assumed_landed':'stock_not_landed'), msg);
      if(syncStockRemoteIsNewer(snap)){
        const had=syncAcceptRemoteStock(snap);
        if(typeof renderInventory==='function') try{ renderInventory(); renderDashboard(); }catch(e){}
        if(had){ syncStockSelfCheck('merge после обгона пуша'); syncStockScheduleRepush(pushed.version); }
      }
      return;
    }
    else if(snap && snap.version<pushed.version){
      console.warn('[SYNC] stock push: запись в облако НЕ легла (версия облака '+snap.version+' < '+pushed.version+') — повтор');
      showSyncToast('⚠ Склад не записан в облако — повторяю', 5000);
      syncStockSetPending(pushed,'not_landed');
      syncStockScheduleRepush(pushed.version);
      return;
    }
    else {
      // Сеть: подтвердить нечем. База и _lastStockTs НЕ трогаются; следующее чтение снимка
      // (поллинг/полная синхронизация) подтвердит по версии (syncStockRebaseOwn) — без merge.
      console.warn('[SYNC] stock push: доставка не подтверждена (сеть) — база не сдвинута, подтверждение по версии при следующем чтении');
      showSyncToast('⚠ Склад: доставка в облако не подтверждена — проверю при следующей синхронизации', 5000);
      syncStockSetPending(pushed,'unverified');
      return;
    }
  }
  if(srvTs) _lastStockTs = srvTs;
  syncStockSetBase(pushed.stock, pushed.squads, pushed.version);
  syncStockClearPending(pushed.version);
  if(typeof lsWriteState==='function') lsWriteState(); else try{ localStorage.setItem('droneState',JSON.stringify(state)); }catch(e){ console.error('[STORAGE] write failed', e&&e.name); } // _sv строк в droneState (сверка при загрузке)
  console.log('[SYNC] stock+squads OK, sv:', pushed.version, '(подтверждено '+how+')');
}
// v7.8: сервер отклонил запись склада (compare-and-swap) — облако новее нашей базы.
async function syncStockResolveConflict(info, pushed){
  const chain=Array.isArray(info&&info.chain)?info.chain.map(Number):[];
  const prev=_stockPending && _stockPending.version<pushed.version ? _stockPending : null;
  if(prev && chain.includes(prev.version)){ // прежний неподтверждённый пуш лёг — база := он
    syncStockSetBase(prev.stock,prev.squads,prev.version);
    syncLogEvent('stock_confirm','пуш склада '+prev.version+' подтверждён цепочкой версий сервера');
  }
  syncStockClearPending();
  const snap=await syncFetchStockSnapshot();
  if(!snap){ if(!syncKeyBlocked()&&!syncStockUnreadable()) syncStockScheduleRepush(pushed.version); return; } // K2: при неверном ключе / нечитаемом складе не повторять
  if(syncStockRemoteIsNewer(snap)){
    const had=syncAcceptRemoteStock(snap);
    if(typeof renderInventory==='function') try{ renderInventory(); renderDashboard(); }catch(e){}
    if(had) syncStockSelfCheck('merge после конфликта версий');
  }
  if(_stockBase && syncStockHash(state.stock,state.squads)!==syncStockHash(_stockBase.stock,_stockBase.squads)) syncStockScheduleRepush(pushed.version, 500);
}

// Отправить полный снимок (flights + transfers).
// НЕРАЗРУШАЮЩИЙ: перед записью доливаем из облака flights/transfers, которых нет
// локально (merge по id, исключая tombstones) — чтобы полный write не стёр чужие
// записи, ещё не полученные поллингом. Локальные данные при этом не теряются:
// итоговый снимок = (локальное) ∪ (облачное) − (удалённое локально).
// Обёртка: счётчик «полная выгрузка в полёте» (автообновление версии не перезагружает посреди неё)
// и снятие метки невыгруженных правок — только при подтверждённой записи (ответ сервера прочитан)
// и если за время выгрузки не было новой правки (поколение то же).
let _fullPushBusy=0;
function syncFullPushBusy(){ return _fullPushBusy>0; }
// Однопоточная (раунд 2): при появлении связи после офлайн-входа досыл звали сразу несколько
// точек — шли 2–3 параллельные полные выгрузки (каждая = полный read + полный write). Вызов во
// время выгрузки ставит ОДИН повтор после неё (правка могла появиться) и ждёт его.
let _pushAllRun=null, _pushAllAgain=false;
function syncPushAll(silent=false){
  if(_pushAllRun){ _pushAllAgain=true; return _pushAllRun; }
  _pushAllRun=(async()=>{
    let ok;
    try{ do{ _pushAllAgain=false; ok=await _syncPushAllOnce(silent); }while(_pushAllAgain); return ok; }
    finally{ _pushAllRun=null; }
  })();
  return _pushAllRun;
}
async function _syncPushAllOnce(silent){
  const gen=syncDirtyGen();
  _fullPushBusy++;
  try{
    const ok=await _syncPushAllNow(silent);
    if(ok===true&&gen) syncClearDirty(gen);
    return ok;
  }finally{ _fullPushBusy--; }
}
async function _syncPushAllNow(silent=false){
  if(syncReadOnly()) return; // viewer не пишет в облако (ambient-write в т.ч.)
  if(syncWritesPaused()) return false; // идёт перешифровка облака — метка правок остаётся, досыл после
  const {url,key,token} = syncGetCfg();
  if(!url) return;
  if(!silent) syncIndicator('syncing');

  // Merge с облаком. Если чтение не удалось — пишем как есть (деградация к прежнему
  // поведению), append-записи всё равно дублируются через pendingQueue. После черты —
  // не пишем вовсе (см. ниже, защита от воскрешения).
  let mergedOk = false;
  // Сырые нерасшифрованные строки облака (меньшинство — чужой ключ/битые): возвращаются в облако
  // КАК ЕСТЬ, иначе полная запись (облако ∪ локаль) стирала бы их (ревью R0).
  let rawKeepF = [], rawKeepT = [];
  if(token){
    try{
      const d = await syncFetchJson(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(), SYNC_READ_TIMEOUT_MS);
      if(d.error) throw new Error(d.error);
      syncMergeCloudTombstones(d.tombstones); // Путь Б: подтянуть чужие удаления ДО merge
      const tb = tombstones.load();
      const badF = [], badT = [];
      const [cloudFRaw, cloudTRaw] = await Promise.all([
        syncDecryptRows(d.flights||[], key, 'flights', badF),
        syncDecryptRows(d.transfers||[], key, 'transfers', badT)
      ]);
      // K2 (R0): облачные записи не расшифровываются этим ключом — полная запись стёрла бы их
      // (облако ∪ локаль видит только расшифрованное). Не пишем вовсе, метка правок остаётся.
      if(syncKeyBlocked()){
        console.warn('[SYNC] pushAll остановлен: облачные записи не расшифровываются ('+syncKeyBlockedInfo()+')');
        if(!silent) syncIndicator('error');
        return false;
      }
      if(syncKeyChanged(key)){ console.warn('[SYNC] pushAll: ключ сменили во время чтения — выгрузка отложена'); if(!silent) syncIndicator('error'); return false; }
      // Сырые строки: без id не адресуемы; удалённые (tombstone) — не возвращаем; есть локально —
      // локальная версия того же id вытесняет сырую (устройство сменило ключ и выгрузило заново).
      const localIdsStr = arr => new Set((arr||[]).map(x=>x&&x.id).filter(x=>x!=null&&x!=='').map(String));
      const keepRaw = (bad, local, sheet) => { const seen=new Set(); return bad.filter(r=>{
        if(!r||r.id==null||r.id==='') return false; const s=String(r.id);
        if(seen.has(s)||local.has(s)||tb.hasIn(sheet,r.id)) return false; seen.add(s); return true;
      }).map(r=>({id:r.id, data:r.data})); };
      rawKeepF = keepRaw(badF, localIdsStr(state.flights), 'flights');
      rawKeepT = keepRaw(badT, localIdsStr(state.transfers), 'transfers');
      if(rawKeepF.length||rawKeepT.length) console.warn('[SYNC] pushAll: нерасшифрованные строки облака сохранены как есть — flights '+rawKeepF.length+', transfers '+rawKeepT.length);
      // Дедуп дубль-строк облака — иначе обе копии одного id пройдут фильтр !localFIds
      const cloudF=syncDedupeById(cloudFRaw), cloudT=syncDedupeById(cloudTRaw);
      const localFIds = new Set(state.flights.map(f=>f.id).filter(Boolean));
      const addF = cloudF.filter(f=>f.id && !localFIds.has(f.id) && !tb.hasIn('flights',f.id));
      const localTIds = new Set((state.transfers||[]).map(t=>t.id).filter(Boolean));
      const addT = cloudT.filter(t=>t.id && !localTIds.has(t.id) && !tb.hasIn('transfers',t.id));
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
      // После черты: до-чертовые записи, которых нет в облаке, — воскрешение; не выгружаем
      const rawIds=rows=>new Set((rows||[]).map(r=>r&&r.id).filter(x=>x!=null&&x!=='').map(String));
      if(syncDropStaleLocal(rawIds(d.flights), rawIds(d.transfers), 'полная выгрузка')){ try{ saveLocalQuiet(); }catch(e){} }
      mergedOk = true;
    }catch(e){
      console.warn('[SYNC] pushAll merge пропущен (чтение не удалось):', e.message);
    }
  }
  // После черты полная выгрузка БЕЗ сверки с облаком запрещена: без облачного списка id
  // воскрешённую до-чертовую запись не отличить, а writeAll заменяет лист целиком.
  // Новые записи всё равно доезжают очередью (append_one), правки — следующей выгрузкой.
  if(!mergedOk && typeof marshrutCutTs==='function' && marshrutCutTs()){
    console.warn('[SYNC] pushAll пропущен: облако не прочитано, а черта проведена');
    if(!silent) syncIndicator('error');
    return false;
  }
  // Без чтения нельзя и когда облако в этой сессии текущим ключом ещё не читалось (листы целиком
  // легли бы чужим ключом), и когда последнее чтение видело нечитаемые строки flights/transfers
  // (их нечем сохранить — стёрли бы). Ревью R0.
  const unreadFT = ['flights','transfers'].some(s=>_syncUndecryptable[s]&&_syncUndecryptable[s].bad>0);
  const neverRead = !_syncUndecryptable.flights;
  if(!mergedOk && (neverRead || unreadFT)){
    console.warn('[SYNC] pushAll пропущен: облако не прочитано, а '+(neverRead?'текущим ключом оно в этой сессии ещё не читалось':'в облаке есть нерасшифрованные строки'));
    if(!silent) syncIndicator('error');
    return false;
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
  const [flightsEnc,transfersEnc] = await Promise.all([
    Promise.all(state.flights.map(f=>encRow(f))),
    Promise.all((state.transfers||[]).map(t=>encRow(t)))
  ]);
  const flights=[...flightsEnc, ...rawKeepF], transfers=[...transfersEnc, ...rawKeepT];
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
  // 'unverified' (no-cors: ответ не прочитан) — истинно для вызывающих, но метку правок не снимает
  return res.ok ? (res.unverified ? 'unverified' : true) : false;
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
  // После черты — только если в этой сессии state уже сверен с облаком (иначе в полном
  // write листа flights мог бы уйти воскрешённый до-чертовый вылет). Флаг вернётся
  // ближайшей полной выгрузкой.
  if(!_syncStaleChecked && typeof marshrutCutTs==='function' && marshrutCutTs()){
    console.warn('[SYNC] flights-only push отложен: state ещё не сверен с облаком после черты');
    return;
  }
  // Лист пишется целиком без чтения: при непроверенном ключе записали бы его чужим ключом, а
  // нерасшифрованные строки flights стёрли бы (сохранять их умеет только полная выгрузка —
  // saveLocal после поллинга её и так планирует). Идёт перешифровка — тоже нет. Ревью R0.
  if(!_syncUndecryptable.flights || syncWritesPaused() || _syncUndecryptable.flights.bad>0){
    console.warn('[SYNC] flights-only push отложен до полной выгрузки (облако этим ключом не читалось / нечитаемые строки / перешифровка)');
    return;
  }
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
// Отправка СЕРИАЛИЗОВАНА (25.09.2026): вызовы идут из публикации, поллинга (30 с),
// полной выгрузки, события online — раньше их циклы шли параллельно, а lastTryTs
// ставится только ПОСЛЕ ответа сервера, поэтому ещё не отправленный элемент уходил
// из каждого цикла. На очереди 226 tombstone'ов (~3 с на append) это дало 44 лишние
// строки в облачном листе (сервер без LockService — v7.8 не выложен — дубль не ловит).
// Вызов во время прогона ставит ОДИН повторный прогон после него (новые элементы не ждут поллинга).
let _flushRun=null, _flushAgain=false;
function syncFlushQueue(){
  if(_flushRun){ _flushAgain=true; return _flushRun; }
  _flushRun=(async()=>{
    try{ do{ _flushAgain=false; await _syncFlushQueueOnce(); }while(_flushAgain); }
    finally{ _flushRun=null; }
  })();
  return _flushRun;
}
async function _syncFlushQueueOnce(){
  let q = pendingQueue.all();
  if(!q.length) return;
  const {url,key,token} = syncGetCfg();
  if(!url||!token||!navigator.onLine) return;
  // Удалённая запись, так и не доехавшая до облака (удалили раньше, чем подтвердилась
  // доставка): с Backend v7.10 сервер её отвергнет, а read не вернёт — подтверждения не будет
  // никогда. Снимаем из очереди сами; её tombstone уходит отдельным элементом и остаётся.
  const tb = tombstones.load();
  const dead = q.filter(x=>(x.type==='flight'||x.type==='transfer'||!x.type) && x.data && x.data.id!=null && tb.hasIn(x.type==='flight'?'flights':'transfers', x.data.id));
  if(dead.length){
    dead.forEach(x=>pendingQueue.remove(_qid(x)));
    console.log('[QUEUE] снято удалённых до доставки:', dead.length);
    q = pendingQueue.all();
  }
  // Версия устарела / смешанная загрузка: данные НЕ шлём (сервер отклонит, а клиент изобразил
  // бы «отправку»), элементы остаются в очереди до обновления. actlog — можно (как наблюдателю).
  // K1 (R0): и наблюдатель (устройство, пониженное до viewer, с очередью из прежней роли) — сервер такие
  // записи отклоняет, элементы висели бы, ретраясь вечно. Они остаются в очереди (доедут, если роль вернут).
  const blocked = syncWriteBlockedByVersion() || syncIsViewer();
  // Перешифровка облака идёт — стоит всё: элемент, дописанный между её чтением и записью, лёг бы
  // старым ключом (ревью R0).
  if(syncWritesPaused()) return;
  const now = Date.now();
  for(const item of q){
    if(blocked && item.type!=='actlog') continue;
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
    const d = await syncFetchJson(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(), SYNC_READ_TIMEOUT_MS);
    if(d.error) throw new Error(d.error);
    syncNoteMinBuild(d); // контроль версии (v7.10): минимальная сборка клиента
    const loaded = {
      // flights/transfers — дедуп по id: дубль-строки облака иначе попадут в журнал
      // парой при полной замене (pollCloud дедупит сам, полная загрузка — нет)
      flights:   syncDedupeById(await syncDecryptRows(d.flights||[], key, 'flights')),
      stock:     await syncDecryptRows(d.stock||[], key, 'stock'),
      squads:    (await syncDecryptRows(d.squads||[], key, 'squads')).map(sq=>({...sq,drones:Array.isArray(sq.drones)?sq.drones:[]})),
      transfers: syncDedupeById(await syncDecryptRows(d.transfers||[], key, 'transfers')),
      users: d.users||[]
    };
    // Ключ сменили, пока шло чтение, — прочитанное старым ключом к текущему не относится (ревью R0).
    // При блоке по ключу вызывающие ничего не применяют (syncPullOnLogin/syncFromCloud).
    if(syncKeyChanged(key)){ console.warn('[SYNC] pullAll: ключ сменили во время чтения — результат отброшен'); return null; }
    syncNoteStockRead(key);
    // Открытые id ВСЕХ строк облака (в т.ч. нерасшифрованных) — для защиты от воскрешения
    // до-чертовых записей (syncDropStaleLocal): «нет в облаке» решается по ним, а не по расшифрованным
    const rawIds=rows=>new Set((rows||[]).map(r=>r&&r.id).filter(x=>x!=null&&x!=='').map(String));
    loaded.cloudIds={f:rawIds(d.flights), t:rawIds(d.transfers)};
    // Путь Б: подтянуть облачные tombstones (чужие удаления) в локальный набор ДО
    // фильтрации — иначе удалённое на другом устройстве здесь бы не скрылось.
    loaded.tombstoneIds = syncMergeCloudTombstones(d.tombstones);
    // actingRole (замещение, v0.26): освежить из блока users — назначение/снятие
    // доезжает планово (5 мин) без перелогина. Рантайм-вызов функции app.js.
    if(typeof syncApplyActingRole==='function') syncApplyActingRole(loaded.users);
    // Фильтруем tombstones (и удалённые вылеты, и удалённые loss-передачи)
    const tb = tombstones.load();
    loaded.flights   = loaded.flights.filter(f=>!tb.hasIn('flights',f.id));
    loaded.transfers = loaded.transfers.filter(t=>!tb.hasIn('transfers',t.id));
    // Актлог
    if(d.actlog&&d.actlog.length){
      const entries = await syncDecryptRows(d.actlog, key, 'actlog');
      // Признаки «устройство на чужом ключе» — по открытому id, без расшифровки (ревью R0)
      const got=new Set(entries.map(e=>e&&e.id));
      d.actlog.forEach(r=>{ if(!got.has(r.id)){ const km=syncKeyMismatchEntry(r); if(km) entries.push(km); } });
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
    // Отметка «эту запись склада видели» — СЕРВЕРНОЕ время строк (колонка ts readAll), не
    // клиентский _sv: тот на ~2.5 с меньше серверного ts, и после каждой полной синхронизации
    // гейт поллинга «открывался» на нашу же запись (форензика 06.09). Повторная расшифровка не нужна.
    if(d.stock&&d.stock.length){ _lastStockTs = Math.max(_lastStockTs, ...d.stock.map(r=>+r.ts||0)); }
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
  // Наблюдатель выгрузить правку не может — метка у него бессмысленна и навсегда отрезала бы
  // правки существующих записей из облака (устройство, пониженное до viewer; ревью v0.29, раунд 2).
  if(syncIsViewer()) syncClearDirty();
  // Метку фиксируем ДО чтения облака: выгрузка, закончившаяся, пока читаем, снимет её, а снимок
  // облака при этом сделан ДО выгрузки — заменить им локальное значит откатить правку (раунд 2).
  const dirtyAtStart = syncHasDirty(), genAtStart = syncDirtyGen();
  const loaded = await syncPullAll(false);
  if(!loaded){ syncIndicator('error'); return; }
  // K2 (ревью R0): облако не читается этим ключом — прочитанное неполно (почти пусто). Ничего не
  // применяем: ни вылеты/передачи, ни склад (пустой снимок иначе стал бы базой и после смены
  // ключа выгрузился бы поверх настоящего склада). Локальное остаётся как есть до смены ключа.
  if(syncKeyBlocked()){
    console.warn('[SYNC] полная синхронизация не применена: облако не расшифровывается этим ключом ('+syncKeyBlockedInfo()+')');
    if(pendingQueue.all().length) setTimeout(()=>syncFlushQueue(), 1000); // actlog уходит и так
    syncIndicator('error');
    return;
  }
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
  // K1 (R0): у наблюдателя очередь данных «заморожена» (отправить её он не может) — не должна навсегда
  // переключать полную загрузку в ветку слияния, иначе правки существующих записей до него не доходят.
  const hasPending = !syncIsViewer() && pendingQueue.all().length > 0;
  // Невыгруженные правки существующих записей (метка SYNC_DIRTY_KEY) — как непустая очередь:
  // заменять локальное облачным нельзя, иначе правка откатится (ревью v0.29).
  const dirty = dirtyAtStart || syncHasDirty() || syncDirtyGen()!==genAtStart || syncFullPushBusy();
  // Склад/расчёты — last-write-wins по _sv. Берём из облака ТОЛЬКО если версия
  // облака новее локальной — иначе затрём несохранённые локальные правки
  // (stock/squads НЕ кэшируются в pendingQueue, поэтому "нет pending" ещё не значит
  //  "локальные данные склада уже выгружены").
  const remoteStock = {stock:loaded.stock, squads:loaded.squads, version:syncStockMaxSv(loaded.stock,loaded.squads)};
  // Гейт приёма: версия новее ИЛИ равная с иным содержимым, чем база (см. блок LWW выше).
  // Снимок с нечитаемыми строками — неполный: не принимать и базу им не перебазировать (ревью R0).
  const stockNewer = !syncStockUnreadable() && syncStockRemoteIsNewer(remoteStock);
  let stockDelta = false;
  if(!hasPending && !dirty){
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
    // Непустая очередь без «pending» — это очередь наблюдателя (K1: только actlog). Раньше её
    // досылала лишь ветка слияния; у наблюдателя нет 30-секундного поллинга, и неудачно
    // отправленная запись аудита висела до F5 (ревью R0). Фильтр по типам — в самой очереди.
    if(pendingQueue.all().length) setTimeout(()=>syncFlushQueue(), 1000);
  } else {
    // Есть несинхронизированное — сливаем только новое из облака
    console.log('[SYNC] '+(hasPending?'pending queue not empty':'невыгруженные правки')+', merging only new records');
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
  // После черты: до-чертовые записи вне облака и вне очереди — воскрешение (ветка localOnly
  // выше их сохранила бы и saveLocal → syncPushAll вернул бы их в облако). Снимаем здесь.
  if(loaded.cloudIds) syncDropStaleLocal(loaded.cloudIds.f, loaded.cloudIds.t, 'полная синхронизация');
  if(stockDelta){ syncStockSelfCheck('merge при полной синхронизации'); setTimeout(()=>syncPushStockSquads(), 800); } // объединённый снимок — в облако
  saveLocal({noDirty:true}); // сохранение загруженного — не правка оператора (метку не ставит; выгрузка по-прежнему следом)
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
  // Ревью R0: принудительная загрузка заменяет state и ОЧИЩАЕТ очередь. Если облако не
  // читается этим ключом (или склад в облаке частично нечитаем), прочитанное неполно — замена
  // стёрла бы локальные данные и очередь, которые блокировка как раз держит. Отказ.
  if(syncKeyBlocked()||syncStockUnreadable()){
    const why=syncKeyBlocked()&&typeof updWriteBlockedText==='function'
      ? updWriteBlockedText()
      : 'В облаке есть нерасшифрованные строки ('+syncKeyBlockedInfo()+') — снимок неполный.';
    if(st){ st.textContent='Загрузка отменена: облако не читается полностью'; st.style.color='var(--red)'; }
    syncIndicator('error');
    alert('Загрузка из облака отменена — локальные данные и очередь не тронуты.\n\n'+why);
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
  syncClearDirty(); // принудительная загрузка: облако авторитетно, локальные правки отброшены осознанно
  saveLocal({noDirty:true});
  syncIndicator('ok');
  syncRenderAll();
  if(st){ st.textContent='✓ Загружено — '+new Date().toLocaleTimeString('ru'); st.style.color='var(--green2)'; }
  renderSettingsStatus();
  showSyncToast('✓ Данные загружены из облака');
}

// Принудительная выгрузка вручную (кнопка)
async function syncToCloud(silent=false){
  if(syncReadOnly()){
    // Текст — по фактической причине: «устарел»/смешанная загрузка/ключ, а не только «наблюдатель» (ревью R0)
    if(!silent) alert(syncIsViewer()||typeof updWriteBlockedText!=='function'||!syncWriteBlockedByVersion()
      ? 'Роль «Наблюдатель» — только просмотр, выгрузка недоступна'
      : updWriteBlockedText());
    return;
  }
  const ok = await syncPushAll(silent);
  if(!ok && !silent) alert('Ошибка синхронизации. Проверьте соединение.');
}

// ============================================================
// ПОЛЛИНГ — только дельта каждые 30 сек
// ============================================================

// Поллинг однопоточный: при таймаутах 25+60 с интервал 30 с иначе накладывал попытки друг на друга
// (третий раунд ревью R0) — лишний трафик на слабой связи отнимал канал у отправки вылетов.
let _pollBusy=false, _stockSnapBackoffUntil=0, _stockDeltaRetryAt=0, _deltaKeySuspectAt=0;
async function pollCloud(){
  if(_pollBusy) return;
  _pollBusy=true;
  try{ await _pollCloudOnce(); } finally{ _pollBusy=false; }
}
async function _pollCloudOnce(){
  const {url,key,token} = syncGetCfg();
  if(!url||!token) return;
  const ind = document.getElementById('syncIndicator');
  let deltaBad=0, deltaTotal=0; // нечитаемые строки flights/transfers в дельте (подозрение на ключ)
  try{
    const since = _lastPollTs;
    const d = await syncFetchJson(url+'?action=read_since&token='+encodeURIComponent(token)+'&since='+since+'&_='+Date.now(), SYNC_GET_TIMEOUT_MS);
    if(d.error){ console.warn('[POLL]', d.error); return; }
    syncNoteMinBuild(d); // контроль версии (v7.10): узнаём о минимуме ДО попытки записи
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
      if(row && row.data && row.data!=='#ERROR!'){ deltaTotal++; if(!obj) deltaBad++; }
      if(!obj) continue;
      deliveredIds.add(obj.id);
      if(tb.hasIn('flights',obj.id)) continue; // Удалён локально
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
      if(row && row.data && row.data!=='#ERROR!'){ deltaTotal++; if(!obj) deltaBad++; }
      if(!obj) continue;
      deliveredIds.add(obj.id);
      if(tb.hasIn('transfers',obj.id)) continue; // удалена локально (напр. loss-передача удалённого вылета)
      if(!(state.transfers||[]).some(t=>t.id===obj.id)){
        if(!state.transfers) state.transfers=[];
        state.transfers.unshift(obj);
        changed = true;
      }
    }

    // Актлог
    for(const row of (d.actlog||[])){
      if(row.id) deliveredIds.add(row.id); // подтверждение по открытому id (см. flights выше) — иначе испорченная (#ERROR!) login-запись висела бы в очереди вечно
      let obj = await syncDecrypt(row, key);
      if(!obj) obj = syncKeyMismatchEntry(row); // признак «чужой ключ» — по открытому id (ревью R0)
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

    // Склад обновился у другого пользователя (или это наша же запись, ещё не «увиденная»)
    let stockMerged=false;
    if(d.stock_updated_ts && d.stock_updated_ts > _lastStockTs && d.stock_updated_ts !== _stockUnreadTs && Date.now() >= _stockSnapBackoffUntil){
      console.log('[POLL] Склад обновился, загружаем');
      try{
        const d2 = await syncFetchJson(url+'?action=read&token='+encodeURIComponent(token)+'&_='+Date.now(), SYNC_READ_TIMEOUT_MS);
        if(d2.error) throw new Error(d2.error);
        const remoteStock  = await syncDecryptRows(d2.stock||[], key, 'stock');
        const remoteSquads = (await syncDecryptRows(d2.squads||[], key, 'squads')).map(sq=>({...sq,drones:Array.isArray(sq.drones)?sq.drones:[]}));
        // Ревью R0: снимок с нечитаемыми строками (неверный ключ — почти пустой) НЕ принимать и
        // базу им не перебазировать: после смены ключа пустая база «подтвердила» бы частичный
        // state, и выгрузка стёрла бы склад в облаке. Считаем как неудачное чтение (гейт не сдвигаем).
        if(syncKeyChanged(key)) throw new Error('ключ сменили во время чтения');
        if(syncKeyBlocked()||syncStockUnreadable()){
          // Не сдвигаем гейт (выгрузка склада перечитает и откажет), но и не перечитываем этот же
          // снимок каждые 30 с — до его изменения или смены ключа.
          _stockUnreadTs = d.stock_updated_ts;
          throw new Error('снимок склада не расшифровывается целиком ('+syncKeyBlockedInfo()+')');
        }
        syncNoteStockRead(key);
        const remote = {stock:remoteStock, squads:remoteSquads, version:syncStockMaxSv(remoteStock,remoteSquads)};
        // Гейт: версия новее ИЛИ равная с иным содержимым, чем база (равная версия со штампом
        // наших строк = наш пуш → перебазирование без merge внутри syncStockRemoteIsNewer).
        if(syncStockRemoteIsNewer(remote)){
          const hadDelta = syncAcceptRemoteStock(remote);
          changed = true; stockMerged = hadDelta;
          console.log('[POLL] Склад обновлён, версия:', _stockVersion, hadDelta?'(+локальная дельта → пуш)':'');
          if(hadDelta) setTimeout(()=>syncPushStockSquads(), 500);
        }
        // Гейт сдвигаем ТОЛЬКО после успешного чтения и обработки снимка. Раньше — до чтения:
        // один упавший read закрывал гейт до 5-минутной синхронизации (форензика 06.09).
        _lastStockTs = d.stock_updated_ts;
        pollCloud._snapFail = 0;
      }catch(e){
        console.warn('[POLL] stock sync error:', e.message);
        pollCloud._snapFail = (pollCloud._snapFail||0)+1;
        // После 5 отказов подряд — пауза полных чтений снимка до плановой полной синхронизации (5 мин).
        // Гейт _lastStockTs при этом НЕ сдвигается (раньше сдвигался вслепую): выгрузка склада сама
        // перечитает облако перед записью. Третий раунд ревью R0: условие «склад уже читался этим
        // ключом» отключало предохранитель, и на слабой связи полное чтение шло каждые 30 с.
        if(pollCloud._snapFail>=5){
          _stockSnapBackoffUntil = Date.now() + 5*60*1000; pollCloud._snapFail = 0;
          console.warn('[POLL] снимок склада не читается 5 поллингов подряд — пауза до полной синхронизации');
        }
      }
    }
    // Самопроверка после событий, способных развести наличие и журнал (только рост расхождений)
    const prunedLoss = syncPruneStateByTombstones.lastLoss||0; syncPruneStateByTombstones.lastLoss=0;
    if(stockMerged) syncStockSelfCheck('merge склада при поллинге');
    else if(prunedLoss) syncStockSelfCheck('снята запись о потере по чужому tombstone');

    // Подтверждаем доставку отправленного: весь полный список id из ответа read_since
    // убираем из очереди СРАЗУ и обновляем индикатор (не ждём re-send/QUEUE_RETRY).
    pendingQueue.confirmDelivered(deliveredIds);
    updateQueueIndicator();
    // Досылаем то, что ещё не подтверждено (с защитой от частых повторов)
    syncFlushQueue();
    // Невыгруженная дельта склада (пре-чек выгрузки не получил метаданных/снимок, автоповтор исчерпан) —
    // дослать, не чаще раза в минуту. Раньше её досылала только следующая операция, online или F5
    // (третий раунд ревью R0): журнал движений уже в облаке, а остатки — нет.
    try{
      const stockDelta=!!_stockBase&&syncStockHash(state.stock,state.squads)!==syncStockHash(_stockBase.stock,_stockBase.squads);
      // Пуш «в полёте»/«не подтверждён» ждёт подтверждения чтением (перебазирование без merge) — не повторяем
      const waitConfirm=!!_stockPending&&(_stockPending.reason==='inflight'||_stockPending.reason==='unverified');
      if(stockDelta && !waitConfirm && !syncStockPushBusy() && !syncReadOnly() && Date.now()>=_stockDeltaRetryAt && Date.now()>=_stockSnapBackoffUntil){ // в паузе полных чтений — не досылаем (пре-чек читал бы снимок)
        _stockDeltaRetryAt=Date.now()+60000;
        syncPushStockSquads();
      }
    }catch(e){}
    // Большинство новых строк flights/transfers в дельте не расшифровывается этим ключом — вероятно,
    // облако перешифровали. Дельта блок не ставит (строк мало), но запускает полное перечтение, которое
    // поставит блок, если это правда (не чаще раза в 5 минут; третий раунд ревью R0).
    if(deltaBad>0 && deltaBad*2>=deltaTotal && Date.now()>=_deltaKeySuspectAt){
      _deltaKeySuspectAt=Date.now()+5*60*1000;
      console.warn('[POLL] новые записи облака не расшифровываются этим ключом ('+deltaBad+' из '+deltaTotal+') — перечитываю облако');
      try{ showSyncToast('⚠ Новые записи облака не расшифровываются этим ключом — проверяю ключ', 8000); }catch(e){}
      try{ syncKeyRecheck(); }catch(e){}
    }

    if(changed){
      saveLocal({noDirty:true}); // принято из облака — не правка оператора
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
  // По РОЛИ, а не по syncReadOnly(): устройство с устаревшей версией (update.js) тоже
  // «только чтение», но поллинг ему нужен — узнать, что минимум снят, и видеть свежие данные.
  const viewer = syncIsViewer();
  if(!viewer){
    window._pollInterval = setInterval(()=>{
      const {url,token} = syncGetCfg();
      if(url&&token&&navigator.onLine&&!syncIsViewer()) pollCloud();
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
    if(!navigator.onLine||syncWritesPaused())return; // нет сети / идёт перешифровка — досыл позже
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
