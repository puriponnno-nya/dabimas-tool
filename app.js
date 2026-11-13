'use strict';
/* ダビマス能力判定ツール v1
前提：コメント欄には、iPhoneショートカット→Googleアプリで文字起こしした
文を貼り付ける。文字起こしは完璧ではないため、完全一致ではなく
正規化＋部分一致・あいまい照合で分類する。照合できない文は「未分類」。
スクショOCRはしない（Perplexityではファイルのアップロード上限で無理だった）。 */
var LS_KEY = 'dabimas-ability-v1';
var DATA_VERSION = 1;

/* data/*.json と同じ内容の内蔵コピー（file:// で開いたとき用）。正本は data/*.json。 */
var FALLBACK_COMMENTS = {"categories":{"exp":"期待と条件","fea":"特徴","fut":"将来評価","tal":"素質評価"},"cmt":[{"c":"tal","out":"凄い素質","src":"これは凄い素質の馬ですね"},{"c":"fut","out":"いくつかのタイトルを狙える","src":"将来はいくつかのタイトルも狙えるでしょうね"},{"c":"fea","out":"スピードが付きそう","src":"スピードが付きそうな馬体ですね"},{"c":"exp","out":"調教が上手くいけば三冠の可能性","src":"調教さえ上手くいけば三冠もあると思います"},{"c":"exp","out":"調教が上手くいけば三冠の可能性","src":"調教さえ巧くいけば三冠もあると思います"},{"c":"fut","out":"どこに出しても恥ずかしくないとの評価","src":"これならどこに出しても恥ずかしくないでしょう"},{"c":"exp","out":"しっかり育てて活躍を期待","src":"しっかり育てて活躍してもらいましょう"},{"c":"fut","out":"期待できる","src":"期待できます"},{"c":"fea","out":"スピードが付きそうな馬体／短距離適正あり／牛嶋厩舎を推奨","src":"スピードが付きそうな馬体ですね\n短距離適正もありそうですし\n牛嶋厩舎を推奨します"},{"c":"fea","out":"強い心肺機能／八木沼厩舎でスタミナ強化","src":"強い心肺機能を備えてますね長距離馬の育成が得意な八木沼厩舎でスタミナ強化が良いでしょう"},{"c":"exp","out":"桜花賞を目標にする提案","src":"まずは桜花賞を目指しましょう"},{"c":"exp","out":"活躍時期も早そう／朝日杯フューチュリティステークスを目標に仕上げる提案","src":"活躍時期も早そうですし朝日杯フューチュリティステークスを目標に仕上げてみてはいかがでしょうか"},{"c":"fut","out":"海外も視野に入れるとの評価","src":"将来は海外も視野に入れたほうが良いでしょう"}],"cmx":[],"measure":[{"kind":"BC登録はまだ先","pattern":"BC登録はまだ先ですね"},{"kind":"完成まであと一息","pattern":"完成まであと一息でしょうか"},{"kind":"準備はできた","pattern":"準備はできたようですね"}]};
var FALLBACK_RANKS = {"ranges":{"A":{"max":null,"min":100},"B":{"max":99,"min":85},"C":{"max":84,"min":70},"D":{"max":69,"min":55},"E":{"max":54,"min":0}},"talent":{"phrase":"これは凄い素質の馬ですね","spMin":81,"stMin":81},"title":{"phrase":"将来はいくつかのタイトルも狙えるでしょうね","sumMin":{"牝":150,"牡":160}},"warning":"参考・未検証（2018年資料由来）。現行のゲーム内境界は未確認。確定値ではない。"};

var COMMENTS = FALLBACK_COMMENTS;
var RANKS = FALLBACK_RANKS;

