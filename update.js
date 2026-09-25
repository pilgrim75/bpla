(globalThis.__FILE_BUILDS=globalThis.__FILE_BUILDS||{})['update.js']=2026092504; // сборка файла — ставит tools/bump-version.js, руками не править
// update.js — контроль версии клиента и PWA (выпуск v0.29, 25.09.2026). Грузится перед app.js.
// Проект: _НЕ_ПУБЛИКОВАТЬ/ПРОЕКТ_контроль_версии_2026-09-25.md. Повод — форензика 25.09:
// давно открытая вкладка со старым кодом переписала облако и вернула удалённое; «Ctrl+F5
// на всех устройствах после выкладки» держалось только на дисциплине.
//
// Что здесь:
//  1. «Смешанная загрузка» — каждый свой файл несёт штамп сборки (первая строка, ставит
//     tools/bump-version.js), index.html — <meta name="app-build">, style.css — --app-build.
//     Расхождение с APP_BUILD (version.js) = новый index со старым sync.js (или наоборот):
//     запись в облако отключается, одна автоповторная загрузка на 10 минут.
//  2. Мягкий уровень — version.json: при старте, раз в 5 минут, при возврате на вкладку.
//     Новая сборка → перезагрузка, ТОЛЬКО когда безопасно (appUnsavedReasons в app.js +
//     фокус/недавний ввод + пуш склада), иначе баннер «Обновить» и автопопытка каждые 30 с.
//     Защита от петли: после перезагрузки сборка всё ещё старая (кэш/CDN отстаёт) —
//     автоперезагрузка приостанавливается на 10 минут (метка в sessionStorage).
//  3. Жёсткий уровень — min_client_build (Backend v7.10): приходит в read/read_since (sync.js →
//     updSetMinBuild) и в ответе client_outdated на POST. Сборка ниже минимума — режим
//     «версия устарела, только чтение»: syncReadOnly()=true, guardWrite() отказывает,
//     красная полоса с кнопкой «Обновить». Очередь отправки НЕ трогается — доедет после обновления.
//  4. Service worker (sw.js) — офлайн-открытие и доставка новой сборки без Ctrl+F5.
//     Новый SW ждёт; страница активирует его (SKIP_WAITING), когда перезагрузка безопасна.
//  5. Установка PWA (Настройки → «Установить на компьютер») и админ-карточка
//     «Минимальная версия клиента» (Администратор → Данные).
// Модуль НЕ обращается к глобалям app.js на верхнем уровне — только в рантайме (app.js грузится
// последним); верхний уровень — только константы, состояние и слушатели beforeinstallprompt.

// Файлы со штампом сборки — тот же список, что в tools/bump-version.js (его --check сверяет).
const UPD_STAMPED=['sync.js','geo.js','parser.js','reports.js','writeoff.js','marshrut.js','vtx.js','update.js','app.js'];
const UPD_CHECK_EVERY_MS=5*60*1000;   // плановая проверка version.json (как полная синхронизация)
const UPD_RETRY_SAFE_MS=30*1000;      // пока есть несохранённое — перепроверять условия (без сети)
const UPD_IDLE_MS=30*1000;            // «ввод был недавно» — не перезагружать под пальцами
const UPD_LOOP_HOLD_MS=10*60*1000;    // пауза автоперезагрузок, если она не помогла (CDN отстаёт)
const UPD_VISIBLE_MIN_MS=60*1000;     // не чаще раза в минуту по visibilitychange
const UPD_FETCH_TIMEOUT_MS=15000;
const UPD_SS_RELOAD='upd_reload', UPD_SS_HOLD='upd_hold_until', UPD_SS_MIXED='upd_mixed_reload';

let _updMinBuild=0;        // min_client_build сервера (0 — проверка выключена)
let _updOutdated=false;    // APP_BUILD < _updMinBuild
let _updMixed=null;        // {files:[…]} — файлы разных сборок в этой вкладке
let _updNew=null;          // {build,version,notes,reasons} — на сервере есть сборка новее
let _updChecking=false, _updLastCheck=0, _updLastInput=0, _updRetryTimer=null;
let _updSwReg=null, _updSwWaiting=null, _updSwBuild=0, _updReloadOnCtl=false;
let _updInstallEvt=null, _updOutdatedLogged=false, _updServerInfo=null;

function updBuild(){ return (typeof APP_BUILD==='number')?APP_BUILD:0; }
function updVersion(){ return (typeof APP_VERSION==='string')?APP_VERSION:'?'; }
// sessionStorage бывает недоступен (приватный режим/запрет сайта) — метки петли тогда просто не работают
function _updSS(op,k,v){
  try{
    if(op==='get')return sessionStorage.getItem(k);
    if(op==='set')sessionStorage.setItem(k,v); else sessionStorage.removeItem(k);
  }catch(e){}
  return null;
}

