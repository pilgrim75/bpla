// ===== VTX — генератор Betaflight vtx-команд =====
// Автономный инструмент. Данные учёта/синхронизации НЕ трогает (по духу как LDK-конвертер):
// читает Betaflight VTX Config JSON, рисует таблицу частот и собирает строки `vtx ...`.
// Ничего не пишет в state/localStorage/облако. Всё состояние живёт здесь в рантайме.
//
// ФОРМАТ КОМАНДЫ: vtx <index> <aux> <band> <channel> <power> <pwm_min> <pwm_max>
//   index   — сквозной 0,1,2,... по всем строкам
//   aux     — AUX-канал в 0-based нумерации Betaflight = (пультовый AUX − 1).
//             В поле оператор вводит привычный 1-based (с 1); система вычитает 1.
//   band    — индекс банда в bands_list + 1 (1-based; A=1,B=2,E=3,...)
//   channel — индекс канала (столбца 0..7) + 1 (1-based)
//   power   — индекс уровня в powerlevels_list + 1 (1-based); в частотных строках 0
//   pwm     — пресеты ЗАШИТЫ (см. VTX_PWM)
//
// Эталон (воспроизводится точно), вход меняется на 1-based AUX:
//   блок мощности AUX=1 (дизарм 3W, арм 8W); блок частоты AUX=2, 3-поз 5384(E4),5546(A5),5420(E6) →
//   vtx 0 0 0 0 3 900 1100
//   vtx 1 0 0 0 5 1700 2100
//   vtx 2 1 3 4 0 900 1100
//   vtx 3 1 1 5 0 1300 1600
//   vtx 4 1 3 6 0 1700 2100

// PWM-пресеты по числу положений тумблера (мин..макс на каждое положение).
const VTX_PWM = {
  2: [[900,1100],[1700,2100]],
  3: [[900,1100],[1300,1600],[1700,2100]]
};

// Состояние модуля (только рантайм, не персистится).
let _vtxTable = null;        // {bands:[{name,letter,frequencies:[8]}], powerlevels:[{value,label}]}
let _vtxBlocks = [];         // [{id, type:'power'|'freq', aux, ...}]
let _vtxPick = null;         // активная цель выбора кликом по таблице: {blockId, pos} | null
let _vtxNextId = 1;
let _vtxHasCmd = false;      // в выводе лежат реальные команды (для disabled-вида «Копировать»)

function _vtxId(){ return 'vb'+(_vtxNextId++); }

// ── Парсинг файла (устойчивый: битый/нестандартный JSON не роняет страницу) ──
function vtxImportFile(input){
  const file = input && input.files && input.files[0];
  input.value=''; // позволить повторно выбрать тот же файл
  if(!file) return;
  setStatus('vtxLoadStatus','Чтение файла...','muted');
  const reader = new FileReader();
  reader.onload = e=>{
    let json;
    try{ json = JSON.parse(e.target.result); }
    catch(err){ setStatus('vtxLoadStatus','Не удалось разобрать JSON — проверьте файл','err'); return; }
    const t = vtxParseTable(json);
    if(!t || !t.bands.length){
      setStatus('vtxLoadStatus','В файле не найдена таблица частот (vtx_table.bands_list)','err');
      return;
    }
    _vtxTable = t;
    setStatus('vtxLoadStatus','✓ Загружено: банд '+t.bands.length+', уровней мощности '+t.powerlevels.length,'ok');
    vtxRenderTable();
    vtxRenderBlocks();
    vtxResetOutput(); // таблица сменилась — сбросить вывод на плейсхолдер
  };
  reader.onerror = ()=> setStatus('vtxLoadStatus','Ошибка чтения файла','err');
  reader.readAsText(file);
}

