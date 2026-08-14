// 게임화 시스템: XP/레벨, 스트릭, 일일 퀘스트
// XP 규칙: 새 단어 +10, 복습 +5, 퀴즈 정답 +5, 퀴즈 완료 보너스 +10, 퀘스트 +20

const Game = (() => {
  // 레벨 L -> L+1 에 필요한 누적 XP = 50*L*(L+1)  (100, 300, 600, 1000, ...)
  function levelFromXp(xp) {
    let L = 1;
    while (xp >= 50 * L * (L + 1)) L++;
    return L;
  }

  function levelProgress(xp) {
    const level = levelFromXp(xp);
    const base = 50 * (level - 1) * level;
    return { level, cur: xp - base, need: 100 * level };
  }

  // XP 추가. 레벨업 여부 반환
  function addXp(state, amount) {
    const before = levelFromXp(state.xp);
    state.xp += amount;
    const after = levelFromXp(state.xp);
    return { before, after, leveledUp: after > before };
  }

  // 일일 퀘스트 정의
  const QUESTS = [
    {
      id: "new", xp: 20, icon: "✨",
      label: s => `새 단어 ${s.settings.newPerDay}개 학습`,
      progress: (s, log) => `${Math.min(log.newLearned, s.settings.newPerDay)}/${s.settings.newPerDay}`,
      done: (s, log, dueCount) => log.newLearned >= s.settings.newPerDay,
    },
    {
      id: "review", xp: 20, icon: "🔁",
      label: () => "오늘의 복습 모두 완료",
      progress: (s, log, dueCount) => dueCount > 0 ? `${dueCount}개 남음` : "완료 가능",
      done: (s, log, dueCount) => dueCount === 0 && (log.reviewed >= 1 || log.newLearned >= 1),
    },
    {
      id: "quiz", xp: 20, icon: "🎯",
      label: () => "퀴즈 1회 완료",
      progress: (s, log) => `${log.quizDone}/1`,
      done: (s, log) => log.quizDone >= 1,
    },
  ];

  // 새로 달성한 퀘스트 목록 반환 (달성 플래그 기록)
  function checkQuests(state, log, dueCount) {
    const completed = [];
    for (const q of QUESTS) {
      if (!log.quests[q.id] && q.done(state, log, dueCount)) {
        log.quests[q.id] = true;
        completed.push(q);
      }
    }
    return completed;
  }

  // 연속 학습 일수 (오늘 아직 안 했으면 어제까지의 연속 기록 유지)
  function streak(state) {
    const iso = d => SRS.dateKey(d);
    const active = key => {
      const e = state.days[key];
      return !!e && (e.newLearned + e.reviewed + e.quizDone) > 0;
    };
    const d = new Date();
    if (!active(iso(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (active(iso(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  return { levelFromXp, levelProgress, addXp, QUESTS, checkQuests, streak };
})();
