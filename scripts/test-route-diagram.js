'use strict';
/* Nodeハーネス: app.js を vm で読み、配合ルート図（ステップ7）を検証する。
   使い方: node scripts/test-route-diagram.js
   ブラウザのDOM/localStorage/fetch を最小限スタブする。 */
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

function fakeHorse(name, paByIdx, nameByIdx, factorByIdx) {
  const anc = [];
  for (let i = 0; i < 15; i++) {
    anc.push([
      (nameByIdx && nameByIdx[i]) || (name + '祖先' + i),
      (paByIdx && paByIdx[i]) || '',
      '',
      (factorByIdx && factorByIdx[i] && factorByIdx[i][0]) || '',
      (factorByIdx && factorByIdx[i] && factorByIdx[i][1]) || '',
    ]);
  }
  return { n: name, anc };
}
function htmlContains(el, text) {
  if (!el) return false;
  if (typeof el.innerHTML === 'string' && el.innerHTML.indexOf(text) >= 0) return true;
  if (!Array.isArray(el.children)) return false;
  return el.children.some((c) => htmlContains(c, text));
}
function collectHtml(el) {
  let s = '';
  if (el && typeof el.innerHTML === 'string') s += el.innerHTML;
  if (el && Array.isArray(el.children)) el.children.forEach((c) => { s += collectHtml(c); });
  return s;
}

