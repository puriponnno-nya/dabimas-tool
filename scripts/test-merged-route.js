'use strict';
/* Nodeハーネス: app.js を vm で読み、複数ルートの統合図解（ステップ8）を検証する。
   使い方: node scripts/test-merged-route.js
   ブラウザのDOM/localStorage/fetch を最小限スタブする。
   テストの配合は、ユーザーの送った画像の配合ルート（2026-11-14）に沿う。
   画像の読み取り（5代の図。左が最終の子、右へ行くほど前の世代。
   各対の子は1列左の箱。灰色の線で確認した）：
   - 最終配合：自家製牡馬 × 自家製牝馬（画像の表示は「奇跡の配合」）
   - 父方ルート：ミルジョージ × ラブスイーツ → 自家製牝馬（モントブルックの母）。
     モントブルック × その牝馬 → 自家製牝馬（グラスワンダーの母）。
     グラスワンダー × その牝馬 → 自家製牡馬（1代目父）。
   - 母方ルート（母の父側）：グロースターク × サクラクレアー → 自家製牝馬（タケホープの母）。
     タケホープ × その牝馬 → 自家製牝馬（シーキングザゴールドの母）。
     シーキングザゴールド × その牝馬 → 自家製牡馬（1代目母の父）。
   - 母方ルート（母の母側）：グロースターク × メモリーレーン → 自家製牝馬（ダンチヒの母）。
     ダンチヒ × その牝馬 → 自家製牝馬（1代目母の母）。
   - 1代目母：自家製牡馬（母の父）× 自家製牝馬（母の母）。
   画像の10頭はすべて配合の親（父・母）で、名前のない箱はすべて自家製馬
   （配合の子）なので、代役の馬は使わない。
   画像の配合理論ラベル（面白い／よくできた／奇跡の配合）は画像側の表示で、
   このツールはDBの血統から自分で判定する（参考・未検証）。ラベルの一致は
   assert しない。図の構造（枝・由来・計画名）と表示を確認する。
   テスト用の計画・馬はメモリ上の localStorage スタブだけに作り、
   リポジトリのデータには残さない。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(no, name, cond, extra) {
  if (cond) { pass++; console.log(`PASS ${no} ${name}`); }
  else { fail++; console.log(`FAIL ${no} ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- DOMスタブ ----------
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
    set(o, k, v) { if (k === 'innerHTML' && v === '') o.children = []; o[k] = v; return true; },
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

function collectHtml(el) {
  let s = '';
  if (el && typeof el.innerHTML === 'string') s += el.innerHTML;
  if (el && Array.isArray(el.children)) el.children.forEach((c) => { s += collectHtml(c); });
  return s;
}
function collectText(el) {
  let s = '';
  if (el && typeof el.textContent === 'string') s += el.textContent;
  if (el && Array.isArray(el.children)) el.children.forEach((c) => { s += collectText(c); });
  return s;
}
function treeMatings(m, out) {
  if (!m) return out;
  out.push(m);
  [m.sire, m.dam].forEach((h) => { if (h && h.mating) treeMatings(h.mating, out); });
  return out;
}

(async () => {
  await sleep(100); // loadData() の fetch 完了を待つ
  const C = sandbox;
  const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stallions.json'), 'utf8'));
  function dbIndex(name) {
    for (let i = 0; i < db.horses.length; i++) { if (db.horses[i].n === name) return i; }
    return -1;
  }
  // --- M01: 画像の10頭がDBにある ---
  const imageHorses = [
    ['グラスワンダー', 'グラスワンダー'], ['モントブルック', 'モントブルック'],
    ['ミルジョージ', 'ミルジョージ'], ['ラブスイーツ', 'ラブスイーツ'],
    ['シーキングザゴールド', 'シーキングザゴールド'], ['タケホープ', 'タケホープ'],
    ['グロースターク', 'グロースターク'], ['サクラクレアー', 'サクラクレアー'],
    ['ダンチヒ', 'ダンチヒ1992'], ['メモリーレーン', 'メモリーレーン'],
  ];
  const idx = {};
  let allFound = true;
  const foundList = [];
  imageHorses.forEach(([label, dbName]) => {
    const i = dbIndex(dbName);
    idx[label] = i;
    foundList.push(label + '=' + (i >= 0 ? db.horses[i].n + '(#' + i + ')' : 'なし'));
    if (i < 0) allFound = false;
  });
  check('M01', '画像の10頭がデータベースにある（ダンチヒは「ダンチヒ1992」）',
    allFound, foundList.join('／'));

  C.plans = [];
  C.ownHorses = [];
  function makePlan(id, name) {
    const p = { id, name, status: '計画' };
    C.ensurePlanGenerations(p);
    return p;
  }
  function genOf(p, i) { return C.planGenerations(p)[i]; }
  function setDbParents(p, gi, s, d) {
    const g = genOf(p, gi);
    g.sireDbIndex = s; g.damDbIndex = d;
    if (s !== null && s !== undefined) g.sireName = C.STALLIONS.horses[s].n;
    if (d !== null && d !== undefined) g.damName = C.STALLIONS.horses[d].n;
  }
  function setOwnParents(p, gi, sireOwn, damOwn) {
    const g = genOf(p, gi);
    if (sireOwn) { g.sireOwnId = sireOwn.id; g.sireDbIndex = null; g.sireName = sireOwn.name; }
    if (damOwn) { g.damOwnId = damOwn.id; g.damDbIndex = null; g.damName = damOwn.name; }
  }
  function regChild(p, gi, name, sex) {
    const g = genOf(p, gi);
    g.childName = name; g.childSex = sex;
    const res = C.registerOwnHorseFromGeneration(p, g, name, sex);
    if (!res.ok) throw new Error('register failed: ' + name + ' ' + res.error);
    return res.horse;
  }

  // --- ルートA：ミルジョージ×ラブスイーツ → モントブルック×A1 → グラスワンダー×A2 ---
  const planA = makePlan('pA', 'ルートA・グラスワンダー系');
  const planB = makePlan('pB', 'ルートB・シーキングザゴールド系');
  const planC = makePlan('pC', 'ルートC・ダンチヒ系');
  const planD = makePlan('pD', 'ルートBC・母系統合');
  const planE = makePlan('pE', '最終配合・統合テスト');
  C.plans = [planA, planB, planC, planD, planE];

  setDbParents(planA, 0, idx['ミルジョージ'], idx['ラブスイーツ']);
  const a1 = regChild(planA, 0, 'テストA1', '牝');
  C.addGenerationToPlan(planA);
  setDbParents(planA, 1, idx['モントブルック'], null);
  genOf(planA, 1).damDbIndex = null; // 母は A1（自家生産馬）のまま
  const a2 = regChild(planA, 1, 'テストA2', '牝');
  C.addGenerationToPlan(planA);
  setDbParents(planA, 2, idx['グラスワンダー'], null);
  genOf(planA, 2).damDbIndex = null; // 母は A2（自家生産馬）のまま
  const a3 = regChild(planA, 2, 'テストA3', '牡');

  // --- ルートB：グロースターク×サクラクレアー → タケホープ×B1 → シーキングザゴールド×B2 ---
  setDbParents(planB, 0, idx['グロースターク'], idx['サクラクレアー']);
  const b1 = regChild(planB, 0, 'テストB1', '牝');
  C.addGenerationToPlan(planB);
  setDbParents(planB, 1, idx['タケホープ'], null);
  genOf(planB, 1).damDbIndex = null; // 母は B1（自家生産馬）のまま
  const b2 = regChild(planB, 1, 'テストB2', '牝');
  C.addGenerationToPlan(planB);
  setDbParents(planB, 2, idx['シーキングザゴールド'], null);
  genOf(planB, 2).damDbIndex = null; // 母は B2（自家生産馬）のまま
  const b3 = regChild(planB, 2, 'テストB3', '牡');

  // --- ルートC：グロースターク×メモリーレーン → ダンチヒ×C1 ---
  setDbParents(planC, 0, idx['グロースターク'], idx['メモリーレーン']);
  const c1 = regChild(planC, 0, 'テストC1', '牝');
  C.addGenerationToPlan(planC);
  setDbParents(planC, 1, idx['ダンチヒ'], null);
  genOf(planC, 1).damDbIndex = null; // 母は C1（自家生産馬）のまま
  const c2 = regChild(planC, 1, 'テストC2', '牝');

  // --- ルートBC：B3 × C2 → D1（最終配合の母） ---
  setOwnParents(planD, 0, b3, c2);
  const d1 = regChild(planD, 0, 'テストD1', '牝');

  // --- 最終配合：A3 × D1（最終の子は登録しない） ---
  setOwnParents(planE, 0, a3, d1);

  // --- M02: 由来が記録される ---
  check('M02', '自分の馬に由来の計画名・世代が記録される（A1＝ルートA第1世代、A3＝ルートA第3世代、D1＝ルートBC第1世代）',
    a1.originPlanName === 'ルートA・グラスワンダー系' && a1.originGenerationNo === 1 &&
    a3.originPlanName === 'ルートA・グラスワンダー系' && a3.originGenerationNo === 3 &&
    b3.originPlanName === 'ルートB・シーキングザゴールド系' && b3.originGenerationNo === 3 &&
    c2.originPlanName === 'ルートC・ダンチヒ系' && c2.originGenerationNo === 2 &&
    d1.originPlanName === 'ルートBC・母系統合' && d1.originGenerationNo === 1,
    JSON.stringify([a1.originPlanName, a1.originGenerationNo, a3.originGenerationNo, b3.originGenerationNo, c2.originGenerationNo, d1.originGenerationNo]));

  // --- M03: 由来の表示（記録あり／旧形式は由来不明） ---
  check('M03', '由来の表示は「計画名」第N世代の子、由来がない旧形式の馬は「由来不明」',
    C.ownHorseOriginLabel(a3) === '「ルートA・グラスワンダー系」第3世代の子' &&
    C.ownHorseOriginLabel(d1) === '「ルートBC・母系統合」第1世代の子' &&
    C.ownHorseOriginLabel({ name: '旧形式の馬' }) === '由来不明' &&
    C.originGenerationOf({ name: '旧形式の馬' }) === null);

  // --- M04: 別の計画の子を親にしているかどうか ---
  check('M04', '最終配合とルートBCは別の計画の子を親にしている（統合図の対象）、ルートAだけの計画は対象外',
    C.planHasCrossRouteAncestry(planE) === true &&
    C.planHasCrossRouteAncestry(planD) === true &&
    C.planHasCrossRouteAncestry(planA) === false &&
    C.planHasCrossRouteAncestry(planB) === false &&
    C.planHasCrossRouteAncestry(planC) === false);

  // --- M05: 統合図のデータ（配合10件＝画像の配合10件、計画5件、馬10頭） ---
  const merged = C.buildMergedRouteDiagram(planE);
  const allMatings = treeMatings(merged.root, []);
  console.log('MERGED LABELS ' + allMatings.map((m) => m.planName + '第' + m.genNo + '世代=' + m.theory.label).join('／'));
  check('M05', '統合図は配合10件・計画5件で、画像の10頭すべてが出る',
    merged !== null && merged.merged === true && merged.matingCount === 10 &&
    merged.planNames.length === 5 &&
    ['グラスワンダー', 'モントブルック', 'ミルジョージ', 'ラブスイーツ',
     'シーキングザゴールド', 'タケホープ', 'グロースターク', 'サクラクレアー',
     'ダンチヒ1992', 'メモリーレーン'].every((nm) => merged.horseNames.indexOf(nm) >= 0),
    'matingCount=' + merged.matingCount + ' plans=' + merged.planNames.join('／') + ' horses=' + merged.horseNames.join('／'));

  // --- M06: 枝の構造（父方＝ルートA、母方＝ルートBC→ルートB／ルートC） ---
  const root = merged.root;
  check('M06', '最終の子の父はルートAの子（A3）、母はルートBCの子（D1）。D1の父はルートBの子（B3＝シーキングザゴールド×B2の子）、母はルートCの子（C2＝ダンチヒ×C1の子）',
    root.childName === '最終配合・統合テストの子' &&
    root.sire.name === 'テストA3' && root.sire.mating && root.sire.mating.planName === 'ルートA・グラスワンダー系' &&
    root.sire.mating.genNo === 3 &&
    root.dam.name === 'テストD1' && root.dam.mating && root.dam.mating.planName === 'ルートBC・母系統合' &&
    root.dam.mating.sire.name === 'テストB3' && root.dam.mating.sire.mating.planName === 'ルートB・シーキングザゴールド系' &&
    root.dam.mating.sire.mating.sire.name === 'シーキングザゴールド' && root.dam.mating.sire.mating.dam.name === 'テストB2' &&
    root.dam.mating.dam.name === 'テストC2' && root.dam.mating.dam.mating.planName === 'ルートC・ダンチヒ系' &&
    root.dam.mating.dam.mating.sire.name === 'ダンチヒ1992' && root.dam.mating.dam.mating.dam.name === 'テストC1',
    JSON.stringify({ sire: root.sire.name, dam: root.dam.name }));

  // --- M07: 各配合の理論ラベルは判定済み（参考・未検証の表示はHTMLで確認） ---
  const allOk = allMatings.every((m) => m.theory.status === 'ok' && typeof m.theory.label === 'string' && m.theory.label.length > 0);
  check('M07', '統合図の10件の配合すべてに配合理論の判定ラベルが付く（画像のラベルとの一致は求めない。判定はDBの血統から行う）',
    allOk, allMatings.map((m) => m.theory.status + ':' + m.theory.label).join('／'));

  // --- M08: 統合図のHTML ---
  const htmlE = C.buildMergedRouteDiagramHtml(planE);
  /* 「由来不明」は説明文の中に1回だけ出る（由来が記録されていない馬の
     扱いの説明）。馬の箱には出ない（全員の由来が分かるため）。 */
  const unknownCount = htmlE.split('由来不明').length - 1;
  check('M08', '統合図のHTMLは「複数ルート統合」で、10頭・5計画・父方／母方の説明・矢印・青／ピンク／子の箱・参考・未検証があり、馬の箱に由来不明はない',
    htmlE.indexOf('<details class="route-diagram" open>') === 0 &&
    htmlE.indexOf('配合ルート図（複数ルート統合）を見る（参考・未検証）') >= 0 &&
    ['グラスワンダー', 'モントブルック', 'ミルジョージ', 'ラブスイーツ',
     'シーキングザゴールド', 'タケホープ', 'グロースターク', 'サクラクレアー',
     'ダンチヒ1992', 'メモリーレーン'].every((nm) => htmlE.indexOf(nm) >= 0) &&
    ['「ルートA・グラスワンダー系」', '「ルートB・シーキングザゴールド系」', '「ルートC・ダンチヒ系」', '「ルートBC・母系統合」'].every((t) => htmlE.indexOf(t) >= 0) &&
    htmlE.indexOf('上の枝が父方のルート、下の枝が母方のルート') >= 0 &&
    htmlE.indexOf('route-sire') >= 0 && htmlE.indexOf('route-dam') >= 0 && htmlE.indexOf('route-child') >= 0 &&
    htmlE.indexOf('←') >= 0 && htmlE.indexOf('（参考・未検証）') >= 0 &&
    unknownCount === 1);

  // --- M09: 由来不明の自分の馬は枝なしで箱だけ ---
  const oldAnc = [];
  for (let i = 0; i < 15; i++) oldAnc.push(['旧馬祖先' + i, '', '', '', '']);
  const oldHorse = { id: 'oOld', name: '旧形式の馬', sex: '牡', sireName: 'テスト父', damName: 'テスト母',
    sireDbIndex: null, damDbIndex: null, sireOwnId: null, damOwnId: null,
    planId: 'pOld', generationId: '', generation: 2, anc: oldAnc, createdAt: '', updatedAt: '' };
  C.ownHorses.push(oldHorse);
  const planU = makePlan('pU', '由来不明テスト');
  setOwnParents(planU, 0, oldHorse, null);
  genOf(planU, 0).damDbIndex = idx['ラブスイーツ'];
  genOf(planU, 0).damName = 'ラブスイーツ';
  const mergedU = C.buildMergedRouteDiagram(planU);
  const htmlU = C.buildRouteDiagramHtml(planU);
  check('M09', '由来不明の自分の馬は枝なしで箱だけ（由来不明と表示）。その計画は今までの1ルートの図のまま',
    mergedU.root.sire.mating === null && mergedU.root.sire.note.indexOf('由来不明') >= 0 &&
    C.planHasCrossRouteAncestry(planU) === false &&
    htmlU.indexOf('複数ルート統合') < 0 && htmlU.indexOf('第1世代（1代前）') >= 0 &&
    htmlU.indexOf('由来不明') >= 0);

  // --- M10: 1ルートの図は壊れない ---
  const htmlA = C.buildRouteDiagramHtml(planA);
  const dA = C.buildRouteDiagram(planA);
  check('M10', 'ルートAだけの計画は今までの1ルートの図のまま（3世代・4列。最終の子→第3世代（1代前）→第2世代（2代前）→第1世代（3代前））',
    dA !== null && dA.generationCount === 3 && dA.columns.length === 4 &&
    htmlA.indexOf('複数ルート統合') < 0 &&
    htmlA.indexOf('第3世代（1代前）') >= 0 && htmlA.indexOf('第1世代（3代前）') >= 0);

  // --- M11: 由来の計画が削除された場合 ---
  C.plans = [planA, planB, planD, planE]; // planC を削除
  const mergedNoC = C.buildMergedRouteDiagram(planE);
  const allNoC = treeMatings(mergedNoC.root, []);
  const c2node = mergedNoC.root.dam.mating.dam;
  const htmlNoC = C.buildMergedRouteDiagramHtml(planE);
  check('M11', '由来の計画（ルートC）が削除されても図は作られ、その枝は箱だけになり「由来の計画が見つかりません」と出て、ほかの枝は残る',
    c2node.mating === null && c2node.note.indexOf('由来の計画が見つかりません') >= 0 &&
    mergedNoC.matingCount === 8 &&
    htmlNoC.indexOf('由来の計画が見つかりません') >= 0 &&
    htmlNoC.indexOf('グラスワンダー') >= 0 && htmlNoC.indexOf('シーキングザゴールド') >= 0);
  C.plans = [planA, planB, planC, planD, planE]; // 戻す

  // --- M12: iPhone向けの表示（横スクロール・縮まない箱） ---
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  check('M12', '統合図は横スクロールでき、箱は縮まない（.merge-tree／.merge-mating／.merge-parents／.merge-branch と min-width: max-content・flex: 0 0 auto がある）',
    css.indexOf('.merge-tree') >= 0 && css.indexOf('.merge-mating') >= 0 &&
    css.indexOf('.merge-parents') >= 0 && css.indexOf('.merge-branch') >= 0 &&
    css.indexOf('.merge-tree { display: flex; align-items: center; min-width: max-content; }') >= 0 &&
    css.indexOf('.merge-tree .route-box { flex: 0 0 auto;') >= 0 &&
    css.indexOf('.route-scroll { overflow-x: auto') >= 0);

  // --- M13: 候補の表示に由来が出る ---
  const list = makeEl();
  C.renderOwnSuggestItem(list, 'sire', a3, { isForm: false });
  const suggestText = list.children.length ? collectText(list.children[0]) : '';
  check('M13', '自分の馬の候補に由来が出る（「ルートA・グラスワンダー系」第3世代の子）',
    suggestText.indexOf('テストA3') >= 0 &&
    suggestText.indexOf('「ルートA・グラスワンダー系」第3世代の子') >= 0,
    suggestText);

  // --- M14: JSONの書き出し・読み込みで由来が残る ---
  C.saveOwnHorses(C.ownHorses);
  const loaded = C.loadOwnHorses();
  const loadedA3 = loaded.find((h) => h.id === a3.id);
  const loadedOld = loaded.find((h) => h.id === 'oOld');
  check('M14', 'JSONの書き出し・読み込みで由来が残る（A3の由来あり、旧形式の馬は由来不明のまま読める）',
    !!loadedA3 && loadedA3.originPlanName === 'ルートA・グラスワンダー系' && loadedA3.originGenerationNo === 3 &&
    !!loadedOld && C.ownHorseOriginLabel(loadedOld) === '由来不明');

  // --- M15: 計画の表示に統合図と世代の一覧の両方が残る ---
  C.plans = [planA, planB, planC, planD, planE];
  C.renderPlans();
  const lis = getEl('plan-list').children;
  const planHtmlE = lis.length === 5 ? collectHtml(lis[4]) : '';
  check('M15', '最終配合の計画カードに統合図と世代の一覧の両方が残る（図が第1世代より前に出る）',
    lis.length === 5 &&
    planHtmlE.indexOf('配合ルート図（複数ルート統合）を見る') >= 0 &&
    planHtmlE.indexOf('第1世代') >= 0 &&
    planHtmlE.indexOf('配合ルート図（複数ルート統合）を見る') < planHtmlE.indexOf('第1世代'));

  // --- M16: 由来のない旧形式の自分の馬を含むJSONも読める ---
  let importOk = false;
  try {
    const data = { version: 2, records: [], plans: [], ownHorses: [oldHorse] };
    const parsed = C.parseImportData(data, [], []);
    importOk = parsed.ownHorses.length === 1 && parsed.ownHorses[0].id === 'oOld';
  } catch (e) { importOk = false; }
  check('M16', '由来のない旧形式の自分の馬を含むJSONも読める（後方互換）', importOk);

  // --- M17: 最終配合は奇跡の配合（ダンチヒの表記違いのクロス） ---
  // 画像の最終配合は「奇跡の配合」。ツールは以前「完璧な配合」と判定していた。
  // 原因：4×3クロスはダンチヒで、父側は「ダンチヒ」（父父母父・4代前）、
  // 母側は「ダンチヒ1992」（母母父・3代前）と表記が違い、完全一致では
  // 拾えなかった。同馬の因名違い・年号違い（しまむら牧場 note：ダンチヒ
  // 瞬走はダンチヒ1992／ダンチヒ覇閃でも代用可。るんば note：同一馬の
  // 因名違いによる全兄弟クロスは奇跡の配合が成立）として正規化して照合
  // するよう修正した。位置の解釈は変えていない（母側3代前は母母父のみ）。
  const finalGen = genOf(planE, 0);
  const finalSire = C.ownHorses.find((h) => h.id === finalGen.sireOwnId);
  const finalDam = C.ownHorses.find((h) => h.id === finalGen.damOwnId);
  const finalTh = C.checkMatingTheories(finalSire, finalDam);
  const finalRows = C.buildChildPedigree(finalSire, finalDam);
  check('M17', '最終配合（A3×D1）は奇跡の配合になる。クロスはダンチヒ：父側「ダンチヒ」（父父母父・4代前）×母側「ダンチヒ1992」（母母父・3代前）。完璧な配合の前提も成立',
    finalTh.miracle.hit === true && finalTh.perfect.hit === true &&
    finalTh.miracle.cross.name === 'ダンチヒ' &&
    finalTh.miracle.cross.sireLabel === '父父母父' && finalTh.miracle.cross.damLabel === '母母父' &&
    finalTh.miracle.cross.sireName === 'ダンチヒ' && finalTh.miracle.cross.damName === 'ダンチヒ1992' &&
    finalRows[4].name === 'ダンチヒ' && finalRows[12].name === 'ダンチヒ1992',
    'miracle=' + finalTh.miracle.hit + ' cross=' + JSON.stringify(finalTh.miracle.cross));

  // --- M18: 名前の正規化（因名・年号の違いを吸収） ---
  check('M18', 'normalizeCrossName は因名・年号の違いを吸収する（ダンチヒ1992／ダンチヒ-瞬走-／ダンチヒ-覇閃- → ダンチヒ。トウショウボーイ1977 → トウショウボーイ。素名はそのまま）',
    C.normalizeCrossName('ダンチヒ1992') === 'ダンチヒ' &&
    C.normalizeCrossName('ダンチヒ-瞬走-') === 'ダンチヒ' &&
    C.normalizeCrossName('ダンチヒ-覇閃-') === 'ダンチヒ' &&
    C.normalizeCrossName('トウショウボーイ1977') === 'トウショウボーイ' &&
    C.normalizeCrossName('ダンチヒ') === 'ダンチヒ' &&
    C.normalizeCrossName('グラスワンダー1999') === 'グラスワンダー');

  // --- M19: 10件すべての判定が画像のラベルと一致する ---
  // 画像のラベル：B1面白い、B2よくできた、B3面白い、C2面白い、BC奇跡、
  // A2面白い、A3面白い、最終奇跡。A1・C1はラベルなし（理論なし）。
  function thOf(p, gi) {
    const g = genOf(p, gi);
    const s = g.sireOwnId ? C.ownHorses.find((h) => h.id === g.sireOwnId) : C.STALLIONS.horses[g.sireDbIndex];
    const d = g.damOwnId ? C.ownHorses.find((h) => h.id === g.damOwnId) : C.STALLIONS.horses[g.damDbIndex];
    return C.checkMatingTheories(s, d);
  }
  function topLabel(th) {
    if (th.miracle.hit) return '奇跡の配合';
    if (th.superPerfect.hit) return '超完璧な配合';
    if (th.perfect.hit) return '完璧な配合';
    if (th.migoto.hit) return '見事な配合';
    if (th.omoshiroi.hit) return '面白い配合';
    if (th.yokudekita.hit) return 'よくできた配合';
    return 'なし';
  }
  const labels = {
    A1: topLabel(thOf(planA, 0)), A2: topLabel(thOf(planA, 1)), A3: topLabel(thOf(planA, 2)),
    B1: topLabel(thOf(planB, 0)), B2: topLabel(thOf(planB, 1)), B3: topLabel(thOf(planB, 2)),
    C1: topLabel(thOf(planC, 0)), C2: topLabel(thOf(planC, 1)),
    BC: topLabel(thOf(planD, 0)), FINAL: topLabel(thOf(planE, 0)),
  };
  check('M19', '画像の配合10件すべての判定ラベルが画像と一致する（A1なし・A2面白い・A3面白い・B1面白い・B2よくできた・B3面白い・C1なし・C2面白い・BC奇跡・最終奇跡）',
    labels.A1 === 'なし' && labels.A2 === '面白い配合' && labels.A3 === '面白い配合' &&
    labels.B1 === '面白い配合' && labels.B2 === 'よくできた配合' && labels.B3 === '面白い配合' &&
    labels.C1 === 'なし' && labels.C2 === '面白い配合' &&
    labels.BC === '奇跡の配合' && labels.FINAL === '奇跡の配合',
    JSON.stringify(labels));

  // --- M20: インブリード表示でも表記違いが同一視される ---
  const finalCrosses = C.findInbreeding(finalSire, finalDam);
  const danchi = finalCrosses.find((c) => c.name === 'ダンチヒ');
  check('M20', '最終配合のインブリードにダンチヒが出る（父父母父4代×母母父3代、表記は「ダンチヒ／ダンチヒ1992」）',
    !!danchi && danchi.pairs.some((pr) => pr.sireLabel === '父父母父' && pr.sireGen === 4 && pr.damLabel === '母母父' && pr.damGen === 3) &&
    Array.isArray(danchi.forms) && danchi.forms.indexOf('ダンチヒ') >= 0 && danchi.forms.indexOf('ダンチヒ1992') >= 0,
    JSON.stringify(danchi));

  // --- M21: 統合図にも画像保存ボタンが出る ---
  check('M21', '複数ルート統合図に画像保存ボタン（data-route-save）が出る',
    htmlE.indexOf('data-route-save') >= 0 && htmlE.indexOf('このルート図を画像で保存') >= 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
