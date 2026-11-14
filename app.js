'use strict';
/* ダビマス能力判定ツール v1
前提：コメント欄には、iPhoneショートカット→Googleアプリで文字起こしした
文を貼り付ける。文字起こしは完璧ではないため、完全一致ではなく
正規化＋部分一致・あいまい照合で分類する。照合できない文は「未分類」。
スクショOCRはしない（Perplexityではファイルのアップロード上限で無理だった）。 */
var LS_KEY = 'dabimas-ability-v1';
var DATA_VERSION = 1;

/* data/*.json と同じ内容の内蔵コピー（file:// で開いたとき用）。正本は data/*.json。 */
var FALLBACK_COMMENTS = {"categories":{"exp":"期待と条件","fea":"特徴","fut":"将来評価","tal":"素質評価"},"cmt":[{"c":"tal","out":"凄い素質","src":"これは凄い素質の馬ですね"},{"c":"fut","out":"いくつかのタイトルを狙える","src":"将来はいくつかのタイトルも狙えるでしょうね"},{"c":"fea","out":"スピードが付きそう","src":"スピードが付きそうな馬体ですね"},{"c":"exp","out":"調教が上手くいけば三冠の可能性","src":"調教さえ上手くいけば三冠もあると思います"},{"c":"exp","out":"調教が上手くいけば三冠の可能性","src":"調教さえ巧くいけば三冠もあると思います"},{"c":"fut","out":"どこに出しても恥ずかしくないとの評価","src":"これならどこに出しても恥ずかしくないでしょう"},{"c":"exp","out":"しっかり育てて活躍を期待","src":"しっかり育てて活躍してもらいましょう"},{"c":"fut","out":"期待できる","src":"期待できます"},{"c":"fea","out":"スピードが付きそうな馬体／短距離適正あり／牛嶋厩舎を推奨","src":"スピードが付きそうな馬体ですね\n短距離適正もありそうですし\n牛嶋厩舎を推奨します"},{"c":"fea","out":"強い心肺機能／八木沼厩舎でスタミナ強化","src":"強い心肺機能を備えてますね長距離馬の育成が得意な八木沼厩舎でスタミナ強化が良いでしょう"},{"c":"exp","out":"桜花賞を目標にする提案","src":"まずは桜花賞を目指しましょう"},{"c":"exp","out":"活躍時期も早そう／朝日杯フューチュリティステークスを目標に仕上げる提案","src":"活躍時期も早そうですし朝日杯フューチュリティステークスを目標に仕上げてみてはいかがでしょうか"},{"c":"fut","out":"海外も視野に入れるとの評価","src":"将来は海外も視野に入れたほうが良いでしょう"}],"cmx":[],"measure":[{"kind":"BC登録はまだ先（スペースなし）","pattern":"BC登録はまだ先ですね","spaceSensitive":true},{"kind":"BC登録は　まだ先（スペースあり）","pattern":"BC登録は　まだ先ですね","spaceSensitive":true},{"kind":"完成まであと一息","pattern":"完成まであと一息でしょうか"},{"kind":"準備はできた","pattern":"準備はできたようですね"}]};
var FALLBACK_RANKS = {"analysisStructure":{"middle":"中段はSPとSTのどちらが勝っているか（バランス）","note":"馬体解析レポートの3段構造（ユーザー検証による推定・共有情報。参考・未検証）","upper":"上段（1行目＋2〜3行目）はSP＋STの合計値（総合力）"},"bands":{"g1":{"max":149,"min":140,"name":"G1を狙える"},"glow":{"added":"2025-02-19","min":275,"name":"後光","note":"入厩前・上段コメント。2025年2月19日の更新で追加。2025-02-28のふふ牧場氏X投稿「274 すが／275 後光／確認しました」で274/275両側の一次報告あり（SP・ST内訳、測定手順、馬名、画像なし、同じ馬か別馬かも未確認）。境界確定ではない。","when":"入厩前・上段コメント"},"god":{"added":"2026-03","min":300,"name":"馬神","note":"2025年はGⅠ勝利後の下段コメント。2026年3月からは入厩前にも出る。入厩前の文言「この御方は馬神様の化身かもしれません 拝んでもいいですか？」。合計300での表示例（レオ蔵牧場 note 2025-03-31、SP177・ST123）あり。299で非表示・300で表示の対比検証は未確認。","phrase":"この御方は馬神様の化身かもしれません","when":"2025年はGⅠ勝利後の下段コメント、2026年3月からは入厩前にも"},"overseas":{"max":229,"min":180,"name":"海外も視野"},"representative":{"max":249,"min":230,"name":"時代を代表"},"shogun":{"max":null,"min":250,"name":"時代を築く"},"title":{"female":{"max":179,"min":150},"male":{"max":179,"min":160},"name":"いくつかのタイトル"},"weight":{"max":139,"min":120,"name":"重賞を狙える"}},"bcMark":{"method":"条件を揃えた2頭を「ひとりでBC」で走らせ、印が釣り合うまで芝一杯調教の本数を増やす。才能の効果を「芝一杯◯本分」で表す。","note":"BC印比較によるスピード測定（参考情報。v1では測定機能として実装しない）。注意点：内枠優位、コースと騎手の固定（新潟など）、隠し得意距離（距離適性範囲内で特定の1距離のみスピードが高まる）、調子の固定。","target":"特別調教師才能などのスピード上昇効果"},"entryStamina":{"note":"入厩直後のスタミナは最大値（限界値）の半分という仕様があるとされる。入厩時点でスタミナDでも、育成完了時の最大スタミナがAやBに到達しうる。入厩時のSTランクだけで育成後のSTを断定しない。","rule":"入厩直後のスタミナは最大値の半分"},"forecastNote":"産駒予想の画面では、上段コメントは「凄い素質／海外も視野」までしか出ない。後光が出ないからといって合計275未満とは限らない。","measurementHypothesis":{"hypothesis":"スピード・スタミナ測定は、入厩前と入厩後の調教本数によるコメントの推移で行うはず（仮説・未確定）。今の最適は未確定。","needed":["解析時期（入厩前／入厩後）","調教本数","コメント文（測定用コメント3種）","SP/STランク","メモリ","解析日・週"],"note":"将来の測定に使うかもしれない記録だけを残す。数値測定の機能はまだ作らない。要らなくなったら消してよい。"},"measureThresholds":{"note":"測定用コメントの変化条件（ユーザー検証による推定・共有情報。参考・未検証）。公式発表はない。調教本数で一律に変わるのではなく、スピードの最大値に対する到達率と、成長タイプ（メモリ）で変わる。数値を出す計算はしない。","memory1":{"memory":"メモリ1・超早熟","at75":"完成まであと一息でしょうか","at85":"準備はできたようですね","note":"75%で「あと一息」、85%で「準備はできた」になる。メモリ2などと同じコメント名で判定しないこと"},"memory2etc":{"memory":"メモリ2など","under75":"BC登録はまだ先ですね（スペースなし）","from75to85":"BC登録は　まだ先ですね（スペースあり）","at85":"完成まであと一息でしょうか","ready":"メモリ2などで「準備はできたようですね」になる到達率は今回の資料では未確認"},"speedBee":{"horse":"スピードビー号（超早熟、2歳1月入厩、芝・強め調教）","at8":"スピードD・完成まであと一息でしょうか","at16":"スピードC・完成まであと一息でしょうか","at26":"スピードC・準備はできたようですね","at34":"スピードB・準備はできたようですね","switchRange":"「あと一息→準備はできた」の切り替わりは累計17〜26本の間。26本目で切り替わったとは断定できない","note":"26本時点でスピードC・スタミナEでも「準備はできた」が出る。「準備はできた」は全能力が最大になった意味ではない"},"memory1Oni":{"note":"メモリ1の鬼調教例：入厩時スピードAの馬。現在スピード105を起点に鬼芝1本後も「あと一息」のまま、続けて鬼ウッド1本後で「準備はできた」へ。スピード108で85%到達、最大スピード127。通常芝と鬼芝・鬼ウッドを単純に同じ「1本」として合算できない"},"spaceCount":{"note":"スペースが入る本数の例：スピードA到達後、スピード調教10回目ではスペースなし、11回目でスペースあり（スピード147と判定）。入厩から11本という意味ではない"}},"measureNarrowing":{"note":"測定メモによる絞り込み（ユーザー検証による推定・共有情報。参考・未検証）。数値を断定しない。測定用コメントとその時点のSPランク、メモリから、スピードの最大値の候補範囲を参考として絞るだけ。","memory1":{"BC登録はまだ先（スペースなし）":null,"BC登録は　まだ先（スペースあり）":null,"完成まであと一息":{"hi":85,"label":"75%以上・85%未満","lo":75},"準備はできた":{"hi":100,"label":"85%以上","lo":85}},"memory2etc":{"BC登録はまだ先（スペースなし）":{"hi":75,"label":"75%未満","lo":0},"BC登録は　まだ先（スペースあり）":{"hi":85,"label":"75%以上・85%未満","lo":75},"完成まであと一息":{"hi":100,"label":"85%以上","lo":85},"準備はできた":null},"readyUnknown":"メモリ2などで「準備はできたようですね」になる到達率は今回の資料では未確認。絞り込みには使わない。","rule":"到達率＝現在のスピード÷最大スピード。最大スピードの候補は、現在のSPランク範囲÷到達率で参考として絞る。入厩前の候補範囲と食い違う場合は、どちらかの読み・条件が未確定の可能性があると表示する。"},"ranges":{"A":{"max":null,"min":100},"B":{"max":99,"min":85},"C":{"max":84,"min":70},"D":{"max":69,"min":55},"E":{"max":54,"min":0}},"talent":{"phrase":"これは凄い素質の馬ですね","spMin":81,"stMin":81},"title":{"phrase":"将来はいくつかのタイトルも狙えるでしょうね","sumMin":{"牝":150,"牡":160}},"version":5,"warning":"参考・未検証（ユーザー検証による推定・共有情報）。公式が数値を明示した資料は確認できていない。Ver.4.0.0（2023-10-26）以降も同じ境界かは未確認。確定値ではない。"};

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
/* ---------- 測定用コメントの検出（スペースの有無が区切り） ---------- */
/* 「BC登録はまだ先ですね」と「BC登録は　まだ先ですね」は、cmNorm が空白を
   除去すると同じ文字列になってしまう。そのため、正規化で空白を除去する前に
   原文のまま（NFKCのみ）判定する。文字起こしでスペースが落ちた場合は区別
   できない（その場合は「スペースなし」として検出される）。 */
