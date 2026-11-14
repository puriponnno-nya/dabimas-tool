'use strict';
/* Nodeハーネス: app.js を vm で読み、自分の馬（自家生産馬：2代目以降の配合用）
を検証する。使い方: node scripts/test-own-horses.js
ブラウザのDOM/localStorage/fetch を最小限スタブする。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(no, name, cond, extra) {
if (cond) { pass++; console.log(`PASS ${no} ${name}`);}
else { fail++; console.log(`FAIL ${no} ${name}${extra? ' — ' + extra: ''}`);}
}

// ---------- DOMスタブ ----------
function makeEl() {
const t = {
value: '', textContent: '', innerHTML: '', hidden: false, files: null,
style: {}, children: [],
addEventListener() {}, appendChild(c) { this.children.push(c);},
reset() {}, scrollIntoView() {}, click() {},
querySelectorAll() { return [];},
};
return new Proxy(t, {
get(o, k) { if (k in o) return o[k]; return function () {};},
set(o, k, v) { o[k] = v; return true;},
});
}
const els = {};
function getEl(id) { if (!els[id]) els[id] = makeEl(); return els[id];}
const store = {};
const sandbox = {
console,
setTimeout, clearTimeout, Promise,
URL,
window: {},
localStorage: {
getItem: (k) => (k in store? store[k]: null),
setItem: (k, v) => { store[k] = String(v);},
removeItem: (k) => { delete store[k];},
},
document: {
getElementById: getEl,
createElement: () => makeEl(),
},
fetch: (url) => {
const file = path.join(ROOT, url.replace(/^\.\//, ''));
try {
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
return Promise.resolve({ ok: true, json: () => Promise.resolve(data)});
} catch (e) {
return Promise.resolve({ ok: false, json: () => Promise.reject(e)});
}
},
};
sandbox.window.confirm = () => true;
sandbox.window.scrollTo = () => {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), sandbox, { filename: 'app.js'});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* テスト用の小さな偽データ。test-pedigree.js と同じ fakeHorse。 */
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
return { n: name, anc};
}
/* 自家生産馬のテスト用レコード。anc は buildChildAnc で作ったものを使う。 */
function fakeOwnHorse(id, name, sex, anc, generation) {
return {
id, name, sex, sireName: 'テスト父馬', damName: 'テスト母馬',
sireDbIndex: null, damDbIndex: null, sireOwnId: null, damOwnId: null,
planId: '', generation: generation || 2, anc,
createdAt: '', updatedAt: '',
};
}
/* 要素の子孫に textContent が text のボタンがあるか（スタブDOM用）。 */
function hasButtonText(el, text) {
if (!el ||!Array.isArray(el.children)) return false;
return el.children.some((c) => c.textContent === text || hasButtonText(c, text));
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
const dam1 = db.horses[1];
const dam3 = db.horses[3]; // アイシラヌユエ20XX

// --- O: 子の血統（anc）の組み立て ---
const childAnc = C.buildChildAnc(sire0, dam3);
check('O01', '子の血統は15件で、祖先名は全件非空',
Array.isArray(childAnc) && childAnc.length === 15 &&
childAnc.every((a) => Array.isArray(a) && a[0]));
check('O02', '子の血統0番目は父馬そのもの（子系統・因子は父馬のもの、親系統は父馬の父の親系統＝Teddyで補う）',
childAnc[0][0] === 'アイアンリージ-巌瓏-' && childAnc[0][1] === 'Teddy' &&
childAnc[0][2] === 'テディ系' && childAnc[0][3] === '強' && childAnc[0][4] === '長',
JSON.stringify(childAnc[0]));
const ancNames = childAnc.map((a) => a[0]);
check('O03', '子の血統1〜7番目は父馬の anc[0,1,2,5,8,9,12]',
ancNames[1] === 'ブルリー' && ancNames[2] === 'Bull Dog' && ancNames[3] === 'Teddy' &&
ancNames[4] === 'Ballot' && ancNames[5] === 'War Admiral' &&
ancNames[6] === "Man o'War" && ancNames[7] === 'Sir Gallahad',
JSON.stringify(ancNames.slice(1, 8)));
check('O04', '子の血統8〜14番目は母馬の anc[0,1,2,5,8,9,12]（8番目は母馬の父）',
ancNames[8] === 'トーホウエンペラー' && ancNames[9] === 'ブライアンズタイム' &&
ancNames[10] === 'ロベルト' && ancNames[11] === 'ノーリュート' &&
ancNames[12] === 'モンズーン' && ancNames[13] === 'Konigsstuhl' &&
ancNames[14] === 'ファーディナンド',
JSON.stringify(ancNames.slice(8)));
check('O05', '片方でも欠けると子の血統は作らない',
C.buildChildAnc(null, dam3) === null && C.buildChildAnc(sire0, null) === null);

// --- O: 子の登録（2代目） ---
const plan1 = { id: 'p1', name: 'テスト配合', sireName: sire0.n, damName: dam3.n, status: '計画', sireDbIndex: 0, damDbIndex: 3};
const res1 = C.registerOwnHorseFromPlan(plan1, C.defaultChildName(plan1), '牝');
check('O06', '子を登録できる（名前は計画名＋「の子」、性別・世代2・計画IDが残る）',
res1.ok === true && res1.horse.name === 'テスト配合の子' && res1.horse.sex === '牝' &&
res1.horse.generation === 2 && res1.horse.planId === 'p1' &&
res1.horse.sireName === sire0.n && res1.horse.damName === dam3.n &&
Array.isArray(res1.horse.anc) && res1.horse.anc.length === 15,
JSON.stringify(res1));
const gen2 = res1.horse;
check('O07', '登録した子は別のキーに保存される（馬・計画のキーとは別）',
(() => {
const raw = store[C.LS_OWN_KEY];
if (!raw) return false;
const data = JSON.parse(raw);
return data.version === C.DATA_VERSION && Array.isArray(data.ownHorses) && data.ownHorses.length === 1 &&
data.ownHorses[0].id === gen2.id && C.LS_OWN_KEY!== C.LS_PLANS_KEY && C.LS_OWN_KEY!== C.LS_KEY;
})());
check('O08', '子の名前はユーザーが決められる（指定した名前で登録される）',
C.registerOwnHorseFromPlan(plan1, '自由な名前の子', '牡').ok === true &&
C.ownHorses.some((h) => h.name === '自由な名前の子' && h.sex === '牡'));
check('O09', '子の登録の入力エラー（名前が空・性別が不正・親が解決できない）',
C.registerOwnHorseFromPlan(plan1, ' ', '牡').ok === false &&
C.registerOwnHorseFromPlan(plan1, '名前', 'セン').ok === false &&
C.registerOwnHorseFromPlan({ id: 'px', name: '名前だけ計画', status: '計画', sireDbIndex: null, damDbIndex: null}, '名前', '牡').ok === false &&
C.registerOwnHorseFromPlan(null, '名前', '牡').ok === false);
check('O10', 'defaultChildName（計画名＋「の子」、計画名なしは「配合計画の子」）',
C.defaultChildName(plan1) === 'テスト配合の子' &&
C.defaultChildName({}) === '配合計画の子' && C.defaultChildName(null) === '配合計画の子');

// --- O: 登録した子を親に選ぶ（2代目の子の血統） ---
const pair2 = C.resolvePlanParents({ sireOwnId: gen2.id, damDbIndex: 1});
check('O11', '登録した子を父馬に選んだ計画の両親が解決できる',
pair2!== null && pair2.sire.n === 'テスト配合の子' && pair2.dam.n === dam1.n);
const grandRows = C.buildChildPedigree(pair2.sire, pair2.dam);
check('O12', '2代目の子の血統：父＝登録した子、父父＝元の父馬、父母父＝元の母馬の父',
grandRows[0].name === 'テスト配合の子' && grandRows[1].name === 'アイアンリージ-巌瓏-' &&
grandRows[5].name === 'トーホウエンペラー' && grandRows[8].name === dam1.anc[0][0],
JSON.stringify(grandRows.map((r) => r.name)));
check('O13', '登録した子を母馬に選んだ計画の両親も解決できる',
(() => {
const p = C.resolvePlanParents({ sireDbIndex: 0, damOwnId: gen2.id});
return p!== null && p.dam.n === 'テスト配合の子' && p.sire.n === sire0.n;
})());

// --- O: 3代目の連鎖 ---
const plan2 = { id: 'p2', name: '二代目配合', sireName: gen2.name, damName: dam1.n, status: '計画', sireDbIndex: null, damDbIndex: 1, sireOwnId: gen2.id, damOwnId: null};
const res3 = C.registerOwnHorseFromPlan(plan2, '孫の子', '牡');
check('O14', '3代目の子を登録できる（世代3、父父＝元の父馬）',
res3.ok === true && res3.horse.generation === 3 &&
res3.horse.anc[0][0] === 'テスト配合の子' &&
res3.horse.anc[1][0] === 'アイアンリージ-巌瓏-' &&
res3.horse.anc[8][0] === dam1.anc[0][0],
res3.ok? JSON.stringify(res3.horse.anc.map((a) => a[0])): JSON.stringify(res3));
check('O15', '3代目の子を親に選ぶと4代目の血統が組み立てられる',
(() => {
const p = C.resolvePlanParents({ sireOwnId: res3.horse.id, damDbIndex: 3});
if (!p) return false;
const rows = C.buildChildPedigree(p.sire, p.dam);
return rows[0].name === '孫の子' && rows[1].name === 'テスト配合の子' &&
rows[2].name === 'アイアンリージ-巌瓏-';
})());

// --- O: 配合理論・インブリード（自家生産馬を親にしても判定できる） ---
check('O16', '自家生産馬を親にした配合理論の判定ができる（参考・未検証の表示つき）',
(() => {
const r = C.checkMatingTheories(C.ownHorsePedigree(gen2), dam1);
const html = C.buildChildPedigreeHtml(C.ownHorsePedigree(gen2), dam1);
return r!== null && typeof r.omoshiroi.hit === 'boolean' &&
typeof r.migoto.hit === 'boolean' && typeof r.yokudekita.hit === 'boolean' &&
html.includes('テスト配合の子') && html.includes('参考・未検証');
})());
// 偽馬で作るクロス：父A・母Bの子C（牝）を母に、父Dと配合する。
// Cの血統には「クロス祖先」が父方（anc[1]）と母方（anc[12]）に入る。
const fakeSire = fakeHorse('父A', { 0: 'X'}, { 0: 'クロス祖先'}, { 0: ['速', '長']});
const fakeDam = fakeHorse('母B', { 8: 'Y'}, { 8: 'クロス祖先'});
const fakeChildAnc = C.buildChildAnc(fakeSire, fakeDam);
const fakeChild = fakeOwnHorse('o-cross', '子C', '牝', fakeChildAnc, 2);
C.ownHorses.push(fakeChild);
const fakeSire2 = fakeHorse('父D', { 0: 'Z'}, { 0: 'クロス祖先'});
const crosses = C.findInbreeding(fakeSire2, C.ownHorsePedigree(fakeChild));
check('O17', 'インブリード：自家生産馬を母にした配合で、子に受け継がれた祖先のクロスを検出する（父方2代 × 母方3代）',
crosses.length === 1 && crosses[0].name === 'クロス祖先' &&
crosses[0].pairs.some((pr) => pr.sireGen === 2 && pr.damGen === 3 &&
pr.sireLabel === '父父' && pr.damLabel === '母父父') &&
crosses[0].f1 === '速' && crosses[0].f2 === '長',
JSON.stringify(crosses));
// 面白い配合：自家生産馬のずらした親系統（C.anc[5]/[8]/[12]）が判定に使われる。
const funSire = fakeHorse('父E', { 0: 'A', 5: 'B', 8: 'C', 12: 'D'});
const funDam = fakeHorse('母F', { 0: 'E', 5: 'F', 8: 'G', 12: 'A'});
const funChildAnc = C.buildChildAnc(funSire, funDam);
const funChild = fakeOwnHorse('o-fun', '面白い子', '牡', funChildAnc, 2);
const funOther = fakeHorse('相手馬', { 0: 'H', 5: 'I', 8: 'J', 12: 'K'});
check('O18', '面白い配合：自家生産馬の親系統（1代ずらしたもの）が判定に使われる（8種類で成立。子の anc[0] の親系統も父馬の父の親系統で補うため、空のときの7種類から1増える）',
(() => {
const r = C.checkMatingTheories(C.ownHorsePedigree(funChild), funOther);
return r.omoshiroi.hit === true && r.omoshiroi.distinctCount === 8;
})());

// --- O: 性別による出し分け ---
const ownMale = fakeOwnHorse('o-m', '牡馬テスト', '牡', childAnc, 2);
const ownFemale = fakeOwnHorse('o-f', '牝馬テスト', '牝', childAnc, 2);
const ownUnknown = fakeOwnHorse('o-u', '不明馬テスト', '不明', childAnc, 2);
C.ownHorses = [ownMale, ownFemale, ownUnknown];
check('O19', '性別による出し分け：父馬欄は牡・不明、母馬欄は牝・不明',
(() => {
const s = C.searchOwnHorses({ name: ''}, 'sire').map((h) => h.name);
const d = C.searchOwnHorses({ name: ''}, 'dam').map((h) => h.name);
return s.includes('牡馬テスト') && s.includes('不明馬テスト') &&!s.includes('牝馬テスト') &&
d.includes('牝馬テスト') && d.includes('不明馬テスト') &&!d.includes('牡馬テスト');
})());
check('O20', '自家生産馬の名前検索（部分一致）',
C.searchOwnHorses({ name: '牡馬'}, 'sire').length === 1 &&
C.searchOwnHorses({ name: '馬テスト'}, 'sire').length === 2 &&
C.searchOwnHorses({ name: 'いない名前'}, 'sire').length === 0);
check('O21', '因子・非凡・天性・子系統で絞ると自家生産馬は候補に出ない（その情報を持たないため）',
C.searchOwnHorses({ name: '', factor: '長'}, 'sire').length === 0 &&
C.searchOwnHorses({ name: '', chi: 'テディ系'}, 'sire').length === 0 &&
C.searchOwnHorses({ name: '', hibon: '鉄情不羈'}, 'sire').length === 0 &&
C.searchOwnHorses({ name: '', talent: '飛燕'}, 'sire').length === 0);

// --- O: 計画フォームからの選択 ---
check('O22', '自家生産馬を父馬に選ぶと、欄と選択状態に入る（DB選択は外れる）',
(() => {
C.selectedDb.sire = 0; C.selectedOwn.sire = null;
C.chooseOwnHorseForPlan('sire', 'o-m');
return C.selectedOwn.sire === 'o-m' && C.selectedDb.sire === null &&
getEl('p-sire').value === '牡馬テスト';
})());
check('O23', '性別に合わない役割には選べない（牝馬を父馬には選べない）',
(() => {
C.chooseOwnHorseForPlan('sire', 'o-f');
return C.selectedOwn.sire === 'o-m' && getEl('p-sire').value === '牡馬テスト';
})());
check('O24', '自家生産馬を母馬に選べる（牝・不明）',
(() => {
C.chooseOwnHorseForPlan('dam', 'o-f');
const okF = C.selectedOwn.dam === 'o-f' && getEl('p-dam').value === '牝馬テスト';
C.chooseOwnHorseForPlan('dam', 'o-u');
return okF && C.selectedOwn.dam === 'o-u' && getEl('p-dam').value === '不明馬テスト';
})());
check('O25', 'DB馬を選ぶと自家生産馬の選択が外れる（片方だけが残る）',
(() => {
C.chooseStallionForPlan(0, 'sire');
return C.selectedDb.sire === 0 && C.selectedOwn.sire === null;
})());

// --- O: 計画の検証・解決 ---
check('O26', 'validPlan は自家生産馬のIDつき計画を通し、文字列でないIDは拒否する',
C.validPlan({ id: 'p1', name: 'テスト計画', status: '計画', sireOwnId: 'o-m', damDbIndex: 3}) === true &&
C.validPlan({ id: 'p1', name: 'テスト計画', status: '計画', sireOwnId: 123}) === false &&
C.validPlan({ id: 'p1', name: 'テスト計画', status: '計画', damOwnId: {}}) === false);
check('O27', 'planHasPedigreePair：DB同士・自家生産馬＋DBは真、名前だけ・空は偽',
C.planHasPedigreePair({ sireDbIndex: 0, damDbIndex: 3}) === true &&
C.planHasPedigreePair({ sireOwnId: 'o-m', damDbIndex: 3}) === true &&
C.planHasPedigreePair({ sireDbIndex: null, damDbIndex: null}) === false &&
C.planHasPedigreePair({}) === false);
check('O28', '旧計画（自家生産馬の欄なし）も読めて、DB同士の子の血統が解決できる',
C.resolvePlanParents({ sireDbIndex: 0, damDbIndex: 3})!== null &&
C.validPlan({ id: 'p9', name: '旧計画', status: '計画', sireDbIndex: 0, damDbIndex: 3}) === true);

// --- O: 削除 ---
check('O29', '自分の馬を削除できる（削除後は親として解決できない）',
(() => {
C.deleteOwnHorse('o-f');
return C.findOwnHorse('o-f') === null && C.ownHorses.length === 2 &&
C.resolvePlanParents({ sireDbIndex: 0, damOwnId: 'o-f'}) === null &&
C.planHasPedigreePair({ sireDbIndex: 0, damOwnId: 'o-f'}) === false;
})());

// --- O: 検証・読み込み ---
const validOwn = fakeOwnHorse('o-v', '検証馬', '牡', childAnc, 2);
check('O30', 'validOwnHorse：正しい馬は通り、性別・血統・世代の不正は拒否する',
C.validOwnHorse(validOwn) === true &&
C.validOwnHorse(Object.assign({}, validOwn, { sex: 'セン'})) === false &&
C.validOwnHorse(Object.assign({}, validOwn, { name: ' '})) === false &&
C.validOwnHorse(Object.assign({}, validOwn, { anc: childAnc.slice(0, 14)})) === false &&
C.validOwnHorse(Object.assign({}, validOwn, { generation: 1})) === false);
check('O31', 'loadOwnHorses：壊れたJSONは空、無効な馬は除いて読む',
(() => {
store[C.LS_OWN_KEY] = '{壊れたJSON';
const broken = C.loadOwnHorses();
store[C.LS_OWN_KEY] = JSON.stringify({ version: 1, ownHorses: [validOwn, Object.assign({}, validOwn, { id: 'o-bad', sex: 'セン'})]});
const mixed = C.loadOwnHorses();
C.saveOwnHorses(C.ownHorses);
return broken.length === 0 && mixed.length === 1 && mixed[0].id === 'o-v';
})());
check('O32', 'parseImportData：自分の馬つきJSONは通り、ない旧形式は既存の自分の馬を残す',
(() => {
const withOwn = C.parseImportData(
{ version: 1, records: [], plans: [], ownHorses: [validOwn]}, [], []);
const withoutOwn = C.parseImportData(
{ version: 1, records: [], plans: []}, [], C.ownHorses);
let threw = false;
try {
C.parseImportData(
{ version: 1, records: [], plans: [], ownHorses: [Object.assign({}, validOwn, { sex: 'セン'})]}, [], []);
} catch (e) { threw = true;}
let threwDup = false;
try {
C.parseImportData(
{ version: 1, records: [], plans: [], ownHorses: [validOwn, validOwn]}, [], []);
} catch (e) { threwDup = true;}
return withOwn.ownHorses.length === 1 && withoutOwn.ownHorses === C.ownHorses &&
threw === true && threwDup === true;
})());
check('O33', 'buildExportData に自分の馬が含まれる',
(() => {
const data = C.buildExportData();
return Array.isArray(data.ownHorses) && data.ownHorses.length === C.ownHorses.length;
})());

// --- O: 画面（計画カードの登録欄・自分の馬一覧） ---
C.plans = [
{ id: 'p1', name: 'DB計画', sireName: sire0.n, damName: dam3.n, status: '計画', sireDbIndex: 0, damDbIndex: 3},
{ id: 'p2', name: '名前だけ計画', sireName: 'テスト父馬', damName: 'テスト母馬', status: '計画', sireDbIndex: null, damDbIndex: null},
{ id: 'p3', name: '自家生産馬計画', sireName: '牡馬テスト', damName: dam3.n, status: '計画', sireDbIndex: null, damDbIndex: 3, sireOwnId: 'o-m', damOwnId: null},
];
C.renderPlans();
const planLis = getEl('plan-list').children;
check('O34', 'DB両方・自家生産馬＋DBの計画カードに「子を登録する」が出る（名前だけの計画には出ない）',
planLis.length === 3 &&
hasButtonText(planLis[0], '子を登録する') &&
!hasButtonText(planLis[1], '子を登録する') &&
hasButtonText(planLis[2], '子を登録する'),
'lis=' + planLis.length);
check('O35', '自家生産馬を親にした計画カードにも子の血統・配合理論が出る',
htmlContains(planLis[2], '子の血統・配合理論を見る') &&
htmlContains(planLis[2], '牡馬テスト'));
C.ownHorses = [ownMale, ownUnknown];
C.renderOwnHorses();
const ownLis = getEl('own-list').children;
check('O36', '自分の馬一覧：名前・・性別・世代が出て、牡は父馬ボタンだけ、不明は両方のボタンが出る',
ownLis.length === 2 &&
ownLis[0].innerHTML.includes('牡馬テスト') && ownLis[0].innerHTML.includes('') &&
hasButtonText(ownLis[0], '父馬に選ぶ') &&!hasButtonText(ownLis[0], '母馬に選ぶ') &&
hasButtonText(ownLis[1], '父馬に選ぶ') && hasButtonText(ownLis[1], '母馬に選ぶ') &&
getEl('own-count').textContent === '2',
'lis=' + ownLis.length);
check('O37', '自分の馬一覧の血統（5代・参考）の表示に、ずらした血統の祖先名が出る',
(() => {
// renderOwnHorses は血統表を details 内の div.innerHTML に入れる
const li = ownLis[0];
const det = li.children.find((c) => Array.isArray(c.children) && c.children.length >= 2);
return!!det && det.children[1].innerHTML.includes('ブルリー') &&
det.children[1].innerHTML.includes('トーホウエンペラー');
})());

// --- 回帰 ---の前に追加：DB未読み込み時の候補表示
check('O38', 'データベースが読み込めていなくても、自家生産馬の候補だけは出る',
(() => {
const saved = C.STALLIONS;
C.STALLIONS = null;
getEl('p-sire').value = '牡馬';
C.renderPlanSuggestions('sire');
const items = getEl('p-sire-suggest').children;
const found = items.some((li) => Array.isArray(li.children) &&
li.children.some((b) => String(b.textContent || '').indexOf('【自家生産馬】') === 0));
C.STALLIONS = saved;
getEl('p-sire').value = '';
return found;
})());

// --- 回帰 ---
check('R01', '回帰：馬名の部分一致（アイアンリージ→3件）',
C.searchStallions({ name: 'アイアンリージ'}).length === 3);
check('R02', '回帰：DB番号つき計画は validPlan を通る',
C.validPlan({ id: 'p1', name: 'テスト計画', status: '計画', sireName: sire0.n, sireDbIndex: 0, damDbIndex: 3}));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('R03', '回帰：index.html に自分の馬の説明と一覧がある',
html.includes('自分の馬（自家生産馬）') && html.includes('own-list') &&
html.includes('【自家生産馬】') && html.includes('子を登録する'));
check('R04', '回帰：index.html のバックアップ説明に自分の馬が含まれる',
html.includes('馬＋繁殖計画＋自分の馬'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail? 1: 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2);});