/* ---------- 正規化・あいまい照合 ---------- */
/* よくある文字起こしのゆらぎを吸収する置換表（原文の意味を変えない範囲で） */
var ALIASES = [
['凄い', 'すごい'], ['凄', 'すご'], ['巧い', '上手い'], ['巧く', '上手く'],
['厩舎', 'きゅうしゃ'], ['馬体', 'ばたい'], ['心肺機能', 'しんぱいきのう'],
['適性', '適正']
];
function cmNorm(s) {
var t = String(s || '').normalize('NFKC');
ALIASES.forEach(function (pair) { t = t.split(pair[0]).join(pair[1]);});
/* 空白・改行・句読点・記号類を除去（文字起こしの改行・空白の乱れ対策） */
return t.replace(/[\s　、。！？!?・*_'"'"'"「」『』（）()\[\]〈〉《》・\-―〜～…:：;；\/\\|]/g, '');
}
/* 文字バイグラムの Dice 係数（0〜1）。誤字が1〜2文字あっても高くなる。 */
function dice(a, b) {
if (!a ||!b) return 0;
if (a === b) return 1;
function grams(s) { var g = {}; for (var i = 0; i + 1 < s.length; i++) { var k = s.slice(i, i + 2); g[k] = (g[k] || 0) + 1;} return g;}
var ga = grams(a), gb = grams(b), hit = 0, total = 0;
Object.keys(ga).forEach(function (k) { total += ga[k]; if (gb[k]) hit += Math.min(ga[k], gb[k]);});
Object.keys(gb).forEach(function (k) { total += gb[k];});
return total? (2 * hit) / total: 0;
}
/* 1つの正規化済み文字列に対する最良の CMT 照合。score 0.75 以上で採用。
   mode 'exact'：完全一致のみ。mode 'fuzzy'：部分一致・あいまい照合も可。
   複数文をつなげた照合は 'exact' のみ。そうしないと、つなげた文の中の
   1文だけに一致して残りの文を飲み込んでしまう（例：素質文＋タイトル文）。 */
function bestMatch(normText, mode) {
var best = null;
COMMENTS.cmt.forEach(function (e) {
var key = cmNorm(e.src);
if (!key) return;
var score = 0;
if (normText === key) score = 1;
else if (mode === 'fuzzy' && (normText.indexOf(key) >= 0 || key.indexOf(normText) >= 0)) score = 0.95;
else if (mode === 'fuzzy') score = dice(normText, key);
if (score >= 0.75 && (!best || score > best.score)) best = { entry: e, score: score};
});
return best;
}
/* 文を句読点・改行で分割（空の断片は除く） */
function splitSentences(text) {
return String(text || '').split(/[\n。！？!?]+/).map(function (s) { return s.trim();})
.filter(function (s) { return s!== '';});
}
/* コメント文を分類する。manual は [{src, c}] の手修正（正規化して照合）。 */
function classify(text, manual) {
var res = { tal: [], fut: [], fea: [], exp: [], measure: [], unclassified: []};
var sentences = splitSentences(text);
var used = {};
var i = 0;
function manualFor(normText) {
if (!manual) return null;
for (var k = 0; k < manual.length; k++) {
if (cmNorm(manual[k].src) === normText) return manual[k].c;
}
return null;
}
function push(cat, out) { if (res[cat].indexOf(out) < 0) res[cat].push(out);}
while (i < sentences.length) {
var hit = false;
/* 長い複合コメント（2〜3文で1件）から先に試す */
for (var n = Math.min(3, sentences.length - i); n >= 1 &&!hit; n--) {
var joined = sentences.slice(i, i + n).join('');
var norm = cmNorm(joined);
var m = manualFor(norm);
if (m) { push(m, joined); i += n; hit = true; break;}
var b = bestMatch(norm, 'exact');
if (b) { push(b.entry.c, b.entry.out); i += n; hit = true; break;}
}
if (hit) continue;
/* 測定用コメント（検出のみ。数値判定なし） */
var one = sentences[i], normOne = cmNorm(one);
var measured = false;
COMMENTS.measure.forEach(function (e) {
if (dice(normOne, cmNorm(e.pattern)) >= 0.8 || normOne.indexOf(cmNorm(e.pattern)) >= 0) {
if (res.measure.indexOf(e.kind) < 0) res.measure.push(e.kind);
measured = true;
}
});
if (measured) { i++; continue;}
var mm = manualFor(normOne);
if (mm) { push(mm, one); i++; continue;}
/* 1行に複数のコメントがスペース区切りで並んでいる場合（文字起こしで
   句読点が落ちた場合など）は、文の中に含まれる対応表の原文をすべて拾う */
var foundAny = false;
COMMENTS.cmt.forEach(function (e) {
var key = cmNorm(e.src);
if (key && normOne.indexOf(key) >= 0) { push(e.c, e.out); foundAny = true; }
});
if (foundAny) { i++; continue; }
/* どれにも含まれない文は、あいまい照合を1文だけ試す（誤字のある文用） */
var fb = bestMatch(normOne, 'fuzzy');
if (fb) { push(fb.entry.c, fb.entry.out); i++; continue; }
res.unclassified.push(one);
i++;
}
return res;
}

