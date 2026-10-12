(globalThis.__FILE_BUILDS=globalThis.__FILE_BUILDS||{})['parser-rules.js']=2026101101; // сборка файла — ставит tools/bump-version.js, руками не править
// parser-rules.js — правильный парсер строк вылетов (без AI)
// Подключается в index.html ПЕРЕД parser.js

// esc() здесь НЕ определяем: он не используется в этом файле (все поля экранирует
// parser.js при рендере). Локальная копия была identity-заменой и при смене порядка
// загрузки скриптов перекрыла бы нормальный esc() из app.js.

// ============ ЦВЕТОВЫЙ СЛОВАРЬ ИЗ ИСТОРИИ ============
function buildColorVocab(){
  const colors=new Map();
  try{
    const flights=globalThis.state?.flights||[];
    for(const f of flights){
      const {color}=splitTarget(f.target||'');
      if(color){
        const k=color.toLowerCase();
        colors.set(k,(colors.get(k)||0)+1);
      }
    }
  }catch(e){}
  const defaults=['каралл','вишня','горчичная','лиловая','прозрачная','белая','чёрная','зелёная','синяя','красная','жёлтая','оранжевая','фиолетовая','розовая','коричневая','серая'];
  for(const d of defaults) if(!colors.has(d)) colors.set(d,0);
  return Array.from(colors.entries())
    .sort((a,b)=>b[1]-a[1])
    .map(([c])=>c);
}

