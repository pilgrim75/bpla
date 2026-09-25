// sw.js — service worker АСУ БПЛА (PWA, выпуск v0.29).
//
// ГЛАВНЫЙ ИНВАРИАНТ: страница, собранная из кэша, ВСЕГДА принадлежит ОДНОЙ сборке.
// index.html и все его ассеты с ?v=BUILD лежат в ОДНОМ кэше 'bpla-'+BUILD и попадают туда
// только после проверки номера сборки (meta app-build у index, ?v у ссылок, штамп внутри файла).
// Поэтому офлайн никогда не соберёт старый index с новым sync.js (или наоборот): смешанная
// загрузка в этом приложении — это не косметика, а риск порчи учёта (разные версии логики
// синхронизации на одном устройстве). Отдельные кэши «под index» и «под ассеты» этого не
// гарантировали бы: их можно обновить по отдельности и получить рассинхрон.
'use strict';

// Строку ниже переписывает tools/bump-version.js (регулярка /const SW_BUILD=(\d+);/) —
// держать её ровно в этом виде и отдельной строкой. Изменение номера меняет байты sw.js,
// браузер видит новый воркер и ставит его рядом со старым (install → waiting).
const SW_BUILD=2026092504;

const CACHE_PREFIX='bpla-';
const CACHE_NAME=CACHE_PREFIX+SW_BUILD;

// Приложение живёт НЕ в корне домена (GitHub Pages: /bpla/), поэтому все адреса строим
// от scope регистрации, а не от '/'. Локально (python -m http.server) scope = корень — тоже работает.
const SCOPE=self.registration.scope;              // напр. 'https://pilgrim75.github.io/bpla/'
const SCOPE_URL=new URL(SCOPE);
const SCOPE_PATH=SCOPE_URL.pathname;              // '/bpla/'
// index кладётся под НОРМАЛИЗОВАННЫМ ключом без query: при входе по ссылке в адресе стоит
// токен (?u=&t=&k=&s=), и он не должен оказаться в ключе кэша никогда.
const INDEX_KEY=SCOPE+'index.html';
const VERSION_KEY=SCOPE+'version.json';

// Сеть для навигации ждём не дольше 5 с: на слабой связи (поле) лучше открыть рабочую
// сборку из кэша, чем держать белый экран; ответ сети всё равно докачается в фоне.
const NAV_TIMEOUT_MS=5000;

// Свои js со штампом первой строки: (globalThis.__FILE_BUILDS=…)['<имя>']=<N>;
const STAMPED_JS=['sync.js','geo.js','parser.js','reports.js','writeoff.js','marshrut.js','vtx.js','update.js','app.js'];

// Необязательное (best-effort): не версионируется через ?v, ошибка не валит установку —
// без иконки или шрифта приложение работает, без sync.js — нет.
const EXTRAS=[
  'manifest.json','favicon.ico','LOGO.jpg',
  'icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png',
  'icons/fonts/tabler-icons.woff2','icons/fonts/tabler-icons.woff'
];

// Бэкенд (Apps Script → script.googleusercontent.com) и AI (api.anthropic.com) — НИКОГДА
// не кэшируем и не перехватываем: это данные учёта и платные вызовы. Они и так чужого
// origin, проверка по хосту — вторая страховка на случай прокси/переезда.
const FOREIGN_HOST_RE=/google|googleusercontent|anthropic/i;

const RE_META_TAG=/<meta\b[^>]*\bname\s*=\s*(?:"app-build"|'app-build'|app-build(?=[\s\/>]))[^>]*>/i;
const RE_META_CONTENT=/\bcontent\s*=\s*["']?\s*(\d+)/i;
const RE_FILE_STAMP=/^\(globalThis\.__FILE_BUILDS=globalThis\.__FILE_BUILDS\|\|\{\}\)\['([^']+)'\]=(\d+);/m;
const RE_APP_BUILD=/const APP_BUILD=(\d+);/;
const RE_CSS_BUILD=/--app-build:(\d+)/;

const TIMEOUT=Symbol('timeout');

// ============================================================ утилиты

function decodeUtf8(buf){
  return new TextDecoder('utf-8').decode(new Uint8Array(buf));
}