// ===== Запрет записи (читают sync.js/syncReadOnly и app.js/guardWrite) =====
// K2 (R0): ключ не расшифровывает данные облака (sync.js, syncKeyBlocked) — тоже «только чтение»
function _updKeyBlocked(){ try{ return typeof syncKeyBlocked==='function'&&syncKeyBlocked(); }catch(e){ return false; } }
function updWriteBlocked(){ return _updOutdated||!!_updMixed||_updKeyBlocked(); }
function updWriteBlockedText(){
  if(_updKeyBlocked())return 'Это устройство НЕ МОЖЕТ РАСШИФРОВАТЬ данные облака своим ключом (не читается: '+(typeof syncKeyBlockedInfo==='function'?syncKeyBlockedInfo():'')+') — неверный ключ шифрования или ключ сменили. Запись отключена, чтобы не стереть эти записи и не перешифровать их чужим ключом.\n\nПроверьте ключ: Настройки → Шифрование (ключ — из ссылки администратора). Записи в очереди отправки не потеряются.';
  if(_updMixed)return 'Файлы приложения загрузились из РАЗНЫХ сборок (незавершённая выкладка или кэш браузера) — запись отключена, чтобы не испортить данные.\n\nОбновите страницу (Ctrl+F5). Если не помогает — сообщите администратору.';
  return 'Версия приложения устарела: сборка '+updBuild()+', сервер принимает не ниже '+_updMinBuild+'. Запись отключена.\n\nОбновите страницу — кнопка «Обновить» в красной полосе или F5. Записи в очереди отправки не потеряются.';
}

// Минимальная сборка от сервера. src: 'read' (GET read/read_since), 'post' (отказ client_outdated),
// 'version' (GET ?action=version), 'admin' (только что выставлена админом).
function updSetMinBuild(v,src){
  // null/нечисло = «сервер не сказал» (v7.10 отдаёт null в ?action=version, если meta не
  // прочиталась) — состояние не меняем. Раньше null превращался в 0 и снимал блокировку (ревью v0.29).
  if(v===null||v===undefined||v==='')return;
  const n=Number(v);
  if(!Number.isFinite(n))return;
  const min=n>0?Math.floor(n):0;
  _updMinBuild=min;
  const was=_updOutdated;
  _updOutdated=min>0&&updBuild()<min;
  if(_updOutdated===was){ if(_updOutdated)updRenderBars(); return; }
  if(_updOutdated){
    console.warn('[UPD] сборка '+updBuild()+' ниже минимальной '+min+' ('+src+') — запись в облако отключена');
    // Один раз за сессию — в журнал действий (actlog сервер принимает и от устаревших клиентов):
    // админ видит, какое устройство нужно обновить.
    if(!_updOutdatedLogged){
      _updOutdatedLogged=true;
      try{ if(typeof logAction==='function')logAction('sync','outdated','Сборка '+updBuild()+' (v'+updVersion()+') ниже минимальной '+min+' — запись в облако отключена до обновления'); }catch(e){}
    }
    updRenderBars();
    updCheckVersion('outdated'); // новая сборка уже на сервере — попробовать обновиться сразу
  }else{
    console.log('[UPD] минимальная сборка '+(min||'выключена')+' — запись снова разрешена');
    updRenderBars();
    // Досылаем всё отложенное: очередь, невыгруженные правки, склад (sync.js)
    try{ if(typeof syncFlushLocalChanges==='function')syncFlushLocalChanges('unblock'); else if(typeof syncFlushQueue==='function')syncFlushQueue(); }catch(e){}
  }
}

