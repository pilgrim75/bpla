// geo.js — геомодуль (часть app.js, грузить ПЕРЕД app.js)
// ============================================================
// GEO MODULE — геолокация и расчёт дистанций (ТОЛЬКО ЛОКАЛЬНО)
// Данные точек (geo_points_db) НИКОГДА не уходят в облако.
// ============================================================

let geoDB = []; // [{layer, color_key, num, lat, lon}]
// Индекс для быстрого поиска: { color_key: { num: {lat,lon,layer,num,color_key} } }.
// Строится один раз при загрузке/импорте данных, а не на каждый запрос.
let geoIndex = {};
function geoBuildIndex(){
  geoIndex = {};
  for(const p of geoDB){
    const ck = p.color_key || '';
    if(!ck) continue;
    const bucket = geoIndex[ck] || (geoIndex[ck] = {});
    // ПЕРВОЕ вхождение выигрывает. Склеенные подслои с одним именем (напр.
    // «Горчичненые точки» = ~4×999) переиспользуют номера 1..999. При last-wins
    // номер 274 возвращал точку из ПОСЛЕДНЕГО подслоя (неверную); первый подслой —
    // основной (его координаты совпадают с реальными). geoDB хранится в порядке
    // файла, поэтому первое вхождение = первый подслой. См. geoDiagDuplicates().
    if(bucket[p.num] === undefined) bucket[p.num] = p;
  }
}

