// reports.js — отчёты и фильтр БПЛА (часть app.js, грузить ПЕРЕД app.js)
// ============ REPORT ============
// Выбранные борты для фильтра отчётов (пусто = все)
window._repSelectedDrones=window._repSelectedDrones||new Set();

function fillReportFilters(){
  const pilotSel=document.getElementById('repPilot');
  if(pilotSel){
    const curPilot=pilotSel.value;
    const pilots=[...new Set(state.flights.map(x=>x.pilot).filter(Boolean))].sort();
    pilotSel.innerHTML='<option value="">Все пилоты</option>'+pilots.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');
    if(curPilot)[...pilotSel.options].forEach(o=>{if(o.value===curPilot)o.selected=true;});
  }
  renderDroneFilter();
  repToggleReportageOption();
  repAdaptPeriodFields();
}

// Адаптивное поле периода в верхнем блоке: под тип отчёта показываем нужные элементы.
// stock/flights/losses/issued/summary/detailed → поля «С даты»/«По дату» (repFrom/repTo).
// verbal → селектор vrPeriod (Неделя/Месяц/Год/Произвольный); даты только в режиме «Произвольный».
// reportage → селектор rpgPeriod (календарная неделя/месяц), даты скрыты.
function repAdaptPeriodFields(){
  const type=(document.getElementById('repType')||{}).value||'stock';
  const isVerbal=type==='verbal', isRpg=type==='reportage';
  const set=(id,show)=>{ const el=document.getElementById(id); if(el) el.style.display=show?'':'none'; };
  set('vrPeriodCol', isVerbal);
  set('rpgPeriodCol', isRpg);
  // Поля дат: обычные отчёты — всегда; verbal — только «Произвольный»; reportage — никогда
  let showDates=true;
  if(isVerbal){ const vp=(document.getElementById('vrPeriod')||{}).value||'week'; showDates=(vp==='custom'); }
  else if(isRpg){ showDates=false; }
  else if(type==='byfilter'){ showDates=false; } // берёт снимок журнала, поля дат вкладки не применяются
  set('repFromCol', showDates);
  set('repToCol', showDates);
}

// Смена типа отчёта: подстроить поля периода и перерисовать вывод (для AI — только пустую
// панель результата, БЕЗ обращения к API; платный вызов — только по «Сформировать»).
function onRepTypeChange(){
  repAdaptPeriodFields();
  buildReport();
}

// Кнопка «Сформировать» — единая точка запуска. Для AI-типов здесь (и только здесь)
// инициируется сетевой вызов: verbal с авто-фолбэком на шаблон, reportage через API.
function runReport(){
  buildReport(); // отрисовать панель/отчёт (для AI — область результата со статусом)
  const type=(document.getElementById('repType')||{}).value;
  if(type==='verbal') vrGenerate();
  else if(type==='reportage') rpgGenerate();
}

// Список бортов, реально использованных в выбранном периоде (вылеты + перемещения)
function getReportDronesForPeriod(from,to){
  const inRange=d=>(!from||d>=from)&&(!to||d<=to);
  const set=new Set();
  state.flights.forEach(x=>{if(x.drone&&inRange(x.date))set.add(x.drone);});
  (state.transfers||[]).forEach(t=>{if(t.drone&&inRange(t.date))set.add(t.drone);});
  return [...set].sort();
}

// Рендер панели чекбоксов по текущему периоду
function renderDroneFilter(){
  const list=document.getElementById('repDroneList');
  if(!list)return;
  const from=(document.getElementById('repFrom')||{}).value||'';
  const to=(document.getElementById('repTo')||{}).value||'';
  const drones=getReportDronesForPeriod(from,to);
  // Снимаем выбор с бортов, которых нет в текущем периоде
  const sel=window._repSelectedDrones;
  [...sel].forEach(d=>{if(!drones.includes(d))sel.delete(d);});
  if(!drones.length){
    list.innerHTML='<div class="ms-empty">Нет вылетов за период</div>';
  } else {
    list.innerHTML=drones.map(d=>`<label class="ms-item"><input type="checkbox" value="${esc(d)}" ${sel.has(d)?'checked':''} onchange="onDroneCheck(this)"><span>${esc(d)}</span></label>`).join('');
  }
  updateDroneFieldLabel();
}

// Текст в поле "Тип БПЛА" по выбору
function updateDroneFieldLabel(){
  const lbl=document.getElementById('repDroneLabel');
  if(!lbl)return;
  const arr=[...window._repSelectedDrones].sort();
  if(!arr.length)lbl.textContent='Все борты';
  else if(arr.length<=2)lbl.textContent=arr.join(', ');
  else lbl.textContent=`${arr[0]}, ${arr[1]} (+${arr.length-2})`;
}

function onDroneCheck(cb){
  if(cb.checked)window._repSelectedDrones.add(cb.value);
  else window._repSelectedDrones.delete(cb.value);
  updateDroneFieldLabel();
  refreshReportOutput();
}

function toggleDronePanel(e){
  if(e)e.stopPropagation();
  const panel=document.getElementById('repDronePanel');
  const field=document.getElementById('repDroneField');
  if(!panel)return;
  if(panel.classList.contains('open')){closeDronePanel();return;}
  panel.classList.remove('up');
  panel.classList.add('open');field.classList.add('open');
  // Выбираем направление: вверх, если снизу мало места, а сверху больше
  const r=field.getBoundingClientRect();
  const ph=panel.offsetHeight;
  const spaceBelow=window.innerHeight-r.bottom;
  const spaceAbove=r.top;
  if(spaceBelow<ph+8&&spaceAbove>spaceBelow)panel.classList.add('up');
}

function closeDronePanel(){
  const panel=document.getElementById('repDronePanel');
  const field=document.getElementById('repDroneField');
  if(panel)panel.classList.remove('open','up');
  if(field)field.classList.remove('open');
}

function resetDroneFilter(e){
  if(e)e.stopPropagation();
  window._repSelectedDrones.clear();
  document.querySelectorAll('#repDroneList input[type=checkbox]').forEach(cb=>{cb.checked=false;});
  updateDroneFieldLabel();
  refreshReportOutput();
}

// Закрытие панели бортов кликом вне
document.addEventListener('click',e=>{
  const wrap=document.getElementById('repDroneWrap');
  const panel=document.getElementById('repDronePanel');
  if(!panel||!panel.classList.contains('open'))return;
  if(wrap&&wrap.contains(e.target))return;
  closeDronePanel();
});

// Базовая фильтрация вылетов по периоду/пилоту/бортам — общая для отчётов
function reportFilterFlights(from,to,filterPilot,filterDrones){
  let f=[...state.flights];
  if(from)f=f.filter(x=>x.date>=from);
  if(to)f=f.filter(x=>x.date<=to);
  if(filterPilot)f=f.filter(x=>x.pilot===filterPilot);
  if(filterDrones&&filterDrones.length)f=f.filter(x=>filterDrones.includes(x.drone));
  return f;
}

// Точка входа: обновляет фильтры и перестраивает отчёт
function buildReport(){
  fillReportFilters();
  refreshReportOutput();
}

// Перестроение отчёта без переинициализации фильтров (для живого обновления при выборе борта)
function refreshReportOutput(){
  window._reportText=null;
  const type=document.getElementById('repType').value;
  const from=document.getElementById('repFrom').value;
  const to=document.getElementById('repTo').value;
  const filterPilot=document.getElementById('repPilot').value;
  const filterDrones=[...window._repSelectedDrones];
  const out=document.getElementById('reportOutput');
  const f=reportFilterFlights(from,to,filterPilot,filterDrones);
  // Подпись активных фильтров
  const filterLabel=[
    filterPilot?`пилот: ${filterPilot}`:'',
    filterDrones.length?`борт: ${filterDrones.join(', ')}`:'',
    from||to?`${from||'...'} — ${to||'...'}`:'',
  ].filter(Boolean).join(' · ');

  if(type==='stock') reportStock(out);
  else if(type==='flights') reportFlights(out,f);
  else if(type==='losses') reportLosses(out,f);
  else if(type==='summary') reportSummary(out,f);
  else if(type==='detailed') buildDetailedReport(f,filterLabel,out);
  else if(type==='issued') reportIssued(out,from,to,filterPilot,filterDrones);
  else if(type==='verbal') reportVerbal(out);
  else if(type==='reportage') reportReportage(out);
  else if(type==='byfilter') reportByFilter(out);
}

// Показ опции «Репортаж недели» только для admin/cmd (вызывается при открытии вкладки отчётов и смене роли)
function repToggleReportageOption(){
  const opt=document.getElementById('repTypeReportage');
  if(!opt) return;
  const show=rpgIsPrivileged();
  opt.style.display=show?'':'none';
  if(!show){
    const sel=document.getElementById('repType');
    if(sel&&sel.value==='reportage'){ sel.value='stock'; }
  }
}