// ===== 1. Смешанная загрузка =====
// Возвращает список расхождений со сборкой version.js (пусто — всё одной сборки).
function updCheckFileBuilds(names){
  const b=updBuild(), bad=[];
  const add=(n,txt)=>{ bad.push(n+' ('+txt+')'); if(names)names.push(n); };
  if(!b)add('version.js','нет APP_BUILD');
  const meta=document.querySelector('meta[name="app-build"]');
  const mv=meta?String(meta.getAttribute('content')||''):'';
  if(parseInt(mv,10)!==b)add('index.html',mv||'нет метки');
  const stamps=globalThis.__FILE_BUILDS||{};
  UPD_STAMPED.forEach(f=>{ if(stamps[f]!==b)add(f,stamps[f]||'нет штампа'); });
  let css='';
  try{ css=getComputedStyle(document.documentElement).getPropertyValue('--app-build').trim(); }catch(e){}
  if(parseInt(css,10)!==b)add('style.css',css||'нет штампа');
  return bad;
}
// Перед перезагрузкой из смешанной загрузки — перезапросить расходящиеся файлы МИМО HTTP-кэша.
// Проверено в браузере: во время неполной выкладки под НОВЫМ ?v= закэшировалось СТАРОЕ
// содержимое (Pages: max-age=600), и обычная перезагрузка берёт его из кэша браузера, даже не
// спрашивая сервис-воркер, — вкладка оставалась смешанной до 10 минут после догрузки файла.
// fetch(…,{cache:'reload'}) заменяет запись кэша свежей копией; index.html перепроверяется
// при перезагрузке и так.
// Адреса — ФАКТИЧЕСКИЕ из страницы (src/href с их ?v=), а не имя+APP_BUILD: если устарел сам
// version.js, APP_BUILD старый и дал бы адреса, которыми страница не пользуется (ревью v0.29).
// Устарел index.html (meta ≠ APP_BUILD) — перезапрашиваем version.js (он и расходится с index).
async function updRefreshStale(){
  if(!_updMixed||!Array.isArray(_updMixed.names))return;
  const want=new Set(_updMixed.names.filter(n=>/\.(js|css)$/.test(n)));
  if(_updMixed.names.indexOf('index.html')>=0)want.add('version.js');
  const urls=[];
  try{
    document.querySelectorAll('script[src],link[rel="stylesheet"][href]').forEach(el=>{
      const u=el.getAttribute('src')||el.getAttribute('href')||'';
      const file=u.split('?')[0].replace(/^\.\//,'').split('/').pop();
      if(want.has(file))urls.push(u);
    });
  }catch(e){}
  await Promise.all(urls.map(u=>{
    try{ return fetch(u,{cache:'reload'}).then(r=>r.arrayBuffer()).catch(()=>{}); }catch(e){ return null; }
  }));
}
function updInitMixed(){
  const names=[];
  const bad=updCheckFileBuilds(names);
  if(!bad.length){ _updSS('del',UPD_SS_MIXED); return; }
  _updMixed={files:bad,names};
  console.error('[UPD] СМЕШАННАЯ ЗАГРУЗКА: ожидается сборка '+updBuild()+', расходятся: '+bad.join(', ')+' — запись в облако отключена');
  updRenderBars();
  // Одна автоповторная загрузка за 10 минут: чаще всего это отставание CDN сразу после выкладки.
  // Метка «уже пробовали» — в sessionStorage; второй раз — только полоса с кнопкой.
  const last=+(_updSS('get',UPD_SS_MIXED)||0);
  if(Date.now()-last>UPD_LOOP_HOLD_MS&&navigator.onLine&&location.protocol!=='file:'){
    // Метка «попытка была» — прямо перед перезагрузкой; пока небезопасно (щелчок/ввод) — повторять,
    // иначе единственная попытка терялась от любого щелчка в первые секунды (раунд 2 ревью v0.29)
    const t0=Date.now();
    const attempt=async()=>{
      if(!updSafeToReload().safe){ if(Date.now()-t0<UPD_LOOP_HOLD_MS)setTimeout(attempt,UPD_RETRY_SAFE_MS); return; }
      _updSS('set',UPD_SS_MIXED,String(Date.now()));
      await updRefreshStale();
      try{ location.reload(); }catch(e){}
    };
    setTimeout(attempt,1500);
  }else{
    // Повторилось — выкладка неполная, а не кэш: пусть видно в журнале (раз за сессию вкладки)
    if(!_updSS('get','upd_mixed_logged')){
      _updSS('set','upd_mixed_logged','1');
      try{ if(typeof logAction==='function')logAction('sync','mixed_build','Файлы разных сборок (ожидается '+updBuild()+'): '+bad.join(', ')); }catch(e){}
    }
  }
}

// ===== 2. Мягкий уровень: version.json и безопасная перезагрузка =====
function updLoopGuardInit(){
  let r=null;
  try{ r=JSON.parse(_updSS('get',UPD_SS_RELOAD)||'null'); }catch(e){}
  if(!r)return;
  _updSS('del',UPD_SS_RELOAD);
  if(updBuild()>=(+r.to||0)){
    console.log('[UPD] обновлено: сборка '+r.from+' → '+updBuild());
    setTimeout(()=>{ try{ showSyncToast('✓ Приложение обновлено: v'+updVersion()+' (сборка '+updBuild()+')',5000); }catch(e){} },1500);
  }else{
    // Перезагрузка не помогла — CDN/HTTP-кэш ещё отдаёт старые файлы. Повторять сразу = петля.
    _updSS('set',UPD_SS_HOLD,String(Date.now()+UPD_LOOP_HOLD_MS));
    console.warn('[UPD] после перезагрузки сборка '+updBuild()+' < '+r.to+' — кэш отстаёт, автообновление приостановлено на 10 мин');
  }
}
function updHoldLeft(){ return Math.max(0,(+(_updSS('get',UPD_SS_HOLD)||0))-Date.now()); }

function _updIsTypingField(a){
  if(!a||a===document.body)return false;
  if(a.isContentEditable)return true;
  if(a.tagName==='TEXTAREA')return !a.readOnly&&!a.disabled;
  if(a.tagName!=='INPUT'||a.readOnly||a.disabled)return false;
  return !/^(checkbox|radio|button|submit|reset|range|file|color|image|hidden)$/i.test(a.type||'text');
}
// {safe, reasons[]} — можно ли перезагрузить страницу, не потеряв работу оператора
function updSafeToReload(){
  const r=[];
  try{ if(typeof appUnsavedReasons==='function')r.push(...appUnsavedReasons()); }catch(e){}
  try{ if(typeof syncStockPushBusy==='function'&&syncStockPushBusy())r.push('выгружается склад'); }catch(e){}
  if(_updIsTypingField(document.activeElement))r.push('курсор в поле ввода');
  if(Date.now()-_updLastInput<UPD_IDLE_MS)r.push('идёт ввод');
  return {safe:!r.length,reasons:r};
}
async function updReload(target,why){
  _updSS('set',UPD_SS_RELOAD,JSON.stringify({from:updBuild(),to:+target||0,ts:Date.now(),why:why||''}));
  console.log('[UPD] перезагрузка → сборка '+(target||'?')+' ('+(why||'')+')');
  if(_updMixed)await updRefreshStale(); // иначе кэш браузера вернул бы тот же старый файл
  try{ location.reload(); }catch(e){}
}
function _updScheduleRetry(ms){
  clearTimeout(_updRetryTimer);
  _updRetryTimer=setTimeout(()=>updTryApply('retry'),ms);
}
// Решение «перезагрузить сейчас или показать баннер». Вызывается при обнаружении новой сборки
// (version.json / новый SW) и повторно по таймеру, пока условия не станут безопасными.
function updTryApply(why){
  if(!_updNew)return;
  const hold=updHoldLeft();
  if(hold>0){ _updNew.reasons=[]; updRenderBars(); _updScheduleRetry(hold+1000); return; }
  const s=updSafeToReload();
  if(!s.safe){ _updNew.reasons=s.reasons; updRenderBars(); _updScheduleRetry(UPD_RETRY_SAFE_MS); return; }
  updApplyNow(why);
}
function updApplyNow(why){
  const target=_updNew?_updNew.build:0;
  // Ждёт SW новее страницы — сначала активировать его, перезагрузка по controllerchange (иначе
  // старый SW отдал бы навигацию, а новый так и остался бы в ожидании). Страховка — 4 с.
  if(_updSwWaiting&&(!_updSwBuild||_updSwBuild>updBuild()||(_updMixed&&_updSwBuild===updBuild()))){
    _updReloadOnCtl=true;
    try{ _updSwWaiting.postMessage({type:'SKIP_WAITING'}); }catch(e){}
    setTimeout(()=>{ if(_updReloadOnCtl){ _updReloadOnCtl=false; updReload(target,(why||'')+'/sw-timeout'); } },4000);
    return;
  }
  updReload(target,why);
}
// Кнопка «Обновить» в полосах — явное решение оператора: условия не ждём, но предупреждаем.
function updUserUpdate(){
  const s=updSafeToReload();
  const reasons=s.reasons.filter(x=>x!=='идёт ввод'&&x!=='курсор в поле ввода');
  if(reasons.length&&!confirm('Не сохранено: '+reasons.join(', ')+'.\n\nОбновить всё равно? Несохранённый ввод пропадёт (записи в очереди отправки сохранятся).'))return;
  _updSS('del',UPD_SS_HOLD);
  if(_updNew)updApplyNow('button'); else updReload(_updMinBuild||0,'button');
}

async function updCheckVersion(why){
  if(location.protocol==='file:'||!navigator.onLine||_updChecking)return null;
  // Смешанная загрузка: version.json совпадает со страницей, новости нет, но нужен воркер
  // этой сборки (его установка — проверка полноты выкладки). Просим браузер перепроверить sw.js.
  if(_updMixed&&_updSwReg)try{ _updSwReg.update().catch(()=>{}); }catch(e){}
  if(why==='visible'&&Date.now()-_updLastCheck<UPD_VISIBLE_MIN_MS)return null;
  _updChecking=true; _updLastCheck=Date.now();
  try{
    const ctrl=new AbortController(); const tid=setTimeout(()=>ctrl.abort(),UPD_FETCH_TIMEOUT_MS);
    let j;
    try{
      const r=await fetch('version.json?_='+Date.now(),{cache:'no-store',signal:ctrl.signal});
      if(!r.ok)return null;
      // Копия из кэша сервис-воркера (сеть недоступна) — не новость о сборке: перезагрузка
      // офлайн новую сборку всё равно не получит, а попытки упёрлись бы в паузу петли.
      if(r.headers&&typeof r.headers.get==='function'&&r.headers.get('X-SW-Fallback'))return null;
      j=await r.json();
    }finally{ clearTimeout(tid); }
    const b=parseInt(j&&j.build,10);
    if(!(b>0))return null;
    if(b>updBuild()){
      const fresh=!_updNew||_updNew.build!==b;
      _updNew={build:b,version:String(j.version||''),notes:String(j.notes||''),reasons:(_updNew&&_updNew.reasons)||[]};
      if(fresh)console.log('[UPD] на сервере новая сборка '+b+' (v'+_updNew.version+'), здесь '+updBuild());
      try{ if(_updSwReg)_updSwReg.update().catch(()=>{}); }catch(e){}
      updTryApply(why);
    }else{
      if(_updNew&&!_updSwWaiting){ _updNew=null; clearTimeout(_updRetryTimer); updRenderBars(); }
      if(b===updBuild())updCheckSwStale();
    }
    return b;
  }catch(e){ return null; } // нет сети/таймаут — тихо, повторим по расписанию
  finally{ _updChecking=false; }
}

// ===== 4. Service worker =====
function updRegisterSW(){
  if(!('serviceWorker' in navigator))return;
  if(!/^https?:$/.test(location.protocol))return;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    // Смена контроллера после НАШЕГО SKIP_WAITING — перезагрузка на новую сборку. Первая установка
    // SW (clients.claim) и активация из другой вкладки сюда тоже приходят — их пропускаем.
    if(!_updReloadOnCtl)return;
    _updReloadOnCtl=false;
    updReload((_updNew&&_updNew.build)||_updSwBuild,'sw');
  });
  // updateViaCache:'none' — браузер проверяет sw.js мимо HTTP-кэша (Pages отдаёт max-age=600)
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
    _updSwReg=reg;
    const track=w=>{ if(w)w.addEventListener('statechange',()=>{
      if(w.state==='installed'&&navigator.serviceWorker.controller)updOnSwWaiting(w);
    }); };
    if(reg.waiting&&navigator.serviceWorker.controller)updOnSwWaiting(reg.waiting);
    // Воркер мог начать установку ДО регистрации слушателя (браузер проверил sw.js при навигации) —
    // updatefound для него уже не придёт; без этого новый SW так и остался бы в ожидании (ревью v0.29).
    else if(reg.installing)track(reg.installing);
    reg.addEventListener('updatefound',()=>track(reg.installing));
  }).catch(e=>console.warn('[UPD] service worker не зарегистрирован:',e&&e.message));
}
// Забытый при выкладке sw.js ничем не проявлялся: онлайн страница новая (index из сети), а офлайн
// открывалась прошлая сборка из кэша старого воркера (ревью v0.29). Когда version.json совпадает
// со страницей, а активный воркер старше и нового не видно — просим браузер перепроверить sw.js
// и один раз за сессию пишем в журнал (sync/sw_stale): выкладку нужно доделать.
let _updSwStaleLogged=false;
async function updCheckSwStale(){
  try{
    if(_updSwStaleLogged||!_updSwReg||!('serviceWorker' in navigator))return;
    const ctl=navigator.serviceWorker.controller;
    if(!ctl||_updSwReg.installing||_updSwReg.waiting)return;
    const r=await _updSwAsk(ctl,{type:'GET_BUILD'});
    const b=(r&&+r.build)||0;
    if(!b||b>=updBuild())return;
    try{ await _updSwReg.update(); }catch(e){}
    setTimeout(async()=>{
      if(_updSwStaleLogged||_updSwReg.installing||_updSwReg.waiting)return;
      // За минуту воркер мог обновиться — перепроверить сборку контроллера (раунд 2 ревью v0.29)
      const c=navigator.serviceWorker.controller||_updSwReg.active;
      const r2=c&&await _updSwAsk(c,{type:'GET_BUILD'});
      if(r2&&+r2.build>=updBuild())return;
      _updSwStaleLogged=true;
      console.warn('[UPD] активный сервис-воркер сборки '+b+' старше страницы '+updBuild()+' — sw.js на сервере не обновлён?');
      try{ if(typeof logAction==='function')logAction('sync','sw_stale','Сервис-воркер сборки '+b+' при странице '+updBuild()+': sw.js не выложен или не обновился — офлайн откроется прошлая сборка'); }catch(e){}
    },60000);
  }catch(e){}
}
function _updSwAsk(w,msg,ms){
  return new Promise(res=>{
    try{
      const ch=new MessageChannel();
      const t=setTimeout(()=>res(null),ms||3000);
      ch.port1.onmessage=e=>{ clearTimeout(t); res(e.data); };
      w.postMessage(msg,[ch.port2]);
    }catch(e){ res(null); }
  });
}
async function updOnSwWaiting(w){
  _updSwWaiting=w;
  const r=await _updSwAsk(w,{type:'GET_BUILD'});
  _updSwBuild=(r&&+r.build)||0;
  // Смешанная загрузка + воркер ЭТОЙ сборки прошёл свою проверку (index, ?v и штампы совпали)
  // → у него согласованный набор файлов: активировать и ПЕРЕЗАГРУЗИТЬСЯ на него. Тихая
  // активация без перезагрузки (ветка ниже) оставила бы вкладку смешанной (проверено в браузере).
  if(_updMixed&&_updSwBuild===updBuild()){
    _updNew={build:_updSwBuild,version:updVersion(),notes:'',reasons:[]};
    updTryApply('sw-mixed');
    return;
  }
  if(_updSwBuild&&_updSwBuild<=updBuild()){
    // Страница уже на этой сборке (обновилась по version.json через старый SW) — новый SW просто
    // занимает место старого, перезагрузка не нужна.
    try{ w.postMessage({type:'SKIP_WAITING'}); }catch(e){}
    _updSwWaiting=null;
    return;
  }
  if(!_updNew||(_updSwBuild&&_updSwBuild>_updNew.build))_updNew={build:_updSwBuild,version:'',notes:'',reasons:[]};
  updTryApply('sw');
}

