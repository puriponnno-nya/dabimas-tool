'use strict';
/* Nodeハーネス: app.js を vm で読み、子の血統・配合理論の確認（ステップ3）と
   既存機能の回帰を検証する。使い方: node scripts/test-pedigree.js
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

/* テスト用の小さな偽データ。anc は15件 [名前, 親系統, 子系統, 因子1, 因子2]。
   paByIdx: {anc番号: 親系統}、nameByIdx: {anc番号: 祖先名} で上書きする。
   祖先名は既定で馬ごとに一意（偶然のクロスを避ける）。 */
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

/* 要素自身または子孫の innerHTML に text があるか（世代ブロックは
   子要素の innerHTML に入るため、計画カードの確認に使う）。 */
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

  // --- M: 子の血統の組み立て（実レコード2頭） ---
  const rows = C.buildChildPedigree(sire0, dam3);
  check('M01', '子の血統は15位置', Array.isArray(rows) && rows.length === 15, 'got=' + (rows && rows.length));
  const names = rows.map((r) => r.name);
  check('M02', '父方7位置が父馬の anc から正しく来る',
    names[0] === 'アイアンリージ-巌瓏-' && names[1] === 'ブルリー' && names[2] === 'Bull Dog' &&
    names[3] === 'Teddy' && names[4] === 'Ballot' && names[5] === 'War Admiral' &&
    names[6] === "Man o'War" && names[7] === 'Sir Gallahad',
    JSON.stringify(names.slice(0, 8)));
  check('M03', '母方7位置が母馬の anc から正しく来る',
    names[8] === 'トーホウエンペラー' && names[9] === 'ブライアンズタイム' && names[10] === 'ロベルト' &&
    names[11] === 'ノーリュート' && names[12] === 'モンズーン' && names[13] === 'Konigsstuhl' &&
    names[14] === 'ファーディナンド',
    JSON.stringify(names.slice(8)));
  check('M04', '血統位置の表示名と親系統が正しい',
    rows[0].label === '父' && rows[1].label === '父父' && rows[1].pa === 'Teddy' &&
    rows[8].label === '母父' && rows[8].pa === 'Royal Charger' && rows[14].label === '母母母父' &&
    rows[14].pa === 'Nearctic');
  check('M05', '世代が正しい（父父・母父=2代、父母父・母母父=3代、ほか=4代）',
    rows[1].gen === 2 && rows[8].gen === 2 && rows[5].gen === 3 && rows[12].gen === 3 &&
    rows[3].gen === 4 && rows[4].gen === 4 && rows[14].gen === 4);
  check('M06', '片方でも欠けると血統は作らない', C.buildChildPedigree(null, dam3) === null && C.buildChildPedigree(sire0, null) === null);

  // --- M: 面白い配合（8頭の親系統の種類数。境界7） ---
  // 父馬: anc0=A anc5=B anc8=C anc12=D / 母馬: anc0=E anc5=F anc8=G anc12=A → 7種類で成立
  const sireFun = fakeHorse('父テスト馬', { 0: 'A', 5: 'B', 8: 'C', 12: 'D' });
  const damFun7 = fakeHorse('母テスト馬', { 0: 'E', 5: 'F', 8: 'G', 12: 'A' });
  const damFun6 = fakeHorse('母テスト馬', { 0: 'E', 5: 'F', 8: 'B', 12: 'C' });
  check('M07', '面白い配合：7種類で成立',
    C.checkMatingTheories(sireFun, damFun7).omoshiroi.hit === true &&
    C.checkMatingTheories(sireFun, damFun7).omoshiroi.distinctCount === 7);
  check('M08', '面白い配合：6種類では不成立',
    C.checkMatingTheories(sireFun, damFun6).omoshiroi.hit === false &&
    C.checkMatingTheories(sireFun, damFun6).omoshiroi.distinctCount === 6);
  check('M09', '面白い配合：空の親系統は数えない',
    C.checkMatingTheories(fakeHorse('父テスト馬', {}), fakeHorse('母テスト馬', {})).omoshiroi.distinctCount === 0);

  // --- M: 見事な配合（多重集合の一致） ---
  const sireMigoto = fakeHorse('父テスト馬', { 4: 'X', 7: 'Y', 11: 'Z', 14: 'W' });
  const damMigoto = fakeHorse('母テスト馬', { 0: 'W', 5: 'Z', 8: 'Y', 12: 'X' });
  check('M10', '見事な配合：並べ替えで一致すれば成立',
    C.checkMatingTheories(sireMigoto, damMigoto).migoto.hit === true);
  // 重複を含む多重集合：父 [X,X,Y,Z] / 母 [X,Y,Z,X] → 成立、母 [X,Y,Z,Z] → 不成立
  const sireDup = fakeHorse('父テスト馬', { 4: 'X', 7: 'X', 11: 'Y', 14: 'Z' });
  const damDupOk = fakeHorse('母テスト馬', { 0: 'X', 5: 'Y', 8: 'Z', 12: 'X' });
  const damDupNg = fakeHorse('母テスト馬', { 0: 'X', 5: 'Y', 8: 'Z', 12: 'Z' });
  check('M11', '見事な配合：重複を含む多重集合の一致も成立',
    C.checkMatingTheories(sireDup, damDupOk).migoto.hit === true);
  check('M12', '見事な配合：多重集合が違えば不成立',
    C.checkMatingTheories(sireDup, damDupNg).migoto.hit === false);

  // --- M: よくできた配合（共通種類数3の境界。見事でない場合） ---
  const sireYoku = fakeHorse('父テスト馬', { 4: 'A', 7: 'B', 11: 'C', 14: 'D' });
  const damYoku3 = fakeHorse('母テスト馬', { 0: 'A', 5: 'B', 8: 'C', 12: 'E' });
  const damYoku2 = fakeHorse('母テスト馬', { 0: 'A', 5: 'B', 8: 'E', 12: 'F' });
  check('M13', 'よくできた配合：共通3種類で成立（見事ではない）',
    (() => { const r = C.checkMatingTheories(sireYoku, damYoku3); return r.yokudekita.hit === true && r.yokudekita.commonCount === 3 && r.migoto.hit === false; })());
  check('M14', 'よくできた配合：共通2種類では不成立',
    (() => { const r = C.checkMatingTheories(sireYoku, damYoku2); return r.yokudekita.hit === false && r.yokudekita.commonCount === 2; })());
  // 両方に重複があり多重集合が違う → 見事ではなく、よくできたが成立
  // （共通4種類で見事でない組み合わせは、4頭集合では作れない。4種類とも
  // 共通なら多重集合も一致してしまうため。ここでは重複同士の違いで確認する）
  const sireYoku4 = fakeHorse('父テスト馬', { 4: 'A', 7: 'A', 11: 'B', 14: 'C' });
  const damYoku4 = fakeHorse('母テスト馬', { 0: 'A', 5: 'B', 8: 'B', 12: 'C' });
  check('M15', 'よくできた配合：両方に重複があり多重集合が違えばよくできたが成立',
    (() => { const r = C.checkMatingTheories(sireYoku4, damYoku4); return r.migoto.hit === false && r.yokudekita.hit === true && r.yokudekita.commonCount === 3; })());

  // --- M: 完璧な配合（見事＋面白いの同時成立） ---
  const sirePerfect = fakeHorse('父テスト馬', { 0: 'A', 4: 'P', 5: 'B', 7: 'Q', 8: 'C', 11: 'R', 12: 'D', 14: 'S' });
  const damPerfect = fakeHorse('母テスト馬', { 0: 'S', 5: 'R', 8: 'Q', 12: 'P' });
  check('M16', '完璧な配合：見事＋面白いの同時成立で判定する',
    (() => {
      const r = C.checkMatingTheories(sirePerfect, damPerfect);
      const html = C.buildChildPedigreeHtml(sirePerfect, damPerfect);
      return r.perfect.hit === true && r.migoto.hit === true && r.omoshiroi.hit === true &&
        html.includes('完璧な配合：当てはまるように見えます（参考）') &&
        html.includes('種牡馬自身が面白い配合であることも必要とする説明');
    })());
  // 完璧だが面白い系統が7種類なら超完璧ではない（見事は成立）
  const sirePerfect7 = fakeHorse('父テスト馬', { 0: 'A', 4: 'P', 5: 'B', 7: 'Q', 8: 'C', 11: 'R', 12: 'P', 14: 'S' });
  check('M31', '超完璧な配合：面白い系統7種類では不成立（完璧は成立）',
    (() => {
      const r = C.checkMatingTheories(sirePerfect7, damPerfect);
      return r.perfect.hit === true && r.omoshiroi.distinctCount === 7 && r.superPerfect.hit === false;
    })());
  check('M32', '超完璧な配合：面白い系統8種類＋見事で成立',
    (() => {
      const r = C.checkMatingTheories(sirePerfect, damPerfect);
      const html = C.buildChildPedigreeHtml(sirePerfect, damPerfect);
      return r.superPerfect.hit === true && r.superPerfect.distinctCount === 8 &&
        html.includes('超完璧な配合：当てはまるように見えます（参考）');
    })());
  check('M33', '超完璧な配合：見事でなければ不成立（面白い系統8種類でも）',
    (() => {
      const damNoMigoto = fakeHorse('母テスト馬', { 0: 'E', 5: 'F', 8: 'G', 12: 'H' });
      const sire8 = fakeHorse('父テスト馬', { 0: 'A', 5: 'B', 8: 'C', 12: 'D' });
      const r = C.checkMatingTheories(sire8, damNoMigoto);
      return r.omoshiroi.distinctCount === 8 && r.migoto.hit === false && r.superPerfect.hit === false;
    })());

  // --- M: 奇跡の配合（完璧＋4×3クロス。3代前は母母父のみ、4代前は種牡馬側4代） ---
  // rows[12]（母母父）＝母馬 anc[8]、rows[3]（父父父父）＝父馬 anc[2]。
  const sireMiracle = fakeHorse('父テスト馬', { 0: 'A', 4: 'P', 5: 'B', 7: 'Q', 8: 'C', 11: 'R', 12: 'D', 14: 'S' }, { 2: '奇跡クロス馬' });
  const damMiracle = fakeHorse('母テスト馬', { 0: 'S', 5: 'R', 8: 'Q', 12: 'P' }, { 8: '奇跡クロス馬' });
  check('M34', '奇跡の配合：完璧＋母母父×父父父父の4×3クロスで成立',
    (() => {
      const r = C.checkMatingTheories(sireMiracle, damMiracle);
      const html = C.buildChildPedigreeHtml(sireMiracle, damMiracle);
      return r.perfect.hit === true && r.miracle.hit === true && r.miracle.cross.name === '奇跡クロス馬' &&
        r.miracle.cross.sireLabel === '父父父父' && r.miracle.cross.damLabel === '母母父' &&
        html.includes('奇跡の配合：当てはまるように見えます（参考）') &&
        html.includes('兄弟クロス');
    })());
  check('M35', '奇跡の配合：完璧でなければ4×3クロスがあっても不成立',
    (() => {
      const sireNoPerfect = fakeHorse('父テスト馬', { 0: 'A', 5: 'B', 8: 'C', 12: 'D' }, { 2: '奇跡クロス馬' });
      const r = C.checkMatingTheories(sireNoPerfect, damMiracle);
      return r.perfect.hit === false && r.miracle.hit === false;
    })());
  check('M36', '奇跡の配合：3代前が母父父（母馬 anc[1]）では不成立（母母父のみ有効）',
    (() => {
      const damWrong3 = fakeHorse('母テスト馬', { 0: 'S', 5: 'R', 8: 'Q', 12: 'P' }, { 1: '奇跡クロス馬' });
      const r = C.checkMatingTheories(sireMiracle, damWrong3);
      return r.perfect.hit === true && r.miracle.hit === false;
    })());
  check('M37', '奇跡の配合：4代前が種牡馬側3代（父馬 anc[8]＝父母父）では不成立',
    (() => {
      const sireWrong4 = fakeHorse('父テスト馬', { 0: 'A', 4: 'P', 5: 'B', 7: 'Q', 8: 'C', 11: 'R', 12: 'D', 14: 'S' }, { 8: '奇跡クロス馬' });
      const r = C.checkMatingTheories(sireWrong4, damMiracle);
      return r.perfect.hit === true && r.miracle.hit === false;
    })());
  check('M38', '奇跡の配合：種牡馬側の別の4代前（父父母父＝父馬 anc[5]）でも成立',
    (() => {
      const sireAlt4 = fakeHorse('父テスト馬', { 0: 'A', 4: 'P', 5: 'B', 7: 'Q', 8: 'C', 11: 'R', 12: 'D', 14: 'S' }, { 5: '奇跡クロス馬' });
      const r = C.checkMatingTheories(sireAlt4, damMiracle);
      return r.miracle.hit === true && r.miracle.cross.sireLabel === '父父母父';
    })());

  // --- M: 危険な配合（1×N・2×2） ---
  // 1×2：父馬名そのものが母方2代（母父＝母馬 anc[0]）に出る。
  const damDanger1 = fakeHorse('母テスト馬', {}, { 0: '父テスト馬' });
  check('M39', '危険な配合：父馬名が母父に出れば1×2で成立',
    (() => {
      const r = C.checkMatingTheories(sireFun, damDanger1);
      const html = C.buildChildPedigreeHtml(sireFun, damDanger1);
      return r.dangerous.hit === true &&
        r.dangerous.details.some((d) => d.type === '1xN' && d.name === '父テスト馬' && d.damGen === 2 && d.damLabel === '母父') &&
        html.includes('危険な配合：当てはまるように見えます（参考）') && html.includes('1×2');
    })());
  // 1×2（逆向き）：母馬名そのものが父方2代（父父＝父馬 anc[0]）に出る。
  const sireDanger1 = fakeHorse('父テスト馬', {}, { 0: '母テスト馬' });
  check('M40', '危険な配合：母馬名が父父に出れば1×2で成立',
    (() => {
      const r = C.checkMatingTheories(sireDanger1, damFun7);
      return r.dangerous.hit === true &&
        r.dangerous.details.some((d) => d.type === '1xN' && d.name === '母テスト馬' && d.sireGen === 2 && d.sireLabel === '父父');
    })());
  // 2×2：父父（父馬 anc[0]）と母父（母馬 anc[0]）が同じ祖先。
  const sireDanger2 = fakeHorse('父テスト馬', {}, { 0: '共通祖先馬' });
  const damDanger2 = fakeHorse('母テスト馬', {}, { 0: '共通祖先馬' });
  check('M41', '危険な配合：父父×母父が同じ祖先なら2×2で成立',
    (() => {
      const r = C.checkMatingTheories(sireDanger2, damDanger2);
      return r.dangerous.hit === true &&
        r.dangerous.details.some((d) => d.type === '2x2' && d.name === '共通祖先馬');
    })());
  check('M42', '危険な配合：実レコード2頭では不成立',
    C.checkMatingTheories(sire0, dam3).dangerous.hit === false);
  check('M43', '危険な配合だけの組み合わせは「プラスの理論なし＋危険あり」と表示される',
    (() => {
      const r = C.checkMatingTheories(sireDanger2, damDanger2);
      const html = C.buildChildPedigreeHtml(sireDanger2, damDanger2);
      return r.anyHit === false && r.dangerous.hit === true &&
        html.includes('当てはまるプラスの配合理論はありませんでしたが、危険な配合の条件に当てはまるように見えます');
    })());
  check('M44', '至高の配合は判定せず、ver.5.0.0の追加が注記される',
    C.buildChildPedigreeHtml(sire0, dam3).includes('至高の配合：未確認です') &&
    C.buildChildPedigreeHtml(sire0, dam3).includes('ver.5.0.0（2025-10-29）'));
  check('M45', '表示：新しい4理論の出典が表示される',
    (() => {
      const html = C.buildChildPedigreeHtml(sire0, dam3);
      return html.includes('超完璧な配合') && html.includes('奇跡の配合') &&
        html.includes('るんば') && html.includes('イッコ牧場') && html.includes('Gamerch');
    })());

  // --- M: 奇跡の配合の実例（ギルデッドタイム×サクラクレアー→オルフェーヴル／ドリームジャーニー） ---
  // 原因：旧 buildChildAnc は子の anc[0]（父そのもの）の親系統を空にしていたため、
  // 自家生産馬を母にした2代目で面白い配合が6種類・見事な配合が3対4の多重集合不一致となり、
  // 完璧な配合が成立せず奇跡の配合が出なかった。親系統は父系で受け継がれるため、
  // anc[0] の親系統は父馬の父（anc[0]）の親系統で補う。
  const gildedIdx = db.horses.findIndex((h) => h.n === 'ギルデッドタイム1992');
  const sakuraIdx = db.horses.findIndex((h) => h.n === 'サクラクレアー');
  const orfeIdx = db.horses.findIndex((h) => h.n === 'オルフェーヴル');
  const dreamIdx = db.horses.findIndex((h) => h.n === 'ドリームジャーニー');
  const lupinIdx = db.horses.findIndex((h) => h.n === 'ルパンザサード');
  const gilded = db.horses[gildedIdx];
  const sakura = db.horses[sakuraIdx];
  const orfe = db.horses[orfeIdx];
  const dream = db.horses[dreamIdx];
  const lupin = db.horses[lupinIdx];
  const childAncG = C.buildChildAnc(gilded, sakura);
  const childAncL = C.buildChildAnc(lupin, sakura);
  check('M46', '子の血統0番目（父そのもの）の親系統は父馬の父の親系統で補う（ギルデッドタイム→Teddy、ルパンザサード→Nasrullah）',
    childAncG[0][0] === 'ギルデッドタイム1992' && childAncG[0][1] === 'Teddy' &&
    childAncL[0][0] === 'ルパンザサード' && childAncL[0][1] === 'Nasrullah',
    JSON.stringify([childAncG[0], childAncL[0]]));
  // 2代目：1代目の子を自家生産馬として登録し、オルフェーヴル／ドリームジャーニーと配合する
  C.ownHorses.push({ id: 'o-miracle-g', name: 'テストの子', sex: '牝', sireDbIndex: gildedIdx, damDbIndex: sakuraIdx, sireOwnId: null, damOwnId: null, generation: 2, anc: childAncG, sireName: gilded.n, damName: sakura.n });
  const damMiracleG = C.resolveParentRef({ ownId: 'o-miracle-g' });
  check('M47', '奇跡の配合：オルフェーヴル×（ギルデッドタイム×サクラクレアーの子）で成立（面白い7・見事・完璧、クロスはノーザンテースト 父母母父×母母父）',
    (() => {
      const r = C.checkMatingTheories(orfe, damMiracleG);
      const html = C.buildChildPedigreeHtml(orfe, damMiracleG);
      return r.omoshiroi.hit === true && r.omoshiroi.distinctCount === 7 &&
        r.migoto.hit === true && r.perfect.hit === true &&
        r.miracle.hit === true && r.miracle.cross.name === 'ノーザンテースト' &&
        r.miracle.cross.sireLabel === '父母母父' && r.miracle.cross.damLabel === '母母父' &&
        html.includes('奇跡の配合：当てはまるように見えます（参考）');
    })());
  check('M48', '奇跡の配合：ドリームジャーニー×（ギルデッドタイム×サクラクレアーの子）でも成立',
    C.checkMatingTheories(dream, damMiracleG).miracle.hit === true);
  // 旧形式：anc[0] の親系統が空のまま保存された自家生産馬を親に選んでも、父馬の父の親系統で補完されて奇跡が成立する
  const legacyAnc = childAncG.map((a) => a.slice());
  legacyAnc[0][1] = '';
  C.ownHorses.push({ id: 'o-miracle-legacy', name: '旧形式の子', sex: '牝', sireDbIndex: gildedIdx, damDbIndex: sakuraIdx, sireOwnId: null, damOwnId: null, generation: 2, anc: legacyAnc, sireName: gilded.n, damName: sakura.n });
  const damLegacy = C.resolveParentRef({ ownId: 'o-miracle-legacy' });
  check('M49', '旧形式の自家生産馬（anc[0]の親系統が空）を親に選んでも補完されて奇跡の配合が成立する',
    damLegacy && damLegacy.anc[0][1] === 'Teddy' &&
    C.checkMatingTheories(orfe, damLegacy).miracle.hit === true &&
    C.checkMatingTheories(dream, damLegacy).miracle.hit === true,
    damLegacy ? JSON.stringify(damLegacy.anc[0]) : 'damLegacy is null');

  // --- M: どの理論も成立しない組み合わせ ---
  const sireNone = fakeHorse('父テスト馬', { 0: 'A', 4: 'A', 5: 'A', 7: 'A', 8: 'A', 11: 'A', 12: 'A', 14: 'A' });
  const damNone = fakeHorse('母テスト馬', { 0: 'B', 5: 'B', 8: 'B', 12: 'B' });
  check('M17', '理論なしの組み合わせは「確認できた配合理論はありません」と表示',
    (() => {
      const r = C.checkMatingTheories(sireNone, damNone);
      const html = C.buildChildPedigreeHtml(sireNone, damNone);
      return r.anyHit === false && html.includes('この組み合わせでは、確認できた配合理論はありません（参考）');
    })());

  // --- M: 実レコード2頭の理論（面白いだけ成立） ---
  check('M18', '実レコード2頭：面白い配合が成立し、見事・よくできたは不成立',
    (() => {
      const r = C.checkMatingTheories(sire0, dam3);
      return r.omoshiroi.hit === true && r.omoshiroi.distinctCount === 7 &&
        r.migoto.hit === false && r.yokudekita.hit === false;
    })());

  // --- M: インブリードの検出 ---
  const sireCross = fakeHorse('父テスト馬', { 1: 'Teddy' }, { 1: 'クロス馬A' }, { 1: ['速', '長'] });
  const damCross = fakeHorse('母テスト馬', { 8: 'Teddy' }, { 8: 'クロス馬A' });
  const crosses = C.findInbreeding(sireCross, damCross);
  check('M19', 'インブリード：両方に出る祖先を検出する（父方3代 × 母方3代）',
    crosses.length === 1 && crosses[0].name === 'クロス馬A' &&
    crosses[0].pairs.length === 1 && crosses[0].pairs[0].sireGen === 3 && crosses[0].pairs[0].damGen === 3 &&
    crosses[0].pairs[0].sireLabel === '父父父' && crosses[0].pairs[0].damLabel === '母母父',
    JSON.stringify(crosses));
  check('M20', 'インブリード：祖先の因子を一緒に表示できる',
    crosses.length === 1 && crosses[0].f1 === '速' && crosses[0].f2 === '長');
  check('M21', 'インブリード：同じ祖先がなければ空',
    C.findInbreeding(sireFun, damFun7).length === 0 &&
    C.findInbreeding(sire0, dam3).length === 0);
  // 父馬名そのものが母方の祖先に出る場合（父方1代 × 母方2代）
  const damHasSire = fakeHorse('母テスト馬', {}, { 0: '父テスト馬' });
  const crossSire = C.findInbreeding(sireFun, damHasSire);
  check('M22', 'インブリード：父馬名そのものが母方の祖先に出る場合も表示する',
    crossSire.length === 1 && crossSire[0].name === '父テスト馬' &&
    crossSire[0].pairs.some((p) => p.sireGen === 1 && p.damGen === 2 && p.sireLabel === '父' && p.damLabel === '母父'),
    JSON.stringify(crossSire));

  // --- M: 表示（HTML） ---
  const htmlReal = C.buildChildPedigreeHtml(sire0, dam3);
  check('M23', '表示：折りたたみ（既定は閉じる）で子の血統・理論・クロスが出る',
    htmlReal.includes('<details') && !htmlReal.includes('<details open') &&
    htmlReal.includes('子の血統・配合理論を見る') && htmlReal.includes('ブルリー') &&
    htmlReal.includes('面白い配合') && htmlReal.includes('見事な配合') &&
    htmlReal.includes('よくできた配合') && htmlReal.includes('完璧な配合') &&
    htmlReal.includes('至高の配合') && htmlReal.includes('危険な配合') &&
    htmlReal.includes('インブリード') && htmlReal.includes('参考・未検証'));
  check('M24', '表示：DBにある祖先名は「DBにあり」と出る（父馬名そのもの）',
    htmlReal.includes('DBにあり'));
  check('M25', '表示：クロスがない場合はその旨が出る',
    htmlReal.includes('5代以内に同じ祖先は見つかりませんでした（参考）'));
  const htmlCross = C.buildChildPedigreeHtml(sireCross, damCross);
  check('M26', '表示：クロスがある場合は「父方3代 × 母方3代」と因子が出る',
    htmlCross.includes('クロス馬A') && htmlCross.includes('父方3代（父父父） × 母方3代（母母父）') &&
    htmlCross.includes('速') && htmlCross.includes('長'));

  // --- M: 計画カードのボタン出し分け ---
  C.plans = [
    { id: 'p1', name: 'DB計画', sireName: sire0.n, damName: dam3.n, status: '計画', sireDbIndex: 0, damDbIndex: 3 },
    { id: 'p2', name: '名前だけ計画', sireName: 'テスト父馬', damName: 'テスト母馬', status: '計画', sireDbIndex: null, damDbIndex: null },
    { id: 'p3', name: '片方だけDB計画', sireName: sire0.n, damName: 'テスト母馬', status: '計画', sireDbIndex: 0, damDbIndex: null },
  ];
  C.renderPlans();
  const planLis = getEl('plan-list').children;
  check('M27', 'DB両方選択の計画には「子の血統・配合理論を見る」が出る',
    planLis.length === 3 && htmlContains(planLis[0], '子の血統・配合理論を見る') &&
    htmlContains(planLis[0], 'ブルリー'), 'lis=' + planLis.length);
  check('M28', '名前だけの計画にはボタンが出ず、DBまたは自家生産馬から選ぶ旨だけ出る',
    !htmlContains(planLis[1], '子の血統・配合理論を見る') &&
    htmlContains(planLis[1], 'DBまたは自家生産馬から父・母を選ぶと確認できます'));
  check('M29', '片方だけDB選択の計画にもボタンは出ない',
    !htmlContains(planLis[2], '子の血統・配合理論を見る'));
  check('M30', 'planHasDbPair の判定',
    C.planHasDbPair({ sireDbIndex: 0, damDbIndex: 3 }) === true &&
    C.planHasDbPair({ sireDbIndex: 0, damDbIndex: null }) === false &&
    C.planHasDbPair({ sireDbIndex: null, damDbIndex: null }) === false &&
    C.planHasDbPair({}) === false);

  // --- 回帰: 検索・計画・定型文 ---
  check('R01', '回帰：馬名の部分一致（アイアンリージ→3件）',
    C.searchStallions({ name: 'アイアンリージ' }).length === 3);
  check('R02', '回帰：DB番号つき計画は validPlan を通る',
    C.validPlan({ id: 'p1', name: 'テスト計画', status: '計画', sireName: sire0.n, sireDbIndex: 0, damDbIndex: 3 }));
  const paste = ['馬名：キョウエイタッ20', '年齢：0歳', '解析時期：0歳 3月 5週', '解析タブ：入厩前',
    '解析時所属：未入厩', 'スピード：A', 'スタミナ：B', '根性：B', '気性：C', '体質：B',
    'メモリ：2', '脚質：追込', '距離適性：1600m～3000m', '適応力：D'].join('\n');
  const parsed = C.parsePasted(paste);
  check('R03', '回帰：定型文の読み取り（P01相当）',
    parsed.fields.name === 'キョウエイタッ20' && parsed.fields.spRank === 'A' && parsed.fields.stRank === 'B');
  const est = C.estimate({ spRank: 'B', stRank: 'B', sex: '牡', comment: '', growth: '不明' });
  check('R04', '回帰：推定（T13相当・合計170〜198）',
    C.fmtRange([est.sumLo, est.sumHi]) === '170〜198');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('R05', '回帰：index.html に繁殖計画の子の血統・理論の説明がある',
    html.includes('子の血統・配合理論の確認') && html.includes('ユーザー提供CSV') &&
    html.includes('配合の効果を断定する表示はしません'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