function reportStock(out){
    const stockBG=state.stock.filter(d=>d.status==='bg');
    const stockNBG=state.stock.filter(d=>d.status!=='bg');

    // Перемещения за последние 24 часа
    const now=Date.now();
    const day=24*60*60*1000;
    const todayStr=todayISO();
    const recentTransfers=(state.transfers||[]).filter(op=>{
      const dt=new Date(op.date+'T'+(op.time||'00:00'));
      return (now-dt.getTime())<=day;
    }).sort((a,b)=>{
      const ta=a.date+(a.time||'00:00');
      const tb=b.date+(b.time||'00:00');
      return tb.localeCompare(ta);
    });
    // Префикс даты: если запись вчерашняя — пишем "Вчера HH:MM", если сегодняшняя — просто HH:MM
    const datePrefix=op=>{
      if(!op.date)return '';
      if(op.date<todayStr)return 'Вчера '+(op.time||'');
      return op.time||'';
    };
    // Причина потери — из note ВЫЛЕТА (у loss-записи note нет). Связь как в
    // applyLossIfNeeded/updateLossTransferDrone: flightId → пилот+борт+дата+время.
    const lossNote=op=>{
      const fl=state.flights||[];
      let f=op.flightId?fl.find(x=>x.id===op.flightId):null;
      if(!f){
        const p=(op.pilot||'').toLowerCase(), d=(op.drone||'').toLowerCase();
        f=fl.find(x=>(x.pilot||'').toLowerCase()===p&&(x.drone||'').toLowerCase()===d&&x.date===op.date&&(x.time||'')===(op.time||''));
      }
      return (f&&f.note)?f.note:'';
    };
    // Формируем строки перемещений — потери не дедуплицируем, остальные по уникальному тексту
    const moveFmt=op=>{
      const prefix=datePrefix(op);
      const pfx=prefix?'('+prefix+') ':'';
      if(op.type==='loss'){ const n=lossNote(op); return pfx+'✈ Потеря: '+op.drone+' — пилот '+op.pilot+(n?' ('+n+')':''); }
      if(op.type==='exchange'){
        let exTxt;
        if(op.give&&op.get) exTxt='⇄ Обмен с '+op.unit+': отдали '+op.give+' — '+op.giveQty+' шт., получили '+op.get+' — '+op.getQty+' шт.';
        else if(op.give) exTxt='→ Передача '+op.unit+': отдали '+op.give+' — '+op.giveQty+' шт.';
        else exTxt='← Получено от '+op.unit+': '+op.get+' — '+op.getQty+' шт.';
        return pfx+exTxt+(op.note?' ('+op.note+')':'');
      }
      if(op.type==='arrival') return pfx+'📦 Поступление: '+op.drone+' — '+op.qty+' шт.'+(op.note?' ('+op.note+')':'');
      if(op.type==='startbalance') return pfx+'⚑ Стартовый остаток ('+(op.location||op.to||'')+'): '+(op.drone||'')+' — '+(op.qty||0)+' шт.'+(op.note?' ('+op.note+')':'');
      // Хвостовая ветка ловит и типы без своей строки (adjust, будущие move/writeoff/handover):
      // подставляем пустые строки, иначе незаполненное направление печаталось как «undefined»
      return pfx+'→ '+(op.from||'')+' → '+(op.to||'')+': '+(op.drone||'')+' — '+(op.qty||0)+' шт.'+(op.note?' ('+op.note+')':'');
    };
    // Дедупликация только для не-потерь (передачи могут задваиваться технически)
    const seenNonLoss=new Set();
    const seenLoss=new Set();
    const moveItems=recentTransfers.filter(op=>{
      if(op.type==='loss'){
        // Дедуплицируем потери по ключу пилот+борт+дата+время
        const lk=(op.pilot||'')+'|'+(op.drone||'')+'|'+(op.date||'')+'|'+(op.time||'');
        if(seenLoss.has(lk))return false;
        seenLoss.add(lk);
        return true;
      }
      const k=moveFmt(op);
      if(seenNonLoss.has(k))return false;
      seenNonLoss.add(k);
      return true;
    });
    const moveKeys=moveItems.map(moveFmt);
    const moveIsRed=(_,i)=>moveItems[i]&&moveItems[i].type==='loss';

    // Расчёты без бортов (drones пуст или все qty=0) в отчёт не выводятся вовсе —
    // это отчёт для чтения, пустой заголовок «✅ Пилот X» не нужен
    // (в renderAdminSquads пустые расчёты, наоборот, видимы — там контекст управления)
    const squadsWithDrones=(state.squads||[])
      .map(sq=>({pilot:sq.pilot,drones:(sq.drones||[]).filter(d=>d.qty!==0)}))
      .filter(sq=>sq.drones.length);

    // Текст для копирования
    window._reportText=[
      'ФПВ ИСР',
      ...squadsWithDrones.flatMap(sq=>['','✅ Пилот '+sq.pilot,...sq.drones.map(d=>d.name+' — '+d.qty+' шт.')]),
      '','✅ Склад:',...stockBG.filter(d=>d.qty>0).map(d=>d.name+' — '+d.qty+' шт.'),
      ...(stockNBG.length?['','Не БГ:',...stockNBG.map(d=>d.name+' — '+d.qty+' шт.')]:[]),
      ...(moveKeys.length?['','Изменения (последние 24ч):',...moveKeys]:[]),
    ].join('\n');

    // Все пользовательские/облачные данные (пилоты, борта, заметки передач) — через esc()
    const movementsBlock=moveKeys.length
      ?'<div style="margin:10px 0 4px;font-weight:700">Изменения (последние 24ч):</div>'
        +moveKeys.map((k,i)=>'<div class="rb-line"'+(moveIsRed(k,i)?' style="color:var(--red)"':'')+'>'+esc(k)+'</div>').join('')
      :'<div style="color:var(--muted);font-size:11px;margin-top:8px">Изменений за последние 24ч нет</div>';
    out.innerHTML='<div class="report-block">'
      +'<div class="rb-head">ФПВ ИСР</div>'
      +squadsWithDrones.map(sq=>'<div style="margin:8px 0 4px;font-weight:700">✅ Пилот '+esc(sq.pilot)+'</div>'+sq.drones.map(d=>'<div class="rb-line">'+esc(d.name)+' — '+d.qty+' шт.</div>').join('')).join('')
      +'<div style="margin:10px 0 4px;font-weight:700">✅ Склад:</div>'
      +stockBG.filter(d=>d.qty>0).map(d=>'<div class="rb-line">'+esc(d.name)+' — '+d.qty+' шт.</div>').join('')
      +(stockNBG.length?'<div style="margin:10px 0 4px;font-weight:700">Не БГ:</div>'+stockNBG.map(d=>'<div class="rb-line">'+esc(d.name)+' — '+d.qty+' шт.</div>').join(''):'')
      +movementsBlock
      +'</div>';

}

function reportFlights(out,f){
    const byPilot={};
    f.forEach(x=>{if(!byPilot[x.pilot])byPilot[x.pilot]=[];byPilot[x.pilot].push(x);});
    const entries=Object.entries(byPilot);
    if(!entries.length){
      out.innerHTML='<div style="color:var(--muted);padding:16px">Нет данных за период</div>';
    } else {
      const wTarget=Math.max(...f.map(x=>(x.target||'—').length),1);
      const wDrone=Math.max(...f.map(x=>(x.drone||'—').length),1);
      const hasGeo=f.some(x=>x.range_km!=null||x.distance_km!=null); // колонки только если данные есть
      const fmtLine=(x,i)=>{
        const tgt=(x.target||'—').padEnd(wTarget);
        const drn=(x.drone||'—').padEnd(wDrone);
        const res=x.result==='yes'?'✅':'❌';
        const ret=x.returned==='yes'?'борт вернул':'борт потерян';
        const note=x.note?' · '+x.note:'';
        const geo=hasGeo?` · дальн ${x.range_km!=null?x.range_km:'—'} км · путь ${x.distance_km!=null?x.distance_km:'—'} км`:'';
        return `${i+1}. ${x.date} ${x.time} · ${tgt} · ${drn} · ${res} · ${ret}${geo}${note}`;
      };
      const totalDist=f.reduce((s,x)=>s+(x.distance_km||0),0);
      const rngF=f.filter(x=>x.range_km!=null);                       // среднее только по вылетам с range_km
      const avgRange=rngF.length?geoRound2(rngF.reduce((s,x)=>s+x.range_km,0)/rngF.length):null;
      const summary=[];
      if(hasGeo&&totalDist>0) summary.push(`Суммарный налёт за период: ${geoRound2(totalDist)} км`);
      if(avgRange!=null) summary.push(`Среднее расстояние до цели: ${avgRange} км`);
      const textLines=[];
      entries.forEach(([p,fs])=>{
        fs.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
        textLines.push(`Пилот: ${p} — ${fs.length} вылетов`);
        fs.forEach((x,i)=>textLines.push(fmtLine(x,i)));
        textLines.push('');
      });
      summary.forEach(l=>textLines.push(l));
      window._reportText=textLines.join('\n').trimEnd();
      out.innerHTML=entries.map(([p,fs])=>`
        <div class="report-block">
          <div class="rb-head">Пилот: ${esc(p)} — ${fs.length} вылетов</div>
          ${fs.map((x,i)=>`<div class="rb-line" style="font-family:'Courier New',monospace;white-space:pre">${esc(fmtLine(x,i))}</div>`).join('')}
        </div>`).join('')
        +(summary.length?`<div class="report-block">${summary.map(l=>`<div class="rb-line" style="font-weight:700">${esc(l)}</div>`).join('')}</div>`:'');
    }

}

function reportLosses(out,f){
    f=f.filter(x=>x.returned==='no');
    window._writeoffLosses=f; // для документа на списание (writeoff.js)
    // Кнопка формирования акта списания — только командиру (cmd)
    const isCmd=hasRole('cmd'); // предикат из app.js (вызов только в рантайме)
    const woBtn=(isCmd&&f.length)
      ?`<button class="btn btn-sm" style="margin-top:12px;color:var(--accent2)" onclick="woOpenWriteoff()">📄 Документ на списание (${f.length})</button>`
      :'';
    if(!f.length){
      window._reportText='Потери БПЛА — 0 борт(ов)\nПотерь нет';
      out.innerHTML=`<div class="report-block"><div class="rb-head">Потери БПЛА — 0 борт(ов)</div><div class="rb-line">Потерь нет</div></div>`;
    } else {
      const wPilot=Math.max(...f.map(x=>(x.pilot||'—').length),1);
      const wDrone=Math.max(...f.map(x=>(x.drone||'—').length),1);
      const fmtLine=x=>{
        const plt=(x.pilot||'—').padEnd(wPilot);
        const drn=(x.drone||'—').padEnd(wDrone);
        return `${x.date} ${x.time} · Пилот: ${plt} · ${drn} · ${x.note||'причина не указана'}`;
      };
      window._reportText=[`Потери БПЛА — ${f.length} борт(ов)`,...f.map(fmtLine)].join('\n');
      out.innerHTML=`<div class="report-block">
        <div class="rb-head">Потери БПЛА — ${f.length} борт(ов)</div>
        ${f.map(x=>`<div class="rb-line" style="font-family:'Courier New',monospace;white-space:pre">${esc(fmtLine(x))}</div>`).join('')}
        ${woBtn}
      </div>`;
    }

}

function reportSummary(out,f){
    const hasGeo=f.some(x=>x.distance_km!=null); // колонки гео только при наличии данных
    const byPilot={};
    f.forEach(x=>{
      if(!byPilot[x.pilot])byPilot[x.pilot]={total:0,done:0,lost:0,returned:0,km:0,rkmSum:0,rkmCnt:0};
      byPilot[x.pilot].total++;
      if(x.result==='yes')byPilot[x.pilot].done++;
      if(x.returned==='no')byPilot[x.pilot].lost++;
      else byPilot[x.pilot].returned++;
      byPilot[x.pilot].km+=x.distance_km||0;
      if(x.range_km!=null){ byPilot[x.pilot].rkmSum+=x.range_km; byPilot[x.pilot].rkmCnt++; } // среднее только по вылетам с range_km
    });
    const avgKm=s=>s.rkmCnt?geoRound2(s.rkmSum/s.rkmCnt):'—';
    const rows=Object.entries(byPilot);
    if(!rows.length){
      out.innerHTML=`<div class="report-block"><div class="rb-head">Сводка по расчётам</div><div class="rb-line">Нет данных</div></div>`;
    } else {
      const mono="font-family:'Courier New',monospace;white-space:pre";
      const totRkmSum=rows.reduce((s,[,v])=>s+v.rkmSum,0), totRkmCnt=rows.reduce((s,[,v])=>s+v.rkmCnt,0);
      const totAvg=totRkmCnt?geoRound2(totRkmSum/totRkmCnt):'—';
      const hdrCols=['Пилот','Вылетов','Выполнено','Не выполнено','Борт вернул','Потерь'].concat(hasGeo?['Налёт, км','Ср.дальн,км']:[]);
      const dataRows=rows.map(([p,s])=>[p,s.total,s.done,s.total-s.done,s.returned,s.lost].concat(hasGeo?[geoRound2(s.km),avgKm(s)]:[]));
      const totRow=['Итого',
        rows.reduce((s,[,v])=>s+v.total,0),
        rows.reduce((s,[,v])=>s+v.done,0),
        rows.reduce((s,[,v])=>s+(v.total-v.done),0),
        rows.reduce((s,[,v])=>s+v.returned,0),
        rows.reduce((s,[,v])=>s+v.lost,0)
      ].concat(hasGeo?[geoRound2(rows.reduce((s,[,v])=>s+v.km,0)),totAvg]:[]);
      const allForW=[...dataRows,totRow];
      const widths=hdrCols.map((h,i)=>Math.max(h.length,...allForW.map(r=>String(r[i]).length)));
      const last=widths.length-1;
      const pad=(val,i)=>i<last?String(val).padEnd(widths[i]):String(val);
      const mkCell=(val,i,color,bold)=>{
        const s=pad(val,i);
        const style=(bold?'font-weight:700;':'')+(color?'color:'+color+';':'');
        if(style)return `<span style="${style}">${esc(s)}</span>`;
        return esc(s);
      };
      const hdr=hdrCols.map((h,i)=>pad(h,i)).join(' · ');
      const sep='─'.repeat(hdr.length);
      const mkDataRow=([p,s])=>{
        const cells=[mkCell(p,0,'',false),mkCell(s.total,1,'',false),mkCell(s.done,2,'var(--green2)',false),
          mkCell(s.total-s.done,3,(s.total-s.done)>0?'var(--red)':'',false),mkCell(s.returned,4,'',false),mkCell(s.lost,5,s.lost>0?'var(--red)':'',false)];
        if(hasGeo){ cells.push(mkCell(geoRound2(s.km),6,'',false)); cells.push(mkCell(avgKm(s),7,'',false)); }
        return cells.join(' · ');
      };
      const mkTotRow=r=>{
        const cells=[mkCell(r[0],0,'',true),mkCell(r[1],1,'',true),mkCell(r[2],2,'var(--green2)',true),
          mkCell(r[3],3,r[3]>0?'var(--red)':'',true),mkCell(r[4],4,'',true),mkCell(r[5],5,r[5]>0?'var(--red)':'',true)];
        if(hasGeo){ cells.push(mkCell(r[6],6,'',true)); cells.push(mkCell(r[7],7,'',true)); }
        return cells.join(' · ');
      };
      out.innerHTML=`<div class="report-block">
        <div class="rb-head">Сводка по расчётам</div>
        <div class="rb-line" style="${mono}">${esc(hdr)}</div>
        <div class="rb-line" style="${mono};color:var(--border2)">${esc(sep)}</div>
        ${rows.map(r=>`<div class="rb-line" style="${mono}">${mkDataRow(r)}</div>`).join('')}
        <div class="rb-line" style="${mono};color:var(--border2)">${esc(sep)}</div>
        <div class="rb-line" style="${mono}">${mkTotRow(totRow)}</div>
      </div>`;
    }
}

