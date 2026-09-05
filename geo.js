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

// ===== Хранилище гео — IndexedDB (21.08.2026; ужесточено 05.09.2026 после потери базы) =====
// geo_points_db (~4.6 МБ на устройстве admin) занимал почти всю квоту localStorage
// (~5.24M символов): droneState переставал сохраняться, saveLocal молча падал —
// соучастник дрейфа склада. Гео — только локальное (в облако не ходит, страж
// geoStripFromSync), поэтому переехало в IndexedDB: БД `bpla_backups`/store `bak`,
// ключ 'geo_points_db'.
//
// ИНЦИДЕНТ 05.09.2026 — на боевом устройстве база ПРОПАЛА: в IndexedDB пусто, ключа в
// localStorage нет, geoDB=0; восстановили повторным импортом .ldk. Нашли два пути, и оба
// сходятся в одной ошибке — «пусто» принималось за «успех»:
//   1) МИГРАЦИЯ ПОДТВЕРЖДАЛА САМА СЕБЯ. Если значение из localStorage не разбиралось в массив,
//      geoDB становился [], в IndexedDB ложился [], перечитка возвращала [], и сверка
//      `back.length===geoDB.length` давала 0===0 → «перенос подтверждён» → ключ стирался,
//      а оператор видел зелёный тост «✓ База перенесена». Проверка сравнивала результат с УЖЕ
//      ДЕГРАДИРОВАВШИМ значением в памяти, а не с исходными данными, и потому не срабатывала
//      ровно в том случае, ради которого была написана.
//   2) ВЕТКА «IDB АВТОРИТЕТНА» СТИРАЛА localStorage БЕЗУСЛОВНО: гейт `fromIdb!==undefined &&
//      fromIdb!==null` проверял СУЩЕСТВОВАНИЕ значения, а не его пригодность, поэтому пустой
//      массив (в т.ч. посеянный пунктом 1), битая строка или объект от ручного консольного
//      бэкапа в тот же store означали «база есть» → geoDB=[] и единственная копия удалялась.
// Восстановить базу неоткуда, кроме повторного импорта .ldk. Отказ был молчаливым: приложение
// сутки считало вылеты без дистанций, это заметили по пустым километрам в журнале.
// Репродукция обоих путей на старом коде — _НЕ_ПУБЛИКОВАТЬ/tests/geo-storage-repro-old.js.
//
// Теперь действует инвариант: НЕПУСТАЯ база обязана существовать хотя бы в одном хранилище
// в любой момент времени. Из него следует всё остальное:
//   * пустое/битое значение НЕ авторитетнее непустой базы в другом хранилище: «пусто» — это
//     ровно тот исход, который даёт ЛЮБОЙ сбой, и он не должен побеждать живые данные;
//   * localStorage чистится ТОЛЬКО после перечитки, вернувшей валидный массив той же длины
//     и с тем же отпечатком — не «truthy» и не «значение есть»;
//   * две РАЗНЫЕ валидные базы (перекос версий: старая вкладка пишет только в localStorage)
//     — это расхождение, а не остаток: не удаляем ни одну, работаем с более полной, сообщаем;
//   * любая ошибка IndexedDB (недоступна, VersionError, нет store, зависший open, abort
//     транзакции) — работаем из localStorage, ключ не трогаем, оператору видно предупреждение;
//   * geoSave() не пишет пустой массив поверх непустой базы (только явная очистка) и считает
//     запись состоявшейся лишь после перечитки — «загружено» ≠ «сохранено»;
//   * пропажа видна сразу: несгораемый баннер, как #lsQuotaBar у переполнения localStorage.
const GEO_IDB_DB='bpla_backups', GEO_IDB_STORE='bak', GEO_IDB_KEY='geo_points_db';
const GEO_PREV_KEY='geo_points_db_prev'; // снимок перед «Очистить» — откат geoRestorePrev()
const GEO_LS_KEY='geo_points_db';        // тот же ключ в localStorage (легаси-хранилище и резерв)
const GEO_META_KEY='geo_db_meta';        // {n,ts} — след того, что на ЭТОМ устройстве база была
const GEO_IDB_TIMEOUT_MS=20000;

// localStorage бросает целиком (не только на записи), если сайту запрещены данные: доступ к
// нему из geoLoad обязан быть безопасным, иначе загрузка отваливается ДО показа предупреждения
// и отказ снова становится молчаливым.
let _geoLsBroken=false;   // localStorage бросил — «ключа нет» тогда не значит «базы не было»
function _geoLsGet(k){ try{ return localStorage.getItem(k); }catch(e){ _geoLsBroken=true; return null; } }
function _geoLsRemove(k){ try{ localStorage.removeItem(k); return true; }catch(e){ _geoLsBroken=true; return false; } }