// ===== Хранилище гео — IndexedDB (21.08.2026) =====
// geo_points_db (~4.6 МБ на устройстве admin) занимал почти всю квоту localStorage
// (~5.24M символов): droneState переставал сохраняться, saveLocal молча падал —
// соучастник дрейфа склада (устаревший droneState). Гео — только локальное (в облако
// не ходит), поэтому переезжает в IndexedDB: та же БД `bpla_backups`/store `bak`, что
// уже используется для снимков state (ключ 'geo_points_db'). Миграция при старте:
// ключ есть в localStorage → перенести в IDB (с проверкой чтения) → удалить из LS.
// Загрузка асинхронная: geoDB нужен только при расчёте дистанций/импорте/вкладке
// Карта — к этому моменту данные уже на месте; промис `geoReady` — для ожидания.
const GEO_IDB_DB='bpla_backups', GEO_IDB_STORE='bak', GEO_IDB_KEY='geo_points_db';
function _geoIdb(){
  return new Promise((res,rej)=>{
    if(typeof indexedDB==='undefined'){ rej(new Error('IndexedDB недоступен')); return; }
    const q=indexedDB.open(GEO_IDB_DB,1);
    q.onupgradeneeded=()=>{ if(!q.result.objectStoreNames.contains(GEO_IDB_STORE)) q.result.createObjectStore(GEO_IDB_STORE); };
    q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error);
  });
}
async function _geoIdbGet(k){ const db=await _geoIdb(); return new Promise((res,rej)=>{ const r=db.transaction(GEO_IDB_STORE).objectStore(GEO_IDB_STORE).get(k); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function _geoIdbPut(k,v){ const db=await _geoIdb(); return new Promise((res,rej)=>{ const tx=db.transaction(GEO_IDB_STORE,'readwrite'); tx.objectStore(GEO_IDB_STORE).put(v,k); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); }); }
let _geoLoaded=false;
async function geoLoad(){
  let fromIdb=null;
  try{ fromIdb=await _geoIdbGet(GEO_IDB_KEY); }catch(e){ console.warn('[GEO] IDB read:', e&&e.message); }
  const ls=localStorage.getItem('geo_points_db');
  if(fromIdb!==undefined && fromIdb!==null){
    try{ geoDB=typeof fromIdb==='string'?JSON.parse(fromIdb):fromIdb; }catch(e){ geoDB=[]; }
    if(!Array.isArray(geoDB)) geoDB=[];
    // Остаток в LS при уже заполненной IDB (прерванная миграция) — IDB авторитетна, LS чистим
    if(ls!==null){ try{ localStorage.removeItem('geo_points_db'); console.log('[GEO] остаток geo_points_db удалён из localStorage (IDB авторитетна)'); }catch(e){} }
  } else if(ls!==null){
    // Миграция LS → IDB: пишем, перечитываем, только затем удаляем из LS
    try{ geoDB=JSON.parse(ls||'[]'); }catch(e){ geoDB=[]; }
    if(!Array.isArray(geoDB)) geoDB=[];
    try{
      await _geoIdbPut(GEO_IDB_KEY, geoDB);
      const back=await _geoIdbGet(GEO_IDB_KEY);
      if(Array.isArray(back)&&back.length===geoDB.length){
        localStorage.removeItem('geo_points_db');
        console.log('[GEO] geo_points_db перенесён в IndexedDB ('+geoDB.length+' точек, '+ls.length+' символов освобождено в localStorage)');
        if(typeof showSyncToast==='function') showSyncToast('✓ База гео-точек перенесена в IndexedDB — localStorage освобождён', 5000);
      } else console.error('[GEO] миграция не подтверждена — localStorage оставлен');
    }catch(e){ console.error('[GEO] миграция в IDB не удалась:', e&&e.message); }
  } else geoDB=[];
  geoBuildIndex(); _geoLoaded=true;
  if(typeof renderGeoTab==='function') try{ const el=document.getElementById('adm-geo'); if(el&&el.offsetParent!==null) renderGeoTab(); }catch(e){}
  return geoDB;
}
function geoSave(){
  _geoIdbPut(GEO_IDB_KEY, geoDB).catch(e=>{
    console.error('[GEO] сохранение базы точек в IndexedDB не удалось:', e&&e.message);
    if(typeof showSyncToast==='function') showSyncToast('⚠ База гео-точек НЕ сохранена (IndexedDB)', 8000);
  });
}
const geoReady = geoLoad();

// Алиасы промежуточных/неизвестных точек: { нормализованное_имя: 'NNN цвет' }
let geoAliases = {};
function geoAliasesLoad(){ try{ geoAliases = JSON.parse(localStorage.getItem('geo_aliases')||'{}'); }catch(e){ geoAliases={}; } }
function geoAliasesSave(){ try{ localStorage.setItem('geo_aliases', JSON.stringify(geoAliases)); }catch(e){} }
geoAliasesLoad();
// Нерешённые промежуточные точки текущего прогона + пропущенные в этой сессии
let _geoPendingMids = new Set();
let _geoCollectMids = false;
const _geoSkippedMids = new Set();

// Защитный страж: гео-данные (точки и алиасы) никогда не уходят в облако
function geoStripFromSync(data){
  if(data && typeof data==='object'){
    delete data.geo_points_db; delete data.geo; delete data.geoDB; delete data.geo_points;
    delete data.geo_aliases; delete data.geoAliases;
    // подсказки/настройки документа на списание (writeoff_*) — только локально, в облако не уходят
    Object.keys(data).forEach(k=>{ if(k.indexOf('writeoff')===0)delete data[k]; });
  }
  return data;
}

// Декод UTF-8 диапазона байт (имена слоёв могут содержать кириллицу)
function geoDecodeUtf8(bytes){
  try{ return new TextDecoder('utf-8').decode(bytes); }catch(e){ return ''; }
}

// Ключевое слово цвета из имени слоя: убрать точки/csv/числа/спецсимволы
function geoColorKey(layerName){
  let s=(layerName||'').toLowerCase();
  s=s.replace(/\.csv$/,'').replace(/точки/g,'').replace(/csv/g,'');
  s=s.replace(/[0-9]/g,' ');               // числа
  s=s.replace(/[^a-zа-яё\s]/gi,' ');        // спецсимволы (оставляем буквы)
  s=s.replace(/\s+/g,' ').trim();
  return s;
}

// Разбор одной точки начиная с позиции тега 'name'. Возвращает {num,lat,lon,end} или null
function geoTryPoint(bytes, dv, p, n){
  const lenOff=p+4;
  if(lenOff+4>n) return null;
  const len=dv.getUint32(lenOff,false);
  if(len<=0||len>64) return null;
  const nameOff=lenOff+4;
  if(nameOff+len>n) return null;
  let nameStr='';
  for(let i=0;i<len;i++) nameStr+=String.fromCharCode(bytes[nameOff+i]);
  if(!/^\d+$/.test(nameStr)) return null;   // имя точки — число
  const mk=nameOff+len;
  if(mk+12+8>n) return null;
  // Маркер: 00 00 00 (01|02) + ff ff ff ff + 00 00 00 08
  if(bytes[mk]!==0||bytes[mk+1]!==0||bytes[mk+2]!==0||(bytes[mk+3]!==1&&bytes[mk+3]!==2)) return null;
  if(bytes[mk+4]!==0xff||bytes[mk+5]!==0xff||bytes[mk+6]!==0xff||bytes[mk+7]!==0xff) return null;
  if(bytes[mk+8]!==0||bytes[mk+9]!==0||bytes[mk+10]!==0||bytes[mk+11]!==8) return null;
  const lonOff=mk+12, latOff=mk+16;
  const lon=dv.getInt32(lonOff,false)/1e7;
  const lat=dv.getInt32(latOff,false)/1e7;
  return {num:parseInt(nameStr,10), lat, lon, end:latOff+4};
}

// Парсер бинарного формата AlpineQuest LDK
function geoParseLDK(arrayBuffer){
  const bytes=new Uint8Array(arrayBuffer);
  const dv=new DataView(arrayBuffer);
  const n=bytes.length;
  // latin1-строка для поиска ascii-паттернов (индексы == смещения байт)
  let latin='';
  const CH=0x8000;
  for(let i=0;i<n;i+=CH) latin+=String.fromCharCode.apply(null, bytes.subarray(i, Math.min(n,i+CH)));

  // 1. Заголовки слоёв (.csv)
  const layers=[];
  let ci=latin.indexOf('.csv');
  while(ci!==-1){
    let start=ci;
    while(start>0 && bytes[start-1]>=0x20 && ci-start<64) start--; // печатаемые байты назад
    const name=geoDecodeUtf8(bytes.subarray(start, ci+4)).trim();
    layers.push({pos:start, name, color_key:geoColorKey(name)});
    ci=latin.indexOf('.csv', ci+4);
  }
  layers.sort((a,b)=>a.pos-b.pos);
  const layerForPos=p=>{ let chosen=null; for(const L of layers){ if(L.pos<=p) chosen=L; else break; } return chosen; };

  // 2. Точки (тег 'name')
  const points=[];
  let p=latin.indexOf('name');
  while(p!==-1){
    const r=geoTryPoint(bytes, dv, p, n);
    if(r && isFinite(r.lat) && isFinite(r.lon) && Math.abs(r.lat)<=90 && Math.abs(r.lon)<=180){
      const L=layerForPos(p);
      points.push({ layer:L?L.name:'', color_key:L?L.color_key:'', num:r.num, lat:r.lat, lon:r.lon });
      p=latin.indexOf('name', r.end);
    } else {
      p=latin.indexOf('name', p+4);
    }
  }
  return {points, layers};
}

// Извлечь число и цвет из запроса '305 вишня'
function geoExtractNumColor(q){
  const s=(q||'').toLowerCase().trim();
  const numMatch=s.match(/\d+/);
  const num=numMatch?numMatch[0]:'';
  const rest=s.replace(/[^a-zа-яё0-9\s]/gi,' ');
  const colorWords=rest.split(/\s+/).filter(w=>w&&!/^\d+$/.test(w)); // убираем числовые токены
  return {num, color:colorWords.join(' ').trim()};
}

// Нормализация слова перед сравнением (ё→е, нижний регистр)
function geoNorm(s){ return (s||'').toLowerCase().replace(/ё/g,'е'); }

// Сопоставление двух слов тремя методами (после нормализации ё/е):
function geoWordMatch(a, b){
  a=geoNorm(a); b=geoNorm(b);
  if(!a||!b) return false;
  if(a===b) return true;
  // 1. Полный Левенштейн с увеличенным порогом для коротких слов
  //    ("янтарь"↔"янтарный": порог = max(2, floor(min/2)))
  const thr=Math.max(2, Math.floor(Math.min(a.length,b.length)/2));
  if(levenshtein(a,b)<=thr) return true;
  // 2. Общий префикс ≥ 4 символов ("вишн" в "вишневая", "янтар" в "янтарный")
  let cp=0; const mn=Math.min(a.length,b.length);
  while(cp<mn && a[cp]===b[cp]) cp++;
  if(cp>=4) return true;
  // 3. Префикс с допуском на опечатку: короткое слово ≈ началу длинного
  //    ("карал"/"каралл" ≈ "корал"/"коралл" из "коралловый")
  const short=a.length<=b.length?a:b;
  const long =a.length<=b.length?b:a;
  if(short.length>=4){
    const pthr=Math.max(1, Math.floor(short.length/4));
    if(levenshtein(short, long.slice(0, short.length))<=pthr) return true;
  }
  return false;
}

// Токенное сопоставление цвета: совпадение, если любое слово запроса
// совпадает (по geoWordMatch) с любым словом color_key.
// Пример: "вишня" находит слой "цели вишня"; "каралл" находит "коралловый".
function geoColorMatch(queryColor, colorKey){
  if(!queryColor || !colorKey) return false;
  const qWords=geoNorm(queryColor).split(/\s+/).filter(Boolean);
  const kWords=geoNorm(colorKey).split(/\s+/).filter(Boolean);
  return qWords.some(qw=>kWords.some(kw=>geoWordMatch(qw, kw)));
}

// Качество совпадения цвета слоя с запросом: 0 = точное совпадение слова,
// иначе 1 + минимальное расстояние Левенштейна между словами (чем меньше, тем лучше).
function geoColorScore(queryWords, colorKey){
  const kWords=geoNorm(colorKey||'').split(/\s+/).filter(Boolean);
  if(queryWords.some(qw=>kWords.includes(qw))) return 0; // точное совпадение слова
  let best=Infinity;
  queryWords.forEach(qw=>kWords.forEach(kw=>{ best=Math.min(best, levenshtein(qw, kw)); }));
  return 1+best;
}

// Нечёткий поиск точки по запросу '305 вишня' → {lat,lon,layer,num} | null
// Через индекс geoIndex: фаззи-сравнение цвета идёт по уникальным color_key, а не по всем точкам.
function findGeoPoint(query){
  if(!geoDB.length) return null;
  if(!Object.keys(geoIndex).length) geoBuildIndex(); // страховка от рассинхрона
  // Алиас: если запрос совпал с сохранённым алиасом — подставляем его значение
  const aliasKey=geoNorm((query||'').trim());
  if(aliasKey && geoAliases[aliasKey]) query=geoAliases[aliasKey];
  const {num, color}=geoExtractNumColor(query);
  if(!color) return null;
  // Подбираем color_key с лучшим (минимальным) скором среди совпавших по словам.
  const qWords=geoNorm(color).split(/\s+/).filter(Boolean);
  let bestScore=Infinity, bestKeys=[];
  for(const ck in geoIndex){
    if(!geoColorMatch(color, ck)) continue;
    const sc=geoColorScore(qWords, ck);
    if(sc<bestScore){ bestScore=sc; bestKeys=[ck]; }
    else if(sc===bestScore){ bestKeys.push(ck); }
  }
  if(!bestKeys.length) return null;
  // Точное совпадение по номеру — O(1) через индекс
  if(num){
    for(const ck of bestKeys){ const p=geoIndex[ck][num]; if(p) return {lat:p.lat, lon:p.lon, layer:p.layer, num:p.num}; }
  }
  // Иначе — собираем точки выбранных слоёв и берём ближайший по номеру (или первый)
  let cand=[];
  for(const ck of bestKeys){ const byNum=geoIndex[ck]; for(const n in byNum) cand.push(byNum[n]); }
  if(!cand.length) return null;
  if(num) cand.sort((a,b)=>Math.abs(a.num-num)-Math.abs(b.num-num));
  const p=cand[0];
  return {lat:p.lat, lon:p.lon, layer:p.layer, num:p.num};
}

// --- ДИАГНОСТИКА ---
// Объяснение, почему findGeoPoint вернул/не вернул точку
function geoDiagFind(query){
  if(!geoDB.length) return {ok:false, reason:'geoDB пуст — точки не загружены'};
  const {num, color}=geoExtractNumColor(query);
  if(!color) return {ok:false, reason:'не извлёкся цвет из запроса', query, num, color};
  const colorPts=geoDB.filter(pt=>geoColorMatch(color, pt.color_key));
  if(!colorPts.length){
    const colors=[...new Set(geoDB.map(p=>p.color_key))];
    return {ok:false, reason:'НЕТ СЛОЯ со словом "'+color+'"', query, num, color, availableColors:colors};
  }
  const hasNum = num ? colorPts.some(p=>String(p.num)===String(num)) : true;
  const r=findGeoPoint(query);
  return {ok:!!r, query, num, color, layerMatches:colorPts.length,
    matchedLayers:[...new Set(colorPts.map(p=>p.color_key))],
    numFound:hasNum, note:(num&&!hasNum)?'точки с номером '+num+' нет в слое — взята ближайшая':'',
    nums:[...new Set(colorPts.map(p=>p.num))].slice(0,15), result:r};
}

// Сводка по загруженным геоданным (вызывать из консоли: geoDiag())
function geoDiag(){
  console.log('[GEO] geoDB size:', geoDB.length);
  console.log('[GEO] layers (color_key):', [...new Set(geoDB.map(p=>p.color_key))]);
  console.log('[GEO] layers (имена):', [...new Set(geoDB.map(p=>p.layer))]);
  console.log('[GEO] state.squads start_point:', state.squads.map(s=>({pilot:s.pilot, start_point:s.start_point||'—'})));
  return {points:geoDB.length, colors:[...new Set(geoDB.map(p=>p.color_key))]};
}

// Диагностика коллизий номеров: слои, где один номер встречается несколько раз
// (склеенные подслои, переиспользующие номера). Вызывать из консоли: geoDiagDuplicates()
function geoDiagDuplicates(){
  const byCk={};
  for(const p of geoDB){ const ck=p.color_key||''; (byCk[ck]||(byCk[ck]={})); (byCk[ck][p.num]||(byCk[ck][p.num]=[])).push(p); }
  const res=[];
  for(const ck in byCk){
    let dup=0, total=0, maxRep=0;
    for(const num in byCk[ck]){ total++; const r=byCk[ck][num].length; if(r>1) dup++; if(r>maxRep) maxRep=r; }
    if(dup) res.push({color_key:ck, points:geoDB.filter(p=>p.color_key===ck).length, uniqueNums:total, collidingNums:dup, maxRepeat:maxRep});
  }
  res.sort((a,b)=>b.collidingNums-a.collidingNums);
  console.log('[GEO] Слои с дублирующимися номерами (склеенные подслои, ~maxRepeat подслоёв):');
  res.forEach(r=>console.log('  ', JSON.stringify(r)));
  if(!res.length) console.log('  нет — номера уникальны в каждом слое');
  return res;
}

// Диагностика промежуточных точек из примечаний (вызывать из консоли: geoDiagNotes())
function geoDiagNotes(){
  // примечания с признаком промежуточной точки: "вернул до", "до X", "вернул к", "к X"
  const re=/(верн\w*\s+(до|к)\s)|(\bдо\s)|(\bк\s)/i;
  const flights=(state.flights||[]).filter(f=>f.note && re.test(f.note));
  console.log('[GEO] === geoDiagNotes ===');
  console.log('[GEO] вылетов с похожим примечанием:', flights.length);
  flights.forEach(f=>{
    const mid=geoNoteIntermediate(f.note);
    if(mid){
      const pt=findGeoPoint(mid);
      console.log('[GEO] note="'+f.note+'" → промежуточная "'+mid+'" → '+(pt?('точка '+JSON.stringify(pt)):'findGeoPoint=null: '+JSON.stringify(geoDiagFind(mid))));
    } else {
      console.log('[GEO] note="'+f.note+'" → "" (паттерн «до <слово>» не найден; слова «к …» текущая функция НЕ распознаёт)');
    }
  });
  console.log('[GEO] --- примеры ---');
  console.log('  geoNoteIntermediate("вернул до Фили") =', JSON.stringify(geoNoteIntermediate('вернул до Фили')));
  console.log('  geoNoteIntermediate("борт вернул к филе") =', JSON.stringify(geoNoteIntermediate('борт вернул к филе')));
  console.log('  geoNoteIntermediate("вернул борт к Карал") =', JSON.stringify(geoNoteIntermediate('вернул борт к Карал')));
  return flights.length;
}

// Расстояние между координатами (Haversine, км)
function calcDistance(lat1,lon1,lat2,lon2){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const geoRound2=v=>Math.round(v*100)/100;

// Промежуточная точка из примечания: 'вернул до Фили'/'вернул к филе'/'обратно к Карал' → точка.
// Предлог (до|к), опц. «обратно». Граница слова — начало строки или пробел
// (JS \b некорректен для кириллицы), поэтому предлог должен стоять отдельным словом.
// Захват: «число + слово» (45 вишня) либо одиночное слово.
function geoNoteIntermediate(note){
  if(!note) return '';
  const m=note.match(/(?:^|\s)(?:обратно\s+)?(?:до|к)\s+(\d+\s+[A-Za-zА-Яа-яЁё0-9]+|[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9]*)/i);
  return m?m[1].trim():'';
}

// Диагностика расчёта дальности конкретного вылета (из консоли):
//   geoDiagDist('Поп','274 Горчичная')
function geoDiagDist(pilot, target){
  const sq=state.squads.find(s=>s.pilot && pilot && s.pilot.toLowerCase()===pilot.toLowerCase());
  const startQ=sq&&sq.start_point;
  const start=startQ?findGeoPoint(startQ):null;
  const tgt=findGeoPoint(target);
  const dist=(start&&tgt)?geoRound2(calcDistance(start.lat,start.lon,tgt.lat,tgt.lon)):null;
  console.log('[GEO] пилот:', pilot, '| точка старта:', startQ||'— (не задана)');
  console.log('[GEO] findGeoPoint(цель "'+target+'") →', tgt);
  console.log('[GEO] findGeoPoint(старт "'+(startQ||'')+'") →', start);
  console.log('[GEO] calcDistance старт→цель →', dist!=null?dist+' км':'нет (точка не найдена)');
  if(!tgt) console.log('[GEO] диагностика цели:', geoDiagFind(target));
  if(startQ && !start) console.log('[GEO] диагностика старта:', geoDiagFind(startQ));
  return {pilot, start_point:startQ, start, target:tgt, range_km:dist};
}

// Цель из нескольких точек ("647 лиловая, 695 лиловая" — разделители , ; /):
// каждая часть ищется отдельно, берётся ДАЛЬНЯЯ от старта (борт долетал до самой дальней).
function geoFindFarthestTarget(target, start){
  const parts=(target||'').split(/[,;\/]+/).map(s=>s.trim()).filter(Boolean);
  let best=null, bestDist=-1;
  for(const p of parts){
    const pt=findGeoPoint(p);
    if(!pt) continue;
    const d=calcDistance(start.lat,start.lon,pt.lat,pt.lon);
    if(d>bestDist){ bestDist=d; best=pt; }
  }
  return best;
}

// Расчёт дистанций вылета → {range_km, distance_km} | null
function geoComputeFlight(f){
  if(!geoDB.length) return null;
  // Потеря без выполнения задачи (result='no' + returned='no'): борт не долетел
  // и неизвестно где упал — дальность/путь не считаем (иначе ложное расстояние до цели).
  if(f.result==='no' && f.returned==='no') return null;
  const sq=state.squads.find(s=>s.pilot && f.pilot && s.pilot.toLowerCase()===f.pilot.toLowerCase());
  const startQ=sq&&sq.start_point;
  if(!startQ) return null;
  const start=findGeoPoint(startQ);
  if(!start) return null;
  const tgt=geoFindFarthestTarget(f.target, start);
  if(!tgt) return null;
  const range=calcDistance(start.lat,start.lon,tgt.lat,tgt.lon);
  let distance;
  if(f.returned==='yes'){
    const midQ=geoNoteIntermediate(f.note);
    const mid=midQ?findGeoPoint(midQ):null;
    if(mid) distance=range + calcDistance(tgt.lat,tgt.lon,mid.lat,mid.lon); // старт→цель→промежуточная
    else {
      distance=range*2;                                                    // туда-обратно (fallback)
      // промежуточная извлечена, но не найдена — копим для запроса алиаса
      if(midQ && _geoCollectMids) _geoPendingMids.add(midQ.trim());
    }
  } else {
    distance=range; // потеря — путь в одну сторону
  }
  return {range_km:geoRound2(range), distance_km:geoRound2(distance)};
}

// Проставить дистанции в объект вылета (при сохранении)
function geoApplyToFlight(f){
  const r=geoComputeFlight(f);
  if(r){ f.range_km=r.range_km; f.distance_km=r.distance_km; f.geo_locked=true; } // дистанция зафиксирована
  return f;
}

// Пересчёт вылетов. opts: { force, pilot, includeLocked, onProgress, onDone }
//  force=false → только вылеты без range_km/distance_km; force=true → все (подходящие);
//  includeLocked=false (по умолчанию) → НЕ трогать вылеты с geo_locked:true;
//  pilot=имя → только вылеты этого пилота. Асинхронный батч, не блокирует UI.
function geoRecomputeFlights(opts){
  opts = opts || {};
  const force = !!opts.force;
  const includeLocked = !!opts.includeLocked;
  const pilot = opts.pilot ? opts.pilot.toLowerCase() : null;
  const list = (state.flights||[]).filter(f=>{
    if(pilot && (f.pilot||'').toLowerCase()!==pilot) return false;
    if(!includeLocked && f.geo_locked) return false;                 // защита зафиксированных
    if(!force && f.distance_km!=null && f.range_km!=null) return false;
    return true;
  });
  const total = list.length;

  // Новый запуск отменяет предыдущий незавершённый
  const myRun = (geoRecomputeFlights._runId = (geoRecomputeFlights._runId||0)+1);
  // Прогресс: inline (onProgress) либо плавающий индикатор по умолчанию
  const report = (done,tot)=>{ if(opts.onProgress) opts.onProgress(done,tot); else geoProgress(done,tot); };
  if(!total){ geoProgressHide(); if(opts.onProgress) opts.onProgress(0,0); if(opts.onDone) opts.onDone(0); return; }

  // Сбор нерешённых промежуточных точек (для запроса алиаса после прогона)
  _geoCollectMids = true; _geoPendingMids = new Set();

  const BATCH = 5;
  let i=0, changed=0;
  function step(){
    if(geoRecomputeFlights._runId !== myRun) return; // вытеснён более новым пересчётом
    const end = Math.min(i+BATCH, total);
    for(; i<end; i++){
      const f = list[i];
      // Потеря без выполнения — дистанции быть не должно: чистим прежние (возможно неверные) значения
      if(f.result==='no' && f.returned==='no'){
        if(f.range_km!=null || f.distance_km!=null){ delete f.range_km; delete f.distance_km; changed++; }
        continue;
      }
      const r = geoComputeFlight(f);
      if(r){ f.range_km=r.range_km; f.distance_km=r.distance_km; f.geo_locked=true; changed++; } // авто-блокировка после успешного пересчёта
    }
    report(i, total);
    if(i < total){
      setTimeout(step, 10); // пауза между батчами — даём браузеру отрисоваться
    } else {
      if(changed) saveLocal();
      _geoCollectMids = false;
      if(!opts.onProgress) geoProgressDone(changed); // плавающий индикатор закрывает сам себя
      // Промежуточные точки, которые не нашлись — спросить алиас у пользователя
      const pending=[..._geoPendingMids].filter(nm=>{
        const k=geoNorm(nm);
        return !geoAliases[k] && !_geoSkippedMids.has(k);
      });
      if(!opts._noPrompt && pending.length){
        geoPromptAliasQueue(pending).then(added=>{
          if(added>0){
            // повторный пересчёт с новыми алиасами, без повторного запроса
            geoRecomputeFlights(Object.assign({}, opts, {_noPrompt:true, force:true}));
          } else if(opts.onDone){ opts.onDone(changed); }
        });
      } else {
        if(opts.onDone) opts.onDone(changed);
      }
    }
  }
  setTimeout(step, 0);
}

// Диалог ввода алиаса для ненайденной промежуточной точки → Promise<value|null>
function geoAskAlias(pointName){
  return new Promise(resolve=>{
    const ov=modalOverlay(
      '<div style="background:var(--card);border:1px solid var(--border2);border-radius:var(--radius);padding:18px;max-width:380px;width:90%">'
      +'<div style="font-size:13px;margin-bottom:8px">Промежуточная точка «<b>'+esc(pointName)+'</b>» не найдена в базе.</div>'
      +'<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Введите точку в формате «NNN цвет» (например «45 вишня»):</div>'
      +'<input id="geo-alias-input" placeholder="45 вишня" autocomplete="off" style="width:100%;margin-bottom:12px">'
      +'<div style="display:flex;gap:8px;justify-content:flex-end">'
      +'<button class="btn btn-sm" id="geo-alias-skip" style="color:var(--muted)">Пропустить</button>'
      +'<button class="btn btn-success btn-sm" id="geo-alias-save">Сохранить</button>'
      +'</div></div>');
    const done=v=>{ ov.remove(); resolve(v); };
    const inp=ov.querySelector('#geo-alias-input');
    ov.querySelector('#geo-alias-save').onclick=()=>{ const v=(inp.value||'').trim(); done(v||null); };
    ov.querySelector('#geo-alias-skip').onclick=()=>done(null);
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ const v=(inp.value||'').trim(); done(v||null); } });
    setTimeout(()=>inp.focus(),50);
  });
}