function reportIssued(out,from,to,filterPilot,filterDrones){
    let transList=(state.transfers||[]).filter(t=>t.type==='transfer'&&t.to!=='склад'&&t.to!=='не бг'&&t.to!=='списан');
    if(from) transList=transList.filter(t=>t.date>=from);
    if(to)   transList=transList.filter(t=>t.date<=to);
    if(filterPilot) transList=transList.filter(t=>t.to===filterPilot);
    if(filterDrones&&filterDrones.length){
      const low=filterDrones.map(d=>d.toLowerCase());
      transList=transList.filter(t=>low.includes((t.drone||'').toLowerCase()));
    }
    const agg=new Map();
    transList.forEach(t=>{
      const key=t.to+'||'+t.drone+'||'+(t.date||'');
      if(!agg.has(key)) agg.set(key,{pilot:t.to,drone:t.drone,date:t.date||'',qty:0});
      agg.get(key).qty+=(t.qty||1);
    });
    // строка на каждую дату выдачи (пилот+борт+date); внутри дня qty суммируется.
    // Порядок — хронология по дате глобально (легаси 2000-01-01 лексикографически первыми),
    // при равной дате — пилот, затем борт. _reportText использует тот же массив rows.
    const rows=[...agg.values()].sort((a,b)=>
      (a.date||'').localeCompare(b.date||'')||a.pilot.localeCompare(b.pilot)||a.drone.localeCompare(b.drone));
    const hasFilter=from||to||filterPilot||(filterDrones&&filterDrones.length);
    if(!rows.length){
      const msg=hasFilter?'Нет данных за выбранный период':'Нет данных';
      window._reportText='Выдано бортов\n'+msg;
      out.innerHTML=`<div class="report-block"><div class="rb-head">Выдано бортов</div><div class="rb-line">${msg}</div></div>`;
    } else {
      const DATE_HDR='Дата выдачи';
      const dDate=r=>r.date==='2000-01-01'?'—':(r.date||''); // легаси-дата до начала учёта → тире
      const wPilot=Math.max(...rows.map(r=>r.pilot.length),'Пилот'.length);
      const wDrone=Math.max(...rows.map(r=>r.drone.length),'Борт'.length);
      const wDate=Math.max(...rows.map(r=>dDate(r).length),DATE_HDR.length);
      const wQty=Math.max(...rows.map(r=>String(r.qty).length),'Количество'.length);
      const hdr=`${'Пилот'.padEnd(wPilot)} · ${'Борт'.padEnd(wDrone)} · ${DATE_HDR.padEnd(wDate)} · Количество`;
      const sep='─'.repeat(wPilot+wDrone+wDate+wQty+9);
      const fmtRow=r=>`${r.pilot.padEnd(wPilot)} · ${r.drone.padEnd(wDrone)} · ${dDate(r).padEnd(wDate)} · ${r.qty}`;
      const totalQty=rows.reduce((s,r)=>s+r.qty,0);
      const uniqueDrones=[...new Set(rows.map(r=>r.drone))].length;
      window._reportText=['Выдано бортов',hdr,sep,...rows.map(fmtRow),'',`Итого выдано: ${totalQty} бортов, ${uniqueDrones} типов`].join('\n');
      const mono="font-family:'Courier New',monospace;white-space:pre";
      out.innerHTML=`<div class="report-block">
        <div class="rb-head">Выдано бортов</div>
        <div class="rb-line" style="${mono}">${esc(hdr)}</div>
        <div class="rb-line" style="${mono};color:var(--border2)">${esc(sep)}</div>
        ${rows.map(r=>`<div class="rb-line" style="${mono}">${esc(fmtRow(r))}</div>`).join('')}
        <div class="rb-line" style="margin-top:8px;font-weight:700">Итого выдано: ${totalQty} бортов, ${uniqueDrones} типов</div>
      </div>`;
    }
}

// Сводка по ТЕКУЩЕЙ выборке журнала вылетов. Считается по снимку window._flLastFiltered
// (массив + значения 6 фильтров), НЕ пересчитывается из фильтров вкладки «Отчёты».
function reportByFilter(out){
  const MONO="font-family:'Courier New',monospace;white-space:pre";
  const f=window._flLastFiltered;
  const meta=window._flLastFilter||{};
  const head=(t)=>`<div class="rb-head">${esc(t)}</div>`;
  if(!f){
    out.innerHTML=`<div class="report-block">${head('Отчёт по выборке журнала')}<div class="rb-line">Откройте «Журнал вылетов» и нажмите «📊 Отчёт».</div></div>`;
    window._reportText='Отчёт по выборке журнала\nНет выборки.';
    return;
  }
  // ISO 'YYYY-MM-DD' → 'DD.MM.YYYY' строкой (без Date — иначе UTC-сдвиг дня); легаси 2000-01-01 → «—»
  const dDate=d=>d==='2000-01-01'?'—':(d&&/^\d{4}-\d{2}-\d{2}$/.test(d)?d.split('-').reverse().join('.'):(d||''));
  // 1. Заголовок: диапазон дат + активные фильтры (что «все» — не перечисляем)
  const rangeTxt=(meta.from||meta.to)?`${dDate(meta.from)||'…'} — ${dDate(meta.to)||'…'}`:'весь период';
  const RES={yes:'выполнено',no:'не выполнено'}, RET={yes:'вернул',no:'потерял'};
  const filt=[
    meta.pilot?`пилот: ${meta.pilot}`:'',
    (meta.drones&&meta.drones.length)?`борт: ${meta.drones.join(', ')}`:'',
    (meta.ammo&&meta.ammo.length)?`боеприпас: ${meta.ammo.join(', ')}`:'',
    (meta.result&&meta.result!=='all')?`результат: ${RES[meta.result]||meta.result}`:'',
    (meta.returned&&meta.returned!=='all')?`возврат: ${RET[meta.returned]||meta.returned}`:''
  ].filter(Boolean);
  // Агрегаты по снимку
  const byDrone={}, byAmmo={}, byPilot={};
  let done=0, notdone=0;
  f.forEach(x=>{
    const dn=x.drone||'—'; if(!byDrone[dn])byDrone[dn]={fl:0,lost:0}; byDrone[dn].fl++; if(x.returned==='no')byDrone[dn].lost++;
    const am=x.ammo||'—'; byAmmo[am]=(byAmmo[am]||0)+1;
    // Группировка «по пилотам» — СТАТИСТИКА (squadKey, сейчас = pilot; при разделении
    // «расчёт/пилот» статистика остаётся за персоной — вызов squadKeyOf снять, ADR-001 §3).
    const pl=squadKeyOf(x.pilot)||'—'; if(!byPilot[pl])byPilot[pl]={fl:0,done:0,lost:0}; byPilot[pl].fl++;
    if(x.result==='yes'){byPilot[pl].done++;done++;} else if(x.result==='no')notdone++;
    if(x.returned==='no')byPilot[pl].lost++;
  });
  const droneRows=Object.entries(byDrone).sort((a,b)=>b[1].fl-a[1].fl).map(([k,v])=>[k,v.fl,v.lost]);
  const ammoRows=Object.entries(byAmmo).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,v]);
  const pilotRows=Object.entries(byPilot).sort((a,b)=>b[1].fl-a[1].fl).map(([k,v])=>[k,v.fl,v.done,v.lost]);
  // Моноширинная таблица: возвращает {text:[строки], html:'…'}; имена эскейпятся целой строкой
  const mkTable=(cols,rows)=>{
    const all=[cols,...rows];
    const w=cols.map((h,i)=>Math.max(...all.map(r=>String(r[i]).length)));
    const last=w.length-1;
    const fmt=r=>r.map((v,i)=>i<last?String(v).padEnd(w[i]):String(v)).join(' · ');
    const hdr=fmt(cols), sep='─'.repeat(hdr.length);
    return {
      text:[hdr,sep,...rows.map(fmt)],
      html:`<div class="rb-line" style="${MONO}">${esc(hdr)}</div>`
        +`<div class="rb-line" style="${MONO};color:var(--border2)">${esc(sep)}</div>`
        +(rows.length?rows.map(r=>`<div class="rb-line" style="${MONO}">${esc(fmt(r))}</div>`).join('')
                     :`<div class="rb-line" style="color:var(--muted)">—</div>`)
    };
  };
  const tDrone=mkTable(['Модель','Вылетов','Потеряно'],droneRows);
  const tAmmo=mkTable(['Боеприпас','Применений'],ammoRows);
  const tPilot=mkTable(['Пилот','Вылетов','Выполнено','Потеряно'],pilotRows);
  const total=f.length;
  // HTML
  const filtHtml=filt.length?`<div class="rb-line" style="color:var(--muted)">Фильтры: ${esc(filt.join(' · '))}</div>`:'';
  out.innerHTML=`<div class="report-block">
    ${head('Отчёт по выборке журнала')}
    <div class="rb-line">Период: ${esc(rangeTxt)} · вылетов в выборке: ${total}</div>
    ${filtHtml}
  </div>
  ${total?`<div class="report-block">${head('Борта')}${tDrone.html}</div>
  <div class="report-block">${head('Боеприпасы')}${tAmmo.html}</div>
  <div class="report-block">${head('Итоги')}
    <div class="rb-line" style="${MONO}">Выполнено · <span style="color:var(--green2)">${done}</span>   Не выполнено · <span style="color:var(--red)">${notdone}</span>   Всего вылетов · ${total}</div>
  </div>
  <div class="report-block">${head('По пилотам')}${tPilot.html}</div>`
  :`<div class="report-block"><div class="rb-line" style="color:var(--muted)">Нет вылетов в выборке</div></div>`}`;
  // Plain-text копия
  const lines=['Отчёт по выборке журнала','Период: '+rangeTxt+' · вылетов в выборке: '+total];
  if(filt.length)lines.push('Фильтры: '+filt.join(' · '));
  if(total){
    lines.push('','Борта',...tDrone.text,'','Боеприпасы',...tAmmo.text,'',
      'Итоги: выполнено '+done+', не выполнено '+notdone+', всего '+total,
      '','По пилотам',...tPilot.text);
  } else lines.push('','Нет вылетов в выборке');
  window._reportText=lines.join('\n');
}

function isDelivery(ammo){
  if(!ammo)return false;
  const a=ammo.toLowerCase();
  return a.includes('доставк') || a.includes('провизи') || a.includes('груз');
}

// ===== НОМИНАЦИИ (общие правила присуждения — для медалей и отчёта) =====
// Победитель номинации — ЕДИНСТВЕННЫЙ пилот с явным отрывом.
//   cands: [{pilot, value, ...}] (value=null → не участвует);
//   higherBetter: больше значение = лучше;
//   dominates(best,second): достаточен ли отрыв.
// Правила: один кандидат → присуждаем всегда; ничья (равные) → не присуждаем;
// иначе — только если отрыв проходит dominates().
function _nomWinner(cands, higherBetter, dominates){
  const c=cands.filter(x=>x.value!=null);
  if(!c.length) return null;
  c.sort((a,b)=> higherBetter ? b.value-a.value : a.value-b.value);
  const best=c[0];
  if(higherBetter && !(best.value>0)) return null;   // нулевой максимум не награждаем
  if(c.length===1) return best;                       // один активный — всегда
  const second=c[1];
  if(second.value===best.value) return null;          // ничья
  return dominates(best.value, second.value) ? best : null;
}
// Числовой «больше-лучше»: второй результат < лучший × 0.9 (отрыв >10%)
function nomRatioTop(cands){ return _nomWinner(cands, true, (b,s)=> s < b*0.9); }
// Процентный показатель: разница ≥ 10 процентных пунктов (higherBetter — направление)
function nomPctTop(cands, higherBetter){ return _nomWinner(cands, !!higherBetter, (b,s)=> Math.abs(b-s) >= 10); }
// Серия без потерь: разница ≥ 2 вылета
function nomStreakTop(cands){ return _nomWinner(cands, true, (b,s)=> (b-s) >= 2); }