// ===== Полосы состояния =====
function updRenderBars(){
  if(typeof document==='undefined'||!document.body)return;
  const keyBad=_updKeyBlocked();
  const red=_updMixed||_updOutdated||keyBad;
  let bar=document.getElementById('updBar');
  if(red){
    if(!bar){ bar=document.createElement('div'); bar.id='updBar'; bar.className='upd-bar'; document.body.appendChild(bar); }
    // Коротко: полный список расходящихся файлов на телефоне занял бы полэкрана — он в подсказке и консоли
    const msg=_updMixed
      ?'⛔ Файлы приложения разных сборок ('+(_updMixed.files.length===1?_updMixed.files[0]:_updMixed.files.length+' шт., первый: '+_updMixed.files[0])+') — запись отключена. Обновите страницу (Ctrl+F5).'
      :_updOutdated
      ?'⛔ Версия устарела: сборка '+updBuild()+', сервер принимает не ниже '+_updMinBuild+' — запись в облако отключена; новые записи ждут в очереди, правки выгрузятся после обновления.'
      :'⛔ Данные облака не расшифровываются этим ключом (не читается: '+(typeof syncKeyBlockedInfo==='function'?syncKeyBlockedInfo():'')+') — запись отключена, чтобы их не стереть. Проверьте ключ шифрования.';
    // При неверном ключе обновление страницы не поможет — ведём в Настройки к полю ключа
    bar.innerHTML='<span class="upd-msg"></span> '+(!_updMixed&&!_updOutdated&&keyBad
      ?'<button class="btn btn-sm" onclick="showPage(\'settings\',document.querySelector(\'#nav button[onclick*=settings]\')||document.body)">Ключ — в Настройки</button>'
      :'<button class="btn btn-sm" onclick="updUserUpdate()">Обновить</button>');
    bar.querySelector('.upd-msg').textContent=msg;
    bar.title=_updMixed?_updMixed.files.join(', '):'';
  }else if(bar)bar.remove();

  let pill=document.getElementById('updPill');
  if(_updNew&&!red){
    if(!pill){ pill=document.createElement('div'); pill.id='updPill'; pill.className='upd-pill'; document.body.appendChild(pill); }
    const ver=_updNew.version?('v'+_updNew.version+' '):'';
    const hold=updHoldLeft();
    let msg='Доступна новая версия '+ver+'(сборка '+(_updNew.build||'?')+').';
    if(hold>0)msg+=' Сервер пока отдаёт старые файлы — повтор через '+Math.ceil(hold/60000)+' мин.';
    else if(_updNew.reasons&&_updNew.reasons.length)msg+=' Обновится само, когда не будет несохранённого: '+_updNew.reasons.join(', ')+'.';
    else msg+=' Обновляется…';
    pill.innerHTML='<span class="upd-msg"></span> <button class="btn btn-sm btn-primary" onclick="updUserUpdate()">Обновить сейчас</button>';
    pill.querySelector('.upd-msg').textContent=msg;
  }else if(pill)pill.remove();
  _updLayoutBars();
}
// Полоса не должна прятаться под полосой переполнения хранилища (#lsQuotaBar, тоже сверху)
// и не закрывать шапку (роль, индикаторы синхронизации и очереди, «Выход»): пока полоса видна,
// содержимое .app сдвигается вниз на высоту полос (ревью v0.29). Зовётся и из lsQuotaWarn/lsQuotaOk.
function _updLayoutBars(){
  const bar=document.getElementById('updBar');
  const ls=document.getElementById('lsQuotaBar');
  const lsH=ls?ls.offsetHeight:0;
  if(bar)bar.style.top=lsH+'px';
  try{
    const app=document.querySelector('.app');
    if(app){ const h=(bar?bar.offsetHeight:0)+lsH; app.style.paddingTop=h?h+'px':''; }
  }catch(e){}
  // Плашка «новая версия» — над гео-полосой (#geoWarnBar живёт внизу экрана)
  const pill=document.getElementById('updPill');
  if(pill){ const g=document.getElementById('geoWarnBar'); pill.style.bottom=((g?g.offsetHeight:0)+16)+'px'; }
}