// Достаёт {bands,powerlevels} из произвольной структуры конфига. Терпим к отсутствию полей.
function vtxParseTable(json){
  if(!json || typeof json!=='object') return null;
  const vt = json.vtx_table || json.vtxtable || json; // допускаем плоский корень
  const bandsRaw = Array.isArray(vt && vt.bands_list) ? vt.bands_list
                 : Array.isArray(json.bands_list) ? json.bands_list : [];
  const powRaw   = Array.isArray(vt && vt.powerlevels_list) ? vt.powerlevels_list
                 : Array.isArray(json.powerlevels_list) ? json.powerlevels_list : [];
  const bands = [];
  bandsRaw.forEach(b=>{
    if(!b || typeof b!=='object') return;
    const freqs = Array.isArray(b.frequencies) ? b.frequencies.map(x=>{
      const n = Number(x); return Number.isFinite(n) ? n : 0;
    }) : [];
    bands.push({
      name: (b.name!=null ? String(b.name) : ''),
      letter: (b.letter!=null && String(b.letter).length ? String(b.letter) : '?'),
      frequencies: freqs
    });
  });
  const powerlevels = [];
  powRaw.forEach(p=>{
    if(p==null) return;
    if(typeof p==='object'){
      powerlevels.push({ value: (p.value!=null?p.value:''), label: (p.label!=null && String(p.label).length?String(p.label):String(p.value!=null?p.value:'')) });
    } else {
      powerlevels.push({ value:p, label:String(p) });
    }
  });
  return { bands, powerlevels };
}

// ── Таблица частот ──
function vtxRenderTable(){
  const wrap = document.getElementById('vtxTableWrap');
  if(!wrap) return;
  if(!_vtxTable){
    wrap.innerHTML =
      '<div class="vtx-empty">'+
        '<div class="vtx-empty-ic"><i class="ti ti-table"></i></div>'+
        '<div class="vtx-empty-title">Таблица частот не загружена</div>'+
        '<div class="vtx-empty-sub">Загрузите файл Betaflight VTX Config JSON (vtx_table.bands_list / powerlevels_list).</div>'+
        '<button class="btn btn-primary btn-sm" onclick="document.getElementById(\'vtxFileInput\').click()"><i class="ti ti-upload"></i> Загрузить таблицу</button>'+
      '</div>';
    return;
  }
  // максимум каналов среди банд (обычно 8)
  let maxCh = 0;
  _vtxTable.bands.forEach(b=> maxCh = Math.max(maxCh, b.frequencies.length));
  if(!maxCh) maxCh = 8;
  // множество выбранных ячеек "b,c" (для подсветки)
  const sel = vtxSelectedCells();
  let h = '<table class="vtx-table"><thead><tr><th class="vtx-band-h">Банд</th>';
  for(let c=0;c<maxCh;c++) h += '<th>'+(c+1)+'</th>';
  h += '</tr></thead><tbody>';
  _vtxTable.bands.forEach((b,bi)=>{
    h += '<tr><td class="vtx-band-h"><span class="vtx-band-letter">'+esc(b.letter)+'</span><span class="vtx-band-name">'+esc(b.name)+'</span></td>';
    for(let c=0;c<maxCh;c++){
      const f = b.frequencies[c];
      const key = bi+','+c;
      const cls = ['vtx-cell'];
      if(sel.has(key)) cls.push('vtx-cell-sel');
      if(_vtxPick) cls.push('vtx-cell-arm'); // режим выбора активен
      const has = (f!=null && f!==0);
      h += '<td class="'+cls.join(' ')+'" '+(has?('onclick="vtxCellClick('+bi+','+c+')"'):'')+'>'+(has?('<span class="vtx-num">'+esc(f)+'</span>'):'<span class="vtx-num vtx-num-empty">—</span>')+'</td>';
    }
    h += '</tr>';
  });
  h += '</tbody></table>';
  if(_vtxPick) h = '<div class="vtx-pick-hint">Кликните по ячейке таблицы, чтобы задать частоту выбранному положению. <button class="btn btn-sm" onclick="vtxCancelPick()">Отмена</button></div>' + h;
  wrap.innerHTML = h;
}

// Множество ключей "b,c" всех выбранных частот во всех блоках.
function vtxSelectedCells(){
  const s = new Set();
  _vtxBlocks.forEach(blk=>{
    if(blk.type!=='freq') return;
    (blk.sel||[]).forEach(x=>{ if(x) s.add(x.b+','+x.c); });
  });
  return s;
}

