'use strict';
/* Nodeハーネス: app.js を vm で読み、おすすめの相手（片方だけ選んだ時に
   理論が付く相手を優先順に出す機能）を検証する。
   使い方: node scripts/test-recommendations.js
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
  const idxGilded = db.horses.findIndex((h) => h.n === 'ギルデッドタイム1992');
  const idxSakura = db.horses.findIndex((h) => h.n === 'サクラクレアー');
  check('R00', '実データにギルデッドタイム1992とサクラクレアーがいる',
    idxGilded >= 0 && idxSakura >= 0, `gilded=${idxGilded} sakura=${idxSakura}`);
  const gilded = C.STALLIONS.horses[idxGilded];
  const sakura = C.STALLIONS.horses[idxSakura];

  // --- 自家生産馬の候補（先に実施：キャッシュキーが自家生産馬の頭数を含むため） ---
  // ギルデッドタイム1992との組み合わせで超完璧な配合（順位2）になる
  // ブルタカチホ-央燕- の血統を写した自家生産馬で確認する
  // （サクラクレアーの写しは面白い配合どまりで、上位20件の枠に入らない）。
  const idxTop = db.horses.findIndex((h) => h.n === 'ブルタカチホ-央燕-');
  const topMare = C.STALLIONS.horses[idxTop];
  const fakeOwn = {
    id: 'o-test-reco', name: 'テスト自家牝馬', sex: '牝', generation: 2,
    sireName: 'テスト父馬', damName: 'テスト母馬',
    anc: JSON.parse(JSON.stringify(topMare.anc)),
  };
  C.ownHorses = [fakeOwn];
  const recosOwn = C.findPartnerRecommendations(gilded, 'sire', 'db:' + idxGilded);
  const ownItem = recosOwn.items.find((it) => it.kind === 'own' && it.ownId === 'o-test-reco');
  const dbPairRank = C.theoryBestRank(C.checkMatingTheories(gilded, topMare));
  check('R01', '自家生産馬もおすすめ候補に入り、DB同血統と同じ理論順位になる',
    !!ownItem && dbPairRank >= 0 && ownItem.rank === dbPairRank,
    `ownItem=${JSON.stringify(ownItem)} dbPairRank=${dbPairRank}`);
  check('R02', '自家生産馬の候補には出所（自家生産馬）と理論名・短い根拠が出る',
    !!ownItem && ownItem.badge.indexOf('自家生産馬') >= 0 &&
    ownItem.label === C.PARTNER_RECO_LABELS[ownItem.rank] &&
    ownItem.reasons.length >= 1 && ownItem.reasons[0].reason.length > 0);

  // --- DB候補（自家生産馬なし） ---
  C.ownHorses = [];
  const t0 = Date.now();
  const recos = C.findPartnerRecommendations(gilded, 'sire', 'db:' + idxGilded);
  const elapsed = Date.now() - t0;
  check('R03', '父ギルデッドタイム1992固定で、理論が付く母候補が見つかり上位20件まで',
    recos.total > 0 && recos.items.length === Math.min(20, recos.total),
    `total=${recos.total} items=${recos.items.length}`);
  console.log(`  (全頭判定の所要時間: ${elapsed}ms)`);
  check('R04', '候補は理論の優先順（至高＞奇跡＞超完璧＞完璧＞見事＞面白い＞よくできた）に並ぶ',
    recos.items.every((it, i) => i === 0 || recos.items[i - 1].rank <= it.rank));
  check('R05', '候補はすべてプラスの理論が付き（危険だけ・理論なしは入らない）、順位が再判定と一致する',
    recos.items.every((it) => {
      const cand = C.STALLIONS.horses[it.dbIndex];
      const th = C.checkMatingTheories(gilded, cand);
      return th.anyHit === true && C.theoryBestRank(th) === it.rank &&
        it.label === C.PARTNER_RECO_LABELS[it.rank] && it.reasons.length >= 1;
    }));
  check('R06', '選んだ馬そのもの（同じDBレコード）は候補に入らない',
    recos.items.every((it) => it.kind !== 'db' || it.dbIndex !== idxGilded));
  const recos2 = C.findPartnerRecommendations(gilded, 'sire', 'db:' + idxGilded);
  check('R07', '同じ馬を選んでいる間は結果を使い回す（キャッシュ）', recos2 === recos);

  // --- 母を固定して父を探す向き ---
  const recosDam = C.findPartnerRecommendations(sakura, 'dam', 'db:' + idxSakura);
  check('R08', '母サクラクレアー固定でも理論が付く父候補が優先順で見つかる',
    recosDam.total > 0 &&
    recosDam.items.every((it, i) => i === 0 || recosDam.items[i - 1].rank <= it.rank) &&
    recosDam.items.every((it) => {
      const cand = C.STALLIONS.horses[it.dbIndex];
      const th = C.checkMatingTheories(cand, sakura);
      return th.anyHit === true && C.theoryBestRank(th) === it.rank;
    }), `total=${recosDam.total}`);

  // --- 表示（HTML） ---
  const html = C.partnerRecommendationsHtml(recos, 'dam');
  check('R09', 'おすすめ表示に「おすすめの母馬（参考・未検証）」と総件数・選択用ボタンが出る',
    html.includes('おすすめの母馬（参考・未検証）') &&
    html.includes('理論が付く相手が' + recos.total + '件見つかりました') &&
    html.includes('data-reco-db=') && html.includes(recos.items[0].name) &&
    html.includes(recos.items[0].label));
  const htmlEmpty = C.partnerRecommendationsHtml({ total: 0, items: [] }, 'sire');
  check('R10', '理論が付く相手がいない時は「おすすめの父馬」と見つからなかった旨が出る',
    htmlEmpty.includes('おすすめの父馬（参考・未検証）') &&
    htmlEmpty.includes('理論が付く相手は見つかりませんでした'));

  // --- 計画フォームのプレビュー連携 ---
  C.selectedDb.sire = idxGilded; C.selectedDb.dam = null;
  C.selectedOwn.sire = null; C.selectedOwn.dam = null;
  getEl('p-sire').value = gilded.n; getEl('p-dam').value = '';
  C.updatePlanTheoryPreview();
  const previewHtml = getEl('plan-theory-preview').innerHTML;
  check('R11', '計画フォームで父だけ選ぶとプレビューにおすすめの母馬が出る',
    previewHtml.includes('おすすめの母馬（参考・未検証）') &&
    previewHtml.includes('理論が付く相手が' + recos.total + '件見つかりました'));
  C.selectedDb.dam = idxSakura;
  getEl('p-dam').value = sakura.n;
  C.updatePlanTheoryPreview();
  const previewBoth = getEl('plan-theory-preview').innerHTML;
  check('R12', '両方選ぶとおすすめは出ず、通常の配合理論プレビューになる',
    !previewBoth.includes('おすすめの母馬') &&
    previewBoth.includes('配合理論の想定（保存前・参考・未検証）'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
