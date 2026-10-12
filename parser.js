(globalThis.__FILE_BUILDS=globalThis.__FILE_BUILDS||{})['parser.js']=2026101101; // сборка файла — ставит tools/bump-version.js, руками не править
// parser.js — импорт и AI-парсер сообщений (часть app.js, грузить ПЕРЕД reports.js/app.js)

// ============ AI-КОНСТАНТЫ (единая точка, 02.07.2026) ============
// Сервер и модель выбираются в Настройках → «AI-сервер» (localStorage), читает callAI().
// Таймаут AI-вызова парсера, мс. У vr/rpg свои (60с/90с — короткие payload'ы);
// парсер обрабатывает длинные простыни сообщений на слабом железе — даём 5 минут.
const AI_PARSE_TIMEOUT_MS=300000; // 5 минут — gemma-2b на малом железе отвечает долго

// ============ УНИВЕРСАЛЬНЫЙ AI-КЛИЕНТ (callAI) ============
// Единый интерфейс для всех AI-вызовов: импорт (parser), устный доклад (vr), репортаж (rpg).
// Читает настройки из localStorage, формирует OpenAI-совместимый запрос, возвращает текст.
// @param systemPrompt — system-сообщение (промпт, инструкции для модели)
// @param userContent — user-сообщение (входные данные)
// @param maxTokens — лимит токенов ответа (по умолчанию 800; парсер передаёт 1200 — запас на 6+ сообщений)
// @param timeoutMs — таймаут запроса (по умолчанию 45000)
// @returns Promise<string> — текст ответа модели
// @throws Error — при ошибке сети, API, таймауте или пустом ответе
async function callAI(systemPrompt, userContent, maxTokens=800, timeoutMs=45000){
  const serverType = localStorage['aiServerType'] || 'local';
  let url, model, apiKey;
  
  if(serverType === 'local'){
    url = (localStorage['aiLocalUrl'] || 'http://192.168.0.163:8080').trim().replace(/\/+$/,'') + '/v1/chat/completions';
    model = localStorage['aiLocalModel'] || 'gemma-2b';
    apiKey = localStorage['opiAiKey'] || '';
  } else {
    url = (localStorage['aiExternalUrl'] || 'https://api.anthropic.com').trim().replace(/\/+$/,'');
    model = localStorage['aiExternalModel'] || 'claude-sonnet-4-6';
    apiKey = (localStorage['aiExternalKey'] || '').trim();
    // Anthropic API использует другой формат — конвертируем
    if(url.includes('anthropic.com')){
      const ctrl=new AbortController();
      const tid=setTimeout(()=>ctrl.abort(),timeoutMs);
      try{
        const resp=await fetch(url+'/v1/messages',{
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'x-api-key':apiKey,
            'anthropic-version':'2023-06-01',
            'anthropic-dangerous-direct-browser-access':'true'
          },
          body:JSON.stringify({
            model,
            max_tokens:maxTokens,
            system:systemPrompt,
            messages:[{role:'user',content:userContent}]
          }),
          signal:ctrl.signal
        });
        clearTimeout(tid);
        if(!resp.ok){
          const err=await resp.json().catch(()=>({}));
          throw new Error(`HTTP ${resp.status}: ${err.error?.message||resp.statusText}`);
        }
        const data=await resp.json();
        const txt=(data.content||[]).map(i=>i.text||'').join('').trim();
        if(!txt) throw new Error('пустой ответ API');
        return txt;
      } catch(e) {
        clearTimeout(tid);
        throw e;
      }
    }
  }
  
  // OpenAI-совместимый формат (локальный сервер + внешний OpenAI-совместимый)
  if(serverType !== 'local' && !/\/chat\/completions$/.test(url)) url += '/v1/chat/completions';
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const resp=await fetch(url,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+(apiKey||'local')
      },
      body:JSON.stringify({
        model,
        messages:[
          {role:'system',content:systemPrompt},
          {role:'user',content:userContent}
        ],
        max_tokens:maxTokens,
        temperature:0.2, // JSON-разбор требует точности, не креативности
        stream:false
      }),
      signal:ctrl.signal
    });
    clearTimeout(tid);
    if(!resp.ok){
      const err=await resp.json().catch(()=>({}));
      throw new Error(`HTTP ${resp.status}: ${err.error?.message||resp.statusText}`);
    }
    const data=await resp.json();
    const txt=data.choices?.[0]?.message?.content||'';
    if(!txt) throw new Error('AI-сервер вернул пустой ответ');
    return txt;
  } catch(e) {
    clearTimeout(tid);
    throw e;
  }
}