// ===== 5. Установка PWA и карточка «Приложение» (Настройки) =====
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault(); // своя кнопка в Настройках вместо баннера браузера
    _updInstallEvt=e;
    try{ updRenderAppCard(); }catch(_){}
  });
  window.addEventListener('appinstalled',()=>{
    _updInstallEvt=null;
    try{ updRenderAppCard(); showSyncToast('✓ Приложение установлено',4000); }catch(_){}
  });
}
function updIsStandalone(){
  try{ return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true; }catch(e){ return false; }
}
async function updInstall(){
  const e=_updInstallEvt;
  if(!e){ updRenderAppCard(); return; }
  _updInstallEvt=null;
  try{ e.prompt(); await e.userChoice; }catch(err){ console.warn('[UPD] установка:',err&&err.message); }
  updRenderAppCard();
}
function updRenderAppCard(){
  const info=document.getElementById('appVerInfo');
  if(info){
    const ctl=('serviceWorker' in navigator)&&!!navigator.serviceWorker.controller;
    info.textContent='v'+updVersion()+' · сборка '+updBuild()+' · офлайн-кэш: '+(ctl?'есть':'нет')+(updIsStandalone()?' · открыто как приложение':'');
  }
  const btn=document.getElementById('pwaInstallBtn'), st=document.getElementById('pwaInstallStatus');
  if(!btn||!st)return;
  if(updIsStandalone()){ btn.style.display='none'; st.textContent='✓ Приложение установлено и открыто в своём окне.'; return; }
  if(location.protocol==='file:'){ btn.style.display='none'; st.textContent='Установка доступна только с сайта (https://pilgrim75.github.io/bpla/).'; return; }
  if(_updInstallEvt){ btn.style.display=''; btn.disabled=false; st.textContent='Приложение откроется в отдельном окне и будет работать без сети (данные — те же, что в браузере).'; return; }
  btn.style.display='none';
  st.textContent='Браузер пока не предложил установку. Chrome/Edge: меню ⋮ → «Приложения» → «Установить АСУ БПЛА» (или значок установки в адресной строке). Если приложение уже установлено — откройте его с рабочего стола.';
}

