// Временный тест syncAuditEncryption на стабах (удалить после прогона)
const fs = require('fs');
const src = fs.readFileSync('sync.js', 'utf8');
const start = src.indexOf('async function syncAuditEncryption');
if (start < 0) throw new Error('функция не найдена');
const code = src.slice(start);

// Стабы: 2 битые записи (flights id=101_f_b, actlog без id), остальные читаются
const stubs = `
const syncGetCfg = () => ({ url: 'https://x', key: 'k', token: 't' });
const fetch = async () => ({ json: async () => ({
  flights:   [{ id: '100_f_a', data: 'ok' }, { id: '101_f_b', data: 'BAD' }],
  stock:     [{ id: 's1', data: 'ok' }],
  squads:    [],
  transfers: [{ id: 't1', data: 'ok' }, { id: 't2', data: 'ok' }],
  actlog:    [{ data: 'BAD' }, { id: '103_a_c', data: 'ok' }]
}) });
const syncDecrypt = async (row) => row.data === 'BAD' ? null : { id: row.id };
`;

const fn = new Function(stubs + code + ';return syncAuditEncryption;')();
fn().then(res => {
  console.log(JSON.stringify(res, null, 1));
  const sum = Object.fromEntries(res.summary.map(s => [s.sheet, s.bad]));
  if (sum.flights !== 1 || sum.actlog !== 1 || sum.stock !== 0 || sum.squads !== 0 || sum.transfers !== 0)
    throw new Error('счёт по листам неверен');
  if (res.bad.length !== 2) throw new Error('список битых неверен');
  if (res.bad[1].id !== '(без id)') throw new Error('нет фолбэка для пустого id');
  console.log('LOGIC OK');
}).catch(e => { console.error('FAIL:', e.message); process.exit(1); });