// У IndexedDB есть состояния, в которых не приходит НИ onsuccess, НИ onerror: onblocked при
// апгрейде из другой вкладки, abort транзакции без error-события, известный «молчащий open»
// в Safari. Без таймаута geoLoad зависала бы навсегда — а вместе с ней и решение «чистить ли
// localStorage». onTimeout нужен, чтобы прибрать за опоздавшим успехом (см. _geoIdbOpen).
function _geoWithTimeout(p,what,onTimeout){
  return new Promise((res,rej)=>{
    let done=false;
    const t=setTimeout(()=>{ if(done)return; done=true; if(onTimeout) try{ onTimeout(); }catch(_){} rej(new Error('таймаут: '+what)); },GEO_IDB_TIMEOUT_MS);
    p.then(v=>{ if(done)return; done=true; clearTimeout(t); res(v); },
           e=>{ if(done)return; done=true; clearTimeout(t); rej(e); });
  });
}

// Открытие БД. Версию НЕ фиксируем: bpla_backups общая (туда же кладут ручные снимки состояния
// из консоли), и открытие с жёстко зашитой версией 1 упало бы VersionError там, где БД уже
// подняли выше. Если store'а нет — поднимаем версию на единицу и создаём. Соединение обязан
// закрыть вызывающий: незакрытое блокирует апгрейд из другой вкладки (onblocked → зависание),
// поэтому по таймауту опоздавший успех закрывается через guard.dead.
function _geoIdbOpen(){
  const guard={dead:false};
  return _geoWithTimeout(new Promise((res,rej)=>{
    if(typeof indexedDB==='undefined' || !indexedDB){ rej(new Error('IndexedDB недоступна')); return; }
    const settle=db=>{ if(guard.dead){ try{ db.close(); }catch(_){} return; } res(db); };
    // Любой отказ (не только таймаут) помечает попытку мёртвой: иначе опоздавший onsuccess
    // после onblocked оставил бы НЕЗАКРЫТОЕ соединение, а оно блокирует апгрейд из другой
    // вкладки — одноразовый сбой стал бы постоянным.
    const fail=e=>{ guard.dead=true; rej(e); };
    let q;
    try{ q=indexedDB.open(GEO_IDB_DB); }catch(e){ fail(e); return; }
    q.onerror=()=>fail(q.error||new Error('open error'));
    q.onblocked=()=>fail(new Error('IndexedDB заблокирована другой вкладкой'));
    q.onupgradeneeded=()=>{ try{ const d=q.result; if(!d.objectStoreNames.contains(GEO_IDB_STORE)) d.createObjectStore(GEO_IDB_STORE); }catch(e){} };
    q.onsuccess=()=>{
      const db=q.result;
      try{ db.onversionchange=()=>{ try{ db.close(); }catch(_){} }; }catch(_){}
      if(db.objectStoreNames.contains(GEO_IDB_STORE)){ settle(db); return; }
      // БД есть, а store'а нет (её создал не наш код) — поднимаем версию и добавляем store
      const v=(db.version||1)+1;
      try{ db.close(); }catch(_){}
      let q2;
      try{ q2=indexedDB.open(GEO_IDB_DB,v); }catch(e){ fail(e); return; }
      q2.onupgradeneeded=()=>{ try{ const d=q2.result; if(!d.objectStoreNames.contains(GEO_IDB_STORE)) d.createObjectStore(GEO_IDB_STORE); }catch(e){} };
      q2.onerror=()=>fail(q2.error||new Error('upgrade error'));
      q2.onblocked=()=>fail(new Error('IndexedDB заблокирована другой вкладкой'));
      q2.onsuccess=()=>{ const d=q2.result; try{ d.onversionchange=()=>{ try{ d.close(); }catch(_){} }; }catch(_){} settle(d); };
    };
  }),'открытие IndexedDB',()=>{ guard.dead=true; });
}

// Чтение/запись: результат отдаём по tx.oncomplete (запись подтверждена коммитом), ошибку —
// по onerror И по onabort (abort без error-события промис прежней версии не завершал вовсе).
function _geoIdbGet(k){
  return _geoIdbOpen().then(db=>{
    const done=v=>{ try{ db.close(); }catch(_){} return v; };
    const boom=e=>{ try{ db.close(); }catch(_){} throw e; };
    return _geoWithTimeout(new Promise((res,rej)=>{
      let tx;
      try{ tx=db.transaction(GEO_IDB_STORE); }catch(e){ rej(e); return; } // NotFoundError кидается синхронно
      // Причину отказа держим с уровня ЗАПРОСА: в обработчике tx.onerror поле tx.error по
      // спецификации ещё null (транзакция аборится после диспатча error-события), и без этого
      // в журнале оставалось бы бесполезное «чтение не удалось» вместо имени ошибки
      let val, reqErr=null;
      try{ const r=tx.objectStore(GEO_IDB_STORE).get(k); r.onsuccess=()=>{ val=r.result; }; r.onerror=()=>{ reqErr=r.error; }; }
      catch(e){ rej(e); return; }
      tx.oncomplete=()=>res(val);
      tx.onerror=()=>rej(reqErr||tx.error||new Error('чтение из IndexedDB не удалось'));
      tx.onabort=()=>rej(reqErr||tx.error||new Error('чтение из IndexedDB прервано'));
    }),'чтение гео из IndexedDB').then(done,boom);
  });
}
function _geoIdbPut(k,v){
  return _geoIdbOpen().then(db=>{
    const done=r=>{ try{ db.close(); }catch(_){} return r; };
    const boom=e=>{ try{ db.close(); }catch(_){} throw e; };
    return _geoWithTimeout(new Promise((res,rej)=>{
      let tx;
      try{ tx=db.transaction(GEO_IDB_STORE,'readwrite'); }catch(e){ rej(e); return; }
      let reqErr=null;                              // см. комментарий в _geoIdbGet: tx.error пуст
      try{ const r=tx.objectStore(GEO_IDB_STORE).put(v,k); r.onerror=()=>{ reqErr=r.error; }; }
      catch(e){ rej(e); return; }
      tx.oncomplete=()=>res(true);
      tx.onerror=()=>rej(reqErr||tx.error||new Error('запись в IndexedDB не удалась'));
      tx.onabort=()=>rej(reqErr||tx.error||new Error('запись в IndexedDB прервана'));
    }),'запись гео в IndexedDB').then(done,boom);
  });
}