/* ---------- 定型文の読み取り ---------- */
/* ユーザーが貼る定型文（例）：
   馬名：テストウマ／年齢：0歳／解析時期：0歳 3月 5週／解析タブ：入厩前
   解析時所属：未入厩／スピード：A／スタミナ：B／根性：B／気性：C／体質：B
   メモリ：2／脚質：追込／距離適性：1600m～3000m／適応力：D
   博士コメント：／特徴：／目標レース： の3つの見出し以降は複数行の文章。
   全角・半角の「：」「:」どちらでも読む。読み取れなかった項目は空欄のまま。 */
var PASTE_KEYS = {
  '馬名': 'name', '年齢': 'age', '解析時期': 'analysisTime', '解析タブ': 'analysisTab',
  '解析時所属': 'affiliation', 'スピード': 'spRank', 'スタミナ': 'stRank',
  '根性': 'gutsRank', '気性': 'temperRank', '体質': 'physiqueRank',
  'メモリ': 'memory', '脚質': 'runningStyle', '距離適性': 'distance', '適応力': 'adaptability'
};
var PASTE_SECTIONS = { '博士コメント': 'doctorComment', '特徴': 'featureComment', '目標レース': 'targetRace' };
var RANK_FIELDS = ['spRank', 'stRank', 'gutsRank', 'temperRank', 'physiqueRank'];
function parsePasted(text) {
  var out = { fields: {}, sections: {}, filled: [], missing: [] };
  var section = null;
  String(text || '').split(/\r?\n/).forEach(function (rawLine) {
    var line = rawLine.trim();
    if (!line) return;
    var m = line.match(/^([^：:]+)[：:]\s*(.*)$/);
    if (m) {
      var key = m[1].trim(), val = m[2].trim();
      if (PASTE_SECTIONS[key]) { section = PASTE_SECTIONS[key]; out.sections[section] = val ? [val] : []; return; }
      if (PASTE_KEYS[key]) {
        section = null;
        var field = PASTE_KEYS[key];
        if (RANK_FIELDS.indexOf(field) >= 0 && !/^[A-E]$/.test(val)) { out.missing.push(key); return; }
        out.fields[field] = val;
        out.filled.push(key);
        return;
      }
    }
    if (section) { out.sections[section].push(line); }
  });
  Object.keys(out.sections).forEach(function (k) { out.sections[k] = out.sections[k].join('\n'); });
  return out;
}
function fillFormFromPaste() {
  var parsed = parsePasted($('paste-text').value);
  var map = {
    name: 'f-name', age: 'f-age', analysisTime: 'f-analysis-time', analysisTab: 'f-analysis-tab',
    affiliation: 'f-affiliation', memory: 'f-memory', runningStyle: 'f-running-style',
    distance: 'f-distance', adaptability: 'f-adaptability',
    spRank: 'f-sp', stRank: 'f-st', gutsRank: 'f-guts', temperRank: 'f-temper', physiqueRank: 'f-physique'
  };
  Object.keys(parsed.fields).forEach(function (f) { if ($(map[f])) $(map[f]).value = parsed.fields[f]; });
  if (parsed.sections.doctorComment !== undefined) $('f-doctor').value = parsed.sections.doctorComment;
  if (parsed.sections.featureComment !== undefined) $('f-feature').value = parsed.sections.featureComment;
  if (parsed.sections.targetRace !== undefined) $('f-target').value = parsed.sections.targetRace;
  /* 判定用のコメント欄は3つの文章をまとめたものにする（従来の分類ロジックをそのまま使う） */
  var parts = [parsed.sections.doctorComment, parsed.sections.featureComment, parsed.sections.targetRace]
    .filter(function (x) { return x; });
  if (parts.length) $('f-comment').value = parts.join('\n');
  pendingManual = [];
  var msg = parsed.filled.length ? '読み取れました：' + parsed.filled.join('、') : '読み取れる項目がありませんでした。';
  if (parsed.missing.length) msg += '（読めなかった項目：' + parsed.missing.join('、') + '。手で入力してください）';
  $('paste-msg').textContent = msg;
  renderResult(currentFormRecord());
}