// Последовательный запрос алиасов для списка точек. Возвращает число добавленных.
async function geoPromptAliasQueue(names){
  let added=0;
  for(const name of names){
    const val=await geoAskAlias(name);
    const key=geoNorm(name);
    if(val===null){ _geoSkippedMids.add(key); }           // пропуск — не спрашивать снова в сессии
    else { geoAliases[key]=val; geoAliasesSave(); added++; }
  }
  if(added) renderGeoTab();
  return added;
}

// Индикатор прогресса пересчёта (плавающий, не блокирует)
function geoProgress(done,total){
  let el=document.getElementById('geoProgress');
  if(!el){
    el=document.createElement('div');
    el.id='geoProgress';
    el.style.cssText='position:fixed;bottom:48px;right:16px;z-index:9999;background:var(--card);border:1px solid var(--amber);color:var(--amber);padding:6px 14px;font-size:12px;font-family:inherit;letter-spacing:1px;border-radius:var(--radius)';
    document.body.appendChild(el);
  }
  el.style.display='';
  el.textContent='⟳ Пересчёт: '+done+' из '+total+' вылетов...';
}
function geoProgressDone(changed){
  const el=document.getElementById('geoProgress');
  if(!el) return;
  el.textContent='✓ Пересчитано: '+changed+' вылетов';
  clearTimeout(geoProgressDone._t);
  geoProgressDone._t=setTimeout(()=>{ if(el)el.style.display='none'; },2500);
}
function geoProgressHide(){
  const el=document.getElementById('geoProgress');
  if(el) el.style.display='none';
}