// Значение из хранилища → массив точек. В IDB база могла лечь и JSON-строкой (ранние ручные
// бэкапы из консоли), в localStorage она всегда строка.
function _geoParseBase(v){
  if(typeof v==='string'){ try{ v=JSON.parse(v); }catch(e){ return null; } }
  return Array.isArray(v)?v:null;
}
function _geoPtOk(p){ return !!p && typeof p.lat==='number' && typeof p.lon==='number' && !isNaN(p.lat) && !isNaN(p.lon); }
// Валидная база — непустой массив точек с числовыми координатами (проверяем края и середину:
// поэлементно 4.6 МБ на каждом старте дорого). Пустой массив базой НЕ считается намеренно —
// см. инвариант выше: именно «пусто» выдаёт любой сбой хранилища.
function _geoIsValidBase(v){
  return Array.isArray(v) && v.length>0 && _geoPtOk(v[0]) && _geoPtOk(v[v.length-1]) && _geoPtOk(v[v.length>>1]);
}
// Отпечаток для подтверждения записи и сравнения двух баз: длина + координаты первой,
// средней и последней точки.
function _geoFingerprint(v){
  if(!Array.isArray(v) || !v.length) return 'empty';
  const a=v[0], m=v[v.length>>1], b=v[v.length-1];
  return v.length+'|'+a.lat+','+a.lon+'|'+m.lat+','+m.lon+'|'+b.lat+','+b.lon;
}

// След «на этом устройстве база была»: нужен, чтобы отличить пропажу от устройства, куда
// .ldk никогда не загружали, и назвать в баннере, сколько точек было. Пишется ТОЛЬКО после
// подтверждённого наличия/записи — иначе он врал бы именно тогда, когда на него смотрят.
function _geoMetaRead(){ try{ const m=JSON.parse(_geoLsGet(GEO_META_KEY)||'null'); return (m&&typeof m.n==='number')?m:null; }catch(e){ return null; } }
function _geoMetaWrite(n){ try{ localStorage.setItem(GEO_META_KEY, JSON.stringify({n:n, ts:Date.now()})); }catch(e){} }
function _geoMetaClear(){ _geoLsRemove(GEO_META_KEY); }

// Громкий сигнал о состоянии гео-хранилища. Паттерн — как у #lsQuotaBar (app.js): несгораемый
// баннер поверх интерфейса + console.error + тост. Прошлый инцидент заметили только через
// сутки по пустым километрам в журнале — тихого console.warn недостаточно.
// soft=true — состояние штатное для этого устройства (.ldk сюда просто не загружали): баннер
// оранжевый и его можно закрыть до перезагрузки, иначе несгораемый баннер висел бы на каждом
// устройстве без гео и к нему привыкли бы — тогда настоящий сигнал о пропаже потерялся бы.
let _geoWarnActive=false;
function geoStorageWarn(text,detail,soft){
  console.error('[GEO] '+text+(detail?' | '+detail:''));
  _geoWarnActive=true;
  try{
    if(typeof document==='undefined') return;
    // geoLoad отрабатывает раньше готовности DOM только в теории (скрипты в конце body),
    // но глотать сигнал из-за этого нельзя — откладываем показ
    if(!document.body){ document.addEventListener('DOMContentLoaded',()=>geoStorageWarn(text,detail,soft),{once:true}); return; }
    let bar=document.getElementById('geoWarnBar');
    if(!bar){
      bar=document.createElement('div'); bar.id='geoWarnBar';
      // Внизу экрана, а НЕ вверху: сверху уже живут #lsQuotaBar (z-index 10001) и topbar —
      // верхний баннер либо прятался бы под баннером квоты, либо перекрывал контролы шапки.
      // Отступ вычислялся один раз при показе, поэтому позже появившийся баннер квоты просто
      // закрывал бы гео-предупреждение, то есть снова тишина. Низ ни с чем не пересекается.
      bar.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:9998;color:#fff;font:600 13px/1.4 var(--font-sans,sans-serif);padding:8px 14px;text-align:center;box-shadow:0 -2px 8px #0006';
      document.body.appendChild(bar);
    }
    bar.style.background=soft?'#b45309':'#b91c1c';
    bar.textContent=text;                       // textContent, не innerHTML — текст наш, но правило общее
    if(soft){
      const x=document.createElement('button');
      x.textContent='✕'; x.title='Скрыть до перезагрузки';
      x.style.cssText='margin-left:12px;background:transparent;border:1px solid #ffffff88;color:#fff;border-radius:4px;cursor:pointer;font:600 12px/1 var(--font-sans,sans-serif);padding:2px 7px';
      x.onclick=()=>{ try{ bar.remove(); }catch(_){} };
      try{ bar.appendChild(x); }catch(_){}
    }
    // Тост — только для настоящих неприятностей: на устройстве без гео он всплывал бы при
    // КАЖДОЙ загрузке, и к предупреждениям гео перестали бы относиться серьёзно
    if(!soft && typeof showSyncToast==='function') showSyncToast(text,10000);
  }catch(_){}
}
function geoStorageOk(){
  if(!_geoWarnActive) return;
  _geoWarnActive=false;
  try{ const bar=document.getElementById('geoWarnBar'); if(bar) bar.remove(); }catch(_){}
}