// Строки раздела «ОТЛИЧИВШИЕСЯ ЗА ПЕРИОД» для подробного отчёта.
// Только победитель каждой номинации, без иконок/названий медалей.
function perfNominationLines(flights){
  const fl=flights.filter(x=>x.pilot&&x.pilot!=='[ПЕРЕДАЧА]');
  const pilots=[...new Set(fl.map(x=>x.pilot))].filter(Boolean);
  if(!pilots.length) return [];
  const hasGeo=fl.some(x=>x.range_km!=null);
  const at=p=>fl.filter(x=>x.pilot===p);
  const lines=[];

  // Самый дальний вылет (только при наличии гео)
  if(hasGeo){
    const c=pilots.map(p=>{ const far=at(p).filter(x=>x.range_km!=null).sort((a,b)=>b.range_km-a.range_km)[0]; return {pilot:p, value:far?far.range_km:null, _f:far}; });
    const r=nomRatioTop(c);
    if(r) lines.push(`${r.pilot} — самый дальний вылет: ${r.value} км${r._f&&r._f.date?` (${r._f.date})`:''}`);
  }
  // Больше всего вылетов
  {
    const c=pilots.map(p=>({pilot:p, value:at(p).length}));
    const r=nomRatioTop(c);
    if(r) lines.push(`${r.pilot} — больше всего вылетов: ${r.value}`);
  }
  // Лучший результат — % выполнения (мин. 3 вылета)
  {
    const c=pilots.map(p=>{ const a=at(p); return {pilot:p, value:a.length>=3?a.filter(x=>x.result==='yes').length/a.length*100:null}; });
    const r=nomPctTop(c, true);
    if(r){ const a=at(r.pilot); const done=a.filter(x=>x.result==='yes').length; lines.push(`${r.pilot} — лучший результат: ${Math.round(r.value)}% выполнения (${done} из ${a.length})`); }
  }
  // Меньше всего потерь — % потерь (мин. 3 вылета)
  {
    const c=pilots.map(p=>{ const a=at(p); return {pilot:p, value:a.length>=3?a.filter(x=>x.returned==='no').length/a.length*100:null}; });
    const r=nomPctTop(c, false);
    if(r){ const a=at(r.pilot); lines.push(`${r.pilot} — меньше всего потерь: ${Math.round(r.value)}% (${a.length} вылетов)`); }
  }
  // Лучшая серия без потерь (наибольшая серия в периоде)
  {
    const streakOf=p=>{ const a=at(p).slice().sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time)); let best=0,cur=0; for(const f of a){ if(f.returned==='no') cur=0; else { cur++; if(cur>best) best=cur; } } return best; };
    const c=pilots.map(p=>({pilot:p, value:streakOf(p)}));
    const r=nomStreakTop(c);
    if(r) lines.push(`${r.pilot} — лучшая серия без потерь: ${r.value} вылетов подряд`);
  }
  // Лучший день (рекорд вылетов за один календарный день)
  {
    const dm=p=>{ const by={}; at(p).forEach(x=>{by[x.date]=(by[x.date]||0)+1;}); let b=0,d=null; for(const k in by){ if(by[k]>b){ b=by[k]; d=k; } } return {v:b, d}; };
    const c=pilots.map(p=>{ const x=dm(p); return {pilot:p, value:x.v>=2?x.v:null, _d:x.d}; });
    const r=nomRatioTop(c);
    if(r) lines.push(`${r.pilot} — лучший день: ${r.value} вылетов${r._d?` (${r._d})`:''}`);
  }
  return lines;
}

function buildDetailedReport(f,filterLabel,out){
  f=f.filter(x=>x.pilot&&x.pilot!=='[ПЕРЕДАЧА]');
  const pilotNames=[...new Set(f.map(x=>x.pilot))].filter(Boolean);
  const hasGeo=f.some(x=>x.distance_km!=null); // строка налёта только при наличии гео

  function stats(flights){
    const total=flights.length;
    const done=flights.filter(x=>x.result==='yes').length;
    const ret=flights.filter(x=>x.returned==='yes').length;
    const lost=flights.filter(x=>x.returned==='no').length;
    const delivery=flights.filter(x=>isDelivery(x.ammo));
    const mining=flights.filter(x=>!isDelivery(x.ammo));
    const km=flights.reduce((s,x)=>s+(x.distance_km||0),0);
    const rngF=flights.filter(x=>x.range_km!=null);                           // среднее только по вылетам с range_km
    const avgRange=rngF.length?geoRound2(rngF.reduce((s,x)=>s+x.range_km,0)/rngF.length):null;
    const pct=(a,b)=>b?'('+Math.round(a/b*100)+'%)':'—';
    return {total,done,notDone:total-done,ret,lost,km,avgRange,
      delivery:{total:delivery.length,done:delivery.filter(x=>x.result==='yes').length,notDone:delivery.filter(x=>x.result==='no').length},
      mining:{total:mining.length,done:mining.filter(x=>x.result==='yes').length,notDone:mining.filter(x=>x.result==='no').length},
      pct};
  }

  const pilotStats=pilotNames.map(p=>({name:p,s:stats(f.filter(x=>x.pilot===p))}));
  const totalS=stats(f);
  const period=filterLabel||'за всё время';

  if(!pilotStats.length){
    out.innerHTML=`<div class="report-block"><div class="rb-head">Подробный отчёт по расчётам · ${esc(period)}</div><div class="rb-line">Нет данных</div></div>`;
    return;
  }

  const allStats=[...pilotStats.map(p=>p.s),totalS];
  const colHdrs=['Показатель',...pilotStats.map((p,i)=>`Расчёт ${i+1} (${p.name})`),'Итого'];

  // null = пустая строка-разделитель между секциями
  const metricDefs=[
    {label:'Всего вылетов',section:true,fn:s=>String(s.total)},
    {label:'Задача выполнена',fn:s=>`${s.done} ${s.pct(s.done,s.total)}`},
    {label:'Задача не выполнена',fn:s=>`${s.notDone} ${s.pct(s.notDone,s.total)}`,red:s=>s.notDone>0},
    {label:'Борт вернулся',fn:s=>`${s.ret} ${s.pct(s.ret,s.total)}`},
    {label:'Борт потерян',fn:s=>`${s.lost} ${s.pct(s.lost,s.total)}`,red:s=>s.lost>0},
    null,
    {label:'Минирование (всего)',section:true,fn:s=>String(s.mining.total)},
    {label:'— удачных',fn:s=>`${s.mining.done} ${s.pct(s.mining.done,s.mining.total)}`},
    {label:'— неудачных',fn:s=>`${s.mining.notDone} ${s.pct(s.mining.notDone,s.mining.total)}`,red:s=>s.mining.notDone>0},
    null,
    {label:'Доставка (всего)',section:true,fn:s=>String(s.delivery.total)},
    {label:'— удачных',fn:s=>`${s.delivery.done} ${s.pct(s.delivery.done,s.delivery.total)}`},
    {label:'— неудачных',fn:s=>`${s.delivery.notDone} ${s.pct(s.delivery.notDone,s.delivery.total)}`,red:s=>s.delivery.notDone>0},
  ].concat(hasGeo?[null,
    {label:'Налёт, км',section:true,fn:s=>String(geoRound2(s.km))},
    {label:'Среднее расстояние до цели, км',fn:s=>s.avgRange!=null?String(s.avgRange):'—'}
  ]:[]);

  const textRows=metricDefs.filter(Boolean).map(m=>[m.label,...allStats.map(s=>m.fn(s))]);
  const widths=colHdrs.map((h,i)=>Math.max(h.length,...textRows.map(r=>r[i].length)));
  const last=widths.length-1;
  const pad=(val,i)=>i<last?String(val).padEnd(widths[i]):String(val);
  const mono="font-family:'Courier New',monospace;white-space:pre";
  const hdr=colHdrs.map((h,i)=>pad(h,i)).join(' · ');
  const sep='─'.repeat(hdr.length);

  const mkCell=(val,i,color,bold)=>{
    const s=pad(val,i);
    const style=(bold?'font-weight:700;':'')+(color?'color:'+color+';':'');
    if(style)return `<span style="${style}">${esc(s)}</span>`;
    return esc(s);
  };

  const renderRow=m=>{
    if(!m)return `<div class="rb-line" style="${mono}"> </div>`;
    const parts=[
      mkCell(m.label,0,m.section?'var(--green)':'',!!m.section),
      ...allStats.map((s,si)=>{
        const val=m.fn(s);
        const isRed=m.red&&m.red(s);
        return mkCell(val,si+1,isRed?'var(--red)':m.section?'var(--green)':'',!!m.section);
      })
    ];
    return `<div class="rb-line" style="${mono}">${parts.join(' · ')}</div>`;
  };

  // Раздел «ОТЛИЧИВШИЕСЯ ЗА ПЕРИОД» — простой текст, без иконок/названий медалей
  const nomLines=perfNominationLines(f);
  let nomHtml='';
  if(nomLines.length){
    const nomW=Math.max(33,'ОТЛИЧИВШИЕСЯ ЗА ПЕРИОД'.length,...nomLines.map(l=>l.length));
    const bar='═'.repeat(nomW);
    nomHtml=`
    <div class="rb-line" style="${mono}"> </div>
    <div class="rb-line" style="${mono}">${esc(bar)}</div>
    <div class="rb-line" style="${mono};font-weight:700">ОТЛИЧИВШИЕСЯ ЗА ПЕРИОД</div>
    <div class="rb-line" style="${mono}">${esc(bar)}</div>
    ${nomLines.map(l=>`<div class="rb-line" style="${mono}">${esc(l)}</div>`).join('\n    ')}`;
  }

  out.innerHTML=`<div class="report-block" style="overflow-x:auto">
    <div class="rb-head">Подробный отчёт по расчётам · ${esc(period)}</div>
    <div class="rb-line" style="${mono}">${esc(hdr)}</div>
    <div class="rb-line" style="${mono};color:var(--border2)">${esc(sep)}</div>
    ${metricDefs.map(renderRow).join('\n    ')}${nomHtml}
  </div>`;
}


function copyReport(){
  const txt=window._reportText||document.getElementById('reportOutput').innerText;
  navigator.clipboard.writeText(txt).then(()=>{
    // Хук по id (12.08.2026): раньше кнопка искалась по ТЕКСТУ атрибута onclick —
    // селектор молча переставал находить её от любой правки разметки, и подтверждение
    // «✓ Скопировано» не показывалось (сам буфер при этом заполнялся — дефект незаметный)
    const btn=document.getElementById('repCopyBtn');
    if(btn){const orig=btn.textContent;btn.textContent='✓ Скопировано';setTimeout(()=>{btn.textContent=orig;},1500);}
  }).catch(()=>{
    const el=document.createElement('textarea');
    el.value=txt;document.body.appendChild(el);el.select();document.execCommand('copy');document.body.removeChild(el);
  });
}