// --- UI ---
function geoImportLDK(input){
  const file=input.files&&input.files[0];
  if(!file) return;
  setStatus('geo-status','Чтение файла...','muted');
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const {points}=geoParseLDK(e.target.result);
      if(!points.length){ setStatus('geo-status','Точки не найдены — проверьте формат файла','err'); return; }
      geoDB=points; geoBuildIndex(); geoSave();    // индекс строится один раз после парсинга
      const layerCount=new Set(points.map(p=>p.layer)).size;
      renderGeoTab();
      setStatus('geo-status','✓ Загружено: '+points.length+' точек, '+layerCount+' слоёв. Идёт пересчёт вылетов...','ok');
      // Пересчёт асинхронно (батчами) — не блокирует UI
      geoRecomputeFlights({force:false, onDone:rec=>{
        setStatus('geo-status','✓ Загружено: '+points.length+' точек, '+layerCount+' слоёв. Пересчитано вылетов: '+rec,'ok');
        renderFlights();
        if(document.getElementById('page-report')?.classList.contains('active')) buildReport();
      }});
    }catch(err){ console.error('[GEO] parse error:', err); setStatus('geo-status','Ошибка разбора: '+err.message,'err'); }
  };
  reader.onerror=()=>setStatus('geo-status','Ошибка чтения файла','err');
  reader.readAsArrayBuffer(file);
  input.value='';
}