let _geoLoaded=false;      // загрузка завершена (до этого geoDB=[] — это НЕ «база пуста»)
let _geoLsFallback=false;  // последняя запись прошла только в localStorage (IndexedDB отказала)
let _geoGen=0;             // растёт при ЯВНОЙ замене базы (импорт/очистка) — см. geoLoad
let _geoWriteChain=Promise.resolve();
let _geoNoBaseNoticed=false;

function geoIsReady(){ return _geoLoaded; }
function geoHasBase(){ return _geoLoaded && geoDB.length>0; }
function geoWhenReady(fn){ return Promise.resolve(geoReady).then(fn,fn); }
// Одно уведомление за сессию в местах, где отсутствие базы выражается лишь пустой дистанцией
// (сохранение вылета). Именно эта тишина растянула прошлый инцидент на сутки.
function geoNoBaseNotice(where){
  if(geoDB.length) return false;
  if(!_geoNoBaseNoticed){
    _geoNoBaseNoticed=true;
    const t='⚠ Гео-база не загружена — дальности вылетов НЕ считаются'+(where?' ('+where+')':'')+'. Администратор → Карта/Гео → Загрузить .ldk';
    console.warn('[GEO] '+t);
    if(typeof showSyncToast==='function') try{ showSyncToast(t,8000); }catch(_){}
  }
  return true;
}

