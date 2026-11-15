'use strict';
/* Nodeハーネス: app.js を vm で読み、「目標から探す」機能を検証する。
   モード1: おすすめの相手に目標の理論での絞り込みを追加したもの。
   モード2: 馬を固定せず、目標の理論が成立するペアを探すもの。
   使い方: node scripts/test-goal-search.js
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

(async () => {
  await sleep(300); // loadData() の fetch 完了を待つ
  const C = sandbox;
  const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stallions.json'), 'utf8'));
  const H = C.STALLIONS.horses;
  const idxGilded = db.horses.findIndex((h) => h.n === 'ギルデッドタイム1992');
  const idxSakura = db.horses.findIndex((h) => h.n === 'サクラクレアー');
  const gilded = H[idxGilded];
  const sakura = H[idxSakura];
  C.ownHorses = [];

  // --- 目標の理論リスト ---
  check('G01', '目標の理論は7つ（至高・奇跡・超完璧・完璧・見事・面白い・よくできた）',
    C.THEORY_GOALS.length === 7 &&
    C.THEORY_GOALS.map((g) => g.key).join(',') === 'supreme,miracle,superPerfect,perfect,migoto,omoshiroi,yokudekita' &&
    C.theoryGoalLabel('miracle') === '奇跡の配合' &&
    C.theoryHitForKey(C.checkMatingTheories(gilded, sakura), 'omoshiroi') ===
      C.checkMatingTheories(gilded, sakura).omoshiroi.hit);

  // --- モード2: 奇跡の配合（DB同士で9件・実測と一致） ---
  let t0 = Date.now();
  const pairsMiracle = C.findTheoryPairs('miracle');
  console.log(`  (奇跡の探索: ${Date.now() - t0}ms)`);
  check('G02', 'モード2・奇跡の配合は9件見つかり、全件表示される',
    pairsMiracle.total === 9 && pairsMiracle.items.length === 9,
    `total=${pairsMiracle.total} items=${pairsMiracle.items.length}`);
  check('G03', '奇跡のペアは再判定でも全件奇跡の配合になり、既知の成立例を含む',
    pairsMiracle.items.every((it) =>
      C.checkMatingTheories(H[it.sire.dbIndex], H[it.dam.dbIndex]).miracle.hit) &&
    pairsMiracle.items.some((it) =>
      it.sire.name === 'ザミンストレル-天煌-' && it.dam.name === 'ウィルサマーズ-瞬発-'));
  check('G04', '同じ目標では結果を使い回す（キャッシュ）',
    C.findTheoryPairs('miracle') === pairsMiracle);

  // --- モード2: 至高の配合（DB同士では0件） ---
  t0 = Date.now();
  const pairsSupreme = C.findTheoryPairs('supreme');
  console.log(`  (至高の探索: ${Date.now() - t0}ms)`);
  check('G05', 'モード2・至高の配合はDB同士では0件',
    pairsSupreme.total === 0 && pairsSupreme.items.length === 0,
    `total=${pairsSupreme.total}`);
  const htmlSupreme = C.theoryPairsHtml(pairsSupreme);
  check('G06', '至高0件の表示に「見つかりませんでした」と参考・未検証が出る',
    htmlSupreme.includes('「至高の配合」が成立するペアは見つかりませんでした') &&
    htmlSupreme.includes('参考・未検証'));

  // --- モード2: 見事・完璧・超完璧（実測件数と一致、上位20件で打ち切り） ---
  const pairsMigoto = C.findTheoryPairs('migoto');
  const pairsPerfect = C.findTheoryPairs('perfect');
  const pairsSuper = C.findTheoryPairs('superPerfect');
  check('G07', 'モード2・見事7481件／完璧1962件／超完璧315件（実測と一致）',
    pairsMigoto.total === 7481 && pairsPerfect.total === 1962 && pairsSuper.total === 315,
    `migoto=${pairsMigoto.total} perfect=${pairsPerfect.total} super=${pairsSuper.total}`);
  check('G08', '見事・完璧・超完璧の表示は上位20件に打ち切られ、再判定と一致する',
    pairsMigoto.items.length === 20 && pairsPerfect.items.length === 20 && pairsSuper.items.length === 20 &&
    pairsMigoto.items.every((it) => C.checkMatingTheories(H[it.sire.dbIndex], H[it.dam.dbIndex]).migoto.hit) &&
    pairsPerfect.items.every((it) => C.checkMatingTheories(H[it.sire.dbIndex], H[it.dam.dbIndex]).perfect.hit) &&
    pairsSuper.items.every((it) => C.checkMatingTheories(H[it.sire.dbIndex], H[it.dam.dbIndex]).superPerfect.hit));

  // --- モード2: 面白い・よくできた（全ペア走査・実測件数と一致） ---
  t0 = Date.now();
  const pairsOmoshiroi = C.findTheoryPairs('omoshiroi');
  console.log(`  (面白いの探索: ${Date.now() - t0}ms)`);
  t0 = Date.now();
  const pairsYoku = C.findTheoryPairs('yokudekita');
  console.log(`  (よくできたの探索: ${Date.now() - t0}ms)`);
  check('G09', 'モード2・面白い2711316件／よくできた188397件（実測と一致）',
    pairsOmoshiroi.total === 2711316 && pairsYoku.total === 188397,
    `omoshiroi=${pairsOmoshiroi.total} yoku=${pairsYoku.total}`);
  check('G10', '面白い・よくできたの表示は上位20件に打ち切られ、再判定と一致する',
    pairsOmoshiroi.items.length === 20 && pairsYoku.items.length === 20 &&
    pairsOmoshiroi.items.every((it) => C.checkMatingTheories(H[it.sire.dbIndex], H[it.dam.dbIndex]).omoshiroi.hit) &&
    pairsYoku.items.every((it) => C.checkMatingTheories(H[it.sire.dbIndex], H[it.dam.dbIndex]).yokudekita.hit));
  const htmlOmoshiroi = C.theoryPairsHtml(pairsOmoshiroi);
  check('G11', 'ペア一覧の表示に総件数・上位20件のみ表示・父×母・出所・根拠・セット用ボタンが出る',
    htmlOmoshiroi.includes('「面白い配合」が成立するペア（参考・未検証）') &&
    htmlOmoshiroi.includes('ペアが2711316件見つかりました') &&
    htmlOmoshiroi.includes('上位20件のみ表示') &&
    htmlOmoshiroi.includes('data-goal-pair="0"') &&
    htmlOmoshiroi.includes('父：') && htmlOmoshiroi.includes('母：') &&
    htmlOmoshiroi.includes('データベース') &&
    htmlOmoshiroi.includes(pairsOmoshiroi.items[0].reasons[0].label));

  // --- モード2: ペアを計画フォームにセット（保存はしない） ---
  const pair0 = pairsMiracle.items[0];
  C.setGoalPairToPlanForm(pair0);
  check('G12', 'ペアをタップすると計画フォームの父・母にセットされる（保存はされない）',
    C.selectedDb.sire === pair0.sire.dbIndex && C.selectedDb.dam === pair0.dam.dbIndex &&
    getEl('p-sire').value === pair0.sire.name && getEl('p-dam').value === pair0.dam.name &&
    getEl('goal-msg').textContent.includes('セットしました') &&
    getEl('goal-msg').textContent.includes('まだ保存していません'));
  C.selectedDb.sire = null; C.selectedDb.dam = null;

  // --- モード1: 目標なしは従来通り、目標ありはその理論だけ ---
  const recosAll = C.findPartnerRecommendations(gilded, 'sire', 'db:' + idxGilded);
  const recosMiracleG = C.findPartnerRecommendations(gilded, 'sire', 'db:' + idxGilded, null, 'miracle');
  check('G13', 'モード1・ギルデッドタイム1992を父に固定：目標なしは従来通り、奇跡の相手は0件',
    recosAll.total > 0 && recosMiracleG.total === 0 && recosMiracleG.targetLabel === '奇跡の配合',
    `all=${recosAll.total} miracle=${recosMiracleG.total}`);

  // --- モード1: 自家生産馬「テストの子」を母に固定＋目標・奇跡 ---
  // ギルデッドタイム1992×サクラクレアーの子を自家生産馬として用意する
  // （SPACE版の実データにある「テストの子」と同じ血統）。
  const childAnc = C.buildChildAnc(gilded, sakura);
  const fakeChild = {
    id: 'o-test-child', name: 'テストの子', sex: '牝', generation: 2,
    sireName: 'ギルデッドタイム1992', damName: 'サクラクレアー', anc: childAnc,
  };
  C.ownHorses = [fakeChild];
  const childPed = C.ownHorsePedigree(fakeChild);
  const recosChild = C.findPartnerRecommendations(childPed, 'dam', 'own:o-test-child', null, 'miracle');
  const recoNames = recosChild.items.map((it) => it.name);
  check('G14', 'モード1・テストの子を母に固定＋目標＝奇跡で、父候補にオルフェーヴルとドリームジャーニーが出る',
    recosChild.total >= 2 &&
    recoNames.some((n) => n === 'オルフェーヴル') &&
    recoNames.some((n) => n.indexOf('ドリームジャーニー') === 0),
    `total=${recosChild.total} names=${recoNames.join('/')}`);
  check('G15', 'モード1・目標＝奇跡の候補は再判定でも全件奇跡の配合になる',
    recosChild.items.every((it) => {
      const cand = it.kind === 'db' ? H[it.dbIndex] : C.ownHorsePedigree(C.findOwnHorse(it.ownId));
      return C.checkMatingTheories(cand, childPed).miracle.hit;
    }));
  const htmlChild = C.partnerRecommendationsHtml(recosChild, 'sire');
  check('G16', 'モード1・目標指定時のおすすめ表示に「『奇跡の配合』が付く相手が○件」と目標の選択欄が出る',
    htmlChild.includes('「奇跡の配合」が付く相手が' + recosChild.total + '件見つかりました') &&
    htmlChild.includes('data-reco-target') &&
    htmlChild.includes('おすすめの父馬（参考・未検証）'));

  // --- モード2: 自家生産馬を含むペア（テストの子を母にした奇跡ペア） ---
  const pairsMiracleOwn = C.findTheoryPairs('miracle');
  check('G17', 'モード2・自家生産馬を含むと奇跡ペアが増え、テストの子×オルフェーヴルのペアが含まれる',
    pairsMiracleOwn.total > pairsMiracle.total &&
    pairsMiracleOwn.items.some((it) =>
      it.dam.kind === 'own' && it.dam.ownId === 'o-test-child' && it.sire.name === 'オルフェーヴル'),
    `total=${pairsMiracleOwn.total} (DB同士は${pairsMiracle.total})`);
  C.ownHorses = [];

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
