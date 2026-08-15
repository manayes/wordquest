# -*- coding: utf-8 -*-
"""영어단어장.csv -> data/words.js 변환
단어장을 수정한 뒤 이 스크립트를 다시 실행하면 앱에 반영됩니다:
    python convert_csv.py
"""
import csv, json, os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "영어단어장.csv")
DST = os.path.join(BASE, "data", "words.js")

words = []
with open(SRC, encoding="utf-8-sig", newline="") as f:
    reader = csv.reader(f)
    for i, row in enumerate(reader):
        if not row or not row[0].strip():
            continue
        # 컬럼: 단어, 발음기호, 뜻, 예문
        word = row[0].strip()
        ipa = row[1].strip() if len(row) > 1 else ""
        meaning = row[2].strip() if len(row) > 2 else ""
        example = row[3].strip() if len(row) > 3 else ""
        if not meaning:
            print(f"[건너뜀] {i+1}행: 뜻이 없음 -> {row}")
            continue
        words.append({
            "id": len(words) + 1,
            "word": word,
            "ipa": ipa,
            "meaning": meaning,
            "example": example,
            "deck": "vocab",  # 내 단어장 (말해보카 오답 모음)
        })

os.makedirs(os.path.dirname(DST), exist_ok=True)
with open(DST, "w", encoding="utf-8") as f:
    f.write("// 자동 생성 파일 - 영어단어장.csv에서 변환됨. 직접 수정하지 마세요.\n")
    f.write("// 재생성: python convert_csv.py\n")
    f.write("const WORDS = ")
    json.dump(words, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

print(f"완료: {len(words)}개 단어 -> {DST}")