function detectMeasureSentence(raw) {
  var t = String(raw || '').normalize('NFKC');
  var out = [];
  if (/BC登録は[ 　]+まだ先ですね/.test(t)) out.push('BC登録は　まだ先（スペースあり）');
  else if (t.indexOf('BC登録はまだ先ですね') >= 0) out.push('BC登録はまだ先（スペースなし）');
  if (t.indexOf('完成まであと一息でしょうか') >= 0) out.push('完成まであと一息');
  if (t.indexOf('準備はできたようですね') >= 0) out.push('準備はできた');
  return out;
}
function detectMeasure(text) {
  var kinds = [];
  splitSentences(text).forEach(function (s) {
    detectMeasureSentence(s).forEach(function (k) { if (kinds.indexOf(k) < 0) kinds.push(k); });
  });
  return kinds;
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
/* 測定用コメント（検出のみ。数値判定なし）
   スペースの有無が区切りなので、まず原文のまま判定する。 */
var one = sentences[i], normOne = cmNorm(one);
var measured = false;
detectMeasureSentence(one).forEach(function (k) {
if (res.measure.indexOf(k) < 0) res.measure.push(k);
measured = true;
});
if (!measured) {
COMMENTS.measure.forEach(function (e) {
/* スペースあり／なしの区別は上の原文判定だけが行う。ここでは対象外にする
   （正規化すると両方のパターンが同じ文字列になってしまうため） */
if (e.spaceSensitive) return;
if (dice(normOne, cmNorm(e.pattern)) >= 0.8 || normOne.indexOf(cmNorm(e.pattern)) >= 0) {
if (res.measure.indexOf(e.kind) < 0) res.measure.push(e.kind);
measured = true;
}
});
}
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

/* ---------- 成長タイプ（メモリの数字＝バーの目盛り） ---------- */
/* ユーザー確認（2026-11-14）：定型文の「メモリ：N」は成長タイプの数字。
   成長タイプは6段階のバーで、1＝最も早寄り、6＝最も遅寄り。 */
var GROWTH_WORDS = { 1: '早寄り', 2: '早寄りの中間', 3: '中間', 4: '遅寄りの中間', 5: '遅寄り', 6: '遅寄り（最遅）' };
function growthWordFromNum(n) { return GROWTH_WORDS[n] || null; }
function growthNumFromWord(w) {
  var k;
  for (k in GROWTH_WORDS) { if (GROWTH_WORDS[k] === w) return parseInt(k, 10); }
  return null;
}
function growthNumOf(rec) {
  if (rec && typeof rec.growthNum === 'number' && rec.growthNum >= 1 && rec.growthNum <= 6) return rec.growthNum;
  return growthNumFromWord(rec ? rec.growth : null);
}
function growthBar(n) { return '■'.repeat(n) + '□'.repeat(6 - n); }
function growthDisplay(rec) {
  var n = growthNumOf(rec);
  var w = (rec && rec.growth) || (n ? growthWordFromNum(n) : '不明');
  if (n) return w + ' ' + n + '/6 ' + growthBar(n);
  return w;
}
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
  /* メモリの数字＝成長タイプの目盛り。メモリが 1〜6 なら成長タイプにも反映する */
  if (parsed.fields.memory !== undefined) {
    var mn = parseInt(parsed.fields.memory, 10);
    if (mn >= 1 && mn <= 6) $('f-growth').value = growthWordFromNum(mn);
  }
  /* 判定用のコメント欄は3つの文章をまとめたものにする（従来の分類ロジックをそのまま使う） */
  var parts = [parsed.sections.doctorComment, parsed.sections.featureComment, parsed.sections.targetRace]
    .filter(function (x) { return x; });
  if (parts.length) $('f-comment').value = parts.join('\n');
  pendingManual = [];
  pendingMeasureLog = [];
  renderMeasureLogList();
  $('ml-msg').textContent = '';
  var msg = parsed.filled.length ? '読み取れました：' + parsed.filled.join('、') : '読み取れる項目がありませんでした。';
  if (parsed.fields.memory !== undefined) {
    var mn2 = parseInt(parsed.fields.memory, 10);
    if (mn2 >= 1 && mn2 <= 6) msg += ' 成長タイプ：' + mn2 + '/6（' + growthWordFromNum(mn2) + '）';
  }
  if (parsed.missing.length) msg += '（読めなかった項目：' + parsed.missing.join('、') + '。手で入力してください）';
  $('paste-msg').textContent = msg;
  updateGrowthBar();
  renderResult(currentFormRecord());
}

