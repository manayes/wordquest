// 퀴즈 문제 생성기
// 유형: w2m(단어→뜻), m2w(뜻→단어), blank(예문 빈칸), spell(철자 입력)

const Quiz = (() => {
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pick(arr, n) { return shuffle(arr).slice(0, n); }

  // 예문에서 단어(활용형 포함)를 찾아 빈칸으로 치환. 실패 시 null
  function blankExample(word) {
    if (!word.example || /[\s~]/.test(word.word)) return null; // 숙어는 제외
    const base = word.word.toLowerCase();
    const stem = base.length > 4 ? base.slice(0, base.length - 1) : base;
    const re = new RegExp(`\\b(${escapeRe(stem)}[a-z]*)\\b`, "i");
    const m = word.example.match(re);
    if (!m) return null;
    return {
      blanked: word.example.replace(m[1], "＿".repeat(4)),
      answer: m[1],
    };
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // 보기(오답) 고르기: 같은 단어/같은 뜻은 제외
  function distractors(all, target, field, n) {
    const seen = new Set([target[field], target.word]);
    const out = [];
    for (const w of shuffle(all)) {
      if (w.id === target.id || seen.has(w[field]) || w.word === target.word) continue;
      seen.add(w[field]);
      out.push(w[field]);
      if (out.length >= n) break;
    }
    return out;
  }

  // pool: 출제 대상 단어들, all: 오답 보기용 전체 단어
  function makeQuestion(target, all) {
    const types = ["w2m", "m2w"];
    const b = blankExample(target);
    if (b) types.push("blank", "spell");
    const type = types[Math.floor(Math.random() * types.length)];

    if (type === "w2m") {
      const opts = shuffle([target.meaning, ...distractors(all, target, "meaning", 3)]);
      return { type, typeLabel: "뜻 고르기", target,
        question: target.word, example: null,
        options: opts, answer: target.meaning };
    }
    if (type === "m2w") {
      const opts = shuffle([target.word, ...distractors(all, target, "word", 3)]);
      return { type, typeLabel: "단어 고르기", target,
        question: target.meaning, example: null,
        options: opts, answer: target.word };
    }
    if (type === "blank") {
      const opts = shuffle([target.word, ...distractors(all, target, "word", 3)]);
      return { type, typeLabel: "빈칸 채우기", target,
        question: target.meaning, example: b.blanked,
        options: opts, answer: target.word };
    }
    // spell: 뜻 + 빈칸 예문을 보고 철자 입력
    return { type, typeLabel: "철자 입력", target,
      question: target.meaning, example: b.blanked,
      options: null, answer: target.word };
  }

  function makeQuizSet(pool, all, count) {
    const targets = pick(pool, Math.min(count, pool.length));
    return targets.map(t => makeQuestion(t, all));
  }

  return { makeQuizSet, shuffle };
})();
