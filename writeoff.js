// writeoff.js — формирование документа Word (.docx) на списание потерянных бортов.
// ТОЛЬКО ЛОКАЛЬНО, доступно роли 'cmd'. Библиотека docx.js подключается через CDN (window.docx).
// Подсказки/последние значения хранятся в localStorage (ключи writeoff_*) и НИКОГДА не уходят
// в облако (страж geoStripFromSync — чистит все ключи с префиксом writeoff). Грузить ПЕРЕД app.js.
//
// Формат: АКТ НА СУТКИ. Период из фильтра отчёта «Потери» → по акту на каждый день (один файл,
// разрыв страницы). Внутри суток потери группируются по {модель + причина(note) + боеприпас(ammo)}.
// Заполнение — мастером по дням («День 1 из N → Далее»).

// ===== ХРАНИЛИЩЕ =====
// writeoff_hints: { поле: [{value,count}] }  — словарь подсказок с частотой (взрыватель — по типам: 'взрыватель_<ammo>')
// writeoff_last:  { approver,unit,subunit,settlement,square, models:{модель:{vtx,rx,battCap,battQty}} }
// writeoff_last_crew_<пилот>: { sapper, tech }   — состав расчёта запоминается по пилоту
// writeoff_last_signers: [ {role,rank,name} ]    — последний список подписантов
function woLoadHints(){ try{return JSON.parse(localStorage.getItem('writeoff_hints')||'{}')||{};}catch(e){return {};} }
function woSaveHints(h){ try{localStorage.setItem('writeoff_hints',JSON.stringify(h));}catch(e){} }
function woLoadLast(){ try{return JSON.parse(localStorage.getItem('writeoff_last')||'{}')||{};}catch(e){return {};} }
function woSaveLast(l){ try{localStorage.setItem('writeoff_last',JSON.stringify(l));}catch(e){} }
function woLoadCrew(pilot){ try{return JSON.parse(localStorage.getItem('writeoff_last_crew_'+pilot)||'{}')||{};}catch(e){return {};} }
function woSaveCrew(pilot,obj){ try{localStorage.setItem('writeoff_last_crew_'+pilot,JSON.stringify(obj));}catch(e){} }
function woLoadSigners(){ try{return JSON.parse(localStorage.getItem('writeoff_last_signers')||'[]')||[];}catch(e){return [];} }
function woSaveSigners(a){ try{localStorage.setItem('writeoff_last_signers',JSON.stringify(a));}catch(e){} }

// Зафиксировать использованное значение поля (инкремент частоты)
function woRecordHint(h,key,val){
  val=(val||'').trim(); if(!val)return;
  if(!h[key])h[key]=[];
  const ex=h[key].find(x=>x.value===val);
  if(ex)ex.count++; else h[key].push({value:val,count:1});
}

// ISO → ДД.ММ.ГГГГ
function woFmtDate(iso){ if(!iso)return ''; const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m?`${m[3]}.${m[2]}.${m[1]}`:iso; }

// Текущая эффективная роль (переключатель → учётка)
function woRole(){ return (typeof state!=='undefined'&&state.role) || (window.authUser&&authUser.role) || ''; }

function woStatus(msg,kind){
  const el=document.getElementById('woStatus'); if(!el)return;
  el.textContent=msg||'';
  el.style.color = kind==='err' ? 'var(--red)' : kind==='ok' ? 'var(--accent2)' : 'var(--muted)';
}

// Не-боевые грузы: поле «груз», взрыватель не включается, задача = доставка
const WO_CARGO=new Set(['доставка','доставка провизия','провизия','провизия доставка','вода']);
function woIsCargo(ammo){ return WO_CARGO.has(String(ammo||'').trim().toLowerCase()); }

// ===== UI ПОДСКАЗОК =====
// Поле ввода с выпадающим списком ранее введённых значений (сортировка по частоте, × — удалить)
function woHintField(key,label,value,opts){
  opts=opts||{};
  return `<div class="wo-field"><label>${esc(label)}</label>`+
    `<div class="wo-hintwrap">`+
      `<input class="wo-inp" data-wo-key="${esc(key)}" value="${esc(value||'')}" placeholder="${esc(opts.ph||'')}" autocomplete="off" `+
        `onfocus="woRenderHintList(this)" oninput="woRenderHintList(this)" onblur="woHintBlur(this)">`+
      `<div class="wo-hintlist"></div>`+
    `</div></div>`;
}

