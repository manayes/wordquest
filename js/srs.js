// SRS(간격 반복) 엔진 - SM-2 변형
// 등급: 0=모름(again), 1=애매함(hard), 2=알았음(good), 3=쉬움(easy)

const SRS = (() => {
  const MAX_IVL = 365;

  // 로컬 날짜 기준 "YYYY-MM-DD" (UTC를 쓰면 오전 9시 전 학습이 전날로 기록됨)
  function dateKey(d) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function todayStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return dateKey(d);
  }

  function newCardState() {
    return { reps: 0, ivl: 0, ease: 2.5, due: todayStr(), lapses: 0, correct: 0, wrong: 0 };
  }

  // 등급에 따른 다음 상태 계산 (원본을 수정하지 않고 새 객체 반환)
  function nextState(c, grade) {
    const s = { ...c };
    s.reps += 1;
    if (grade === 0) {
      s.wrong += 1;
      if (s.ivl >= 1) s.lapses += 1;
      s.ivl = 0;
      s.ease = Math.max(1.3, s.ease - 0.2);
    } else {
      s.correct += 1;
      if (grade === 1) {
        s.ivl = s.ivl < 1 ? 1 : Math.round(s.ivl * 1.2);
        s.ease = Math.max(1.3, s.ease - 0.15);
      } else if (grade === 2) {
        s.ivl = s.ivl < 1 ? 1 : Math.round(s.ivl * s.ease);
      } else {
        s.ivl = s.ivl < 1 ? 4 : Math.round(s.ivl * s.ease * 1.3);
        s.ease = Math.min(2.8, s.ease + 0.15);
      }
      s.ivl = Math.min(MAX_IVL, Math.max(1, s.ivl));
    }
    s.due = todayStr(s.ivl);
    return s;
  }

  // 버튼에 표시할 다음 간격 미리보기 텍스트
  function previewIntervals(c) {
    return [0, 1, 2, 3].map(g => {
      const n = nextState(c, g);
      if (g === 0) return "잠시 후";
      return n.ivl === 1 ? "1일" : `${n.ivl}일`;
    });
  }

  // 성장 단계: seed(새싹) < 7일, grow(성장) 7~29일, master(마스터) >= 30일
  function stage(c) {
    if (c.ivl >= 30) return "master";
    if (c.ivl >= 7) return "grow";
    return "seed";
  }

  return { dateKey, todayStr, newCardState, nextState, previewIntervals, stage };
})();
