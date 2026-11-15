'use strict';
/* Nodeハーネス: app.js を vm で読み、測定メモ（調教記録）からの
   SP絞り込み（narrowByTarget・コメント到達率方式）と
   ST絞り込み（narrowStaminaDart・ダート調教による測定法）を検証する。
   使い方: node scripts/test-measure-narrow.js
   ブラウザのDOM/localStorage/fetch を最小限スタブする。 */
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
function eqRange(r, lo, hi) {
  return Array.isArray(r) && r[0] === lo && r[1] === hi;
}
function notesContain(nw, text) {
  return !!nw && nw.notes.join('\n').indexOf(text) >= 0;
}

(async () => {
  await sleep(100); // loadData() の fetch 完了を待つ
  const C = sandbox;

  check('N00', 'ranks.json v10 と staminaDart・speedCount が読み込まれている',
    C.RANKS && C.RANKS.version === 10 && !!(C.RANKS.measureNarrowing && C.RANKS.measureNarrowing.staminaDart) && !C.RANKS.measureNarrowing.staminaNote &&
    !!(C.RANKS.speedCount && C.RANKS.speedCount.rates && C.RANKS.speedCount.rates['2'][0] === 60 && C.RANKS.speedCount.rates['2'][1] === 70),
    'version=' + (C.RANKS && C.RANKS.version));

  // N01: T29相当（対象なし旧形式2件、SPとして扱う）
  let est = C.estimate(rec({ measureLog: [
    { stage: '入厩前', trainingCount: 0, spRank: 'E', stRank: 'E', measure: 'BC登録はまだ先（スペースなし）', changed: '', at: '', note: '' },
    { stage: '入厩後', trainingCount: 16, spRank: 'C', stRank: 'E', measure: '完成まであと一息', changed: 'ランク変化', at: '', note: '' },
  ] }));
  check('N01', '旧形式2件でSP絞り込み 70〜98', !!est.narrowSp && eqRange(est.narrowSp.range, 70, 98),
    JSON.stringify(est.narrowSp && est.narrowSp.range));
  check('N01b', 'SPランク変化 E→C の注記', notesContain(est.narrowSp, 'E→C') && notesContain(est.narrowSp, '変わった'));
  check('N01c', 'ST側は記録なしで null', est.narrowSt === null);  // N02: T30相当（スペースあり）
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩前', trainingCount: 0, spRank: 'E', stRank: 'E', measure: 'BC登録はまだ先（スペースなし）', changed: '', at: '', note: '' },
    { stage: '入厩後', trainingCount: 16, spRank: 'C', stRank: 'E', measure: 'BC登録は　まだ先（スペースあり）', changed: '', at: '', note: '' },
  ] }));
  check('N02', 'スペースありでSP絞り込み 83〜112', !!est.narrowSp && eqRange(est.narrowSp.range, 83, 112),
    JSON.stringify(est.narrowSp && est.narrowSp.range));

  // N03: SP複数記録の重なり
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 16, spRank: 'C', measure: '完成まであと一息' },
    { stage: '入厩後', trainingCount: 20, spRank: 'C', measure: 'BC登録は　まだ先（スペースあり）' },
  ] }));
  check('N03', 'SP 2件の重なり 83〜98', !!est.narrowSp && eqRange(est.narrowSp.range, 83, 98) && est.narrowSp.conflict === false,
    JSON.stringify(est.narrowSp && est.narrowSp.range));

  // N04: ダート測定法（入厩時D・ダート一杯5本でC→初期値65・最大ST候補130/131）
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, stRank: 'D' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 5, stRank: 'C' },
  ] }));
  check('N04', 'ダート測定で初期値65・最大ST候補130/131',
    !!est.narrowSt && est.narrowSt.method === 'dart' && est.narrowSt.initial === 65 &&
    Array.isArray(est.narrowSt.candidates) && est.narrowSt.candidates[0] === 130 && est.narrowSt.candidates[1] === 131,
    JSON.stringify(est.narrowSt));
  check('N04b', 'ダート測定の前提（およそ50％）の注記', !!est.narrowSt && est.narrowSt.notes.join('\n').indexOf('およそ50％') >= 0);
  check('N04c', 'SP側は null', est.narrowSp === null);

  // N05: 食い違い
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 16, spRank: 'C', measure: '完成まであと一息' },
    { stage: '入厩後', trainingCount: 30, spRank: 'A', measure: '完成まであと一息' },
  ] }));
  check('N05', '重なりなしは conflict で範囲なし',
    !!est.narrowSp && est.narrowSp.conflict === true && est.narrowSp.range === null,
    JSON.stringify(est.narrowSp));
  check('N05b', '食い違いの注記', notesContain(est.narrowSp, '記録同士が食い違っています'));

  // N06: target なし旧記録はスピード扱い
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 16, spRank: 'C', measure: '完成まであと一息' },
  ] }));
  check('N06', 'target なしはSPとして絞り込み 70〜98', !!est.narrowSp && eqRange(est.narrowSp.range, 70, 98) && est.narrowSt === null);

  // N07: ダート測定法（入厩時E・ダート一杯1本でD→初期値54・最大ST候補108/109）
  est = C.estimate(rec({ growthNum: 1, measureLog: [
    { stage: '入厩後', trainingCount: 0, stRank: 'E' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 1, stRank: 'D' },
  ] }));
  check('N07', 'ダート測定で初期値54・最大ST候補108/109',
    !!est.narrowSt && est.narrowSt.initial === 54 &&
    Array.isArray(est.narrowSt.candidates) && est.narrowSt.candidates[0] === 108 && est.narrowSt.candidates[1] === 109,
    JSON.stringify(est.narrowSt));

  // N08: メモリ2・準備はできたは未確認で範囲なし
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 26, spRank: 'C', measure: '準備はできた' },
  ] }));
  check('N08', 'メモリ2 準備はできたは範囲なし・未確認注記',
    !!est.narrowSp && est.narrowSp.range === null && est.narrowSp.conflict === false && notesContain(est.narrowSp, '未確認'),
    JSON.stringify(est.narrowSp));

  // N09: validRecord の target 検証
  const vr = (ml) => C.validRecord({ id: 'x1', name: 'テスト', sex: '牡', spRank: 'C', stRank: 'C', comment: '', memo: '', measureLog: ml });
  check('N09', 'target スタミナは可', vr([{ target: 'スタミナ', stage: '入厩後', measure: '完成まであと一息' }]) === true);
  check('N09b', 'target の不正値は不可', vr([{ target: '変な値', stage: '入厩後' }]) === false);
  check('N09c', 'target なし旧形式は可', vr([{ stage: '入厩後', measure: '完成まであと一息' }]) === true);

  // N10: コメントによるST絞り込みは廃止（ST対象＋コメントだけでは narrowSt は出ない）
  est = C.estimate(rec({ measureLog: [
    { target: 'スタミナ', stage: '入厩前', trainingCount: 0, stRank: 'E' },
    { target: 'スタミナ', stage: '入厩後', trainingCount: 10, stRank: 'D', measure: '完成まであと一息' },
  ] }));
  check('N10', 'コメント＋STランクだけではST絞り込みは出ない（廃止）',
    est.narrowSt === null, JSON.stringify(est.narrowSt));

  // N11: 記録なし
  est = C.estimate(rec({}));
  check('N11', '記録なしは両方 null', est.narrowSp === null && est.narrowSt === null);

  // N12: ダート測定は「初めて変わった」記録だけを使う（その後の変化は使わない）
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, stRank: 'D' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 3, stRank: 'C' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 8, stRank: 'B' },
  ] }));
  check('N12', 'ダート測定は最初の変化（3本でC）から初期値67・候補134/135',
    !!est.narrowSt && est.narrowSt.initial === 67 && est.narrowSt.count === 3 &&
    Array.isArray(est.narrowSt.candidates) && est.narrowSt.candidates[0] === 134 && est.narrowSt.candidates[1] === 135,
    JSON.stringify(est.narrowSt));

  // N13: レコード自体のコメントからの読み（従来仕様・SPのみ）
  est = C.estimate(rec({ comment: '完成まであと一息でしょうか' }));
  check('N13', 'コメントからのSP絞り込み 70〜98', !!est.narrowSp && eqRange(est.narrowSp.range, 70, 98) && est.narrowSt === null,
    JSON.stringify(est.narrowSp && est.narrowSp.range));

  // N14: SP対象（コメント方式）とST（ダート測定）の混在
  est = C.estimate(rec({ measureLog: [
    { target: 'スピード', stage: '入厩後', trainingCount: 16, spRank: 'C', measure: '完成まであと一息' },
    { stage: '入厩後', trainingCount: 0, stRank: 'D' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 5, stRank: 'C' },
  ] }));
  check('N14', 'SP 70〜98 と ダート測定の最大ST候補130/131 が両方出る',
    !!est.narrowSp && eqRange(est.narrowSp.range, 70, 98) && !!est.narrowSt &&
    Array.isArray(est.narrowSt.candidates) && est.narrowSt.candidates[0] === 130 && est.narrowSt.candidates[1] === 131,
    JSON.stringify({ sp: est.narrowSp && est.narrowSp.range, st: est.narrowSt }));

  // N15: ダート測定の途中経過（まだランクが変わっていない）
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, stRank: 'D' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 3, stRank: 'D' },
  ] }));
  check('N15', '未変化なら pending で候補なし',
    !!est.narrowSt && est.narrowSt.pending === true && est.narrowSt.candidates === null,
    JSON.stringify(est.narrowSt));

  // N16: ダート併せでは測定しない（併せ効果でずれる場合があるため）
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, stRank: 'D' },
    { target: 'スタミナ', trainingType: 'ダート併せ', stage: '入厩後', trainingCount: 5, stRank: 'C' },
  ] }));
  check('N16', 'ダート併せの変化では候補は出ない', est.narrowSt === null, JSON.stringify(est.narrowSt));

  // N17: 入厩前のSTランクは入厩時STとして使わない
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩前', trainingCount: 0, stRank: 'B' },
    { stage: '入厩後', trainingCount: 0, stRank: 'D' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 5, stRank: 'C' },
  ] }));
  check('N17', '入厩後Dを基準に初期値65・候補130/131',
    !!est.narrowSt && est.narrowSt.fromRank === 'D' && est.narrowSt.initial === 65,
    JSON.stringify(est.narrowSt));

  // N18: trainingType の検証
  check('N18', 'trainingType ダート一杯は可', vr([{ target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後' }]) === true);
  check('N18b', 'trainingType の不正値は不可', vr([{ trainingType: '変な値', stage: '入厩後' }]) === false);
  check('N18c', 'trainingType なし旧形式は可', vr([{ stage: '入厩後', measure: '完成まであと一息' }]) === true);

  // N19: スピード本数測定（初期B・芝一杯3本でA→初期SP97、メモリ2で最大SP候補139〜161）
  est = C.estimate(rec({ growthNum: 2, measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 3, spRank: 'A' },
  ] }));
  check('N19', '本数測定で初期SP97・最大SP候補139〜161',
    !!est.narrowSpCount && est.narrowSpCount.method === 'count' && est.narrowSpCount.initial === 97 && est.narrowSpCount.count === 3 &&
    eqRange(est.narrowSpCount.range, 139, 161),
    JSON.stringify(est.narrowSpCount));
  check('N19b', '本数測定の端数未確認の注記', !!est.narrowSpCount && est.narrowSpCount.notes.join('\n').indexOf('端数処理は未確認') >= 0);

  // N20: 初期E・芝一杯6本でD→初期SP49
  est = C.estimate(rec({ growthNum: 2, measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'E' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 6, spRank: 'D' },
  ] }));
  check('N20', '本数測定で初期SP49・最大SP候補71〜81',
    !!est.narrowSpCount && est.narrowSpCount.initial === 49 && eqRange(est.narrowSpCount.range, 71, 81),
    JSON.stringify(est.narrowSpCount));

  // N21: 最初からAは本数測定が使えない
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'A' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 3, spRank: 'A' },
  ] }));
  check('N21', '最初からAは unusable で範囲なし',
    !!est.narrowSpCount && est.narrowSpCount.unusable === true && est.narrowSpCount.range === null &&
    est.narrowSpCount.notes.join('\n').indexOf('使えません') >= 0,
    JSON.stringify(est.narrowSpCount));

  // N22: 芝一杯以外の調教が混ざると精密測定にならない注記（初期値は計算する）
  est = C.estimate(rec({ growthNum: 2, measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B' },
    { target: 'スピード', trainingType: 'その他', stage: '入厩後', trainingCount: 1, spRank: 'B' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 3, spRank: 'A' },
  ] }));
  check('N22', '混ざり注記つきで初期SP97',
    !!est.narrowSpCount && est.narrowSpCount.mixed === true && est.narrowSpCount.initial === 97 &&
    est.narrowSpCount.notes.join('\n').indexOf('精密な本数測定にはなりません') >= 0,
    JSON.stringify(est.narrowSpCount));

  // N23: コメント式との重なり（combined）
  est = C.estimate(rec({ growthNum: 2, measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 10, spRank: 'A' },
    { target: 'スピード', stage: '入厩後', trainingCount: 29, spRank: 'A', measure: '完成まであと一息' },
  ] }));
  check('N23', '本数測定129〜150とコメント式の重なり129〜150',
    !!est.narrowSpCount && est.narrowSpCount.initial === 90 && eqRange(est.narrowSpCount.range, 129, 150) &&
    !!est.narrowSp && eqRange(est.narrowSp.range, 100, null) &&
    eqRange(est.narrowSpCount.combined, 129, 150) && est.narrowSpCount.combinedConflict === false,
    JSON.stringify({ c: est.narrowSpCount, m: est.narrowSp && est.narrowSp.range }));

  // N23b: コメント式と食い違う場合は combinedConflict
  est = C.estimate(rec({ growthNum: 2, measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 3, spRank: 'A' },
    { target: 'スピード', stage: '入厩後', trainingCount: 3, spRank: 'C', measure: '完成まであと一息' },
  ] }));
  check('N23b', '本数測定139〜161とコメント式70〜98は食い違い',
    !!est.narrowSpCount && est.narrowSpCount.combinedConflict === true && est.narrowSpCount.combined === null &&
    est.narrowSpCount.notes.join('\n').indexOf('食い違っています') >= 0,
    JSON.stringify(est.narrowSpCount));

  // N24: 芝一杯の記録はあるが未変化なら pending
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 2, spRank: 'B' },
  ] }));
  check('N24', '未変化なら pending で候補なし',
    !!est.narrowSpCount && est.narrowSpCount.pending === true && est.narrowSpCount.range === null,
    JSON.stringify(est.narrowSpCount));

  // N25: 芝併せも+1として数える
  est = C.estimate(rec({ growthNum: 2, measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'C' },
    { target: 'スピード', trainingType: '芝併せ', stage: '入厩後', trainingCount: 2, spRank: 'B' },
  ] }));
  check('N25', '芝併せ2本でB→初期SP83',
    !!est.narrowSpCount && est.narrowSpCount.initial === 83 && est.narrowSpCount.count === 2,
    JSON.stringify(est.narrowSpCount));
  check('N25b', 'trainingType 芝併せは可', vr([{ trainingType: '芝併せ', stage: '入厩後' }]) === true);

  // N26: ダート一杯の記録だけではSP本数測定は出ない
  est = C.estimate(rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B' },
    { target: 'スピード', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 3, spRank: 'A' },
  ] }));
  check('N26', 'ダート一杯ではSP本数測定は出ない', est.narrowSpCount === null, JSON.stringify(est.narrowSpCount));

  // N27: 時期（ゲーム内の月週）の週加減。5週の次は翌月1週、12月5週の次は翌年1月1週
  check('N27', '3月5週＋1週＝4月1週', C.shiftPeriodText('0歳3月5週', 1) === '0歳4月1週');
  check('N27b', '3月5週＋10週＝5月5週', C.shiftPeriodText('0歳3月5週', 10) === '0歳5月5週');
  check('N27c', '12月5週＋1週＝翌年1月1週', C.shiftPeriodText('2歳12月5週', 1) === '3歳1月1週');
  check('N27d', '4月1週−1週＝3月5週', C.shiftPeriodText('0歳4月1週', -1) === '0歳3月5週');
  check('N27e', '読めない時期は null', C.shiftPeriodText('不明', 1) === null && C.shiftPeriodText('', 1) === null);

  // N28: 増えた本数→進める週数（調教は1週に最大2本、切り上げ）
  check('N28', '増えた本数から進める週数',
    C.weeksForAddedCount(0) === 0 && C.weeksForAddedCount(1) === 1 && C.weeksForAddedCount(2) === 1 &&
    C.weeksForAddedCount(3) === 2 && C.weeksForAddedCount(20) === 10);

  // N29: 日付は自動で入る（YYYY-MM-DD）。記録の date は文字列のみ可
  check('N29', 'todayText は YYYY-MM-DD 形式', /^\d{4}-\d{2}-\d{2}$/.test(C.todayText()));
  check('N29b', 'date 文字列つきの記録は可', vr([{ stage: '入厩後', date: '2026-11-15' }]) === true);
  check('N29c', 'date の数値は不可', vr([{ stage: '入厩後', date: 20261115 }]) === false);

  console.log('---');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