/* 素質・タイトル文の有無（あいまい照合：正規化して部分一致） */
function containsPhrase(text, phrase) {
var n = cmNorm(text), p = cmNorm(phrase);
return n.indexOf(p) >= 0 || dice(n, p) >= 0.85;
}
/* ---------- 測定メモによる絞り込み（参考・未検証） ---------- */
/* 測定用コメントの種類（スペースの有無で区別する4種）と、変化の種類。 */
var MEASURE_KINDS = ['BC登録はまだ先（スペースなし）', 'BC登録は　まだ先（スペースあり）', '完成まであと一息', '準備はできた'];
var MEASURE_CHANGE_KINDS = ['コメント変化', 'スペースあり', 'ランク変化', 'その他'];
/* メモリと測定用コメントから、スピード到達率の参考範囲を返す。
   到達率の区切りが資料で未確認の組み合わせ（例：メモリ2などの「準備はできた」、
   メモリ1の「BC登録はまだ先」）は null を返し、絞り込みには使わない。 */
function arrivalBounds(mem, kind) {
  var table = RANKS.measureNarrowing || {};
  var row = (mem === 1) ? table.memory1 : table.memory2etc;
  if (!row || !kind) return null;
  return row[kind] || null;
}
/* 測定メモの最新1件（なければレコード自体のコメント・ランク）から、
   到達率で最大SPの候補範囲を参考として絞る。数値は断定しない。
   baseSp は入厩前の推定による潜在SP候補範囲 [min, max]（max は null 可）。
   返り値：null（絞り込みなし）または {kind, arrival, spRange, stage, trainingCount, mem, notes[]}。 */
