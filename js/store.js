// 학습 상태 저장/불러오기 (localStorage)

const Store = (() => {
  const KEY = "wordquest_state_v1";

  function defaultState() {
    return {
      cards: {},                    // wordId -> SRS 카드 상태
      settings: {
        newPerDay: 10,
        ai: { apiKey: "", model: "claude-opus-5", interest: "일상" },
        sync: { token: "", gistId: "" },
      },
      days: {},                     // "YYYY-MM-DD" -> {newLearned, reviewed, quizDone, actions, quests}
      xp: 0,                        // 누적 경험치
      updatedAt: 0,                 // 마지막 저장 시각 (동기화 비교용)
      aiCache: { mnemonics: {}, examples: {} },  // wordId -> 생성된 AI 콘텐츠
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      const def = defaultState();
      return {
        ...def,
        ...s,
        settings: {
          ...def.settings,
          ...s.settings,
          ai: { ...def.settings.ai, ...(s.settings && s.settings.ai) },
          sync: { ...def.settings.sync, ...(s.settings && s.settings.sync) },
        },
        aiCache: { ...def.aiCache, ...s.aiCache },
      };
    } catch (e) {
      console.error("상태 불러오기 실패, 초기화합니다.", e);
      return defaultState();
    }
  }

  function save(state) {
    state.updatedAt = Date.now(); // 기기 간 동기화 시 최신 기록 판별용
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function saveRaw(stateObj) { // 원격 백업을 그대로 적용할 때 사용
    localStorage.setItem(KEY, JSON.stringify(stateObj));
  }

  function todayLog(state) {
    const t = SRS.todayStr();
    const def = { newLearned: 0, reviewed: 0, quizDone: 0, actions: 0, quests: {} };
    state.days[t] = Object.assign(def, state.days[t]);
    return state.days[t];
  }

  return { load, save, saveRaw, todayLog };
})();