function woRenderHintList(inp){
  const key=inp.getAttribute('data-wo-key');
  const list=inp.parentElement.querySelector('.wo-hintlist');
  if(!list)return;
  const h=woLoadHints();
  let items=(h[key]||[]).slice().sort((a,b)=>b.count-a.count);
  const q=(inp.value||'').trim().toLowerCase();
  if(q)items=items.filter(it=>it.value.toLowerCase().includes(q)&&it.value.toLowerCase()!==q);
  if(!items.length){ list.style.display='none'; list.innerHTML=''; return; }
  list.innerHTML=items.slice(0,8).map(it=>
    `<div class="wo-hint" data-val="${esc(it.value)}" onmousedown="woPickHint(event,this)">`+
      `<span>${esc(it.value)}</span>`+
      `<i class="wo-hintdel" title="Удалить из подсказок" onmousedown="woDelHint(event,this)">×</i>`+
    `</div>`).join('');
  list.style.display='block';
}

function woHintBlur(inp){ setTimeout(()=>{ const l=inp.parentElement.querySelector('.wo-hintlist'); if(l)l.style.display='none'; },150); }

function woPickHint(e,el){
  e.preventDefault();
  const wrap=el.closest('.wo-hintwrap');
  const inp=wrap.querySelector('input');
  inp.value=el.getAttribute('data-val');
  const l=wrap.querySelector('.wo-hintlist'); if(l)l.style.display='none';
}

function woDelHint(e,el){
  e.preventDefault(); e.stopPropagation();
  const wrap=el.closest('.wo-hintwrap');
  const inp=wrap.querySelector('input');
  const key=inp.getAttribute('data-wo-key');
  const val=el.closest('.wo-hint').getAttribute('data-val');
  const h=woLoadHints();
  if(h[key]){ h[key]=h[key].filter(x=>x.value!==val); woSaveHints(h); }
  woRenderHintList(inp);
}

// ===== БЛОКИ ФОРМЫ =====
function woModelBlock(name,mc){
  mc=mc||{};
  return `<div class="wo-drone" data-name="${esc(name)}">`+
    `<div class="wo-dronehead">Модель: <b>${esc(name)}</b></div>`+
    woHintField('vtx','VTX частота',mc.vtx,{ph:'напр. 5.8 (3.3/1.5)'})+
    woHintField('rx','RX / модуль связи',mc.rx,{ph:'напр. 500 (500, LR1121) или КУЗНЕЧИК(210-220)'})+
    woHintField('battCap','Ёмкость АКБ',mc.battCap,{ph:'напр. 15000 mAh'})+
    `<div class="wo-field"><label>Кол-во АКБ на борт</label><input type="number" min="0" class="wo-battqty" value="${esc(mc.battQty||1)}"></div>`+
  `</div>`;
}

// Состав расчёта — отдельный блок на пилота (сапёр/техник запоминаются по пилоту)
function woCrewBlock(pilot,crew){
  crew=crew||{};
  return `<div class="wo-crew" data-pilot="${esc(pilot)}">`+
    `<div class="wo-dronehead">Пилот: <b>${esc(pilot)}</b></div>`+
    woHintField('sapper','Сапёр',crew.sapper,{ph:'звание, фамилия'})+
    woHintField('tech','Техник/пилот (необязательно)',crew.tech,{ph:'звание, фамилия'})+
  `</div>`;
}

// Подписант — должность/звание/имя
function woSignerBlock(i,s){
  s=s||{};
  return `<div class="wo-signer" data-sign-idx="${i}">`+
    `<div class="wo-dronehead">Подпись ${i+1} <span class="wo-signerdel" onclick="woRemoveSigner(${i})">× удалить</span></div>`+
    `<div class="wo-field"><label>Должность</label><input class="wo-sign-role" value="${esc(s.role||'')}" placeholder="напр. Командир роты"></div>`+
    `<div class="wo-field"><label>Звание</label><input class="wo-sign-rank" value="${esc(s.rank||'')}" placeholder="напр. капитан"></div>`+
    `<div class="wo-field"><label>Имя</label><input class="wo-sign-name" value="${esc(s.name||'')}" placeholder="напр. Иванов И.И."></div>`+
  `</div>`;
}