function narrowEstimate(rec, baseSp) {
  var log = (rec && Array.isArray(rec.measureLog)) ? rec.measureLog : [];
  var latest = null, baseline = null;
  log.forEach(function (e) {
    if (!e) return;
    if (e.spRank && !baseline) baseline = e;
    if (e.measure) latest = e;
  });
  var kind = latest ? latest.measure : null;
  var spRank = latest ? latest.spRank : rec.spRank;
  var training = latest ? latest.trainingCount : rec.trainingCount;
  var stage = latest ? latest.stage : (rec.analysisTab || '');
  if (!kind) {
    var mk = detectMeasure(rec.comment || '');
    if (mk.length) { kind = mk[mk.length - 1]; spRank = rec.spRank; training = rec.trainingCount; stage = rec.analysisTab || ''; }
  }
  if (!kind) return null;
  var mem = growthNumOf(rec);
  var b = arrivalBounds(mem, kind);
  var out = { kind: kind, arrival: b ? b.label : null, spRange: null, stage: stage, trainingCount: training, mem: mem, notes: [] };
  if (baseline && latest && baseline !== latest && baseline.spRank && latest.spRank && baseline.spRank !== latest.spRank) {
    out.notes.push('SPランクが ' + baseline.spRank + '→' + latest.spRank + ' に変わった（' + (latest.stage || '') + '・調教' + (latest.trainingCount === null || latest.trainingCount === undefined ? '—' : latest.trainingCount) + '本時点の記録。参考）');
  }
  if (!b) {
    out.notes.push('「' + kind + '」の到達率は、メモリ' + (mem || '不明') + 'では今回の資料で未確認のため、絞り込みの数値範囲は出さない（参考・未検証）。');
    return out;
  }
  if (!b.lo || b.lo <= 0) {
    out.notes.push('「' + kind + '」はスピード到達率' + b.label + 'の参考（ユーザー検証による推定）。この組み合わせでは絞り込みの数値範囲は出さない。');
    return out;
  }
  /* 到達率＝現在のスピード÷最大スピード。現在のSPランク範囲 [cMin, cMax] から、
     最大SPの候補は [cMin×100/hi（hi=100 のときは cMin）, cMax×100/lo]（参考のみ）。 */
  var cur = RANKS.ranges[spRank];
  if (!cur) {
    out.notes.push('「' + kind + '」は到達率' + b.label + 'の参考（ユーザー検証による推定）。SPランクがないため絞り込みの数値範囲は出さない。');
    return out;
  }
  var maxLo = (b.hi && b.hi < 100) ? Math.ceil(cur.min * 100 / b.hi) : cur.min;
  var maxHi = (cur.max === null) ? null : Math.floor(cur.max * 100 / b.lo);
  out.spRange = [maxLo, maxHi];
  if (baseSp) {
    if (maxHi !== null && maxHi < baseSp[0]) {
      out.notes.push('入厩前の候補範囲（' + fmtRange(baseSp) + '）と食い違う参考。どちらかの読み・条件が未確定の可能性がある（参考・未検証）。');
    } else if (maxHi !== null && baseSp[1] !== null && maxHi < baseSp[1]) {
      out.notes.push('入厩前の候補範囲より上限が絞れた参考（' + fmtRange(baseSp) + ' → 上限 ' + maxHi + '）。確定値ではない。');
    }
  }
  return out;
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
/* 測定メモによる絞り込み（参考・未検証）。数値は断定しない。 */
out.narrow = narrowEstimate(rec, s);
/* 入厩直後のスタミナは最大値の半分とされる（ユーザー検証による推定・共有情報。参考・未検証）。
   入厩時のSTランクだけで育成後のSTを断定しない。 */
if (RANKS.entryStamina && ((rec.analysisTab && rec.analysisTab.indexOf('入厩前') >= 0) || rec.stRank === 'D')) {
out.notes.push(RANKS.entryStamina.note);
}
/* 測定用コメントの読み方（ユーザー検証による推定・共有情報。参考のみ、数値は出さない）。
   調教本数で一律に変わるのではなく、スピードの最大値に対する到達率と
   成長タイプ（メモリ）で変わる。メモリ1とメモリ2などでは同じコメントでも
   到達率の読み方が違う。メモリは growthNum（1〜6）で見る。 */
(function () {
var mk = detectMeasure(rec.comment || '');
if (!mk.length) return;
var mem = growthNumOf(rec);
function has(k) { return mk.indexOf(k) >= 0; }
if (has('BC登録は　まだ先（スペースあり）')) out.notes.push('「BC登録は　まだ先ですね」（スペースあり）は、メモリ2などではスピード到達率75%以上・85%未満の参考（ユーザー検証による推定）。メモリ1ではこの区切りは使わない。');
if (has('BC登録はまだ先（スペースなし）')) out.notes.push('「BC登録はまだ先ですね」（スペースなし）は、メモリ2などではスピード到達率75%未満の参考（ユーザー検証による推定）。');
if (has('完成まであと一息')) {
if (mem === 1) out.notes.push('「完成まであと一息でしょうか」は、メモリ1・超早熟ではスピード到達率75%の参考（ユーザー検証による推定）。メモリ2などでは85%の参考になるため、同じコメント名で判定しないこと。');
else out.notes.push('「完成まであと一息でしょうか」は、メモリ2などではスピード到達率85%の参考（ユーザー検証による推定）。メモリ1では75%の参考になるため、メモリを確認すること。');
}
if (has('準備はできた')) {
if (mem === 1) out.notes.push('「準備はできたようですね」は、メモリ1・超早熟ではスピード到達率85%の参考（ユーザー検証による推定）。');
else out.notes.push('「準備はできたようですね」は、メモリ2などで何%になるかは今回の資料では未確認。「準備はできた」は全能力が最大になった意味ではない（スピードビー号ではSP C・ST Eでも出た）。');
}
})();
/* タイトル帯・後光・馬神（ユーザー検証による推定・共有情報。参考のみ、確定ではない）。
   合計の候補範囲 [sumLo, sumHi]（sumHi が null = 上限未確定）と重なる帯だけ出す。
   後光・馬神は、合計範囲がその条件以上になりうる場合にだけ「なりうる（参考）」と表示し、
   届かない場合は表示しない。確定値として表示しない。 */
(function () {
var sumLo = s[0] + t[0];
var sumHi = (s[1] === null || t[1] === null) ? null : s[1] + t[1];
out.sumLo = sumLo; out.sumHi = sumHi;
var B = (RANKS.bands || {});
function overlaps(lo, hi) {
if (hi !== null && hi < sumLo) return false;
if (sumHi !== null && lo > sumHi) return false;
return true;
}
function bandText(lo, hi) { return lo + '〜' + (hi === null ? '' : hi); }
var bands = [];
if (B.weight && overlaps(B.weight.min, B.weight.max)) bands.push(B.weight.name + '（' + bandText(B.weight.min, B.weight.max) + '）');
if (B.g1 && overlaps(B.g1.min, B.g1.max)) bands.push(B.g1.name + '（' + bandText(B.g1.min, B.g1.max) + '）');
if (B.title) {
var tb = (rec.sex === '牡') ? B.title.male : B.title.female;
if (tb && overlaps(tb.min, tb.max)) bands.push(B.title.name + '（' + bandText(tb.min, tb.max) + '）');
}
if (B.overseas && overlaps(B.overseas.min, B.overseas.max)) bands.push(B.overseas.name + '（' + bandText(B.overseas.min, B.overseas.max) + '）');
if (B.representative && overlaps(B.representative.min, B.representative.max)) bands.push(B.representative.name + '（' + bandText(B.representative.min, B.representative.max) + '）');
if (B.shogun && overlaps(B.shogun.min, B.shogun.max)) bands.push(B.shogun.name + '（' + B.shogun.min + '以上）');
out.bands = bands;
out.special = [];
if (B.glow && (sumHi === null || sumHi >= B.glow.min)) out.special.push(B.glow.name + '（SP＋ST ' + B.glow.min + '以上）の条件になりうる（参考・確定ではない）');
if (B.god && (sumHi === null || sumHi >= B.god.min)) out.special.push(B.god.name + '（SP＋ST ' + B.god.min + '以上）の条件になりうる（参考・確定ではない）');
})();
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
var pendingMeasureLog = []; /* 今の入力に対する測定メモ（絞り込み用） */

function esc(s) {
return String(s == null? '': s).replace(/[&<>"']/g, function (c) {
return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
});
}
function updateGrowthBar() {
  var el = $('growth-bar');
  if (el) el.textContent = '成長タイプ：' + growthDisplay(currentFormRecord());
}
function renderResult(rec) {
var box = $('result');
var cls = classify(rec.comment || '', rec.manual || pendingManual);
var est = estimate(rec);
var html = '';
html += '<p><strong>判定：' + esc(est.status) + '</strong></p>';
html += '<p>成長タイプ：' + esc(growthDisplay(rec)) + '（メモリの数字＝バーの目盛り）</p>';
if (rec.trainingCount !== null && rec.trainingCount !== undefined) html += '<p>調教本数：' + esc(String(rec.trainingCount)) + '本（将来の測定用メモ・最適は未確定）</p>';
if (est.sp) {
html += '<p>潜在SP候補（参考）：' + esc(fmtRange(est.sp)) + '<br>潜在ST候補（参考）：' + esc(fmtRange(est.st)) + '</p>';
if (est.sumMin!== null) html += '<p>組み合わせ条件：SP＋ST≧' + est.sumMin + '</p>';
html += '<p>SP＋ST合計の候補範囲（参考）：' + esc(fmtRange([est.sumLo, est.sumHi])) + '</p>';
if (est.bands && est.bands.length) html += '<p>合計範囲と重なるタイトル帯（参考・未検証）：' + esc(est.bands.join('／')) + '</p>';
if (est.special && est.special.length) html += '<p>後光・馬神（参考・可能性のみ、確定ではない）：' + esc(est.special.join('／')) + '</p>';
/* 測定メモによる絞り込み（参考・未検証）。数値は断定しない。 */
if (est.narrow) {
  var nw = est.narrow;
  html += '<h3>測定による絞り込み（参考・未検証）</h3>';
  html += '<p>測定用コメント：' + esc(nw.kind) + (nw.arrival ? '（スピード到達率' + esc(nw.arrival) + 'の参考）' : '（到達率の区切りは未確認）') + '</p>';
  if (nw.spRange) html += '<p>潜在SPの候補（測定による絞り込み・参考）：' + esc(fmtRange(nw.spRange)) + (nw.stage ? '（' + esc(nw.stage) + '・調教' + (nw.trainingCount === null || nw.trainingCount === undefined ? '—' : esc(String(nw.trainingCount))) + '本時点）' : '') + '</p>';
  nw.notes.forEach(function (n) { html += '<p class="note">' + esc(n) + '</p>'; });
}
/* 測定メモの一覧（入厩前／入厩後の記録。調教本数・変わった内容つき） */
if (rec.measureLog && rec.measureLog.length) {
  html += '<h3>測定メモ（調教の記録）</h3><ul>' + rec.measureLog.map(function (e) {
    return '<li>' + esc([e.at, e.stage, (e.trainingCount === null || e.trainingCount === undefined ? '' : '調教' + e.trainingCount + '本'), (e.spRank ? 'SP ' + e.spRank : ''), (e.stRank ? 'ST ' + e.stRank : ''), e.measure || '', e.changed || '', e.note || ''].filter(function (x) { return x; }).join('／')) + '</li>';
  }).join('') + '</ul>';
}
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
/* 参考・未検証の理論と注意は、長くなるので折りたたみ式（基本は非表示）。
   測定ツールを調教本数の理論でアップデートできるまでは、基本は非表示のまま。 */
html += '<details class="ref-details"><summary>参考・未検証の理論と注意（タップで開く）</summary>';
if (RANKS.forecastNote) html += '<p class="note">' + esc(RANKS.forecastNote) + '</p>';
est.notes.forEach(function (n) { html += '<p class="note">' + esc(n) + '</p>';});
html += '<p class="note">' + esc(RANKS.warning) + '</p></details>';
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
/* ---------- 調教本数（任意・将来の測定用メモ） ---------- */
/* 将来のスピード・スタミナ測定に使うかもしれない記録だけ。数値測定の機能はまだ作らない。
   最適な本数は未確定。空欄なら null（なし）として保存する。古いレコード（調教本数なし）も読める。 */
function parseTrainingCount(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  var n = parseInt(v, 10);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
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
growthNum: growthNumFromWord($('f-growth').value),
spRank: $('f-sp').value,
stRank: $('f-st').value,
gutsRank: $('f-guts').value,
temperRank: $('f-temper').value,
physiqueRank: $('f-physique').value,
runningStyle: $('f-running-style').value.trim(),
distance: $('f-distance').value.trim(),
adaptability: $('f-adaptability').value.trim(),
trainingCount: parseTrainingCount($('f-training').value),
doctorComment: $('f-doctor').value,
featureComment: $('f-feature').value,
targetRace: $('f-target').value,
comment: $('f-comment').value,
memo: $('f-memo').value.trim(),
measureLog: pendingMeasureLog.slice(),
manual: pendingManual.slice()
};
}
/* ---------- 測定メモ（絞り込み用） ---------- */
/* 1件目は入厩前（または入厩後・未調教）の状態、2件目以降は調教した結果を入れる。
   「変わった内容」は、コメント変化／スペースあり／ランク変化／その他から選ぶ。
   測定メモは記録だけで、数値測定の機能ではない。古いレコード（測定メモなし）も読める。 */
function renderMeasureLogList() {
  var box = $('ml-list');
  if (!box) return;
  if (!pendingMeasureLog.length) { box.innerHTML = '<p class="note">まだ測定メモがありません。1件目は入厩前（または入厩後・未調教）の状態を入れてください。</p>'; return; }
  box.innerHTML = '';
  pendingMeasureLog.forEach(function (e, idx) {
    var div = document.createElement('div');
    div.className = 'manual-row';
    div.innerHTML = '<p>' + esc([e.at, e.stage, (e.trainingCount === null || e.trainingCount === undefined ? '' : '調教' + e.trainingCount + '本'), (e.spRank ? 'SP ' + e.spRank : ''), (e.stRank ? 'ST ' + e.stRank : ''), e.measure || '', e.changed || '', e.note || ''].filter(function (x) { return x; }).join('／')) + '</p>';
    var del = document.createElement('button');
    del.type = 'button'; del.textContent = 'この測定メモを削除'; del.className = 'danger';
    del.addEventListener('click', function () { pendingMeasureLog.splice(idx, 1); renderMeasureLogList(); renderResult(currentFormRecord()); });
    div.appendChild(del);
    box.appendChild(div);
  });
}
function addMeasureLogEntry() {
  var entry = {
    at: $('ml-at').value.trim(),
    stage: $('ml-stage').value,
    trainingCount: parseTrainingCount($('ml-training').value),
    spRank: $('ml-sp').value || '',
    stRank: $('ml-st').value || '',
    measure: $('ml-measure').value || '',
    changed: $('ml-changed').value || '',
    note: $('ml-note').value.trim()
  };
  if (!entry.stage && entry.trainingCount === null && !entry.spRank && !entry.stRank && !entry.measure && !entry.changed && !entry.note && !entry.at) {
    $('ml-msg').textContent = '測定メモが空です。何か1つ入れてください。';
    return;
  }
  pendingMeasureLog.push(entry);
  $('ml-at').value = ''; $('ml-training').value = ''; $('ml-sp').value = ''; $('ml-st').value = '';
  $('ml-measure').value = ''; $('ml-changed').value = ''; $('ml-note').value = '';
  $('ml-msg').textContent = pendingMeasureLog.length + '件目の測定メモを追加しました。';
  renderMeasureLogList();
  renderResult(currentFormRecord());
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
+ '<p class="meta">' + (r.age ? '年齢 ' + esc(r.age) + '／' : '') + '性別 ' + esc(r.sex) + '／成長 ' + esc(growthDisplay(r)) + '／SP ' + esc(r.spRank || '—') + '／ST ' + esc(r.stRank || '—')
+ '／根性 ' + esc(r.gutsRank || '—') + '／気性 ' + esc(r.temperRank || '—') + '／体質 ' + esc(r.physiqueRank || '—')
+ ((r.runningStyle || r.distance) ? '\n脚質 ' + esc(r.runningStyle || '—') + '／距離 ' + esc(r.distance || '—') + '／適応力 ' + esc(r.adaptability || '—') : '')
+ (r.analysisTime ? '\n解析時期 ' + esc(r.analysisTime) + '（' + esc(r.analysisTab || '') + '）' : '')
+ ((r.trainingCount !== null && r.trainingCount !== undefined) ? '\n調教本数 ' + esc(String(r.trainingCount)) + '本（将来の測定用メモ）' : '')
+ ((r.measureLog && r.measureLog.length) ? '\n測定メモ ' + r.measureLog.length + '件：' + esc(r.measureLog.map(function (e) { return [e.stage, (e.trainingCount === null || e.trainingCount === undefined ? '' : e.trainingCount + '本'), e.measure || '', e.changed || ''].filter(function (x) { return x; }).join(' '); }).join(' → ')) : '')
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
$('f-growth').value = r.growth || (r.growthNum ? growthWordFromNum(r.growthNum) : '不明');
$('f-sp').value = r.spRank || '';
$('f-st').value = r.stRank || '';
$('f-guts').value = r.gutsRank || '';
$('f-temper').value = r.temperRank || '';
$('f-physique').value = r.physiqueRank || '';
$('f-running-style').value = r.runningStyle || '';
$('f-distance').value = r.distance || '';
$('f-adaptability').value = r.adaptability || '';
$('f-training').value = (r.trainingCount === null || r.trainingCount === undefined) ? '' : String(r.trainingCount);
$('f-doctor').value = r.doctorComment || '';
$('f-feature').value = r.featureComment || '';
$('f-target').value = r.targetRace || '';
$('f-comment').value = r.comment || '';
$('f-memo').value = r.memo || '';
pendingManual = (r.manual || []).slice();
pendingMeasureLog = (r.measureLog || []).slice();
renderMeasureLogList();
$('save-btn').textContent = '判定して更新';
$('cancel-edit').hidden = false;
updateGrowthBar();
renderResult(currentFormRecord());
window.scrollTo(0, 0);
}
function resetForm() {
$('edit-id').value = '';
$('horse-form').reset();
pendingManual = [];
pendingMeasureLog = [];
renderMeasureLogList();
$('ml-msg').textContent = '';
$('save-btn').textContent = '判定して登録';
$('cancel-edit').hidden = true;
$('form-error').textContent = '';
$('result').innerHTML = '<p>まだ判定していません。</p>';
updateGrowthBar();
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
$('ml-add').addEventListener('click', addMeasureLogEntry);

/* メモリ欄に 1〜6 を手で入れたときも成長タイプに反映する */
$('f-memory').addEventListener('input', function () {
  var mn = parseInt($('f-memory').value, 10);
  if (mn >= 1 && mn <= 6) $('f-growth').value = growthWordFromNum(mn);
  updateGrowthBar();
});
$('f-growth').addEventListener('change', updateGrowthBar);

/* ---------- JSON 書き出し・読み込み（全件置き換え・検証あり） ---------- */
function validRecord(r) {
if (!r || typeof r!== 'object') return false;
if (typeof r.id!== 'string' ||!r.id) return false;
if (typeof r.name!== 'string' ||!r.name.trim()) return false;
if (['牡', '牝', 'セン', '不明'].indexOf(r.sex) < 0) return false;
if (r.growth !== undefined && ['早寄り', '早寄りの中間', '中間', '遅寄りの中間', '遅寄り', '遅寄り（最遅）', '不明'].indexOf(r.growth) < 0) return false;
if (r.growthNum !== undefined && r.growthNum !== null && (!Number.isInteger(r.growthNum) || r.growthNum < 1 || r.growthNum > 6)) return false;
if (r.trainingCount !== undefined && r.trainingCount !== null && (!Number.isInteger(r.trainingCount) || r.trainingCount < 0)) return false;
if (r.measureLog !== undefined) {
if (!Array.isArray(r.measureLog)) return false;
for (var m = 0; m < r.measureLog.length; m++) {
var e = r.measureLog[m];
if (!e || typeof e !== 'object') return false;
if (e.stage !== undefined && e.stage !== '' && ['入厩前', '入厩後'].indexOf(e.stage) < 0) return false;
if (e.trainingCount !== undefined && e.trainingCount !== null && (!Number.isInteger(e.trainingCount) || e.trainingCount < 0)) return false;
if (e.spRank && !RANKS.ranges[e.spRank]) return false;
if (e.stRank && !RANKS.ranges[e.stRank]) return false;
if (e.measure && MEASURE_KINDS.indexOf(e.measure) < 0) return false;
if (e.changed && MEASURE_CHANGE_KINDS.indexOf(e.changed) < 0) return false;
if (e.at !== undefined && typeof e.at !== 'string') return false;
if (e.note !== undefined && typeof e.note !== 'string') return false;
}
}
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
loadData().then(function () { renderList(); updateGrowthBar();});