// Загрузка базы. Асинхронная: geoDB нужен при расчёте дистанций/импорте/вкладке Карта/Гео —
// к этому моменту данные уже на месте. Промис geoReady — для тех, кому нужно дождаться.
async function geoLoad(){
  const gen0=_geoGen;
  let fromIdb=null, idbErr=null;
  try{ fromIdb=await _geoIdbGet(GEO_IDB_KEY); }
  catch(e){ idbErr=e; console.warn('[GEO] IDB read:', e&&e.message); }
  // Пока читали, оператор мог загрузить .ldk или очистить базу — его действие главнее
  if(_geoGen!==gen0){ _geoLoaded=true; return geoDB; }

  const lsRaw=_geoLsGet(GEO_LS_KEY);
  const idbBase=_geoParseBase(fromIdb);
  const lsBase=(lsRaw===null)?null:_geoParseBase(lsRaw);
  const meta=_geoMetaRead();

  if(_geoIsValidBase(idbBase)){
    // IndexedDB авторитетна ТОЛЬКО когда там валидная непустая база.
    // Особый случай — В ОБОИХ хранилищах валидные, но РАЗНЫЕ базы. Так бывает при перекосе
    // версий: вкладка со старым кешем geo.js пишет базу только в localStorage, а новая
    // при следующей загрузке сочла бы её остатком и стёрла свежий импорт. Ничего не удаляем,
    // берём в работу более полную и показываем расхождение оператору.
    const conflict=_geoIsValidBase(lsBase) && _geoFingerprint(lsBase)!==_geoFingerprint(idbBase);
    if(conflict){
      geoDB=(lsBase.length>idbBase.length)?lsBase:idbBase;
      geoStorageWarn('⚠ Две разные гео-базы: IndexedDB '+idbBase.length+' точек, localStorage '+lsBase.length+
        '. В работе — бо́льшая ('+geoDB.length+'). Ничего не удалено. Загрузите нужный .ldk заново, чтобы снять расхождение.');
    } else {
      geoDB=idbBase;
      // остаток совпадает с базой в IDB (или нечитаем) — копия лишняя, освобождаем квоту
      if(lsRaw!==null && _geoLsRemove(GEO_LS_KEY)) console.log('[GEO] остаток '+GEO_LS_KEY+' удалён из localStorage (в IndexedDB '+geoDB.length+' точек)');
      geoStorageOk();
    }
    _geoMetaWrite(geoDB.length);
  } else if(_geoIsValidBase(lsBase)){
    // В IDB пусто/мусор/ошибка, а в localStorage живая база — она главнее. Переносим в IDB
    // и удаляем из localStorage ТОЛЬКО после перечитки, подтвердившей длину и отпечаток.
    geoDB=lsBase;
    _geoMetaWrite(geoDB.length);
    const want=_geoFingerprint(geoDB), n=geoDB.length;
    try{
      if(idbErr) throw idbErr;                 // читать не смогли — писать тем более не станем
      if(_geoGen!==gen0){ _geoLoaded=true; return geoDB; }   // проверка вплотную к записи
      // Через общую очередь записей: иначе опоздавший put миграции мог лечь ПОСЛЕ записи
      // импорта, сделанного оператором в это же окно, и вернуть в хранилище старую базу
      const mine=geoDB;
      const migrate=()=>(_geoGen!==gen0)?Promise.resolve(true):_geoIdbPut(GEO_IDB_KEY, mine);
      _geoWriteChain=_geoWriteChain.then(migrate,migrate);
      await _geoWriteChain;
      if(_geoGen!==gen0){ _geoLoaded=true; return geoDB; }
      const back=_geoParseBase(await _geoIdbGet(GEO_IDB_KEY));
      if(_geoIsValidBase(back) && back.length===n && _geoFingerprint(back)===want){
        _geoLsRemove(GEO_LS_KEY);
        console.log('[GEO] '+GEO_LS_KEY+' перенесён в IndexedDB ('+n+' точек, '+lsRaw.length+' символов освобождено в localStorage)');
        if(typeof showSyncToast==='function') showSyncToast('✓ База гео-точек перенесена в IndexedDB — localStorage освобождён', 5000);
        geoStorageOk();
      } else {
        _geoLsFallback=true;
        geoStorageWarn('⚠ Гео-база НЕ перенесена в IndexedDB (перечитка не совпала) — работаем из localStorage, данные целы. Сообщите администратору.');
      }
    }catch(e){
      _geoLsFallback=true;
      geoStorageWarn('⚠ IndexedDB недоступна — гео-база ('+n+' точек) осталась в localStorage. Место в localStorage не освобождено.', e&&e.message);
    }
  } else {
    // Валидной базы нет нигде — сигналим ВСЕГДА (прошлый инцидент заметили через сутки по
    // пустым километрам). Текст разный: он же и первичная диагностика для администратора.
    geoDB=[];
    _geoLsFallback=!!idbErr;
    const hadGarbage=(fromIdb!==undefined && fromIdb!==null) || lsRaw!==null;
    // «База тут была» — единственное основание бить тревогу. Если следа нет и localStorage
    // читается, устройство просто без гео (таких большинство: пилоты, наблюдатели) — на них
    // несгораемый баннер каждую загрузку обесценил бы настоящий сигнал о пропаже.
    const hadBase=(meta && meta.n>0) || _geoLsBroken;
    const tail=' — дальности вылетов НЕ считаются. Загрузите .ldk: Администратор → Карта/Гео.';
    if(meta && meta.n>0){
      geoStorageWarn('⛔ ГЕО-БАЗА ПРОПАЛА (было '+meta.n+' точек)'+tail, idbErr&&idbErr.message);
    } else if(hadGarbage){
      geoStorageWarn('⛔ ГЕО-БАЗА НЕ ЧИТАЕТСЯ (сохранённое значение повреждено)'+tail, idbErr&&idbErr.message);
    } else if(_geoLsBroken){
      geoStorageWarn('⛔ ХРАНИЛИЩЕ НЕДОСТУПНО (браузер запретил данные сайта) — гео-база не загружена и не сохранится'+tail, idbErr&&idbErr.message);
    } else if(idbErr){
      geoStorageWarn((hadBase?'⛔ ':'⚠ ')+'IndexedDB недоступна, гео-база не загружена'+tail, idbErr&&idbErr.message, !hadBase);
    } else {
      geoStorageWarn('⚠ Гео-база пуста (на это устройство .ldk не загружали)'+tail, '', true);
    }
  }

  // Попросить браузер не вытеснять хранилище: база в облако не уходит, второй копии нет,
  // а без persist() origin лежит в best-effort корзине и чистится при нехватке места.
  // Спрашиваем ОДИН раз на устройство: в Firefox persist() — всплывающий запрос разрешения,
  // и при отказе persisted() остаётся false, то есть запрос повторялся бы на каждой загрузке.
  try{
    if(geoDB.length && _geoLsGet('geo_persist_asked')===null &&
       typeof navigator!=='undefined' && navigator.storage && navigator.storage.persist && navigator.storage.persisted){
      navigator.storage.persisted().then(p=>{
        if(p) return true;
        try{ localStorage.setItem('geo_persist_asked','1'); }catch(_){}
        return navigator.storage.persist();
      }).catch(()=>{});
    }
  }catch(_){}

  geoBuildIndex(); _geoLoaded=true;
  if(typeof renderGeoTab==='function') try{ const el=document.getElementById('adm-geo'); if(el&&el.offsetParent!==null) renderGeoTab(); }catch(e){}
  return geoDB;
}

