'use strict';
/* Nodeハーネス: app.js を vm で読み、1つの計画での多世代の配合
   （ステップ5）を検証する。使い方: node scripts/test-generations.js
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
    /* ブラウザと同じく、innerHTML='' は子要素も消す。 */
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
function hasButtonText(el, text) {
  if (!el || !Array.isArray(el.children)) return false;
  return el.children.some((c) => c.textContent === text || hasButtonText(c, text));
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
  function validGen(id, overrides) {
    const g = {
      id, childName: 'テストの子', childSex: '不明',
      sireName: sire0.n, damName: dam3.n, sireHorseId: null, damHorseId: null,
      sireDbIndex: 0, damDbIndex: 3, sireOwnId: null, damOwnId: null, childOwnId: null,
    };
    return Object.assign(g, overrides || {});
  }

  // --- N: 旧形式の計画（世代の列なし） ---
  const oldPlan = { id: 'pOld', name: '旧計画', status: '計画', sireName: sire0.n, damName: dam3.n, sireDbIndex: 0, damDbIndex: 3 };
  check('N01', '旧形式の計画は第1世代1つとして読める（父・母の指定がそのまま残る）',
    (() => {
      const gens = C.planGenerations(oldPlan);
      return gens.length === 1 && gens[0].sireDbIndex === 0 && gens[0].damDbIndex === 3 &&
        gens[0].sireName === sire0.n && gens[0].damName === dam3.n &&
        gens[0].childName === '旧計画の子' && gens[0].childSex === '不明';
    })());
  const childAnc = C.buildChildAnc(sire0, dam3);
  C.ownHorses.push({
    id: 'o-legacy', name: '旧計画の子', sex: '牝', sireName: sire0.n, damName: dam3.n,
    sireDbIndex: 0, damDbIndex: 3, sireOwnId: null, damOwnId: null, planId: 'pOld',
    generation: 2, anc: childAnc, createdAt: '', updatedAt: '',
  });
  check('N02', '旧形式で登録済みの子は第1世代の子として結び付く（planId で照合）',
    C.planGenerations(oldPlan)[0].childOwnId === 'o-legacy');
  C.ownHorses = C.ownHorses.filter((h) => h.id !== 'o-legacy');
  check('N03', 'validPlan は不正な世代の列を拒否する（空・性別・DB番号・ID重複）',
    C.validPlan({ id: 'px', name: 'x', status: '計画', generations: [] }) === false &&
    C.validPlan({ id: 'px', name: 'x', status: '計画', generations: [validGen('g1', { childSex: 'セン' })] }) === false &&
    C.validPlan({ id: 'px', name: 'x', status: '計画', generations: [validGen('g1', { sireDbIndex: -1 })] }) === false &&
    C.validPlan({ id: 'px', name: 'x', status: '計画', generations: [validGen('g1'), validGen('g1')] }) === false &&
    C.validPlan({ id: 'px', name: 'x', status: '計画', generations: [validGen('g1')] }) === true &&
    C.validGeneration(validGen('g1')) === true &&
    C.validGeneration(validGen('', {})) === false &&
    C.validGeneration(validGen('g1', { childName: 123 })) === false);

  // --- N: 次の世代を追加（自動登録） ---
  const planA = makeDbPlan('pA', 'テスト配合');
  const beforeA = C.ownHorses.length;
  const addA = C.addGenerationToPlan(planA);
  check('N04', '次の世代を追加すると、前の世代の子が自動で自分の馬として登録され、第2世代の父になる（性別不明→父）',
    addA.ok === true && C.planGenerations(planA).length === 2 &&
    C.ownHorses.length === beforeA + 1 &&
    genOf(planA, 0).childOwnId !== null &&
    C.findOwnHorse(genOf(planA, 0).childOwnId).name === 'テスト配合の子' &&
    C.findOwnHorse(genOf(planA, 0).childOwnId).sex === '不明' &&
    genOf(planA, 1).sireOwnId === genOf(planA, 0).childOwnId &&
    genOf(planA, 1).sireName === 'テスト配合の子' &&
    genOf(planA, 1).childName === 'テスト配合の子（第2世代）',
    JSON.stringify(addA));
  const planF = makeDbPlan('pF', '牝テスト');
  genOf(planF, 0).childSex = '牝';
  genOf(planF, 0).childName = '牝の子';
  const addF = C.addGenerationToPlan(planF);
  check('N05', '子の性別が牝なら、次の世代の母になる',
    addF.ok === true &&
    C.findOwnHorse(genOf(planF, 0).childOwnId).sex === '牝' &&
    genOf(planF, 1).damOwnId === genOf(planF, 0).childOwnId &&
    genOf(planF, 1).damName === '牝の子' &&
    genOf(planF, 1).sireOwnId === null);
  const planX = { id: 'pX', name: '名前だけ計画', status: '計画' };
  C.ensurePlanGenerations(planX);
  const beforeX = C.ownHorses.length;
  const addX = C.addGenerationToPlan(planX);
  check('N06', '父・母が決まっていない世代には次の世代を追加できない（世代は増えない・自分の馬も増えない）',
    addX.ok === false && C.planGenerations(planX).length === 1 && C.ownHorses.length === beforeX,
    JSON.stringify(addX));
  const planR = makeDbPlan('pR', '再利用テスト');
  const regR = C.registerOwnHorseFromGeneration(planR, genOf(planR, 0), '再利用の子', '牡');
  const beforeR = C.ownHorses.length;
  const addR = C.addGenerationToPlan(planR);
  check('N07', '子がすでに登録済みなら、次の世代の追加で二重登録しない（同じ馬を使い回す）',
    regR.ok === true && addR.ok === true && C.ownHorses.length === beforeR &&
    genOf(planR, 1).sireOwnId === regR.horse.id);

  // --- N: 第2世代の子と血統の連鎖 ---
  const planH = makeDbPlan('pH', 'チェーン計画');
  C.addGenerationToPlan(planH);
  genOf(planH, 1).damDbIndex = 1;
  genOf(planH, 1).damName = dam1.n;
  const regH = C.registerOwnHorseFromGeneration(planH, genOf(planH, 1), '三代目の子', '牡');
  const pairH = C.resolveGenerationParents(genOf(planH, 1));
  const rowsH = pairH ? C.buildChildPedigree(pairH.sire, pairH.dam) : null;
  check('N08', '第2世代の子を名前・性別つきで登録できる（3代目）。血統は第1世代の子を父として連鎖する',
    regH.ok === true && regH.horse.name === '三代目の子' && regH.horse.sex === '牡' &&
    regH.horse.generation === 3 && genOf(planH, 1).childOwnId === regH.horse.id &&
    rowsH !== null && rowsH[0].name === 'チェーン計画の子' &&
    rowsH[1].name === 'アイアンリージ-巌瓏-' && rowsH[5].name === 'トーホウエンペラー',
    regH.ok ? JSON.stringify(rowsH.map((r) => r.name)) : JSON.stringify(regH));
  check('N09', '第2世代の両親（自家生産馬＋DB）が解決でき、配合理論の判定対象になる。名前だけの世代は対象外',
    C.generationHasPedigreePair(genOf(planH, 1)) === true &&
    C.resolveGenerationParents(genOf(planH, 1)) !== null &&
    C.generationHasPedigreePair(genOf(planX, 0)) === false &&
    C.generationHasAnyParentRef(genOf(planX, 0)) === false);

  // --- N: 世代の削除 ---
  const planD = makeDbPlan('pD', '末尾削除テスト');
  C.addGenerationToPlan(planD);
  const beforeD = C.ownHorses.length;
  const delD = C.deleteGenerationFromPlan(planD, genOf(planD, 1).id);
  check('N10', '最後の世代を削除できる（計画は残り、第1世代はそのまま。子の未登録の世代は自分の馬を減らさない）',
    delD.ok === true && delD.dependents.length === 0 && delD.childDeleted === false &&
    C.planGenerations(planD).length === 1 && C.ownHorses.length === beforeD &&
    genOf(planD, 0).sireDbIndex === 0);
  const planC = makeDbPlan('pC', '中間削除テスト');
  C.addGenerationToPlan(planC);
  genOf(planC, 1).damDbIndex = 1;
  genOf(planC, 1).damName = dam1.n;
  C.registerOwnHorseFromGeneration(planC, genOf(planC, 1), '中間の孫', '牡');
  C.addGenerationToPlan(planC);
  const midChildId = genOf(planC, 1).childOwnId;
  const delC = C.deleteGenerationFromPlan(planC, genOf(planC, 1).id);
  check('N11', '中間の世代を削除すると、後の世代が壊れる（依存先が分かり、子の馬も削除され、計画自体は残る）',
    delC.ok === true && JSON.stringify(delC.dependents) === JSON.stringify([3]) &&
    delC.childDeleted === true && C.findOwnHorse(midChildId) === null &&
    C.planGenerations(planC).length === 2 &&
    C.resolveGenerationParents(genOf(planC, 1)) === null &&
    C.generationHasPedigreePair(genOf(planC, 1)) === false,
    JSON.stringify(delC));
  const planA2 = makeDbPlan('pA2', '他計画テスト');
  C.addGenerationToPlan(planA2);
  const c1 = genOf(planA2, 0).childOwnId;
  const planB = {
    id: 'pB', name: '別計画', status: '計画',
    sireName: 'テスト配合の子', damName: dam3.n,
    sireDbIndex: null, damDbIndex: 3, sireOwnId: c1, damOwnId: null,
  };
  C.ensurePlanGenerations(planB);
  C.plans = [planA2, planB];
  const delA2 = C.deleteGenerationFromPlan(planA2, genOf(planA2, 0).id);
  check('N12', '削除する世代の子がほかの計画の親に使われている場合、その馬は残す（ほかの計画は壊さない）',
    delA2.ok === true && JSON.stringify(delA2.dependents) === JSON.stringify([2]) &&
    delA2.childDeleted === false && C.findOwnHorse(c1) !== null &&
    C.resolveGenerationParents(genOf(planB, 0)) !== null &&
    C.planGenerations(planA2).length === 1);
  const planS = makeDbPlan('pS', '1世代だけ');
  const delS = C.deleteGenerationFromPlan(planS, genOf(planS, 0).id);
  check('N13', '世代が1つだけの計画では、その世代は削除できない（計画が残る）',
    delS.ok === false && C.planGenerations(planS).length === 1);
  const planT = makeDbPlan('pT', '先頭削除テスト');
  C.addGenerationToPlan(planT);
  const gen2SireName = genOf(planT, 1).sireName;
  const delT = C.deleteGenerationFromPlan(planT, genOf(planT, 0).id);
  check('N14', '第1世代を削除すると第2世代が新しい第1世代になり、計画の欄もそれに合う',
    delT.ok === true && C.planGenerations(planT).length === 1 &&
    planT.sireName === gen2SireName && planT.sireOwnId === genOf(planT, 0).sireOwnId);

  // --- N: JSON version 2 と旧形式の読み込み ---
  C.plans = [planA];
  const exported = C.buildExportData();
  check('N15', 'JSON書き出しは version 2。version 2 の世代つきJSONと、version 1 の旧形式JSONの両方を読める',
    exported.version === 2 &&
    (() => {
      const v2 = C.parseImportData(
        { version: 2, records: [], plans: [planA], ownHorses: [] }, [], []);
      const v1 = C.parseImportData(
        { version: 1, records: [], plans: [oldPlan] }, [], []);
      return v2.plans.length === 1 && C.planGenerations(v2.plans[0]).length === 2 &&
        v1.plans.length === 1 && C.planGenerations(v1.plans[0]).length === 1;
    })());
  check('N16', 'parseImportData は不正な世代の列を拒否する（性別・ID重複）',
    (() => {
      let badSex = false, dup = false;
      try {
        C.parseImportData({ version: 2, records: [], plans: [{ id: 'pz', name: 'z', status: '計画', generations: [validGen('g1', { childSex: 'セン' })] }] }, [], []);
      } catch (e) { badSex = true; }
      try {
        C.parseImportData({ version: 2, records: [], plans: [{ id: 'pz', name: 'z', status: '計画', generations: [validGen('g1'), validGen('g1')] }] }, [], []);
      } catch (e) { dup = true; }
      return badSex && dup;
    })());
  const validOwn = {
    id: 'o-v', name: '検証馬', sex: '牡', sireName: 'テスト父馬', damName: 'テスト母馬',
    sireDbIndex: null, damDbIndex: null, sireOwnId: null, damOwnId: null, planId: '',
    generation: 2, anc: childAnc, createdAt: '', updatedAt: '',
  };
  check('N17', 'loadPlans・loadOwnHorses は version 1 の保存も読める（後方互換）',
    (() => {
      store[C.LS_PLANS_KEY] = JSON.stringify({ version: 1, plans: [oldPlan] });
      const p = C.loadPlans();
      store[C.LS_OWN_KEY] = JSON.stringify({ version: 1, ownHorses: [validOwn] });
      const o = C.loadOwnHorses();
      C.savePlans(C.plans);
      C.saveOwnHorses(C.ownHorses);
      return p.length === 1 && p[0].id === 'pOld' && o.length === 1 && o[0].id === 'o-v';
    })());
  check('N18', 'savePlans は version 2 で保存する',
    (() => {
      C.savePlans(C.plans);
      const data = JSON.parse(store[C.LS_PLANS_KEY]);
      return data.version === C.DATA_VERSION && data.version === 2;
    })());

  // --- N: 世代ごとの子の名前・性別、候補選択、同期 ---
  const planE = makeDbPlan('pE', '孫の名前テスト');
  C.addGenerationToPlan(planE);
  genOf(planE, 1).damDbIndex = 1;
  genOf(planE, 1).damName = dam1.n;
  const regE = C.registerOwnHorseFromGeneration(planE, genOf(planE, 1), '孫の子', '牡');
  check('N19', '第2世代の子を名前・性別つきで登録できる（3代目として自分の馬になる）',
    regE.ok === true && regE.horse.name === '孫の子' && regE.horse.sex === '牡' &&
    regE.horse.generation === 3 && genOf(planE, 1).childOwnId === regE.horse.id);
  C.plans = [planA];
  C.renderPlans();
  const planLis = getEl('plan-list').children;
  const planHtml = planLis.length ? collectHtml(planLis[0]) : '';
  check('N20', '計画の表示は第1世代→第2世代の順で、「次の世代を追加」「第2世代を削除」が出て、子の使い道も表示される',
    planLis.length === 1 &&
    planHtml.indexOf('第1世代') >= 0 && planHtml.indexOf('第2世代') >= 0 &&
    planHtml.indexOf('第1世代') < planHtml.indexOf('第2世代') &&
    hasButtonText(planLis[0], '次の世代を追加') &&
    hasButtonText(planLis[0], '第2世代を削除') &&
    htmlContains(planLis[0], '第2世代の父として使われています') &&
    htmlContains(planLis[0], '子の血統・配合理論を見る'),
    'html=' + planHtml.slice(0, 200));
  C.plans = [planC];
  C.renderPlans();
  const brokenLis = getEl('plan-list').children;
  check('N21', '壊れた世代は「見つかりません」と表示され、計画自体は残る',
    brokenLis.length === 1 && htmlContains(brokenLis[0], '見つかりません') &&
    htmlContains(brokenLis[0], '中間削除テスト') &&
    !htmlContains(brokenLis[0], '第3世代の血統') &&
    collectHtml(brokenLis[0]).indexOf('第1世代') < collectHtml(brokenLis[0]).indexOf('第2世代'));
  const htmlReal = C.buildChildPedigreeHtml(sire0, dam3);
  check('N22', '配合理論は面白い／見事な／よくできたに加え、完璧／超完璧／奇跡／危険も表示される',
    htmlReal.includes('面白い配合') && htmlReal.includes('見事な配合') &&
    htmlReal.includes('よくできた配合') && htmlReal.includes('完璧な配合') &&
    htmlReal.includes('超完璧な配合') && htmlReal.includes('奇跡の配合') &&
    htmlReal.includes('危険な配合') && htmlReal.includes('参考・未検証'));
  const planI = makeDbPlan('pI', '候補テスト');
  C.plans = [planI];
  const genI = genOf(planI, 0);
  const elsI = {
    name: getEl('tg-sire'), status: getEl('tg-sire-db'), list: getEl('tg-sire-suggest'),
    chi: getEl('tg-sire-chi'), factor: getEl('tg-sire-factor'),
    hibon: getEl('tg-sire-hibon'), talent: getEl('tg-sire-talent'),
  };
  const ctxI = C.suggestCtxFromEls(elsI, C.generationSuggestStore(planI, genI), 'sire');
  C.ownHorses.push(Object.assign({}, validOwn, { id: 'o-male', name: '牡の自家生産馬' }));
  C.ownHorses.push(Object.assign({}, validOwn, { id: 'o-female', name: '牝の自家生産馬', sex: '牝' }));
  C.chooseSuggestionOf(ctxI, 0);
  const afterDb = genI.sireDbIndex === 0 && getEl('tg-sire').value === sire0.n;
  C.chooseOwnSuggestionOf(ctxI, 'o-male');
  const afterOwn = genI.sireOwnId === 'o-male' && genI.sireDbIndex === null;
  C.chooseOwnSuggestionOf(ctxI, 'o-female');
  check('N23', '世代の欄からDB・自家生産馬を選べる（性別に合わない役割には選べない）',
    afterDb && afterOwn && genI.sireOwnId === 'o-male' &&
    getEl('tg-sire').value === '牡の自家生産馬');
  const planJ = makeDbPlan('pJ', '同期テスト');
  genOf(planJ, 0).sireName = '同期した父馬';
  genOf(planJ, 0).damDbIndex = 1;
  C.syncPlanGen1(planJ);
  check('N24', 'syncPlanGen1 で第1世代の内容が計画の欄に写る',
    planJ.sireName === '同期した父馬' && planJ.damDbIndex === 1 &&
    planJ.sireDbIndex === 0);
  const planK = makeDbPlan('pK', '特別な名前テスト');
  genOf(planK, 0).childName = '特別な名前の子';
  genOf(planK, 0).childSex = '牝';
  const addK = C.addGenerationToPlan(planK);
  check('N25', '次の世代の追加では、世代の欄の子の名前・性別で自動登録される',
    addK.ok === true &&
    C.findOwnHorse(genOf(planK, 0).childOwnId).name === '特別な名前の子' &&
    C.findOwnHorse(genOf(planK, 0).childOwnId).sex === '牝' &&
    genOf(planK, 1).damOwnId === genOf(planK, 0).childOwnId);
  const planL = makeDbPlan('pL', '二重登録テスト');
  const regL1 = C.registerOwnHorseFromGeneration(planL, genOf(planL, 0), '二重の子', '牡');
  const beforeL = C.ownHorses.length;
  const regL2 = C.registerOwnHorseFromGeneration(planL, genOf(planL, 0), '二重の子2', '牝');
  check('N26', '世代の子の登録は二重登録しない（登録済みの世代は拒否される）',
    regL1.ok === true && regL2.ok === false && C.ownHorses.length === beforeL);
  check('N27', 'defaultGenerationChildName（第1世代は計画名＋「の子」、第2世代は世代つき）',
    C.defaultGenerationChildName(planL, 1) === '二重登録テストの子' &&
    C.defaultGenerationChildName(planL, 2) === '二重登録テストの子（第2世代）' &&
    C.defaultGenerationChildName(null, 1) === '配合計画の子');
  const planG = makeDbPlan('pG', '母使いテスト');
  genOf(planG, 0).childSex = '牝';
  C.addGenerationToPlan(planG);
  check('N28', 'generationChildUsage は母として使われた場合も分かる',
    (() => {
      const u = C.generationChildUsage(planG, genOf(planG, 0));
      return u.length === 1 && u[0].genNo === 2 && u[0].role === 'dam';
    })());
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('N29', 'index.html に多世代の説明がある（次の世代を追加・世代の削除）',
    indexHtml.includes('次の世代を追加') && indexHtml.includes('世代の削除もできます') &&
    indexHtml.includes('version 2'));
  check('N30', 'parseImportData：自分の馬のない旧形式JSONは、既存の自分の馬を残す',
    (() => {
      const parsed = C.parseImportData(
        { version: 1, records: [], plans: [] }, [], C.ownHorses);
      return parsed.ownHorses === C.ownHorses && Array.isArray(parsed.plans);
    })());

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
