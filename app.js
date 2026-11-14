'use strict';
/* ダビマス能力判定ツール v1
前提：コメント欄には、iPhoneショートカット→Googleアプリで文字起こしした
文を貼り付ける。文字起こしは完璧ではないため、完全一致ではなく
正規化＋部分一致・あいまい照合で分類する。照合できない文は「未分類」。
スクショOCRはしない（Perplexityではファイルのアップロード上限で無理だった）。 */
var LS_KEY = 'dabimas-ability-v1';
var LS_PLANS_KEY = 'dabimas-breeding-v1';
var DATA_VERSION = 2;
/* JSONの版。version 2（世代の列つき繁殖計画）。version 1 のJSON
   （世代の列なし・自分の馬なし）も読み込める（後方互換）。 */
function isSupportedDataVersion(v) { return v === 1 || v === 2; }
/* 繁殖計画のステータス（旧ツール spec v1.0 と同じ3つ）。 */
var PLAN_STATUSES = ['計画', '予約', '実行済み'];

/* data/*.json と同じ内容の内蔵コピー（file:// で開いたとき用）。正本は data/*.json。 */
var FALLBACK_COMMENTS = {"categories":{"exp":"期待と条件","fea":"特徴","fut":"将来評価","tal":"素質評価"},"cmt":[{"c":"tal","out":"凄い素質","src":"これは凄い素質の馬ですね"},{"c":"fut","out":"いくつかのタイトルを狙える","src":"将来はいくつかのタイトルも狙えるでしょうね"},{"c":"fea","out":"スピードが付きそう","src":"スピードが付きそうな馬体ですね"},{"c":"exp","out":"調教が上手くいけば三冠の可能性","src":"調教さえ上手くいけば三冠もあると思います"},{"c":"exp","out":"調教が上手くいけば三冠の可能性","src":"調教さえ巧くいけば三冠もあると思います"},{"c":"fut","out":"どこに出しても恥ずかしくないとの評価","src":"これならどこに出しても恥ずかしくないでしょう"},{"c":"exp","out":"しっかり育てて活躍を期待","src":"しっかり育てて活躍してもらいましょう"},{"c":"fut","out":"期待できる","src":"期待できます"},{"c":"fea","out":"スピードが付きそうな馬体／短距離適正あり／牛嶋厩舎を推奨","src":"スピードが付きそうな馬体ですね\n短距離適正もありそうですし\n牛嶋厩舎を推奨します"},{"c":"fea","out":"強い心肺機能／八木沼厩舎でスタミナ強化","src":"強い心肺機能を備えてますね長距離馬の育成が得意な八木沼厩舎でスタミナ強化が良いでしょう"},{"c":"exp","out":"桜花賞を目標にする提案","src":"まずは桜花賞を目指しましょう"},{"c":"exp","out":"活躍時期も早そう／朝日杯フューチュリティステークスを目標に仕上げる提案","src":"活躍時期も早そうですし朝日杯フューチュリティステークスを目標に仕上げてみてはいかがでしょうか"},{"c":"fut","out":"海外も視野に入れるとの評価","src":"将来は海外も視野に入れたほうが良いでしょう"},{"c":"tal","out":"計り知れない素質","src":"計り知れない素質を感じます"},{"c":"tal","out":"馬神コメントあり","src":"この御方は馬神様の化身かもしれません\n拝んでもいいですか？"},{"c":"tal","out":"後光コメントあり","src":"常識では測れないような馬ですね\nん……！？一瞬後光が射したような……"}],"cmx":[],"measure":[{"kind":"BC登録はまだ先（スペースなし）","pattern":"BC登録はまだ先ですね","spaceSensitive":true},{"kind":"BC登録は　まだ先（スペースあり）","pattern":"BC登録は　まだ先ですね","spaceSensitive":true},{"kind":"完成まであと一息","pattern":"完成まであと一息でしょうか"},{"kind":"準備はできた","pattern":"準備はできたようですね"}]};
var FALLBACK_RANKS = {"analysisStructure":{"middle":"中段はSPとSTのどちらが勝っているか（バランス）","note":"馬体解析レポートの3段構造（ユーザー検証による推定・共有情報。参考・未検証）","upper":"上段（1行目＋2〜3行目）はSP＋STの合計値（総合力）"},"bands":{"g1":{"max":149,"min":140,"name":"G1を狙える"},"glow":{"added":"2025-02-19","min":275,"name":"後光","note":"入厩前・上段コメント。2025年2月19日の更新で追加。2025-02-28のふふ牧場氏X投稿「274 すが／275 後光／確認しました」で274/275両側の一次報告あり（SP・ST内訳、測定手順、馬名、画像なし、同じ馬か別馬かも未確認）。境界確定ではない。","phrase":"常識では測れないような馬ですね","when":"入厩前・上段コメント"},"god":{"added":"2026-03","min":300,"name":"馬神","note":"2025年はGⅠ勝利後の下段コメント。2026年3月からは入厩前にも出る。入厩前の文言「この御方は馬神様の化身かもしれません 拝んでもいいですか？」。合計300での表示例（レオ蔵牧場 note 2025-03-31、SP177・ST123）あり。299で非表示・300で表示の対比検証は未確認。","phrase":"この御方は馬神様の化身かもしれません","when":"2025年はGⅠ勝利後の下段コメント、2026年3月からは入厩前にも"},"overseas":{"max":229,"min":180,"name":"海外も視野"},"representative":{"max":249,"min":230,"name":"時代を代表"},"shogun":{"max":null,"min":250,"name":"時代を築く"},"title":{"female":{"max":179,"min":150},"male":{"max":179,"min":160},"name":"いくつかのタイトル"},"weight":{"max":139,"min":120,"name":"重賞を狙える"}},"bcMark":{"method":"条件を揃えた2頭を「ひとりでBC」で走らせ、印が釣り合うまで芝一杯調教の本数を増やす。才能の効果を「芝一杯◯本分」で表す。","note":"BC印比較によるスピード測定（参考情報。v1では測定機能として実装しない）。注意点：内枠優位、コースと騎手の固定（新潟など）、隠し得意距離（距離適性範囲内で特定の1距離のみスピードが高まる）、調子の固定。","target":"特別調教師才能などのスピード上昇効果"},"entryStamina":{"note":"入厩直後のスタミナは最大値（限界値）の半分という仕様があるとされる。入厩時点でスタミナDでも、育成完了時の最大スタミナがAやBに到達しうる。入厩時のSTランクだけで育成後のSTを断定しない。","rule":"入厩直後のスタミナは最大値の半分"},"forecastNote":"産駒予想の画面では、上段コメントは「凄い素質／海外も視野」までしか出ない。後光が出ないからといって合計275未満とは限らない。","measurementHypothesis":{"hypothesis":"スピード・スタミナ測定は、入厩前と入厩後の調教本数によるコメントの推移で行うはず（仮説・未確定）。今の最適は未確定。","needed":["解析時期（入厩前／入厩後）","調教本数","コメント文（測定用コメント3種）","SP/STランク","メモリ","解析日・週"],"note":"将来の測定に使うかもしれない記録だけを残す。数値測定の機能はまだ作らない。要らなくなったら消してよい。"},"measureNarrowing":{"note":"測定メモによる絞り込み（ユーザー検証による推定・共有情報。参考・未検証）。数値を断定しない。測定用コメントとその時点のSPランク、メモリから、スピードの最大値の候補範囲を参考として絞るだけ。調教本数で一律に変わるのではなく、到達率とメモリで変わる。","memory1":{"BC登録はまだ先（スペースなし）":null,"BC登録は　まだ先（スペースあり）":null,"完成まであと一息":{"hi":85,"label":"75%以上・85%未満","lo":75},"準備はできた":{"hi":100,"label":"85%以上","lo":85}},"memory2etc":{"BC登録はまだ先（スペースなし）":{"hi":75,"label":"75%未満","lo":0},"BC登録は　まだ先（スペースあり）":{"hi":85,"label":"75%以上・85%未満","lo":75},"完成まであと一息":{"hi":100,"label":"85%以上","lo":85},"準備はできた":null},"readyUnknown":"メモリ2などで「準備はできたようですね」になる到達率は今回の資料では未確認。絞り込みには使わない。","rule":"到達率＝現在のスピード÷最大スピード。最大スピードの候補は、現在のSPランク範囲÷到達率で参考として絞る。入厩前の候補範囲と食い違う場合は、どちらかの読み・条件が未確定の可能性があると表示する。"},"ranges":{"A":{"max":null,"min":100},"B":{"max":99,"min":85},"C":{"max":84,"min":70},"D":{"max":69,"min":55},"E":{"max":54,"min":0}},"source":"ユーザー検証による推定・共有情報。公式が数値を明示した資料は確認できていない。出典：5ch 2018-12-15、ぎ〜さん 2025-02-20、ふふ牧場 note 2026-03更新、ふふ牧場 X 2025-02-28（274 すが／275 後光）、レオ蔵牧場 note 2025-03-31（SP177・ST123＝合計300で馬神）、ダビマスメモ 2018-02-20（https://dbmsmemo.blogspot.com/2018/02/blog-post_20.html）。スピード早見表：たかなさん X投稿 2026-11-12（https://x.com/mmmmdd_tw/status/2120561500523995322）。","talent":{"note":"この文があると SP・ST 各81以上とみなす（参考・未検証）。Cランク（70〜84）でも出る。AAや合計180以上は保証しない。SP100・ST80では出ない。","phrase":"これは凄い素質の馬ですね","spMin":81,"stMin":81},"immenseTalent":{"note":"この文があると SP・ST 各120以上とみなす（参考・未検証）。2023-05-17の掲示板テンプレによる。片方が120以上でもう片方が110〜119の場合は「素晴らしい馬」系で、こちらは未対応（120以上の下限は使わない）。","phrase":"計り知れない素質を感じます","spMin":120,"stMin":120},"title":{"note":"この文があると SP＋ST が牡160以上／牝150以上とみなす（参考・未検証）。センの条件は未確認のため未使用。","phrase":"将来はいくつかのタイトルも狙えるでしょうね","sumMin":{"牝":150,"牡":160}},"version":7,"warning":"参考・未検証（ユーザー検証による推定・共有情報）。公式が数値を明示した資料は確認できていない。Ver.4.0.0（2023-10-26）以降も同じ境界かは未確認。確定値ではない。","measureThresholds":{"note":"測定用コメントの変化条件（ユーザー検証による推定・共有情報。参考・未検証）。公式発表はない。調教本数で一律に変わるのではなく、スピードの最大値に対する到達率と、成長タイプ（メモリ）で変わる。数値を出す計算はしない。","memory1":{"memory":"メモリ1・超早熟","at75":"完成まであと一息でしょうか","at85":"準備はできたようですね","note":"75%で「あと一息」、85%で「準備はできた」になる。メモリ2などと同じコメント名で判定しないこと"},"memory2etc":{"memory":"メモリ2など","under75":"BC登録はまだ先ですね（スペースなし）","from75to85":"BC登録は　まだ先ですね（スペースあり）","at85":"完成まであと一息でしょうか","ready":"メモリ2などで「準備はできたようですね」になる到達率は今回の資料では未確認"},"speedBee":{"horse":"スピードビー号（超早熟、2歳1月入厩、芝・強め調教）","at8":"スピードD・完成まであと一息でしょうか","at16":"スピードC・完成まであと一息でしょうか","at26":"スピードC・準備はできたようですね","at34":"スピードB・準備はできたようですね","switchRange":"「あと一息→準備はできた」の切り替わりは累計17〜26本の間。26本目で切り替わったとは断定できない","note":"26本時点でスピードC・スタミナEでも「準備はできた」が出る。「準備はできた」は全能力が最大になった意味ではない"},"memory1Oni":{"note":"メモリ1の鬼調教例：入厩時スピードAの馬。現在スピード105を起点に鬼芝1本後も「あと一息」のまま、続けて鬼ウッド1本後で「準備はできた」へ。スピード108で85%到達、最大スピード127。通常芝と鬼芝・鬼ウッドを単純に同じ「1本」として合算できない"},"spaceCount":{"note":"スペースが入る本数の例：スピードA到達後、スピード調教10回目ではスペースなし、11回目でスペースあり（スピード147と判定）。入厩から11本という意味ではない"}},"speedTable":{"note":"たかなさんのスピード早見表 詳細版（ユーザー検証による推定・共有情報。参考・未検証）。公式発表ではない。スピード120〜209、メモリ1〜6。行は最大スピード、列はメモリ・到達率ごとの現在スピード。表から数値を自動計算する機能は実装しない。参考表示のみ。","source":"たかなさん（@mmmmdd_tw）X投稿 2026-11-12 1:57 JST https://x.com/mmmmdd_tw/status/2120561500523995322 。スピード200に到達したプレイヤーが現れたことを受けて拡張。書き起こし：NotebookLMまとめ（dabimas_speed_table.xlsx、ユーザーのファイル。リポジトリには含めない）。","caps":{"memory1":{"1歳9月":100},"memory2":{"1歳9月":90,"2歳7月":94,"2歳9月":98,"2歳11月":100},"memory3":{"1歳9月":80,"2歳7月":84,"2歳9月":88,"2歳11月":92,"3歳1月":96,"3歳3月":100},"memory4":{"1歳9月":70,"2歳7月":74,"2歳9月":78,"2歳11月":82,"3歳1月":86,"3歳3月":90,"3歳5月":94,"3歳7月":98,"3歳9月":100},"memory5":{"1歳9月":50,"2歳7月":52,"2歳9月":54,"2歳11月":56,"3歳1月":60,"3歳3月":64,"3歳5月":68,"3歳7月":72,"3歳9月":80,"3歳11月":88,"4歳1月":92,"4歳3月":96,"4歳5月":100},"memory6":{"1歳9月":50,"3歳7月":52,"3歳9月":56,"3歳11月":60,"4歳1月":68,"4歳3月":76,"4歳5月":84}},"capsNote":"成長タイプ別・時期ごとの能力蓋（上限到達率%）。メモリ1は1歳9月で100%、メモリ2は2歳11月で100%、メモリ3は3歳3月で100%、メモリ4は3歳9月で100%、メモリ5は4歳5月で100%。メモリ6は4歳5月時点で84%（それ以降は原表に記載なし）。","bcMidComments":[{"range":"〜49","speed":"走りきる脚","stamina":"心配？"},{"range":"50〜69","speed":"そこそこの脚","stamina":"心配"},{"range":"70〜79","speed":"脚力は普通","stamina":"ぼちぼち"},{"range":"80〜89","speed":"良い脚","stamina":"あるほう"},{"range":"90〜94","speed":"かなりの脚力","stamina":"自信"},{"range":"95〜96","speed":"凄い脚力","stamina":"言うこと"},{"range":"97〜99","speed":"並外れた脚力","stamina":"一級品"},{"range":"100〜104","speed":"物凄い脚力","stamina":"一級品"},{"range":"105〜119","speed":"非凡な脚力","stamina":"飛びぬけ"},{"range":"120〜129","speed":"他の追随を","stamina":"心肺機能は特別"},{"range":"130〜","speed":"空を飛ぶような","stamina":"いくらでも"}],"bcMidNote":"BC登録時の中段コメントの数値範囲。書き起こしではコメント文は文頭のみのため、全文は原表（X投稿の画像）を参照すること。","upperBandsNote":"入厩時上段コメントの合計帯は既存の bands と同じ（300以上 馬神、275以上 後光、250以上 時代を築く、230〜249 時代を代表、180〜229 海外も視野）。条件は変えない。","example":"最大スピード200・メモリ1：コメ変化85%は170、あと一息75%は150、蓋100%は200。最大スピード150・メモリ2：蓋90%は135、2歳9月98%は147。"}};

var COMMENTS = FALLBACK_COMMENTS;
var RANKS = FALLBACK_RANKS;

/* 種牡馬データベース（data/stallions.json）。ユーザーがダビマス全書／
   たかなさんのDBMS種牡馬データ検索から取得したCSV（2026-11-14入手）を
   scripts/convert-stallions.py で変換したもの。ユーザー検証・参考。
   元のCSVはリポジトリに含めない。3.9MBあるため app.js への内蔵コピーは
   なし（file:// で開いたときは fetch が読めず検索は使えない）。 */
var STALLIONS = null;
var STALLION_URL_BASE = 'https://dabimas.jp/kouryaku/stallions/';
var STALLION_SEARCH_LIMIT = 50;

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
var PASTE_SECTIONS = { '博士コメント': 'doctorComment', '特徴': 'featureComment', '目標レース': 'targetRace', '解析コメント': 'analysisComment' };
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
  if (parsed.sections.analysisComment !== undefined) $('f-analysis').value = parsed.sections.analysisComment;
  /* メモリの数字＝成長タイプの目盛り。メモリが 1〜6 なら成長タイプにも反映する */
  if (parsed.fields.memory !== undefined) {
    var mn = parseInt(parsed.fields.memory, 10);
    if (mn >= 1 && mn <= 6) $('f-growth').value = growthWordFromNum(mn);
  }
  /* 判定用のコメント欄は4つの文章をまとめたものにする（従来の分類ロジックをそのまま使う）。
     「解析コメント：」もここに入る。入らないと馬神・後光の文言が判定に使われない。 */
  var parts = [parsed.sections.doctorComment, parsed.sections.featureComment, parsed.sections.targetRace, parsed.sections.analysisComment]
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
/* 「計り知れない素質を感じます」があると、SP・ST 各120以上とみなす（参考・未検証）。
   出典：Notion判定基準ページ §2（2023-05-17の掲示板テンプレ）。片方が120以上で
   もう片方が110〜119の「素晴らしい馬」系は、こちらでは下限を使わない。 */
if (RANKS.immenseTalent && containsPhrase(rec.comment || '', RANKS.immenseTalent.phrase)) {
s[0] = Math.max(s[0], RANKS.immenseTalent.spMin);
t[0] = Math.max(t[0], RANKS.immenseTalent.stMin);
out.used.push('計り知れない素質：SP・ST各120以上（2023-05-17参考条件）');
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
/* 解析コメントに馬神・後光の文言そのものが出ている場合。ゲーム内でその文言が
   表示されたという事実を表示する。合計300／275の数値条件を満たしたと断定する
   ものではなく、数値条件はユーザー検証による推定・未検証のまま。 */
out.phraseComments = [];
var BD = RANKS.bands || {};
if (BD.god && BD.god.phrase && containsPhrase(rec.comment || '', BD.god.phrase)) out.phraseComments.push('馬神コメントあり（解析コメントに馬神の文言あり。合計300以上という条件はユーザー検証による推定・未検証）');
if (BD.glow && BD.glow.phrase && containsPhrase(rec.comment || '', BD.glow.phrase)) out.phraseComments.push('後光コメントあり（解析コメントに後光の文言あり。合計275以上という条件はユーザー検証による推定・未検証）');
out.notes.push('個別範囲内の任意の組み合わせが適合するとは限りません。実測確定値ではありません。');
return out;
}

