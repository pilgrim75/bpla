// reports.js — отчёты и фильтр БПЛА (часть app.js, грузить ПЕРЕД app.js)
// ============ REPORT ============
// Выбранные борты для фильтра отчётов (пусто = все)
window._repSelectedDrones=window._repSelectedDrones||new Set();

function fillReportFilters(){
  const pilotSel=document.getElementById('repPilot');
  if(pilotSel){
    const curPilot=pilotSel.value;
    const pilots=[...new Set(state.flights.map(x=>x.pilot).filter(Boolean))].sort();
    pilotSel.innerHTML='<option value="">Все пилоты</option>'+pilots.map(p=>`<option value="${p}">${p}</option>`).join('');
    if(curPilot)[...pilotSel.options].forEach(o=>{if(o.value===curPilot)o.selected=true;});
  }
  renderDroneFilter();
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
    // Формируем строки перемещений — потери не дедуплицируем, остальные по уникальному тексту
    const moveFmt=op=>{
      const prefix=datePrefix(op);
      const pfx=prefix?'('+prefix+') ':'';
      if(op.type==='loss') return pfx+'✈ Потеря: '+op.drone+' — пилот '+op.pilot;
      if(op.type==='exchange') return pfx+'⇄ Обмен с '+op.unit+': отдали '+op.give+' — '+op.giveQty+' шт., получили '+op.get+' — '+op.getQty+' шт.'+(op.note?' ('+op.note+')':'');
      if(op.type==='arrival') return pfx+'📦 Поступление: '+op.drone+' — '+op.qty+' шт.'+(op.note?' ('+op.note+')':'');
      return pfx+'→ '+op.from+' → '+op.to+': '+op.drone+' — '+op.qty+' шт.'+(op.note?' ('+op.note+')':'');
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

    // Текст для копирования
    window._reportText=[
      'ФПВ ИСР',
      ...state.squads.flatMap(sq=>['','✅ Пилот '+sq.pilot,...sq.drones.filter(d=>d.qty!==0).map(d=>d.name+' — '+d.qty+' шт.')]),
      '','✅ Склад:',...stockBG.filter(d=>d.qty>0).map(d=>d.name+' — '+d.qty+' шт.'),
      ...(stockNBG.length?['','Не БГ:',...stockNBG.map(d=>d.name+' — '+d.qty+' шт.')]:[]),
      ...(moveKeys.length?['','Изменения (последние 24ч):',...moveKeys]:[]),
    ].join('\n');

    const movementsBlock=moveKeys.length
      ?'<div style="margin:10px 0 4px;font-weight:700">Изменения (последние 24ч):</div>'
        +moveKeys.map((k,i)=>'<div class="rb-line"'+(moveIsRed(k,i)?' style="color:var(--red)"':'')+'>'+k+'</div>').join('')
      :'<div style="color:var(--muted);font-size:11px;margin-top:8px">Изменений за последние 24ч нет</div>';
    out.innerHTML='<div class="report-block">'
      +'<div class="rb-head">ФПВ ИСР</div>'
      +state.squads.map(sq=>'<div style="margin:8px 0 4px;font-weight:700">✅ Пилот '+sq.pilot+'</div>'+sq.drones.filter(d=>d.qty!==0).map(d=>'<div class="rb-line">'+d.name+' — '+d.qty+' шт.</div>').join('')).join('')
      +'<div style="margin:10px 0 4px;font-weight:700">✅ Склад:</div>'
      +stockBG.filter(d=>d.qty>0).map(d=>'<div class="rb-line">'+d.name+' — '+d.qty+' шт.</div>').join('')
      +(stockNBG.length?'<div style="margin:10px 0 4px;font-weight:700">Не БГ:</div>'+stockNBG.map(d=>'<div class="rb-line">'+d.name+' — '+d.qty+' шт.</div>').join(''):'')
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
    let transList=(state.transfers||[]).filter(t=>t.type==='transfer'&&t.to!=='склад');
    if(from) transList=transList.filter(t=>t.date>=from);
    if(to)   transList=transList.filter(t=>t.date<=to);
    if(filterPilot) transList=transList.filter(t=>t.to===filterPilot);
    if(filterDrones&&filterDrones.length){
      const low=filterDrones.map(d=>d.toLowerCase());
      transList=transList.filter(t=>low.includes((t.drone||'').toLowerCase()));
    }
    const agg=new Map();
    transList.forEach(t=>{
      const key=t.to+'||'+t.drone;
      if(!agg.has(key)) agg.set(key,{pilot:t.to,drone:t.drone,qty:0});
      agg.get(key).qty+=(t.qty||1);
    });
    const rows=[...agg.values()];
    const hasFilter=from||to||filterPilot||(filterDrones&&filterDrones.length);
    if(!rows.length){
      const msg=hasFilter?'Нет данных за выбранный период':'Нет данных';
      window._reportText='Выдано бортов\n'+msg;
      out.innerHTML=`<div class="report-block"><div class="rb-head">Выдано бортов</div><div class="rb-line">${msg}</div></div>`;
    } else {
      const wPilot=Math.max(...rows.map(r=>r.pilot.length),'Пилот'.length);
      const wDrone=Math.max(...rows.map(r=>r.drone.length),'Борт'.length);
      const wQty=Math.max(...rows.map(r=>String(r.qty).length),'Количество'.length);
      const hdr=`${'Пилот'.padEnd(wPilot)} · ${'Борт'.padEnd(wDrone)} · Количество`;
      const sep='─'.repeat(wPilot+wDrone+wQty+6);
      const fmtRow=r=>`${r.pilot.padEnd(wPilot)} · ${r.drone.padEnd(wDrone)} · ${r.qty}`;
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
    const btns=document.querySelectorAll('[onclick="copyReport()"]');
    btns.forEach(btn=>{const orig=btn.textContent;btn.textContent='✓ Скопировано';setTimeout(()=>{btn.textContent=orig;},1500);});
  }).catch(()=>{
    const el=document.createElement('textarea');
    el.value=txt;document.body.appendChild(el);el.select();document.execCommand('copy');document.body.removeChild(el);
  });
}

function printReport(){
  const content=document.getElementById('reportOutput').innerHTML;
  const win=window.open('','_blank','width=800,height=600');
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
