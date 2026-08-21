// ===== МАРШРУТ — Event Sourcing учёта (ADR-001) =====
// ЭТАП 1: getBalance(model, location) РЯДОМ со старой системой.
// ТОЛЬКО ЧТЕНИЕ. Ничего не мутирует, не пишет, не синкает. qty/stock/squads
// живут как прежде; это параллельный вычислитель остатка из журнала движений.
//
// Остаток = Σ qty всех движений по паре модель×локация (ADR §2/§3).
// Отрицательный баланс — ВАЛИДЕН (ADR §4): сигнал недостающего прихода, не баг.
//
// Источник — ТОЛЬКО state.transfers (журнал движений). flights не нужны:
// потеря уже материализована записью loss (привязка по flightId — для Этапа 5).
//
// Таблица типов (ADR §3) + временное разложение легаси-типов (до Этапа 3):
//   arrival       : +qty в локации записи (нет поля локации → 'склад')
//   move          : −qty у from, +qty у to (две локации)
//   loss          : −qty у пилота (location = t.pilot)
//   writeoff      : −qty в локации
//   handover      : −qty в локации
//   adjust        : +qty (ЗНАКОВАЯ) в локации
//   startbalance  : +qty в локации
//   exchange (легаси): get→+qty, give→−qty, локация = 'склад'   // TODO Этап 3 → handover
//   transfer (легаси): from→−qty, to→+qty (как move)            // TODO Этап 3 → move/writeoff

// ===== squadKey — идентификатор РАСЧЁТА (носителя склада) =====
// (02.07.2026, подготовка к разделению «расчёт/пилот» — ARCHITECTURE §5, ADR-001 §3)
// Расчёт (носитель СКЛАДА) и пилот (субъект СТАТИСТИКИ) — разные понятия, СЕЙЧАС
// слитые: squadKey === имя пилота, функция — тождество, поведение не меняется.
// ПРАВИЛО: любой код, использующий имя пилота как ключ склада/локации ЛИБО
// опирающийся на тождество расчёт≡пилот, резолвит его ЧЕРЕЗ ЭТУ ФУНКЦИЮ —
// допущение становится greppable (grep squadKeyOf) и меняемым в одной точке.
// При будущем разделении: склад-точки (loss/adjust location, getBalance) остаются
// на squadKeyOf; статистика (отчёты «по пилотам», дебюты) возвращается к персоне —
// каждая точка вызова помечена комментарием, какая у неё семантика.
// Не-пилотские локации ('склад', внешние единицы) проходят насквозь без изменений.
function squadKeyOf(pilot){ return pilot; }

// Нормализация имён — как в проекте (_stockAuditCompute): lowercase + trim.
function _mNorm(s){ return (s==null?'':String(s)).toLowerCase().trim(); }

// Локация склада по умолчанию для приходных записей без явной локации.
const MARSHRUT_STOCK_LOC = 'склад';

// Прибавить дельту к балансу пары модель×локация в накопителе map.
// map: { modelNorm: { model:'<display>', locs:{ locNorm:{ location:'<display>', balance:N } } } }
function _mAdd(map, model, loc, delta){
  if(delta===0 || delta==null || isNaN(delta)) return;
  const mk=_mNorm(model), lk=_mNorm(loc);
  if(!mk || !lk) return; // пустая модель/локация — пропускаем (не роняем учёт)
  if(!map[mk]) map[mk]={ model:String(model).trim(), locs:{} };
  if(!map[mk].locs[lk]) map[mk].locs[lk]={ location:String(loc).trim(), balance:0 };
  map[mk].locs[lk].balance += delta;
}

