// 메인 앱 로직: 화면 전환, 학습 세션, 퀴즈 진행

(() => {
  const state = Store.load();
  const $ = id => document.getElementById(id);
  const ALL_WORDS = WORDS
    .concat(typeof WORDS_TOEIC !== "undefined" ? WORDS_TOEIC : [])
    .concat(typeof SENTENCES !== "undefined" ? SENTENCES : []);
  // 사용자가 추가한 카드(⭐ 내 카드)는 state에 저장되어 동기화됨
  for (const c of (state.custom || [])) ALL_WORDS.push(c);
  const wordById = new Map(ALL_WORDS.map(w => [w.id, w]));

  function isSentence(w) { return (w.deck || "vocab") === "sentence" || !!w.sent; }

  // ---------- 단어장(덱) 선택 ----------
  function inDeck(w) {
    const d = state.settings.deck || "all";
    if (d === "all") return !isSentence(w); // '전체'는 단어만 (문장은 별도 탭)
    return (w.deck || "vocab") === d;
  }

  function deckNoun() {
    const d = state.settings.deck || "all";
    return d === "sentence" ? "문장" : (d === "custom" ? "카드" : "단어");
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
  const screens = ["home", "study", "quiz", "talk", "write", "shadow", "audio", "stats", "summary"];
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

    const noun = deckNoun();
    $("stat-total").nextElementSibling.textContent = `전체 ${noun}`;
    $("stat-learned").nextElementSibling.textContent = `학습한 ${noun}`;
    $("study-preview").textContent = `복습 ${due}개 + 새 ${noun} ${newCount}개`;
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

  // ---------- 학습 세션 (자동 채점 엔진) ----------
  // 자기 평가 대신 실제 문제를 풀어 자동으로 판정한다.
  // - 첫 시도 정답: 복습 간격 확장 (SRS good)
  // - 오답: 2~4문제 뒤에 한 번 더 (세션 내 간격 재출제)
  // - 같은 세션 2회 오답: 오늘은 중단, 내일 다시 (과잉 반복 방지)
  // - 상습 오답 카드(누적 4회+): 문제 대신 '다시 익히기' 소개 후 테스트, 실패해도 이틀 뒤로
  let study = null;      // {queue, done, total, newIntroduced:Set, reviewedCount, xpEarned, weakMode}
  let studyTest = null;  // 퀴즈 화면이 학습 테스트로 동작 중일 때 {item, q}
  let introItem = null;  // 소개 카드 표시 중인 항목

  function isLeech(w) {
    const c = state.cards[w.id];
    return !!c && (c.lapses || 0) >= 4;
  }

  function buildStudyQueue() {
    const reviews = Quiz.shuffle(dueCards()).map(w => ({
      word: w, kind: isLeech(w) ? "intro" : "test", isNew: false, leech: isLeech(w), fails: 0, counted: false,
    }));
    const news = newWordsAvailable(remainingNewToday()).map(w => ({
      word: w, kind: "intro", isNew: true, leech: false, fails: 0, counted: false,
    }));
    // 새 카드 소개를 복습 사이에 고르게 배치 (인터리빙)
    if (reviews.length === 0) return news;
    if (news.length === 0) return reviews;
    const queue = [];
    const gap = Math.max(1, Math.floor(reviews.length / news.length));
    let ni = 0;
    reviews.forEach((it, i) => {
      queue.push(it);
      if ((i + 1) % gap === 0 && ni < news.length) queue.push(news[ni++]);
    });
    while (ni < news.length) queue.push(news[ni++]);
    return queue;
  }

  function insertIntoQueue(item, minGap, maxGap) {
    const gap = minGap + Math.floor(Math.random() * (maxGap - minGap + 1));
    const pos = Math.min(gap, study.queue.length);
    study.queue.splice(pos, 0, item);
    study.total += 1;
  }

  function startStudy() {
    if (activeWords().length === 0) {
      toast("➕ '카드 추가'로 나만의 단어/문장을 먼저 넣어주세요");
      return;
    }
    let queue = buildStudyQueue();
    if (queue.length === 0) {
      // 오늘 목표를 이미 채운 경우: 안내하고 추가 학습 제안
      const extra = newWordsAvailable(state.settings.newPerDay);
      if (extra.length === 0) {
        toast("🎉 이 단어장의 모든 카드를 학습했습니다!");
        return;
      }
      if (!confirm(`오늘 목표를 모두 마쳤습니다! 새 ${deckNoun()} ${extra.length}개를 추가로 학습할까요?`)) return;
      queue = extra.map(w => ({ word: w, kind: "intro", isNew: true, leech: false, fails: 0, counted: false }));
    }
    study = { queue, done: 0, total: queue.length, newIntroduced: new Set(), reviewedCount: 0, xpEarned: 0, weakMode: false };
    studyNext();
  }

  function studyNext() {
    if (!study) return;
    if (study.queue.length === 0) return endStudy();
    const item = study.queue.shift();
    if (item.kind === "intro") renderIntro(item);
    else startStudyTest(item);
  }

  function studyProgress() {
    const pct = study.total ? (study.done / study.total * 100) : 0;
    return { pct, text: `${study.done}/${study.total}` };
  }

  function renderIntro(item) {
    introItem = item;
    const w = item.word;
    const badge = $("card-badge");
    if (item.isNew) { badge.textContent = "✨ 새 " + (isSentence(w) ? "문장" : "단어"); badge.className = "card-badge badge-new"; }
    else { badge.textContent = "🔁 다시 익히기 (어려운 카드)"; badge.className = "card-badge"; }

    if (isSentence(w)) {
      $("card-word").textContent = w.meaning;
      $("card-word").classList.add("sentence-front");
      $("card-ipa").textContent = w.cat ? "💬 " + w.cat : "";
      $("card-meaning").textContent = w.word;
      $("card-example").textContent = w.example || "";
    } else {
      $("card-word").textContent = w.word;
      $("card-word").classList.remove("sentence-front");
      $("card-ipa").textContent = w.ipa || "";
      $("card-meaning").textContent = w.meaning;
      $("card-example").textContent = w.example || "";
    }
    $("card-answer").hidden = false; // 소개 카드는 항상 전체 공개
    $("btn-tts").hidden = false;
    $("ai-actions").hidden = isSentence(w); // 연상법/예문 생성은 단어 전용
    $("ai-output").hidden = true;
    $("ai-output").innerHTML = "";
    speak(w.word);

    const p = studyProgress();
    $("study-progress").style.width = `${p.pct}%`;
    $("study-count").textContent = p.text;
    show("study");
  }

  // 소개 확인 → 2~4문제 뒤에 자동 테스트
  $("btn-intro-next").addEventListener("click", () => {
    if (!study || !introItem) return;
    const item = introItem;
    introItem = null;
    if (item.isNew && !study.newIntroduced.has(item.word.id)) {
      study.newIntroduced.add(item.word.id);
      const log = Store.todayLog(state);
      log.newLearned += 1;
      log.actions += 1;
      Store.save(state);
      runQuestCheck();
    }
    study.done += 1;
    insertIntoQueue({ ...item, kind: "test" }, 2, 4);
    studyNext();
  });

  function startStudyTest(item) {
    const q = Quiz.makeQuestion(item.word, activeWords());
    studyTest = { item, q };
    const badge = item.isNew ? "✨ 새 카드 테스트" : (item.leech ? "🔁 어려운 카드" : "📖 복습");
    renderQuestionDom(q, badge + " · " + q.typeLabel);
    const p = studyProgress();
    $("quiz-progress").style.width = `${p.pct}%`;
    $("quiz-count").textContent = p.text;
    show("quiz");
  }

  // 자동 채점 결과 → SRS 반영
  function handleStudyResult(correct) {
    const item = studyTest.item;
    const w = item.word;
    const prev = state.cards[w.id] || SRS.newCardState();
    let msg = "";
    if (!item.isNew && !item.counted) {
      item.counted = true;
      study.reviewedCount += 1;
      const log = Store.todayLog(state);
      log.reviewed += 1;
    }
    Store.todayLog(state).actions += 1;
    if (correct) {
      if (item.fails === 0) {
        state.cards[w.id] = SRS.nextState(prev, study.weakMode ? 1 : 2);
        const xp = item.isNew ? 10 : 5;
        study.xpEarned += xp;
        awardXp(xp);
        msg = `✅ 정답입니다! +${xp}XP`;
      } else {
        state.cards[w.id] = SRS.nextState(prev, 1); // 재도전 성공 → 내일 한 번 더
        study.xpEarned += 2;
        awardXp(2);
        msg = "✅ 좋아요! 내일 한 번 더 확인할게요 +2XP";
      }
    } else {
      item.fails += 1;
      if (item.fails === 1) {
        state.cards[w.id] = SRS.nextState(prev, 0); // 오답 기록
        insertIntoQueue({ ...item, kind: "test" }, 2, 4); // 잠시 후 재도전
        toast("💪 잠시 후 이 카드가 다시 나옵니다");
      } else {
        // 같은 세션 2회 오답: 오늘은 그만 (어려운 카드는 이틀 뒤)
        const push = item.leech ? 2 : 1;
        state.cards[w.id] = { ...state.cards[w.id], ivl: push, due: SRS.todayStr(push) };
        toast(push === 1 ? "📌 이 카드는 내일 다시 복습합니다" : "📌 이 카드는 모레 다시 복습합니다");
      }
    }
    study.done += 1;
    Store.save(state);
    runQuestCheck();
    return msg;
  }

  function endStudy() {
    const s = study;
    study = null;
    studyTest = null;
    introItem = null;
    const title = s.weakMode ? "약점 집중 복습 완료!" : "오늘의 학습 완료!";
    showSummary("🎉", title,
      `새 ${deckNoun()} <b>${s.newIntroduced.size}</b>개 학습<br>복습 <b>${s.reviewedCount}</b>개 완료<br>` +
      `⚡ 획득 XP <b>+${s.xpEarned}</b>`);
    syncPush(true);
  }

  $("btn-tts").addEventListener("click", () => introItem && speak(introItem.word.word));
  $("btn-study-exit").addEventListener("click", () => { study = null; studyTest = null; introItem = null; show("home"); });
  $("btn-start-study").addEventListener("click", startStudy);

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

  // ---------- 내 카드 추가/관리 (⭐ 내 카드) ----------
  function customNextId() {
    let max = 30000;
    for (const c of state.custom) if (c.id > max) max = c.id;
    return max + 1;
  }

  function renderCustomList() {
    $("custom-count").textContent = state.custom.length ? `(${state.custom.length}장)` : "";
    const wrap = $("custom-list");
    wrap.innerHTML = "";
    for (const c of state.custom.slice().reverse()) {
      const row = document.createElement("div");
      row.className = "custom-row";
      const txt = document.createElement("div");
      txt.className = "custom-row-text";
      const en = document.createElement("div");
      en.className = "custom-en";
      en.textContent = (c.sent ? "💬 " : "") + c.word;
      const ko = document.createElement("div");
      ko.className = "custom-ko";
      ko.textContent = c.meaning;
      txt.appendChild(en);
      txt.appendChild(ko);
      const del = document.createElement("button");
      del.className = "custom-del";
      del.textContent = "🗑";
      del.title = "삭제";
      del.addEventListener("click", () => {
        if (!confirm(`'${c.word}' 카드를 삭제할까요? 학습 기록도 함께 지워집니다.`)) return;
        state.custom = state.custom.filter(x => x.id !== c.id);
        const i = ALL_WORDS.findIndex(x => x.id === c.id);
        if (i >= 0) ALL_WORDS.splice(i, 1);
        wordById.delete(c.id);
        delete state.cards[c.id];
        Store.save(state);
        renderCustomList();
        renderHome();
      });
      row.appendChild(txt);
      row.appendChild(del);
      wrap.appendChild(row);
    }
  }

  $("btn-add-card").addEventListener("click", () => {
    renderCustomList();
    $("add-modal").hidden = false;
    $("add-input").focus();
  });
  $("btn-add-close").addEventListener("click", () => { $("add-modal").hidden = true; });

  async function addCards() {
    const raw = $("add-input").value.trim();
    if (!raw) return;
    const lines = raw.split("\n").map(s => s.trim()).filter(Boolean);
    if (lines.length > 100) {
      toast("한 번에 최대 100줄까지 추가할 수 있어요");
      return;
    }
    const manual = [], needAI = [];
    for (const line of lines) {
      // 탭(엑셀/Language Reactor 붙여넣기) 또는 | 로 '영어 / 뜻' 구분
      let en = "", ko = "";
      if (line.includes("\t")) {
        const p = line.split("\t");
        en = p[0].trim();
        ko = (p[1] || "").trim();
      } else {
        const p = line.split("|");
        en = p[0].trim();
        ko = p.slice(1).join("|").trim();
      }
      if (!en) continue;
      if (ko) manual.push({ en, ko });
      else needAI.push(en);
    }
    if (needAI.length && !AI.configured(state)) {
      toast("뜻이 없는 줄은 AI가 필요해요 — '영어 | 뜻' 형식으로 쓰거나 🤖 AI 설정을 해주세요");
      return;
    }
    const btn = $("btn-add-save");
    btn.disabled = true;
    btn.textContent = needAI.length ? "🤖 AI 생성 중..." : "추가 중...";
    try {
      const entries = [];
      for (const m of manual) {
        const sent = m.en.split(/\s+/).length >= 3;
        entries.push({ id: 0, word: m.en, ipa: "", meaning: m.ko, example: "", deck: "custom", sent, cat: sent ? "내 카드" : "" });
      }
      // AI 생성은 20개씩 나눠 처리 (대량 붙여넣기 지원)
      for (let i = 0; i < needAI.length; i += 20) {
        btn.textContent = `🤖 AI 생성 중... ${Math.min(i + 20, needAI.length)}/${needAI.length}`;
        const cards = await AI.completeCards(state, needAI.slice(i, i + 20));
        for (const c of cards) {
          if (!c.input || !c.meaning) continue;
          const sent = c.kind === "sentence";
          entries.push({
            id: 0, word: c.input, ipa: sent ? "" : (c.ipa || ""), meaning: c.meaning,
            example: c.example || "", deck: "custom", sent, cat: sent ? (c.cat || "내 카드") : "",
          });
        }
      }
      if (entries.length === 0) throw new Error("추가할 카드를 만들지 못했어요. 입력을 확인해주세요.");
      let added = 0;
      for (const e of entries) {
        if (state.custom.some(x => x.word.toLowerCase() === e.word.toLowerCase())) continue; // 중복 방지
        e.id = customNextId();
        state.custom.push(e);
        ALL_WORDS.push(e);
        wordById.set(e.id, e);
        added++;
      }
      Store.save(state);
      $("add-input").value = "";
      renderCustomList();
      renderHome();
      toast(added ? `⭐ 카드 ${added}장이 추가되었습니다` : "이미 있는 카드예요");
      if (added) syncPush(true);
    } catch (e) {
      toast("⚠️ " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "추가하기";
    }
  }
  $("btn-add-save").addEventListener("click", addCards);

  // ---------- 학습 카드 AI 기능 ----------
  async function runAiFeature(kind) {
    if (!introItem) return;
    const w = introItem.word;
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
      if (!introItem || introItem.word.id !== w.id) return; // 이미 다음 카드로 넘어감
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
      if (!introItem || introItem.word.id !== w.id) return;
      out.className = "ai-output error";
      out.hidden = false;
      out.textContent = "⚠️ " + e.message;
    } finally {
      btn.disabled = false;
    }
  }
  $("btn-ai-mnemonic").addEventListener("click", () => runAiFeature("mnemonic"));
  $("btn-ai-example").addEventListener("click", () => runAiFeature("example"));

  // ---------- 퀴즈 ----------
  let quiz = null; // {questions, index, correct}

  async function startQuiz() {
    if (activeWords().length < 4) {
      toast("카드가 4장 이상 있어야 퀴즈를 풀 수 있어요");
      return;
    }
    const studied = Object.keys(state.cards).map(id => wordById.get(Number(id))).filter(w => w && inDeck(w));
    const pool = studied.length >= 4 ? studied : activeWords();
    const questions = Quiz.makeQuizSet(pool, activeWords(), 10);
    if (questions.length === 0) return;
    quiz = { questions, index: 0, correct: 0 };
    show("quiz");
    renderQuiz();

    // AI 변형 문제: 자주 틀린 단어를 새로운 문장으로 재출제 (뒷부분 문제와 교체)
    if (state.settings.deck === "sentence") return; // 문장 덱은 자체 유형 사용
    if (!AI.configured(state)) return;
    const weak = studied.filter(w => !isSentence(w) && state.cards[w.id] && state.cards[w.id].wrong > 0);
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
    renderQuestionDom(q, q.typeLabel);
    $("quiz-progress").style.width = `${quiz.index / quiz.questions.length * 100}%`;
    $("quiz-count").textContent = `${quiz.index + 1}/${quiz.questions.length}`;
  }

  // 문제 1개를 퀴즈 화면 DOM에 그리기 (퀴즈/학습 테스트 공용)
  function renderQuestionDom(q, badgeText) {
    $("quiz-type-badge").textContent = badgeText;
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
    $("quiz-spelling").hidden = true;
    $("quiz-assemble").hidden = true;

    if (q.type === "assemble") {
      renderAssemble(q);
    } else if (q.options) {
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
  }

  // ---------- 문장 조립 퍼즐 ----------
  let assembleState = null; // {q, built: [{tok, btn}]}

  function renderAssemble(q) {
    $("quiz-assemble").hidden = false;
    const builtEl = $("assemble-built");
    const tilesEl = $("assemble-tiles");
    builtEl.textContent = "";
    tilesEl.innerHTML = "";
    assembleState = { q, built: [] };
    $("btn-assemble-undo").disabled = false;
    q.tokens.forEach(tok => {
      const b = document.createElement("button");
      b.className = "assemble-tile";
      b.textContent = tok;
      b.addEventListener("click", () => {
        if (b.disabled || !assembleState) return;
        b.disabled = true;
        assembleState.built.push({ tok, btn: b });
        builtEl.textContent = assembleState.built.map(x => x.tok).join(" ");
        if (assembleState.built.length === q.tokens.length) {
          [...tilesEl.children].forEach(t => { t.disabled = true; });
          $("btn-assemble-undo").disabled = true;
          const answer = assembleState.built.map(x => x.tok).join(" ");
          assembleState = null;
          answerQuiz(answer, null);
        }
      });
      tilesEl.appendChild(b);
    });
  }

  $("btn-assemble-undo").addEventListener("click", () => {
    if (!assembleState || assembleState.built.length === 0) return;
    const last = assembleState.built.pop();
    last.btn.disabled = false;
    $("assemble-built").textContent = assembleState.built.map(x => x.tok).join(" ");
  });

  function answerQuiz(chosen, btnEl) {
    const q = studyTest ? studyTest.q : quiz.questions[quiz.index];
    const isCorrect = chosen.trim().toLowerCase() === q.answer.trim().toLowerCase();
    const fb = $("quiz-feedback");

    document.querySelectorAll(".quiz-option").forEach(b => {
      b.disabled = true;
      if (b.textContent === q.answer) b.classList.add("correct");
    });
    if (btnEl && !isCorrect) btnEl.classList.add("wrong");

    if (studyTest) {
      // 학습 테스트: 자동 채점 엔진이 SRS/XP/재출제를 처리
      const msg = handleStudyResult(isCorrect);
      fb.textContent = isCorrect ? msg : `❌ 정답: ${q.target.word} — ${q.target.meaning}`;
      fb.className = isCorrect ? "quiz-feedback ok" : "quiz-feedback no";
    } else {
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
    if (studyTest) { // 학습 테스트 진행 중이면 학습 흐름으로 복귀
      studyTest = null;
      studyNext();
      return;
    }
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

  $("btn-quiz-exit").addEventListener("click", () => {
    if (studyTest) { studyTest = null; study = null; introItem = null; }
    quiz = null;
    show("home");
  });
  $("btn-start-quiz").addEventListener("click", startQuiz);

  // ---------- 📊 학습 통계 & 약점 집중 복습 ----------
  function weakEntries() {
    return Object.entries(state.cards)
      .map(([id, c]) => ({ w: wordById.get(Number(id)), c }))
      .filter(x => x.w && inDeck(x.w) && (x.c.wrong || 0) >= 2)
      .sort((a, b) => (b.c.wrong - a.c.wrong) || ((b.c.lapses || 0) - (a.c.lapses || 0)));
  }

  function renderStats() {
    // 요약 수치
    let learned = 0, correct = 0, wrong = 0;
    for (const [id, c] of Object.entries(state.cards)) {
      const w = wordById.get(Number(id));
      if (!w || !inDeck(w)) continue;
      learned++;
      correct += c.correct || 0;
      wrong += c.wrong || 0;
    }
    const total = correct + wrong;
    const rate = total ? Math.round(correct / total * 100) : 0;
    const cards = $("stats-cards");
    cards.innerHTML = "";
    [[learned.toLocaleString(), `학습한 ${deckNoun()}`], [`${rate}%`, "정답률"], [total.toLocaleString(), "누적 풀이"]].forEach(([num, label]) => {
      const d = document.createElement("div");
      d.className = "stat-card";
      const n = document.createElement("div");
      n.className = "stat-num" + (label === "정답률" ? " accent" : "");
      n.textContent = num;
      const l = document.createElement("div");
      l.className = "stat-label";
      l.textContent = label;
      d.appendChild(n); d.appendChild(l);
      cards.appendChild(d);
    });

    // 최근 7일 학습량 막대
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const e = state.days[SRS.dateKey(d)];
      week.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, n: e ? (e.actions || 0) : 0 });
    }
    const max = Math.max(1, ...week.map(x => x.n));
    const wk = $("stats-week");
    wk.innerHTML = "";
    for (const day of week) {
      const col = document.createElement("div");
      col.className = "wk-col";
      const num = document.createElement("div");
      num.className = "wk-num";
      num.textContent = day.n || "";
      const bar = document.createElement("div");
      bar.className = "wk-bar" + (day.n ? "" : " empty");
      bar.style.height = `${Math.max(4, day.n / max * 70)}px`;
      const lb = document.createElement("div");
      lb.className = "wk-label";
      lb.textContent = day.label;
      col.appendChild(num); col.appendChild(bar); col.appendChild(lb);
      wk.appendChild(col);
    }

    // 자주 틀리는 카드 목록
    const list = $("weak-list");
    list.innerHTML = "";
    const weak = weakEntries().slice(0, 15);
    if (weak.length === 0) {
      const p = document.createElement("div");
      p.className = "weak-empty";
      p.textContent = "아직 자주 틀리는 카드가 없어요 👍 (오답 2회 이상인 카드가 여기 표시됩니다)";
      list.appendChild(p);
    }
    for (const { w, c } of weak) {
      const row = document.createElement("div");
      row.className = "custom-row";
      const txt = document.createElement("div");
      txt.className = "custom-row-text";
      const en = document.createElement("div");
      en.className = "custom-en";
      en.textContent = ((c.lapses || 0) >= 4 ? "🔥 " : "") + w.word;
      const ko = document.createElement("div");
      ko.className = "custom-ko";
      ko.textContent = w.meaning;
      txt.appendChild(en); txt.appendChild(ko);
      const cnt = document.createElement("div");
      cnt.className = "weak-count";
      cnt.textContent = `오답 ${c.wrong}회`;
      row.appendChild(txt); row.appendChild(cnt);
      list.appendChild(row);
    }
  }

  $("btn-stats").addEventListener("click", () => { renderStats(); show("stats"); });
  $("btn-stats-exit").addEventListener("click", () => show("home"));

  $("btn-weak-study").addEventListener("click", () => {
    const weak = weakEntries().map(x => x.w);
    if (weak.length === 0) {
      toast("집중 복습할 카드가 없어요 👍");
      return;
    }
    const queue = Quiz.shuffle(weak).slice(0, 10).map(w => ({
      word: w, kind: isLeech(w) ? "intro" : "test", isNew: false, leech: isLeech(w), fails: 0, counted: true,
    }));
    study = { queue, done: 0, total: queue.length, newIntroduced: new Set(), reviewedCount: 0, xpEarned: 0, weakMode: true };
    studyNext();
  });

  // ---------- AI 회화 ----------
  let talk = null; // {words, history, userCount, busy, finished}

  function recentLearnedWords(n) {
    // 학습 순서(입력 순서)상 가장 최근에 배운 '단어'들 (문장 제외, 같은 철자는 한 번만)
    // 문장 탭에서는 모든 단어 덱을 대상으로 함 (회화/영작은 단어 기반 기능)
    const ids = Object.keys(state.cards).map(Number);
    const words = ids.map(id => wordById.get(id))
      .filter(w => w && !isSentence(w) && (state.settings.deck === "sentence" ? true : inDeck(w)));
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

  // 모바일: 키보드가 올라와 화면이 줄어들면 최신 메시지가 보이도록 자동 스크롤
  function scrollTalkToBottom() {
    const m = $("talk-messages");
    m.scrollTop = m.scrollHeight;
  }
  if (window.visualViewport) {
    // 키보드가 올라오면 앱 높이를 실제 보이는 영역에 맞춤 (dvh는 키보드를 반영하지 않음)
    window.visualViewport.addEventListener("resize", () => {
      if (window.innerWidth <= 780) {
        const app = document.querySelector(".app");
        const vvh = Math.round(window.visualViewport.height);
        if (vvh < window.innerHeight - 50) {
          app.style.height = vvh + "px"; // 키보드 열림
          window.scrollTo(0, 0);
        } else {
          app.style.height = ""; // 키보드 닫힘 -> CSS 기본값 복귀
        }
      }
      if (talk && !$("screen-talk").hidden) setTimeout(scrollTalkToBottom, 50);
    });
  }
  $("talk-input").addEventListener("focus", () => {
    setTimeout(scrollTalkToBottom, 300); // 키보드 애니메이션 후
  });
  $("btn-talk-finish").addEventListener("click", finishTalk);
  $("btn-talk-exit").addEventListener("click", () => { talk = null; show("home"); });

  // ---------- 영작 연습 ----------
  let write = null; // {items, index, good, ok}

  async function startWrite() {
    if (!requireAi()) return;
    const studied = Object.keys(state.cards).map(id => wordById.get(Number(id)))
      .filter(w => w && !isSentence(w) && (state.settings.deck === "sentence" ? true : inDeck(w)));
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

  function shadowText(w) {
    return isSentence(w) ? w.word : w.example; // 문장 덱은 회화 문장 자체를 쉐도잉
  }

  function startShadow() {
    // 배운 단어의 예문 / 배운 회화 문장 (최근 학습 우선)
    const studied = Object.keys(state.cards).map(id => wordById.get(Number(id)))
      .filter(w => w && inDeck(w) && shadowText(w));
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
    b.textContent = isSentence(w) ? "💬" : w.word;
    $("shadow-word").appendChild(b);
    $("shadow-word").appendChild(document.createTextNode(" — " + w.meaning));
    const s = $("shadow-sentence");
    s.className = "shadow-sentence hidden-text";
    s.textContent = "🔈 먼저 귀로만 듣고 소리 내어 따라 말해보세요. 그 다음 문장을 확인하세요.";
    $("shadow-result").hidden = true;
    $("shadow-result").innerHTML = "";
    $("shadow-progress").style.width = `${shadow.index / shadow.items.length * 100}%`;
    $("shadow-count").textContent = `${shadow.index + 1}/${shadow.items.length}`;
    speakRate(shadowText(w), 0.85);
  }

  function revealShadow() {
    const w = shadow.items[shadow.index];
    shadow.revealed = true;
    const s = $("shadow-sentence");
    s.className = "shadow-sentence";
    s.textContent = shadowText(w);
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
      const { score, words, hits } = shadowSimilarity(shadowText(w), heard);
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
  $("btn-shadow-play").addEventListener("click", () => shadow && speakRate(shadowText(shadow.items[shadow.index]), 0.85));
  $("btn-shadow-slow").addEventListener("click", () => shadow && speakRate(shadowText(shadow.items[shadow.index]), 0.6));
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

  // ---------- 🎵 오디오 모드 (출퇴근 듣기) ----------
  let audio = null; // {items, idx, playing, token, timer, played}
  let wakeLock = null;

  async function requestWake() {
    try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  function releaseWake() {
    try { if (wakeLock) wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }

  // 말하기가 끝날 때까지 기다림 (환경 문제로 onend가 안 오면 길이 기반 타임아웃)
  function speakAsync(text, lang, rate) {
    return new Promise(res => {
      if (!("speechSynthesis" in window)) return setTimeout(res, 800);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate;
      const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith(lang.slice(0, 2)));
      if (voice) u.voice = voice;
      const guard = setTimeout(res, 3000 + text.length * 150);
      u.onend = () => { clearTimeout(guard); res(); };
      u.onerror = () => { clearTimeout(guard); res(); };
      speechSynthesis.speak(u);
    });
  }

  function audioWait(ms) {
    return new Promise(res => { if (audio) audio.timer = setTimeout(res, ms); else res(); });
  }

  function renderAudioItem(w, revealEn) {
    $("audio-ko").textContent = w.meaning;
    $("audio-en").textContent = revealEn ? w.word : "· · ·";
    $("audio-count").textContent = `${audio.idx + 1}/${audio.items.length}`;
  }

  function startAudio() {
    const studied = Object.keys(state.cards).map(id => wordById.get(Number(id))).filter(w => w && inDeck(w));
    if (studied.length < 3) {
      toast("먼저 '오늘의 학습'으로 카드를 3개 이상 배워주세요");
      return;
    }
    const items = Quiz.shuffle(studied).slice(0, 50);
    audio = { items, idx: 0, playing: false, token: 0, timer: null, played: 0 };
    $("btn-audio-play").textContent = "▶️ 재생";
    $("audio-ko").textContent = `카드 ${items.length}장이 준비됐어요 — ▶️ 재생을 눌러 시작하세요`;
    $("audio-en").textContent = "";
    $("audio-count").textContent = `1/${items.length}`;
    show("audio");
  }

  async function audioLoop(token) {
    const alive = () => audio && audio.token === token && audio.playing;
    while (alive() && audio.idx < audio.items.length) {
      const w = audio.items[audio.idx];
      const mode = $("audio-mode").value;
      const rate = parseFloat($("audio-rate").value);
      if (mode === "koen") {
        renderAudioItem(w, false);
        await speakAsync(w.meaning, "ko-KR", 1);
        if (!alive()) return;
        await audioWait(2200); // 영어를 떠올릴 시간
        if (!alive()) return;
        renderAudioItem(w, true);
        await speakAsync(w.word, "en-US", rate);
        if (!alive()) return;
        await audioWait(600);
        if (!alive()) return;
        await speakAsync(w.word, "en-US", rate);
      } else if (mode === "enko") {
        renderAudioItem(w, true);
        await speakAsync(w.word, "en-US", rate);
        if (!alive()) return;
        await audioWait(1500); // 뜻을 떠올릴 시간
        if (!alive()) return;
        await speakAsync(w.meaning, "ko-KR", 1);
        if (!alive()) return;
        await speakAsync(w.word, "en-US", rate);
      } else { // enonly: 따라 말하기
        renderAudioItem(w, true);
        await speakAsync(w.word, "en-US", rate);
        if (!alive()) return;
        await audioWait(1800); // 따라 말할 시간
        if (!alive()) return;
        await speakAsync(w.word, "en-US", rate);
      }
      if (!alive()) return;
      audio.played += 1;
      await audioWait(1000);
      if (!alive()) return;
      audio.idx += 1;
    }
    if (audio && audio.token === token && audio.playing) {
      // 한 바퀴 완료
      audio.playing = false;
      releaseWake();
      flushAudioLog();
      awardXp(10);
      Store.save(state);
      toast("🎵 한 바퀴 완료! +10XP");
      $("btn-audio-play").textContent = "▶️ 처음부터";
      audio.idx = 0;
    }
  }

  function flushAudioLog() {
    if (!audio || audio.played === 0) return;
    Store.todayLog(state).actions += audio.played;
    audio.played = 0;
    Store.save(state);
  }

  function pauseAudio() {
    if (!audio) return;
    audio.playing = false;
    audio.token += 1;
    speechSynthesis.cancel();
    if (audio.timer) clearTimeout(audio.timer);
    releaseWake();
    flushAudioLog();
    $("btn-audio-play").textContent = "▶️ 재생";
  }

  function playAudio() {
    if (!audio) return;
    audio.playing = true;
    audio.token += 1;
    $("btn-audio-play").textContent = "⏸ 일시정지";
    requestWake();
    audioLoop(audio.token);
  }

  function audioSeek(delta) {
    if (!audio) return;
    const wasPlaying = audio.playing;
    audio.token += 1;
    speechSynthesis.cancel();
    if (audio.timer) clearTimeout(audio.timer);
    audio.idx = Math.min(Math.max(0, audio.idx + delta), audio.items.length - 1);
    renderAudioItem(audio.items[audio.idx], false);
    if (wasPlaying) audioLoop(audio.token);
  }

  $("btn-start-audio").addEventListener("click", startAudio);
  $("btn-audio-play").addEventListener("click", () => {
    if (!audio) return;
    if (audio.playing) pauseAudio();
    else playAudio();
  });
  $("btn-audio-prev").addEventListener("click", () => audioSeek(-1));
  $("btn-audio-next").addEventListener("click", () => audioSeek(1));
  $("btn-audio-exit").addEventListener("click", () => {
    pauseAudio();
    audio = null;
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
