'use strict';
/* Nodeハーネス: app.js を vm で読み、種牡馬DB検索と既存機能の回帰を検証する。
   使い方: node scripts/test-stallions.js
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
  await sleep(100); // loadData() の fetch 完了を待つ

  const C = sandbox; // app.js のトップレベル var はコンテキストのグローバル
  const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stallions.json'), 'utf8'));

  // --- S: CSV変換・JSON ---
  check('S01', 'stallions.json は3021件', C.STALLIONS && C.STALLIONS.count === 3021 && C.STALLIONS.horses.length === 3021,
    'count=' + (C.STALLIONS && C.STALLIONS.count));
  check('S02', '全馬に祖先15件あり', C.STALLIONS.horses.every((h) => Array.isArray(h.anc) && h.anc.length === 15));
  check('S03', '祖先の名前は全件非空', C.STALLIONS.horses.every((h) => h.anc.every((a) => a[0])));
  check('S04', 'JSONの件数とCSV由来の件数が一致', db.count === 3021 && db.horses.length === 3021);
  check('S05', '空欄はそのまま（非凡なし1651件・天性なし2922件）',
    db.horses.filter((h) => !h.hibon).length === 1651 && db.horses.filter((h) => !h.talent).length === 2922);

  // --- S: 検索 ---
  const byName = C.searchStallions({ name: 'アイアンリージ' });
  check('S06', '馬名の部分一致（アイアンリージ→3件の別バリエーション）', byName.length === 3,
    'got=' + byName.length);
  const byChi = C.searchStallions({ chi: 'ノーザンダンサー系' });
  check('S07', '子系統で絞り込み（ノーザンダンサー系557件・全件一致）',
    byChi.length === 557 && byChi.every((r) => r.h.chi === 'ノーザンダンサー系'), 'got=' + byChi.length);
  const byFactor = C.searchStallions({ factor: '長' });
  check('S08', '因子で絞り込み（因子1〜3のいずれかに「長」）',
    byFactor.length > 0 && byFactor.every((r) => [r.h.f1, r.h.f2, r.h.f3].join(' ').includes('長')));
  const byHibon = C.searchStallions({ hibon: '鉄情不羈' });
  check('S09', '非凡で絞り込み', byHibon.length >= 1 && byHibon.every((r) => (r.h.hibon || '').includes('鉄情不羈')));
  const byTalent = C.searchStallions({ talent: '飛燕' });
  check('S10', '天性で絞り込み（飛燕36件）', byTalent.length === 36, 'got=' + byTalent.length);
  check('S11', '条件なしでは0件（3021件を全部出さない）', C.searchStallions({}).length === 0);
  check('S12', '条件の組み合わせ（馬名＋子系統）',
    C.searchStallions({ name: 'アイアンリージ', chi: 'テディ系' }).length === 3);
  check('S13', '存在しない馬名は0件', C.searchStallions({ name: '存在しない馬名zzz' }).length === 0);
  check('S14', '子系統の選択肢は54件', C.stallionChiOptions().length === 54,
    'got=' + C.stallionChiOptions().length);

  // --- S: 詳細・リンク ---
  const h0 = C.STALLIONS.horses[0];
  const a0 = C.stallionAncestor(h0, 0);
  check('S15', '祖先の親系統・子系統・因子が取れる',
    a0.name === 'ブルリー' && a0.pa === 'Teddy' && a0.chi === 'テディ系' && a0.f1 === '丈' && a0.f2 === '長');
  check('S16', '全書リンクが復元できる',
    C.stallionLink(h0) === 'https://dabimas.jp/kouryaku/stallions/3315497239.html');
  C.renderStallionDetail(0);
  const detailHtml = getEl('s-detail').innerHTML;
  check('S17', '詳細に5代血統15件と断定しない注意が出る',
    detailHtml.includes('ブルリー') && detailHtml.includes('配合の効果を断定する表示はしません'));

  // --- S: 計画への選択 ---
  C.chooseStallionForPlan(0, 'sire');
  check('S18', '父馬に選ぶと計画フォームに入る', getEl('p-sire').value === h0.n);
  const plan = C.currentPlanForm();
  check('S19', '計画にDB番号が残る', plan.sireName === h0.n && plan.sireDbIndex === 0);
  check('S20', 'DB番号つき計画は validPlan を通る', C.validPlan({ id: 'p1', name: 'テスト計画', status: '計画', sireName: h0.n, sireDbIndex: 0, damDbIndex: null }));
  check('S21', 'DB番号が負の計画は拒否される', !C.validPlan({ id: 'p1', name: 'テスト計画', status: '計画', sireDbIndex: -1 }));
  check('S22', 'DB番号なしの旧計画も validPlan を通る', C.validPlan({ id: 'p1', name: '旧計画', status: '予約' }));
  C.loadPlanIntoForm({ id: 'p1', name: 'テスト計画', sireName: h0.n, damName: '', status: '計画', memo: '', sireDbIndex: 0, damDbIndex: null });
  check('S23', '計画の編集でDB選択が復元される',
    getEl('p-sire').value === h0.n && C.selectedDb.sire === 0);
  C.resetPlanForm();
  check('S24', '計画フォームのリセットでDB選択が外れる', C.selectedDb.sire === null && C.selectedDb.dam === null);

  // --- S: 検索結果の表示上限 ---
  C.searchStallions({ factor: '長' }).length > 50 &&
    (getEl('s-factor').value = '長', C.runStallionSearch());
  check('S25', '検索結果が多いときは先頭50件の旨が出る',
    getEl('s-msg').textContent.includes('先頭50件'), getEl('s-msg').textContent);

  // --- 回帰: 定型文の読み取り（P01相当） ---
  const paste = ['馬名：キョウエイタッ20', '年齢：0歳', '解析時期：0歳 3月 5週', '解析タブ：入厩前',
    '解析時所属：未入厩', 'スピード：A', 'スタミナ：B', '根性：B', '気性：C', '体質：B',
    'メモリ：2', '脚質：追込', '距離適性：1600m～3000m', '適応力：D'].join('\n');
  const parsed = C.parsePasted(paste);
  check('R01', '定型文の読み取り（P01相当）',
    parsed.fields.name === 'キョウエイタッ20' && parsed.fields.spRank === 'A' && parsed.fields.stRank === 'B' && parsed.fields.memory === '2');

  // --- 回帰: 推定（T13相当 SP=B・ST=B・牡 → 合計170〜198） ---
  const est = C.estimate({ spRank: 'B', stRank: 'B', sex: '牡', comment: '', growth: '不明' });
  check('R02', '推定の回帰（T13相当）',
    C.fmtRange([est.sumLo, est.sumHi]) === '170〜198', C.fmtRange([est.sumLo, est.sumHi]));

  // --- 回帰: 分類 ---
  const cls = C.classify('これは凄い素質の馬ですね', []);
  check('R03', 'コメント分類の回帰（凄い素質）', cls.tal.includes('凄い素質'));

  // --- 静的チェック: index.html に検索欄がある ---
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('R04', 'index.html に検索UIがある',
    ['s-name', 's-chi', 's-factor', 's-hibon', 's-talent', 's-search', 's-results', 's-detail']
      .every((id) => html.includes(`id="${id}"`)));
  check('R05', 'index.html に出典・断定しない注意がある',
    html.includes('ユーザー提供CSV') && html.includes('配合の効果を断定する表示はしません'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
