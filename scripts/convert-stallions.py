#!/usr/bin/env python3
"""mydata.csv（ユーザー提供の種牡馬CSV）を検索用の軽いJSONに変換する。

使い方:
    python3 scripts/convert-stallions.py [入力CSV] [出力JSON]
    既定: 入力 ~/workspace/user/files/mydata.csv
          出力 data/stallions.json（このスクリプトのあるリポジトリ直下基準）

出典: ユーザーがダビマス全書 / たかなさんのDBMS種牡馬データ検索から取得した
CSV（2026-11-14入手）。ユーザー検証・参考。データのコピーやスクレイピング
ではなく、ユーザーが渡したファイルを読み込むもの。元のCSV（3.6MB）は
重い・ユーザー提供ファイルのためリポジトリに入れない。

残す項目: 馬名、link（URLの数字IDだけを残し、表示時にURLへ戻す）、因子1〜3、
子系統、距離、成長、適応力、体質、気性、脚質、実績、底力、安定、非凡種類、
非凡、天性、発揮効果（先頭200文字まで）、5代血統の祖先15件
（名前・親系統・子系統・因子1・因子2。末尾の空欄は省く）。
削る列: 因子（全体）、category、特化の詳細4列、発揮条件/対象/確率、
hibon_link など。
空欄はそのまま（空の項目はJSONのキー自体を出さない）。同名の別バリエーション
（例: アイアンリージ-巌瓏- / -煌魂-）は別レコードのまま残す。
"""
import csv
import json
import re
import sys
from pathlib import Path

ANCESTORS = ['父', '父父', '父父父', '父父父父', '父父母父', '父母父',
             '父母父父', '父母母父', '母父', '母父父', '母父父父',
             '母父母父', '母母父', '母母父父', '母母母父']

# CSV列名 -> JSONキー（短いキーで軽量化。対応表は docs/spec-v2.md にも記載）
FIELD_MAP = {
    '馬名': 'n', '因子1': 'f1', '因子2': 'f2',
    '因子3': 'f3', '子系統': 'chi', '距離': 'dist', '成長': 'growth',
    '適応力': 'adapt', '体質': 'phys', '気性': 'temp', '脚質': 'style',
    '実績': 'record', '底力': 'base', '安定': 'stab',
    '非凡種類': 'hk', '非凡': 'hibon', '天性': 'talent',
}
EFFECT_MAX = 200  # 発揮効果は先頭200文字まで（全文はダビマス全書のlink先参照）


def convert_row(row):
    out = {}
    for col, key in FIELD_MAP.items():
        v = (row.get(col) or '').strip()
        if v:
            out[key] = v
    # link は https://dabimas.jp/kouryaku/stallions/<数字>.html の数字だけ残す
    link = (row.get('link') or '').strip()
    m = re.search(r'/stallions/(\d+)\.html', link)
    if m:
        out['link'] = m.group(1)
    elif link:
        out['link'] = link
    eff = (row.get('発揮効果') or '').strip()
    if eff:
        out['eff'] = eff[:EFFECT_MAX]
    # 5代血統の祖先15件: [名前, 親系統(pa:), 子系統(chi:), 因子1, 因子2]
    # 末尾の空欄は省いて軽くする（読む側で5要素まで補う）。
    anc = []
    for a in ANCESTORS:
        tup = [
            (row.get(a) or '').strip(),
            (row.get('pa:' + a) or '').strip(),
            (row.get('chi:' + a) or '').strip(),
            (row.get(a + '_因子1') or '').strip(),
            (row.get(a + '_因子2') or '').strip(),
        ]
        while tup and tup[-1] == '':
            tup.pop()
        anc.append(tup)
    out['anc'] = anc
    return out


def main():
    repo = Path(__file__).resolve().parent.parent
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'workspace/user/files/mydata.csv'
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else repo / 'data/stallions.json'
    with open(src, newline='', encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))
    horses = [convert_row(r) for r in rows]
    data = {
        'version': 1,
        'source': 'ユーザーがダビマス全書 / たかなさんのDBMS種牡馬データ検索から取得したCSV（2026-11-14入手）。ユーザー検証・参考。元のCSVはリポジトリに含めない。',
        'generatedBy': 'scripts/convert-stallions.py',
        'count': len(horses),
        'ancestors': ANCESTORS,
        'fields': {v: k for k, v in FIELD_MAP.items()},
        'horses': horses,
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'rows={len(rows)} horses={len(horses)} unique_names={len(set(r["馬名"] for r in rows))} bytes={dst.stat().st_size} path={dst}')


if __name__ == '__main__':
    main()