/* ---------- 保存（localStorage） ---------- */
function loadAll() {
try {
var raw = localStorage.getItem(LS_KEY);
if (!raw) return [];
var data = JSON.parse(raw);
if (!data || !isSupportedDataVersion(data.version) ||!Array.isArray(data.records)) return [];
return data.records;
} catch (e) { return [];}
}
function saveAll(records) {
localStorage.setItem(LS_KEY, JSON.stringify({ version: DATA_VERSION, records: records}));
}
function newId() { return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);}

/* ---------- 繁殖計画（ステップ1：記録だけ） ---------- */
/* 計画は馬データとは別のキーで保存し、馬データに影響しない。
   父馬・母馬は今回は名前のテキスト入力のみ。登録馬からの選択や
   攻略データベースからの選択は後のステップ。将来の紐付けのため、
   sireHorseId / damHorseId の欄をデータ構造に用意しておくが、
   今は常に null（未紐付け）。配合のシミュレーションはしない。
   未確定の配合効果を断定表示しない。 */
function loadPlans() {
try {
var raw = localStorage.getItem(LS_PLANS_KEY);
if (!raw) return [];
var data = JSON.parse(raw);
if (!data || !isSupportedDataVersion(data.version) ||!Array.isArray(data.plans)) return [];
return data.plans.filter(function (p) { return validPlan(p);});
} catch (e) { return [];}
}
function savePlans(plans) {
localStorage.setItem(LS_PLANS_KEY, JSON.stringify({ version: DATA_VERSION, plans: plans}));
}
function newPlanId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);}
function validPlan(p) {
if (!p || typeof p!== 'object') return false;
if (typeof p.id!== 'string' ||!p.id) return false;
if (typeof p.name!== 'string' ||!p.name.trim()) return false;
if (PLAN_STATUSES.indexOf(p.status) < 0) return false;
var optText = ['sireName', 'damName', 'memo'];
for (var j = 0; j < optText.length; j++) {
if (p[optText[j]] !== undefined && typeof p[optText[j]]!== 'string') return false;
}
/* 将来の紐付け用。未紐付けは null。文字列なら登録馬のIDを指す想定。 */
if (p.sireHorseId !== undefined && p.sireHorseId !== null && typeof p.sireHorseId!== 'string') return false;
if (p.damHorseId !== undefined && p.damHorseId !== null && typeof p.damHorseId!== 'string') return false;
/* DB検索からの選択：種牡馬データベース内の番号（整数）または null。 */
if (p.sireDbIndex !== undefined && p.sireDbIndex !== null && (!Number.isInteger(p.sireDbIndex) || p.sireDbIndex < 0)) return false;
if (p.damDbIndex !== undefined && p.damDbIndex !== null && (!Number.isInteger(p.damDbIndex) || p.damDbIndex < 0)) return false;
/* 自家生産馬からの選択：自分の馬のID（文字列）または null。 */
if (p.sireOwnId !== undefined && p.sireOwnId !== null && typeof p.sireOwnId !== 'string') return false;
if (p.damOwnId !== undefined && p.damOwnId !== null && typeof p.damOwnId !== 'string') return false;
/* 世代の列（ステップ5）。ない旧形式の計画も読める。ある場合は検証する。 */
if (p.generations !== undefined) {
if (!Array.isArray(p.generations) || !p.generations.length) return false;
var gids = {};
for (var k = 0; k < p.generations.length; k++) {
if (!validGeneration(p.generations[k])) return false;
if (gids[p.generations[k].id]) return false;
gids[p.generations[k].id] = true;
}
}
return true;
}

/* ---------- 自分の馬（自家生産馬：2代目以降の配合用） ---------- */
/* 配合計画の子を「次の配合の親」として登録した馬。能力判定ツールの登録馬
   とは別扱いで、繁殖計画ツールの中だけで使う。保存は馬・繁殖計画とは
   別のキー。子の血統（anc 15件）は、両親の血統を1代ずらしたもの
   （buildChildAnc）。3代目以降も同じ仕組みで続けられる（子を登録→
   その子を親に選ぶ→また子を登録、の繰り返し）。
   性別は 牡／牝／不明。牡は父馬欄、牝は母馬欄、不明は両方に選べる。
   generation は世代数（DB馬を1代目として、DB同士の子は2代目）。 */