// Путь относительно scope без query ('' — сам scope), либо null, если адрес вне приложения.
function scopeRel(url){
  if(url.origin!==SCOPE_URL.origin) return null;
  if(url.pathname.indexOf(SCOPE_PATH)!==0) return null;
  return url.pathname.slice(SCOPE_PATH.length);
}

// Номер сборки из <meta name="app-build" content="N"> (порядок атрибутов любой) или null.
function readMetaBuild(html){
  const tag=RE_META_TAG.exec(html);
  if(!tag) return null;
  const c=RE_META_CONTENT.exec(tag[0]);
  return c?Number(c[1]):null;
}

// Все относительные same-origin src/href с параметром v из index.html.
// Комментарии и тела inline-скриптов вырезаем: закомментированный <script src="…?v=старый">
// или строка в JS не должны ни валить установку, ни попадать в кэш.
function extractVersionedAssets(html, baseUrl){
  const clean=html
    .replace(/<!--[\s\S]*?-->/g,'')
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi,'$1$2');
  const re=/\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  const out=[], seen=new Set();
  let m;
  while((m=re.exec(clean))){
    const raw=(m[1]!==undefined?m[1]:(m[2]!==undefined?m[2]:m[3])).trim().replace(/&amp;/g,'&');
    if(!raw) continue;
    let u;
    try{ u=new URL(raw, baseUrl); }catch(e){ continue; }
    if(scopeRel(u)===null) continue;              // чужой origin / вне приложения / data: / javascript:
    if(!u.searchParams.has('v')) continue;        // без ?v — не часть версионируемой сборки
    u.hash='';
    if(!seen.has(u.href)){ seen.add(u.href); out.push(u); }
  }
  return out;
}

function stampKind(rel){
  if(rel==='version.js') return 'version';
  if(rel==='style.css') return 'css';
  if(STAMPED_JS.indexOf(rel)>=0) return 'js';
  return null;                                     // сторонние (html2canvas, docx, tabler css) штампа не имеют
}

function readStamp(kind, rel, text){
  let m;
  if(kind==='js'){ m=RE_FILE_STAMP.exec(text); return (m&&m[1]===rel)?Number(m[2]):null; }
  if(kind==='version'){ m=RE_APP_BUILD.exec(text); return m?Number(m[1]):null; }
  if(kind==='css'){ m=RE_CSS_BUILD.exec(text); return m?Number(m[1]):null; }
  return null;
}

// null — всё в порядке (или файл без штампа по контракту); иначе текст ошибки.
// Зачем проверять штамп, если ?v уже совпал: GitHub Pages query игнорирует, и при
// незавершённой выкладке/отставании CDN под sync.js?v=НОВАЯ приходит СТАРЫЙ файл.
// Отсутствие штампа у штампуемого файла — тоже старый файл (до v0.29 штампов не было).
function stampError(rel, body){
  const kind=stampKind(rel);
  if(!kind) return null;
  const got=readStamp(kind, rel, decodeUtf8(body));
  if(got===SW_BUILD) return null;
  return rel+': штамп сборки '+(got===null?'отсутствует':got)+', ожидалась '+SW_BUILD;
}

// Кэшируем только полноценный 200 своего origin: ни 404/500, ни 206, ни opaque.
function isCacheable(resp){
  return !!resp && resp.status===200 && (resp.type==='basic'||resp.type==='default');
}

