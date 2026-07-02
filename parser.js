// parser.js — импорт и AI-парсер сообщений (часть app.js, грузить ПЕРЕД reports.js/app.js)

// ============ AI-КОНСТАНТЫ (единая точка, 02.07.2026) ============
// Модель для ВСЕХ AI-вызовов проекта: парсер (здесь) + устный доклад и репортаж
// (reports.js — грузится после parser.js, берёт константу в рантайме). Смена модели —
// ТОЛЬКО здесь (раньше id был захардкожен в 3 местах, миграция = 3 правки в 2 файлах).
const AI_MODEL='claude-sonnet-4-6';
// Таймаут AI-вызова парсера, мс. У vr/rpg свои (10с/20с — короткие payload'ы);
// парсер обрабатывает длинные простыни сообщений — даём больше.
const AI_PARSE_TIMEOUT_MS=45000;
// fetch с жёстким таймаутом: по истечении timeoutMs запрос отменяется (AbortController),
// promise падает с AbortError (e.name==='AbortError' — ловить в catch вызывающего).
function aiFetchWithTimeout(url,options,timeoutMs){
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(),timeoutMs);
  return fetch(url,{...options,signal:ctrl.signal}).finally(()=>clearTimeout(tid));
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
  if(!guardWrite())return; // viewer — только просмотр (вкладка Импорт и так скрыта)
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
  // Словарь моделей для нормализации — динамический (каталог ∪ склад ∪ расчёты),
  // иначе AI схлопывает новые борта к ближайшему старому (напр. «ПВХ 2» → «ПВХ1»).
  const droneVocab=(typeof getDroneVocab==='function')?getDroneVocab():DRONE_CATALOG;
  try{
    // Раньше был единственный AI-вызов БЕЗ таймаута — оборванная сеть вешала импорт навечно.
    const resp=await aiFetchWithTimeout('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({
        model:AI_MODEL,
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
- drone: нормализуй написание к ближайшему из словаря: ${droneVocab.join(', ')}. Если в тексте модель отличается от всех в словаре (другой номер/суффикс) — НЕ подменяй её ближайшей, оставь как в тексте (оператор уточнит вручную)
Верни ТОЛЬКО JSON-массив.`,
        messages:[{role:'user',content:numberedInput}]
      })
    },AI_PARSE_TIMEOUT_MS);
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
    // Отменённый по таймауту запрос — понятная ошибка, а не «AbortError»/вечное «Распознаю...»
    if(e&&e.name==='AbortError')
      setStatus(st,'Ошибка: сервер не ответил за '+(AI_PARSE_TIMEOUT_MS/1000)+' сек (сеть или API недоступны). Проверьте соединение и повторите.','err');
    else
      setStatus(st,'Ошибка: '+e.message,'err');
  }
}

function renderParsedCards(items){
  document.getElementById('parsedCards').innerHTML=items.map((x,i)=>`
    <div class="card" style="margin-bottom:8px" id="pcard-${i}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700;color:var(--muted)">Вылет ${esc(x.flightnum||i+1)} — ${esc(x.pilot||'?')} · ${esc(x.date||'')} ${esc(x.time||'')}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-success btn-sm" id="pbtn-save-${i}" onclick="confirmParsed(${i})">✓ Сохранить</button>
          <button class="btn btn-sm" style="color:var(--muted)" onclick="hideCard(${i})">Скрыть</button>
        </div>
      </div>
      ${x._src?`<div id="psrc-${i}" style="font-size:11px;color:var(--muted);background:var(--bg2);border:1px solid var(--border);padding:5px 8px;margin-bottom:8px;font-family:monospace;white-space:pre-wrap">${esc(x._src)}</div>`:''}
      <div class="form-row cols3">
        <div><label>Дата</label><input id="p${i}-date" type="date" value="${esc(x.date)}"></div>
        <div><label>Время</label><input id="p${i}-time" type="time" value="${esc(x.time)}"></div>
        <div><label>Номер вылета</label><input id="p${i}-flightnum" type="number" min="1" value="${esc(x.flightnum||'')}"></div>
      </div>
      <div class="form-row cols3">
        <div><label>Пилот</label><input id="p${i}-pilot" value="${esc(x.pilot||'')}"></div>
        <div><label>Точка</label><input id="p${i}-target" value="${esc(x.target||'')}"></div>
        <div><label>Боеприпас / груз</label><input id="p${i}-ammo" value="${esc(x.ammo||'')}"></div>
      </div>
      <div class="form-row cols3">
        <div><label>БПЛА</label><input id="p${i}-drone" value="${esc(x.drone||'')}"></div>
        <div><label>Задача</label>
          <select id="p${i}-result"><option value="yes" ${x.result==='yes'?'selected':''}>Выполнена</option><option value="no" ${x.result==='no'?'selected':''}>Не выполнена</option></select>
        </div>
        <div><label>Борт</label>
          <select id="p${i}-returned"><option value="yes" ${x.returned==='yes'?'selected':''}>Вернул</option><option value="no" ${x.returned==='no'?'selected':''}>Потерян</option></select>
        </div>
      </div>
      <div><label>Примечание</label><input id="p${i}-note" value="${esc(x.note||'')}"></div>
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
  if(!guardWrite())return; // viewer — только просмотр
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
    _savedTs:Date.now(),                  // окно редактирования и атрибуция —
    _submittedBy:authUser.login||'',      // как в saveQuickFlight
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
  geoApplyToFlight(f);  // дистанции если есть гео и точка старта
  applyLossIfNeeded(f);
  // 1. Скрываем карточку сразу — не дожидаясь отправки вылета на сервер
  const card=document.getElementById(`pcard-${i}`);
  const src=document.getElementById(`psrc-${i}`);
  if(src)src.style.display='none';
  card.style.background='var(--green-dim)';
  card.style.border='1px solid var(--green3)';
  const btn=card.querySelector(`#pbtn-save-${i}`);
  btn.textContent='✓ Сохранено';btn.disabled=true;
  card.style.pointerEvents='none';
  setTimeout(()=>{card.style.display='none';},800);
  // 2. Добавляем в локальное состояние и 3. отправляем на сервер в фоне.
  // syncAddFlight выполняет unshift+saveLocal+pendingQueue синхронно (гарантия
  // доставки сохраняется), а сетевую отправку — асинхронно; UI её НЕ ждёт (без await).
  syncAddFlight(f);
  logAction('flight','add','Импорт: вылет '+(f.flightnum?'#'+f.flightnum+' ':'')+f.pilot+' '+(f.drone||'')+(f.returned==='no'?' [потеря]':''));
  checkNet();
  renderDashboard();
  renderInventory();
}

function clearParse(){
  document.getElementById('rawMsg').value='';
  document.getElementById('parsedCards').innerHTML='';
  document.getElementById('parseStatus').textContent='';
}