// ===== 3. Админ-карточка «Минимальная версия клиента» (Администратор → Данные) =====
async function updFetchServerInfo(){
  if(typeof syncGetCfg!=='function')return null;
  const {url}=syncGetCfg(); if(!url)return null;
  try{
    const j=await syncFetchJson(url+'?action=version&_='+Date.now(),UPD_FETCH_TIMEOUT_MS);
    _updServerInfo=j||null;
    if(j&&j.min_client_build!==undefined)updSetMinBuild(j.min_client_build,'version');
    return j;
  }catch(e){ return null; }
}
function _updMb(id,text,kind){ try{ setStatus(id,text,kind||'muted'); }catch(e){ const el=document.getElementById(id); if(el)el.textContent=text; } }
async function updRenderMinBuildCard(){
  const card=document.getElementById('minBuildCard'); if(!card)return;
  const admin=typeof isAdminAccount==='function'&&isAdminAccount();
  card.style.display=admin?'':'none';
  if(!admin)return;
  const self=document.getElementById('mbSelf');
  if(self)self.textContent='v'+updVersion()+' · сборка '+updBuild();
  const btns=card.querySelectorAll('button[data-mb]');
  _updMb('mbServer','Сервер: запрос…');
  const j=await updFetchServerInfo();
  let ok=false;
  if(!j)_updMb('mbServer','Сервер не ответил — повторите позже','err');
  else if(j.min_client_build===undefined)_updMb('mbServer','Backend '+(j.backend||'?')+' не поддерживает минимальную сборку — нужен Backend v7.10','warn');
  else if(j.min_client_build===null)_updMb('mbServer','Backend '+(j.backend||'?')+' · минимум прочитать не удалось (лист meta) — повторите позже','warn');
  else{
    ok=true;
    const m=+j.min_client_build||0;
    _updMb('mbServer','Backend '+(j.backend||'?')+' · минимум: '+(m?(m+(m>updBuild()?' — ВЫШЕ этой сборки!':'')):'выключен'),m>updBuild()?'err':'ok');
  }
  btns.forEach(b=>{ b.disabled=!ok; });
}
async function updSetMinBuildServer(mode){
  if(typeof guardAdmin==='function'&&!guardAdmin())return;
  const me=updBuild();
  let v;
  if(mode==='current'){
    v=me;
    if(!confirm('Установить минимальную сборку клиента '+v+' (эта сборка, v'+updVersion()+')?\n\nУстройства со сборкой ниже перестанут писать в облако (только чтение с красной полосой), пока их не обновят. Отложенные записи у них не потеряются.'))return;
  }else if(mode==='off'){
    v=0;
    if(!confirm('Выключить проверку минимальной сборки? Писать смогут устройства на любой версии.'))return;
  }else{
    const raw=String((document.getElementById('mbInput')||{}).value||'').trim();
    if(!/^\d{1,10}$/.test(raw)){ _updMb('mbStatus','Номер сборки — только цифры (формат ГГГГММДДNN)','err'); return; }
    v=parseInt(raw,10);
    // Выше своей сборки нельзя: запись отключилась бы и у этого устройства (сервер тоже откажет).
    if(v>me){ _updMb('mbStatus','Нельзя выше этой сборки ('+me+')','err'); return; }
    if(!confirm('Установить минимальную сборку клиента '+v+'?'))return;
  }
  _updMb('mbStatus','Сохраняю…');
  const res=await _adminPost({action:'set_min_client_build',value:v});
  if(!res.ok){
    let err=String(res.error||'ошибка');
    if(/не знает эту операцию|Unknown/i.test(err))err='Сервер не знает эту операцию — нужен Backend v7.10';
    else if(/min_above_caller/.test(err))err='Сервер отказал: минимум выше сборки этого устройства';
    _updMb('mbStatus','Ошибка: '+err,'err');
    return;
  }
  try{ if(typeof logAction==='function')logAction('admin','min_client_build',v?('Минимальная сборка клиента: '+v):'Проверка минимальной сборки выключена'); }catch(e){}
  _updMb('mbStatus',res.unverified?'Отправлено (ответ не прочитан) — значение ниже проверено сервером':'✓ Сохранено','ok');
  await updRenderMinBuildCard();
}