// Полный прогон журнала движений → накопитель балансов (внутренний, pure read).
function _marshrutWalk(){
  const map={};
  const transfers=(typeof state!=='undefined' && state && state.transfers) ? state.transfers : [];
  transfers.forEach(t=>{
    if(!t || !t.type) return;
    switch(t.type){
      case 'arrival': {
        // Приход извне. Локации в записи нет → склад (поддержим t.to/t.location на будущее).
        const loc=t.to||t.location||MARSHRUT_STOCK_LOC;
        _mAdd(map, t.drone, loc, +(t.qty||0));
        break;
      }
      case 'move': {
        const q=+(t.qty||0);
        _mAdd(map, t.drone, t.from, -q);
        _mAdd(map, t.drone, t.to,   +q);
        break;
      }
      case 'loss': {
        // Боевая потеря — списание с локации РАСЧЁТА (squadKey, сейчас = имя пилота
        // t.pilot; склад-семантика — при разделении «расчёт/пилот» остаётся на
        // squadKeyOf). qty по умолчанию 1 (как в _stockAuditCompute).
        _mAdd(map, t.drone, squadKeyOf(t.pilot||t.location||t.from), -(t.qty||1));
        break;
      }
      case 'writeoff': {
        _mAdd(map, t.drone, t.location||t.from, -(t.qty||0));
        break;
      }
      case 'handover': {
        _mAdd(map, t.drone, t.location||t.from||MARSHRUT_STOCK_LOC, -(t.qty||0));
        break;
      }
      case 'adjust': {
        // Ручная коррекция — ЗНАКОВАЯ дельта в локации записи.
        _mAdd(map, t.drone, t.location||t.to||t.from, +(t.qty||0));
        break;
      }
      case 'startbalance': {
        _mAdd(map, t.drone, t.location||t.to||MARSHRUT_STOCK_LOC, +(t.qty||0));
        break;
      }
      // ── ЛЕГАСИ (временно, до Этапа 3 — миграция типов, ADR §7) ──
      case 'exchange': {
        // TODO Этап 3: exchange → handover. Сейчас: движение всегда против склада.
        if(t.get)  _mAdd(map, t.get,  MARSHRUT_STOCK_LOC, +(t.getQty||0));
        if(t.give) _mAdd(map, t.give, MARSHRUT_STOCK_LOC, -(t.giveQty||0));
        break;
      }
      case 'transfer': {
        // TODO Этап 3: transfer → move (и to='списан' → writeoff). Сейчас: как move,
        // обе локации буквально (включая псевдо-локации 'не бг'/'списан').
        const q=+(t.qty||0);
        _mAdd(map, t.drone, t.from, -q);
        _mAdd(map, t.drone, t.to,   +q);
        break;
      }
      default: break; // неизвестный тип — игнор (не роняем)
    }
  });
  return map;
}

// ── Публичный API ──

// Остаток модели в локации = Σ движений (ADR §2). Возвращает число (может быть < 0).
// model — точное имя модели (с учётом переименований); location — 'склад' / имя пилота / др.
function getBalance(model, location){
  const mk=_mNorm(model), lk=_mNorm(location);
  if(!mk || !lk) return 0;
  const map=_marshrutWalk();
  const m=map[mk];
  if(!m || !m.locs[lk]) return 0;
  return m.locs[lk].balance;
}

// Карта всех балансов: { '<модель>': { '<локация>': balance, ... }, ... } (Этап 2 — самосверка).
function getAllBalances(){
  const map=_marshrutWalk();
  const out={};
  Object.keys(map).forEach(mk=>{
    const m=map[mk];
    out[m.model]={};
    Object.keys(m.locs).forEach(lk=>{
      out[m.model][m.locs[lk].location]=m.locs[lk].balance;
    });
  });
  return out;
}

