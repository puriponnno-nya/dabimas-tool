'use strict';
/* Nodeハーネス: app.js を vm で読み、「測定の進み具合」一覧の状態判定
   （measureProgress）を検証する。
   使い方: node scripts/test-measure-progress.js
   ブラウザのDOM/localStorage/fetch を最小限スタブする。
   状態は既存の判定結果（narrowSp / narrowSpCount / narrowSt）と測定記録の
   有無から自動で決める。数値はすべてユーザー検証による推定・未確定。 */
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

  check('P00', 'measureProgress が定義されている', typeof C.measureProgress === 'function');

  // 記録なし → 両方とも未測定
  let r0 = rec({});
  let p = C.measureProgress(r0, C.estimate(r0));
  check('P01', '記録なし：SP・STとも未測定（none）で要約なし',
    p.hasLog === false && p.sp.state === 'none' && p.st.state === 'none' &&
    p.sp.summary === '' && p.st.summary === '',
    JSON.stringify(p));

  // コメント絞り込みだけ（メモリ2・SPランクC・「完成まであと一息」→ 70〜98）
  let rComment = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 16, spRank: 'C', stRank: 'E', measure: '完成まであと一息' },
  ] });
  p = C.measureProgress(rComment, C.estimate(rComment));
  check('P02', 'コメント絞り込みのみ：SPは comment、要約は「最大SP候補 70〜98」',
    p.sp.state === 'comment' && p.sp.summary === '最大SP候補 70〜98',
    JSON.stringify(p.sp));
  check('P03', 'コメント絞り込みのみ：STは測定中（記録はあるが結果なし）',
    p.st.state === 'measuring', JSON.stringify(p.st));

  // 本数測定（入厩時B・芝一杯3本でA・メモリ2 → 初期SP97 → 最大SP候補139〜161）
  let rCount = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 3, spRank: 'A' },
  ] });
  p = C.measureProgress(rCount, C.estimate(rCount));
  check('P04', '本数測定：SPは count、要約は「最大SP候補 139〜161」',
    p.sp.state === 'count' && p.sp.summary === '最大SP候補 139〜161',
    JSON.stringify(p.sp));

  // ダート測定（入厩時D・ダート一杯5本でC → 初期値65 → 最大ST候補130/131）
  let rDart = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, stRank: 'D' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 5, stRank: 'C' },
  ] });
  p = C.measureProgress(rDart, C.estimate(rDart));
  check('P05', 'ダート測定：STは done、要約は「最大ST候補 130/131」',
    p.st.state === 'done' && p.st.summary === '最大ST候補 130/131',
    JSON.stringify(p.st));

  // 記録はあるが結果がまだ無い → 両方とも測定中
  let rDoing = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, stRank: 'D' },
  ] });
  p = C.measureProgress(rDoing, C.estimate(rDoing));
  check('P06', '記録あり結果なし：SP・STとも測定中',
    p.hasLog === true && p.sp.state === 'measuring' && p.st.state === 'measuring',
    JSON.stringify(p));

  // 両方の結果あり
  let rBoth = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B', stRank: 'D' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 3, spRank: 'A' },
    { target: 'スタミナ', trainingType: 'ダート一杯', stage: '入厩後', trainingCount: 5, stRank: 'C' },
  ] });
  p = C.measureProgress(rBoth, C.estimate(rBoth));
  check('P07', '両方あり：SPは count、STは done',
    p.sp.state === 'count' && p.st.state === 'done' &&
    p.sp.summary === '最大SP候補 139〜161' && p.st.summary === '最大ST候補 130/131',
    JSON.stringify(p));
  check('P08', 'measureBadge と矛盾しない（両方ありは「測定済み（SP・ST）」）',
    C.measureBadge(rBoth, C.estimate(rBoth)) === '測定済み（SP・ST）',
    C.measureBadge(rBoth, C.estimate(rBoth)));

  // 本数測定＋コメント式の重なり（combined）がある場合は重なりを要約にする
  let rCombined = rec({ measureLog: [
    { stage: '入厩後', trainingCount: 0, spRank: 'B' },
    { target: 'スピード', trainingType: '芝一杯', stage: '入厩後', trainingCount: 3, spRank: 'A' },
    { target: 'スピード', stage: '入厩後', trainingCount: 3, spRank: 'A', measure: '完成まであと一息' },
  ] });
  p = C.measureProgress(rCombined, C.estimate(rCombined));
  check('P09', '本数×コメントの重なり：SPは count、要約は重なりの範囲',
    p.sp.state === 'count' && p.sp.summary === '最大SP候補 139〜161',
    JSON.stringify(p.sp) + ' / ' + JSON.stringify(C.estimate(rCombined).narrowSpCount));

  // ランク未入力（estimate が候補を出せない）でも例外にならず未測定になる
  let rEmpty = rec({ spRank: '', stRank: '' });
  p = C.measureProgress(rEmpty, C.estimate(rEmpty));
  check('P10', 'ランク未入力でも落ちず、SP・STとも未測定',
    p.sp.state === 'none' && p.st.state === 'none', JSON.stringify(p));

  console.log('---');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