// Фактическая запись: IndexedDB → перечитка (запись считается состоявшейся только после неё —
// «загружено» ≠ «сохранено», это тот же класс ошибки, что погубил базу при миграции) →
// снятие лишней копии из localStorage. При отказе IndexedDB база уходит в localStorage,
// чтобы импорт не пропал при перезагрузке; молчать нельзя ни в одном из исходов.
function _geoWriteNow(snapshot,n,allowEmpty){
  const want=_geoFingerprint(snapshot);
  return _geoIdbPut(GEO_IDB_KEY, snapshot)
    .then(()=>_geoIdbGet(GEO_IDB_KEY))
    .then(back=>{
      const b=_geoParseBase(back);
      const good = n ? (_geoIsValidBase(b) && b.length===n && _geoFingerprint(b)===want)
                     : (Array.isArray(b) && !b.length);
      if(!good) throw new Error('перечитка после записи не совпала');
      _geoLsFallback=false;                       // IndexedDB снова рабочая
      if(n) _geoMetaWrite(n); else _geoMetaClear();
      // запись закоммичена и подтверждена — копия в localStorage заведомо устарела
      if(_geoLsGet(GEO_LS_KEY)!==null) _geoLsRemove(GEO_LS_KEY);
      geoStorageOk();
      return true;
    })
    .catch(e=>{
      // Очистку в резерв не пишем: пустой массив в localStorage — это не «очищено»
      // (старая база осталась бы в IndexedDB и воскресла), а ложный сигнал «база не читается»
      if(allowEmpty && !n){
        geoStorageWarn('⛔ Очистка гео-базы НЕ выполнена (IndexedDB не приняла запись) — база осталась на месте.', e&&e.message);
        return false;
      }
      let saved=false;
      try{ localStorage.setItem(GEO_LS_KEY, JSON.stringify(snapshot)); saved=true; _geoLsFallback=true; _geoMetaWrite(n); }
      catch(lsErr){ if(typeof lsQuotaWarn==='function') lsQuotaWarn(lsErr); }
      geoStorageWarn(saved
        ? '⚠ Гео-база не записалась в IndexedDB — сохранена в localStorage ('+n+' точек). Место в localStorage занято, сообщите администратору.'
        : '⛔ Гео-база НЕ СОХРАНЕНА (ни IndexedDB, ни localStorage) — после перезагрузки данные пропадут.', e&&e.message);
      return saved;
    });
}

// Сохранение базы. Пустой массив пишется ТОЛЬКО по явной очистке ({allowEmpty:true}): иначе
// любой недогруз (geoDB ещё [] пока идёт geoLoad) или сбой затёр бы валидную базу, единственная
// копия которой — это хранилище. Записи сериализованы: «импорт → сразу очистка» и опоздавшая
// запись миграции не должны переставляться местами.
function geoSave(opts){
  const allowEmpty=!!(opts&&opts.allowEmpty);
  const snapshot=geoDB.slice(0), n=snapshot.length;
  if(!n && !allowEmpty){
    console.warn('[GEO] geoSave пропущен: база пуста, явной очистки не было (защита от затирания)');
    return Promise.resolve(false);
  }
  const run=()=>_geoWriteNow(snapshot,n,allowEmpty);
  _geoWriteChain=_geoWriteChain.then(run,run);
  return _geoWriteChain;
}

// Диагностика хранилища (только чтение) — из консоли: await geoStorageDiag().
// Инцидент 05.09 оказался неразбираемым постфактум ровно потому, что улики снимали руками
// и «нет ключа» не отличили от «ключ есть, но пустой».
async function geoStorageDiag(){
  const out={ready:_geoLoaded, inMemory:geoDB.length, lsFallback:_geoLsFallback, meta:_geoMetaRead()};
  const lsRaw=_geoLsGet(GEO_LS_KEY);
  out.localStorage = lsRaw===null ? 'ключа нет' : (_geoIsValidBase(_geoParseBase(lsRaw))
    ? 'база, '+_geoParseBase(lsRaw).length+' точек ('+lsRaw.length+' символов)'
    : 'ЗНАЧЕНИЕ ЕСТЬ, НО НЕ БАЗА ('+lsRaw.length+' символов): '+lsRaw.slice(0,60));
  try{
    const v=await _geoIdbGet(GEO_IDB_KEY);
    const b=_geoParseBase(v);
    out.indexedDB = v===undefined ? 'ключа нет' : (_geoIsValidBase(b) ? 'база, '+b.length+' точек'
      : 'ЗНАЧЕНИЕ ЕСТЬ, НО НЕ БАЗА: '+JSON.stringify(v).slice(0,60));
  }catch(e){ out.indexedDB='ОШИБКА: '+(e&&e.message); }
  try{ const p=await _geoIdbGet(GEO_PREV_KEY); const pb=_geoParseBase(p);
       out.prevSnapshot = _geoIsValidBase(pb) ? pb.length+' точек (geoRestorePrev())' : 'нет'; }
  catch(e){ out.prevSnapshot='нет'; }
  console.table(out);
  return out;
}
// Откат ошибочной «Очистить геоданные»: снимок делается в geoClearDB перед очисткой.
async function geoRestorePrev(){
  if(typeof guardAdmin==='function' && !guardAdmin()) return false;
  let prev=null;
  try{ prev=_geoParseBase(await _geoIdbGet(GEO_PREV_KEY)); }catch(e){}
  if(!_geoIsValidBase(prev)){ alert('Предыдущей базы в хранилище нет.'); return false; }
  if(!confirm('Вернуть предыдущую базу ('+prev.length+' точек)? Текущая ('+geoDB.length+') будет заменена.')) return false;
  geoDB=prev; _geoGen++; geoBuildIndex();
  const ok=await geoSave();
  if(typeof renderGeoTab==='function') try{ renderGeoTab(); }catch(e){}
  console.log('[GEO] предыдущая база возвращена: '+prev.length+' точек, сохранение: '+ok);
  return ok;
}
// Любой отказ загрузки обязан быть видимым: иначе _geoLoaded навсегда false, geoReady —
// необработанный отклонённый промис, а на экране просто нет километров.
const geoReady = geoLoad().catch(e=>{
  _geoLoaded=true;
  geoStorageWarn('⛔ ГЕО-БАЗА НЕ ЗАГРУЗИЛАСЬ ('+((e&&e.message)||'ошибка хранилища')+') — дальности вылетов НЕ считаются. Перезагрузите страницу.');
  return geoDB;
});

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
    delete data.geo_aliases; delete data.geoAliases; delete data.geo_db_meta;
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