function geoClearDB(){
  if(!confirm('Удалить все загруженные геоданные?')) return;
  geoDB=[]; geoBuildIndex(); geoSave(); renderGeoTab();
  setStatus('geo-status','Геоданные очищены','muted');
}

function renderGeoTab(){
  const el=document.getElementById('geo-stats');
  if(!el) return;
  let html='';
  if(!geoDB.length){
    html='<div style="color:var(--muted);font-size:12px">Геоданные не загружены</div>';
  } else {
    const byLayer={};
    geoDB.forEach(p=>{ const k=p.layer||'(без слоя)'; if(!byLayer[k]) byLayer[k]={count:0,color:p.color_key||'—'}; byLayer[k].count++; });
    const rows=Object.entries(byLayer).sort((a,b)=>b[1].count-a[1].count);
    html=`<div style="font-size:12px;margin-bottom:8px"><b>${geoDB.length}</b> точек в <b>${rows.length}</b> слоях</div>`+
      `<table><thead><tr><th>Слой</th><th>Цвет (ключ)</th><th>Точек</th></tr></thead><tbody>`+
      rows.map(([name,info])=>`<tr><td>${esc(name)}</td><td>${esc(info.color)}</td><td>${info.count}</td></tr>`).join('')+
      `</tbody></table>`;
  }
  // Алиасы точек (только локально, в облако не уходят)
  const aKeys=Object.keys(geoAliases);
  html+=`<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">`+
    `<div style="font-size:12px;font-weight:700;margin-bottom:6px">Алиасы точек (${aKeys.length})</div>`+
    `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Сопоставление названий из примечаний с точками базы. Хранятся локально.</div>`;
  if(!aKeys.length){
    html+='<div style="font-size:12px;color:var(--muted)">Алиасов нет</div>';
  } else {
    html+=`<table><thead><tr><th>Из примечания</th><th>Точка</th><th></th></tr></thead><tbody>`+
      aKeys.sort().map(k=>`<tr><td>${esc(k)}</td><td>${esc(geoAliases[k])}</td>`+
        `<td><button class="btn btn-danger btn-sm" style="font-size:10px" onclick="geoDeleteAlias('${esc(k).replace(/'/g,"\\'")}')">✕</button></td></tr>`).join('')+
      `</tbody></table>`;
  }
  html+=`</div>`;
  el.innerHTML=html;
}

function geoDeleteAlias(key){
  if(geoAliases[key]===undefined) return;
  delete geoAliases[key];
  geoAliasesSave();
  renderGeoTab();
}