// fetch с жёстким таймаутом: по истечении timeoutMs запрос отменяется (AbortController),
// promise падает с AbortError (e.name==='AbortError' — ловить в catch вызывающего).
// DEPRECATED: используйте callAI() — он уже содержит таймаут и выбор сервера.
function aiFetchWithTimeout(url,options,timeoutMs){
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(),timeoutMs);
  return fetch(url,{...options,signal:ctrl.signal}).finally(()=>clearTimeout(tid));
}

// ============ НАСТРОЙКИ AI-СЕРВЕРА ============
function aiToggleServerType(type){
  const isLocal=type==='local';
  const l=document.getElementById('ai-local-block'), x=document.getElementById('ai-external-block');
  if(l)l.style.display=isLocal?'':'none';
  if(x)x.style.display=isLocal?'none':'';
  const rl=document.getElementById('ai-type-local'), rx=document.getElementById('ai-type-external');
  if(rl)rl.checked=isLocal;
  if(rx)rx.checked=!isLocal;
}
function aiLoadSettings(){
  try{
    // Миграция ключа из старой карточки («Импорт», anthropicKey) → внешний API
    const old=localStorage.getItem('anthropicKey');
    if(old&&!localStorage.getItem('aiExternalKey')){localStorage.setItem('aiExternalKey',old);}
    if(old)localStorage.removeItem('anthropicKey');
  }catch(e){}
  const g=(k,d)=>localStorage.getItem(k)||d;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v;};
  set('ai-local-url',g('aiLocalUrl','http://192.168.0.163:8080'));
  set('ai-local-model',g('aiLocalModel','gemma-2b'));
  set('ai-local-key',g('opiAiKey',''));
  set('ai-external-url',g('aiExternalUrl','https://api.anthropic.com'));
  set('ai-external-model',g('aiExternalModel','claude-sonnet-4-6'));
  set('ai-external-key',g('aiExternalKey',''));
  aiToggleServerType(g('aiServerType','local'));
}
function aiSaveSettings(){
  const v=id=>(document.getElementById(id)?.value||'').trim();
  const type=document.querySelector('input[name="ai-server-type"]:checked')?.value||'local';
  try{
    localStorage.setItem('aiServerType',type);
    localStorage.setItem('aiLocalUrl',v('ai-local-url'));
    localStorage.setItem('aiLocalModel',v('ai-local-model'));
    localStorage.setItem('opiAiKey',v('ai-local-key'));
    localStorage.setItem('aiExternalUrl',v('ai-external-url'));
    localStorage.setItem('aiExternalModel',v('ai-external-model'));
    localStorage.setItem('aiExternalKey',v('ai-external-key'));
    setStatus('ai-test-status','✓ настройки сохранены','ok');
  }catch(e){setStatus('ai-test-status','✗ не удалось сохранить: '+e.message,'err');}
}
async function aiTestConnection(){
  aiSaveSettings();
  setStatus('ai-test-status','Проверяю связь...','muted');
  const t0=Date.now();
  try{
    const r=await callAI('Отвечай одним словом.','Ответь: ok',20,15000);
    setStatus('ai-test-status','✓ связь есть ('+((Date.now()-t0)/1000).toFixed(1)+' с): '+r.slice(0,40),'ok');
  }catch(e){
    setStatus('ai-test-status','✗ '+(e.name==='AbortError'?'таймаут':e.message),'err');
  }
}