// Пересчёт ПУТИ из уже сохранённой дальности, без обращения к базе точек.
// Дальность (старт→цель) от статуса борта не зависит, а путь зависит: ×2 при возврате, ×1 при
// потере. Поэтому при смене «вернул↔потерян» правильный путь получается арифметикой, даже когда
// база не загружена или точка не нашлась — раньше в этом случае оставался путь ОТ ПРЕЖНЕГО
// статуса, зафиксированный 🔒, и его не чинил ни один массовый пересчёт.
// Промежуточную точку из примечания не учитываем (её знает только geoComputeFlight) — это
// тот же запасной вариант «туда-обратно», что и в самом geoComputeFlight, когда точка не найдена.
function geoRedistance(f){
  if(!f || f.range_km==null || isNaN(f.range_km)) return false;
  f.distance_km = geoRound2(f.returned==='yes' ? f.range_km*2 : f.range_km);
  return true;
}

// Проставить дистанции в объект вылета (при сохранении)
function geoApplyToFlight(f){
  // «Базы нет» и «точка не найдена» здесь выглядели одинаково — молча, пустой дистанцией.
  // Именно эта тишина растянула инцидент 05.09 на сутки, поэтому первый случай называем вслух.
  if(geoNoBaseNotice('сохранение вылета')) return f;
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
  // Пустая база даёт «✓ Пересчитано: 0» и выглядит как успех, а при force+includeLocked ещё и
  // СТИРАЕТ дистанции у вылетов result=no/returned=no — то есть тихо портит данные.
  if(!geoDB.length){
    const msg=_geoLoaded?'Гео-база не загружена — пересчитывать нечем. Загрузите .ldk.'
                        :'Гео-база ещё загружается — повторите через несколько секунд.';
    if(typeof setStatus==='function') setStatus('geo-status',msg,'err');
    if(typeof showSyncToast==='function') showSyncToast('⚠ '+msg,8000);
    geoProgressHide();
    if(opts.onProgress) opts.onProgress(0,0);
    if(opts.onDone) opts.onDone(0);
    return;
  }
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
      // _geoGen — отметка «базу заменили явно»: если ещё идёт geoLoad, она не затрёт импорт
      geoDB=points; _geoGen++; geoBuildIndex();               // индекс строится один раз после парсинга
      // «Загружено» ≠ «сохранено»: geoSave подтверждает запись перечиткой, и отказ должен
      // дойти до оператора здесь же, а не всплыть пропажей базы после перезагрузки.
      // Флаг нужен, потому что пересчёт вылетов заканчивается ПОЗЖЕ и своим зелёным
      // «✓ Пересчитано...» затирал бы это сообщение об отказе.
      let saveFailed=false;
      geoSave().then(saved=>{ if(!saved){ saveFailed=true; setStatus('geo-status','⛔ База НЕ сохранена в хранилище — см. предупреждение внизу экрана. Не закрывайте вкладку.','err'); } });
      const layerCount=new Set(points.map(p=>p.layer)).size;
      renderGeoTab();
      setStatus('geo-status','✓ Загружено: '+points.length+' точек, '+layerCount+' слоёв. Идёт пересчёт вылетов...','ok');
      // Пересчёт асинхронно (батчами) — не блокирует UI
      geoRecomputeFlights({force:false, onDone:rec=>{
        if(saveFailed) setStatus('geo-status','⛔ База НЕ сохранена в хранилище (пересчитано вылетов: '+rec+') — см. предупреждение внизу экрана.','err');
        else setStatus('geo-status','✓ Загружено: '+points.length+' точек, '+layerCount+' слоёв. Пересчитано вылетов: '+rec,'ok');
        renderFlights();
        if(document.getElementById('page-report')?.classList.contains('active')) buildReport();
      }});
    }catch(err){ console.error('[GEO] parse error:', err); setStatus('geo-status','Ошибка разбора: '+err.message,'err'); }
  };
  reader.onerror=()=>setStatus('geo-status','Ошибка чтения файла','err');
  reader.readAsArrayBuffer(file);
  input.value='';
}