// ===== ЭТАП 2 — marshrutCompare(): консольная самосверка qty (старая) vs getBalance (новая) =====
// ADR-001 §5. ТОЛЬКО ЧТЕНИЕ (как syncAuditStock): не мутирует state, не пишет, не синкает.
// Вызов из консоли: marshrutCompare(). Показывает ТОЛЬКО проблемы; совпавшие пары не выводятся.
//
// Соответствие локаций старой модели (qty) и новой (движения):
//   stock status 'bg'   ↔ 'склад'   (arrival/exchange/transfer from|to='склад')
//   stock status 'nbg'  ↔ 'не бг'   (transfer to|from='не бг' — псевдо-локация, см. _marshrutWalk)
//   stock status 'lost' ↔ —         (старых «lost»-строк writeDroneLoss не создаёт; если такие есть —
//                                    ledger для них 0, строка попадёт в расхождения как сигнал)
//   squads[pilot]       ↔ squadKeyOf(pilot) (сейчас тождество)
//   'списан' в ledger — чистый сток выбытия (transfer to='списан'), в старой модели остатка нет →
//                        из сверки исключён (ожидаемо накапливает +N, это не остаток).
//
// ЛЕГАСИ НЕ ФИЛЬТРУЕТСЯ И НЕ ПРЯЧЕТСЯ: до черты (Этап 3) расхождения от старой истории ОЖИДАЕМЫ
// (ПВХ1 Поп +25 и т.п.) — это базовая линия наблюдения. Критерий Этапа 4 (§6) — ноль НОВЫХ
// расхождений после черты; минус (§4) — сигнал недостающего прихода, переключение не блокирует.
function marshrutCompare(){
  const N=_mNorm;
  const bal=getAllBalances();
  const stock=(typeof state!=='undefined'&&state&&state.stock)||[];
  const squads=(typeof state!=='undefined'&&state&&state.squads)||[];
  // qty старой модели по парам (нормализованные ключи → {model,location,qty})
  const qty={};
  const addQ=(model,loc,q)=>{
    const mk=N(model), lk=N(loc); if(!mk||!lk) return;
    const k=mk+'|'+lk;
    if(!qty[k]) qty[k]={model:String(model).trim(),location:String(loc).trim(),qty:0};
    qty[k].qty+=(+q||0);
  };
  const statusLoc={bg:'склад',nbg:'не бг',lost:'lost',['списан']:'lost'};
  stock.forEach(s=>addQ(s.name, statusLoc[N(s.status)]||N(s.status)||'склад', s.qty));
  squads.forEach(sq=>(sq.drones||[]).forEach(d=>addQ(d.name, squadKeyOf(sq.pilot), d.qty)));
  // ledger новой модели по парам
  const led={};
  Object.keys(bal).forEach(model=>Object.keys(bal[model]).forEach(loc=>{
    const lk=N(loc); if(lk==='списан') return; // сток выбытия — не остаток
    led[N(model)+'|'+lk]={model,location:loc,balance:bal[model][loc]};
  }));
  const keys=new Set([...Object.keys(qty),...Object.keys(led)]);
  const diffs=[], negatives=[];
  keys.forEach(k=>{
    const q=qty[k]?qty[k].qty:0, b=led[k]?led[k].balance:0;
    const model=(qty[k]||led[k]).model, location=(qty[k]||led[k]).location;
    if(q!==b) diffs.push({model,location,qty:q,balance:b,delta:b-q});
    if(b<0) negatives.push({model,location,balance:b});
  });
  const byName=(a,b)=>a.model.localeCompare(b.model,'ru')||a.location.localeCompare(b.location,'ru');
  diffs.sort(byName); negatives.sort(byName);
  console.log('[МАРШРУТ] Этап 2 — самосверка qty (старая) vs getBalance (новая), пар: '+keys.size+
    '. До Этапа 3 (черта) легаси-расхождения НОРМАЛЬНЫ — это базовая линия наблюдения.');
  if(diffs.length){ console.log('[МАРШРУТ] РАСХОЖДЕНИЯ (qty ≠ getBalance): '+diffs.length); console.table(diffs); }
  if(negatives.length){ console.log('[МАРШРУТ] МИНУСЫ (getBalance < 0) — сигнал недостающего прихода, НЕ ошибка (ADR §4): '+negatives.length); console.table(negatives); }
  if(!diffs.length && !negatives.length) console.log('[МАРШРУТ] Сверка чиста: qty == getBalance по всем парам');
  console.log('[МАРШРУТ] Сводка: пар всего '+keys.size+' / расхождений '+diffs.length+' / минусов '+negatives.length);
  return {diffs, negatives, total:keys.size};
}