// Клик по ячейке таблицы — если активна цель выбора, заносим частоту в неё.
function vtxCellClick(bi,ci){
  if(!_vtxPick) return;
  const blk = _vtxBlocks.find(b=>b.id===_vtxPick.blockId);
  if(blk && blk.type==='freq'){
    blk.sel[_vtxPick.pos] = { b:bi, c:ci };
  }
  _vtxPick = null;
  vtxRenderTable();
  vtxRenderBlocks();
}
function vtxCancelPick(){ _vtxPick=null; vtxRenderTable(); vtxRenderBlocks(); }

// ── Конструктор блоков ──
function vtxAddBlock(type){
  if(!_vtxTable) return;
  if(type==='power'){
    _vtxBlocks.push({ id:_vtxId(), type:'power', aux:1, disarm:0, arm:(_vtxTable.powerlevels.length>1?_vtxTable.powerlevels.length-1:0) });
  } else {
    _vtxBlocks.push({ id:_vtxId(), type:'freq', aux:1, positions:3, sel:[null,null,null] });
  }
  vtxRenderBlocks();
}
function vtxRemoveBlock(id){
  _vtxBlocks = _vtxBlocks.filter(b=>b.id!==id);
  if(_vtxPick && _vtxPick.blockId===id) _vtxPick=null;
  vtxRenderBlocks();
  vtxRenderTable();
}
function vtxSetAux(id,val){
  const b=_vtxBlocks.find(x=>x.id===id); if(!b) return;
  // Нумерация пульта (с 1). Пусто/0/мусор → 1 (безопасно: в команду уходит aux−1 ≥ 0).
  const n=parseInt(val,10); b.aux = (Number.isFinite(n)&&n>=1)?n:1;
}
function vtxSetPower(id,which,val){
  const b=_vtxBlocks.find(x=>x.id===id); if(!b) return;
  b[which]=parseInt(val,10)||0;
}
function vtxSetPositions(id,val){
  const b=_vtxBlocks.find(x=>x.id===id); if(!b||b.type!=='freq') return;
  const n = (val==='2')?2:3;
  const old = b.sel||[];
  b.positions = n;
  b.sel = []; for(let i=0;i<n;i++) b.sel[i] = old[i]||null;
  if(_vtxPick && _vtxPick.blockId===id && _vtxPick.pos>=n) _vtxPick=null;
  vtxRenderBlocks();
  vtxRenderTable();
}
function vtxSetFreqSel(id,pos,val){
  const b=_vtxBlocks.find(x=>x.id===id); if(!b||b.type!=='freq') return;
  if(val===''){ b.sel[pos]=null; }
  else { const [bi,ci]=val.split(',').map(Number); b.sel[pos]={b:bi,c:ci}; }
  vtxRenderBlocks();
  vtxRenderTable();
}
// Активировать выбор частоты кликом по таблице для конкретного положения.
function vtxArmPick(id,pos){
  _vtxPick = { blockId:id, pos:pos };
  vtxRenderTable();
  vtxRenderBlocks();
  // прокрутить к таблице
  const tc=document.getElementById('vtxTableCard'); if(tc) tc.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function vtxRenderBlocks(){
  const host = document.getElementById('vtxBlocks');
  if(!host) return;
  if(!_vtxBlocks.length){
    host.innerHTML =
      '<div class="vtx-empty vtx-empty-dashed">'+
        '<div class="vtx-empty-title">Блоки не добавлены</div>'+
        '<div class="vtx-empty-sub">Соберите привязку AUX-каналов к мощности и частотам.</div>'+
        '<div class="vtx-card-actions" style="justify-content:center">'+
          '<button class="btn btn-sm"'+(_vtxTable?'':' disabled')+' onclick="vtxAddBlock(\'power\')"><i class="ti ti-bolt"></i> + Блок мощности</button>'+
          '<button class="btn btn-sm"'+(_vtxTable?'':' disabled')+' onclick="vtxAddBlock(\'freq\')"><i class="ti ti-antenna"></i> + Блок частоты</button>'+
        '</div>'+
      '</div>';
    return;
  }
  host.innerHTML = _vtxBlocks.map(vtxBlockHtml).join('');
}

// Плейсхолдер вывода команд + синхронизация состояния кнопок.
function vtxResetOutput(){
  _vtxHasCmd = false;
  const out=document.getElementById('vtxOutput');
  if(out){
    out.classList.add('vtx-output-empty');
    out.textContent = 'Команды появятся после настройки блоков и генерации.';
  }
  vtxSyncButtons();
}
// «Сгенерировать» доступна при загруженной таблице; «Копировать» — когда есть команды.
function vtxSyncButtons(){
  const gen=document.querySelector('#vtxCmdCard [onclick="vtxGenerate()"]');
  const cp=document.querySelector('#vtxCmdCard [onclick="vtxCopyCommands()"]');
  if(gen) gen.disabled = !_vtxTable;
  if(cp) cp.disabled = !_vtxHasCmd;
  // Кнопки добавления блоков в шапке конструктора — недоступны без таблицы
  document.querySelectorAll('#vtxBuilderCard .vtx-card-actions [onclick^="vtxAddBlock"]').forEach(b=>{ b.disabled=!_vtxTable; });
}

function vtxBlockHtml(b){
  const auxField = '<label title="Нумерация пульта (с 1); в команду уходит AUX−1">AUX-канал (с 1)</label><input type="number" min="1" value="'+b.aux+'" oninput="vtxSetAux(\''+b.id+'\',this.value)" style="width:90px">';
  let body='';
  if(b.type==='power'){
    const opts = _vtxTable.powerlevels.map((p,i)=>'<option value="'+i+'">'+esc(p.label)+'</option>').join('');
    body =
      '<div class="vtx-blk-grid">'+
        '<div>'+auxField+'</div>'+
        '<div><label>Низкое (дизарм)</label><select onchange="vtxSetPower(\''+b.id+'\',\'disarm\',this.value)">'+vtxSelOpts(opts,b.disarm)+'</select></div>'+
        '<div><label>Высокое (арм)</label><select onchange="vtxSetPower(\''+b.id+'\',\'arm\',this.value)">'+vtxSelOpts(opts,b.arm)+'</select></div>'+
      '</div>';
  } else {
    const posSel = '<div><label>Положений тумблера</label><select onchange="vtxSetPositions(\''+b.id+'\',this.value)">'+
      '<option value="2"'+(b.positions===2?' selected':'')+'>2</option>'+
      '<option value="3"'+(b.positions===3?' selected':'')+'>3</option></select></div>';
    let rows='';
    for(let i=0;i<b.positions;i++){
      const cur = b.sel[i];
      const curLabel = cur ? vtxFselLabel(cur) : '';
      const armed = _vtxPick && _vtxPick.blockId===b.id && _vtxPick.pos===i;
      rows +=
        '<div class="vtx-pos-row">'+
          '<span class="vtx-pos-tag">'+(i+1)+'</span>'+
          // Кастомный searchable-dropdown частот (фильтр по цифрам числа). Состояние — в _vtxBlocks, не в DOM.
          '<div class="vtx-fsel" data-bid="'+b.id+'" data-pos="'+i+'">'+
            '<input class="vtx-fsel-input" type="text" autocomplete="off" placeholder="— выберите частоту —" value="'+esc(curLabel)+'" onfocus="vtxFselOpen(this)" oninput="vtxFselFilter(this)" onblur="vtxFselBlur(this)">'+
            '<div class="vtx-fsel-panel">'+vtxFselPanelHtml(b.id,i)+'</div>'+
          '</div>'+
          '<button class="btn btn-sm'+(armed?' vtx-btn-armed':'')+'" onclick="vtxArmPick(\''+b.id+'\','+i+')">'+(armed?'Кликните таблицу…':'🎯 С таблицы')+'</button>'+
        '</div>';
    }
    body =
      '<div class="vtx-blk-grid">'+
        '<div>'+auxField+'</div>'+ posSel +
      '</div>'+
      '<div class="vtx-pos-list">'+rows+'</div>';
  }
  const title = b.type==='power' ? '⚡ Мощность (арм/дизарм)' : '📡 Частота';
  return '<div class="vtx-block">'+
    '<div class="vtx-block-head"><span class="vtx-block-title">'+title+'</span>'+
      '<button class="btn btn-sm" style="color:var(--danger,#e25555)" onclick="vtxRemoveBlock(\''+b.id+'\')">✕ Удалить</button></div>'+
    body+
  '</div>';
}

// <select> опции мощности с выбранным индексом sel.
function vtxSelOpts(optsHtml, sel){
  // optsHtml — строка <option value="i">...; помечаем selected у нужного
  return optsHtml.replace('value="'+sel+'"','value="'+sel+'" selected');
}
// ── Searchable-dropdown частот (фильтр по цифрам числа) ──
// Метка выбранной частоты для поля/опций: "A5 — 5546".
function vtxFselLabel(sel){
  const band=_vtxTable.bands[sel.b]; if(!band) return '';
  const f=band.frequencies[sel.c];
  return band.letter+(sel.c+1)+' — '+(f!=null?f:'');
}
// Внутренний HTML панели: заголовок банда + строки опций (data-freq — число для фильтра).
function vtxFselPanelHtml(bid,pos){
  let h='';
  _vtxTable.bands.forEach((band,bi)=>{
    let rows='';
    band.frequencies.forEach((f,ci)=>{
      if(f==null||f===0) return;
      rows += '<div class="vtx-fsel-opt" data-band="'+bi+'" data-freq="'+esc(String(f))+'" onmousedown="vtxFselChoose(event,\''+bid+'\','+pos+','+bi+','+ci+')">'+esc(band.letter+(ci+1)+' — '+f)+'</div>';
    });
    if(rows) h += '<div class="vtx-fsel-head" data-band="'+bi+'">'+esc(band.letter+' · '+band.name)+'</div>'+rows;
  });
  return h || '<div class="vtx-fsel-empty">Нет частот</div>';
}
// Открыть панель: закрыть прочие, очистить поле под свежий поиск, показать всё.
function vtxFselOpen(input){
  vtxFselCloseAll(input);
  const wrap=input.closest('.vtx-fsel'); if(!wrap) return;
  wrap.classList.add('open');
  input.value='';
  vtxFselFilter(input);
}
// Фильтрация по цифрам: опция видна, если её частота СОДЕРЖИТ введённую подстроку цифр.
// Заголовок банда скрыт, если в нём не осталось видимых опций. Пустой ввод → весь список.
function vtxFselFilter(input){
  const wrap=input.closest('.vtx-fsel'); if(!wrap) return;
  const panel=wrap.querySelector('.vtx-fsel-panel'); if(!panel) return;
  const q=(input.value.match(/\d/g)||[]).join('');
  const visByBand={};
  panel.querySelectorAll('.vtx-fsel-opt').forEach(o=>{
    const freq=o.getAttribute('data-freq')||'';
    const show = !q || freq.indexOf(q)>=0;
    o.style.display = show ? '' : 'none';
    if(show) visByBand[o.getAttribute('data-band')]=true;
  });
  panel.querySelectorAll('.vtx-fsel-head').forEach(hd=>{
    hd.style.display = visByBand[hd.getAttribute('data-band')] ? '' : 'none';
  });
}
// Уход с поля: закрыть панель и восстановить отображаемую метку из state (без полной перерисовки).
function vtxFselBlur(input){
  setTimeout(()=>{
    const wrap=input.closest('.vtx-fsel');
    if(!wrap || !document.body.contains(wrap)) return; // элемент мог быть пересоздан выбором
    wrap.classList.remove('open');
    const blk=_vtxBlocks.find(x=>x.id===wrap.getAttribute('data-bid'));
    const cur=blk&&blk.sel?blk.sel[+wrap.getAttribute('data-pos')]:null;
    input.value = cur ? vtxFselLabel(cur) : '';
  },150);
}
// Выбор частоты — та же связь с генерацией, что у прежнего select: пишем {b,c} в state.
function vtxFselChoose(ev,bid,pos,b,c){
  if(ev&&ev.preventDefault) ev.preventDefault(); // mousedown раньше blur, фокус не теряем до обработки
  const blk=_vtxBlocks.find(x=>x.id===bid); if(!blk||blk.type!=='freq') return;
  blk.sel[pos]={b:b,c:c};
  vtxRenderBlocks();
  vtxRenderTable();
}
// Закрыть все открытые панели (кроме своей), восстановив их метки.
function vtxFselCloseAll(except){
  document.querySelectorAll('.vtx-fsel.open').forEach(w=>{
    const inp=w.querySelector('.vtx-fsel-input');
    if(except && inp===except) return;
    w.classList.remove('open');
    const blk=_vtxBlocks.find(x=>x.id===w.getAttribute('data-bid'));
    const cur=blk&&blk.sel?blk.sel[+w.getAttribute('data-pos')]:null;
    if(inp) inp.value = cur ? vtxFselLabel(cur) : '';
  });
}
function vtxFreqOf(sel){
  const band=_vtxTable.bands[sel.b]; if(!band) return '';
  const f=band.frequencies[sel.c];
  return band.letter+(sel.c+1)+(f?(' · '+f):'');
}

// ── Генерация команд ──
function vtxBuildCommands(){
  const lines=[]; let idx=0;
  _vtxBlocks.forEach(b=>{
    // 2-й столбец команды = AUX-канал в 0-based нумерации Betaflight = (пультовый AUX − 1).
    // Кламп ≥0 на случай, если в b.aux каким-то путём затесался 0.
    const aux0 = Math.max(0,(b.aux|0)-1);
    if(b.type==='power'){
      const preset = VTX_PWM[2];
      // строка 0 — дизарм (низкое), строка 1 — арм (высокое); power = индекс уровня + 1
      lines.push('vtx '+(idx++)+' '+aux0+' 0 0 '+((b.disarm|0)+1)+' '+preset[0][0]+' '+preset[0][1]);
      lines.push('vtx '+(idx++)+' '+aux0+' 0 0 '+((b.arm|0)+1)+' '+preset[1][0]+' '+preset[1][1]);
    } else {
      const preset = VTX_PWM[b.positions] || VTX_PWM[3];
      for(let i=0;i<b.positions;i++){
        const s=b.sel[i];
        if(!s) continue; // незаданное положение пропускаем
        const pwm = preset[i] || [0,0];
        lines.push('vtx '+(idx++)+' '+aux0+' '+(s.b+1)+' '+(s.c+1)+' 0 '+pwm[0]+' '+pwm[1]);
      }
    }
  });
  return lines;
}

function vtxGenerate(){
  const out=document.getElementById('vtxOutput');
  if(!out) return;
  if(!_vtxBlocks.length){ out.classList.add('vtx-output-empty'); out.textContent='Добавьте хотя бы один блок в конструкторе.'; _vtxHasCmd=false; vtxSyncButtons(); return; }
  const lines = vtxBuildCommands();
  if(lines.length){
    out.classList.remove('vtx-output-empty');
    out.textContent = lines.join('\n');
    _vtxHasCmd = true;
  } else {
    out.classList.add('vtx-output-empty');
    out.textContent = 'Нет строк — задайте частоты в блоках.';
    _vtxHasCmd = false;
  }
  vtxSyncButtons();
}

function vtxCopyCommands(){
  const out=document.getElementById('vtxOutput');
  const txt = out ? out.textContent : '';
  if(!txt) return;
  navigator.clipboard.writeText(txt).then(()=>{
    const btn=document.querySelector('[onclick="vtxCopyCommands()"]');
    if(btn){ const o=btn.textContent; btn.textContent='✓ Скопировано'; setTimeout(()=>{btn.textContent=o;},1500); }
  }).catch(()=>{
    const el=document.createElement('textarea'); el.value=txt; document.body.appendChild(el); el.select();
    try{ document.execCommand('copy'); }catch(e){} document.body.removeChild(el);
  });
}

// Точка входа из showPage('vtx') — рендер по текущему состоянию (вкл. пустые состояния).
function vtxRenderTab(){
  vtxRenderTable();
  vtxRenderBlocks();
  const out=document.getElementById('vtxOutput');
  if(out && !_vtxHasCmd) vtxResetOutput(); else vtxSyncButtons();
}