/* 素質・タイトル文の有無（あいまい照合：正規化して部分一致） */
function containsPhrase(text, phrase) {
var n = cmNorm(text), p = cmNorm(phrase);
return n.indexOf(p) >= 0 || dice(n, p) >= 0.85;
}
/* ---------- 推定（参考・未検証） ---------- */
function fmtRange(r) {
if (!r) return '—';
return r[1] === null? r[0] + '以上・上限未確定': r[0] + '〜' + r[1];
}
function estimate(rec) {
var out = { status: '', sp: null, st: null, sumMin: null, used: [], notes: []};
var sp = RANKS.ranges[rec.spRank], st = RANKS.ranges[rec.stRank];
if (!sp ||!st) { out.status = 'SP/STランクを入力してください'; return out;}
var s = [sp.min, sp.max], t = [st.min, st.max];
out.used.push('能力ランク');
if (containsPhrase(rec.comment || '', RANKS.talent.phrase)) {
s[0] = Math.max(s[0], RANKS.talent.spMin);
t[0] = Math.max(t[0], RANKS.talent.stMin);
out.used.push('凄い素質：SP・ST各81以上（2018年参考条件）');
}
if (containsPhrase(rec.comment || '', RANKS.title.phrase)) {
if (rec.sex === '牡') out.sumMin = RANKS.title.sumMin['牡'];
else if (rec.sex === '牝') out.sumMin = RANKS.title.sumMin['牝'];
else if (rec.sex === '不明') { out.sumMin = RANKS.title.sumMin['牝']; out.notes.push('性別が不明のため、タイトル条件は牝の150で計算しています');}
else { out.notes.push('センのタイトル条件は未確認のため、タイトル条件は使いません');}
if (out.sumMin!== null) out.used.push('タイトル：SP＋ST≧' + out.sumMin + '（2018年参考条件）');
}
if ((s[1]!== null && s[0] > s[1]) || (t[1]!== null && t[0] > t[1])) {
out.status = '候補なし・入力と参考条件を確認してください'; return out;
}
if (out.sumMin!== null) {
if (s[1]!== null && t[1]!== null && s[1] + t[1] < out.sumMin) {
out.status = '候補なし・入力と参考条件を確認してください'; return out;
}
if (t[1]!== null) s[0] = Math.max(s[0], out.sumMin - t[1]);
if (s[1]!== null) t[0] = Math.max(t[0], out.sumMin - s[1]);
}
out.sp = s; out.st = t;
out.status = out.used.length > 1? '参考条件による候補（未検証）': 'ランク条件のみ（参考）';
out.notes.push('個別範囲内の任意の組み合わせが適合するとは限りません。実測確定値ではありません。');
return out;
}

/* ---------- 保存（localStorage） ---------- */
function loadAll() {
try {
var raw = localStorage.getItem(LS_KEY);
if (!raw) return [];
var data = JSON.parse(raw);
if (!data || data.version!== DATA_VERSION ||!Array.isArray(data.records)) return [];
return data.records;
} catch (e) { return [];}
}
function saveAll(records) {
localStorage.setItem(LS_KEY, JSON.stringify({ version: DATA_VERSION, records: records}));
}
function newId() { return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);}

/* ---------- 画面 ---------- */
var $ = function (id) { return document.getElementById(id);};
var records = loadAll();
var pendingManual = []; /* 今の入力に対する未分類の手修正 */