// ============ IMPORT / PARSE ============
async function parseMessages(){
  if(!guardWrite())return; // viewer — только просмотр (вкладка Импорт и так скрыта)
  const raw=document.getElementById('rawMsg').value.trim();
  if(!raw)return;
  const st=document.getElementById('parseStatus');

  setStatus(st,'Распознаю правилами...','muted');
  document.getElementById('parsedCards').innerHTML='';
  // Подготавливаем строки
  const srcLines=raw.split('\n').map(l=>l.trim());

  // 1. СНАЧАЛА — правила (parser-rules.js)
  const {parsed: rulesParsed, missingLines}=parseAllByRules(srcLines);

  // 2. ЕСЛЬ есть строки с missing — ОДИН вызов AI только для них
  let aiResults=[], aiOk=false;
  if(missingLines.length>0){
    setStatus(st,'Дозапрос к ИИ для '+missingLines.length+' строк...','muted');
    window._parseBusy=true;
    try{
      // Формируем вход для AI: только проблемные строки с их номерами
      const aiInput=missingLines.map(idx=>`[${idx}] ${srcLines[idx]}`).join('\n');
      const SYSTEM_PROMPT=`Парсер вылетов дронов. Извлеки каждый вылет из текста в JSON.
Формат: [{"_line":N,"date":"YYYY-MM-DD","time":"HH:MM","pilot":"имя","flightnum":N,"target":"номер цвет","ammo":"груз","drone":"модель","result":"yes/no","returned":"yes/no","note":"текст"}]

Правила:
- _line: номер строки [N] из входа (обязателен, уникален)
- time: HH:MM с ведущим нулём (08:34, не 8:34)
- target: "ЧИСЛО ЦВЕТ" (например "305 вишня", "85 коралл")
- returned: "вернул/борт вернул"=yes, "не вернул/потерян/спикировал"=no
- result: "на месте/выполнена"=yes, иначе no
- drone: нормализуй написание (убери лишние пробелы/тире)

Верни ТОЛЬКО JSON-массив, без текста до/после.`;
      const txt=await callAI(SYSTEM_PROMPT,aiInput,1200,AI_PARSE_TIMEOUT_MS);
      let ans=JSON.parse(txt.replace(/```json|```/g,'').trim());
      // Модель могла вернуть объект ({"flights":[…]}) или мусорные элементы — берём только объекты
      if(!Array.isArray(ans)) ans=(ans&&Array.isArray(ans.flights))?ans.flights:[];
      aiResults=ans.filter(a=>a&&typeof a==='object'&&!Array.isArray(a));
      aiOk=true;
    }catch(e){
      // AI недоступен — не ошибка импорта, работаем с тем, что нашли правилами
      console.warn('AI fallback failed:',e);
      setStatus(st,'⚠ ИИ недоступен, разобрано правилами — проверьте подсвеченные поля','warn');
    }finally{
      window._parseBusy=false;
    }
  }else{
    setStatus(st,'Распознано правилами: '+rulesParsed.filter(p=>!p._continuation).length+' вылет(ов). Проверьте и сохраните.','ok');
  }

  // 3. СЛИЯНИЕ: AI заполняет ТОЛЬКО missing поля, найденное правилами не перетираем
  let aiFilled=0;
  const merged=rulesParsed.map((item,i)=>{
    if(item._continuation) return item;
    const aiItem=aiResults.find(a=>typeof a._line==='number' && a._line===item._lineIdx);
    if(aiItem){
      let filled=false;
      for(const key of item.missing){
        if(aiItem[key]!==undefined && aiItem[key]!==null && aiItem[key]!==''){
          item.fields[key]=aiItem[key];
          filled=true;
        }
      }
      if(filled) aiFilled++;
      // _parsedFlightnum не перетираем в flightnum — система сама пересчитает
      if(aiItem._parsedFlightnum!==undefined && item.fields._parsedFlightnum===undefined){
        item.fields._parsedFlightnum=aiItem._parsedFlightnum;
      }
      item.missing=item.missing.filter(k=>item.fields[k]===undefined || item.fields[k]==='');
    }
    // _src для рендера
    item._src=item._src || srcLines[item._lineIdx] || '';
    return item;
  });

  // 3a. Распаковка: parseAllByRules отдаёт {fields:{...}, missing, _src}, а
  // renderParsedCards читает поля ПЛОСКО (x.date, x.pilot, ...). Без этого шага
  // карточки рисовались, но все поля были пустыми.
  // Продолжения примечания (_continuation) в карточки не идут: их текст уже
  // дописан в note предыдущего вылета самим parseAllByRules.
  const flattened=merged
    .filter(item=>!item._continuation)
    .map(item=>({...item.fields,
      // Номер вылета, распознанный из текста («Первый»=1, «Второй»=2, «4-й»=4),
      // идёт в обычное поле flightnum — его и показывает карточка, и читает
      // confirmParsed при сохранении. Без автонумерации: если номер в тексте не
      // распознан, поле остаётся пустым → flightnum=null при сохранении.
      flightnum: item.fields._parsedFlightnum,
      missing:item.missing, _src:item._src, _lineIdx:item._lineIdx}));

  if(aiOk) setStatus(st,'Распознано: '+flattened.length+' (ИИ дополнил строк: '+aiFilled+'). Проверьте и сохраните.','ok');

  // 4. Рендер карточек (renderParsedCards сам подсветит missing через --amber)
  renderParsedCards(flattened);
}