// ===== Запуск (из app.js ПЕРЕД initAuth) =====
let _updInited=false;
function updInit(){
  if(_updInited)return;
  _updInited=true;
  updLoopGuardInit();
  updInitMixed();
  // Активность оператора: не только набор текста — выбор из списка/щелчок (quickPicker, селекты)
  // тоже означает «работает прямо сейчас» (ревью v0.29)
  ['input','keydown','pointerdown','change'].forEach(ev=>document.addEventListener(ev,()=>{ _updLastInput=Date.now(); },true));
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible')updCheckVersion('visible'); });
  window.addEventListener('online',()=>{ updCheckVersion('online'); });
  // Высота полосы меняется с шириной экрана (поворот телефона) — пересчитать отступ .app (раунд 2)
  window.addEventListener('resize',()=>{ try{ _updLayoutBars(); }catch(e){} });
  window.addEventListener('orientationchange',()=>{ try{ _updLayoutBars(); }catch(e){} });
  setInterval(()=>updCheckVersion('interval'),UPD_CHECK_EVERY_MS);
  setTimeout(()=>updCheckVersion('start'),3000);
  if(document.readyState==='complete')updRegisterSW(); else window.addEventListener('load',updRegisterSW);
  updRenderBars();
}

// Самозапуск, если app.js не дошёл до updInit (упал): при первом переходе v0.28→v0.29 старый
// app.js из кэша объявляет свой const APP_BUILD и с новым version.js падает целиком (SyntaxError) —
// без самозапуска смешанную загрузку никто бы не поймал и не вылечил (ревью v0.29).
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('load',()=>{
    setTimeout(()=>{
      if(_updInited)return;
      console.error('[UPD] app.js не запустил контроль версии — самозапуск');
      try{ updInit(); }catch(e){ console.error('[UPD] самозапуск:',e); }
    },2000);
  });
}