function esc(s) {
return String(s == null? '': s).replace(/[&<>"']/g, function (c) {
return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
});
}
function renderResult(rec) {
var box = $('result');
var cls = classify(rec.comment || '', rec.manual || pendingManual);
var est = estimate(rec);
var html = '';
html += '<p><strong>判定：' + esc(est.status) + '</strong></p>';
if (est.sp) {
html += '<p>潜在SP候補（参考）：' + esc(fmtRange(est.sp)) + '<br>潜在ST候補（参考）：' + esc(fmtRange(est.st)) + '</p>';
if (est.sumMin!== null) html += '<p>組み合わせ条件：SP＋ST≧' + est.sumMin + '</p>';
}
html += '<p>使った条件：' + (est.used.length? esc(est.used.join('／')): 'なし') + '</p>';
var cats = { tal: '素質評価', fut: '将来評価', fea: '特徴', exp: '期待と条件'};
Object.keys(cats).forEach(function (k) {
html += '<h3>' + cats[k] + '</h3>';
html += cls[k].length? '<ul>' + cls[k].map(function (x) { return '<li>' + esc(x) + '</li>';}).join('') + '</ul>': '<p>なし</p>';
});
if (cls.measure.length) html += '<h3>測定用コメント（検出のみ・数値判定なし）</h3><ul>' + cls.measure.map(function (x) { return '<li>' + esc(x) + '</li>';}).join('') + '</ul>';
if (cls.unclassified.length) {
html += '<h3>未分類（文字起こしの誤りの可能性があります）</h3>';
html += '<p class="note">下の文は対応表にありませんでした。分類を手で選ぶと、その場で判定に反映されます。保存すると手修正も一緒に保存されます。</p>';
cls.unclassified.forEach(function (sent, idx) {
html += '<div class="manual-row"><p>' + esc(sent) + '</p><label>手で分類する <select data-unclassified="' + idx + '">'
+ '<option value="">未分類のまま</option>'
+ '<option value="tal">素質評価</option><option value="fut">将来評価</option>'
+ '<option value="fea">特徴</option><option value="exp">期待と条件</option>'
+ '</select></label></div>';
});
}
est.notes.forEach(function (n) { html += '<p class="note">' + esc(n) + '</p>';});
html += '<p class="note">' + esc(RANKS.warning) + '</p>';
box.innerHTML = html;
box.querySelectorAll('select[data-unclassified]').forEach(function (sel) {
sel.addEventListener('change', function () {
var sent = cls.unclassified[Number(sel.getAttribute('data-unclassified'))];
pendingManual = pendingManual.filter(function (m) { return cmNorm(m.src)!== cmNorm(sent);});
if (sel.value) pendingManual.push({ src: sent, c: sel.value});
renderResult(currentFormRecord());
});
});
}
function currentFormRecord() {
return {
id: $('edit-id').value || '',
name: $('f-name').value.trim(),
age: $('f-age').value.trim(),
sex: $('f-sex').value,
analysisTime: $('f-analysis-time').value.trim(),
analysisTab: $('f-analysis-tab').value.trim(),
affiliation: $('f-affiliation').value.trim(),
memory: $('f-memory').value.trim(),
growth: $('f-growth').value,
spRank: $('f-sp').value,
stRank: $('f-st').value,
gutsRank: $('f-guts').value,
temperRank: $('f-temper').value,
physiqueRank: $('f-physique').value,
runningStyle: $('f-running-style').value.trim(),
distance: $('f-distance').value.trim(),
adaptability: $('f-adaptability').value.trim(),
doctorComment: $('f-doctor').value,
featureComment: $('f-feature').value,
targetRace: $('f-target').value,
comment: $('f-comment').value,
memo: $('f-memo').value.trim(),
manual: pendingManual.slice()
};
}
function renderList() {
$('count').textContent = String(records.length);
$('empty-note').style.display = records.length? 'none': 'block';
var ul = $('horse-list');
ul.innerHTML = '';
records.forEach(function (r) {
var li = document.createElement('li');
var cls = classify(r.comment || '', r.manual || []);
var est = estimate(r);
var cats = [];
if (cls.tal.length) cats.push('素質：' + cls.tal.join('／'));
if (cls.fut.length) cats.push('将来：' + cls.fut.join('／'));
if (cls.fea.length) cats.push('特徴：' + cls.fea.join('／'));
if (cls.exp.length) cats.push('期待：' + cls.exp.join('／'));
li.innerHTML = '<p class="name">' + esc(r.name) + '</p>'
+ '<p class="meta">' + (r.age ? '年齢 ' + esc(r.age) + '／' : '') + '性別 ' + esc(r.sex) + '／成長 ' + esc(r.growth || '不明') + '／SP ' + esc(r.spRank || '—') + '／ST ' + esc(r.stRank || '—')
+ '／根性 ' + esc(r.gutsRank || '—') + '／気性 ' + esc(r.temperRank || '—') + '／体質 ' + esc(r.physiqueRank || '—')
+ ((r.runningStyle || r.distance) ? '\n脚質 ' + esc(r.runningStyle || '—') + '／距離 ' + esc(r.distance || '—') + '／適応力 ' + esc(r.adaptability || '—') : '')
+ (r.analysisTime ? '\n解析時期 ' + esc(r.analysisTime) + '（' + esc(r.analysisTab || '') + '）' : '')
+ (est.sp? '\n潜在SP（参考）' + esc(fmtRange(est.sp)) + '／潜在ST（参考）' + esc(fmtRange(est.st)): '')
+ (cats.length? '\n' + esc(cats.join('\n')): '')
+ (cls.unclassified.length? '\n未分類 ' + cls.unclassified.length + '件あり': '')
+ (r.memo? '\nメモ：' + esc(r.memo): '') + '</p>';
var editBtn = document.createElement('button');
editBtn.type = 'button'; editBtn.textContent = '編集する';
editBtn.addEventListener('click', function () { loadIntoForm(r);});
var delBtn = document.createElement('button');
delBtn.type = 'button'; delBtn.textContent = '削除する'; delBtn.className = 'danger';
delBtn.addEventListener('click', function () {
if (!window.confirm('「' + r.name + '」を削除しますか？')) return;
records = records.filter(function (x) { return x.id!== r.id;});
saveAll(records); renderList();
});
li.appendChild(editBtn); li.appendChild(delBtn);
ul.appendChild(li);
});
}
function loadIntoForm(r) {
$('edit-id').value = r.id;
$('f-name').value = r.name;
$('f-age').value = r.age || '';
$('f-sex').value = r.sex;
$('f-analysis-time').value = r.analysisTime || '';
$('f-analysis-tab').value = r.analysisTab || '';
$('f-affiliation').value = r.affiliation || '';
$('f-memory').value = r.memory || '';
$('f-growth').value = r.growth || '不明';
$('f-sp').value = r.spRank || '';
$('f-st').value = r.stRank || '';
$('f-guts').value = r.gutsRank || '';
$('f-temper').value = r.temperRank || '';
$('f-physique').value = r.physiqueRank || '';
$('f-running-style').value = r.runningStyle || '';
$('f-distance').value = r.distance || '';
$('f-adaptability').value = r.adaptability || '';
$('f-doctor').value = r.doctorComment || '';
$('f-feature').value = r.featureComment || '';
$('f-target').value = r.targetRace || '';
$('f-comment').value = r.comment || '';
$('f-memo').value = r.memo || '';
pendingManual = (r.manual || []).slice();
$('save-btn').textContent = '判定して更新';
$('cancel-edit').hidden = false;
renderResult(currentFormRecord());
window.scrollTo(0, 0);
}
function resetForm() {
$('edit-id').value = '';
$('horse-form').reset();
pendingManual = [];
$('save-btn').textContent = '判定して登録';
$('cancel-edit').hidden = true;
$('form-error').textContent = '';
$('result').innerHTML = '<p>まだ判定していません。</p>';
}