function printReport(){
  const content=document.getElementById('reportOutput').innerHTML;
  const win=window.open('','_blank','width=800,height=600');
  if(!win){ alert('Браузер заблокировал окно печати — разрешите всплывающие окна для этого сайта'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Отчёт</title>
  <style>
    body{font-family:'Courier New',monospace;font-size:13px;color:#000;background:#fff;padding:20px;margin:0}
    .rb-head{font-size:15px;font-weight:700;margin-bottom:10px}
    .rb-line{padding:2px 0;font-size:13px}
    div[style*="font-weight:700"]{margin-top:10px;margin-bottom:4px;font-weight:700}
    @media print{body{padding:10px}}
  </style></head><body>${content}</body></html>`);
  win.document.close();
  win.focus();
  win.onafterprint = function(){ win.close(); };
  win.print();
}

// ===== УСТНЫЙ ДОКЛАД (AI, claude-sonnet-4-6) =====
// Данные анонимизируются перед отправкой в Claude API и восстанавливаются в ответе.
// Ничего не сохраняется и не уходит в Google Sheets.
const VR_PROMPT = 'Составь устный военный доклад на русском языке на основе данных о боевых вылетах подразделения за указанный период. Стиль — чёткий, лаконичный, военный. Структура: общие итоги, действия по расчётам, потери, выводы. Не добавляй данные которых нет в исходных данных.';

// Панель устного доклада. Состояние (период, текст, даты) сохраняется в window._vr*,
// чтобы не теряться при перерисовке отчёта.
function reportVerbal(out){
  window._reportText=null;
  const txt=window._vrText||'';
  out.innerHTML=`<div class="report-block">
    <div class="rb-head">Устный доклад (AI)</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Период выбирается вверху (Неделя/Месяц/Год/Произвольный). Перед отправкой в Claude API имена расчётов, точки, борта и грузы заменяются условными номерами и восстанавливаются в ответе. Данные не сохраняются и не уходят в Google Sheets. Нужен API-ключ во вкладке «Импорт». Нажмите «Сформировать» вверху — при недоступности сети/API доклад будет составлен по шаблону автоматически.</div>
    <div id="vrStatus" style="font-size:12px;color:var(--muted);margin-bottom:8px"></div>
    <div id="vrResultWrap" style="display:${txt?'block':'none'}">
      <textarea id="vrResult" style="width:100%;min-height:320px;font-family:inherit;font-size:13px;line-height:1.5;resize:vertical">${esc(txt)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-sm" id="vrCopyBtn" onclick="vrCopy()">Копировать</button>
        <button class="btn btn-sm" onclick="vrPrint()">Печать</button>
      </div>
    </div>
  </div>`;
}

// Селектор периода доклада (в верхнем блоке): сохранить выбор и подстроить видимость
// полей дат («Произвольный» открывает repFrom/repTo). НЕ вызывает API.
function vrPeriodChange(){
  window._vrPeriod=(document.getElementById('vrPeriod')||{}).value;
  repAdaptPeriodFields();
}

// Диапазон дат по выбранному периоду (скользящие окна 7/30/365 дней либо произвольный)
function vrPeriodRange(){
  const per=(document.getElementById('vrPeriod')||{}).value||'week';
  const today=todayISO();
  const fd=iso=>iso?iso.split('-').reverse().join('.'):'…';
  if(per==='custom'){
    // Произвольный период берёт общие поля дат сверху страницы отчётов (repFrom/repTo)
    const from=(document.getElementById('repFrom')||{}).value||'';
    const to=(document.getElementById('repTo')||{}).value||today;
    return {from,to,label:'за период '+fd(from)+' — '+fd(to)};
  }
  const days=per==='week'?7:per==='month'?30:365;
  return {from:localISO(new Date(Date.now()-(days-1)*864e5)), to:today,
    label:per==='week'?'за неделю':per==='month'?'за месяц':'за год'};
}

// Таблица замен для одной категории: реальное значение → «Метка N» (порядок по алфавиту).
// revPrefix добавляется к реальному значению при обратной замене (для пилотов — «пилот »).
function vrIndexMap(values,label,revPrefix){
  const sorted=[...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ru'));
  const toTok=new Map(), rev={};
  sorted.forEach((v,i)=>{ toTok.set(v,label+' '+(i+1)); rev[i+1]=(revPrefix||'')+v; });
  return {sorted,toTok,rev};
}

// Построение анонимизированного текста-данных + таблиц замен.
// НП из примечаний в API НЕ отправляются (только агрегаты) — анонимны по построению.
function vrBuildPayload(flights,label){
  const P=vrIndexMap(flights.map(f=>f.pilot),'Расчёт','пилот ');
  const D=vrIndexMap(flights.map(f=>f.drone),'Борт типа');
  const T=vrIndexMap(flights.map(f=>f.target),'Точка');
  const A=vrIndexMap(flights.map(f=>f.ammo),'Груз');
  const maps={P,D,T,A};
  const isDeliv=a=>(typeof isDelivery==='function')?isDelivery(a):/доставк|провизи|груз/i.test(a||'');
  const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
  const total=flights.length;
  const done=flights.filter(f=>f.result==='yes').length;
  const lost=flights.filter(f=>f.returned==='no').length;
  const mining=flights.filter(f=>!isDeliv(f.ammo)).length;
  const delivery=flights.filter(f=>isDeliv(f.ammo)).length;
  const L=[];
  L.push('Данные о боевых вылетах подразделения '+label+'. Обозначения «Расчёт N», «Борт типа N», «Точка N», «Груз N» используй в докладе дословно, не переименовывай.');
  L.push('');
  L.push('ОБЩИЕ ИТОГИ:');
  L.push('- Всего вылетов: '+total+'.');
  L.push('- Задача выполнена: '+done+' ('+pct(done,total)+').');
  L.push('- Потеряно бортов: '+lost+' ('+pct(lost,total)+').');
  L.push('- Минирование: '+mining+'; доставка: '+delivery+'.');
  L.push('');
  L.push('ПО РАСЧЁТАМ:');
  P.sorted.forEach(p=>{
    const fs=flights.filter(f=>f.pilot===p);
    const d=fs.filter(f=>f.result==='yes').length;
    const l=fs.filter(f=>f.returned==='no').length;
    const m=fs.filter(f=>!isDeliv(f.ammo)).length;
    const dl=fs.filter(f=>isDeliv(f.ammo)).length;
    L.push('- '+P.toTok.get(p)+': вылетов '+fs.length+', выполнено '+d+' ('+pct(d,fs.length)+'), потерь '+l+'; минирование '+m+', доставка '+dl+'.');
  });
  const lossBy={};
  flights.filter(f=>f.returned==='no'&&f.drone).forEach(f=>{ lossBy[f.drone]=(lossBy[f.drone]||0)+1; });
  L.push('');
  L.push('ПОТЕРИ ПО ТИПАМ БОРТОВ:');
  const le=Object.entries(lossBy).sort((a,b)=>b[1]-a[1]);
  if(le.length) le.forEach(([dr,c])=>L.push('- '+D.toTok.get(dr)+': '+c+'.'));
  else L.push('- потерь нет.');
  const ammoBy={};
  flights.filter(f=>f.ammo).forEach(f=>{ ammoBy[f.ammo]=(ammoBy[f.ammo]||0)+1; });
  const ae=Object.entries(ammoBy).sort((a,b)=>b[1]-a[1]);
  if(ae.length){
    L.push('');
    L.push('ПРИМЕНЁННЫЕ ГРУЗЫ:');
    ae.forEach(([am,c])=>L.push('- '+A.toTok.get(am)+': '+c+'.'));
  }
  const tgtBy={};
  flights.filter(f=>f.target).forEach(f=>{ tgtBy[f.target]=(tgtBy[f.target]||0)+1; });
  const te=Object.entries(tgtBy).sort((a,b)=>b[1]-a[1]).slice(0,12);
  if(te.length){
    L.push('');
    L.push('РАБОТА ПО ТОЧКАМ (по убыванию числа вылетов):');
    te.forEach(([tg,c])=>L.push('- '+T.toTok.get(tg)+': '+c+'.'));
  }
  const hasGeo=flights.some(f=>f.distance_km!=null||f.range_km!=null);
  if(hasGeo){
    const km=flights.reduce((s,f)=>s+(f.distance_km||0),0);
    const rng=flights.filter(f=>f.range_km!=null);
    const avg=rng.length?rng.reduce((s,f)=>s+f.range_km,0)/rng.length:null;
    L.push('');
    L.push('ГЕОДАННЫЕ:');
    if(km>0) L.push('- Суммарный налёт: '+geoRound2(km)+' км.');
    if(avg!=null) L.push('- Средняя дальность вылета: '+geoRound2(avg)+' км.');
  }
  return {payload:L.join('\n'), maps};
}

// Обратная замена токенов на реальные данные (с учётом склонений и ё/е)
function vrDeanon(text,M){
  const sub=(re,rev)=>{ text=text.replace(re,(m,n)=> (rev[n]!==undefined?rev[n]:m)); };
  sub(/Расч[её]т[а-яё]*\s+(\d+)/gi, M.P.rev);
  sub(/Борт[а-яё]*\s+типа\s+(\d+)/gi, M.D.rev);
  sub(/Точк[а-яё]*\s+(\d+)/gi, M.T.rev);
  sub(/Груз[а-яё]*\s+(\d+)/gi, M.A.rev);
  return text;
}

function vrSetStatus(t,c){ const st=document.getElementById('vrStatus'); if(st){ st.textContent=t||''; st.style.color=c||'var(--muted)'; } }
function vrFilterFlights(range){
  return (state.flights||[]).filter(f=>f.pilot&&f.pilot!=='[ПЕРЕДАЧА]'&&(!range.from||f.date>=range.from)&&(!range.to||f.date<=range.to));
}
function vrShowText(txt){
  window._vrText=txt;
  const ta=document.getElementById('vrResult'), wrap=document.getElementById('vrResultWrap');
  if(ta) ta.value=txt;
  if(wrap) wrap.style.display='block';
}

// Шаблонный доклад без API — подстановка РЕАЛЬНЫХ данных (локально, анонимизация не нужна)
function vrBuildTemplate(flights, range){
  const fd=iso=>iso?iso.split('-').reverse().join('.'):'—';
  if(!flights.length) return 'За выбранный период вылетов не зафиксировано.';
  const pct=(a,b)=>b?Math.round(a/b*100):0;
  const total=flights.length;
  const done=flights.filter(f=>f.result==='yes').length;
  const lost=flights.filter(f=>f.returned==='no').length;
  const pilots=[...new Set(flights.map(f=>f.pilot).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  const dates=flights.map(f=>f.date).filter(Boolean).sort();
  const dFrom=range.from||dates[0]||'';
  const dTo=range.to||dates[dates.length-1]||'';
  const L=[];
  L.push(`За период с ${fd(dFrom)} по ${fd(dTo)} силами расчётов ${pilots.join(', ')} выполнено ${total} ${ruPlural(total,'боевой вылет','боевых вылета','боевых вылетов')}.`);
  L.push('');
  L.push(`Процент выполнения задач составил ${pct(done,total)}%.`);
  L.push(`Потери техники: ${lost} ${ruPlural(lost,'единица','единицы','единиц')}.`);
  L.push('');
  L.push('По расчётам:');
  pilots.forEach(p=>{
    const fs=flights.filter(f=>f.pilot===p);
    const d=fs.filter(f=>f.result==='yes').length;
    const l=fs.filter(f=>f.returned==='no').length;
    L.push(`Расчёт пилота ${p} — ${fs.length} ${ruPlural(fs.length,'вылет','вылета','вылетов')}, выполнено ${d}, потери ${l}.`);
  });
  const hasGeo=flights.some(f=>f.distance_km!=null||f.range_km!=null);
  if(hasGeo){
    const km=flights.reduce((s,f)=>s+(f.distance_km||0),0);
    const rng=flights.filter(f=>f.range_km!=null);
    const avg=rng.length?rng.reduce((s,f)=>s+f.range_km,0)/rng.length:null;
    const far=rng.slice().sort((a,b)=>b.range_km-a.range_km)[0];
    L.push('');
    if(km>0) L.push(`Суммарный налёт составил ${geoRound2(km)} км.`);
    if(avg!=null) L.push(`Средняя дальность вылета — ${geoRound2(avg)} км.`);
    if(far) L.push(`Наибольшая дальность — ${far.range_km} км (пилот ${far.pilot}, ${fd(far.date)}).`);
  }
  if(lost>0){
    // Группировка потерь по типу борта, столбиком с количеством (по убыванию)
    const byDrone={};
    flights.filter(f=>f.returned==='no').forEach(f=>{ const k=(f.drone||'').trim()||'борт не указан'; byDrone[k]=(byDrone[k]||0)+1; });
    L.push('');
    L.push('В ходе выполнения задач потеряно:');
    Object.entries(byDrone).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ru'))
      .forEach(([dr,c])=>L.push(`  - ${dr} — ${c} шт.`));
  }
  // Период без потерь — по всем данным («по настоящее время»), не только за выбранный период
  const allLosses=(state.flights||[]).filter(f=>f.returned==='no'&&f.date).map(f=>f.date).sort();
  L.push('');
  if(allLosses.length){
    const last=allLosses[allLosses.length-1];
    const days=Math.max(0,Math.round((Date.now()-new Date(last+'T00:00:00').getTime())/864e5));
    L.push(`Период без потерь с ${fd(last)} по настоящее время составляет ${days} ${ruPlural(days,'день','дня','дней')}.`);
  } else {
    L.push('Потери за всё время не зафиксированы.');
  }
  return L.join('\n');
}

// Запуск по «Сформировать»: пробуем API (таймаут 10с) → при недоступности сети/таймауте
// или отсутствии ключа автоматически шаблонный доклад (без отдельной кнопки)
async function vrGenerate(){
  const r=vrPeriodRange();
  const flights=vrFilterFlights(r);
  if(!flights.length){ vrSetStatus('За выбранный период вылетов нет.','var(--amber)'); return; }
  const apiKey=(localStorage.getItem('anthropicKey')||'').trim();
  const btn=document.getElementById('repRunBtn');
  const fallback=(notice)=>{ vrShowText(vrBuildTemplate(flights,r)); vrSetStatus(notice,'var(--amber)'); };

  // Нет ключа или нет сети — сразу шаблон, без попытки запроса
  if(!apiKey||!apiKey.startsWith('sk-ant')){ fallback('API-ключ не задан — сформирован шаблонный доклад.'); return; }
  if(!navigator.onLine){ fallback('Сеть недоступна — сформирован шаблонный доклад.'); return; }

  const {payload,maps}=vrBuildPayload(flights,r.label);
  if(btn) btn.disabled=true;
  vrSetStatus('⏳ Формирую доклад…');
  try{
    const ctrl=new AbortController();
    const tid=setTimeout(()=>ctrl.abort(),10000); // таймаут 10с
    let resp;
    try{
      resp=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({ model:AI_MODEL, max_tokens:1000, system:VR_PROMPT, messages:[{role:'user',content:payload}] }), // AI_MODEL — единая точка (parser.js)
        signal:ctrl.signal
      });
    } finally { clearTimeout(tid); }
    if(!resp.ok){ const err=await resp.json().catch(()=>({})); throw new Error('HTTP '+resp.status+': '+((err.error&&err.error.message)||resp.statusText)); }
    const data=await resp.json();
    let txt=(data.content||[]).map(i=>i.text||'').join('').trim();
    if(!txt) throw new Error('пустой ответ API');
    txt=vrDeanon(txt,maps);
    vrShowText(txt);
    vrSetStatus('✓ Готово','var(--green2)');
  }catch(e){
    // Сеть/таймаут → шаблон с уведомлением; прочие ошибки API — тоже шаблон, но с пометкой
    const net = e.name==='AbortError' || /Failed to fetch|NetworkError|network|ERR_/i.test(e.message||'');
    fallback(net ? 'Сеть недоступна — сформирован шаблонный доклад.'
                 : 'API недоступен ('+e.message+') — сформирован шаблонный доклад.');
  } finally { if(btn) btn.disabled=false; }
}

function vrCopy(){
  const ta=document.getElementById('vrResult'); if(!ta) return;
  window._vrText=ta.value; // сохраняем правки
  navigator.clipboard.writeText(ta.value).then(()=>{
    const b=document.getElementById('vrCopyBtn'); // стабильный хук вместо поиска по onclick
    if(b){ const o=b.textContent; b.textContent='✓ Скопировано'; setTimeout(()=>b.textContent=o,1500); }
  }).catch(()=>{ ta.select(); document.execCommand('copy'); });
}

function vrPrint(){
  const ta=document.getElementById('vrResult'); if(!ta) return;
  window._vrText=ta.value;
  const win=window.open('','_blank','width=800,height=600');
  if(!win){ alert('Браузер заблокировал окно печати — разрешите всплывающие окна для этого сайта'); return; }
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Устный доклад</title>'
    +'<style>body{font-family:Georgia,serif;font-size:14px;line-height:1.6;color:#000;background:#fff;padding:24px;white-space:pre-wrap}@media print{body{padding:12px}}</style>'
    +'</head><body>'+esc(ta.value)+'</body></html>');
  win.document.close(); win.focus();
  win.onafterprint=function(){ win.close(); };
  win.print();
}

// ===== РЕПОРТАЖ НЕДЕЛИ (AI, шутливый) — только admin/cmd =====
// Шутливо-ироничный спортивный репортаж о достижениях пилотов за КАЛЕНДАРНУЮ
// неделю (пн–вс) или месяц. В Claude API уходят только агрегаты + дельта
// медалей/щитов за период; ИМЕНА ПИЛОТОВ анонимизируются («Пилот N») и
// восстанавливаются в ответе. Ничего не сохраняется и не уходит в Google Sheets.
// Состояние панели — в window._rpg* (период/текст), переживает перерисовку.
// Модель: claude-sonnet-4-6 (текущая; запрошенный claude-sonnet-4-20250514
// устарел и снимается 15.06.2026 — используем актуальный ID, как в остальном app).
const RPG_PROMPT = 'Напиши шутливый и ироничный репортаж на русском языке о боевых достижениях пилотов FPV-дронов за указанный период. Стиль — как залихватский спортивный комментатор, с грубым юмором, иронией и лёгким матом (не перебарщивай). Можно намекать на двусмысленные ситуации. Упоминай соперничество между пилотами — кто кого обошёл, кто затаил обиду, кто готовится к реваншу. Уважение к пилотам при этом сохраняется — смеёмся вместе, не над ними. Используй эмодзи медалей в тексте: 🎖️🚀⚡🥇🛡️🔥💎📈🌟🎯 и золотой щит 🛡️. Упоминай конкретные цифры из данных. Длина — 150-250 слов. Не добавляй данные которых нет. ТЕХНИКА (опциональная тема): в данных может быть блок про дроны — дебютанты (впервые применены в этом периоде) и модели с заметным сдвигом результативности. Если такой материал есть и он яркий — впиши его в репортаж в общем юмористическом тоне как отдельный сюжет («подразделение обкатало новый борт, и вот что вышло»). Если блока нет или он невыразительный — НЕ упоминай технику и НЕ выдумывай характеристики дронов. Никаких ТТХ, которых нет в данных. СОБЫТИЯ (опциональная тема): в данных может быть блок про яркие события — дебют пилота, первая награда новичка, смена держателя рекорда. Если блок есть и ярко — впиши тем же юмор-тоном как отдельные сюжеты. Нет блока — не упоминай и не выдумывай события. Используй Telegram markdown для форматирования: *жирный текст* (одна звёздочка с каждой стороны, не две). Не используй ## заголовки — вместо них просто текст с эмодзи. Не используй ** двойные звёздочки.';

function rpgRole(){ return currentRole(); } // делегат к единому предикату (app.js), вызов только в рантайме
function rpgIsPrivileged(){ return hasAnyRole(['admin','cmd']); }

// Час закрытия периода: период (неделя/месяц) считается ЗАВЕРШЁННЫМ и становится
// текущим для репортажа начиная с RPG_CLOSE_HOUR:00 его последнего дня. До этого
// момента берётся предыдущий завершённый период. Менять здесь.
const RPG_CLOSE_HOUR=21;

// Гейт «холодного старта» для опциональных блоков payload репортажа (ТЕХНИКА и СОБЫТИЯ):
// минимум вылетов ДО периода, чтобы «новизна» имела смысл (иначе на холодном старте вся
// история внутри периода → каждая модель/пилот ложно «дебютант»). Раньше было ДВЕ константы
// одного смысла (TECH_BASE и EVT_BASE, обе =8) — объединены 02.07.2026.
const COLDSTART_BASE=8;

// Диапазон выбранного периода: календарная неделя (пн–вс) или календарный месяц.
// Период становится «текущим» только после RPG_CLOSE_HOUR последнего дня (см. выше).
function rpgPeriodRange(){
  const per=(document.getElementById('rpgPeriod')||{}).value||'week';
  const fd=iso=>iso?iso.split('-').reverse().join('.'):'…';
  const now=new Date(); // с реальным временем — порог RPG_CLOSE_HOUR требует часов
  let start,end;
  if(per==='month'){
    // Последний день ТЕКУЩЕГО месяца, RPG_CLOSE_HOUR:00 — момент закрытия.
    const curLast=new Date(now.getFullYear(),now.getMonth()+1,0); // последний день тек. месяца
    const closeMs=new Date(curLast.getFullYear(),curLast.getMonth(),curLast.getDate(),RPG_CLOSE_HOUR).getTime();
    if(now.getTime()>=closeMs){
      // Текущий месяц закрыт → репортаж за текущий месяц
      start=new Date(now.getFullYear(),now.getMonth(),1);
      end=curLast;
    } else {
      // Текущий месяц ещё идёт → за предыдущий
      start=new Date(now.getFullYear(),now.getMonth()-1,1);
      end=new Date(now.getFullYear(),now.getMonth(),0); // последний день пред. месяца
    }
  } else {
    // Неделя пн–вс. Момент закрытия — вс RPG_CLOSE_HOUR:00 ТЕКУЩЕЙ недели.
    const dow=(now.getDay()+6)%7; // 0=пн
    const curMon=new Date(now.getFullYear(),now.getMonth(),now.getDate()-dow); // пн текущей недели
    const curSun=new Date(curMon.getFullYear(),curMon.getMonth(),curMon.getDate()+6); // вс текущей недели
    const closeMs=new Date(curSun.getFullYear(),curSun.getMonth(),curSun.getDate(),RPG_CLOSE_HOUR).getTime();
    if(now.getTime()>=closeMs){
      // Текущая неделя закрыта → репортаж за текущую неделю
      start=curMon; end=curSun;
    } else {
      // Текущая неделя ещё идёт → за предыдущую (на 7 дней раньше)
      start=new Date(curMon.getFullYear(),curMon.getMonth(),curMon.getDate()-7);
      end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+6);
    }
  }
  const from=localISO(start), to=localISO(end);
  return {from,to,startMs:start.getTime(),endMs:end.getTime(),
    label:(per==='month'?'за месяц ':'за неделю ')+fd(from)+'–'+fd(to)};
}

// Снимок медалей и золотых щитов КАЖДОГО пилота по состоянию на момент asOfMs.
// Переиспользует штатный движок: временно подменяет state.flights (только вылеты
// ≤ даты среза) и Date.now (movable "сегодня" для скользящих окон медалей), всё в
// try/finally. Функции медалей/рекордов синхронны и только читают данные —
// глобальные кэши (window._absRecords/_pilotMedals) здесь НЕ затрагиваются.
function rpgSnapshotAt(asOfMs, pilots){
  const realFlights=state.flights, realNow=Date.now;
  const cut=localISO(new Date(asOfMs));
  const medals={}, shields={};
  try{
    state.flights=(realFlights||[]).filter(f=>f.date && f.date<=cut);
    Date.now=()=>asOfMs;
    pilots.forEach(p=>{ medals[p]=new Set(calcPilotMedals(p).map(m=>m.id)); });
    const sh=computeAbsoluteRecords(); // {id:{pilot,desc}}
    Object.keys(sh).forEach(id=>{ shields[id]=sh[id].pilot; });
  } finally {
    state.flights=realFlights; Date.now=realNow;
  }
  return {medals,shields};
}

// Сбор данных периода + дельты медалей/щитов; анонимизация имён пилотов → «Пилот N».
function rpgBuildPayload(range){
  const flights=state.flights||[];
  const allPilots=[...new Set(state.squads.map(s=>s.pilot).concat(flights.map(f=>f.pilot)).filter(Boolean))];
  const periodF=flights.filter(f=>f.pilot&&f.pilot!=='[ПЕРЕДАЧА]'&&f.date>=range.from&&f.date<=range.to);
  const P=vrIndexMap(allPilots,'Пилот','');
  const maps={P};
  const tok=p=>P.toTok.get(p)||p;
  const medName=id=>{ const m=MEDALS[id]; return m?(m.icon+' '+m.name):id; };
  const shName =id=>{ const m=ABS_RECORDS[id]; return m?('🛡️ золотой щит «'+m.name+'» '+m.icon):('🛡️ '+id); };

  // Дельта за период: до начала (срез на день раньше) → конец периода
  const before=rpgSnapshotAt(range.startMs-1, allPilots);
  const after =rpgSnapshotAt(range.endMs, allPilots);
  const medalsGained={}, medalsLost={};
  allPilots.forEach(p=>{
    const b=before.medals[p]||new Set(), a=after.medals[p]||new Set();
    const g=[...a].filter(id=>!b.has(id)), l=[...b].filter(id=>!a.has(id));
    if(g.length) medalsGained[p]=g;
    if(l.length) medalsLost[p]=l;
  });
  const shieldsGained=[], shieldsLost=[];
  Object.keys(ABS_RECORDS).forEach(id=>{
    const bp=before.shields[id], ap=after.shields[id];
    if(ap&&ap!==bp) shieldsGained.push({pilot:ap,id});
    if(bp&&bp!==ap) shieldsLost.push({pilot:bp,id});
  });

  const total=periodF.length;
  const done=periodF.filter(f=>f.result==='yes').length;
  const lost=periodF.filter(f=>f.returned==='no').length;
  const hasGeo=periodF.some(f=>f.range_km!=null);

  const L=[];
  L.push('Данные для шутливого репортажа '+range.label+'. Имена пилотов заменены на «Пилот N» — используй эти обозначения дословно, не переименовывай.');
  L.push('');
  L.push('ОБЩЕЕ: всего вылетов '+total+', выполнено '+done+', потеряно бортов '+lost+'.');
  L.push('');
  L.push('ПО ПИЛОТАМ:');
  const periodPilots=allPilots.filter(p=>periodF.some(f=>f.pilot===p));
  if(periodPilots.length){
    periodPilots.forEach(p=>{
      const fs=periodF.filter(f=>f.pilot===p);
      const d=fs.filter(f=>f.result==='yes').length;
      const l=fs.filter(f=>f.returned==='no').length;
      const byDay={}; fs.forEach(f=>{ if(f.date) byDay[f.date]=(byDay[f.date]||0)+1; });
      const best=Math.max(0,...Object.values(byDay));
      let line='- '+tok(p)+': вылетов '+fs.length+', выполнено '+d+', потеряно '+l+'; лучший день '+best;
      if(hasGeo){ const far=fs.filter(f=>f.range_km!=null).sort((a,b)=>b.range_km-a.range_km)[0]; if(far) line+='; самый дальний вылет '+far.range_km+' км'; }
      L.push(line+'.');
    });
  } else L.push('- вылетов за период не было.');

  // ===== ТЕХНИКА (опционально): дебютанты периода + сдвиг результативности по моделям.
  // Названия моделей анонимизируются («Борт типа N») как в устном докладе и
  // восстанавливаются в ответе (rpgDeanon). Блок попадает в payload ТОЛЬКО при наличии
  // выразительного материала — иначе секции нет и AI про технику молчит (промпт это требует).
  const priorF=flights.filter(f=>f.pilot&&f.pilot!=='[ПЕРЕДАЧА]'&&f.date&&f.date<range.from);
  const periodModels=[...new Set(periodF.map(f=>f.drone).filter(Boolean))];
  if(periodModels.length){
    const D=vrIndexMap(periodModels,'Борт типа');
    const dtok=m=>D.toTok.get(m)||m;
    const TECH_MIN=3, TECH_SHIFT_MIN=5, TECH_SHIFT=0.2; // пороги выразительности; гейт истории — общий COLDSTART_BASE
    // TECH_SHIFT_MIN — мин. вылетов в ТЕКУЩЕМ периоде для заявки о сдвиге результативности
    // (на 3 вылетах %-доля скачет шумом, напр. 3/3=100%); priorF-сторона достаточно TECH_MIN.
    const priorModels=new Set(priorF.map(f=>f.drone).filter(Boolean));
    const stat=fs=>({n:fs.length,d:fs.filter(f=>f.result==='yes').length,l:fs.filter(f=>f.returned==='no').length});
    const techLines=[];
    // Дебютанты — только при реальной истории до периода (иначе «новизна» бессмысленна,
    // напр. холодный старт: вся история внутри периода → каждая модель ложно «дебютант»).
    if(priorF.length>=COLDSTART_BASE){
      const debut=periodModels.filter(m=>!priorModels.has(m));
      if(debut.length){
        techLines.push('ДЕБЮТАНТЫ (впервые применены в этом периоде):');
        debut.forEach(m=>{
          const dfs=periodF.filter(f=>f.drone===m);
          const s=stat(dfs);
          let line='- '+dtok(m)+': вылетов '+s.n+', выполнено '+s.d+', потеряно '+s.l;
          // Гео-портрет дебютанта: дальность + возвращаемость + контекст истории на
          // сопоставимой дальности. Так AI видит «далеко И с возвратом», а не просто
          // факт новой модели. Только агрегаты — ТТХ не выдумываются (см. RPG_PROMPT).
          const geo=dfs.filter(f=>f.range_km!=null).map(f=>f.range_km);
          if(geo.length){
            const avg=geo.reduce((a,b)=>a+b,0)/geo.length, mx=Math.max(...geo);
            const ret=dfs.filter(f=>f.returned==='yes').length;
            line+='; дальность ср. '+geoRound2(avg)+' км, макс '+geoRound2(mx)+' км; вернулось '+ret+' из '+s.n;
            const LONG=Math.floor(Math.min(...geo)); // нижняя граница рабочей дальности борта
            const priorLong=priorF.filter(f=>f.range_km!=null&&f.range_km>=LONG);
            if(priorLong.length>=5){
              const pr=priorLong.filter(f=>f.returned==='yes').length;
              line+='; ранее на дальности ≥'+LONG+' км возврат был '+pr+' из '+priorLong.length;
            }
          }
          techLines.push(line+'.');
        });
      }
    }
    // Сдвиг результативности — модель с историей и ДО, и В периоде (мин. TECH_MIN вылетов
    // с каждой стороны), |Δ доли выполнения| ≥ TECH_SHIFT. Дебютанты сюда не входят.
    const shifts=[];
    periodModels.forEach(m=>{
      if(!priorModels.has(m)) return;
      const cur=periodF.filter(f=>f.drone===m), pri=priorF.filter(f=>f.drone===m);
      if(cur.length<TECH_SHIFT_MIN||pri.length<TECH_MIN) return;
      const cr=cur.filter(f=>f.result==='yes').length/cur.length;
      const pr=pri.filter(f=>f.result==='yes').length/pri.length;
      if(Math.abs(cr-pr)>=TECH_SHIFT) shifts.push({m,cr,pr,n:cur.length});
    });
    if(shifts.length){
      techLines.push('СДВИГ РЕЗУЛЬТАТИВНОСТИ:');
      shifts.forEach(s=>techLines.push('- '+dtok(s.m)+': было '+Math.round(s.pr*100)+'% выполнения, стало '+Math.round(s.cr*100)+'% (вылетов в периоде '+s.n+').'));
    }
    if(techLines.length){
      maps.D=D; // включаем обратную замену моделей только когда они реально попали в payload
      L.push('');
      L.push('ТЕХНИКА (используй ТОЛЬКО если материал яркий; названия «Борт типа N» — дословно):');
      techLines.forEach(t=>L.push(t));
    }
  }

  // ===== СОБЫТИЯ (опционально): яркие сюжеты, выводимые из данных — дебют пилота,
  // первая награда новичка, смена держателя абсолютного рекорда (перехват). Имена —
  // только «Пилот N» через tok() (rpgDeanon уже их восстанавливает, новых токенов нет).
  // Блок попадает в payload ТОЛЬКО при наличии истории до периода (priorF>=COLDSTART_BASE,
  // общий гейт с блоком ТЕХНИКА) и выразительного материала; иначе
  // секции нет и AI про события молчит (промпт это требует). Курируется: ≤4 строки,
  // приоритет record > debut_award > debut.
  {
    if(priorF.length>=COLDSTART_BASE){
      // «Дебют пилота» — СТАТИСТИКА (squadKey, сейчас = pilot; тождество расчёт≡пилот:
      // при разделении дебют считается по персоне — вызовы squadKeyOf снять, ADR-001 §3).
      const debutants=periodPilots.filter(p=>!priorF.some(f=>squadKeyOf(f.pilot)===squadKeyOf(p)));
      const evRecord=[], evAward=[], evDebut=[];
      // Перехват рекорда: щит сменил держателя (был прежний владелец before.shields[id]).
      // «Впервые установленный» рекорд (прежнего держателя нет) сюда НЕ идёт — остаётся
      // в блоке «ЗОЛОТЫЕ ЩИТЫ ЗА ПЕРИОД».
      shieldsGained.forEach(s=>{
        const old=before.shields[s.id];
        if(old) evRecord.push('- '+tok(s.pilot)+' отобрал '+shName(s.id)+' у '+tok(old)+'.');
      });
      // Дебют пилота (первый боевой вылет попал в период) + первая награда, если есть.
      debutants.forEach(p=>{
        const fs=periodF.filter(f=>f.pilot===p);
        const d=fs.filter(f=>f.result==='yes').length;
        const l=fs.filter(f=>f.returned==='no').length;
        const gained=medalsGained[p];
        if(gained&&gained.length) evAward.push('- '+tok(p)+' дебютировал и в первый же выход взял '+gained.map(medName).join(', ')+' (вылетов '+fs.length+', выполнено '+d+', потеряно '+l+').');
        else evDebut.push('- '+tok(p)+' дебютировал: вылетов '+fs.length+', выполнено '+d+', потеряно '+l+'.');
      });
      const eventLines=[...evRecord,...evAward,...evDebut].slice(0,4);
      if(eventLines.length){
        L.push('');
        L.push('СОБЫТИЯ (используй ТОЛЬКО если ярко; «Пилот N» — дословно):');
        eventLines.forEach(e=>L.push(e));
      }
    }
  }

  L.push('');
  L.push('МЕДАЛИ ЗА ПЕРИОД:');
  const gk=Object.keys(medalsGained), lk=Object.keys(medalsLost);
  if(!gk.length&&!lk.length) L.push('- изменений нет.');
  else {
    gk.forEach(p=>L.push('- '+tok(p)+' получил: '+medalsGained[p].map(medName).join(', ')+'.'));
    lk.forEach(p=>L.push('- '+tok(p)+' потерял: '+medalsLost[p].map(medName).join(', ')+'.'));
  }

  L.push('');
  L.push('ЗОЛОТЫЕ ЩИТЫ (абсолютные рекорды) ЗА ПЕРИОД:');
  if(!shieldsGained.length&&!shieldsLost.length) L.push('- щиты не меняли владельцев.');
  else {
    shieldsGained.forEach(s=>L.push('- '+tok(s.pilot)+' завоевал '+shName(s.id)+'.'));
    shieldsLost.forEach(s=>L.push('- '+tok(s.pilot)+' лишился '+shName(s.id)+'.'));
  }

  return {payload:L.join('\n'), maps, total};
}

// Обратная замена «Пилот N»/«Борт типа N» → реальные данные (терпимо к склонениям и ё/е).
// M.D присутствует только когда в payload был блок ТЕХНИКА (иначе моделей в тексте нет).
function rpgDeanon(text,M){
  text=text.replace(/Пилот[а-яё]*\s+(\d+)/gi,(m,n)=> (M.P.rev[n]!==undefined?M.P.rev[n]:m));
  if(M.D) text=text.replace(/Борт[а-яё]*\s+типа\s+(\d+)/gi,(m,n)=> (M.D.rev[n]!==undefined?M.D.rev[n]:m));
  return text;
}

function rpgSetStatus(t,c){ const st=document.getElementById('rpgStatus'); if(st){ st.textContent=t||''; st.style.color=c||'var(--muted)'; } }
function rpgShowText(txt){
  window._rpgText=txt;
  const ta=document.getElementById('rpgResult'), wrap=document.getElementById('rpgResultWrap');
  if(ta) ta.value=txt;
  if(wrap) wrap.style.display='block';
}
function rpgPeriodChange(){ window._rpgPeriod=document.getElementById('rpgPeriod').value; }

function reportReportage(out){
  window._reportText=null;
  if(!rpgIsPrivileged()){
    out.innerHTML='<div class="report-block"><div class="rb-head">Репортаж недели (AI)</div>'
      +'<div class="rb-line" style="color:var(--amber)">Доступно только командиру и администратору (роли admin/cmd).</div></div>';
    return;
  }
  const txt=window._rpgText||'';
  out.innerHTML=`<div class="report-block">
    <div class="rb-head">Репортаж недели (AI) 🎙️</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Шутливый репортаж о достижениях пилотов за выбранный вверху период (календарная неделя/месяц). Перед отправкой в Claude API имена пилотов заменяются на «Пилот N» и восстанавливаются в ответе. Данные не сохраняются и не уходят в Google Sheets. Нужен API-ключ во вкладке «Импорт». Нажмите «Сформировать» вверху.</div>
    <div id="rpgStatus" style="font-size:12px;color:var(--muted);margin-bottom:8px"></div>
    <div id="rpgBoardSlot">${rpgBoardSlotHtml()}</div>
    <div id="rpgResultWrap" style="display:${txt?'block':'none'}">
      <textarea id="rpgResult" style="width:100%;min-height:320px;font-family:inherit;font-size:13px;line-height:1.5;resize:vertical">${esc(txt)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-sm" id="rpgCopyBtn" onclick="rpgCopyTelegram()">📋 Копировать для Telegram</button>
      </div>
    </div>
  </div>`;
}

async function rpgGenerate(){
  if(!rpgIsPrivileged()){ rpgSetStatus('Доступно только admin/cmd.','var(--amber)'); return; }
  const range=rpgPeriodRange();
  const {payload,maps,total}=rpgBuildPayload(range);
  if(!total){ rpgSetStatus('За выбранный период вылетов нет.','var(--amber)'); return; }
  const apiKey=(localStorage.getItem('anthropicKey')||'').trim();
  if(!apiKey||!apiKey.startsWith('sk-ant')){ rpgSetStatus('API-ключ не задан (вкладка «Импорт»).','var(--amber)'); return; }
  if(!navigator.onLine){ rpgSetStatus('Нет сети — репортаж формируется только через API.','var(--amber)'); return; }
  const btn=document.getElementById('repRunBtn');
  if(btn) btn.disabled=true;
  // Сбрасываем доску почёта прошлой генерации — появится только после успеха
  window._rpgBoardImg=null; const slot0=document.getElementById('rpgBoardSlot'); if(slot0) slot0.innerHTML='';
  rpgSetStatus('⏳ Пишу репортаж…');
  try{
    const ctrl=new AbortController();
    const tid=setTimeout(()=>ctrl.abort(),20000);
    let resp;
    try{
      resp=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({ model:AI_MODEL, max_tokens:1000, system:RPG_PROMPT, messages:[{role:'user',content:payload}] }), // AI_MODEL — единая точка (parser.js)
        signal:ctrl.signal
      });
    } finally { clearTimeout(tid); }
    if(!resp.ok){ const err=await resp.json().catch(()=>({})); throw new Error('HTTP '+resp.status+': '+((err.error&&err.error.message)||resp.statusText)); }
    const data=await resp.json();
    let txt=(data.content||[]).map(i=>i.text||'').join('').trim();
    if(!txt) throw new Error('пустой ответ API');
    txt=rpgDeanon(txt,maps);
    // Ссылка на статичную справку о медалях (medals.html на GitHub Pages)
    txt+='\n\n───────────────\nℹ️ Что означают медали: https://pilgrim75.github.io/bpla/medals.html';
    rpgShowText(txt);
    rpgSetStatus('✓ Готово','var(--green2)');
    await rpgRenderBoard(range); // картинка-«доска почёта» над текстом (медали из того же снимка периода)
  }catch(e){
    const net = e.name==='AbortError' || /Failed to fetch|NetworkError|network|ERR_/i.test(e.message||'');
    rpgSetStatus(net?'Сеть недоступна — попробуйте ещё раз.':'Ошибка API: '+e.message,'var(--red)');
  } finally { if(btn) btn.disabled=false; }
}

function rpgCopyTelegram(){
  const ta=document.getElementById('rpgResult'); if(!ta) return;
  window._rpgText=ta.value; // сохраняем правки
  const done=()=>{ const b=document.getElementById('rpgCopyBtn'); if(b){ const o=b.textContent; b.textContent='✓ Скопировано!'; setTimeout(()=>b.textContent=o,2000); } }; // хук по id, не по onclick
  navigator.clipboard.writeText(ta.value).then(done).catch(()=>{ ta.select(); document.execCommand('copy'); done(); });
}

// ===== ДОСКА ПОЧЁТА (картинка-шапка для Telegram) =====
// Источник данных — ТОТ ЖЕ rpgSnapshotAt(range.endMs), что и текст репортажа:
// медали на картинке гарантированно совпадают с упомянутыми в тексте. Иконки/цвета —
// из каталогов MEDALS / ABS_RECORDS (app.js). Своей логики подсчёта медалей нет.
// Возвращает [{pilot,shieldIds,medalIds}] ТОЛЬКО для пилотов с ≥1 наградой.
function rpgBuildBoardData(range){
  const pilots=[...new Set((state.squads||[]).map(s=>s.pilot).filter(Boolean))];
  const snap=rpgSnapshotAt(range.endMs, pilots); // {medals:{pilot:Set(id)}, shields:{id:pilot}}
  const rows=[];
  pilots.forEach(p=>{
    const shieldIds=Object.keys(snap.shields||{}).filter(id=>snap.shields[id]===p);
    const medalIds=[...(snap.medals[p]||[])];
    if(shieldIds.length||medalIds.length) rows.push({pilot:p, shieldIds, medalIds});
  });
  return rows;
}

// Золотой щит как inline-SVG (для доски почёта) — html2canvas НЕ растрирует CSS
// clip-path, поэтому форму щита и градиент рисуем средствами SVG. uid делает id
// градиента уникальным (несколько щитов на странице). Эмодзи — поверх щита.
function rpgShieldSvg(icon, title, uid){
  const gid='gsg'+uid;
  return `<span class="gss" title="${esc(title)} — абсолютный рекорд">`
    +`<svg class="gss-bg" viewBox="0 0 24 28" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">`
    +`<defs><linearGradient id="${gid}" x1="0%" y1="0%" x2="85%" y2="100%">`
    +`<stop offset="0%" stop-color="#FFF3AE"/><stop offset="45%" stop-color="#FFD700"/><stop offset="100%" stop-color="#D99A00"/>`
    +`</linearGradient></defs>`
    +`<path d="M12 0 L24 4.48 L24 15.68 L12 28 L0 15.68 L0 4.48 Z" fill="url(#${gid})"/>`
    +`</svg><span class="gss-emoji">${icon}</span></span>`;
}

// HTML доски почёта (карточки в стиле crew-item, без дронов/дат/числа вылетов).
function rpgBoardHtml(range){
  const rows=rpgBuildBoardData(range);
  const title='🏅 Доска почёта · '+esc(range.label||'');
  let body, uid=0;
  if(!rows.length){
    body='<div class="rpg-empty">За период наград не присуждено</div>';
  } else {
    body=rows.map(r=>{
      const shields=r.shieldIds.map(id=>{
        const c=ABS_RECORDS[id]||{icon:'🛡️',name:id};
        return rpgShieldSvg(c.icon, c.name, uid++);
      }).join('');
      const shieldRow=shields?`<span class="gold-row gold-inline">${shields}</span>`:'';
      const medals=r.medalIds.map(id=>{
        const m=MEDALS[id]; if(!m) return '';
        return `<span class="medal-badge" style="background:${m.color}22;border-color:${m.color}77" title="${esc(m.name)}">${m.icon}</span>`;
      }).join('');
      const medalRow=medals?`<span class="medal-row">${medals}</span>`:'';
      return `<div class="crew-item">
        <div class="crew-name">Пилот ${esc(r.pilot)}${shieldRow}</div>
        ${medalRow}
      </div>`;
    }).join('');
  }
  return `<div class="rpg-board-wrap"><div class="rpg-board" id="rpgBoard">
    <div class="rpg-board-title">${title}</div>
    ${body}
  </div></div>`;
}

// HTML слота: готовая картинка <img> + кнопка скачивания + подсказка про «копировать
// картинку». Источник — window._rpgBoardImg (dataURL); пусто → ''. Переживает перерисовку
// reportReportage (картинка уже отрисована и закэширована, повторный рендер не нужен).
function rpgBoardSlotHtml(){
  const d=window._rpgBoardImg;
  if(!d) return '';
  return `<div class="rpg-board-imgwrap"><img src="${d}" alt="Доска почёта" class="rpg-board-img"></div>
    <div style="display:flex;gap:10px;align-items:center;margin:0 0 12px;flex-wrap:wrap">
      <button class="btn btn-sm" onclick="rpgSaveMedalImage()">🖼️ Сохранить картинку медалей</button>
      <span style="font-size:11px;color:var(--muted)">или правый клик по картинке → «Копировать картинку» → вставить в Telegram</span>
    </div>`;
}

// Строит доску в СКРЫТОМ off-screen контейнере, рендерит её в PNG (html2canvas) и
// показывает на экране СРАЗУ как <img>. Живой HTML-блок на экран не выводится.
// dataURL кэшируется в window._rpgBoardImg (переживает перерисовку reportReportage).
async function rpgRenderBoard(range){
  window._rpgBoardName=(range.from||'period')+'_'+(range.to||'');
  window._rpgBoardImg=null;
  const slot=document.getElementById('rpgBoardSlot');
  if(slot) slot.innerHTML='<div style="font-size:12px;color:var(--muted);margin:6px 0">⏳ Готовлю картинку медалей…</div>';
  if(typeof html2canvas!=='function'){
    if(slot) slot.innerHTML='<div style="font-size:12px;color:var(--red);margin:6px 0">Модуль html2canvas не загружен — картинка недоступна.</div>';
    return;
  }
  const host=document.createElement('div');
  host.className='rpg-board-host';
  host.innerHTML=rpgBoardHtml(range);
  document.body.appendChild(host);
  try{
    const el=host.querySelector('#rpgBoard');
    const canvas=await html2canvas(el,{backgroundColor:'#1b1e24', scale:2, logging:false});
    window._rpgBoardImg=canvas.toDataURL('image/png');
    if(slot) slot.innerHTML=rpgBoardSlotHtml();
  }catch(e){
    if(slot) slot.innerHTML='<div style="font-size:12px;color:var(--red);margin:6px 0">Не удалось сформировать картинку: '+esc(e.message||String(e))+'</div>';
  }finally{
    host.remove();
  }
}

// Скачивание готовой картинки (dataURL уже посчитан в rpgRenderBoard).
function rpgSaveMedalImage(){
  const d=window._rpgBoardImg;
  if(!d){ rpgSetStatus('Картинка ещё не готова.','var(--amber)'); return; }
  const fname='medals_'+(window._rpgBoardName||'period')+'.png';
  const a=document.createElement('a'); a.href=d; a.download=fname;
  document.body.appendChild(a); a.click(); a.remove();
  rpgSetStatus('✓ Картинка сохранена ('+fname+')','var(--green2)');
}