(async () => {
  await sleep(100); // loadData() の fetch 完了を待つ
  const C = sandbox;
  const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stallions.json'), 'utf8'));
  const sire0 = db.horses[0]; // アイアンリージ-巌瓏-
  const dam3 = db.horses[3]; // アイシラヌユエ20XX
  const dam1 = db.horses[1];
  C.plans = [];
  C.ownHorses = [];

  function makeDbPlan(id, name) {
    const p = { id, name, status: '計画', sireName: sire0.n, damName: dam3.n, sireDbIndex: 0, damDbIndex: 3 };
    C.ensurePlanGenerations(p);
    return p;
  }
  function genOf(p, i) { return C.planGenerations(p)[i]; }

  // --- R01: 世代が1つだけの計画でも図が出る ---
  const plan1 = makeDbPlan('pR1', 'テスト配合');
  const d1 = C.buildRouteDiagram(plan1);
  check('R01', '世代が1つだけの計画でも図が出る（最終の子＋第1世代（1代前）の2列。父は種牡馬・母は繁殖牝馬の箱）',
    d1 !== null && d1.generationCount === 1 && d1.columns.length === 2 &&
    d1.columns[0].title === '最終の子' &&
    d1.columns[1].title === '第1世代（1代前）' &&
    d1.columns[0].boxes[0].kind === 'child' && d1.columns[0].boxes[0].name === 'テスト配合の子' &&
    d1.columns[1].boxes[0].kind === 'sire' && d1.columns[1].boxes[0].name === sire0.n &&
    d1.columns[1].boxes[1].kind === 'dam' && d1.columns[1].boxes[1].name === dam3.n &&
    d1.matings.length === 1 && d1.matings[0].status === 'ok',
    JSON.stringify(d1));
  check('R02', '実レコードの組み合わせ（アイアンリージ-巌瓏-×アイシラヌユエ20XX）の図のラベルは「面白い配合」',
    d1.matings[0].label === '面白い配合' && d1.matings[0].hits.indexOf('面白い配合') >= 0 &&
    d1.matings[0].dangerous === false,
    JSON.stringify(d1.matings[0]));

  // --- R03: 図のHTML（折りたたみ・既定は開く・矢印・色分け・参考表記） ---
  const html1 = C.buildRouteDiagramHtml(plan1);
  check('R03', '図のHTMLは折りたたみ（既定は開く）で、矢印・青／ピンク／子の箱・参考・未検証の表記がある',
    html1.indexOf('<details class="route-diagram" open>') === 0 &&
    html1.indexOf('配合ルート図を見る（参考・未検証）') >= 0 &&
    html1.indexOf('route-sire') >= 0 && html1.indexOf('route-dam') >= 0 &&
    html1.indexOf('route-child') >= 0 && html1.indexOf('←') >= 0 &&
    html1.indexOf('面白い配合（参考・未検証）') >= 0 &&
    html1.indexOf('左が最終の子、右へ行くほど前の世代です') >= 0 &&
    html1.indexOf('配合の効果を断定する表示はしません') >= 0);

  // --- R04: 2世代・3世代の連鎖（列の順番と「第N世代の子」の注記） ---
  const plan2 = makeDbPlan('pR2', 'チェーン計画');
  C.addGenerationToPlan(plan2);
  genOf(plan2, 1).damDbIndex = 1;
  genOf(plan2, 1).damName = dam1.n;
  const d2 = C.buildRouteDiagram(plan2);
  check('R04', '2世代の計画は3列（最終の子→第2世代（1代前）→第1世代（2代前））で、第2世代の父には「第1世代の子」と注記される',
    d2 !== null && d2.columns.length === 3 &&
    d2.columns[0].title === '最終の子' &&
    d2.columns[1].title === '第2世代（1代前）' &&
    d2.columns[2].title === '第1世代（2代前）' &&
    d2.finalChildName === 'チェーン計画の子（第2世代）' &&
    d2.columns[1].boxes[0].name === 'チェーン計画の子' &&
    d2.columns[1].boxes[0].note.indexOf('第1世代の子') >= 0,
    JSON.stringify(d2.columns.map((c) => c.title)));
  C.addGenerationToPlan(plan2);
  const d3 = C.buildRouteDiagram(plan2);
  check('R05', '3世代の計画は4列で、列は最終の子→第3世代（1代前）→第2世代（2代前）→第1世代（3代前）の順',
    d3 !== null && d3.columns.length === 4 &&
    d3.columns.map((c) => c.title).join('|') ===
      '最終の子|第3世代（1代前）|第2世代（2代前）|第1世代（3代前）',
    JSON.stringify(d3.columns.map((c) => c.title)));

  // --- R06: 名前だけの計画（親が選ばれていない世代） ---
  const planNameOnly = { id: 'pRN', name: '名前だけ計画', status: '計画' };
  C.ensurePlanGenerations(planNameOnly);
  genOf(planNameOnly, 0).sireName = 'テスト父馬';
  genOf(planNameOnly, 0).damName = 'テスト母馬';
  const dN = C.buildRouteDiagram(planNameOnly);
  const htmlN = C.buildRouteDiagramHtml(planNameOnly);
  check('R06', '名前だけの計画でも図が出る（箱は名前だけの入力、ラベルは配合理論の確認方法の案内）',
    dN !== null && dN.columns.length === 2 &&
    dN.columns[1].boxes[0].kind === 'name-only' &&
    dN.columns[1].boxes[1].kind === 'name-only' &&
    dN.matings[0].status === 'no-ref' &&
    htmlN.indexOf('父・母をDBまたは自家生産馬から選ぶと配合理論を確認できます') >= 0);

  // --- R07: 壊れた世代（途中で親が見つからない場合） ---
  const planC = makeDbPlan('pRC', '中間削除テスト');
  C.addGenerationToPlan(planC);
  genOf(planC, 1).damDbIndex = 1;
  genOf(planC, 1).damName = dam1.n;
  C.registerOwnHorseFromGeneration(planC, genOf(planC, 1), '中間の孫', '牡');
  C.addGenerationToPlan(planC);
  C.deleteGenerationFromPlan(planC, genOf(planC, 1).id);
  const dC = C.buildRouteDiagram(planC);
  const htmlC = C.buildRouteDiagramHtml(planC);
  check('R07', '途中で親が見つからない世代は、図に「親が見つかりません」と出て、計画自体は残る',
    dC !== null && dC.generationCount === 2 &&
    dC.matings[1].status === 'missing' &&
    dC.columns[1].boxes[0].kind === 'missing' &&
    htmlC.indexOf('親が見つかりません') >= 0 &&
    htmlC.indexOf('計画自体は残っています') >= 0);

  // --- R08: 配合理論なし（どの理論にも当てはまらない組み合わせ） ---
  const realStallions = C.STALLIONS;
  C.STALLIONS = { horses: [fakeHorse('父テスト馬', {}), fakeHorse('母テスト馬', {})], ancestors: [] };
  const lblNone = C.routeTheoryLabel(C.STALLIONS.horses[0], C.STALLIONS.horses[1]);
  const planNone = { id: 'pRNone', name: '理論なし計画', status: '計画', sireName: '父テスト馬', damName: '母テスト馬', sireDbIndex: 0, damDbIndex: 1 };
  C.ensurePlanGenerations(planNone);
  const htmlNone = C.buildRouteDiagramHtml(planNone);
  check('R08', 'どの配合理論にも当てはまらない組み合わせは、図のラベルが「配合理論なし」',
    lblNone !== null && lblNone.label === '配合理論なし' && lblNone.hits.length === 0 &&
    lblNone.dangerous === false &&
    htmlNone.indexOf('配合理論なし（参考・未検証）') >= 0);
  // --- R09: 危険な配合だけの組み合わせ ---
  C.STALLIONS = { horses: [fakeHorse('父テスト馬', {}), fakeHorse('母テスト馬', {}, { 0: '父テスト馬' })], ancestors: [] };
  const lblDanger = C.routeTheoryLabel(C.STALLIONS.horses[0], C.STALLIONS.horses[1]);
  const planDanger = { id: 'pRD', name: '危険計画', status: '計画', sireName: '父テスト馬', damName: '母テスト馬', sireDbIndex: 0, damDbIndex: 1 };
  C.ensurePlanGenerations(planDanger);
  const htmlDanger = C.buildRouteDiagramHtml(planDanger);
  check('R09', '危険な配合だけの組み合わせは、ラベルが「配合理論なし」で危険な配合の注記が付く',
    lblDanger !== null && lblDanger.label === '配合理論なし' && lblDanger.dangerous === true &&
    htmlDanger.indexOf('危険な配合の条件に当てはまるように見えます（参考）') >= 0);
  // --- R10: 奇跡の配合が一番上のラベルになる ---
  const sireMiracle = fakeHorse('父テスト馬', { 0: 'A', 4: 'P', 5: 'B', 7: 'Q', 8: 'C', 11: 'R', 12: 'D', 14: 'S' }, { 2: '奇跡クロス馬' });
  const damMiracle = fakeHorse('母テスト馬', { 0: 'S', 5: 'R', 8: 'Q', 12: 'P' }, { 8: '奇跡クロス馬' });
  C.STALLIONS = { horses: [sireMiracle, damMiracle], ancestors: [] };
  const lblMiracle = C.routeTheoryLabel(sireMiracle, damMiracle);
  check('R10', '奇跡の配合が成立する組み合わせは、図のラベルが「奇跡の配合」（完璧・見事・面白いより上）',
    lblMiracle !== null && lblMiracle.label === '奇跡の配合' &&
    lblMiracle.hits.indexOf('完璧な配合') >= 0 && lblMiracle.hits.indexOf('面白い配合') >= 0);
  C.STALLIONS = realStallions;

  // --- R11: 旧形式の計画（世代の列なし）でも図が出る ---
  const oldPlan = { id: 'pROld', name: '旧計画', status: '計画', sireName: sire0.n, damName: dam3.n, sireDbIndex: 0, damDbIndex: 3 };
  const dOld = C.buildRouteDiagram(oldPlan);
  check('R11', '旧形式の計画（世代の列なし）は第1世代1つとして図が出る',
    dOld !== null && dOld.generationCount === 1 && dOld.columns.length === 2 &&
    dOld.matings[0].label === '面白い配合');

  // --- R12: 計画の表示に図と一覧の両方が残る（図が世代の一覧より前に出る） ---
  C.plans = [plan1];
  C.renderPlans();
  const lis = getEl('plan-list').children;
  const planHtml = lis.length ? collectHtml(lis[0]) : '';
  check('R12', '計画の表示に配合ルート図と世代の一覧の両方が残る（図が第1世代より前に出る）',
    lis.length === 1 &&
    htmlContains(lis[0], '配合ルート図を見る') &&
    htmlContains(lis[0], '第1世代') &&
    htmlContains(lis[0], '子の血統・配合理論を見る') &&
    planHtml.indexOf('配合ルート図を見る') >= 0 &&
    planHtml.indexOf('配合ルート図を見る') < planHtml.indexOf('第1世代'));

  // --- R13: iPhone向けの表示（横スクロール・色分けのCSSと画面の説明） ---
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('R13', '図は横スクロールでき、種牡馬は青系・繁殖牝馬はピンク系のCSSがあり、画面に図の説明がある',
    css.indexOf('.route-scroll') >= 0 && css.indexOf('overflow-x: auto') >= 0 &&
    css.indexOf('.route-sire') >= 0 && css.indexOf('.route-dam') >= 0 &&
    indexHtml.indexOf('配合ルート図を見る') >= 0 &&
    indexHtml.indexOf('横にスクロールできる') >= 0);

  // --- R14: ルート図の画像保存ボタン ---
  check('R14', 'ルート図に画像保存ボタン（data-route-save）が出て、保存関数がある',
    html1.indexOf('data-route-save') >= 0 && html1.indexOf('このルート図を画像で保存') >= 0 &&
    typeof C.saveRouteDiagramImage === 'function' && typeof C.buildRouteDiagramCanvas === 'function');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