$('horse-form').addEventListener('submit', function (e) {
e.preventDefault();
var rec = currentFormRecord();
if (!rec.name) { $('form-error').textContent = '馬名を入力してください'; return;}
if (rec.spRank &&!RANKS.ranges[rec.spRank]) { $('form-error').textContent = 'SPランクが不正です'; return;}
if (rec.stRank &&!RANKS.ranges[rec.stRank]) { $('form-error').textContent = 'STランクが不正です'; return;}
$('form-error').textContent = '';
var now = new Date().toISOString();
if (rec.id) {
var i = records.findIndex(function (x) { return x.id === rec.id;});
if (i < 0) { $('form-error').textContent = '編集中の馬が見つかりません'; return;}
rec.createdAt = records[i].createdAt; rec.updatedAt = now;
records[i] = rec;
} else {
rec.id = newId(); rec.createdAt = now; rec.updatedAt = now;
records.push(rec);
}
saveAll(records);
renderResult(rec);
renderList();
resetForm();
});
$('cancel-edit').addEventListener('click', resetForm);
$('f-comment').addEventListener('input', function () { pendingManual = []; renderResult(currentFormRecord());});
['f-name', 'f-sex', 'f-sp', 'f-st'].forEach(function (id) {
$(id).addEventListener('change', function () { renderResult(currentFormRecord());});
});