// ===== ГРУППИРОВКА =====
// Потери одного дня → группы {model, ammo, reason, count, pilots[]} по {модель+причина+боеприпас}
function woGroupDay(losses){
  const groups=new Map();
  losses.forEach(f=>{
    const model=(f.drone||'—').trim();
    const ammo=(f.ammo||'').trim();
    const reason=(f.note||'').trim()||'причина не указана';
    const key=model+'|'+ammo+'|'+reason;
    if(!groups.has(key))groups.set(key,{model,ammo,reason,count:0,pilots:[]});
    const g=groups.get(key);
    g.count++;
    const p=(f.pilot||'').trim();
    if(p&&!g.pilots.includes(p))g.pilots.push(p);
  });
  return [...groups.values()];
}

// Потери периода → дни [{date, losses[]}], по возрастанию даты
function woGroupByDate(losses){
  const days=new Map();
  losses.forEach(f=>{ const d=f.date||''; if(!days.has(d))days.set(d,[]); days.get(d).push(f); });
  return [...days.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,ls])=>({date,losses:ls}));
}

// ===== МАСТЕР ПО ДНЯМ =====
function woOpenWriteoff(){
  if(woRole()!=='cmd'){ alert('Документ на списание доступен только командиру (роль cmd)'); return; }
  const losses=(window._writeoffLosses||[]).filter(x=>x&&x.returned==='no');
  if(!losses.length){ alert('За выбранный период потерь нет'); return; }
  window._woFlow={ days:woGroupByDate(losses), idx:0, collected:[] };
  window._woOverlay=modalOverlay('<div class="wo-modal card"></div>');
  window._woOverlay.addEventListener('mousedown',e=>{ if(e.target===window._woOverlay)woCloseModal(); });
  woRenderDayForm();
}

function woCloseModal(){ if(window._woOverlay){ window._woOverlay.remove(); window._woOverlay=null; } window._woFlow=null; }

function woRenderDayForm(){
  const flow=window._woFlow; if(!flow)return;
  const day=flow.days[flow.idx];
  const pilots=[...new Set(day.losses.map(x=>(x.pilot||'').trim()).filter(Boolean))];
  const models=[...new Set(day.losses.map(x=>(x.drone||'—').trim()))];
  const combatAmmos=[...new Set(day.losses.map(x=>(x.ammo||'').trim()).filter(a=>a&&!woIsCargo(a)))];
  const last=woLoadLast();
  const here=flow.collected[flow.idx], prev=flow.collected[flow.idx-1];
  const g=(here&&here.cfg)||(prev&&prev.cfg)||last;
  const crewOf=p=>(here&&here.crew&&here.crew[p])||woLoadCrew(p);
  const mcOf=name=>{
    if(here&&here.models&&here.models[name])return here.models[name];
    if(prev&&prev.models&&prev.models[name])return prev.models[name];
    return (last.models||{})[name]||{};
  };
  const fzOf=ammo=>(here&&here.fuzes&&here.fuzes[ammo])||'';
  let signers=(here&&here.signers)?here.signers:woLoadSigners();
  if(!signers.length)signers=[{role:'',rank:'',name:''}];

  const total=flow.days.length, isFirst=flow.idx===0, isLast=flow.idx===total-1;
  const grpCount=woGroupDay(day.losses).length;

  const nav=`<div class="wo-actions">`+
    (isFirst?'':`<button class="btn btn-sm" onclick="woPrevDay()">← Назад</button>`)+
    (isLast
      ?`<button class="btn btn-success" onclick="woFinish()">Сформировать .docx</button>`
      :`<button class="btn btn-primary" onclick="woNextDay()">Далее →</button>`)+
    `<button class="btn btn-sm" onclick="woCloseModal()">Отмена</button>`+
  `</div>`;

  const fuzeSection = combatAmmos.length
    ? `<div class="wo-sec">Взрыватели (по типам боеприпаса)</div>`+
      `<div class="wo-note">Подтягиваются подсказки для каждого боеприпаса отдельно; по умолчанию пусто.</div>`+
      `<div id="wo-fuzes">`+combatAmmos.map(a=>woHintField('взрыватель_'+a,'Взрыватель для «'+a+'»',fzOf(a),{ph:'напр. РГН с УДЗ'})).join('')+`</div>`
    : '';

  const html=`<div class="wo-title">📄 Документ на списание</div>`+
    `<div class="wo-period">День ${flow.idx+1} из ${total} · ${esc(woFmtDate(day.date))} · потерь: ${day.losses.length} · групп: ${grpCount}</div>`+
    `<div class="wo-sec">Гриф утверждения</div>`+
    woHintField('approver','Командир (подразделение)',g.approver,{ph:'напр. Командир иср 1232 мсп'})+
    `<div class="wo-note">Место для подписи и даты добавляется автоматически.</div>`+
    `<div class="wo-sec">Реквизиты подразделения</div>`+
    woHintField('unit','Номер части',g.unit,{ph:'напр. 1232 мсп'})+
    woHintField('subunit','Подразделение',g.subunit,{ph:'напр. иср'})+
    `<div class="wo-sec">Состав расчёта (по пилотам)</div>`+
    `<div id="wo-crews">${pilots.map(p=>woCrewBlock(p,crewOf(p))).join('')||'<div class="wo-note">Пилоты в потерях не указаны.</div>'}</div>`+
    fuzeSection+
    `<div class="wo-sec">Место применения</div>`+
    woHintField('settlement','Населённый пункт',g.settlement,{ph:'напр. Сергеевка'})+
    woHintField('square','Квадрат',g.square,{ph:'напр. 53-45'})+
    `<div class="wo-sec">Конфигурация по моделям (${models.length})</div>`+
    `<div id="wo-models">${models.map(m=>woModelBlock(m,mcOf(m))).join('')}</div>`+
    `<div class="wo-sec">Подписи</div>`+
    `<div id="wo-signers">${signers.map((s,i)=>woSignerBlock(i,s)).join('')}</div>`+
    `<button class="btn btn-sm" style="margin-bottom:8px" onclick="woAddSigner()">+ Добавить подпись</button>`+
    nav+
    `<div id="woStatus" class="wo-status"></div>`;
  const modal=window._woOverlay.querySelector('.wo-modal');
  modal.innerHTML=html; modal.scrollTop=0;
}