// Пересобрать ответ из уже прочитанного тела. Нужно (1) навигации: ответ с флагом
// redirected на запрос навигации браузер отвергает как сетевую ошибку; (2) кэшу: тело
// уже раскодировано, поэтому content-encoding/content-length исходника ему не соответствуют.
function freshResponse(resp, body){
  const headers=new Headers(resp.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(body, {status:resp.status, statusText:resp.statusText, headers});
}

// Фоновая работа после ответа странице: держим воркер живым, ошибки глотаем
// (фоновое обновление кэша — не повод показывать странице сбой).
function bg(event, p){
  const safe=Promise.resolve(p).catch(()=>{});
  try{ event.waitUntil(safe); }catch(e){ /* событие уже завершено — работа всё равно идёт */ }
}

// Положить в СВОЙ кэш, только если он существует. Кэш создаёт install; если его нет,
// значит его удалил activate более новой сборки — воскрешать «зомби-кэш» старой сборки нельзя.
async function putOwn(key, resp){
  if(!(await caches.has(CACHE_NAME))) return false;
  const cache=await caches.open(CACHE_NAME);
  await cache.put(key, resp);
  return true;
}

function matchOwn(key){
  return caches.match(key, {cacheName:CACHE_NAME, ignoreVary:true});
}

// Точный URL (с ?v) во ВСЕХ кэшах bpla-: текущий первым. Зачем остальные: пока новая
// сборка ждёт активации (waiting), страница уже может быть загружена новым index из сети —
// её ?v=НОВАЯ проверенно лежат в кэше новой сборки, и брать их оттуда безопасно (точное
// совпадение URL = та же сборка). Чужие кэши (другой префикс) не смотрим.
async function matchInFamily(href){
  const own=await matchOwn(href);
  if(own) return own;
  const names=(await caches.keys()).filter(n=>n.indexOf(CACHE_PREFIX)===0&&n!==CACHE_NAME);
  for(const n of names){
    const r=await caches.match(href, {cacheName:n, ignoreVary:true});
    if(r) return r;
  }
  return undefined;
}

// ============================================================ install

// Установка = полная проверенная копия ОДНОЙ сборки. Любое несовпадение → исключение →
// install падает, воркер отбрасывается, старый продолжает работать; браузер повторит
// проверку обновления позже (CDN догонит). Ничего не кладём в кэш до окончания проверок:
// частично заполненный кэш сборки N не должен существовать.
async function precache(){
  const indexResp=await fetch(INDEX_KEY, {cache:'no-store'});   // мимо HTTP-кэша браузера
  if(!isCacheable(indexResp)) throw new Error('install: index.html → HTTP '+indexResp.status);
  const indexBody=await indexResp.arrayBuffer();
  const html=decodeUtf8(indexBody);

  const build=readMetaBuild(html);
  if(build!==SW_BUILD) throw new Error('install: index.html сборки '+build+', воркер сборки '+SW_BUILD+' (CDN ещё не обновился)');

  const assets=extractVersionedAssets(html, INDEX_KEY);
  if(!assets.length) throw new Error('install: в index.html нет ассетов с ?v — это не сборка PWA');
  for(const u of assets){
    const v=u.searchParams.get('v');
    if(v!==String(SW_BUILD)) throw new Error('install: '+u.pathname+'?v='+v+' не совпадает со сборкой '+SW_BUILD);
  }

  const fetched=await Promise.all(assets.map(async u=>{
    const r=await fetch(u.href, {cache:'no-store'});
    if(!isCacheable(r)) throw new Error('install: '+u.pathname+' → HTTP '+r.status);
    const body=await r.arrayBuffer();
    const err=stampError(scopeRel(u), body);
    if(err) throw new Error('install: '+err+' (незавершённая выкладка или отставание CDN)');
    return [u.href, freshResponse(r, body)];
  }));

  const cache=await caches.open(CACHE_NAME);
  for(const [href, resp] of fetched) await cache.put(href, resp);
  // index — ПОСЛЕДНИМ: если запись оборвётся на середине, в кэше не окажется index без
  // своих ассетов (офлайн без index честно даст ошибку, а не полусобранную страницу).
  await cache.put(INDEX_KEY, freshResponse(indexResp, indexBody));

  await Promise.all(EXTRAS.map(async rel=>{
    try{
      const r=await fetch(SCOPE+rel, {cache:'no-cache'});
      if(isCacheable(r)) await cache.put(SCOPE+rel, r);
    }catch(e){ /* best-effort: иконка/шрифт не повод отменять установку */ }
  }));

  // Кэш могли удалить посреди установки (activate другой сборки по SKIP_WAITING в соседней
  // вкладке). Установленный воркер без своего кэша офлайн не работал бы — пусть лучше
  // установка упадёт и браузер повторит её.
  if(!(await matchOwn(INDEX_KEY))) throw new Error('install: кэш '+CACHE_NAME+' удалён во время установки');
}

self.addEventListener('install', event=>{
  // skipWaiting здесь НЕ вызываем: первая установка активируется сама (контролировать
  // нечего), а обновление посреди работы подменило бы воркер под открытой страницей старой
  // сборки. Активацию обновления запрашивает страница сообщением SKIP_WAITING, когда безопасно
  // (нет несохранённого ввода, очередь отправки пуста и т.п.).
  event.waitUntil(precache());
});

// ============================================================ activate

self.addEventListener('activate', event=>{
  event.waitUntil((async()=>{
    // Старые сборки больше не нужны: их index и ассеты заменены проверенной копией текущей.
    // Кэши без нашего префикса не трогаем — на origin pilgrim75.github.io могут жить чужие.
    const names=await caches.keys();
    await Promise.all(names
      .filter(n=>n.indexOf(CACHE_PREFIX)===0&&n!==CACHE_NAME)
      .map(n=>caches.delete(n)));
    await self.clients.claim();
  })());
});

// ============================================================ message

// API для страницы:
//   {type:'SKIP_WAITING'} → активировать ожидающий воркер (страница затем перезагружается
//                           по controllerchange);
//   {type:'GET_BUILD'}    → ответ {build:SW_BUILD} в event.ports[0] (MessageChannel).
self.addEventListener('message', event=>{
  const d=(event&&event.data)||{};
  if(d.type==='SKIP_WAITING'){
    const p=self.skipWaiting();
    if(p&&event.waitUntil){ try{ event.waitUntil(p); }catch(e){} }
    return;
  }
  if(d.type==='GET_BUILD'){
    const port=event.ports&&event.ports[0];
    if(port) port.postMessage({build:SW_BUILD});
  }
});

// ============================================================ fetch

// index / навигация к приложению: СЕТЬ ПЕРВОЙ (с перепроверкой у CDN), 5 с → кэш.
// Сеть первой — чтобы новая выкладка доходила сразу, а не через одну перезагрузку.
function handleIndex(event){
  const req=event.request;
  // Запрос уходит по исходному URL (с токеном — как и без воркера), ключ кэша — без query.
  const netP=(async()=>{
    const resp=await fetch(req.url, {cache:'no-cache', credentials:'same-origin', redirect:'follow'});
    const body=await resp.arrayBuffer();
    const ok=isCacheable(resp);
    return {resp, body, ok, build:ok?readMetaBuild(decodeUtf8(body)):null};
  })();
  // Обновляем кэшированный index ТОЛЬКО своей сборкой: index другой сборки без её ассетов
  // в нашем кэше офлайн собрал бы смешанную страницу. Работа идёт и после таймаута —
  // запоздавший ответ сети освежит кэш к следующему открытию.
  const storeP=netP.then(r=>{
    if(r.ok&&r.build===SW_BUILD) return putOwn(INDEX_KEY, freshResponse(r.resp, r.body));
  });
  bg(event, storeP);
  return respondIndex(netP);
}

async function respondIndex(netP){
  let timer;
  const timeout=new Promise(res=>{ timer=setTimeout(()=>res(TIMEOUT), NAV_TIMEOUT_MS); });
  let first=null;
  try{ first=await Promise.race([netP, timeout]); }
  catch(e){ first=null; }                          // сеть упала (офлайн, DNS, обрыв)
  finally{ clearTimeout(timer); }

  if(first&&first!==TIMEOUT&&first.ok){
    // Сеть отдала СТАРШУЮ по номеру сборку, чем наша (отставание узла CDN после выкладки):
    // полный согласованный набор нашей сборки лежит в кэше — берём его, а не старый index,
    // ассетов которого у нас уже нет (иначе смешанная загрузка).
    if(typeof first.build==='number'&&first.build<SW_BUILD){
      const cached=await matchOwn(INDEX_KEY);
      if(cached) return cached;
    }
    // Своя сборка, более новая (обновление выложено, наш воркер ещё не сменился) или без
    // meta — отдаём ответ сети. Новая сборка грузит свои ?v=НОВАЯ из сети/кэша новой сборки.
    return freshResponse(first.resp, first.body);
  }

  const cached=await matchOwn(INDEX_KEY);
  if(cached) return cached;

  if(first===TIMEOUT){
    // Кэша нет (например, хранилище вытеснено) — остаётся только дождаться сети.
    try{ const r=await netP; return freshResponse(r.resp, r.body); }
    catch(e){ return Response.error(); }
  }
  if(first&&!first.ok) return freshResponse(first.resp, first.body);   // 404/5xx и кэша нет — как есть
  return Response.error();
}

// version.json: сеть первой и мимо HTTP-кэша (страница по нему узнаёт о выкладке),
// копия — только для офлайна, под ключом без query (?_=<ts> у каждого опроса свой).
// Копию из кэша помечаем заголовком X-SW-Fallback: cache — страница может отличить
// «сервер сказал сейчас» от «так было в последний раз» и не затевать перезагрузку на
// новую сборку, которую без сети всё равно не получить.
async function handleVersion(event){
  let resp;
  try{ resp=await fetch(event.request.url, {cache:'no-store'}); }
  catch(e){ return (await versionFallback())||Response.error(); }
  if(isCacheable(resp)){
    await putOwn(VERSION_KEY, resp.clone());
    return resp;
  }
  return (await versionFallback())||resp;
}

async function versionFallback(){
  const cached=await matchOwn(VERSION_KEY);
  if(!cached) return null;
  const headers=new Headers(cached.headers);
  headers.set('X-SW-Fallback', 'cache');
  return new Response(await cached.arrayBuffer(), {status:cached.status, statusText:cached.statusText, headers});
}

// Ассеты с ?v: URL уникален для сборки → содержимое неизменно → КЭШ ПЕРВЫМ.
// Промах (страница новой сборки у старого воркера, либо запись вытеснена) → сеть.
// В свой кэш кладём только своё: ?v=SW_BUILD и совпавший штамп. Ответ отдаём в любом
// случае — решать, что делать со смешанной загрузкой, будет страница (по штампам).
async function handleVersioned(event, url, rel){
  const hit=await matchInFamily(url.href);
  if(hit) return hit;
  let resp;
  try{ resp=await fetch(url.href, {cache:'no-cache'}); }
  catch(e){ return Response.error(); }
  if(isCacheable(resp)&&url.searchParams.get('v')===String(SW_BUILD)){
    const copy=resp.clone();
    bg(event, (async()=>{
      const body=await copy.arrayBuffer();
      if(stampError(rel, body)) return;            // под нашим ?v пришёл файл другой сборки
      await putOwn(url.href, freshResponse(copy, body));
    })());
  }
  return resp;
}

// Навигацию нельзя отвечать redirected-ответом (браузер даст ошибку сети).
async function navSafe(req, resp){
  if(req.mode==='navigate'&&resp&&resp.redirected){
    const body=await resp.arrayBuffer();
    return freshResponse(resp, body);
  }
  return resp;
}

// Прочее своё (шрифты, картинки, manifest, medals.html): stale-while-revalidate.
// Ключ — путь БЕЗ query: GitHub Pages query игнорирует (tabler-icons.woff2?v2.47.0 из CSS
// и предзагруженный tabler-icons.woff2 — один файл), а токен из адреса medals.html?…&t=…
// не попадёт в ключ кэша.
async function handleStatic(event, url, rel){
  const req=event.request;
  const key=SCOPE+rel;
  const cached=await matchOwn(key);
  const netP=fetch(url.href, {cache:'no-cache'}).then(resp=>{
    if(isCacheable(resp)) bg(event, putOwn(key, resp.clone()));
    return resp;
  });
  if(cached){
    bg(event, netP);                               // обновить в фоне, отдать сразу
    return navSafe(req, cached);
  }
  try{ return await navSafe(req, await netP); }
  catch(e){ return Response.error(); }
}

self.addEventListener('fetch', event=>{
  const req=event.request;
  // Только GET: POST (запись в облако, AI) воркер не трогает вообще — respondWith не зовём.
  if(req.method!=='GET') return;
  let url;
  try{ url=new URL(req.url); }catch(e){ return; }
  if(FOREIGN_HOST_RE.test(url.hostname)) return;   // бэкенд/AI — никогда
  if(url.origin!==SCOPE_URL.origin) return;        // чужой origin — мимо воркера
  if(req.headers&&req.headers.has('range')) return; // частичные ответы (206) кэшу не годятся
  const rel=scopeRel(url);
  if(rel===null) return;                           // тот же origin, но другое приложение (/other/…)
  if(rel==='sw.js') return;                        // сам воркер браузер обновляет мимо fetch

  if(rel===''||rel==='index.html'){ event.respondWith(handleIndex(event)); return; }
  if(rel==='version.json'){ event.respondWith(handleVersion(event)); return; }
  if(url.searchParams.has('v')){ event.respondWith(handleVersioned(event, url, rel)); return; }
  event.respondWith(handleStatic(event, url, rel));
});
