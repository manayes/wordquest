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
  const screens = ["home", "study", "quiz", "summary"];
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