// Считать форму текущего дня в flow.collected[idx] + сохранить подсказки/последние
function woCollectDay(){
  const flow=window._woFlow, ov=window._woOverlay; if(!flow||!ov)return;
  const gv=k=>{ const el=ov.querySelector('[data-wo-key="'+k+'"]'); return el?el.value.trim():''; };
  const cfg={ approver:gv('approver'), unit:gv('unit'), subunit:gv('subunit'), settlement:gv('settlement'), square:gv('square') };

  const crew={};
  ov.querySelectorAll('#wo-crews .wo-crew').forEach(b=>{
    const p=b.dataset.pilot;
    const v=k=>{ const el=b.querySelector('[data-wo-key="'+k+'"]'); return el?el.value.trim():''; };
    crew[p]={ sapper:v('sapper'), tech:v('tech') };
  });

  const fuzes={};
  ov.querySelectorAll('#wo-fuzes [data-wo-key]').forEach(el=>{
    const ammo=el.getAttribute('data-wo-key').replace(/^взрыватель_/,'');
    fuzes[ammo]=el.value.trim();
  });

  const models={};
  ov.querySelectorAll('#wo-models .wo-drone').forEach(b=>{
    const name=b.dataset.name;
    const v=k=>{ const el=b.querySelector('[data-wo-key="'+k+'"]'); return el?el.value.trim():''; };
    const qtyEl=b.querySelector('.wo-battqty');
    models[name]={ vtx:v('vtx'), rx:v('rx'), battCap:v('battCap'), battQty:(qtyEl&&qtyEl.value)||'1' };
  });

  const signers=[];
  ov.querySelectorAll('#wo-signers .wo-signer').forEach(b=>{
    const rv=sel=>{ const el=b.querySelector(sel); return el?el.value.trim():''; };
    signers.push({ role:rv('.wo-sign-role'), rank:rv('.wo-sign-rank'), name:rv('.wo-sign-name') });
  });

  flow.collected[flow.idx]={ date:flow.days[flow.idx].date, cfg, crew, fuzes, models, signers };

  // Сохранить подсказки + последние значения
  const last=woLoadLast(), hints=woLoadHints();
  ['approver','unit','subunit','settlement','square'].forEach(k=>{ if(cfg[k]){ last[k]=cfg[k]; woRecordHint(hints,k,cfg[k]); } });
  last.models=last.models||{};
  Object.entries(models).forEach(([m,c])=>{ last.models[m]=c; woRecordHint(hints,'vtx',c.vtx); woRecordHint(hints,'rx',c.rx); woRecordHint(hints,'battCap',c.battCap); });
  woSaveLast(last);
  Object.entries(crew).forEach(([p,c])=>{ woSaveCrew(p,c); woRecordHint(hints,'sapper',c.sapper); woRecordHint(hints,'tech',c.tech); });
  Object.entries(fuzes).forEach(([ammo,fz])=>{ if(fz)woRecordHint(hints,'взрыватель_'+ammo,fz); });
  woSaveHints(hints);
  woSaveSigners(signers.filter(s=>s.role||s.rank||s.name));
}

