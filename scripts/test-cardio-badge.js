'use strict';
/* Nodeハーネス: app.js を vm で読み、心肺機能コメントの分類・判定
   （estimate の cardio：ST候補の下限の引き上げ）と、測定の状態の印
   （measureBadge）を検証する。
   使い方: node scripts/test-cardio-badge.js
   ブラウザのDOM/localStorage/fetch を最小限スタブする。
   心肺機能コメントの目安はすべてユーザー検証による推定・未確定
   （Perplexity調査 2026-11-15、appligame「久しぶりに能力測定の話③」ほか）。
   印は既存の判定結果（narrowSp / narrowSpCount / narrowSt）から自動で決める。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(no, name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + no + ' ' + name); }
  else { fail++; console.log('FAIL ' + no + ' ' + name + (extra ? ' — ' + extra : '')); }
}

function makeEl() {
  const t = {
    value: '', textContent: '', innerHTML: '', hidden: false, files: null,
    style: {}, children: [],
    addEventListener() {}, appendChild(c) { this.children.push(c); },
    reset() {}, scrollIntoView() {}, click() {},
    querySelectorAll() { return []; },
  };
  return new Proxy(t, {
    get(o, k) { if (k in o) return o[k]; return function () {}; },
    set(o, k, v) { o[k] = v; return true; },
  });
}
const els = {};
function getEl(id) { if (!els[id]) els[id] = makeEl(); return els[id]; }
const store = {};
const sandbox = {
  console,
  setTimeout, clearTimeout, Promise,
  URL,
  window: {},
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  document: {
    getElementById: getEl,
    createElement: () => makeEl(),
  },
  fetch: (url) => {
    const file = path.join(ROOT, url.replace(/^\.\//, ''));
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
    } catch (e) {
      return Promise.resolve({ ok: false, json: () => Promise.reject(e) });
    }
  },
};
sandbox.window.confirm = () => true;
sandbox.window.scrollTo = () => {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rec(over) {
  const base = {
    name: 'テスト', sex: '牡', spRank: 'C', stRank: 'C', comment: '',
    growthNum: 2, measureLog: [],
  };
  return Object.assign(base, over || {});
}

(async () => {
  await sleep(100); // loadData() の fetch 完了を待つ
  const C = sandbox;

  // ---- 改善1：心肺機能コメント ----
  check('C01', 'ranks.json v11 に cardio（3件）が読み込まれている',
    C.RANKS && C.RANKS.version === 11 && !!C.RANKS.cardio &&
    C.RANKS.cardio.items.length === 3 &&
    C.RANKS.cardio.items[0].stMin === 105 &&
    C.RANKS.cardio.items[1].stMin === 120 &&
    C.RANKS.cardio.items[2].stMin === 130);

  let cls = C.classify('心肺機能は飛びぬけてますねぇ', []);
  check('C02', '分類：飛びぬけが特徴に出て未分類0件',
    cls.fea.indexOf('心肺機能は飛びぬけている（ST105以上の目安・参考）') >= 0 && cls.unclassified.length === 0,
    JSON.stringify(cls));

  cls = C.classify('心肺機能は特別なものがありますねぇ', []);
  check('C03', '分類：特別が特徴に出て未分類0件',
    cls.fea.indexOf('心肺機能は特別（ST120以上の目安・参考）') >= 0 && cls.unclassified.length === 0,
    JSON.stringify(cls));

  cls = C.classify('いくらでも走れそうな心肺機能ですねぇ', []);
  check('C04', '分類：いくらでもが特徴に出て未分類0件',
    cls.fea.indexOf('いくらでも走れそうな心肺機能（ST130以上の目安・参考）') >= 0 && cls.unclassified.length === 0,
    JSON.stringify(cls));

  let est = C.estimate(rec({ spRank: 'A', stRank: 'A', comment: 'いくらでも走れそうな心肺機能ですねぇ' }));
  check('C05', '判定：ST候補の下限が130に上がる',
    !!est.st && est.st[0] === 130 && !!est.cardio && est.cardio.stMin === 130,
    JSON.stringify(est.st) + ' / ' + JSON.stringify(est.cardio));
  check('C06', '判定：使った条件に心肺機能コメントが出る',
    est.used.join('／').indexOf('心肺機能コメント：ST130以上') >= 0, est.used.join('／'));

  est = C.estimate(rec({ spRank: 'A', stRank: 'A', comment: '心肺機能は飛びぬけてますねぇ' }));
  check('C07', '判定：飛びぬけでST候補の下限が105に上がる',
    !!est.st && est.st[0] === 105 && !!est.cardio && est.cardio.stMin === 105,
    JSON.stringify(est.st));

  est = C.estimate(rec({ spRank: 'A', stRank: 'A', comment: '心肺機能は飛びぬけてますねぇ\n心肺機能は特別なものがありますねぇ' }));
  check('C08', '判定：複数ある場合は一番大きい目安（120）を使う',
    !!est.st && est.st[0] === 120 && !!est.cardio && est.cardio.stMin === 120,
    JSON.stringify(est.st));

  est = C.estimate(rec({ spRank: 'A', stRank: 'A', comment: '' }));
  check('C09', '判定：心肺コメントなしでは cardio は null でST下限は変わらない',
    est.cardio === null && !!est.st && est.st[0] === 100,
    JSON.stringify(est.cardio) + ' / ' + JSON.stringify(est.st));

  est = C.estimate(rec({ spRank: 'C', stRank: 'C', comment: '心肺機能は特別なものがありますねぇ' }));
  check('C10', '判定：STランク範囲と食い違う場合は候補なし（既存の条件と同じ扱い）',
    est.status.indexOf('候補なし') >= 0 && est.st === null, est.status);

  // ---- 改善2：測定の状態の印 ----
  let r0 = rec({});
  check('B01', '印：測定記録なしは印なし', C.measureBadge(r0, C.estimate(r0)) === '');

  let rSp = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 16, spRank: 'C', stRank: 'E', measure: '完成まであと一息' },
  ] });
  check('B02', '印：SPコメント絞り込みの結果ありは「測定済み（SP）」',
    C.measureBadge(rSp, C.estimate(rSp)) === '測定済み（SP）',
    C.measureBadge(rSp, C.estimate(rSp)));

  let rSpCount = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 3, spRank: 'A' },
  ] });
  check('B03', '印：SP本数測定の結果ありは「測定済み（SP）」',
    C.measureBadge(rSpCount, C.estimate(rSpCount)) === '測定済み（SP）',
    C.measureBadge(rSpCount, C.estimate(rSpCount)));

  let rSt = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, stRank: 'D' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 5, stRank: 'C' },
  ] });
  check('B04', '印：ダート測定の結果ありは「測定済み（ST）」',
    C.measureBadge(rSt, C.estimate(rSt)) === '測定済み（ST）',
    C.measureBadge(rSt, C.estimate(rSt)));

  let rBoth = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B', stRank: 'D' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 3, spRank: 'A' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 5, stRank: 'C' },
  ] });
  check('B05', '印：両方の結果ありは「測定済み（SP・ST）」',
    C.measureBadge(rBoth, C.estimate(rBoth)) === '測定済み（SP・ST）',
    C.measureBadge(rBoth, C.estimate(rBoth)));

  let rDoing = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, stRank: 'D' },
  ] });
  check('B06', '印：記録はあるが結果がまだ無い場合は「測定中」',
    C.measureBadge(rDoing, C.estimate(rDoing)) === '測定中',
    C.measureBadge(rDoing, C.estimate(rDoing)));

  console.log('---');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