var LS_OWN_KEY = 'dabimas-own-horses-v1';
var OWN_SEXES = ['牡', '牝', '不明'];
function loadOwnHorses() {
try {
var raw = localStorage.getItem(LS_OWN_KEY);
if (!raw) return [];
var data = JSON.parse(raw);
if (!data || !isSupportedDataVersion(data.version) || !Array.isArray(data.ownHorses)) return [];
return data.ownHorses.filter(function (h) { return validOwnHorse(h); });
} catch (e) { return []; }
}
function saveOwnHorses(list) {
localStorage.setItem(LS_OWN_KEY, JSON.stringify({ version: DATA_VERSION, ownHorses: list }));
}
function newOwnId() { return 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function validOwnHorse(h) {
if (!h || typeof h !== 'object') return false;
if (typeof h.id !== 'string' || !h.id) return false;
if (typeof h.name !== 'string' || !h.name.trim()) return false;
if (OWN_SEXES.indexOf(h.sex) < 0) return false;
if (!Array.isArray(h.anc) || h.anc.length !== 15) return false;
for (var i = 0; i < h.anc.length; i++) {
var a = h.anc[i];
if (!Array.isArray(a) || typeof a[0] !== 'string' || !a[0]) return false;
for (var j = 1; j < a.length; j++) { if (typeof a[j] !== 'string') return false; }
}
if (h.generation !== undefined && (!Number.isInteger(h.generation) || h.generation < 2)) return false;
var optText = ['sireName', 'damName', 'planId'];
for (var k = 0; k < optText.length; k++) {
if (h[optText[k]] !== undefined && typeof h[optText[k]] !== 'string') return false;
}
/* どの世代の子か（世代のID。旧形式の自分の馬にはない）。 */
if (h.generationId !== undefined && typeof h.generationId !== 'string') return false;
/* 由来（どの計画の第何世代の子か）。登録時に記録する。ない旧形式の
   自分の馬は由来不明として扱う（表示も枝の展開もしない）。 */
if (h.originPlanName !== undefined && h.originPlanName !== null && typeof h.originPlanName !== 'string') return false;
if (h.originGenerationNo !== undefined && h.originGenerationNo !== null && (!Number.isInteger(h.originGenerationNo) || h.originGenerationNo < 1)) return false;
if (h.sireDbIndex !== undefined && h.sireDbIndex !== null && (!Number.isInteger(h.sireDbIndex) || h.sireDbIndex < 0)) return false;
if (h.damDbIndex !== undefined && h.damDbIndex !== null && (!Number.isInteger(h.damDbIndex) || h.damDbIndex < 0)) return false;
if (h.sireOwnId !== undefined && h.sireOwnId !== null && typeof h.sireOwnId !== 'string') return false;
if (h.damOwnId !== undefined && h.damOwnId !== null && typeof h.damOwnId !== 'string') return false;
return true;
}
function findOwnHorse(id) {
if (!id) return null;
for (var i = 0; i < ownHorses.length; i++) { if (ownHorses[i].id === id) return ownHorses[i]; }
return null;
}
function findPlanById(id) {
if (!id || typeof plans === 'undefined' || !Array.isArray(plans)) return null;
for (var i = 0; i < plans.length; i++) { if (plans[i].id === id) return plans[i]; }
return null;
}
/* 自分の馬の由来表示。「計画名」第N世代の子。由来が記録されていない
   旧形式の馬は「由来不明」。 */
function ownHorseOriginLabel(o) {
if (!o) return '由来不明';
if (typeof o.originPlanName === 'string' && o.originPlanName.trim() &&
Number.isInteger(o.originGenerationNo) && o.originGenerationNo >= 1) {
return '「' + o.originPlanName + '」第' + o.originGenerationNo + '世代の子';
}
return '由来不明';
}
/* 自分の馬を生んだ世代（計画＋世代）を探す。由来が記録されている馬だけが
   対象。由来不明の馬は null。由来の計画・世代が見つからない場合は
   {missingPlan: true}／{missingGeneration: true, plan} を返す（枝なしで
   箱だけ表示し、その旨を注記する）。 */
function originGenerationOf(o) {
if (!o || !o.originPlanName || !o.originGenerationNo) return null;
var plan = findPlanById(o.planId);
if (!plan) return { missingPlan: true };
var gens = planGenerations(plan);
var gen = null, genNo = 0;
for (var i = 0; i < gens.length; i++) {
if (o.generationId && gens[i].id === o.generationId) { gen = gens[i]; genNo = i + 1; break; }
}
if (!gen && o.originGenerationNo >= 1 && o.originGenerationNo <= gens.length) {
gen = gens[o.originGenerationNo - 1]; genNo = o.originGenerationNo;
}
if (!gen) return { missingGeneration: true, plan: plan };
return { plan: plan, gen: gen, genNo: genNo };
}
/* 自家生産馬を、血統の組み立て・配合理論・インブリードで使う形
   {n, chi, f1, f2, anc} にそろえる。DB馬はそのままの形。
   自家生産馬自身の子系統・因子は不明のため空（空の親系統は配合理論では
   数えない扱い。子の血統表の表示にも使わない）。
   旧形式で保存された自家生産馬（anc[0] の親系統が空のもの）は、ここで
   父馬の父の親系統＝馬自身の親系統（父系で受け継がれるもの）で補い、
   保存し直す（repairOwnHorseAnc0Pa 参照）。 */
function ownHorsePedigree(o) {
if (!o) return null;
if (repairOwnHorseAnc0Pa(o)) saveOwnHorses(ownHorses);
return { n: o.name, chi: '', f1: '', f2: '', anc: o.anc };
}
/* 旧形式で保存された自家生産馬の anc[0]（父そのもの）の親系統を補う。
   馬自身の親系統は父系で受け継がれるため、父馬の父（anc[0]）の親系統と
   同じ。父がDB馬ならその anc[0] の親系統、父が自家生産馬ならその父の
   親系統を再帰で求める（循環参照は seen で防ぐ）。補えたら anc[0] に
   入れて true を返す。既に親系統がある場合や補えない場合は false。 */
function repairOwnHorseAnc0Pa(o, seen) {
if (!o || !Array.isArray(o.anc) || !o.anc[0] || o.anc[0][1]) return false;
seen = seen || {};
if (o.id && seen[o.id]) return false;
if (o.id) seen[o.id] = true;
var pa = '';
if (o.sireDbIndex !== null && o.sireDbIndex !== undefined &&
STALLIONS && Array.isArray(STALLIONS.horses) && STALLIONS.horses[o.sireDbIndex]) {
pa = stallionAncestor(STALLIONS.horses[o.sireDbIndex], 0).pa || '';
} else if (o.sireOwnId) {
var sireOwn = findOwnHorse(o.sireOwnId);
if (sireOwn) {
repairOwnHorseAnc0Pa(sireOwn, seen);
pa = (sireOwn.anc && sireOwn.anc[0] && sireOwn.anc[0][1]) || '';
}
}
if (!pa) return false;
o.anc[0][1] = pa;
return true;
}
function toPedigree(h) {
if (!h) return null;
if (typeof h.n === 'string') return h;
if (typeof h.name === 'string') return ownHorsePedigree(h);
return null;
}
/* 親の指定（{dbIndex, ownId} のどちらか片方）を血統で使う形に解決する。
   自家生産馬が削除されていたり、DBが読み込めていなければ null。 */
function resolveParentRef(ref) {
if (!ref) return null;
if (ref.ownId) return ownHorsePedigree(findOwnHorse(ref.ownId));
if (ref.dbIndex !== null && ref.dbIndex !== undefined) {
if (!STALLIONS || !Array.isArray(STALLIONS.horses) || !STALLIONS.horses[ref.dbIndex]) return null;
return STALLIONS.horses[ref.dbIndex];
}
return null;
}
/* 計画の父馬・母馬の両方を解決する。片方でも解決できなければ null。 */
function resolvePlanParents(p) {
if (!p) return null;
var sire = resolveParentRef({ dbIndex: p.sireDbIndex, ownId: p.sireOwnId });
var dam = resolveParentRef({ dbIndex: p.damDbIndex, ownId: p.damOwnId });
if (!sire || !dam) return null;
return { sire: sire, dam: dam };
}
function planHasPedigreePair(p) { return !!resolvePlanParents(p); }
/* 計画に父馬・母馬の指定（DB・自家生産馬のどちらか）が1つでもあるか。 */
function planHasAnyParentRef(p) {
if (!p) return false;
return (p.sireDbIndex !== null && p.sireDbIndex !== undefined) ||
(p.damDbIndex !== null && p.damDbIndex !== undefined) ||
!!p.sireOwnId || !!p.damOwnId;
}
/* 親の世代数。DB馬は1代目、自家生産馬は登録時の generation。 */
function parentGeneration(ref) {
if (ref && ref.ownId) {
var o = findOwnHorse(ref.ownId);
return (o && o.generation) ? o.generation : 2;
}
return 1;
}
function childGeneration(sireRef, damRef) {
return Math.max(parentGeneration(sireRef), parentGeneration(damRef)) + 1;
}
function defaultChildName(plan) { return (plan && plan.name ? plan.name : '配合計画') + 'の子'; }
/* 子の血統（anc 15件）を組み立てる。buildChildPedigree の15行を
   [名前, 親系統, 子系統, 因子1, 因子2] に直したもの。
   0番目（父そのもの）は行に因子がないため、父馬自身の子系統・因子1・
   因子2を入れる。親系統は、父馬の父（anc[0]）の親系統＝父馬自身の
   親系統（親系統は父系で受け継がれる）で補う。父馬の父の親系統が
   分からない場合だけ空になる。 */
function buildChildAnc(sire, dam) {
var rows = buildChildPedigree(sire, dam);
if (!rows) return null;
var anc = rows.map(function (r) { return [r.name || '', r.pa || '', r.chi || '', r.f1 || '', r.f2 || '']; });
anc[0] = [sire.n || '', rows[0].pa || '', sire.chi || '', sire.f1 || '', sire.f2 || ''];
return anc;
}
/* 両親の指定（refs: {sireName, damName, sireDbIndex, damDbIndex,
   sireOwnId, damOwnId}）から子を自家生産馬として登録する共通処理。
   返り値は {ok, horse} または {ok: false, error}。
   子の血統は buildChildAnc で組み立てる。 */
function registerOwnHorseFromRefs(refs, childName, sex, planId, generationId) {
var sire = resolveParentRef({ dbIndex: refs.sireDbIndex, ownId: refs.sireOwnId });
var dam = resolveParentRef({ dbIndex: refs.damDbIndex, ownId: refs.damOwnId });
if (!sire || !dam) return { ok: false, error: '父馬・母馬の両方が解決できません。データベースの読み込みと、自家生産馬が削除されていないか確認してください。' };
var name = String(childName || '').trim();
if (!name) return { ok: false, error: '子の名前を入力してください' };
if (OWN_SEXES.indexOf(sex) < 0) return { ok: false, error: '性別を選んでください' };
var anc = buildChildAnc(sire, dam);
if (!anc) return { ok: false, error: '子の血統を組み立てられませんでした' };
var now = new Date().toISOString();
var sireRef = { dbIndex: refs.sireDbIndex, ownId: refs.sireOwnId };
var damRef = { dbIndex: refs.damDbIndex, ownId: refs.damOwnId };
var rec = {
id: newOwnId(), name: name, sex: sex,
sireName: refs.sireName || sire.n || '',
damName: refs.damName || dam.n || '',
sireDbIndex: (refs.sireDbIndex === undefined ? null : refs.sireDbIndex),
damDbIndex: (refs.damDbIndex === undefined ? null : refs.damDbIndex),
sireOwnId: refs.sireOwnId || null,
damOwnId: refs.damOwnId || null,
planId: planId || '',
generationId: generationId || '',
originPlanName: '',
originGenerationNo: null,
generation: childGeneration(sireRef, damRef),
anc: anc, createdAt: now, updatedAt: now
};
/* 由来（どの計画の第何世代の子か）を記録する。計画が一覧にあれば名前と
   世代番号を入れる。計画が見つからない場合は由来不明のままにする。 */
var originPlan = findPlanById(planId);
if (originPlan) {
rec.originPlanName = originPlan.name || '';
var og = planGenerations(originPlan);
for (var oi = 0; oi < og.length; oi++) {
if (generationId && og[oi].id === generationId) { rec.originGenerationNo = oi + 1; break; }
}
if (!rec.originGenerationNo && og.length === 1) rec.originGenerationNo = 1;
}
if (!validOwnHorse(rec)) return { ok: false, error: '子の登録データを作れませんでした' };
ownHorses.push(rec);
saveOwnHorses(ownHorses);
return { ok: true, horse: rec };
}
/* 計画の子（第1世代）を自家生産馬として登録する。世代の列がある計画では
   第1世代の子として結び付ける。 */
function registerOwnHorseFromPlan(plan, childName, sex) {
if (!plan) return { ok: false, error: '計画が見つかりません' };
var gen = planGenerations(plan)[0];
var res = registerOwnHorseFromRefs({
sireName: gen.sireName, damName: gen.damName,
sireDbIndex: gen.sireDbIndex, damDbIndex: gen.damDbIndex,
sireOwnId: gen.sireOwnId, damOwnId: gen.damOwnId
}, childName, sex, plan.id || '', gen.id);
if (res.ok && Array.isArray(plan.generations) && plan.generations.length) {
plan.generations[0].childOwnId = res.horse.id;
syncPlanGen1(plan);
}
return res;
}
function deleteOwnHorse(id) {
ownHorses = ownHorses.filter(function (h) { return h.id !== id; });
saveOwnHorses(ownHorses);
}
/* 性別による出し分け。牡は父馬欄、牝は母馬欄、不明は両方に選べる。 */
function ownHorseEligibleFor(role, h) {
if (!h) return false;
if (role === 'sire') return h.sex === '牡' || h.sex === '不明';
if (role === 'dam') return h.sex === '牝' || h.sex === '不明';
return false;
}
/* 自家生産馬の名前検索。因子・非凡・天性・子系統で絞っている場合、
   自家生産馬はその情報を持たないため候補に出さない。 */
function searchOwnHorses(q, role) {
q = q || {};
if (String(q.chi || '').trim() || String(q.factor || '').trim() ||
String(q.hibon || '').trim() || String(q.talent || '').trim()) return [];
var name = String(q.name || '').trim().toLowerCase();
return ownHorses.filter(function (h) {
if (!ownHorseEligibleFor(role, h)) return false;
if (name && h.name.toLowerCase().indexOf(name) < 0) return false;
return true;
});
}


/* ---------- 1つの計画での多世代の配合（ステップ5） ---------- */
/* 計画の中に世代（ステップ）の列を持たせる。第1世代＝今までの計画
   （父・母→子）。第2世代以降は、前の世代の子を親として同じ計画の中で
   続ける。配合理論の判定はステップ3のものに、ステップ6で追加した
   完璧／超完璧／奇跡／危険を加えたものを使う（すべて参考・未検証）。
   世代のデータ：
   {id, childName, childSex, sireName, damName,
    sireDbIndex, damDbIndex, sireOwnId, damOwnId,
    sireHorseId, damHorseId, childOwnId}
   childOwnId は、その世代の子を自家生産馬として登録したときのID。
   旧形式の計画（generations がないもの）は、第1世代1つとして読む。
   JSONは version 2。version 1 のJSON（世代の列なし）も読める。 */
function newGenerationId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function validGeneration(g) {
if (!g || typeof g !== 'object') return false;
if (typeof g.id !== 'string' || !g.id) return false;
if (typeof g.childName !== 'string') return false;
if (OWN_SEXES.indexOf(g.childSex) < 0) return false;
var optText = ['sireName', 'damName'];
for (var j = 0; j < optText.length; j++) {
if (g[optText[j]] !== undefined && typeof g[optText[j]] !== 'string') return false;
}
if (g.sireHorseId !== undefined && g.sireHorseId !== null && typeof g.sireHorseId !== 'string') return false;
if (g.damHorseId !== undefined && g.damHorseId !== null && typeof g.damHorseId !== 'string') return false;
if (g.sireDbIndex !== undefined && g.sireDbIndex !== null && (!Number.isInteger(g.sireDbIndex) || g.sireDbIndex < 0)) return false;
if (g.damDbIndex !== undefined && g.damDbIndex !== null && (!Number.isInteger(g.damDbIndex) || g.damDbIndex < 0)) return false;
if (g.sireOwnId !== undefined && g.sireOwnId !== null && typeof g.sireOwnId !== 'string') return false;
if (g.damOwnId !== undefined && g.damOwnId !== null && typeof g.damOwnId !== 'string') return false;
if (g.childOwnId !== undefined && g.childOwnId !== null && typeof g.childOwnId !== 'string') return false;
return true;
}
function defaultGenerationChildName(plan, n) {
var base = (plan && plan.name) ? plan.name : '配合計画';
if (!n || n <= 1) return base + 'の子';
return base + 'の子（第' + n + '世代）';
}
function generationFromPlanFields(p) {
return {
id: 'g-' + (p.id || 'plan') + '-1',
childName: defaultChildName(p), childSex: '不明',
sireName: p.sireName || '', damName: p.damName || '',
sireHorseId: p.sireHorseId || null, damHorseId: p.damHorseId || null,
sireDbIndex: (p.sireDbIndex === undefined ? null : p.sireDbIndex),
damDbIndex: (p.damDbIndex === undefined ? null : p.damDbIndex),
sireOwnId: p.sireOwnId || null, damOwnId: p.damOwnId || null,
childOwnId: null
};
}
/* 計画の世代の列を返す。generations がない旧形式の計画は、第1世代1つに
   読み替える。旧形式で登録済みの子（planId がこの計画の自家生産馬）が
   あれば、第1世代の子として結び付ける。返す配列は、保存済みのものは
   そのまま（参照）、旧形式の場合はその場で作ったもの。 */
function planGenerations(p) {
if (!p) return [];
if (Array.isArray(p.generations) && p.generations.length) return p.generations;
var g = generationFromPlanFields(p);
if (typeof ownHorses !== 'undefined' && Array.isArray(ownHorses)) {
for (var i = 0; i < ownHorses.length; i++) {
if (ownHorses[i].planId === p.id) { g.childOwnId = ownHorses[i].id; break; }
}
}
return [g];
}
/* 世代の列を計画に保存された形で用意する（なければ第1世代を作って付ける）。
   世代の追加・削除・子の登録など、世代を変える処理はここを通す。 */
function ensurePlanGenerations(p) {
if (!p) return [];
if (Array.isArray(p.generations) && p.generations.length) return p.generations;
p.generations = planGenerations(p);
return p.generations;
}
/* 第1世代の内容を、計画の欄（旧形式と共通の欄）に写す。計画フォームの
   編集・一覧の表示が第1世代と食い違わないようにする。 */
function syncPlanGen1(p) {
if (!p || !Array.isArray(p.generations) || !p.generations.length) return;
var g = p.generations[0];
p.sireName = g.sireName || '';
p.damName = g.damName || '';
p.sireHorseId = g.sireHorseId || null;
p.damHorseId = g.damHorseId || null;
p.sireDbIndex = (g.sireDbIndex === undefined ? null : g.sireDbIndex);
p.damDbIndex = (g.damDbIndex === undefined ? null : g.damDbIndex);
p.sireOwnId = g.sireOwnId || null;
p.damOwnId = g.damOwnId || null;
}
function resolveGenerationParents(gen) {
if (!gen) return null;
var sire = resolveParentRef({ dbIndex: gen.sireDbIndex, ownId: gen.sireOwnId });
var dam = resolveParentRef({ dbIndex: gen.damDbIndex, ownId: gen.damOwnId });
if (!sire || !dam) return null;
return { sire: sire, dam: dam };
}
function generationHasPedigreePair(gen) { return !!resolveGenerationParents(gen); }
function generationHasAnyParentRef(gen) {
if (!gen) return false;
return (gen.sireDbIndex !== null && gen.sireDbIndex !== undefined) ||
(gen.damDbIndex !== null && gen.damDbIndex !== undefined) ||
!!gen.sireOwnId || !!gen.damOwnId;
}
/* この世代の子が、同じ計画のほかの世代の親として使われている場所。
   返り値は [{genNo, role}]（role は 'sire'／'dam'）。世代の削除の影響や、
   子の由来の表示に使う。 */
function generationChildUsage(plan, gen) {
var out = [];
if (!plan || !gen || !gen.childOwnId) return out;
var gens = planGenerations(plan);
gens.forEach(function (g, idx) {
if (g.id === gen.id) return;
if (g.sireOwnId === gen.childOwnId) out.push({ genNo: idx + 1, role: 'sire' });
if (g.damOwnId === gen.childOwnId) out.push({ genNo: idx + 1, role: 'dam' });
});
return out;
}
/* ある自家生産馬が、指定した計画以外の計画の世代の親として使われているか。 */
function isOwnHorseUsedInOtherPlans(ownId, exceptPlanId) {
if (!ownId) return false;
for (var i = 0; i < plans.length; i++) {
if (plans[i].id === exceptPlanId) continue;
var gens = planGenerations(plans[i]);
for (var j = 0; j < gens.length; j++) {
if (gens[j].sireOwnId === ownId || gens[j].damOwnId === ownId) return true;
}
}
return false;
}
/* 世代の子を自家生産馬として登録する（世代版）。登録済みの子がある世代は
   二重登録しない。返り値は registerOwnHorseFromPlan と同じ形。 */
function registerOwnHorseFromGeneration(plan, gen, childName, sex) {
if (!plan || !gen) return { ok: false, error: '計画または世代が見つかりません' };
if (gen.childOwnId && findOwnHorse(gen.childOwnId)) return { ok: false, error: 'この世代の子はすでに自家生産馬として登録済みです' };
var res = registerOwnHorseFromRefs({
sireName: gen.sireName, damName: gen.damName,
sireDbIndex: gen.sireDbIndex, damDbIndex: gen.damDbIndex,
sireOwnId: gen.sireOwnId, damOwnId: gen.damOwnId
}, childName, sex, plan.id || '', gen.id);
if (!res.ok) return res;
gen.childOwnId = res.horse.id;
syncPlanGen1(plan);
savePlans(plans);
return res;
}
/* 計画の最後の世代の子を親にして、次の世代を追加する。前の世代の子が
   まだ自家生産馬として登録されていなければ、ここで自動で登録する
   （子の名前・性別はその世代の欄の値を使う）。子の性別が牝なら母に、
   牡・不明なら父にする（あとで欄から選び直せる）。 */
function addGenerationToPlan(plan) {
if (!plan) return { ok: false, error: '計画が見つかりません' };
var gens = ensurePlanGenerations(plan);
var prev = gens[gens.length - 1];
var prevNo = gens.length;
var child = prev.childOwnId ? findOwnHorse(prev.childOwnId) : null;
if (!child) {
var name = String(prev.childName || '').trim() || defaultGenerationChildName(plan, prevNo);
var res = registerOwnHorseFromGeneration(plan, prev, name, prev.childSex || '不明');
if (!res.ok) return { ok: false, error: res.error };
child = res.horse;
}
var n = gens.length + 1;
var gen = {
id: newGenerationId(),
childName: defaultGenerationChildName(plan, n), childSex: '不明',
sireName: '', damName: '', sireHorseId: null, damHorseId: null,
sireDbIndex: null, damDbIndex: null, sireOwnId: null, damOwnId: null,
childOwnId: null
};
if (child.sex === '牝') { gen.damOwnId = child.id; gen.damName = child.name; }
else { gen.sireOwnId = child.id; gen.sireName = child.name; }
gens.push(gen);
plan.updatedAt = new Date().toISOString();
syncPlanGen1(plan);
savePlans(plans);
return { ok: true, generation: gen };
}
/* 世代を削除する。世代が1つだけの計画では削除できない（計画ごと削除する）。
   削除した世代の子（自家生産馬）は、ほかの計画の親に使われていなければ
   一緒に削除する。そのため、その子を親にしていた同じ計画内の世代は、
   血統・配合理論が表示できなくなる（壊れた世代として表示し、計画自体は
   残す）。返り値は {ok, dependents: [世代番号], childDeleted}。 */
function deleteGenerationFromPlan(plan, genId) {
if (!plan) return { ok: false, error: '計画が見つかりません' };
var gens = ensurePlanGenerations(plan);
if (gens.length <= 1) return { ok: false, error: '世代が1つだけの計画では、その世代は削除できません。計画ごと削除してください。' };
var idx = -1;
for (var i = 0; i < gens.length; i++) { if (gens[i].id === genId) { idx = i; break; } }
if (idx < 0) return { ok: false, error: '世代が見つかりません' };
var gen = gens[idx];
var childOwnId = gen.childOwnId || null;
var dependents = [];
gens.forEach(function (g, j) {
if (g.id === genId || !childOwnId) return;
if (g.sireOwnId === childOwnId || g.damOwnId === childOwnId) dependents.push(j + 1);
});
gens.splice(idx, 1);
var childDeleted = false;
if (childOwnId && !isOwnHorseUsedInOtherPlans(childOwnId, plan.id)) {
var horse = findOwnHorse(childOwnId);
if (horse && horse.planId === plan.id) { deleteOwnHorse(childOwnId); childDeleted = true; }
}
plan.updatedAt = new Date().toISOString();
syncPlanGen1(plan);
savePlans(plans);
return { ok: true, dependents: dependents, childDeleted: childDeleted };
}
/* 世代の父馬・母馬の欄の候補表示で使う、選択状態の読み書き。
   選んだあと（afterChange）は、第1世代なら計画の欄に写し、保存して
   計画を再表示する（子の血統・配合理論も更新される）。 */
function generationSuggestStore(plan, gen) {
return {
getDb: function (role) { return role === 'sire' ? gen.sireDbIndex : gen.damDbIndex; },
setDb: function (role, v) { if (role === 'sire') gen.sireDbIndex = v; else gen.damDbIndex = v; },
getOwn: function (role) { return role === 'sire' ? gen.sireOwnId : gen.damOwnId; },
setOwn: function (role, v) { if (role === 'sire') gen.sireOwnId = v; else gen.damOwnId = v; },
afterChange: function (role) {
syncPlanGen1(plan);
plan.updatedAt = new Date().toISOString();
savePlans(plans);
renderPlans();
renderOwnHorses();
}
};
}
/* ---------- 種牡馬データベース検索（ステップ2） ---------- */
/* 検索と配合表示に必要な項目だけを残した data/stallions.json（3021件）を
   読む。配合の効果を断定する表示はしない（配合理論の判定は後のステップ）。
   同名の別バリエーション（例：アイアンリージ-巌瓏- / -煌魂-）は別レコード
   のまま。空欄（非凡なし・天性なしなど）はそのまま扱う。 */
function stallionLink(h) {
  if (!h || !h.link) return '';
  return String(h.link).indexOf('http') === 0 ? h.link : STALLION_URL_BASE + h.link + '.html';
}
/* 祖先 i（0〜14）の [名前, 親系統, 子系統, 因子1, 因子2]。末尾の空欄は
   変換時に省いてあるので、5要素まで空文字で補う。 */
function stallionAncestor(h, i) {
  var a = (h && Array.isArray(h.anc)) ? (h.anc[i] || []) : [];
  return { name: a[0] || '', pa: a[1] || '', chi: a[2] || '', f1: a[3] || '', f2: a[4] || '' };
}
function stallionFactors(h) {
  return [h.f1, h.f2, h.f3].filter(function (x) { return x; }).join('／');
}
/* q: {name, chi, factor, hibon, talent}（すべて部分一致。chi だけ選択式の
   完全一致）。何も条件がない場合は空配列（3021件を全部出さない）。
   返り値は [{h, idx}]。 */
function searchStallions(q) {
  if (!STALLIONS || !Array.isArray(STALLIONS.horses)) return [];
  q = q || {};
  function norm(s) { return String(s || '').trim().toLowerCase(); }
  var name = norm(q.name), chi = norm(q.chi), factor = norm(q.factor),
      hibon = norm(q.hibon), talent = norm(q.talent);
  if (!name && !chi && !factor && !hibon && !talent) return [];
  var out = [];
  STALLIONS.horses.forEach(function (h, idx) {
    if (name && norm(h.n).indexOf(name) < 0) return;
    if (chi && norm(h.chi) !== chi) return;
    if (factor && norm([h.f1, h.f2, h.f3].join(' ')).indexOf(factor) < 0) return;
    if (hibon && norm((h.hibon || '') + ' ' + (h.hk || '')).indexOf(hibon) < 0) return;
    if (talent && norm(h.talent).indexOf(talent) < 0) return;
    out.push({ h: h, idx: idx });
  });
  return out;
}
/* 子系統の選択肢（データにあるものだけ・五十音順）。 */
function stallionChiOptions() {
  if (!STALLIONS || !Array.isArray(STALLIONS.horses)) return [];
  var seen = {};
  STALLIONS.horses.forEach(function (h) { if (h.chi) seen[h.chi] = true; });
  return Object.keys(seen).sort();
}
/* 検索で選んだ父馬・母馬（データベース内の番号。未選択は null）。 */
var selectedDb = { sire: null, dam: null };
/* 自家生産馬から選んだ父馬・母馬（自分の馬のID。未選択は null）。
   DB選択と自家生産馬の選択は、片方を選ぶともう片方が外れる。 */
var selectedOwn = { sire: null, dam: null };
var stallionResults = [];

/* ---------- 画面 ---------- */
var $ = function (id) { return document.getElementById(id);};
var records = loadAll();
var plans = loadPlans();
var ownHorses = loadOwnHorses();
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
if (est.phraseComments && est.phraseComments.length) html += '<p>解析コメントの文言（ゲーム内で表示されたコメント）：' + esc(est.phraseComments.join('／')) + '</p>';
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
analysisComment: $('f-analysis').value,
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

/* ---------- 種牡馬データベース検索の画面 ---------- */
function renderStallionSearchStatus() {
  var el = $('s-status');
  if (!el) return;
  if (!STALLIONS) { el.textContent = 'データベースを読み込めませんでした。サーバー経由で開き直してください（file:// で開いている場合は検索は使えません）。'; return; }
  el.textContent = 'データベース ' + STALLIONS.count + '件を読み込み済み（ユーザー提供CSV・2026-11-14入手。ユーザー検証・参考）。';
}
function fillChiOptions() {
  ['s-chi', 'p-sire-chi', 'p-dam-chi'].forEach(function (id) {
    var sel = $(id);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">指定なし</option>';
    stallionChiOptions().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
    sel.value = cur;
  });
}
function runStallionSearch() {
  var msg = $('s-msg'), box = $('s-results');
  if (!STALLIONS) { if (msg) msg.textContent = 'データベースが読み込めていません。'; return; }
  stallionResults = searchStallions({
    name: $('s-name').value, chi: $('s-chi').value, factor: $('s-factor').value,
    hibon: $('s-hibon').value, talent: $('s-talent').value
  });
  var total = stallionResults.length;
  if (msg) msg.textContent = total ? total + '件見つかりました' + (total > STALLION_SEARCH_LIMIT ? '（先頭' + STALLION_SEARCH_LIMIT + '件を表示）' : '') + '。' : '見つかりませんでした。条件を変えてください。';
  if (!box) return;
  box.innerHTML = '';
  stallionResults.slice(0, STALLION_SEARCH_LIMIT).forEach(function (r) {
    var h = r.h;
    var li = document.createElement('li');
    var link = stallionLink(h);
    li.innerHTML = '<p class="name">' + esc(h.n || '') + '</p>'
      + '<p class="meta">子系統 ' + esc(h.chi || '—') + '／因子 ' + esc(stallionFactors(h) || '—')
      + '／距離 ' + esc(h.dist || '—') + '／成長 ' + esc(h.growth || '—')
      + '／非凡 ' + esc(h.hibon || '—') + (h.hk ? '（' + esc(h.hk) + '）' : '')
      + '／天性 ' + esc(h.talent || '—')
      + (link ? '／<a href="' + esc(link) + '" target="_blank" rel="noopener">ダビマス全書で見る</a>' : '') + '</p>';
    var detailBtn = document.createElement('button');
    detailBtn.type = 'button'; detailBtn.textContent = '血統・詳細を見る';
    detailBtn.addEventListener('click', function () { renderStallionDetail(r.idx); });
    var sireBtn = document.createElement('button');
    sireBtn.type = 'button'; sireBtn.textContent = '父馬に選ぶ';
    sireBtn.addEventListener('click', function () { chooseStallionForPlan(r.idx, 'sire'); });
    var damBtn = document.createElement('button');
    damBtn.type = 'button'; damBtn.textContent = '母馬に選ぶ';
    damBtn.addEventListener('click', function () { chooseStallionForPlan(r.idx, 'dam'); });
    li.appendChild(detailBtn); li.appendChild(sireBtn); li.appendChild(damBtn);
    box.appendChild(li);
  });
}
function chooseStallionForPlan(idx, role) {
  if (!STALLIONS || !STALLIONS.horses[idx]) return;
  var name = STALLIONS.horses[idx].n || '';
  if (role === 'sire') { $('p-sire').value = name; selectedDb.sire = idx; selectedOwn.sire = null; }
  else { $('p-dam').value = name; selectedDb.dam = idx; selectedOwn.dam = null; }
  updatePlanDbStatus(role);
  hidePlanSuggestions(role);
  var msg = $('s-msg');
  if (msg) msg.textContent = (role === 'sire' ? '父馬' : '母馬') + 'に「' + name + '」を選びました。計画名を入れて「計画を登録」を押してください。';
  renderStallionDetail(idx);
}
/* 自家生産馬を計画の父馬・母馬に選ぶ。性別に合わない役割には選べない。 */
function chooseOwnHorseForPlan(role, id) {
  var o = findOwnHorse(id);
  if (!o || !ownHorseEligibleFor(role, o)) return;
  if (role === 'sire') { $('p-sire').value = o.name; selectedOwn.sire = id; selectedDb.sire = null; }
  else { $('p-dam').value = o.name; selectedOwn.dam = id; selectedDb.dam = null; }
  updatePlanDbStatus(role);
  hidePlanSuggestions(role);
  var msg = $('own-msg');
  if (msg) msg.textContent = (role === 'sire' ? '父馬' : '母馬') + 'に自家生産馬「' + o.name + '」（' + o.sex + '・' + o.generation + '代目）を選びました。計画名を入れて「計画を登録」を押してください。';
  var form = $('plan-form');
  if (form && form.scrollIntoView) form.scrollIntoView();
}

/* ---------- 繁殖計画フォームの父馬・母馬欄の直接検索 ---------- */
/* 計画フォームの父馬・母馬の欄に、種牡馬データベース検索を直接組み込む。
   馬名を入れる（タップして入力する）と部分一致の候補が出て、選ぶとその欄に
   入り、DB番号（sireDbIndex／damDbIndex）も残る。子系統・因子・非凡・天性
   でも絞り込める（欄の下の折りたたみ）。従来の検索セクションからの選択も
   残し、そちらも同じ表示になる。名前だけの入力（DBにない馬）も引き続き
   でき、その場合はDB番号は null のまま。候補は先頭10件まで。 */
var PLAN_SUGGEST_LIMIT = 10;
var planSuggestResults = { sire: [], dam: []};
/* 候補表示の対象（ctx）。計画フォームと、各世代の父馬・母馬の欄で
同じ仕組みを使う。
els: {name, status, list, chi, factor, hibon, talent} の要素。
store: {getDb(role), setDb(role, v), getOwn(role), setOwn(role, v),
afterChange(role)}。世代の欄の afterChange は、選んだ内容を世代に
保存して計画を再表示する（子の血統・配合理論も更新される）。
isForm が真の ctx は計画フォーム（従来の動き）。 */
function formSuggestStore() {
return {
getDb: function (role) { return selectedDb[role];},
setDb: function (role, v) { selectedDb[role] = v;},
getOwn: function (role) { return selectedOwn[role];},
setOwn: function (role, v) { selectedOwn[role] = v;},
afterChange: function (role) {}
};
}
function suggestCtxFromEls(els, store, role) {
return { els: els, store: store, role: role, results: [], isForm: false};
}
function formSuggestCtx(role) {
var ctx = suggestCtxFromEls(planSuggestRoleEls(role), formSuggestStore(), role);
ctx.isForm = true;
return ctx;
}
function planSuggestRoleEls(role) {
var p = role === 'sire'? 'p-sire': 'p-dam';
return { name: $(p), status: $(p + '-db'), list: $(p + '-suggest'),
chi: $(p + '-chi'), factor: $(p + '-factor'), hibon: $(p + '-hibon'), talent: $(p + '-talent')};
}
function planSuggestFilters(role, ctx) {
var e = ctx? ctx.els: planSuggestRoleEls(role);
return {
name: e.name? e.name.value: '',
chi: e.chi? e.chi.value: '',
factor: e.factor? e.factor.value: '',
hibon: e.hibon? e.hibon.value: '',
talent: e.talent? e.talent.value: ''
};
}
/* 欄の下の「DBから選択／自家生産馬から選択／名前だけの入力」の表示。 */
function updatePlanDbStatus(role, ctx) {
ctx = ctx || formSuggestCtx(role);
/* 計画フォームの場合は、選択が変わるたびに配合理論のプレビューも更新する。
   プレビューは選択状態（store）と欄の入力値だけを見るので、表示文言の
   更新より先に呼んでよい。世代の欄は buildGenParentEditor の
   refreshGenPreview が担当する（ctx.isForm が偽の場合は何もしない）。 */
if (ctx.isForm) updatePlanTheoryPreview();
var e = ctx.els;
if (!e.status) return;
var ownId = ctx.store.getOwn(ctx.role);
if (ownId) {
var o = findOwnHorse(ownId);
e.status.textContent = o? '自家生産馬から選択：' + o.name + '（' + o.sex + '・' + o.generation + '代目／' + ownHorseOriginLabel(o) + '）'
: '自家生産馬から選択済みですが、見つかりません（削除された可能性があります）。';
return;
}
var idx = ctx.store.getDb(ctx.role);
if (idx === null || idx === undefined) {
e.status.textContent = (e.name && e.name.value.trim())
? '名前だけの入力です（DB・自家生産馬とも未選択）。子の血統・配合理論の確認には、父馬・母馬の両方をDBまたは自家生産馬から選んでください。'
: '';
return;
}
var h = (STALLIONS && STALLIONS.horses[idx])? STALLIONS.horses[idx]: null;
e.status.textContent = h? 'DBから選択：' + h.n + '（子系統 ' + (h.chi || '—') + '）': 'DBから選択済み';
}
function updatePlanDbStatuses() { updatePlanDbStatus('sire'); updatePlanDbStatus('dam');}
function hidePlanSuggestions(role, ctx) {
ctx = ctx || formSuggestCtx(role);
var e = ctx.els;
if (e.list) { e.list.innerHTML = '';}
if (ctx.isForm) planSuggestResults[role] = [];
else ctx.results = [];
}
function hideAllPlanSuggestions() { hidePlanSuggestions('sire'); hidePlanSuggestions('dam');}
/* 自家生産馬1頭分の候補行（「」と区別がつく表示）。 */
function renderOwnSuggestItem(list, role, o, ctx) {
var li = document.createElement('li');
var btn = document.createElement('button');
btn.type = 'button';
btn.textContent = '【自家生産馬】' + o.name;
var meta = document.createElement('span');
meta.className = 'suggest-meta';
meta.textContent = o.sex + '・' + o.generation + '代目／' + ownHorseOriginLabel(o) + '／父 ' + (o.sireName || '—') + ' × 母 ' + (o.damName || '—');
btn.appendChild(meta);
btn.addEventListener('mousedown', function (ev) {
if (ev && ev.preventDefault) ev.preventDefault();
if (ctx &&!ctx.isForm) chooseOwnSuggestionOf(ctx, o.id);
else chooseOwnHorseForPlan(role, o.id);
});
li.appendChild(btn);
list.appendChild(li);
}
function renderPlanSuggestions(role, ctx) {
ctx = ctx || formSuggestCtx(role);
var e = ctx.els;
var list = e.list;
if (!list) return;
list.innerHTML = '';
if (ctx.isForm) planSuggestResults[role] = [];
else ctx.results = [];
function hint(text) {
var li = document.createElement('li');
li.className = 'suggest-hint';
li.textContent = text;
list.appendChild(li);
}
/* データベースが読み込めていなくても、自家生産馬の候補だけは出せる。 */
var q0 = planSuggestFilters(role, ctx);
if (!STALLIONS) {
var ownOnly = searchOwnHorses(q0, role);
if (ownOnly.length) {
ownOnly.slice(0, PLAN_SUGGEST_LIMIT).forEach(function (o) {
renderOwnSuggestItem(list, role, o, ctx);
});
}
hint('データベースが読み込めていません。名前だけの入力でも登録できます（サーバー経由で開き直すと検索が使えます）。');
return;
}
var q = planSuggestFilters(role, ctx);
var hasAny = [q.name, q.chi, q.factor, q.hibon, q.talent].some(function (v) { return String(v || '').trim()!== '';});
if (!hasAny) {
hint('馬名を入力するか、絞り込み条件を入れると候補が出ます。DBにない馬は名前だけの入力でも登録できます。');
return;
}
var results = searchStallions(q);
/* 自家生産馬も一緒に候補に出す（区別がつく表示にする）。性別で出し分ける。
DBの候補とは別枠で、先頭10件まで。 */
var ownResults = searchOwnHorses(q, role);
if (!results.length &&!ownResults.length) {
hint('見つかりませんでした。条件を変えるか、名前だけの入力でも登録できます。');
return;
}
var shown = results.slice(0, PLAN_SUGGEST_LIMIT);
if (ctx.isForm) planSuggestResults[role] = shown;
else ctx.results = shown;
shown.forEach(function (r) {
var h = r.h;
var li = document.createElement('li');
var btn = document.createElement('button');
btn.type = 'button';
btn.textContent = h.n || '';
var meta = document.createElement('span');
meta.className = 'suggest-meta';
meta.textContent = '子系統 ' + (h.chi || '—') + '／因子 ' + (stallionFactors(h) || '—')
+ '／非凡 ' + (h.hibon || '—') + '／天性 ' + (h.talent || '—');
btn.appendChild(meta);
/* blur で候補が消える前に選べるよう、click ではなく mousedown で選ぶ */
btn.addEventListener('mousedown', function (ev) {
if (ev && ev.preventDefault) ev.preventDefault();
choosePlanSuggestion(role, r.idx, ctx);
});
li.appendChild(btn);
list.appendChild(li);
});
if (results.length > PLAN_SUGGEST_LIMIT) {
hint(results.length + '件見つかりました（先頭' + PLAN_SUGGEST_LIMIT + '件を表示）。条件を絞るとほかの候補も出ます。');
}
ownResults.slice(0, PLAN_SUGGEST_LIMIT).forEach(function (o) {
renderOwnSuggestItem(list, role, o, ctx);
});
}
/* 候補から選ぶ：名前を欄に入れ、選択状態を残す。手で名前を直すと
onPlanHorseNameInput が選択を外す（名前と選択の食い違い防止）。 */
function chooseSuggestionOf(ctx, idx) {
if (!STALLIONS ||!STALLIONS.horses[idx]) return;
var e = ctx.els;
var name = STALLIONS.horses[idx].n || '';
if (e.name) e.name.value = name;
ctx.store.setDb(ctx.role, idx);
ctx.store.setOwn(ctx.role, null);
updatePlanDbStatus(ctx.role, ctx);
hidePlanSuggestions(ctx.role, ctx);
ctx.store.afterChange(ctx.role);
}
function choosePlanSuggestion(role, idx, ctx) {
if (ctx &&!ctx.isForm) { chooseSuggestionOf(ctx, idx); return;}
if (!STALLIONS ||!STALLIONS.horses[idx]) return;
var e = planSuggestRoleEls(role);
var name = STALLIONS.horses[idx].n || '';
if (e.name) e.name.value = name;
selectedDb[role] = idx;
selectedOwn[role] = null;
updatePlanDbStatus(role);
hidePlanSuggestions(role);
}
/* 自家生産馬を候補から選ぶ（世代の欄用）。性別に合わない役割には選べない。 */
function chooseOwnSuggestionOf(ctx, id) {
var o = findOwnHorse(id);
if (!o ||!ownHorseEligibleFor(ctx.role, o)) return;
var e = ctx.els;
if (e.name) e.name.value = o.name;
ctx.store.setOwn(ctx.role, id);
ctx.store.setDb(ctx.role, null);
updatePlanDbStatus(ctx.role, ctx);
hidePlanSuggestions(ctx.role, ctx);
ctx.store.afterChange(ctx.role);
}
function onPlanHorseNameInput(role, ctx) {
ctx = ctx || formSuggestCtx(role);
ctx.store.setDb(ctx.role, null);
ctx.store.setOwn(ctx.role, null);
updatePlanDbStatus(ctx.role, ctx);
renderPlanSuggestions(ctx.role, ctx);
}
function renderStallionDetail(idx) {
  var box = $('s-detail');
  if (!box) return;
  if (!STALLIONS || !STALLIONS.horses[idx]) { box.innerHTML = '<p class="note">データベースが読み込めていません。</p>'; return; }
  var h = STALLIONS.horses[idx];
  var labels = STALLIONS.ancestors || [];
  var rows = '';
  for (var i = 0; i < 15; i++) {
    var a = stallionAncestor(h, i);
    rows += '<tr><td>' + esc(labels[i] || ('祖先' + (i + 1))) + '</td><td>' + esc(a.name || '—') + '</td><td>' + esc(a.pa || '—') + '</td><td>' + esc(a.chi || '—') + '</td><td>' + esc([a.f1, a.f2].filter(function (x) { return x; }).join('／') || '—') + '</td></tr>';
  }
  var link = stallionLink(h);
  box.innerHTML = '<h4>' + esc(h.n || '') + '（5代血統・参考）</h4>'
    + '<p class="meta">子系統 ' + esc(h.chi || '—') + '／因子 ' + esc(stallionFactors(h) || '—')
    + '／距離 ' + esc(h.dist || '—') + '／成長 ' + esc(h.growth || '—')
    + '／適応力 ' + esc(h.adapt || '—') + '／体質 ' + esc(h.phys || '—') + '／気性 ' + esc(h.temp || '—')
    + '／脚質 ' + esc(h.style || '—') + '／実績 ' + esc(h.record || '—') + '／底力 ' + esc(h.base || '—') + '／安定 ' + esc(h.stab || '—')
    + '／非凡 ' + esc(h.hibon || '—') + (h.hk ? '（' + esc(h.hk) + '）' : '') + '／天性 ' + esc(h.talent || '—')
    + (h.eff ? '<br>発揮効果（先頭のみ・参考）：' + esc(h.eff) : '')
    + (link ? '<br><a href="' + esc(link) + '" target="_blank" rel="noopener">ダビマス全書で見る</a>' : '') + '</p>'
    + '<table><thead><tr><th>血統位置</th><th>祖先名</th><th>親系統</th><th>子系統</th><th>因子</th></tr></thead><tbody>' + rows + '</tbody></table>'
    + '<p class="note">配合の効果を断定する表示はしません。血統・因子・非凡・天性の表示だけです。配合理論の確認は、繁殖計画で父馬・母馬の両方をDBから選ぶと表示できます。</p>';
  box.scrollIntoView();
}

/* ---------- 子の血統・配合理論の確認（ステップ3） ---------- */
/* すべて参考・未検証。ユーザー攻略記事による推定・共有情報で、公式仕様では
   ない。配合の効果を断定する表示はしない。出典：Appliv Games
   「ダビマス 配合のやり方と面白い配合／見事な配合／よくできた配合の条件」
   https://games.app-liv.jp/archives/232008
   「ダビマス 配合のポイント（インブリード／血統表の見方）」
   https://games.app-liv.jp/archives/198428
   完璧な配合の条件：dbms-go.net「完璧な配合」
   https://dbms-go.net/配合解説/完璧な配合/
   判定に使う親系統は anc の2番目の要素。親系統が空の祖先は無視する
   （数えない）。空欄はデータ上は今のところないが、念のための扱い。 */
var CHILD_PEDIGREE_LABELS = ['父', '父父', '父父父', '父父父父', '父父母父', '父母父', '父母父父', '父母母父', '母父', '母父父', '母父父父', '母父母父', '母母父', '母母父父', '母母母父'];
/* 子の血統15位置の世代（父・母＝1代）。 */
var CHILD_PEDIGREE_GEN = [1, 2, 3, 4, 4, 3, 4, 4, 2, 3, 4, 4, 3, 4, 4];
/* 子の位置 i（1〜14）が父馬・母馬の anc の何番目から来るか。
   父方（1〜7）：父馬 anc[0,1,2,5,8,9,12]、母方（8〜14）：母馬 anc[0,1,2,5,8,9,12]。
   位置 0（父）は父馬そのもの。母は子の血統15位置には入らない
   （anc は父系の祖先だけの並びのため）が、子の母として別に表示する。 */
var CHILD_PEDIGREE_SRC = [null, 0, 1, 2, 5, 8, 9, 12, 0, 1, 2, 5, 8, 9, 12];
/* 計画が父馬・母馬の両方をDB検索から選んでいるか。 */
function planHasDbPair(p) {
  return !!(p && p.sireDbIndex !== null && p.sireDbIndex !== undefined &&
    p.damDbIndex !== null && p.damDbIndex !== undefined);
}
/* 馬名→データベース内の番号（先頭の1件）。祖先名がDBにあるかの確認用。 */
var stallionNameIndexCache = null;
function stallionNameToIndex() {
  if (stallionNameIndexCache) return stallionNameIndexCache;
  var m = {};
  if (!STALLIONS || !Array.isArray(STALLIONS.horses)) return m;
  STALLIONS.horses.forEach(function (h, idx) { if (h.n && m[h.n] === undefined) m[h.n] = idx; });
  stallionNameIndexCache = m;
  return m;
}
/* 子の血統15位置を組み立てる。返り値は15件の
   {label, name, pa, chi, f1, f2, side, gen}。side は 'sire'／'dam'。 */
function buildChildPedigree(sire, dam) {
  if (!sire || !dam) return null;
  var rows = [];
  for (var i = 0; i < 15; i++) {
    if (i === 0) {
      /* 父そのもの。親系統は父馬の父（anc[0]）の親系統＝父馬自身の
         親系統（親系統は父系で受け継がれる）で補う。 */
      rows.push({ label: '父', name: sire.n || '', pa: stallionAncestor(sire, 0).pa || '', chi: '', f1: '', f2: '', side: 'sire', gen: 1 });
      continue;
    }
    var src = (i < 8) ? sire : dam;
    var a = stallionAncestor(src, CHILD_PEDIGREE_SRC[i]);
    rows.push({ label: CHILD_PEDIGREE_LABELS[i], name: a.name, pa: a.pa, chi: a.chi, f1: a.f1, f2: a.f2, side: (i < 8) ? 'sire' : 'dam', gen: CHILD_PEDIGREE_GEN[i] });
  }
  return rows;
}
/* クロス判定用の馬名の正規化（同馬の表記違いを吸収する）。
   データベースの馬名には、同じ馬の因名違い・年号違いの別バリエーション
   がある（例：ダンチヒ1992／ダンチヒ-瞬走-／ダンチヒ-覇閃- は同馬。
   しまむら牧場 note「ダンチヒ瞬走は同名の種牡馬（ダンチヒ1992 or
   ダンチヒ覇閃）でも代用可能」。るんば note「同一馬の因名違いによる
   全兄弟クロスは奇跡の配合が成立します」）。一方、祖先名の側は素の
   馬名（例：ダンチヒ）で出る。完全一致だけではこのクロスを見逃す。
   正規化：先頭の「-」以降（因名部分）を落とし、末尾の4桁の年号を落とす。
   監査済み（2026-11-14）：このDBでは正規化後の1650の素名のうち447が
   複数レコードを持つが、血統（anc）が異なるグループは0件。つまり
   同じ素名はこのDBでは常に同じ血統の馬で、正規化で別馬を誤って
   同一視することはない。すべて参考・未検証。 */
function normalizeCrossName(name) {
  var s = String(name || '').trim();
  var hy = s.indexOf('-');
  if (hy > 0) s = s.slice(0, hy);
  s = s.replace(/[0-9]{4}$/, '');
  return s;
}
/* インブリード判定用の両サイドの位置一覧。父方＝子の父（1代）と父馬由来の
   7位置、母方＝子の母（1代）と母馬由来の7位置。 */
function childPedigreeSides(sire, dam) {
  var rows = buildChildPedigree(sire, dam);
  if (!rows) return null;
  var damHead = { label: '母', name: dam.n || '', pa: '', chi: '', f1: '', f2: '', side: 'dam', gen: 1 };
  return { sireSide: rows.slice(0, 8), damSide: [damHead].concat(rows.slice(8)) };
}
/* 両方に出る同じ祖先名を一覧にする。返り値は
   [{name, pairs: [{sireLabel, sireGen, damLabel, damGen}], f1, f2}]。
   因子は、その祖先の anc の因子1・因子2（分かるもの）。 */
function findInbreeding(sire, dam) {
  var sides = childPedigreeSides(sire, dam);
  if (!sides) return [];
  var byName = {};
  function add(p, side) {
    if (!p.name) return;
    /* 同馬の表記違い（ダンチヒ／ダンチヒ1992 など）は正規化して同一視する。 */
    var key = normalizeCrossName(p.name);
    if (!key) return;
    var e = byName[key];
    if (!e) { e = { name: key, forms: [], sire: [], dam: [], f1: '', f2: '' }; byName[key] = e; }
    if (e.forms.indexOf(p.name) < 0) e.forms.push(p.name);
    e[side].push(p);
    if (!e.f1 && p.f1) e.f1 = p.f1;
    if (!e.f2 && p.f2) e.f2 = p.f2;
  }
  sides.sireSide.forEach(function (p) { add(p, 'sire'); });
  sides.damSide.forEach(function (p) { add(p, 'dam'); });
  var out = [];
  Object.keys(byName).forEach(function (name) {
    var e = byName[name];
    if (!e.sire.length || !e.dam.length) return;
    var pairs = [];
    e.sire.forEach(function (s) {
      e.dam.forEach(function (d) {
        pairs.push({ sireLabel: s.label, sireGen: s.gen, damLabel: d.label, damGen: d.gen });
      });
    });
    pairs.sort(function (a, b) { return (a.sireGen - b.sireGen) || (a.damGen - b.damGen); });
    out.push({ name: name, forms: e.forms, pairs: pairs, f1: e.f1, f2: e.f2 });
  });
  out.sort(function (a, b) { return (a.pairs[0].sireGen + a.pairs[0].damGen) - (b.pairs[0].sireGen + b.pairs[0].damGen); });
  return out;
}
/* 親系統の多重集合が並べ替えで一致するか。 */
function sameMultiset(a, b) {
  var sa = a.slice().sort(), sb = b.slice().sort();
  if (sa.length !== sb.length) return false;
  for (var i = 0; i < sa.length; i++) { if (sa[i] !== sb[i]) return false; }
  return true;
}
function distinctKinds(list) {
  var out = [];
  list.forEach(function (x) { if (x && out.indexOf(x) < 0) out.push(x); });
  return out;
}
/* 配合理論の判定（すべて参考・未検証。断定しない）。
   面白い配合：父馬・母馬それぞれの 父(anc0)・父母父(anc5)・母父(anc8)・
     母母父(anc12) の計8頭の親系統（空は除く）の種類数が7種類以上。
   見事な配合：父馬の 父父母父(anc4)・父母母父(anc7)・母父母父(anc11)・
     母母母父(anc14) の4頭の親系統の多重集合と、母馬の 父(anc0)・父母父(anc5)・
     母父(anc8)・母母父(anc12) の4頭の親系統の多重集合が、並べ替えで一致。
     空の親系統は除いて比べ、除いたあと両方が空でない場合だけ成立とする。
   よくできた配合：上記2つの4頭集合の、共通する親系統の種類数が3種類以上で、
     見事な配合でない場合。
   完璧な配合（ステップ6で追加）：見事な配合と面白い配合が同時に成立すること。
     Appliv式を主とする。dbms-go.netは「種牡馬自身が面白い配合で配合されて
     いることが必須」とも書くが、種牡馬自身の配合は血統データだけでは確認
     できないため、その点は未確認として注記する。効果の数値は表示しない。
   超完璧な配合（ステップ6で追加）：見事な配合が成立し、かつ面白い配合の
     8頭の親系統が8種類すべて異なること。効果の数値は条件付き実測値のため
     表示しない。
   奇跡の配合（ステップ6で追加）：完璧な配合の成立が前提。さらに4×3のクロス：
     最終産駒から見て、一方の4代前ともう一方の3代前に同じ祖先がいること。
     位置制限あり：3代前は繁殖牝馬側の母母父（子の血統表で13番目の母母父）
     のみ有効。4代前は種牡馬側の4代前ならどこでもよい（子の血統表で4・5・
     7・8番目の父父父父／父父母父／父母父父／父母母父）。名前の一致で判定する
     ため、兄弟クロス（異なる馬同士の全兄弟）は分からず、その限界を注記する。
     牝馬クロスが4代前でも無効という出典もあるが、祖先の性別データがないため
     判定できず、注記する。因子別の効果数値は表示しない。
   至高の配合：この機能では判定しない（未確認）。ver.5.0.0（2025-10-29）の
     更新情報に「配合理論『至高の配合』を追加しました」とあることは注記する。
   危険な配合（ステップ6で追加）：1×Nおよび2×2のクロスが発生すると危険な
     配合になる。1×N：父馬名または母馬名そのものが相手方の血統に出る場合。
     2×2：父方2代（父父）と母方2代（母父）に同じ祖先が出る場合。父母・母母の
     名前は血統データに牝馬が出ないため分からず、2×2は父父×母父の一致だけを
     判定する。受胎率の数値は未検証のため表示しない。兄弟姉妹クロスは血統表に
     牝馬が出ないため判定できない場合があることを注記する。
   どの理論も、判定には根拠（どの祖先・系統が一致したか）を一緒に表示し、
   すべて「参考・未検証」と明記し、効果を断定しない。数値効果は表示しない。 */
function checkMiracleCross(sire, dam) {
  /* 4×3のクロス（奇跡の配合用）。子の血統表の rows[12]（母母父・3代前）と、
     種牡馬側の4代前 rows[3,4,6,7]（父父父父／父父母父／父母父父／父母母父）の
     名前が一致すれば成立。返り値は {hit, name, sireLabel} または {hit:false}。
     名前は正規化して比べる（ダンチヒ／ダンチヒ1992 など同馬の表記違いを
     同一視する。出典：しまむら牧場 note、るんば note）。name は正規化後の
     素名。sireName／damName は元の表記（表示用）。 */
  var rows = buildChildPedigree(sire, dam);
  if (!rows) return { hit: false };
  var dam3 = rows[12];
  if (!dam3 || !dam3.name) return { hit: false };
  var dam3Base = normalizeCrossName(dam3.name);
  if (!dam3Base) return { hit: false };
  var sire4Idx = [3, 4, 6, 7];
  for (var i = 0; i < sire4Idx.length; i++) {
    var r = rows[sire4Idx[i]];
    if (r && r.name && normalizeCrossName(r.name) === dam3Base) {
      return { hit: true, name: dam3Base, sireLabel: r.label, damLabel: dam3.label, sireName: r.name, damName: dam3.name };
    }
  }
  return { hit: false };
}
function checkDangerous(sire, dam) {
  /* 危険な配合：findInbreeding の両方に出る祖先の組み合わせから、
     1×N（父馬名・母馬名そのものが相手方の血統に出る）と
     2×2（父方2代×母方2代の一致）を拾う。1×1（父馬名＝母馬名そのもの）は
     除外する。返り値は {hit, details: [{type, name, sireLabel, sireGen,
     damLabel, damGen}]}。type は '1xN' または '2x2'。 */
  var details = [];
  var seen = {};
  function add(type, name, pr) {
    var key = type + '|' + name + '|' + pr.sireLabel + '|' + pr.damLabel;
    if (seen[key]) return;
    seen[key] = true;
    details.push({ type: type, name: name, sireLabel: pr.sireLabel, sireGen: pr.sireGen, damLabel: pr.damLabel, damGen: pr.damGen });
  }
  findInbreeding(sire, dam).forEach(function (c) {
    c.pairs.forEach(function (pr) {
      if (pr.sireGen === 1 && pr.damGen >= 2) add('1xN', c.name, pr);
      else if (pr.damGen === 1 && pr.sireGen >= 2) add('1xN', c.name, pr);
      else if (pr.sireGen === 2 && pr.damGen === 2) add('2x2', c.name, pr);
    });
  });
  return { hit: details.length > 0, details: details };
}
function checkMatingTheories(sire, dam) {
  if (!sire || !dam) return null;
  function paList(h, idxs) { return idxs.map(function (i) { return stallionAncestor(h, i).pa; }); }
  var eight = paList(sire, [0, 5, 8, 12]).concat(paList(dam, [0, 5, 8, 12]));
  var eightKinds = distinctKinds(eight);
  var omoshiroi = eightKinds.length >= 7;
  var sireSet4 = distinctKinds(paList(sire, [4, 7, 11, 14]).filter(function (x) { return x; }));
  var sireSet4Multi = paList(sire, [4, 7, 11, 14]).filter(function (x) { return x; });
  var damSet4Multi = paList(dam, [0, 5, 8, 12]).filter(function (x) { return x; });
  var migoto = sireSet4Multi.length > 0 && damSet4Multi.length > 0 && sameMultiset(sireSet4Multi, damSet4Multi);
  var commonKinds = distinctKinds(sireSet4Multi).filter(function (x) { return distinctKinds(damSet4Multi).indexOf(x) >= 0; });
  var yokudekita = !migoto && commonKinds.length >= 3;
  var perfect = omoshiroi && migoto;
  var superPerfect = migoto && eightKinds.length === 8;
  var miracleCross = checkMiracleCross(sire, dam);
  var miracle = perfect && miracleCross.hit;
  var dangerous = checkDangerous(sire, dam);
  return {
    omoshiroi: { hit: omoshiroi, distinctCount: eightKinds.length, kinds: eightKinds },
    migoto: { hit: migoto, sireKinds: sireSet4Multi, damKinds: damSet4Multi },
    yokudekita: { hit: yokudekita, commonCount: commonKinds.length, commonKinds: commonKinds },
    perfect: { hit: perfect },
    perfectLookalike: perfect,
    superPerfect: { hit: superPerfect, distinctCount: eightKinds.length, kinds: eightKinds },
    miracle: { hit: miracle, cross: miracleCross },
    dangerous: dangerous,
    anyHit: omoshiroi || migoto || yokudekita || perfect || superPerfect || miracle
  };
}
/* ---------- 配合理論のプレビュー（保存前） ---------- */
/* 保存後の確認（buildChildPedigreeHtml）と保存前のプレビューで、配合理論の
   表示を同じ関数（matingTheorySummaryHtml）から作る。判定はどちらも
   checkMatingTheories を使うので、保存前に見た想定と保存後の判定は一致
   する。すべて参考・未検証で、配合の効果を断定しない。 */
/* checkMatingTheories の返り値 th を受け取り、理論の一覧（<ul>）と
   「理論なし」の注記を返す。buildChildPedigreeHtml とプレビューで共通。 */
function matingTheorySummaryHtml(th) {
  var html = '<p class="note">ユーザー攻略記事による推定・共有情報で、公式仕様ではありません。配合の効果を断定する表示はしません。</p><ul>';
  html += '<li>面白い配合：' + (th.omoshiroi.hit ? '当てはまるように見えます（参考）' : '当てはまりません') +
    ' — 父馬・母馬の 父／父母父／母父／母母父 の計8頭の親系統は' + th.omoshiroi.distinctCount + '種類（' + esc(th.omoshiroi.kinds.join('、') || 'なし') + '）。7種類以上で成立とする参考条件です。</li>';
  html += '<li>見事な配合：' + (th.migoto.hit ? '当てはまるように見えます（参考）' : '当てはまりません') +
    ' — 父馬の 父父母父／父母母父／母父母父／母母母父 の親系統（' + esc(th.migoto.sireKinds.join('、') || 'なし') + '）と、母馬の 父／父母父／母父／母母父 の親系統（' + esc(th.migoto.damKinds.join('、') || 'なし') + '）の多重集合が' + (th.migoto.hit ? '一致します' : '一致しません') + '。参考条件です。</li>';
  html += '<li>よくできた配合：' + (th.yokudekita.hit ? '当てはまるように見えます（参考）' : '当てはまりません') +
    ' — 上の2つの4頭集合で共通する親系統は' + th.yokudekita.commonCount + '種類（' + esc(th.yokudekita.commonKinds.join('、') || 'なし') + '）。3種類以上で、見事な配合でない場合に成立とする参考条件です。</li>';
  if (th.perfect.hit) {
    html += '<li>完璧な配合：当てはまるように見えます（参考） — 見事な配合と面白い配合が同時に成立する参考条件です。ただし、種牡馬自身が面白い配合であることも必要とする説明（dbms-go.net）があり、血統データだけでは確認できないため、その点は未確認です。効果の数値は表示しません。</li>';
  } else {
    html += '<li>完璧な配合：当てはまりません — 見事な配合と面白い配合の両方が成立する場合に当てはまるように見えます（参考）。種牡馬自身の条件については血統データだけでは確認できず未確認です。</li>';
  }
  if (th.superPerfect.hit) {
    html += '<li>超完璧な配合：当てはまるように見えます（参考） — 見事な配合が成立し、面白い配合の8頭の親系統が8種類すべて異なります（' + esc(th.superPerfect.kinds.join('、')) + '）。効果の数値は条件付き実測値のため表示しません。</li>';
  } else {
    html += '<li>超完璧な配合：当てはまりません — 見事な配合が成立し、かつ面白い配合の8頭の親系統が8種類（現在' + th.superPerfect.distinctCount + '種類）の場合に当てはまるように見えます（参考）。</li>';
  }
  if (th.miracle.hit) {
    var variantNote = (th.miracle.cross.sireName && th.miracle.cross.damName && th.miracle.cross.sireName !== th.miracle.cross.damName)
      ? '（父側の表記「' + esc(th.miracle.cross.sireName) + '」と母側の表記「' + esc(th.miracle.cross.damName) + '」は、同馬の因名違い・年号違いとみなして照合しています。参考）' : '';
    html += '<li>奇跡の配合：当てはまるように見えます（参考） — 完璧な配合が成立し、さらに4×3のクロスがあります。「' + esc(th.miracle.cross.name) + '」が種牡馬側4代前（' + esc(th.miracle.cross.sireLabel) + '）と繁殖牝馬側3代前（' + esc(th.miracle.cross.damLabel) + '）にいます。' + variantNote + '名前の一致だけで判定しているため、兄弟クロス（異なる馬同士の全兄弟）は分からず、判定の限界です。牝馬クロスが4代前でも無効という出典もありますが、祖先の性別データがないため判定できません。配合掲示板には表示されない隠し要素とされます。因子別の効果数値は表示しません。</li>';
  } else if (!th.perfect.hit) {
    html += '<li>奇跡の配合：当てはまりません — 完璧な配合の成立が前提のため、まず完璧な配合の条件を確認してください（参考）。</li>';
  } else {
    html += '<li>奇跡の配合：当てはまりません — 完璧な配合は成立していますが、種牡馬側4代前と繁殖牝馬側3代前（母母父）に同じ祖先がいる4×3のクロスは見つかりませんでした（参考）。名前の一致だけで判定しています。</li>';
  }
  html += '<li>至高の配合：未確認です。この機能では判定しません。「同一の種牡馬で3×4×5のクロス、因子6種類以上」という核はありますが、「因子6種類以上」の数える範囲と3・4・5代の割り振りが出典で明示されておらず、効果も出典間で矛盾しているため判定しません。存在自体は公式で、ver.5.0.0（2025-10-29）の更新情報に「配合理論『至高の配合』を追加しました」とあります。</li>';
  if (th.dangerous.hit) {
    html += '<li>危険な配合：当てはまるように見えます（参考） — ' + th.dangerous.details.map(function (d) {
      if (d.type === '1xN') {
        return '「' + esc(d.name) + '」が父方' + d.sireGen + '代（' + esc(d.sireLabel) + '）×母方' + d.damGen + '代（' + esc(d.damLabel) + '）に出るため、1×' + (d.sireGen === 1 ? d.damGen : d.sireGen) + 'のクロス';
      }
      return '「' + esc(d.name) + '」が父方2代（' + esc(d.sireLabel) + '）×母方2代（' + esc(d.damLabel) + '）に出るため、2×2のクロス';
    }).join('／') + '。受胎率の数値は未検証のため表示しません。2×2は父父×母父の一致だけを判定しています（父母・母母の名前は血統データに牝馬が出ないため分かりません）。兄弟姉妹クロスは血統表に牝馬が出ないため判定できない場合があります。</li>';
  } else {
    html += '<li>危険な配合：当てはまりません — 父馬名・母馬名そのものが相手方の血統に出る1×Nのクロスも、父方2代×母方2代の2×2のクロスも見つかりませんでした（参考）。2×2は父父×母父の一致だけを判定しています（父母・母母の名前は血統データに牝馬が出ないため分かりません）。</li>';
  }
  html += '</ul>';
  if (!th.anyHit && !th.dangerous.hit) html += '<p>この組み合わせでは、確認できた配合理論はありません（参考）。</p>';
  if (!th.anyHit && th.dangerous.hit) html += '<p>当てはまるプラスの配合理論はありませんでしたが、危険な配合の条件に当てはまるように見えます（参考）。</p>';
  return html;
}
/* プレビューの状態を決める純粋な関数（DOMを使わない）。
   sire/dam は resolveParentRef で解決した馬（解決できなければ null）。
   sireName/damName は欄の入力文字列（名前だけの入力の検出用）。
   sireHasRef/damHasRef は、その側がDB・自家生産馬から選ばれているか
   （選んだのに解決できなかった＝見つからない場合の検出用）。
   返り値: {status, missingRole, sire, dam, theories}。
   status は 'empty'（両方とも未入力）／'one-side'（片方だけ）／
   'name-only'（両方に名前はあるが、どちらか／両方がDB・自家生産馬から
   選ばれていないため血統が分からない）／'missing'（選んだ親が見つから
   ない）／'ok'（両方とも解決できた）。'ok' の場合だけ theories に
   checkMatingTheories の返り値が入る。 */
function matingTheoryPreview(sire, dam, sireName, damName, sireHasRef, damHasRef) {
  var sireNamed = !!(sireName && String(sireName).trim());
  var damNamed = !!(damName && String(damName).trim());
  var sirePresent = sireNamed || !!sireHasRef;
  var damPresent = damNamed || !!damHasRef;
  if (!sirePresent && !damPresent) return { status: 'empty', missingRole: null, sire: sire, dam: dam, theories: null };
  if (sireHasRef && !sire) return { status: 'missing', missingRole: 'sire', sire: sire, dam: dam, theories: null };
  if (damHasRef && !dam) return { status: 'missing', missingRole: 'dam', sire: sire, dam: dam, theories: null };
  if (sirePresent && !damPresent) return { status: 'one-side', missingRole: 'dam', sire: sire, dam: dam, theories: null };
  if (!sirePresent && damPresent) return { status: 'one-side', missingRole: 'sire', sire: sire, dam: dam, theories: null };
  if (!sireHasRef || !damHasRef) return { status: 'name-only', missingRole: null, sire: sire, dam: dam, theories: null };
  return { status: 'ok', missingRole: null, sire: sire, dam: dam, theories: checkMatingTheories(sire, dam) };
}
/* プレビューの表示（matingTheoryPreview の返り値を受け取る）。保存後の
   確認と同じ matingTheorySummaryHtml を使うので、文言と判定は一致する。 */
function matingTheoryPreviewHtml(pv) {
  if (!pv) return '';
  if (pv.status === 'empty') {
    return '<p class="note">父馬・母馬を両方選ぶと、ここに配合理論の想定が表示されます（参考・未検証）。</p>';
  }
  if (pv.status === 'one-side') {
    var other = pv.missingRole === 'sire' ? '父馬' : '母馬';
    return '<p class="note">' + other + 'も選ぶと、ここに配合理論の想定が表示されます（参考・未検証）。</p>';
  }
  if (pv.status === 'name-only') {
    return '<p class="note">名前だけの入力では血統が分からないため、配合理論は判定できません。父馬・母馬の両方をデータベースまたは自家生産馬から選んでください（参考・未検証）。</p>';
  }
  if (pv.status === 'missing') {
    return '<p class="note">選んだ父馬・母馬が見つかりません。データベースが読み込めていないか、自家生産馬が削除された可能性があります。父馬・母馬を選び直してください。</p>';
  }
  var label = routeTheoryLabel(pv.sire, pv.dam);
  var html = '<h4>配合理論の想定（保存前・参考・未検証）</h4>';
  html += '<p class="meta">父 ' + esc(pv.sire.n || '') + ' × 母 ' + esc(pv.dam.n || '') + '</p>';
  if (label && label.hits.length) {
    html += '<p>成立しそうな理論（参考・未検証）：' + esc(label.hits.join('、')) + '</p>';
  } else {
    html += '<p>配合理論なし（参考・未検証）</p>';
  }
  if (label && label.dangerous) html += '<p class="note">危険な配合の条件に当てはまるように見えます（参考）。</p>';
  html += matingTheorySummaryHtml(pv.theories);
  return html;
}
/* 計画フォーム（作成・編集）のプレビュー表示を更新する。父馬・母馬の
   選択が変わるたびに updatePlanDbStatus から呼ぶ。 */
function updatePlanTheoryPreview() {
  var box = $('plan-theory-preview');
  if (!box) return;
  var sire = resolveParentRef({ dbIndex: selectedDb.sire, ownId: selectedOwn.sire });
  var dam = resolveParentRef({ dbIndex: selectedDb.dam, ownId: selectedOwn.dam });
  var sireName = $('p-sire') ? $('p-sire').value : '';
  var damName = $('p-dam') ? $('p-dam').value : '';
  var sireHasRef = (selectedDb.sire !== null && selectedDb.sire !== undefined) || !!selectedOwn.sire;
  var damHasRef = (selectedDb.dam !== null && selectedDb.dam !== undefined) || !!selectedOwn.dam;
  box.innerHTML = matingTheoryPreviewHtml(matingTheoryPreview(sire, dam, sireName, damName, sireHasRef, damHasRef));
}
/* 子の血統・配合理論の確認の表示（折りたたみ・既定は閉じる）。 */
function buildChildPedigreeHtml(sire, dam) {
  var rows = buildChildPedigree(sire, dam);
  if (!rows) return '';
  var nameToIdx = stallionNameToIndex();
  /* 素名→DB番号の対応（祖先名が素名で、DBの記録名が別バリエーションの
     場合の照合用。例：祖先名ダンチヒ → DBのダンチヒ1992）。 */
  var baseToIdx = {};
  if (STALLIONS && Array.isArray(STALLIONS.horses)) {
    STALLIONS.horses.forEach(function (h, j) {
      var b = normalizeCrossName(h.n);
      if (b && baseToIdx[b] === undefined) baseToIdx[b] = j;
    });
  }
  var html = '<details class="ref-details"><summary>子の血統・配合理論を見る（参考・未検証）</summary>';
  html += '<p>子の父：' + esc(sire.n || '') + ' ／ 子の母：' + esc(dam.n || '') + '</p>';
  html += '<h4>子の血統表（5代・参考）</h4><table><thead><tr><th>血統位置</th><th>祖先名</th><th>親系統</th><th>因子</th><th>DB</th></tr></thead><tbody>';
  rows.forEach(function (r) {
    var idx = (r.name && nameToIdx[r.name] !== undefined) ? nameToIdx[r.name] : null;
    if (idx === null && r.name) {
      /* 祖先名が素名（例：ダンチヒ）で、DBの記録名が別バリエーション
         （例：ダンチヒ1992）の場合も、正規化して探す。 */
      var b = normalizeCrossName(r.name);
      if (b && baseToIdx[b] !== undefined) idx = baseToIdx[b];
    }
    html += '<tr><td>' + esc(r.label) + '</td><td>' + esc(r.name || '—') + '</td><td>' + esc(r.pa || '—') + '</td><td>' +
      esc([r.f1, r.f2].filter(function (x) { return x; }).join('／') || '—') + '</td><td>' +
      (idx !== null ? 'DBにあり <button type="button" data-stallion-idx="' + idx + '">詳細</button>' : '—') + '</td></tr>';
  });
  html += '</tbody></table>';
  html += '<p class="note">祖先名がデータベース内の馬名と完全一致する場合は「DBにあり」と表示し、「詳細」でその馬の血統・詳細を見られます。同馬の因名違い・年号違いの表記（例：ダンチヒ／ダンチヒ1992）も同一視して探します。</p>';
  var th = checkMatingTheories(sire, dam);
  html += '<h4>配合理論の確認（参考・未検証）</h4>';
  html += matingTheorySummaryHtml(th);
  var crosses = findInbreeding(sire, dam);
  html += '<h4>インブリード（クロス・参考）</h4>';
  if (!crosses.length) {
    html += '<p>5代以内に同じ祖先は見つかりませんでした（参考）。</p>';
  } else {
    html += '<ul>' + crosses.map(function (c) {
      var pairs = c.pairs.map(function (pr) {
        return '父方' + pr.sireGen + '代（' + pr.sireLabel + '） × 母方' + pr.damGen + '代（' + pr.damLabel + '）';
      }).join('／');
      var factors = [c.f1, c.f2].filter(function (x) { return x; }).join('／');
      var forms = (c.forms && c.forms.length > 1) ? '（表記：' + esc(c.forms.join('／')) + ' — 同馬の因名違い・年号違いとみなしています）' : '';
      return '<li>' + esc(c.name) + forms + '：' + esc(pairs) + (factors ? '（因子：' + esc(factors) + '）' : '') + '</li>';
    }).join('') + '</ul>';
  }
  html += '<p class="note">出典（ユーザー攻略記事。公式仕様ではありません）：<a href="https://games.app-liv.jp/archives/232008" target="_blank" rel="noopener">Appliv Games「ダビマス 配合のやり方と面白い配合／見事な配合／よくできた配合の条件」</a>、<a href="https://games.app-liv.jp/archives/198428" target="_blank" rel="noopener">Appliv Games「ダビマス 配合のポイント」</a>、<a href="https://dbms-go.net/配合解説/完璧な配合/" target="_blank" rel="noopener">dbms-go.net「完璧な配合」</a>、<a href="https://dabimasu.gamerch.com/%E5%AE%8C%E7%92%A7%E3%81%AA%E9%85%8D%E5%90%88" target="_blank" rel="noopener">Gamerch「完璧な配合」</a>、<a href="https://note.com/runbarunba1218/n/n1952a2d129aa" target="_blank" rel="noopener">るんば note「超完璧・奇跡の配合」</a>、<a href="https://note.com/huh_ds/n/n0eb8a439d3f3" target="_blank" rel="noopener">ふふ牧場 note「ダビマス 備忘録」</a>、<a href="https://note.com/sashimi_sky/n/n65db77ba6661" target="_blank" rel="noopener">しまむら牧場 note「奇跡の配合」</a>、<a href="https://note.com/derbymas/n/n4352f6b2c96f" target="_blank" rel="noopener">スマイル牧場 note「奇跡の配合」</a>、<a href="https://note.com/dabimas_ikko/n/ndf3449c98068" target="_blank" rel="noopener">イッコ牧場 note「危険な配合」</a>。詳しくは docs/rules.md を見てください。</p>';
  html += '</details>';
  return html;
}
/* ---------- 配合ルート図（ステップ7） ---------- */
/* 計画の世代の列から、世代ごとの父・母・子を図にする。左が最終の子、
   右へ行くほど前の世代（第n世代＝1代前、第n-1世代＝2代前…）。
   種牡馬は青系、繁殖牝馬はピンク系の箱。親から子へのつながりを
   矢印（←）で示す。各世代の配合理論は、ステップ3・6の判定
   （checkMatingTheories）から一番上のものをラベルにする。
   優先順：奇跡＞超完璧＞完璧＞見事＞面白い＞よくできた。
   どれにも当てはまらなければ「配合理論なし」。
   すべて参考・未検証で、配合の効果を断定しない。
   buildRouteDiagram は表示用の純粋なデータ（DOMを使わない）で、
   scripts/test-route-diagram.js で自動確認する。 */
function routeTheoryLabel(sire, dam) {
  var th = checkMatingTheories(sire, dam);
  if (!th) return null;
  var hits = [];
  if (th.miracle.hit) hits.push('奇跡の配合');
  if (th.superPerfect.hit) hits.push('超完璧な配合');
  if (th.perfect.hit) hits.push('完璧な配合');
  if (th.migoto.hit) hits.push('見事な配合');
  if (th.omoshiroi.hit) hits.push('面白い配合');
  if (th.yokudekita.hit) hits.push('よくできた配合');
  return { label: hits.length ? hits[0] : '配合理論なし', hits: hits, dangerous: th.dangerous.hit, anyHit: th.anyHit };
}
/* 世代の父馬・母馬1頭分の図の箱。
   kind: 'sire'／'dam'（解決できた親）、'missing'（選んだ親が見つからない）、
   'name-only'（名前だけの入力）、'empty'（未入力）。
   prevChildGenNo は「自家生産馬ID→その子が何世代目か」の対応表。
   前の世代の子が親になっている場合は、その旨を注記する。 */
function routeParentBox(gen, role, prevChildGenNo) {
  var isSire = role === 'sire';
  var name = String((isSire ? gen.sireName : gen.damName) || '').trim();
  var ownId = isSire ? gen.sireOwnId : gen.damOwnId;
  var dbIndex = isSire ? gen.sireDbIndex : gen.damDbIndex;
  var hasRef = (dbIndex !== null && dbIndex !== undefined) || !!ownId;
  var resolved = resolveParentRef({ dbIndex: dbIndex, ownId: ownId });
  if (resolved) {
    var note = ownId ? '自家生産馬' : 'DB';
    if (ownId) {
      var o = findOwnHorse(ownId);
      if (o && o.generation) note += '・' + o.generation + '代目';
      note += '・' + ownHorseOriginLabel(o);
    }
    if (ownId && prevChildGenNo && prevChildGenNo[ownId]) note += '・第' + prevChildGenNo[ownId] + '世代の子';
    return { role: role, kind: role, name: resolved.n || name, note: note };
  }
  if (hasRef) {
    return { role: role, kind: 'missing', name: '親が見つかりません',
      note: '選んだ' + (isSire ? '父馬' : '母馬') + 'が見つかりません（DBが読み込めていないか、自家生産馬が削除された可能性があります）' };
  }
  if (name) {
    return { role: role, kind: 'name-only', name: name,
      note: '名前だけの入力（DB・自家生産馬から未選択）のため血統・配合理論は確認できません' };
  }
  return { role: role, kind: 'empty', name: '（未入力）', note: '' };
}
function buildRouteDiagram(plan) {
  var gens = planGenerations(plan);
  if (!gens.length) return null;
  var n = gens.length;
  var prevChildGenNo = {};
  gens.forEach(function (g, i) { if (g.childOwnId) prevChildGenNo[g.childOwnId] = i + 1; });
  var matings = gens.map(function (gen, i) {
    var m = { genNo: i + 1, status: 'ok', label: null, hits: [], dangerous: false, anyHit: false };
    var pair = resolveGenerationParents(gen);
    if (pair) {
      var t = routeTheoryLabel(pair.sire, pair.dam);
      m.label = t.label; m.hits = t.hits; m.dangerous = t.dangerous; m.anyHit = t.anyHit;
    } else if (generationHasAnyParentRef(gen)) {
      m.status = 'missing';
    } else {
      m.status = 'no-ref';
    }
    return m;
  });
  var columns = [];
  var finalGen = gens[n - 1];
  columns.push({
    key: 'final', title: '最終の子', genNo: n, mating: null,
    boxes: [{ role: 'child', kind: 'child',
      name: String(finalGen.childName || '').trim() || defaultGenerationChildName(plan, n),
      note: '第' + n + '世代の子・' + (finalGen.childSex || '不明') }]
  });
  for (var k = n - 1; k >= 0; k--) {
    var gen = gens[k];
    columns.push({
      key: 'gen-' + (k + 1), title: '第' + (k + 1) + '世代（' + (n - k) + '代前）',
      genNo: k + 1, mating: matings[k],
      boxes: [routeParentBox(gen, 'sire', prevChildGenNo), routeParentBox(gen, 'dam', prevChildGenNo)]
    });
  }
  return { planName: plan.name, generationCount: n,
    finalChildName: String(finalGen.childName || '').trim() || defaultGenerationChildName(plan, n),
    columns: columns, matings: matings };
}
function buildRouteDiagramHtml(plan) {
  /* 別の計画の子を親に選んだ計画（複数ルートの掛け合わせ）は、父方・母方
     両方の枝が最終の子で合流する統合図にする。それ以外は今までの1ルートの図。 */
  if (planHasCrossRouteAncestry(plan)) {
    var mh = buildMergedRouteDiagramHtml(plan);
    if (mh) return mh;
  }
  var d = buildRouteDiagram(plan);
  if (!d) return '';
  var html = '<details class="route-diagram" open><summary>配合ルート図を見る（参考・未検証）</summary>';
  html += '<p class="note">左が最終の子、右へ行くほど前の世代です。青い箱が種牡馬、ピンクの箱が繁殖牝馬です。矢印（←）は親から子へのつながりです。配合理論の判定はユーザー攻略記事による推定・共有情報で、すべて参考・未検証です。配合の効果を断定する表示はしません。</p>';
  html += '<div class="route-scroll"><div class="route-diagram-inner">';
  d.columns.forEach(function (col, ci) {
    if (ci > 0) html += '<div class="route-arrow" aria-hidden="true">←</div>';
    html += '<div class="route-col"><h4>' + esc(col.title) + '</h4>';
    col.boxes.forEach(function (b) {
      var cls = b.kind === 'sire' ? 'route-sire' : b.kind === 'dam' ? 'route-dam' : b.kind === 'child' ? 'route-child' : 'route-missing';
      var roleText = b.role === 'sire' ? '父（種牡馬）' : b.role === 'dam' ? '母（繁殖牝馬）' : '子';
      html += '<div class="route-box ' + cls + '"><span class="route-role">' + roleText + '</span><span class="route-name">' + esc(b.name || '—') + '</span>' +
        (b.note ? '<span class="route-note">' + esc(b.note) + '</span>' : '') + '</div>';
    });
    if (col.mating) {
      var m = col.mating;
      if (m.status === 'ok') {
        html += '<p class="route-theory">第' + m.genNo + '世代：' + esc(m.label) + '（参考・未検証）' +
          (m.dangerous ? '／危険な配合の条件に当てはまるように見えます（参考）' : '') + '</p>';
      } else if (m.status === 'missing') {
        html += '<p class="route-theory route-theory-missing">第' + m.genNo + '世代：親が見つかりません — この世代の配合理論は確認できません（計画自体は残っています）</p>';
      } else {
        html += '<p class="route-theory route-theory-missing">第' + m.genNo + '世代：父・母をDBまたは自家生産馬から選ぶと配合理論を確認できます</p>';
      }
    }
    html += '</div>';
  });
  html += '</div></div></details>';
  return html;
}

/* ---------- 配合ルート図（複数ルート統合・ステップ8） ---------- */
/* 別の計画（ルート）の最後の子をこの計画の父・母として選んだ場合、その子の
   由来の計画の世代列をたどって、父方ルートと母方ルートの両方の枝を出す。
   最終の子を根（左端）とし、親を右へたどる木構造。1つの配合＝1つの節で、
   子の箱＋その配合の理論ラベル＋父の枝・母の枝を持つ。父・母が自家生産馬で
   由来が分かる場合は、その馬を生んだ配合を枝として展開する（再帰。循環
   参照は seen で防ぎ、深さは MERGED_ROUTE_MAX_DEPTH まで）。由来が分から
   ない自分の馬・由来の計画や世代が見つからない馬は、枝なしで箱だけ表示
   する。DBの馬・名前だけの入力・未入力も箱だけ。
   すべて参考・未検証で、配合の効果を断定しない。
   buildMergedRouteDiagram／buildMergedRouteDiagramHtml は表示用の純粋な
   データとHTML（DOMを使わない部分）で、scripts/test-merged-route.js で
   自動確認する。 */
var MERGED_ROUTE_MAX_DEPTH = 12;
function mergedTheoryForGen(gen) {
  var pair = resolveGenerationParents(gen);
  if (pair) {
    var t = routeTheoryLabel(pair.sire, pair.dam);
    return { status: 'ok', label: t.label, hits: t.hits, dangerous: t.dangerous };
  }
  if (generationHasAnyParentRef(gen)) return { status: 'missing', label: null, hits: [], dangerous: false };
  return { status: 'no-ref', label: null, hits: [], dangerous: false };
}
/* 1頭分の枝の節。mating がある場合だけ、その馬を生んだ配合へ展開する。
   kind: 'db'／'own'（解決できた親）、'missing'（選んだ親が見つからない）、
   'name-only'（名前だけの入力）、'empty'（未入力）。 */
function mergedParentNode(gen, role, seen, depth) {
  var isSire = role === 'sire';
  var name = String((isSire ? gen.sireName : gen.damName) || '').trim();
  var ownId = isSire ? gen.sireOwnId : gen.damOwnId;
  var dbIndex = isSire ? gen.sireDbIndex : gen.damDbIndex;
  var hasRef = (dbIndex !== null && dbIndex !== undefined) || !!ownId;
  if (hasRef && ownId) {
    var o = findOwnHorse(ownId);
    if (!o) {
      return { role: role, kind: 'missing', name: '親が見つかりません',
        note: '選んだ' + (isSire ? '父馬' : '母馬') + 'が見つかりません（自家生産馬が削除された可能性があります）', mating: null };
    }
    var node = { role: role, kind: 'own', name: o.name, sex: o.sex,
      note: '自家生産馬' + (o.generation ? '・' + o.generation + '代目' : '') + '・' + ownHorseOriginLabel(o),
      mating: null, originStatus: 'unknown' };
    if (seen[o.id]) {
      node.originStatus = 'cycle';
      node.note += '（循環参照のためこれ以上たどれません）';
      return node;
    }
    var og = originGenerationOf(o);
    if (!og) return node;
    if (og.missingPlan) {
      node.originStatus = 'missing-plan';
      node.note += '（由来の計画が見つかりません）';
      return node;
    }
    if (og.missingGeneration) {
      node.originStatus = 'missing-generation';
      node.note += '（由来の世代が見つかりません）';
      return node;
    }
    if (depth >= MERGED_ROUTE_MAX_DEPTH) {
      node.originStatus = 'too-deep';
      node.note += '（これ以上たどれません）';
      return node;
    }
    var seen2 = {};
    for (var k in seen) seen2[k] = true;
    seen2[o.id] = true;
    node.mating = mergedMatingNode(og.plan, og.gen, og.genNo, seen2, depth + 1);
    node.originStatus = 'ok';
    return node;
  }
  if (hasRef && dbIndex !== null && dbIndex !== undefined) {
    var h = (STALLIONS && Array.isArray(STALLIONS.horses)) ? STALLIONS.horses[dbIndex] : null;
    if (!h) {
      return { role: role, kind: 'missing', name: '親が見つかりません',
        note: '選んだ' + (isSire ? '父馬' : '母馬') + 'が見つかりません（DBが読み込めていません）', mating: null };
    }
    return { role: role, kind: role, name: h.n || '', note: 'DB', mating: null };
  }
  if (hasRef) {
    return { role: role, kind: 'missing', name: '親が見つかりません',
      note: '選んだ' + (isSire ? '父馬' : '母馬') + 'が見つかりません（DBが読み込めていないか、自家生産馬が削除された可能性があります）', mating: null };
  }
  if (name) {
    return { role: role, kind: 'name-only', name: name,
      note: '名前だけの入力（DB・自家生産馬から未選択）のため血統・配合理論は確認できません', mating: null };
  }
  return { role: role, kind: 'empty', name: '（未入力）', note: '', mating: null };
}
/* 1つの配合の節。childName はその配合の子（最終の子の場合は最終の子、
   枝の場合は由来の自分の馬）の名前。 */
function mergedMatingNode(plan, gen, genNo, seen, depth) {
  var m = { planName: plan.name, planId: plan.id, genNo: genNo,
    childName: String(gen.childName || '').trim() || defaultGenerationChildName(plan, genNo),
    childSex: gen.childSex || '不明',
    theory: mergedTheoryForGen(gen), sire: null, dam: null };
  m.sire = mergedParentNode(gen, 'sire', seen, depth);
  m.dam = mergedParentNode(gen, 'dam', seen, depth);
  return m;
}
/* 計画の最終の子の血統ルートを木構造で作る。根は最終の世代の配合。
   matingCount は図に出る配合の数、planNames は図に出る計画名、
   horseNames は図に出る馬名（子の箱・親の箱のすべて。重複なし）。 */
function buildMergedRouteDiagram(plan) {
  var gens = planGenerations(plan);
  if (!gens.length) return null;
  var n = gens.length;
  var root = mergedMatingNode(plan, gens[n - 1], n, {}, 0);
  var d = { planName: plan.name, generationCount: n,
    finalChildName: String(gens[n - 1].childName || '').trim() || defaultGenerationChildName(plan, n),
    root: root, merged: true, matingCount: 0, planNames: [], horseNames: [], maxDepth: 0 };
  function collectNames(m, depth) {
    if (!m) return;
    d.matingCount++;
    if (d.planNames.indexOf(m.planName) < 0) d.planNames.push(m.planName);
    if (depth > d.maxDepth) d.maxDepth = depth;
    [m.childName, m.sire && m.sire.name, m.dam && m.dam.name].forEach(function (nm) {
      if (nm && d.horseNames.indexOf(nm) < 0) d.horseNames.push(nm);
    });
    [m.sire, m.dam].forEach(function (h) { if (h && h.mating) collectNames(h.mating, depth + 1); });
  }
  collectNames(root, 0);
  return d;
}
/* 最終の世代の先祖に、別の計画の子（由来の計画がこの計画と違う自分の馬）
   がいるかどうか。いる場合だけ統合図を使う。 */
function planHasCrossRouteAncestry(plan) {
  if (!plan) return false;
  var gens = planGenerations(plan);
  if (!gens.length) return false;
  var seen = {};
  function checkGen(gen, depth) {
    if (!gen || depth > MERGED_ROUTE_MAX_DEPTH) return false;
    var ownIds = [gen.sireOwnId, gen.damOwnId];
    for (var i = 0; i < ownIds.length; i++) {
      var o = ownIds[i] ? findOwnHorse(ownIds[i]) : null;
      if (!o || seen[o.id]) continue;
      seen[o.id] = true;
      var og = originGenerationOf(o);
      if (!og || og.missingPlan || og.missingGeneration) continue;
      if (og.plan.id !== plan.id) return true;
      if (checkGen(og.gen, depth + 1)) return true;
    }
    return false;
  }
  return checkGen(gens[gens.length - 1], 0);
}
function mergedHorseBoxHtml(h) {
  var cls = h.kind === 'sire' ? 'route-sire' : h.kind === 'dam' ? 'route-dam' :
    h.kind === 'own' ? (h.sex === '牝' ? 'route-dam' : 'route-sire') : 'route-missing';
  var roleText = h.role === 'sire' ? '父（種牡馬）' : '母（繁殖牝馬）';
  return '<div class="route-box ' + cls + '"><span class="route-role">' + roleText + '</span><span class="route-name">' + esc(h.name || '—') + '</span>' +
    (h.note ? '<span class="route-note">' + esc(h.note) + '</span>' : '') + '</div>';
}
function mergedBranchHtml(h) {
  if (!h) return '';
  if (h.mating) return mergedMatingHtml(h.mating);
  return '<div class="merge-branch">' + mergedHorseBoxHtml(h) + '</div>';
}
function mergedMatingHtml(m) {
  var html = '<div class="merge-mating"><div class="merge-child-col">';
  html += '<div class="route-box route-child"><span class="route-role">子</span><span class="route-name">' + esc(m.childName) + '</span>' +
    '<span class="route-note">' + esc('「' + m.planName + '」第' + m.genNo + '世代の子・' + (m.childSex || '不明')) + '</span></div>';
  var th = m.theory;
  if (th.status === 'ok') {
    html += '<p class="route-theory">「' + esc(m.planName) + '」第' + m.genNo + '世代：' + esc(th.label) + '（参考・未検証）' +
      (th.dangerous ? '／危険な配合の条件に当てはまるように見えます（参考）' : '') + '</p>';
  } else if (th.status === 'missing') {
    html += '<p class="route-theory route-theory-missing">「' + esc(m.planName) + '」第' + m.genNo + '世代：親が見つかりません — この世代の配合理論は確認できません（計画自体は残っています）</p>';
  } else {
    html += '<p class="route-theory route-theory-missing">「' + esc(m.planName) + '」第' + m.genNo + '世代：父・母をDBまたは自家生産馬から選ぶと配合理論を確認できます</p>';
  }
  html += '</div><div class="route-arrow" aria-hidden="true">←</div>';
  html += '<div class="merge-parents">' + mergedBranchHtml(m.sire) + mergedBranchHtml(m.dam) + '</div></div>';
  return html;
}
function buildMergedRouteDiagramHtml(plan) {
  var d = buildMergedRouteDiagram(plan);
  if (!d || !d.root) return '';
  var html = '<details class="route-diagram" open><summary>配合ルート図（複数ルート統合）を見る（参考・未検証）</summary>';
  html += '<p class="note">左が最終の子、右へ行くほど前の世代です。上の枝が父方のルート、下の枝が母方のルートで、最終の子のところで合流します。青い箱が種牡馬、ピンクの箱が繁殖牝馬です。矢印（←）は親から子へのつながりです。各配合の箱には由来の計画名と第何世代の子かを付けています（由来が記録されていない自分の馬は「由来不明」と表示し、枝は出しません）。配合理論の判定はユーザー攻略記事による推定・共有情報で、すべて参考・未検証です。配合の効果を断定する表示はしません。</p>';
  html += '<div class="route-scroll merge-scroll"><div class="merge-tree">' + mergedMatingHtml(d.root) + '</div></div></details>';
  return html;
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
$('f-analysis').value = r.analysisComment || '';
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

/* 繁殖計画の登録・編集（ステップ1）。父馬・母馬は名前のテキスト入力のみ。 */
$('plan-form').addEventListener('submit', function (e) {
e.preventDefault();
var plan = currentPlanForm();
if (!plan.name) { $('plan-form-error').textContent = '計画名を入力してください'; return;}
if (PLAN_STATUSES.indexOf(plan.status) < 0) { $('plan-form-error').textContent = 'ステータスが不正です'; return;}
$('plan-form-error').textContent = '';
var now = new Date().toISOString();
if (plan.id) {
var i = plans.findIndex(function (x) { return x.id === plan.id;});
if (i < 0) { $('plan-form-error').textContent = '編集中の計画が見つかりません'; return;}
var old = plans[i];
plan.createdAt = old.createdAt; plan.updatedAt = now;
/* 第1世代の内容を計画フォームの値で更新し、第2世代以降の列は残す。 */
var gens = ensurePlanGenerations(old);
gens[0].sireName = plan.sireName;
gens[0].damName = plan.damName;
gens[0].sireHorseId = plan.sireHorseId;
gens[0].damHorseId = plan.damHorseId;
gens[0].sireDbIndex = plan.sireDbIndex;
gens[0].damDbIndex = plan.damDbIndex;
gens[0].sireOwnId = plan.sireOwnId;
gens[0].damOwnId = plan.damOwnId;
plan.generations = gens;
syncPlanGen1(plan);
plans[i] = plan;
} else {
plan.id = newPlanId(); plan.createdAt = now; plan.updatedAt = now;
plan.generations = [{
id: newGenerationId(),
childName: defaultChildName(plan), childSex: '不明',
sireName: plan.sireName, damName: plan.damName,
sireHorseId: plan.sireHorseId, damHorseId: plan.damHorseId,
sireDbIndex: plan.sireDbIndex, damDbIndex: plan.damDbIndex,
sireOwnId: plan.sireOwnId, damOwnId: plan.damOwnId,
childOwnId: null
}];
plans.push(plan);
}
savePlans(plans);
renderPlans();
resetPlanForm();
});
$('plan-cancel-edit').addEventListener('click', resetPlanForm);

/* 種牡馬データベース検索：検索ボタンと、父馬・母馬名を手で直したときに
   DB選択を外す処理（手入力の名前とDBの番号が食い違わないようにする）。 */
$('s-search').addEventListener('click', runStallionSearch);
/* 計画フォームの父馬・母馬欄の直接検索：入力で候補を出し直し、フォーカスで
   候補を出し、欄を離れたら少し遅らせて候補を隠す（候補の mousedown が
   先に動くようにする）。Esc でも候補を隠す。絞り込み条件の変更でも候補を
   出し直す。 */
['sire', 'dam'].forEach(function (role) {
  var e = planSuggestRoleEls(role);
  if (e.name) {
    e.name.addEventListener('input', function () { onPlanHorseNameInput(role); });
    e.name.addEventListener('focus', function () { renderPlanSuggestions(role); });
    e.name.addEventListener('blur', function () { setTimeout(function () { hidePlanSuggestions(role); }, 150); });
    e.name.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') hidePlanSuggestions(role); });
  }
  ['chi', 'factor', 'hibon', 'talent'].forEach(function (key) {
    if (e[key]) e[key].addEventListener('input', function () { renderPlanSuggestions(role); });
    if (e[key]) e[key].addEventListener('change', function () { renderPlanSuggestions(role); });
  });
});

/* メモリ欄に 1〜6 を手で入れたときも成長タイプに反映する */
$('f-memory').addEventListener('input', function () {
  var mn = parseInt($('f-memory').value, 10);
  if (mn >= 1 && mn <= 6) $('f-growth').value = growthWordFromNum(mn);
  updateGrowthBar();
});
$('f-growth').addEventListener('change', updateGrowthBar);

/* ---------- 繁殖計画の画面 ---------- */
function currentPlanForm() {
return {
id: $('plan-edit-id').value || '',
name: $('p-name').value.trim(),
sireName: $('p-sire').value.trim(),
damName: $('p-dam').value.trim(),
sireHorseId: null,
damHorseId: null,
sireDbIndex: selectedDb.sire,
damDbIndex: selectedDb.dam,
sireOwnId: selectedOwn.sire,
damOwnId: selectedOwn.dam,
status: $('p-status').value,
memo: $('p-memo').value.trim()
};
}
function loadPlanIntoForm(p) {
$('plan-edit-id').value = p.id;
$('p-name').value = p.name;
$('p-sire').value = p.sireName || '';
$('p-dam').value = p.damName || '';
selectedDb.sire = (p.sireDbIndex === undefined || p.sireDbIndex === null) ? null : p.sireDbIndex;
selectedDb.dam = (p.damDbIndex === undefined || p.damDbIndex === null) ? null : p.damDbIndex;
selectedOwn.sire = p.sireOwnId || null;
selectedOwn.dam = p.damOwnId || null;
$('p-status').value = p.status;
$('p-memo').value = p.memo || '';
$('plan-save-btn').textContent = '計画を更新';
$('plan-cancel-edit').hidden = false;
$('plan-form-error').textContent = '';
updatePlanDbStatuses();
hideAllPlanSuggestions();
window.scrollTo(0, 0);
}
function resetPlanForm() {
$('plan-edit-id').value = '';
$('plan-form').reset();
/* 名前欄と絞り込み欄は明示的にも空にする（form.reset() だけに頼らない。
   既定値は空欄なので、ブラウザでの動きは reset() と同じ）。 */
$('p-sire').value = '';
$('p-dam').value = '';
['chi', 'factor', 'hibon', 'talent'].forEach(function (key) {
  var s = $('p-sire-' + key), d = $('p-dam-' + key);
  if (s) s.value = '';
  if (d) d.value = '';
});
selectedDb.sire = null;
selectedDb.dam = null;
selectedOwn.sire = null;
selectedOwn.dam = null;
updatePlanDbStatuses();
hideAllPlanSuggestions();
$('plan-save-btn').textContent = '計画を登録';
$('plan-cancel-edit').hidden = true;
$('plan-form-error').textContent = '';
}
function renderPlans() {
$('plan-count').textContent = String(plans.length);
$('plan-empty-note').style.display = plans.length? 'none': 'block';
var ul = $('plan-list');
ul.innerHTML = '';
plans.forEach(function (p) {
var li = document.createElement('li');
li.innerHTML = '<p class="name">' + esc(p.name) + '</p>'
+ '<p class="meta">' + 'ステータス ' + esc(p.status)
+ (p.memo? '\nメモ：' + esc(p.memo): '') + '</p>';
/* 配合ルート図（ステップ7）：世代の列から作る図解。世代の一覧表示とは別に、
   計画カードの上部に出す。折りたたみで、既定は開く。 */
var routeDiv = document.createElement('div');
routeDiv.innerHTML = buildRouteDiagramHtml(p);
li.appendChild(routeDiv);
var gens = planGenerations(p);
gens.forEach(function (gen, gi) {
var genNo = gi + 1;
var genDiv = document.createElement('div');
genDiv.className = 'generation';
var pair = resolveGenerationParents(gen);
var head = '<h3>第' + genNo + '世代</h3>';
head += '<p class="meta">' + '父 ' + esc(gen.sireName || '—') + (gen.sireDbIndex !== null && gen.sireDbIndex !== undefined ? '（DB検索から選択）' : '') + (gen.sireOwnId ? '（自家生産馬から選択）' : '') + ' × 母 ' + esc(gen.damName || '—') + (gen.damDbIndex !== null && gen.damDbIndex !== undefined ? '（DB検索から選択）' : '') + (gen.damOwnId ? '（自家生産馬から選択）' : '') + '</p>';
/* この世代の子の使い道（あとの世代の親に使われている場合）と、削除の影響 */
var usage = generationChildUsage(p, gen);
if (usage.length) {
head += '<p class="note">この世代の子「' + esc(gen.childName || '') + '」は、' + usage.map(function (u) { return '第' + u.genNo + '世代の' + (u.role === 'sire' ? '父' : '母'); }).join('・') + 'として使われています。</p>';
}
var childHtml = '';
if (pair) {
childHtml = buildChildPedigreeHtml(pair.sire, pair.dam);
} else if (generationHasAnyParentRef(gen)) {
childHtml = '<p class="note">選んだ父馬・母馬が見つかりません。データベースが読み込めていないか、自家生産馬が削除された可能性があります（世代の削除でこの世代の子が削除された場合も含みます）。サーバー経由で開き直すか、父馬・母馬を選び直してください。計画自体は残っています。</p>';
} else {
childHtml = '<p class="note">DBまたは自家生産馬から父・母を選ぶと確認できます（子の血統・配合理論の確認は、父馬・母馬の両方を種牡馬データベース検索または自家生産馬から選んだ世代だけが対象です）。</p>';
}
genDiv.innerHTML = head + childHtml;
/* 父馬・母馬の欄（世代ごとに DB・自家生産馬から選び直せる） */
genDiv.appendChild(buildGenParentEditor(p, gen, genNo));
/* 子の登録（世代ごとに名前・性別を決められる） */
if (pair) {
genDiv.appendChild(buildGenChildRegister(p, gen, genNo));
}
/* 最後の世代の下に「次の世代を追加」 */
if (gi === gens.length - 1) {
var addDiv = document.createElement('div');
addDiv.className = 'gen-next';
var addBtn = document.createElement('button');
addBtn.type = 'button'; addBtn.textContent = '次の世代を追加';
var addMsg = document.createElement('p');
addMsg.className = 'note';
addMsg.setAttribute('role', 'status');
addBtn.addEventListener('click', function () {
var res = addGenerationToPlan(p);
if (!res.ok) { addMsg.textContent = res.error; return; }
renderOwnHorses(); renderPlans();
});
addDiv.appendChild(addBtn); addDiv.appendChild(addMsg);
genDiv.appendChild(addDiv);
}
/* 世代の削除（1つだけの世代は削除できない） */
if (gens.length > 1) {
var delDiv = document.createElement('div');
delDiv.className = 'gen-delete';
if (usage.length && gen.childOwnId) {
var warn = document.createElement('p');
warn.className = 'warn';
warn.textContent = 'この世代を削除すると、' + usage.map(function (u) { return '第' + u.genNo + '世代の' + (u.role === 'sire' ? '父' : '母'); }).join('・') + 'に使われているこの世代の子が使えなくなり、その世代の子の血統・配合理論が表示できなくなります。計画自体は残ります。';
delDiv.appendChild(warn);
}
var delBtn = document.createElement('button');
delBtn.type = 'button'; delBtn.textContent = '第' + genNo + '世代を削除'; delBtn.className = 'danger';
delBtn.addEventListener('click', function () {
var impact = '';
if (usage.length && gen.childOwnId) impact = '\n' + usage.map(function (u) { return '第' + u.genNo + '世代'; }).join('・') + 'の親に使われているこの世代の子が使えなくなり、その世代の子の血統・配合理論が表示できなくなります。';
if (!window.confirm('第' + genNo + '世代を削除しますか？' + impact + '\n計画自体は残ります。')) return;
var res = deleteGenerationFromPlan(p, gen.id);
if (!res.ok) { if (typeof addMsg !== 'undefined' && addMsg) addMsg.textContent = res.error; return; }
renderOwnHorses(); renderPlans();
});
delDiv.appendChild(delBtn);
genDiv.appendChild(delDiv);
}
li.appendChild(genDiv);
});
/* 子の血統表の中の「DBにあり」の祖先の「詳細」ボタン */
li.querySelectorAll('button[data-stallion-idx]').forEach(function (btn) {
btn.addEventListener('click', function () { renderStallionDetail(Number(btn.getAttribute('data-stallion-idx'))); });
});
var editBtn = document.createElement('button');
editBtn.type = 'button'; editBtn.textContent = '編集する';
editBtn.addEventListener('click', function () { loadPlanIntoForm(p);});
var delBtn = document.createElement('button');
delBtn.type = 'button'; delBtn.textContent = '削除する'; delBtn.className = 'danger';
delBtn.addEventListener('click', function () {
if (!window.confirm('繁殖計画「' + p.name + '」を削除しますか？')) return;
plans = plans.filter(function (x) { return x.id!== p.id;});
savePlans(plans); renderPlans();
});
li.appendChild(editBtn); li.appendChild(delBtn);
if (p.sireDbIndex !== null && p.sireDbIndex !== undefined) {
var sireDetailBtn = document.createElement('button');
sireDetailBtn.type = 'button'; sireDetailBtn.textContent = '父馬の血統を見る';
sireDetailBtn.addEventListener('click', function () { renderStallionDetail(p.sireDbIndex); });
li.appendChild(sireDetailBtn);
}
if (p.damDbIndex !== null && p.damDbIndex !== undefined) {
var damDetailBtn = document.createElement('button');
damDetailBtn.type = 'button'; damDetailBtn.textContent = '母馬の血統を見る';
damDetailBtn.addEventListener('click', function () { renderStallionDetail(p.damDbIndex); });
li.appendChild(damDetailBtn);
}
ul.appendChild(li);
});
}

/* 世代の父馬・母馬の欄（世代ごとに DB・自家生産馬から選び直せる）。
   候補の出し方は計画フォームと同じ（馬名の部分一致・子系統・因子・
   非凡・天性での絞り込み、先頭10件まで）。 */
function buildGenParentEditor(p, gen, genNo) {
var box = document.createElement('div');
box.className = 'gen-editor';
var title = document.createElement('p');
title.className = 'note';
title.textContent = '第' + genNo + '世代の父馬・母馬（データベース・自家生産馬から選べます。名前だけの入力もできます）';
box.appendChild(title);
var row = document.createElement('div');
row.className = 'row';
var els = {};
['sire', 'dam'].forEach(function (role) {
var field = document.createElement('div');
field.className = 'plan-horse-field';
var label = document.createElement('label');
label.textContent = (role === 'sire' ? '父馬名' : '母馬名');
var input = document.createElement('input');
input.type = 'text';
input.setAttribute('autocomplete', 'off');
input.setAttribute('placeholder', (role === 'sire' ? '例：テスト父馬' : '例：テスト母馬'));
input.value = (role === 'sire' ? gen.sireName : gen.damName) || '';
input.setAttribute('aria-label', '第' + genNo + '世代の' + (role === 'sire' ? '父馬名' : '母馬名'));
label.appendChild(input);
field.appendChild(label);
var status = document.createElement('p');
status.className = 'note plan-db-status';
status.setAttribute('role', 'status');
field.appendChild(status);
var det = document.createElement('details');
det.className = 'plan-filter';
var sum = document.createElement('summary');
sum.textContent = (role === 'sire' ? '父馬' : '母馬') + 'をデータベースで絞り込む（タップで開く）';
det.appendChild(sum);
var chiLabel = document.createElement('label');
chiLabel.textContent = '子系統';
var chiSel = document.createElement('select');
var opt0 = document.createElement('option');
opt0.value = ''; opt0.textContent = '指定なし';
chiSel.appendChild(opt0);
stallionChiOptions().forEach(function (c) {
var o = document.createElement('option');
o.value = c; o.textContent = c;
chiSel.appendChild(o);
});
chiLabel.appendChild(chiSel);
det.appendChild(chiLabel);
function textFilter(labelText, placeholder) {
var lab = document.createElement('label');
lab.textContent = labelText;
var inp = document.createElement('input');
inp.type = 'text';
inp.setAttribute('autocomplete', 'off');
inp.placeholder = placeholder;
lab.appendChild(inp);
det.appendChild(lab);
return inp;
}
var factorInp = textFilter('因子（部分一致）', '例：長');
var hibonInp = textFilter('非凡（部分一致）', '例：鉄情不羈');
var talentInp = textFilter('天性（部分一致）', '例：飛燕');
field.appendChild(det);
var list = document.createElement('ul');
list.className = 'suggest';
list.setAttribute('aria-label', '第' + genNo + '世代の' + (role === 'sire' ? '父馬' : '母馬') + 'の候補');
field.appendChild(list);
els[role] = { name: input, status: status, list: list, chi: chiSel, factor: factorInp, hibon: hibonInp, talent: talentInp };
row.appendChild(field);
});
box.appendChild(row);
/* この世代の配合理論のプレビュー（保存前）。父馬・母馬の欄の下に出す。
   判定と表示は計画フォームのプレビューと同じ関数を使う。 */
var previewDiv = document.createElement('div');
previewDiv.className = 'theory-preview';
previewDiv.setAttribute('role', 'status');
box.appendChild(previewDiv);
function refreshGenPreview() {
var sire = resolveParentRef({ dbIndex: gen.sireDbIndex, ownId: gen.sireOwnId });
var dam = resolveParentRef({ dbIndex: gen.damDbIndex, ownId: gen.damOwnId });
var pv = matingTheoryPreview(sire, dam,
els.sire.name ? els.sire.name.value : '',
els.dam.name ? els.dam.name.value : '',
(gen.sireDbIndex !== null && gen.sireDbIndex !== undefined) || !!gen.sireOwnId,
(gen.damDbIndex !== null && gen.damDbIndex !== undefined) || !!gen.damOwnId);
previewDiv.innerHTML = matingTheoryPreviewHtml(pv);
}
['sire', 'dam'].forEach(function (role) {
var ctx = suggestCtxFromEls(els[role], generationSuggestStore(p, gen), role);
var e = els[role];
updatePlanDbStatus(role, ctx);
if (e.name) {
e.name.addEventListener('input', function () { onPlanHorseNameInput(role, ctx); refreshGenPreview(); });
e.name.addEventListener('focus', function () { renderPlanSuggestions(role, ctx); });
e.name.addEventListener('blur', function () { setTimeout(function () { hidePlanSuggestions(role, ctx); }, 150); });
e.name.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') hidePlanSuggestions(role, ctx); });
e.name.addEventListener('change', function () {
if (role === 'sire') gen.sireName = e.name.value.trim();
else gen.damName = e.name.value.trim();
syncPlanGen1(p);
savePlans(plans);
renderPlans();
});
}
['chi', 'factor', 'hibon', 'talent'].forEach(function (key) {
if (e[key]) e[key].addEventListener('input', function () { renderPlanSuggestions(role, ctx); });
if (e[key]) e[key].addEventListener('change', function () { renderPlanSuggestions(role, ctx); });
});
});
refreshGenPreview();
return box;
}

/* 世代の子を次の配合の親として登録する欄（世代ごとに名前・性別を決められる）。
   登録済みの世代は、その旨を表示する（配合理論の効果を断定しない）。 */
function buildGenChildRegister(p, gen, genNo) {
var regDiv = document.createElement('div');
regDiv.className = 'child-register';
var registered = gen.childOwnId ? findOwnHorse(gen.childOwnId) : null;
if (registered) {
var done = document.createElement('p');
done.className = 'note';
done.textContent = 'この世代の子は自家生産馬として登録済みです：「' + registered.name + '」（' + registered.sex + '・' + registered.generation + '代目）。次の世代の親として使えます。';
regDiv.appendChild(done);
return regDiv;
}
var regTitle = document.createElement('p');
regTitle.className = 'note';
regTitle.textContent = 'この子を次の配合の親として登録する（子の血統は参考・未検証の表示で登録します）';
regDiv.appendChild(regTitle);
var regName = document.createElement('input');
regName.type = 'text';
regName.value = gen.childName || defaultGenerationChildName(p, genNo);
regName.setAttribute('aria-label', '第' + genNo + '世代の子の名前');
regDiv.appendChild(regName);
var regSex = document.createElement('select');
regSex.setAttribute('aria-label', '第' + genNo + '世代の子の性別');
['不明', '牡', '牝'].forEach(function (s) {
var opt = document.createElement('option');
opt.value = s; opt.textContent = s;
regSex.appendChild(opt);
});
regSex.value = gen.childSex || '不明';
regDiv.appendChild(regSex);
regName.addEventListener('change', function () { gen.childName = regName.value; savePlans(plans); });
regSex.addEventListener('change', function () { gen.childSex = regSex.value; savePlans(plans); });
var regMsg = document.createElement('p');
regMsg.className = 'note';
regMsg.setAttribute('role', 'status');
regDiv.appendChild(regMsg);
var regBtn = document.createElement('button');
regBtn.type = 'button'; regBtn.textContent = '子を登録する';
regBtn.addEventListener('click', function () {
var res = registerOwnHorseFromGeneration(p, gen, regName.value, regSex.value);
if (!res.ok) { regMsg.textContent = res.error; return; }
regMsg.textContent = '「' + res.horse.name + '」を自家生産馬として登録しました（' + res.horse.sex + '・' + res.horse.generation + '代目）。次の繁殖計画の父馬・母馬の欄から選べます。';
renderOwnHorses();
renderPlans();
});
regDiv.appendChild(regBtn);
return regDiv;
}
/* ---------- 自分の馬（自家生産馬）の一覧・削除 ---------- */
function renderOwnHorses() {
var countEl = $('own-count');
if (!countEl) return;
countEl.textContent = String(ownHorses.length);
$('own-empty-note').style.display = ownHorses.length ? 'none' : 'block';
var ul = $('own-list');
ul.innerHTML = '';
var labels = (STALLIONS && STALLIONS.ancestors) ? STALLIONS.ancestors : CHILD_PEDIGREE_LABELS;
ownHorses.forEach(function (o) {
var li = document.createElement('li');
li.innerHTML = '<p class="name">' + esc(o.name) + '【自家生産馬】</p>'
+ '<p class="meta">' + '性別 ' + esc(o.sex) + '／' + o.generation + '代目／' + esc(ownHorseOriginLabel(o))
+ '／父 ' + esc(o.sireName || '—') + ' × 母 ' + esc(o.damName || '—') + '</p>';
var det = document.createElement('details');
det.className = 'ref-details';
var sum = document.createElement('summary');
sum.textContent = '血統（5代・参考）を見る';
det.appendChild(sum);
var div = document.createElement('div');
var rows = '';
for (var i = 0; i < 15; i++) {
var a = o.anc[i] || [];
rows += '<tr><td>' + esc(labels[i] || ('祖先' + (i + 1))) + '</td><td>' + esc(a[0] || '—') + '</td><td>' + esc(a[1] || '—') + '</td><td>' + esc([a[3], a[4]].filter(function (x) { return x; }).join('／') || '—') + '</td></tr>';
}
div.innerHTML = '<table><thead><tr><th>血統位置</th><th>祖先名</th><th>親系統</th><th>因子</th></tr></thead><tbody>' + rows + '</tbody></table>'
+ '<p class="note">子の血統は、両親の血統を1代ずらしたものです（参考・未検証）。父馬自身の親系統は、父馬の父の親系統（父系で受け継がれるもの）で補います。配合理論の効果を断定する表示はしません。</p>';
det.appendChild(div);
li.appendChild(det);
if (ownHorseEligibleFor('sire', o)) {
var sireBtn = document.createElement('button');
sireBtn.type = 'button'; sireBtn.textContent = '父馬に選ぶ';
sireBtn.addEventListener('click', function () { chooseOwnHorseForPlan('sire', o.id); });
li.appendChild(sireBtn);
}
if (ownHorseEligibleFor('dam', o)) {
var damBtn = document.createElement('button');
damBtn.type = 'button'; damBtn.textContent = '母馬に選ぶ';
damBtn.addEventListener('click', function () { chooseOwnHorseForPlan('dam', o.id); });
li.appendChild(damBtn);
}
var delBtn = document.createElement('button');
delBtn.type = 'button'; delBtn.textContent = '削除する'; delBtn.className = 'danger';
delBtn.addEventListener('click', function () {
if (!window.confirm('自家生産馬「' + o.name + '」を削除しますか？この馬を親に選んだ繁殖計画の子の血統・配合理論の確認はできなくなります。')) return;
deleteOwnHorse(o.id);
renderOwnHorses(); renderPlans();
});
li.appendChild(delBtn);
ul.appendChild(li);
});
}

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
var optText = ['age', 'analysisTime', 'analysisTab', 'affiliation', 'memory', 'runningStyle', 'distance', 'adaptability', 'doctorComment', 'featureComment', 'targetRace', 'analysisComment'];
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
/* JSON書き出し・読み込みのデータ。ownHorses（自家生産馬）も含める。
   ownHorses のない旧形式のJSONは、既存の自分の馬を残す（後方互換）。 */
function buildExportData() {
return { version: DATA_VERSION, exportedAt: new Date().toISOString(), records: records, plans: plans, ownHorses: ownHorses };
}
function parseImportData(data, currentPlans, currentOwnHorses) {
if (!data || !isSupportedDataVersion(data.version) || !Array.isArray(data.records)) throw new Error('形式が違います（version 1 または 2 の全件データではありません）');
var ids = {};
data.records.forEach(function (r) {
if (!validRecord(r)) throw new Error('不正なレコードがあります（馬名・性別・ランクを確認してください）');
if (ids[r.id]) throw new Error('IDが重複しています');
ids[r.id] = true;
});
/* 繁殖計画：plans がある場合は検証して全件置き換え。ない旧形式のJSON
   （馬だけ）の場合は、既存の繁殖計画はそのまま残す（後方互換）。 */
var newPlans = currentPlans;
if (data.plans !== undefined) {
if (!Array.isArray(data.plans)) throw new Error('繁殖計画の形式が違います');
var pids = {};
data.plans.forEach(function (p) {
if (!validPlan(p)) throw new Error('不正な繁殖計画があります（計画名・ステータスを確認してください）');
if (pids[p.id]) throw new Error('繁殖計画のIDが重複しています');
pids[p.id] = true;
});
newPlans = data.plans;
}
/* 自分の馬：ownHorses がある場合は検証して全件置き換え。ない旧形式の
   JSONの場合は、既存の自分の馬はそのまま残す（後方互換）。 */
var newOwn = currentOwnHorses;
if (data.ownHorses !== undefined) {
if (!Array.isArray(data.ownHorses)) throw new Error('自分の馬の形式が違います');
var oids = {};
data.ownHorses.forEach(function (h) {
if (!validOwnHorse(h)) throw new Error('不正な自分の馬があります（名前・性別・血統を確認してください）');
if (oids[h.id]) throw new Error('自分の馬のIDが重複しています');
oids[h.id] = true;
});
newOwn = data.ownHorses;
}
return { records: data.records, plans: newPlans, ownHorses: newOwn };
}
$('export-btn').addEventListener('click', function () {
var blob = new Blob([JSON.stringify(buildExportData(), null, 2)], { type: 'application/json'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'dabimas-ability-v1.json';
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href);}, 1000);
$('io-msg').textContent = records.length + '件の馬と' + plans.length + '件の繁殖計画と' + ownHorses.length + '件の自分の馬を書き出しました。';
$('io-error').textContent = '';
});
$('import-file').addEventListener('change', function (e) {
var file = e.target.files && e.target.files[0];
if (!file) return;
var reader = new FileReader();
reader.onload = function () {
try {
var data = JSON.parse(String(reader.result));
var parsed = parseImportData(data, plans, ownHorses);
records = parsed.records;
plans = parsed.plans;
ownHorses = parsed.ownHorses;
/* 読み込んだ計画に世代の列を付ける（旧形式は第1世代1つになる）。 */
plans.forEach(function (p) { ensurePlanGenerations(p); });
saveAll(records);
savePlans(plans);
saveOwnHorses(ownHorses);
renderList(); renderPlans(); renderOwnHorses(); resetForm(); resetPlanForm();
$('io-msg').textContent = records.length + '件の馬と' + plans.length + '件の繁殖計画と' + ownHorses.length + '件の自分の馬を読み込みました（全件置き換え）。';
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
fetch('./data/ranks.json').then(function (r) { if (!r.ok) throw new Error('ranks'); return r.json();}).catch(function () { return null;}),
fetch('./data/stallions.json').then(function (r) { if (!r.ok) throw new Error('stallions'); return r.json();}).catch(function () { return null;})
]).then(function (triple) {
if (triple[0] && Array.isArray(triple[0].cmt)) COMMENTS = triple[0];
if (triple[1] && triple[1].ranges) RANKS = triple[1];
if (triple[2] && Array.isArray(triple[2].horses)) STALLIONS = triple[2];
});
}
loadData().then(function () { renderList(); renderPlans(); renderOwnHorses(); updateGrowthBar(); renderStallionSearchStatus(); fillChiOptions(); updatePlanTheoryPreview();});