function woNextDay(){ const f=window._woFlow; if(!f)return; woCollectDay(); if(f.idx<f.days.length-1){ f.idx++; woRenderDayForm(); } }
function woPrevDay(){ const f=window._woFlow; if(!f)return; woCollectDay(); if(f.idx>0){ f.idx--; woRenderDayForm(); } }
function woFinish(){ const f=window._woFlow; if(!f)return; woCollectDay(); woBuildDocx(f); }
function woAddSigner(){ const f=window._woFlow; if(!f)return; woCollectDay(); const c=f.collected[f.idx]; c.signers=c.signers||[]; c.signers.push({role:'',rank:'',name:''}); woRenderDayForm(); }
function woRemoveSigner(i){ const f=window._woFlow; if(!f)return; woCollectDay(); const c=f.collected[f.idx]; if(c.signers)c.signers.splice(i,1); woRenderDayForm(); }

// ===== ГЕНЕРАЦИЯ DOCX =====
function woBuildDocx(flow){
  if(!window.docx){ woStatus('Библиотека docx не загружена — нужен интернет. Подключитесь и обновите страницу.','err'); return; }
  woStatus('Формирование документа…','muted');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = docx;
  const FONT='Times New Roman';
  const R=(t,o)=>{ o=o||{}; return new TextRun({ text:String(t==null?'':t), font:FONT, size:o.size||22, bold:!!o.bold }); };
  const P=(runs,o)=>{ o=o||{}; return new Paragraph({
    alignment:o.align, pageBreakBefore:!!o.pageBreak,
    spacing:{ before:0, after:o.after!=null?o.after:0 },
    children:Array.isArray(runs)?runs:[runs]
  }); };
  const bd={ style:BorderStyle.SINGLE, size:4, color:'000000' };
  const cb={ top:bd, bottom:bd, left:bd, right:bd };
  const cell=(children,w)=>new TableCell({ width:{size:w,type:WidthType.DXA}, borders:cb, children });

  const children=[];
  flow.days.forEach((day,di)=>{
    const c=flow.collected[di]||{};
    const cfg=c.cfg||{}, crew=c.crew||{}, fuzes=c.fuzes||{}, cfgModels=c.models||{}, signers=c.signers||[];
    const groups=woGroupDay(day.losses);

    // Шапка: гриф утверждения (место для подписи и даты — всегда)
    children.push(P(R('УТВЕРЖДАЮ',{bold:true}),{align:AlignmentType.RIGHT,pageBreak:di>0}));
    children.push(P(R(cfg.approver||'Командир войсковой части ______'),{align:AlignmentType.RIGHT}));
    children.push(P(R('_____________________'),{align:AlignmentType.RIGHT}));
    children.push(P(R('«___» __________ 20__ г.'),{align:AlignmentType.RIGHT,after:200}));
    // Заголовок
    children.push(P(R('АКТ на списание',{bold:true,size:28}),{align:AlignmentType.CENTER}));
    children.push(P(R('за '+woFmtDate(day.date),{bold:true}),{align:AlignmentType.CENTER,after:200}));

    const hdr=new TableRow({ tableHeader:true, children:[
      cell([P(R('Дата и время',{bold:true,size:18}))],1300),
      cell([P(R('Содержание полученной задачи и ход её выполнения',{bold:true,size:18}))],6100),
      cell([P(R('Использованные документы (источники)',{bold:true,size:18}))],1955),
    ]});

    const imName=[cfg.subunit,cfg.unit].filter(Boolean).join(' ');
    const place=[cfg.settlement?('в районе '+cfg.settlement):'', cfg.square?('в квадрате '+cfg.square):''].filter(Boolean).join(' ');
    const content=[];
    groups.forEach((grp,gi)=>{
      const mc=cfgModels[grp.model]||{};
      const cargo=woIsCargo(grp.ammo);
      const zadacha=cargo?'доставку':'минирование';
      const cargoWord=cargo?'груз':'боеприпас';
      const lostWord=grp.count===1?'Потеряна':'Потеряны';
      const ptak=ruPlural(grp.count,'птица','птицы','птиц');
      const ammoSfx=grp.ammo?` (с ${grp.ammo})`:'';
      // состав расчёта — по пилотам со своими сапёром/техником
      const comp=[];
      grp.pilots.forEach(p=>{ comp.push('пилот '+p); const cr=crew[p]||{}; if(cr.sapper)comp.push('сапёр '+cr.sapper); if(cr.tech)comp.push('техник '+cr.tech); });
      const primenil=grp.pilots.length>1?'применили':'применил';
      const battTotal=grp.count*(parseInt(mc.battQty,10)||1);

      content.push(P(R(`${lostWord} ${grp.count} ${ptak}${ammoSfx} — ${grp.reason}`,{bold:true})));
      content.push(P(R(`Расчёт FPV ${cfg.subunit||''} в составе: ${comp.join(', ')} ${primenil} «${grp.model}» вылет на ${zadacha}.${place?' Цель подавлена '+place+'.':''}`)));
      content.push(P(R(`В связи с этим считать израсходованным следующее имущество${imName?' '+imName:''}:`)));
      let n=0;
      n++; content.push(P(R(`${n}. FPV-дрон «${grp.model}» — ${grp.count} шт.,`)));
      if(mc.vtx)content.push(P(R(`     - VTX ${mc.vtx} – ${grp.count} шт.,`)));
      if(mc.rx)content.push(P(R(`     - RX ${mc.rx} – ${grp.count} шт.,`)));
      n++; content.push(P(R(`${n}. АКБ к ФПВ дрону ${mc.battCap||'(емкость)'} – ${battTotal} шт.,`)));
      if(grp.ammo){ n++; content.push(P(R(`${n}. ${cargoWord} «${grp.ammo}» – ${grp.count} шт.,`))); }
      if(!cargo&&fuzes[grp.ammo]){ n++; content.push(P(R(`${n}. взрыватель ${fuzes[grp.ammo]} – ${grp.count} шт.,`))); }
      if(gi<groups.length-1)content.push(P(R('')));
    });

    const times=[...new Set(day.losses.map(x=>x.time).filter(Boolean))].sort();
    children.push(new Table({ width:{size:9355,type:WidthType.DXA}, columnWidths:[1300,6100,1955], rows:[hdr,
      new TableRow({ children:[
        cell([P(R(woFmtDate(day.date),{size:18})), P(R(times.join(', '),{size:16}))],1300),
        cell(content,6100),
        cell([P(R(''))],1955),
      ]})
    ]}));

    // Подписи — настраиваемый список (включаем заполненные)
    children.push(P(R(''),{after:120}));
    signers.filter(s=>s.role||s.rank||s.name).forEach(s=>{
      const left=[s.role,s.rank].filter(Boolean).join(' ');
      const line=(left?left+' ':'')+'________________'+(s.name?'  '+s.name:'');
      children.push(P(R(line),{after:100}));
    });
  });

  const doc=new Document({ sections:[{
    properties:{ page:{ margin:{ top:1134, bottom:1134, left:1701, right:850 } } },
    children
  }]});

  Packer.toBlob(doc).then(blob=>{
    const a=document.createElement('a');
    const d0=flow.days[0].date, d1=flow.days[flow.days.length-1].date;
    const tag=d0===d1?d0:(d0+'__'+d1);
    a.href=URL.createObjectURL(blob);
    a.download=`На_списание_${tag}.docx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    woStatus(`Готово: ${flow.days.length} акт(ов) в одном файле ✓`,'ok');
  }).catch(e=>woStatus('Ошибка генерации: '+(e&&e.message||e),'err'));
}