function renderParsedCards(items){
  // Вспомогательная: инпут с янтарной подсветкой, если поле в missing
  const inp=(id, label, value, type='text', missing=[])=>{
    // id формата "p0-date" → поле "date".
    // ВАЖНО: здесь нельзя обращаться к i из items.map() — эта функция объявлена ВЫШЕ map,
    // и такой доступ давал ReferenceError: i is not defined.
    const field=id.replace(/^p\d+-/,'');
    const warn=missing.includes(field) ? ' style="border-color:var(--amber);box-shadow:0 0 0 2px var(--amber-soft)"' : '';
    return `<div><label>${label}</label><input id="${id}" type="${type}" value="${esc(value||'')}"${warn}></div>`;
  };
  const sel=(id, label, value, options, missing=[])=>{
    const field=id.replace(/^p\d+-/,'');
    const warn=missing.includes(field) ? ' style="border-color:var(--amber);box-shadow:0 0 0 2px var(--amber-soft)"' : '';
    // Поле не распознано — пустой вариант: иначе молча выбрался бы первый («Выполнена»/«Вернул»)
    if(!value&&missing.includes(field)) options=[{value:'',text:'— выбрать —'},...options];
    const opts=options.map(o=>{
      const s=o.value===value?' selected':'';
      return `<option value="${esc(o.value)}"${s}>${esc(o.text)}</option>`;
    }).join('');
    return `<div><label>${label}</label><select id="${id}"${warn}>${opts}</select></div>`;
  };

  document.getElementById('parsedCards').innerHTML=items.map((x,i)=>{
    const miss=x.missing||[];
    return `
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
        ${inp(`p${i}-date`,'Дата',x.date,'date',miss)}
        ${inp(`p${i}-time`,'Время',x.time,'time',miss)}
        ${inp(`p${i}-flightnum`,'Номер вылета',x.flightnum||'','number',miss)}
      </div>
      <div class="form-row cols3">
        ${inp(`p${i}-pilot`,'Пилот',x.pilot, 'text',miss)}
        ${inp(`p${i}-target`,'Точка',x.target, 'text',miss)}
        ${inp(`p${i}-ammo`,'Груз',x.ammo, 'text',miss)}
      </div>
      <div class="form-row cols3">
        ${inp(`p${i}-drone`,'БПЛА',x.drone, 'text',miss)}
        ${sel(`p${i}-result`,'Задача',x.result||'', [{value:'yes',text:'Выполнена'},{value:'no',text:'Не выполнена'}], miss)}
        ${sel(`p${i}-returned`,'Борт',x.returned||'', [{value:'yes',text:'Вернул'},{value:'no',text:'Потерян'}], miss)}
      </div>
      <div>${inp(`p${i}-note`,'Примечание',x.note, 'text',miss)}</div>
    </div>`;
  }).join('');
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
// Возвращает результат writeDroneLoss ({deficit:true,…} если списание ушло в минус, иначе null) —
// вызывающий показывает НЕ блокирующее предупреждение (lossDeficitWarn, ADR-001 §4).
function applyLossIfNeeded(f){
  if(f.returned==='no'&&f.drone&&!f._lossWritten){
    const r=writeDroneLoss(f.pilot,f.drone,f.date,f.time,f.id);
    f._lossWritten=true;
    setTimeout(()=>syncPushStockSquads(),500);
    return r;
  }
  return null;
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

  // Обязательные поля: без даты и пилота вылет не сохраняем; «Задача»/«Борт» из missing — до явного выбора
  const need=[['date','дату'],['pilot','пилота'],['result','«Задача»'],['returned','«Борт»']]
    .filter(([k])=>!((document.getElementById(`p${i}-${k}`)||{}).value||'').trim());
  if(need.length){
    showCardError(i,'⛔ Укажите '+need.map(n=>n[1]).join(', '));
    const el=document.getElementById(`p${i}-${need[0][0]}`); if(el)el.focus();
    return;
  }

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
  lossDeficitWarn(applyLossIfNeeded(f));  // минус у пилота — предупреждение, не блок (ADR-001 §4)
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