// ============ ЛЕВЕНШТЕЙН ============
function levenshtein(a,b){
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function closestColor(input, vocab){
  const il=input.toLowerCase();
  let best=null, bestDist=3;
  for(const v of vocab){
    const d=levenshtein(il, v.toLowerCase());
    if(d<bestDist){ bestDist=d; best=v; }
  }
  return bestDist<=2 ? best : null;
}

// ============ СЛОВАРЬ БОРТОВ ============
function getDroneVocab(){
  const vocab=new Set();
  try{
    const squads=globalThis.state?.squads||[];
    for(const sq of squads){
      if(sq.drones){
        for(const d of sq.drones){
          if(d.name) vocab.add(d.name); // поле .name (как в app.js), НЕ .model
        }
      }
    }
  }catch(e){}
  return Array.from(vocab);
}

function normalizeDroneName(input, vocab){
  const il=input.toLowerCase().replace(/[\s\-]+/g,'');
  for(const v of vocab){
    if(v.toLowerCase().replace(/[\s\-]+/g,'')===il) return v;
  }
  return input;
}

// ============ РАЗБОР НОМЕРА ВЫЛЕТА ============
const FLIGHTNUM_WORDS={
  'первый':1,'второй':2,'третий':3,'четвёртый':4,'четвертый':4,
  'пятый':5,'шестой':6,'седьмой':7,'восьмой':8,'девятый':9,'десятый':10
};

function parseFlightNum(text){
  const m=text.match(/(?:^|\s)(первый|второй|третий|четвёртый|четвертый|пятый|шестой|седьмой|восьмой|девятый|десятый|\d+)(?:-?й?\s*вылет)\s*/i);
  if(!m) return null;
  const val=m[1].toLowerCase();
  if(FLIGHTNUM_WORDS[val]!==undefined) return FLIGHTNUM_WORDS[val];
  const n=parseInt(val,10);
  return Number.isInteger(n) && n>0 ? n : null;
}

// ============ SPLIT/JOIN TARGET ============
function splitTarget(target){
  // Пробел между числом и цветом ОПЦИОНАЛЕН (как в app.js) — в данных бывает «95каралл»
  const m=String(target||'').trim().match(/^(\d+)\s*(.+)$/);
  if(m) return {num:m[1], color:m[2].trim()};
  return {num:'', color:String(target||'').trim()};
}
// Без ведущего пробела — иначе target начинался с пробела (" 95 каралл")
// и не совпадал с эталонным joinTarget из app.js.
function joinTarget(num, color){
  num=String(num||'').trim();color=String(color||'').trim();
  return num+(color?(num?' ':'')+color:'');
}

// ============ ОСНОВНАЯ ФУНКЦИЯ ============
function parseLineByRules(line, ctx){
  const {droneVocab, colorVocab, lastFlight}=ctx;
  const fields={};
  const missing=[];

  // 1. Шапка
  const hdr=line.match(/^\[(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})\]\s*([^:]+):\s*(.*)$/);
  if(!hdr){
    return {fields:{_continuation:line.trim()}, missing:[]};
  }
  const [fullMatch,d,m,y,hh,mm,pilot,body]=hdr;
  fields.date=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  fields.time=`${hh.padStart(2,'0')}:${mm.padStart(2,'0')}`;
  fields.pilot=pilot.trim();

  // 2. Номер вылета
  const fn=parseFlightNum(body);
  let pos=0;
  if(fn!==null){
    fields._parsedFlightnum=fn;
    const fnMatch=body.match(/^\s*(первый|второй|третий|четвёртый|четвертый|пятый|шестой|седьмой|восьмой|девятый|десятый|\d+)(?:-?й?\s*вылет)\s*/i);
    if(fnMatch) pos+=fnMatch[0].length;
  }else{
    missing.push('_parsedFlightnum');
    // Пропускаем голое "вылет" без номера (иначе блокирует распознавание точки)
    const bareVylet=body.match(/^\s*вылет\s+/i);
    if(bareVylet) pos+=bareVylet[0].length;
  }

  // 3. «район»
  let hasRayon=false;
  const rayonMatch=body.slice(pos).match(/^\s*район\s+/i);
  if(rayonMatch){
    pos+=rayonMatch[0].length;
    hasRayon=true;
  }

  // 4. Точка: "ЧИСЛО ЦВЕТ"
  const targetMatch=body.slice(pos).match(/^(\d+)\s*([а-яё]+)/i);
  let targetEndPos=pos;
  if(targetMatch){
    const num=targetMatch[1];
    let color=targetMatch[2];
    const corrected=closestColor(color, colorVocab);
    if(corrected) color=corrected;
    else if(!colorVocab.some(c=>c.toLowerCase()===color.toLowerCase())){
      missing.push('target');
    }
    fields.target=joinTarget(num, color);
    // pos двигаем по длине ИСХОДНОГО совпадения: в нём уже учтён и ввод цвета,
    // и все последующие шаги вырезают остаток именно отсюда.
    pos+=targetMatch[0].length;
    targetEndPos=pos;
  }else{
    missing.push('target');
  }

  // 5. Результат: ищем "на места/на места/на места/не на места/не на места/не на места" ГДЕ-УГОДНО после цели
  const afterTargetRaw=body.slice(targetEndPos);
  const lowerAfter=afterTargetRaw.toLowerCase();
  let resultMatch=null, resultStart=targetEndPos, resultLen=0;
  
  // Ищем первое вхождение любого варианта результата
  // Варианты склонений: «на месте» (предложный) и «не на месте».
  // Порядок важен лишь для выбора самого раннего вхождения — берём по индексу.
  const resultPatterns=['не на месте','на месте'];
  let earliestIdx=-1, earliestMatch=null;
  for(const pat of resultPatterns){
    const idx=lowerAfter.indexOf(pat);
    if(idx>=0 && (earliestIdx===-1 || idx<earliestIdx)){
      earliestIdx=idx;
      earliestMatch=pat;
    }
  }
  if(earliestIdx>=0){
    fields.result=earliestMatch.startsWith('не') ? 'no' : 'yes';
    resultMatch=afterTargetRaw.slice(earliestIdx, earliestIdx+earliestMatch.length);
    resultLen=earliestMatch.length;
    resultStart=targetEndPos+earliestIdx;
  }else{
    missing.push('result');
  }
  const resultEnd=resultStart+resultLen;

  // 6. Груз: между концом цели и началом результата
  let ammoText='';
  if(resultStart>targetEndPos){
    ammoText=body.slice(targetEndPos, resultStart).trim().replace(/^[,\.\s]+|[,\.\s]+$/g,'');
  }else if(!fields.result && targetEndPos < body.length){
    const bortIdx=body.slice(targetEndPos).search(/борт\s|потерян|спикировал|не вернул/);
    const end=bortIdx>=0 ? targetEndPos+bortIdx : body.length;
    ammoText=body.slice(targetEndPos, end).trim().replace(/^[,\.\s]+|[,\.\s]+$/g,'');
  }
  if(ammoText){
    fields.ammo=ammoText;
  }else{
    missing.push('ammo');
  }

  // 7. Возврат и борт: ищем после результата (или после цели если нет результата)
  const searchFrom=resultEnd || targetEndPos;
  const afterResult=body.slice(searchFrom);
  // Разделитель между «вернул» и бортом — РОВНО один пробел (\s+), иначе \s*
// жадно сливает слова: «вернул гамаюн13ц» матчился целиком, и хвост «ц»
// (или часть названия) уезжал в note.
const returnMatch=afterResult.match(/борт\s+(не\s+)?вернул\s+([^\s,.]+)?/i);
  if(!returnMatch){
    if(/потерян|спикировал|не вернул/i.test(afterResult)){
      fields.returned='no';
      const m2=afterResult.match(/(?:потерян|спикировал|не вернул)\s+([^\s,.]+)/i);
      if(m2){
        fields.drone=normalizeDroneName(m2[1], droneVocab);
        if(!droneVocab.some(v=>v.toLowerCase().replace(/[\s\-]+/g,'')===m2[1].toLowerCase().replace(/[\s\-]+/g,''))){
          missing.push('drone');
        }
      }else{
        missing.push('drone');
      }
    }else{
      missing.push('returned');
      missing.push('drone');
    }
  }else{
    fields.returned=returnMatch[1] ? 'no' : 'yes';
    if(returnMatch[2]){
      fields.drone=normalizeDroneName(returnMatch[2], droneVocab);
      if(!droneVocab.some(v=>v.toLowerCase().replace(/[\s\-]+/g,'')===returnMatch[2].toLowerCase().replace(/[\s\-]+/g,''))){
        missing.push('drone');
      }
    }else{
      missing.push('drone');
    }
  }

  // 8. Примечание: остаток после "борт вернул..." или альтернативы
  let noteText='';
  if(returnMatch){
    // Конец = index совпадения + его длина. Раньше бралась только длина, а совпадение
    // начиналось не в начале afterResult (перед ним точка/запятая) — последний символ
    // («…13ц» → «ц») оставался в note.
    noteText=afterResult.slice(returnMatch.index+returnMatch[0].length).trim();
  }else if(/потерян|спикировал|не вернул/i.test(afterResult)){
    const m3=afterResult.match(/(?:потерян|спикировал|не вернул)[^\s,.]*\s*([^\s,.]*)/i);
    if(m3 && m3.index+m3[0].length < afterResult.length){
      noteText=afterResult.slice(m3.index+m3[0].length).trim();
    }
  }else{
    noteText=afterResult;
  }
  if(hasRayon){
    noteText=(noteText ? noteText+' ' : '')+'район';
  }
  if(noteText){
    fields.note=noteText;
  }

  return {fields, missing};
}

