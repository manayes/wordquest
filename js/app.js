// 메인 앱 로직: 화면 전환, 학습 세션, 퀴즈 진행

(() => {
  const state = Store.load();
  const $ = id => document.getElementById(id);
  const ALL_WORDS = WORDS.concat(typeof WORDS_TOEIC !== "undefined" ? WORDS_TOEIC : []);
  const wordById = new Map(ALL_WORDS.map(w => [w.id, w]));

  // ---------- 단어장(덱) 선택 ----------
  function inDeck(w) {
    const d = state.settings.deck || "all";
    return d === "all" || (w.deck || "vocab") === d;
  }
  function activeWords() { return ALL_WORDS.filter(inDeck); }

  $("deck-tabs").addEventListener("click", e => {
    const btn = e.target.closest("[data-deck]");
    if (!btn) return;
    state.settings.deck = btn.dataset.deck;
    Store.save(state);
    renderHome();
  });

  // ---------- 화면 전환 ----------
  const screens = ["home", "study", "quiz", "talk", "write", "shadow", "summary"];
  function show(name) {
    screens.forEach(s => { $(`screen-${s}`).hidden = (s !== name); });
    if (name === "home") renderHome();
    window.scrollTo(0, 0);
  }

  // ---------- 발음 (TTS) ----------
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.9;
    const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith("en"));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }
  if ("speechSynthesis" in window) speechSynthesis.getVoices(); // 목록 미리 로드

  // ---------- 게임화: 토스트/XP/퀘스트 ----------
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    $("toast-container").appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function awardXp(amount) {
    const r = Game.addXp(state, amount);
    if (r.leveledUp) toast(`🎉 레벨 업! Lv.${r.after}`);
  }

  function runQuestCheck() {
    const log = Store.todayLog(state);
    const completed = Game.checkQuests(state, log, dueCards().length);
    for (const q of completed) {
      toast(`${q.icon} 퀘스트 달성: ${q.label(state)} +${q.xp}XP`);
      awardXp(q.xp);
    }
    if (completed.length) Store.save(state);
  }

  // ---------- 홈 화면 ----------
  function dueCards() {
    const t = SRS.todayStr();
    return Object.entries(state.cards)
      .filter(([, c]) => c.due <= t)
      .map(([id]) => wordById.get(Number(id)))
      .filter(w => w && inDeck(w));
  }

  function newWordsAvailable(limit) {
    const out = [];
    if (limit <= 0) return out;
    for (const w of activeWords()) {
      if (!state.cards[w.id]) {
        out.push(w);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  function remainingNewToday() {
    const log = Store.todayLog(state);
    return Math.max(0, state.settings.newPerDay - log.newLearned);
  }

  function renderHome() {
    // 덱 탭 활성화 표시
    document.querySelectorAll(".deck-tab").forEach(b => {
      b.classList.toggle("active", b.dataset.deck === (state.settings.deck || "all"));
    });

    const deckWords = activeWords();
    let learned = 0, seed = 0, grow = 0, master = 0;
    for (const [id, c] of Object.entries(state.cards)) {
      const w = wordById.get(Number(id));
      if (!w || !inDeck(w)) continue;
      learned++;
      const st = SRS.stage(c);
      if (st === "master") master++;
      else if (st === "grow") grow++;
      else seed++;
    }
    const due = dueCards().length;
    const newCount = Math.min(remainingNewToday(), newWordsAvailable(state.settings.newPerDay).length);

    $("stat-total").textContent = deckWords.length.toLocaleString();
    $("stat-learned").textContent = learned.toLocaleString();
    $("stat-due").textContent = due;
    $("stat-master").textContent = master;
    $("stat-seed").textContent = seed;
    $("stat-grow").textContent = grow;
    $("stat-tree").textContent = master;
    const pct = deckWords.length ? (learned / deckWords.length * 100) : 0;
    $("learn-progress").style.width = `${Math.max(pct, learned > 0 ? 1 : 0)}%`;
    $("progress-caption").textContent = `전체 진도 ${pct.toFixed(1)}%`;

    $("study-preview").textContent = `복습 ${due}개 + 새 단어 ${newCount}개`;
    $("sel-new-per-day").value = String(state.settings.newPerDay);
    $("done-note").hidden = !(due === 0 && newCount === 0 && learned > 0);

    // 레벨/XP/스트릭
    const lp = Game.levelProgress(state.xp);
    $("level-badge").textContent = `Lv.${lp.level}`;
    $("xp-text").textContent = `${lp.cur} / ${lp.need} XP`;
    $("xp-bar").style.width = `${lp.cur / lp.need * 100}%`;
    $("streak-num").textContent = Game.streak(state);

    renderQuests(due);
    renderHeatmap();
  }

  function renderQuests(dueCount) {
    const log = Store.todayLog(state);
    const ul = $("quest-list");
    ul.innerHTML = "";
    for (const q of Game.QUESTS) {
      const done = !!log.quests[q.id];
      const li = document.createElement("li");
      li.className = `quest-item${done ? " done" : ""}`;
      const meta = done ? "" : `<span class="q-meta">${q.progress(state, log, dueCount)}</span>`;
      li.innerHTML = `<span class="q-check">${done ? "✅" : "⬜"}</span>` +
        `<span class="q-label">${q.icon} ${q.label(state)}</span>${meta}` +
        `<span class="q-xp">+${q.xp}XP</span>`;
      ul.appendChild(li);
    }
  }

  function renderHeatmap() {
    const wrap = $("heatmap");
    wrap.innerHTML = "";
    const WEEKS = 18;
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - ((WEEKS - 1) * 7 + today.getDay())); // WEEKS주 전 일요일
    const d = new Date(start);
    for (let i = 0; i < WEEKS * 7; i++) {
      const key = SRS.dateKey(d);
      const e = state.days[key];
      const n = e ? (e.actions || (e.newLearned + e.reviewed)) : 0;
      const cell = document.createElement("div");
      let cls = "hm-cell";
      if (d > today) cls += " future";
      else if (n >= 30) cls += " l3";
      else if (n >= 10) cls += " l2";
      else if (n >= 1) cls += " l1";
      cell.className = cls;
      cell.title = `${key}: ${n}회 학습`;
      wrap.appendChild(cell);
      d.setDate(d.getDate() + 1);
    }
  }

  $("sel-new-per-day").addEventListener("change", e => {
    state.settings.newPerDay = Number(e.target.value);
    Store.save(state);
    renderHome();
  });

  // ---------- AI 설정 모달 ----------
  $("btn-ai-settings").addEventListener("click", () => {
    const ai = state.settings.ai;
    $("ai-key-input").value = ai.apiKey || "";
    $("ai-model-select").value = ai.model || "claude-opus-5";
    $("ai-interest-select").value = ai.interest || "일상";
    $("ai-modal").hidden = false;
  });
  $("btn-ai-close").addEventListener("click", () => { $("ai-modal").hidden = true; });
  $("btn-ai-save").addEventListener("click", () => {
    state.settings.ai = {
      apiKey: $("ai-key-input").value.trim(),
      model: $("ai-model-select").value,
      interest: $("ai-interest-select").value,
    };
    Store.save(state);
    $("ai-modal").hidden = true;
    toast(AI.configured(state) ? "🤖 AI 기능이 활성화되었습니다" : "저장되었습니다 (API 키 없음)");
  });

  // ---------- 학습 세션 ----------
  let session = null; // {queue:[{word,isNew}], done, total, newIntroduced:Set, reviewedCount}

  function startStudy() {
    const reviews = Quiz.shuffle(dueCards()).map(w => ({ word: w, isNew: false }));
    const news = newWordsAvailable(remainingNewToday()).map(w => ({ word: w, isNew: true }));
    let queue = [...reviews, ...news];
    if (queue.length === 0) {
      // 오늘 목표를 이미 채운 경우: 안내하고 추가 학습 제안
      const extra = newWordsAvailable(state.settings.newPerDay);
      if (extra.length === 0) {
        toast("🎉 이 단어장의 모든 단어를 학습했습니다!");
        return;
      }
      if (!confirm(`오늘 목표를 모두 마쳤습니다! 새 단어 ${extra.length}개를 추가로 학습할까요?`)) return;
      queue = extra.map(w => ({ word: w, isNew: true }));
    }
    session = { queue, done: 0, total: queue.length, newIntroduced: new Set(), reviewedCount: 0, xpEarned: 0 };
    show("study");
    renderStudyCard();
  }

  function currentItem() { return session.queue[0]; }

  function renderStudyCard() {
    const item = currentItem();
    const w = item.word;
    const badge = $("card-badge");
    if (item.isNew) { badge.textContent = "✨ 새 단어"; badge.className = "card-badge badge-new"; }
    else { badge.textContent = "🔁 복습"; badge.className = "card-badge"; }

    $("card-word").textContent = w.word;
    $("card-ipa").textContent = w.ipa || "";
    $("card-meaning").textContent = w.meaning;
    $("card-example").textContent = w.example || "";
    $("ai-output").hidden = true;
    $("ai-output").innerHTML = "";

    const revealNow = item.isNew; // 새 단어는 바로 전체 공개
    $("card-answer").hidden = !revealNow;
    $("btn-reveal").hidden = revealNow;
    $("grade-buttons").hidden = !revealNow;
    if (revealNow) {
      updateIntervalPreviews(w);
      speak(w.word);
    }

    const pct = session.done / session.total * 100;
    $("study-progress").style.width = `${pct}%`;
    $("study-count").textContent = `${session.done}/${session.total}`;
  }

  function updateIntervalPreviews(w) {
    const c = state.cards[w.id] || SRS.newCardState();
    const previews = SRS.previewIntervals(c);
    previews.forEach((p, i) => { $(`ivl-${i}`).textContent = p; });
  }

  $("btn-reveal").addEventListener("click", () => {
    const w = currentItem().word;
    $("card-answer").hidden = false;
    $("btn-reveal").hidden = true;
    $("grade-buttons").hidden = false;
    updateIntervalPreviews(w);
    speak(w.word);
  });

  $("btn-tts").addEventListener("click", () => speak(currentItem().word.word));

  // ---------- 기기 간 동기화 (GitHub Gist) ----------
  function renderSyncStatus() {
    const cfg = Sync.config(state);
    $("sync-status").textContent = cfg.gistId
      ? "✅ 백업 연결됨 (Gist: " + cfg.gistId.slice(0, 8) + "...)"
      : (cfg.token ? "토큰 저장됨 — 아직 백업이 없습니다. '지금 백업'을 눌러주세요." : "");
  }

  $("btn-sync-settings").addEventListener("click", () => {
    $("sync-token-input").value = Sync.config(state).token || "";
    renderSyncStatus();
    $("sync-modal").hidden = false;
  });
  $("btn-sync-close").addEventListener("click", () => { $("sync-modal").hidden = true; });

  $("btn-sync-save").addEventListener("click", async () => {
    state.settings.sync.token = $("sync-token-input").value.trim();
    Store.save(state);
    renderSyncStatus();
    if (Sync.configured(state) && !Sync.config(state).gistId) {
      // 새 기기: 기존 백업이 있으면 자동 연결
      try {
        const existing = await Sync.findExisting(state);
        if (existing) {
          state.settings.sync.gistId = existing;
          Store.save(state);
          renderSyncStatus();
          toast("☁️ 기존 백업을 찾았습니다. '백업 복원'을 눌러 기록을 가져오세요.");
          return;
        }
      } catch (e) {
        toast("⚠️ " + e.message);
        return;
      }
    }
    toast(Sync.configured(state) ? "☁️ 동기화 설정 저장됨" : "저장되었습니다 (토큰 없음)");
  });

  async function syncPush(auto) {
    if (!Sync.configured(state)) {
      if (!auto) toast("먼저 GitHub 토큰을 설정해주세요");
      return;
    }
    try {
      await Sync.push(state);
      Store.save(state); // 새로 생성된 gistId 저장
      renderSyncStatus();
      toast(auto ? "☁️ 자동 백업 완료" : "☁️ 백업 완료");
    } catch (e) {
      toast("⚠️ 백업 실패: " + e.message);
    }
  }
  $("btn-sync-push").addEventListener("click", () => syncPush(false));

  $("btn-sync-pull").addEventListener("click", async () => {
    if (!Sync.configured(state) || !Sync.config(state).gistId) {
      toast("복원할 백업이 없습니다");
      return;
    }
    if (!confirm("현재 이 기기의 기록을 백업본으로 덮어씁니다. 계속할까요?")) return;
    try {
      const remote = await Sync.pull(state);
      if (!remote) { toast("백업 데이터가 비어 있습니다"); return; }
      adoptRemote(remote);
    } catch (e) {
      toast("⚠️ 복원 실패: " + e.message);
    }
  });

  // 원격 백업 적용: 로컬의 토큰/API키는 유지하고 새로고침
  function adoptRemote(remote) {
    remote.settings = remote.settings || {};
    remote.settings.sync = state.settings.sync;
    remote.settings.ai = { ...(remote.settings.ai || {}), apiKey: state.settings.ai.apiKey };
    Store.saveRaw(remote);
    toast("☁️ 백업을 불러왔습니다");
    setTimeout(() => location.reload(), 700);
  }

  // 앱 시작 시: 다른 기기의 더 최신 기록이 있으면 자동 적용
  async function syncPullOnStart() {
    if (!Sync.configured(state) || !Sync.config(state).gistId) return;
    try {
      const remote = await Sync.pull(state);
      if (remote && (remote.updatedAt || 0) > (state.updatedAt || 0)) adoptRemote(remote);
    } catch (e) {
      console.warn("자동 동기화 실패:", e);
    }
  }

  // ---------- 학습 카드 AI 기능 ----------
  async function runAiFeature(kind) {
    if (!session) return;
    const w = currentItem().word;
    if (!AI.configured(state)) {
      toast("먼저 Claude API 키를 설정해주세요");
      $("ai-modal").hidden = false;
      return;
    }
    const out = $("ai-output");
    const btn = kind === "mnemonic" ? $("btn-ai-mnemonic") : $("btn-ai-example");
    const cache = kind === "mnemonic" ? state.aiCache.mnemonics : state.aiCache.examples;
    try {
      btn.disabled = true;
      let content = cache[w.id];
      if (!content) {
        out.className = "ai-output";
        out.hidden = false;
        out.textContent = kind === "mnemonic" ? "🧠 연상법 생성 중..." : "✍️ 예문 생성 중...";
        content = kind === "mnemonic"
          ? await AI.generateMnemonic(state, w)
          : await AI.generateExamples(state, w);
        cache[w.id] = content;
        Store.save(state);
      }
      if (!session || currentItem().word.id !== w.id) return; // 이미 다음 카드로 넘어감
      out.className = "ai-output";
      out.hidden = false;
      out.innerHTML = "";
      const title = document.createElement("div");
      title.className = "ai-title";
      if (kind === "mnemonic") {
        title.textContent = "🧠 AI 연상법";
        out.appendChild(title);
        const p = document.createElement("div");
        p.textContent = content;
        out.appendChild(p);
      } else {
        title.textContent = `✍️ AI 예문 (${state.settings.ai.interest})`;
        out.appendChild(title);
        for (const ex of content) {
          const en = document.createElement("div");
          en.className = "ai-ex-en";
          en.textContent = ex.en;
          const ko = document.createElement("div");
          ko.className = "ai-ex-ko";
          ko.textContent = ex.ko;
          out.appendChild(en);
          out.appendChild(ko);
        }
      }
    } catch (e) {
      if (!session || currentItem().word.id !== w.id) return;
      out.className = "ai-output error";
      out.hidden = false;
      out.textContent = "⚠️ " + e.message;
    } finally {
      btn.disabled = false;
    }
  }
  $("btn-ai-mnemonic").addEventListener("click", () => runAiFeature("mnemonic"));
  $("btn-ai-example").addEventListener("click", () => runAiFeature("example"));

  $("grade-buttons").addEventListener("click", e => {
    const btn = e.target.closest("[data-grade]");
    if (!btn) return;
    gradeCurrent(Number(btn.dataset.grade));
  });

  function gradeCurrent(grade) {
    const item = session.queue.shift();
    const w = item.word;
    const prev = state.cards[w.id] || SRS.newCardState();
    state.cards[w.id] = SRS.nextState(prev, grade);

    const log = Store.todayLog(state);
    log.actions += 1;
    if (item.isNew && !session.newIntroduced.has(w.id)) {
      session.newIntroduced.add(w.id);
      log.newLearned += 1;
      session.xpEarned += 10;
      awardXp(10);
    } else if (!item.isNew && !item.requeued) {
      session.reviewedCount += 1;
      log.reviewed += 1;
      session.xpEarned += 5;
      awardXp(5);
    }
    runQuestCheck();

    if (grade === 0) {
      // 모름: 이번 세션 안에서 다시 등장
      session.queue.push({ ...item, isNew: item.isNew, requeued: true });
      session.total += item.requeued ? 0 : 1;
    }
    session.done += 1;
    Store.save(state);

    if (session.queue.length === 0) endStudy();
    else renderStudyCard();
  }

  function endStudy() {
    showSummary("🎉", "오늘의 학습 완료!",
      `새 단어 <b>${session.newIntroduced.size}</b>개 학습<br>복습 <b>${session.reviewedCount}</b>개 완료<br>` +
      `⚡ 획득 XP <b>+${session.xpEarned}</b>`);
    session = null;
    syncPush(true); // 백그라운드 자동 백업
  }

  $("btn-study-exit").addEventListener("click", () => { session = null; show("home"); });
  $("btn-start-study").addEventListener("click", startStudy);

  // ---------- 퀴즈 ----------
  let quiz = null; // {questions, index, correct}

  async function startQuiz() {
    const studied = Object.keys(state.cards).map(id => wordById.get(Number(id))).filter(w => w && inDeck(w));
    const pool = studied.length >= 4 ? studied : activeWords();
    const questions = Quiz.makeQuizSet(pool, activeWords(), 10);
    if (questions.length === 0) return;
    quiz = { questions, index: 0, correct: 0 };
    show("quiz");
    renderQuiz();

    // AI 변형 문제: 자주 틀린 단어를 새로운 문장으로 재출제 (뒷부분 문제와 교체)
    if (!AI.configured(state)) return;
    const weak = studied.filter(w => state.cards[w.id] && state.cards[w.id].wrong > 0);
    const targets = Quiz.shuffle(weak).slice(0, 3);
    if (targets.length === 0) return;
    try {
      const aiQs = await AI.generateQuizQuestions(state, targets);
      const byWord = new Map(targets.map(w => [w.word.toLowerCase(), w]));
      const converted = [];
      for (const q of aiQs) {
        const target = byWord.get((q.word || "").toLowerCase());
        if (!target || !Array.isArray(q.options) || q.options.length < 2) continue;
        if (!q.options.includes(q.answer)) continue;
        converted.push({
          type: "ai", typeLabel: "🤖 AI 변형 문제", target,
          question: target.meaning, example: q.sentence,
          options: Quiz.shuffle(q.options), answer: q.answer,
        });
      }
      // 퀴즈가 아직 진행 중이고 같은 세트라면, 아직 풀지 않은 마지막 문제들을 교체
      if (!quiz || quiz.questions !== questions || converted.length === 0) return;
      const remaining = questions.length - (quiz.index + 1);
      const n = Math.min(converted.length, remaining);
      if (n > 0) questions.splice(questions.length - n, n, ...converted.slice(0, n));
    } catch (e) {
      console.warn("AI 퀴즈 생성 실패:", e);
    }
  }

  function renderQuiz() {
    const q = quiz.questions[quiz.index];
    $("quiz-type-badge").textContent = q.typeLabel;
    $("quiz-question").innerHTML = "";
    const qText = document.createTextNode(q.question);
    $("quiz-question").appendChild(qText);
    if (q.example) {
      const ex = document.createElement("span");
      ex.className = "q-example";
      ex.textContent = q.example;
      $("quiz-question").appendChild(ex);
    }

    const optWrap = $("quiz-options");
    optWrap.innerHTML = "";
    $("quiz-feedback").hidden = true;
    $("btn-quiz-next").hidden = true;

    if (q.options) {
      $("quiz-spelling").hidden = true;
      q.options.forEach(opt => {
        const b = document.createElement("button");
        b.className = "quiz-option";
        b.textContent = opt;
        b.addEventListener("click", () => answerQuiz(opt, b));
        optWrap.appendChild(b);
      });
    } else {
      $("quiz-spelling").hidden = false;
      $("spelling-input").value = "";
      $("spelling-input").focus();
    }

    $("quiz-progress").style.width = `${quiz.index / quiz.questions.length * 100}%`;
    $("quiz-count").textContent = `${quiz.index + 1}/${quiz.questions.length}`;
  }

  function answerQuiz(chosen, btnEl) {
    const q = quiz.questions[quiz.index];
    const isCorrect = chosen.trim().toLowerCase() === q.answer.trim().toLowerCase();
    const fb = $("quiz-feedback");

    document.querySelectorAll(".quiz-option").forEach(b => {
      b.disabled = true;
      if (b.textContent === q.answer) b.classList.add("correct");
    });
    if (btnEl && !isCorrect) btnEl.classList.add("wrong");

    const log = Store.todayLog(state);
    log.actions += 1;
    if (isCorrect) {
      quiz.correct += 1;
      awardXp(5);
      Store.save(state);
      fb.textContent = "✅ 정답입니다! +5XP";
      fb.className = "quiz-feedback ok";
    } else {
      fb.textContent = `❌ 정답: ${q.target.word} — ${q.target.meaning}`;
      fb.className = "quiz-feedback no";
      // 틀린 단어는 학습했던 단어라면 오늘 다시 복습하도록
      if (state.cards[q.target.id]) {
        state.cards[q.target.id] = { ...state.cards[q.target.id], due: SRS.todayStr() };
        Store.save(state);
      }
    }
    fb.hidden = false;
    speak(q.target.word);
    $("btn-quiz-next").hidden = false;
    $("btn-quiz-next").focus();
  }

  $("btn-spelling-submit").addEventListener("click", () => {
    const v = $("spelling-input").value.trim();
    if (v) answerQuiz(v, null);
  });
  $("spelling-input").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const v = $("spelling-input").value.trim();
      if (v && $("btn-quiz-next").hidden) answerQuiz(v, null);
    }
  });

  $("btn-quiz-next").addEventListener("click", () => {
    quiz.index += 1;
    if (quiz.index >= quiz.questions.length) endQuiz();
    else renderQuiz();
  });

  function endQuiz() {
    const log = Store.todayLog(state);
    log.quizDone += 1;
    awardXp(10); // 퀴즈 완료 보너스
    runQuestCheck();
    Store.save(state);
    const xpEarned = quiz.correct * 5 + 10;
    const rate = Math.round(quiz.correct / quiz.questions.length * 100);
    const emoji = rate >= 80 ? "🏆" : rate >= 50 ? "💪" : "📖";
    showSummary(emoji, "퀴즈 완료!",
      `<b>${quiz.questions.length}</b>문제 중 <b>${quiz.correct}</b>개 정답 (${rate}%)<br>` +
      `⚡ 획득 XP <b>+${xpEarned}</b>`);
    quiz = null;
    syncPush(true); // 백그라운드 자동 백업
  }

  $("btn-quiz-exit").addEventListener("click", () => { quiz = null; show("home"); });
  $("btn-start-quiz").addEventListener("click", startQuiz);

  // ---------- AI 회화 ----------
  let talk = null; // {words, history, userCount, busy, finished}

  function recentLearnedWords(n) {
    // 학습 순서(입력 순서)상 가장 최근에 배운 단어들 (같은 철자는 한 번만)
    const ids = Object.keys(state.cards).map(Number);
    const words = ids.map(id => wordById.get(id)).filter(w => w && inDeck(w));
    const seen = new Set();
    const unique = [];
    for (let i = words.length - 1; i >= 0 && unique.length < n; i--) {
      const key = words[i].word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.unshift(words[i]);
    }
    return unique;
  }

  function requireAi() {
    if (AI.configured(state)) return true;
    toast("먼저 Claude API 키를 설정해주세요");
    $("ai-modal").hidden = false;
    return false;
  }

  function addBubble(role, text) {
    const div = document.createElement("div");
    div.className = "talk-bubble " + role;
    div.textContent = text;
    if (role === "ai") {
      const tts = document.createElement("button");
      tts.className = "bubble-tts";
      tts.textContent = "🔊";
      tts.addEventListener("click", () => speak(text));
      div.appendChild(tts);
    }
    $("talk-messages").appendChild(div);
    $("talk-messages").scrollTop = $("talk-messages").scrollHeight;
    return div;
  }

  async function startTalk() {
    if (!requireAi()) return;
    const words = recentLearnedWords(5);
    if (words.length < 3) {
      toast("먼저 '오늘의 학습'으로 단어를 3개 이상 배워주세요");
      return;
    }
    talk = { words, history: [], userCount: 0, busy: false, finished: false };
    $("talk-messages").innerHTML = "";
    $("talk-words").innerHTML = "";
    for (const w of words) {
      const chip = document.createElement("span");
      chip.className = "talk-word-chip";
      chip.textContent = w.word;
      chip.title = w.meaning;
      $("talk-words").appendChild(chip);
    }
    $("talk-input").value = "";
    $("btn-talk-finish").disabled = true;
    show("talk");
    // 첫 인사 요청 (킥오프 메시지는 화면에 표시하지 않음)
    talk.history.push({ role: "user", content: "Hi! Please start our conversation with a friendly greeting and one easy question." });
    const loading = addBubble("ai", "...");
    try {
      const reply = await AI.talkTurn(state, talk.words, talk.history);
      if (!talk) return;
      talk.history.push({ role: "assistant", content: reply });
      loading.remove();
      addBubble("ai", reply);
      $("talk-input").focus();
    } catch (e) {
      loading.remove();
      addBubble("ai", "⚠️ " + e.message);
    }
  }

  async function sendTalk() {
    if (!talk || talk.busy || talk.finished) return;
    const text = $("talk-input").value.trim();
    if (!text) return;
    talk.busy = true;
    $("talk-input").value = "";
    addBubble("user", text);
    talk.history.push({ role: "user", content: text });
    talk.userCount += 1;
    $("btn-talk-finish").disabled = false;
    const loading = addBubble("ai", "...");
    try {
      const reply = await AI.talkTurn(state, talk.words, talk.history);
      if (!talk) return;
      talk.history.push({ role: "assistant", content: reply });
      loading.remove();
      addBubble("ai", reply);
    } catch (e) {
      loading.remove();
      addBubble("ai", "⚠️ " + e.message);
      talk.history.pop(); // 실패한 턴 제거 (다시 시도 가능)
      talk.userCount -= 1;
    } finally {
      if (talk) { talk.busy = false; $("talk-input").focus(); }
    }
  }

  async function finishTalk() {
    if (!talk || talk.busy || talk.finished || talk.userCount < 1) return;
    talk.busy = true;
    $("btn-talk-finish").disabled = true;
    const sentences = talk.history.filter((m, i) => i > 0 && m.role === "user").map(m => m.content);
    const loading = addBubble("ai", "📝 교정 리포트 작성 중...");
    try {
      const report = await AI.correctionReport(state, sentences);
      if (!talk) return;
      loading.remove();
      const div = document.createElement("div");
      div.className = "talk-bubble report";
      const title = document.createElement("div");
      title.className = "rep-title";
      title.textContent = "📝 교정 리포트";
      div.appendChild(title);
      if (report.corrections.length === 0) {
        const p = document.createElement("div");
        p.textContent = "🎉 교정할 문장이 없어요! 훌륭합니다.";
        div.appendChild(p);
      }
      for (const c of report.corrections) {
        const o = document.createElement("div"); o.className = "rep-orig"; o.textContent = c.original;
        const b = document.createElement("div"); b.className = "rep-better"; b.textContent = "→ " + c.better;
        const n = document.createElement("div"); n.className = "rep-note"; n.textContent = c.note;
        div.appendChild(o); div.appendChild(b); div.appendChild(n);
      }
      const cm = document.createElement("div");
      cm.className = "rep-comment";
      cm.textContent = "💬 " + report.comment;
      div.appendChild(cm);
      $("talk-messages").appendChild(div);
      $("talk-messages").scrollTop = $("talk-messages").scrollHeight;
      talk.finished = true;
      awardXp(20);
      Store.save(state);
      toast("🗣️ 회화 완료! +20XP");
      syncPush(true);
    } catch (e) {
      loading.remove();
      addBubble("ai", "⚠️ " + e.message);
      $("btn-talk-finish").disabled = false;
    } finally {
      if (talk) talk.busy = false;
    }
  }

  $("btn-start-talk").addEventListener("click", startTalk);
  $("btn-talk-send").addEventListener("click", sendTalk);
  $("talk-input").addEventListener("keydown", e => { if (e.key === "Enter") sendTalk(); });
  $("btn-talk-finish").addEventListener("click", finishTalk);
  $("btn-talk-exit").addEventListener("click", () => { talk = null; show("home"); });

  // ---------- 영작 연습 ----------
  let write = null; // {items, index, good, ok}

  async function startWrite() {
    if (!requireAi()) return;
    const studied = Object.keys(state.cards).map(id => wordById.get(Number(id))).filter(w => w && inDeck(w));
    if (studied.length < 3) {
      toast("먼저 '오늘의 학습'으로 단어를 3개 이상 배워주세요");
      return;
    }
    // 자주 틀린 단어 우선, 나머지는 최근 학습 단어로 채움
    const weak = studied.filter(w => state.cards[w.id].wrong > 0);
    const pick = [...Quiz.shuffle(weak), ...studied.slice().reverse().filter(w => !weak.includes(w))].slice(0, 5);
    show("write");
    $("write-ko").textContent = "✏️ 문제 생성 중...";
    $("write-hint").textContent = "";
    $("write-input").value = "";
    $("write-input").disabled = true;
    $("btn-write-submit").disabled = true;
    $("write-feedback").hidden = true;
    $("btn-write-next").hidden = true;
    try {
      const items = await AI.makeWritingItems(state, pick);
      const byWord = new Map(pick.map(w => [w.word.toLowerCase(), w]));
      const valid = items.filter(it => byWord.has((it.word || "").toLowerCase()))
        .map(it => ({ ko: it.ko, target: byWord.get(it.word.toLowerCase()) }));
      if (valid.length === 0) throw new Error("문제 생성에 실패했습니다. 다시 시도해주세요.");
      write = { items: valid, index: 0, good: 0, ok: 0 };
      renderWrite();
    } catch (e) {
      toast("⚠️ " + e.message);
      show("home");
    }
  }

  function renderWrite() {
    const it = write.items[write.index];
    $("write-badge").textContent = "✏️ 영작 연습";
    $("write-ko").textContent = it.ko;
    $("write-hint").textContent = `사용할 단어: ${it.target.word} (${it.target.meaning})`;
    $("write-input").value = "";
    $("write-input").disabled = false;
    $("btn-write-submit").disabled = false;
    $("btn-write-submit").hidden = false;
    $("write-feedback").hidden = true;
    $("btn-write-next").hidden = true;
    $("write-progress").style.width = `${write.index / write.items.length * 100}%`;
    $("write-count").textContent = `${write.index + 1}/${write.items.length}`;
    $("write-input").focus();
  }

  async function submitWrite() {
    if (!write) return;
    const answer = $("write-input").value.trim();
    if (!answer) return;
    const it = write.items[write.index];
    $("btn-write-submit").disabled = true;
    $("write-input").disabled = true;
    const fb = $("write-feedback");
    fb.hidden = false;
    fb.innerHTML = "채점 중...";
    try {
      const g = await AI.gradeWriting(state, it.target, it.ko, answer);
      if (!write) return;
      fb.innerHTML = "";
      const res = document.createElement("div");
      res.className = "wf-result";
      if (g.result === "good") { res.textContent = "✅ 훌륭해요! +5XP"; write.good++; awardXp(5); }
      else if (g.result === "ok") { res.textContent = "🟡 좋아요! 조금 더 다듬으면 완벽해요 +3XP"; write.ok++; awardXp(3); }
      else {
        res.textContent = "❌ 다시 볼까요? 이 단어는 오늘 복습에 추가됩니다";
        state.cards[it.target.id] = { ...state.cards[it.target.id], due: SRS.todayStr() };
      }
      const cor = document.createElement("div");
      cor.className = "wf-corrected";
      cor.textContent = "모범: " + g.corrected;
      const note = document.createElement("div");
      note.className = "wf-note";
      note.textContent = g.note;
      fb.appendChild(res); fb.appendChild(cor); fb.appendChild(note);
      Store.save(state);
      $("btn-write-submit").hidden = true;
      $("btn-write-next").hidden = false;
      $("btn-write-next").focus();
    } catch (e) {
      fb.innerHTML = "";
      fb.textContent = "⚠️ " + e.message;
      $("btn-write-submit").disabled = false;
      $("write-input").disabled = false;
    }
  }

  $("btn-start-write").addEventListener("click", startWrite);
  $("btn-write-submit").addEventListener("click", submitWrite);
  $("btn-write-next").addEventListener("click", () => {
    write.index += 1;
    if (write.index >= write.items.length) {
      awardXp(15);
      Store.save(state);
      const total = write.items.length;
      showSummary("✏️", "영작 연습 완료!",
        `<b>${total}</b>문제 중 훌륭 <b>${write.good}</b> · 양호 <b>${write.ok}</b><br>⚡ 완료 보너스 <b>+15XP</b>`);
      write = null;
      syncPush(true);
    } else {
      renderWrite();
    }
  });
  $("btn-write-exit").addEventListener("click", () => { write = null; show("home"); });

  // ---------- 쉐도잉 ----------
  let shadow = null; // {items, index, revealed, spoken, xp}
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let recognizer = null;

  function speakRate(text, rate) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;
    const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith("en"));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }

  function startShadow() {
    // 배운 단어 중 예문이 있는 것 (최근 학습 우선)
    const studied = Object.keys(state.cards).map(id => wordById.get(Number(id)))
      .filter(w => w && inDeck(w) && w.example);
    if (studied.length < 3) {
      toast("먼저 '오늘의 학습'으로 단어를 3개 이상 배워주세요");
      return;
    }
    const items = studied.slice(-8).reverse();
    shadow = { items, index: 0, revealed: false, spoken: false };
    $("btn-shadow-mic").hidden = !SpeechRec; // 미지원 브라우저(아이폰 등)는 숨김
    show("shadow");
    renderShadow();
  }

  function renderShadow() {
    const w = shadow.items[shadow.index];
    shadow.revealed = false;
    shadow.spoken = false;
    $("shadow-word").innerHTML = "";
    const b = document.createElement("b");
    b.textContent = w.word;
    $("shadow-word").appendChild(b);
    $("shadow-word").appendChild(document.createTextNode(" — " + w.meaning));
    const s = $("shadow-sentence");
    s.className = "shadow-sentence hidden-text";
    s.textContent = "🔈 먼저 귀로만 듣고 소리 내어 따라 말해보세요. 그 다음 문장을 확인하세요.";
    $("shadow-result").hidden = true;
    $("shadow-result").innerHTML = "";
    $("shadow-progress").style.width = `${shadow.index / shadow.items.length * 100}%`;
    $("shadow-count").textContent = `${shadow.index + 1}/${shadow.items.length}`;
    speakRate(w.example, 0.85);
  }

  function revealShadow() {
    const w = shadow.items[shadow.index];
    shadow.revealed = true;
    const s = $("shadow-sentence");
    s.className = "shadow-sentence";
    s.textContent = w.example;
  }

  function shadowSimilarity(target, heard) {
    const norm = t => t.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
    const tw = norm(target);
    const hw = new Set(norm(heard));
    const hits = tw.map(word => hw.has(word));
    const score = tw.length ? hits.filter(Boolean).length / tw.length : 0;
    return { score, words: tw, hits };
  }

  function micShadow() {
    if (!SpeechRec || !shadow) return;
    const w = shadow.items[shadow.index];
    const btn = $("btn-shadow-mic");
    if (recognizer) { recognizer.abort(); recognizer = null; btn.classList.remove("recording"); btn.textContent = "🎤 말하기"; return; }
    speechSynthesis.cancel();
    recognizer = new SpeechRec();
    recognizer.lang = "en-US";
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    btn.classList.add("recording");
    btn.textContent = "⏹ 듣는 중...";
    const done = () => { btn.classList.remove("recording"); btn.textContent = "🎤 말하기"; recognizer = null; };
    recognizer.onresult = e => {
      done();
      const heard = e.results[0][0].transcript;
      const { score, words, hits } = shadowSimilarity(w.example, heard);
      shadow.spoken = true;
      const box = $("shadow-result");
      box.hidden = false;
      box.innerHTML = "";
      const sc = document.createElement("div");
      sc.className = "sr-score";
      sc.textContent = score >= 0.8 ? `🎉 훌륭해요! (일치율 ${Math.round(score * 100)}%)`
        : score >= 0.5 ? `👍 좋아요! (일치율 ${Math.round(score * 100)}%) 한 번 더 해볼까요?`
        : `💪 다시 도전! (일치율 ${Math.round(score * 100)}%) — 인식이 부정확할 수 있으니 참고만 하세요`;
      box.appendChild(sc);
      // 문장 단어별 인식 여부 표시
      const diff = document.createElement("div");
      words.forEach((word, i) => {
        const span = document.createElement("span");
        span.className = hits[i] ? "word-hit" : "word-miss";
        span.textContent = word + " ";
        diff.appendChild(span);
      });
      box.appendChild(diff);
      const heardEl = document.createElement("div");
      heardEl.className = "sr-heard";
      heardEl.textContent = "인식된 문장: " + heard;
      box.appendChild(heardEl);
      if (!shadow.revealed) revealShadow();
    };
    recognizer.onerror = e => {
      done();
      if (e.error === "not-allowed") toast("마이크 권한을 허용해주세요");
      else if (e.error !== "aborted") toast("음성 인식 실패 — 다시 시도해주세요");
    };
    recognizer.onend = () => { if (recognizer) done(); };
    try { recognizer.start(); } catch (e) { done(); }
  }

  $("btn-start-shadow").addEventListener("click", startShadow);
  $("btn-shadow-play").addEventListener("click", () => shadow && speakRate(shadow.items[shadow.index].example, 0.85));
  $("btn-shadow-slow").addEventListener("click", () => shadow && speakRate(shadow.items[shadow.index].example, 0.6));
  $("btn-shadow-reveal").addEventListener("click", () => shadow && revealShadow());
  $("btn-shadow-mic").addEventListener("click", micShadow);
  $("btn-shadow-next").addEventListener("click", () => {
    if (!shadow) return;
    awardXp(2);
    const log = Store.todayLog(state);
    log.actions += 1;
    Store.save(state);
    shadow.index += 1;
    if (shadow.index >= shadow.items.length) {
      awardXp(10);
      Store.save(state);
      showSummary("🎧", "쉐도잉 완료!",
        `<b>${shadow.items.length}</b>문장 연습<br>⚡ 획득 XP <b>+${shadow.items.length * 2 + 10}</b>`);
      shadow = null;
      syncPush(true);
    } else {
      renderShadow();
    }
  });
  $("btn-shadow-exit").addEventListener("click", () => {
    if (recognizer) { recognizer.abort(); recognizer = null; }
    speechSynthesis.cancel();
    shadow = null;
    show("home");
  });

  // ---------- 결과 화면 ----------
  function showSummary(emoji, title, statsHtml) {
    $("summary-emoji").textContent = emoji;
    $("summary-title").textContent = title;
    $("summary-stats").innerHTML = statsHtml;
    show("summary");
  }
  $("btn-summary-home").addEventListener("click", () => show("home"));

  // ---------- 시작 ----------
  show("home");
  syncPullOnStart();
})();