$('paste-btn').addEventListener('click', fillFormFromPaste);

/* ---------- JSON 書き出し・読み込み（全件置き換え・検証あり） ---------- */
function validRecord(r) {
if (!r || typeof r!== 'object') return false;
if (typeof r.id!== 'string' ||!r.id) return false;
if (typeof r.name!== 'string' ||!r.name.trim()) return false;
if (['牡', '牝', 'セン', '不明'].indexOf(r.sex) < 0) return false;
if (r.growth !== undefined && ['早寄り', '早寄りの中間', '中間', '遅寄りの中間', '遅寄り', '不明'].indexOf(r.growth) < 0) return false;
if (r.spRank &&!RANKS.ranges[r.spRank]) return false;
if (r.stRank &&!RANKS.ranges[r.stRank]) return false;
if (r.gutsRank &&!RANKS.ranges[r.gutsRank]) return false;
if (r.temperRank &&!RANKS.ranges[r.temperRank]) return false;
if (r.physiqueRank &&!RANKS.ranges[r.physiqueRank]) return false;
var optText = ['age', 'analysisTime', 'analysisTab', 'affiliation', 'memory', 'runningStyle', 'distance', 'adaptability', 'doctorComment', 'featureComment', 'targetRace'];
for (var j = 0; j < optText.length; j++) {
if (r[optText[j]] !== undefined && typeof r[optText[j]] !== 'string') return false;
}
if (typeof r.comment!== 'string' || typeof r.memo!== 'string') return false;
if (r.manual!== undefined) {
if (!Array.isArray(r.manual)) return false;
for (var i = 0; i < r.manual.length; i++) {
if (typeof r.manual[i].src!== 'string' || ['tal', 'fut', 'fea', 'exp'].indexOf(r.manual[i].c) < 0) return false;
}
}
return true;
}
$('export-btn').addEventListener('click', function () {
var blob = new Blob([JSON.stringify({ version: DATA_VERSION, exportedAt: new Date().toISOString(), records: records}, null, 2)], { type: 'application/json'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'dabimas-ability-v1.json';
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href);}, 1000);
$('io-msg').textContent = records.length + '件を書き出しました。';
$('io-error').textContent = '';
});
$('import-file').addEventListener('change', function (e) {
var file = e.target.files && e.target.files[0];
if (!file) return;
var reader = new FileReader();
reader.onload = function () {
try {
var data = JSON.parse(String(reader.result));
if (!data || data.version!== DATA_VERSION ||!Array.isArray(data.records)) throw new Error('形式が違います（version 1 の全件データではありません）');
var ids = {};
data.records.forEach(function (r) {
if (!validRecord(r)) throw new Error('不正なレコードがあります（馬名・性別・ランクを確認してください）');
if (ids[r.id]) throw new Error('IDが重複しています');
ids[r.id] = true;
});
records = data.records;
saveAll(records);
renderList(); resetForm();
$('io-msg').textContent = records.length + '件を読み込みました（全件置き換え）。';
$('io-error').textContent = '';
} catch (err) {
/* 既存データは変えない */
$('io-error').textContent = '読み込めませんでした：' + err.message + '（既存の登録は変えていません）';
$('io-msg').textContent = '';
}
e.target.value = '';
};
reader.readAsText(file);
});

/* ---------- 起動 ---------- */
function loadData() {
return Promise.all([
fetch('./data/comments.json').then(function (r) { if (!r.ok) throw new Error('comments'); return r.json();}).catch(function () { return null;}),
fetch('./data/ranks.json').then(function (r) { if (!r.ok) throw new Error('ranks'); return r.json();}).catch(function () { return null;})
]).then(function (pair) {
if (pair[0] && Array.isArray(pair[0].cmt)) COMMENTS = pair[0];
if (pair[1] && pair[1].ranges) RANKS = pair[1];
});
}
loadData().then(function () { renderList();});