async function geoClearDB(){
  // geoDB=[] в памяти — это НЕ «база пуста»: так же выглядят незавершённая загрузка и ЛЮБОЙ
  // сбой чтения хранилища. А оба рельса ниже (второе подтверждение и снимок под откат) висели
  // на geoDB.length и в этом состоянии молча пропускались — то есть отключались ровно тогда,
  // когда нужнее всего. Хуже того, соседний renderGeoTab в этот момент пишет «⛔ База точек
  // ПРОПАЛА» прямо над этой красной кнопкой и буквально подталкивает нажать её; сбой чтения
  // (onblocked от другой вкладки, таймаут, abort) переходящий, поэтому запись пустой базы
  // проходит и затирает живые данные. Поэтому решения принимаем по СОДЕРЖИМОМУ ХРАНИЛИЩА.
  if(!_geoLoaded){ alert('База точек ещё загружается из хранилища — повторите через несколько секунд.'); return; }
  if(!confirm('Удалить все загруженные геоданные?')) return;
  let prev=geoDB.slice(0);
  if(!prev.length){
    let stored=null;
    try{ stored=_geoParseBase(await _geoIdbGet(GEO_IDB_KEY)); }
    catch(e){ alert('Хранилище недоступно ('+((e&&e.message)||'ошибка')+') — очистка отменена, чтобы не стереть базу вслепую.\nПерезагрузите страницу и повторите.'); return; }
    if(_geoIsValidBase(stored)) prev=stored;    // база жива, просто не доехала до памяти
  }
  // Копии базы нет НИГДЕ, кроме этого браузера: в облако гео не уходит (geoStripFromSync)
  if(prev.length && !confirm('В базе '+prev.length+' точек, копии в облаке НЕТ. Восстановление — только повторным импортом .ldk (или geoRestorePrev() из консоли). Точно очистить?')) return;
  // Снимок ДО перезаписи и С ПОДТВЕРЖДЕНИЕМ: обещание «откат — geoRestorePrev()» в статусе
  // ниже должно быть правдой, а не надеждой (раньше запись шла fire-and-forget с .catch(()=>{}))
  if(prev.length){
    let snap=false;
    try{ snap=await _geoIdbPut(GEO_PREV_KEY, prev.slice(0)); }catch(e){}
    if(!snap && !confirm('Снимок для отката сделать не удалось — откатывать очистку будет НЕЧЕМ. Всё равно очистить?')) return;
  }
  // allowEmpty — единственный путь, которому разрешено записать в хранилище пустую базу
  geoDB=[]; _geoGen++; geoBuildIndex();
  geoSave({allowEmpty:true}).then(done=>{
    setStatus('geo-status', done?'Геоданные очищены (откат — geoRestorePrev() в консоли)'
                                :'⛔ Очистка НЕ выполнена — база осталась в хранилище', done?'muted':'err');
    renderGeoTab();
  });
  renderGeoTab();
}

function renderGeoTab(){
  const el=document.getElementById('geo-stats');
  if(!el) return;
  let html='';
  // Три РАЗНЫХ состояния раньше показывались одним текстом «Геоданные не загружены» — и рядом
  // стоит красная «Очистить геоданные». Оператор, увидевший это во время загрузки или после
  // сбоя хранилища, естественным образом тянется очистить и загрузить заново.
  if(!_geoLoaded){
    html='<div style="color:var(--muted);font-size:12px">⏳ База точек загружается из хранилища...</div>';
  } else if(!geoDB.length){
    const m=_geoMetaRead();
    html='<div style="color:var(--red);font-size:12px;font-weight:700">'+
      (m&&m.n>0?'⛔ База точек ПРОПАЛА (в последний раз было '+m.n+' точек)':'Геоданные не загружены')+
      '</div><div style="color:var(--muted);font-size:11px;margin-top:4px">Дальности вылетов не считаются — загрузите .ldk.</div>';
  } else {
    const byLayer={};
    geoDB.forEach(p=>{ const k=p.layer||'(без слоя)'; if(!byLayer[k]) byLayer[k]={count:0,color:p.color_key||'—'}; byLayer[k].count++; });
    const rows=Object.entries(byLayer).sort((a,b)=>b[1].count-a[1].count);
    // «Вылетов без дистанций» — то самое последствие, по которому инцидент нашли через сутки;
    // пусть оно видно на месте, а не в километрах журнала
    // Вылеты, которым дистанция НЕ положена по правилу самого геомодуля (борт не долетел:
    // result=no и returned=no), из счётчика исключаем — иначе он никогда не показывал бы ноль
    // и янтарная пометка стала бы постоянным фоном.
    const noDist=(typeof state==='object'&&state&&state.flights?state.flights:[])
      .filter(f=>f.range_km==null && !(f.result==='no'&&f.returned==='no')).length;
    html=`<div style="font-size:12px;margin-bottom:8px"><b>${geoDB.length}</b> точек в <b>${rows.length}</b> слоях`+
      ` · хранилище: ${esc(_geoLsFallback?'localStorage (резерв!)':'IndexedDB')}`+
      (noDist?` · <span style="color:var(--amber)">вылетов без дистанций: <b>${noDist}</b></span>`:'')+`</div>`+
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