// ============ БАТЧ ============
// Все поля вылета — для строки, которую правила не разобрали совсем (уходит в ИИ целиком)
const ALL_RULE_FIELDS=['date','time','pilot','_parsedFlightnum','target','ammo','drone','result','returned','note'];
function parseAllByRules(lines){
  const droneVocab=getDroneVocab();
  const colorVocab=buildColorVocab();
  const ctx={droneVocab, colorVocab, lastFlight:null};

  const parsed=[];
  let lastFlightFields=null;

  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(!line) continue; // пустая строка — не вылет, карточки не даёт
    const {fields, missing}=parseLineByRules(line, ctx);
    if(fields._continuation){
      if(lastFlightFields){
        lastFlightFields.note=(lastFlightFields.note?lastFlightFields.note+'\n':'')+fields._continuation;
        parsed.push({fields:{}, missing:[], _src:line, _lineIdx:i, _continuation:true});
      }else{
        // Строка без шапки до первого вылета — другой формат: целиком на разбор ИИ
        parsed.push({fields:{}, missing:ALL_RULE_FIELDS.slice(), _src:line, _lineIdx:i});
      }
      continue;
    }
    parsed.push({fields, missing, _src:line, _lineIdx:i});
    lastFlightFields=fields; // продолжения дописываются только к строкам с шапкой
  }

  // Номера ИСХОДНЫХ строк (не индексы parsed): пустые строки в parsed не попадают
  const missingLines=parsed.filter(p=>p.missing.length).map(p=>p._lineIdx);
  return {parsed, missingLines};
}

// Экспорт
if(typeof module!=='undefined' && module.exports){
  module.exports={parseLineByRules, parseAllByRules, splitTarget, joinTarget, buildColorVocab, getDroneVocab, normalizeDroneName, parseFlightNum, levenshtein, closestColor};
}else{
  globalThis.parseLineByRules=parseLineByRules;
  globalThis.parseAllByRules=parseAllByRules;
}