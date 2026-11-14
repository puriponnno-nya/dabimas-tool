'use strict';
/* Nodeハーネス: app.js を vm で読み、配合理論のプレビュー（保存前）を検証する。
   使い方: node scripts/test-theory-preview.js
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

/* テスト用の小さな偽データ。anc は15件 [名前, 親系統, 子系統, 因子1, 因子2]。 */
function fakeHorse(name, paByIdx, nameByIdx) {
  const anc = [];
  for (let i = 0; i < 15; i++) {
    anc.push([
      (nameByIdx && nameByIdx[i]) || (name + '祖先' + i),
      (paByIdx && paByIdx[i]) || '',
      '', '', '',
    ]);
  }
  return { n: name, anc };
}

/* 要素自身または子孫の innerHTML に text があるか。 */
function htmlContains(el, text) {
  if (!el) return false;
  if (typeof el.innerHTML === 'string' && el.innerHTML.indexOf(text) >= 0) return true;
  if (!Array.isArray(el.children)) return false;
  return el.children.some((c) => htmlContains(c, text));
}

(async () => {
  await sleep(100); // loadData() の fetch 完了を待つ
  const C = sandbox;
  const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stallions.json'), 'utf8'));
  const sire0 = db.horses[0]; // アイアンリージ-巌瓏-
  const dam3 = db.horses[3]; // アイシラヌユエ20XX

  // --- PV: 両方DB選択 → ok、保存後の判定と一致 ---
  const pvOk = C.matingTheoryPreview(sire0, dam3, sire0.n, dam3.n, true, true);
  check('PV01', '両方DB選択で status=ok、判定は checkMatingTheories と同じ',
    pvOk.status === 'ok' &&
    JSON.stringify(pvOk.theories) === JSON.stringify(C.checkMatingTheories(sire0, dam3)) &&
    pvOk.theories.omoshiroi.hit === true && pvOk.theories.omoshiroi.distinctCount === 7);
  const htmlOk = C.matingTheoryPreviewHtml(pvOk);
  check('PV02', 'プレビュー表示に「配合理論の想定（保存前・参考・未検証）」と成立理論が出る',
    htmlOk.includes('配合理論の想定（保存前・参考・未検証）') &&
    htmlOk.includes('成立しそうな理論（参考・未検証）：面白い配合') &&
    htmlOk.includes('計8頭の親系統は7種類') && htmlOk.includes('配合の効果を断定する表示はしません'));
  check('PV03', 'プレビューの理論一覧は保存後の確認と同一の関数から作られる',
    C.buildChildPedigreeHtml(sire0, dam3)
      .includes(C.matingTheorySummaryHtml(C.checkMatingTheories(sire0, dam3))));

  // --- PV: 片方だけ ---
  const pvSireOnly = C.matingTheoryPreview(sire0, null, sire0.n, '', true, false);
  check('PV04', '父馬だけでは one-side、母馬を選ぶよう案内する',
    pvSireOnly.status === 'one-side' && pvSireOnly.missingRole === 'dam' &&
    C.matingTheoryPreviewHtml(pvSireOnly).includes('母馬も選ぶと、ここに配合理論の想定が表示されます'));
  const pvDamOnly = C.matingTheoryPreview(null, dam3, '', dam3.n, false, true);
  check('PV05', '母馬だけでは one-side、父馬を選ぶよう案内する',
    pvDamOnly.status === 'one-side' && pvDamOnly.missingRole === 'sire' &&
    C.matingTheoryPreviewHtml(pvDamOnly).includes('父馬も選ぶと、ここに配合理論の想定が表示されます'));

  // --- PV: 名前だけ ---
  const pvNameOnly = C.matingTheoryPreview(null, null, 'テスト父馬', 'テスト母馬', false, false);
  check('PV06', '両方とも名前だけでは name-only、血統が分からないため判定できないと出る',
    pvNameOnly.status === 'name-only' &&
    C.matingTheoryPreviewHtml(pvNameOnly).includes('名前だけの入力では血統が分からないため、配合理論は判定できません'));
  const pvHalfName = C.matingTheoryPreview(sire0, null, sire0.n, 'テスト母馬', true, false);
  check('PV07', '片方がDB選択でもう片方が名前だけでも name-only',
    pvHalfName.status === 'name-only');

  // --- PV: 未入力・見つからない ---
  check('PV08', '両方とも未入力では empty',
    C.matingTheoryPreview(null, null, '', '', false, false).status === 'empty');
  const pvMissing = C.matingTheoryPreview(null, dam3, '消えた馬', dam3.n, true, true);
  check('PV09', '選んだ父馬が見つからなければ missing',
    pvMissing.status === 'missing' && pvMissing.missingRole === 'sire' &&
    C.matingTheoryPreviewHtml(pvMissing).includes('選んだ父馬・母馬が見つかりません'));

  // --- PV: 理論なし・危険だけ ---
  const pvNone = C.matingTheoryPreview(
    fakeHorse('父テスト馬', {}), fakeHorse('母テスト馬', {}), '父テスト馬', '母テスト馬', true, true);
  check('PV10', 'どの理論にも当てはまらなければ「配合理論なし（参考・未検証）」',
    pvNone.status === 'ok' &&
    C.matingTheoryPreviewHtml(pvNone).includes('配合理論なし（参考・未検証）') &&
    C.matingTheoryPreviewHtml(pvNone).includes('この組み合わせでは、確認できた配合理論はありません'));
  const sireDanger2 = fakeHorse('父テスト馬', {}, { 0: '共通祖先馬' });
  const damDanger2 = fakeHorse('母テスト馬', {}, { 0: '共通祖先馬' });
  const pvDanger = C.matingTheoryPreview(sireDanger2, damDanger2, '父テスト馬', '母テスト馬', true, true);
  check('PV11', '危険な配合だけの組み合わせは「配合理論なし＋危険あり」と出る',
    pvDanger.status === 'ok' && pvDanger.theories.anyHit === false &&
    pvDanger.theories.dangerous.hit === true &&
    C.matingTheoryPreviewHtml(pvDanger).includes('危険な配合：当てはまるように見えます') &&
    C.matingTheoryPreviewHtml(pvDanger).includes('当てはまるプラスの配合理論はありませんでしたが、危険な配合の条件に当てはまるように見えます'));

  // --- PV: 自家生産馬を親にした場合も判定できる ---
  const reg = C.registerOwnHorseFromRefs(
    { sireName: sire0.n, damName: dam3.n, sireDbIndex: 0, damDbIndex: 3 },
    'テストの子', '牡', 'p-test', 'g-test');
  check('PV12', '自家生産馬を父馬に選ぶとプレビューが ok になる',
    reg.ok === true &&
    (() => {
      const ownPed = C.resolveParentRef({ ownId: reg.horse.id });
      const pv = C.matingTheoryPreview(ownPed, dam3, reg.horse.name, dam3.n, true, true);
      return pv.status === 'ok' && pv.theories !== null &&
        JSON.stringify(pv.theories) === JSON.stringify(C.checkMatingTheories(ownPed, dam3));
    })());

  // --- PV: 計画フォームの配線（updatePlanDbStatus 経由でプレビューが更新される） ---
  getEl('p-sire').value = sire0.n;
  getEl('p-dam').value = dam3.n;
  C.selectedDb.sire = 0;
  C.selectedDb.dam = 3;
  C.selectedOwn.sire = null;
  C.selectedOwn.dam = null;
  C.updatePlanDbStatus('sire');
  C.updatePlanDbStatus('dam');
  check('PV13', '計画フォームで両方選ぶとプレビュー欄に想定が表示される',
    getEl('plan-theory-preview').innerHTML.includes('配合理論の想定（保存前・参考・未検証）') &&
    getEl('plan-theory-preview').innerHTML.includes('面白い配合'));
  getEl('p-dam').value = '';
  C.selectedDb.dam = null;
  C.updatePlanDbStatus('dam');
  check('PV14', '計画フォームで母馬を外すと「母馬も選ぶ」と案内される',
    getEl('plan-theory-preview').innerHTML.includes('母馬も選ぶと、ここに配合理論の想定が表示されます'));
  getEl('p-sire').value = 'テスト父馬';
  getEl('p-dam').value = 'テスト母馬';
  C.selectedDb.sire = null;
  C.updatePlanDbStatus('sire');
  check('PV15', '計画フォームで両方とも名前だけにすると判定できないと出る',
    getEl('plan-theory-preview').innerHTML.includes('名前だけの入力では血統が分からないため、配合理論は判定できません'));

  // --- PV: 世代の欄のプレビュー（第2世代以降も同じ） ---
  function genBox(gen) {
    const plan = { id: 'p1', name: 'テスト', status: '計画', generations: [gen] };
    return C.buildGenParentEditor(plan, gen, 1);
  }
  const genOk = {
    id: 'g1', childName: 'テストの子', childSex: '不明',
    sireName: sire0.n, damName: dam3.n,
    sireDbIndex: 0, damDbIndex: 3, sireOwnId: null, damOwnId: null, childOwnId: null,
  };
  check('PV16', '世代の欄でも両方選ぶとプレビューが出る',
    htmlContains(genBox(genOk), '配合理論の想定（保存前・参考・未検証）') &&
    htmlContains(genBox(genOk), '面白い配合'));
  const genNameOnly = {
    id: 'g2', childName: 'テストの子', childSex: '不明',
    sireName: 'テスト父馬', damName: 'テスト母馬',
    sireDbIndex: null, damDbIndex: null, sireOwnId: null, damOwnId: null, childOwnId: null,
  };
  check('PV17', '世代の欄でも名前だけでは判定できないと出る',
    htmlContains(genBox(genNameOnly), '名前だけの入力では血統が分からないため、配合理論は判定できません'));
  const genOneSide = {
    id: 'g3', childName: 'テストの子', childSex: '不明',
    sireName: sire0.n, damName: '',
    sireDbIndex: 0, damDbIndex: null, sireOwnId: null, damOwnId: null, childOwnId: null,
  };
  check('PV18', '世代の欄でも片方だけではもう一方を選ぶよう案内が出る',
    htmlContains(genBox(genOneSide), '母馬も選ぶと、ここに配合理論の想定が表示されます'));

  // --- PV: index.html にプレビュー欄がある ---
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('PV19', 'index.html に計画フォームのプレビュー欄がある',
    indexHtml.includes('id="plan-theory-preview"') &&
    indexHtml.includes('父馬・母馬を両方選ぶと、ここに配合理論の想定が表示されます'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
