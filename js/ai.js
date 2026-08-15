// Claude API 연동: 니모닉(연상법), 맞춤 예문, 변형 퀴즈 생성
// 브라우저에서 직접 호출 (anthropic-dangerous-direct-browser-access 헤더 사용)

const AI = (() => {
  const API_URL = "https://api.anthropic.com/v1/messages";

  function config(state) {
    return state.settings.ai || {};
  }

  function configured(state) {
    return !!(config(state).apiKey);
  }

  // Claude API 호출 후 JSON 응답 파싱 (structured outputs 사용)
  async function request(state, systemPrompt, userPrompt, schema, maxTokens) {
    const { apiKey, model } = config(state);
    if (!apiKey) throw new Error("API 키가 설정되지 않았습니다.");

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: model || "claude-opus-5",
        max_tokens: maxTokens,
        system: systemPrompt,
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema },
        },
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const msg = err && err.error ? err.error.message : `HTTP ${res.status}`;
      if (res.status === 401) throw new Error("API 키가 올바르지 않습니다. AI 설정을 확인해주세요.");
      if (res.status === 429) throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
      throw new Error(`API 오류: ${msg}`);
    }

    const data = await res.json();
    if (data.stop_reason === "refusal") throw new Error("AI가 이 요청을 처리할 수 없습니다.");
    const textBlock = (data.content || []).find(b => b.type === "text");
    if (!textBlock) throw new Error("AI 응답이 비어 있습니다.");
    return JSON.parse(textBlock.text);
  }

  // ---------- 니모닉(연상법) 생성 ----------
  async function generateMnemonic(state, word) {
    const schema = {
      type: "object",
      properties: { mnemonic: { type: "string" } },
      required: ["mnemonic"],
      additionalProperties: false,
    };
    const result = await request(
      state,
      "당신은 한국인 학습자의 영어 단어 암기를 돕는 선생님입니다. " +
      "단어를 쉽게 기억할 수 있는 연상법(니모닉)을 한국어로 만들어주세요. " +
      "발음 유사 연상, 어원 분해, 짧은 스토리 중 이 단어에 가장 효과적인 방법을 골라 " +
      "2~3문장으로 간결하고 재미있게 작성하세요.",
      `단어: ${word.word}\n발음: ${word.ipa || "없음"}\n뜻: ${word.meaning}`,
      schema,
      1024
    );
    return result.mnemonic;
  }

  // ---------- 맞춤 예문 생성 ----------
  async function generateExamples(state, word) {
    const interest = config(state).interest || "일상";
    const schema = {
      type: "object",
      properties: {
        examples: {
          type: "array",
          items: {
            type: "object",
            properties: { en: { type: "string" }, ko: { type: "string" } },
            required: ["en", "ko"],
            additionalProperties: false,
          },
        },
      },
      required: ["examples"],
      additionalProperties: false,
    };
    const result = await request(
      state,
      "당신은 영어 교육 전문가입니다. 학습자가 단어를 문맥 속에서 기억할 수 있도록 " +
      `'${interest}' 주제와 관련된 자연스러운 예문 2개를 만들어주세요. ` +
      "각 예문은 해당 단어의 주어진 뜻으로 사용해야 하며, 중급 학습자가 이해할 수 있는 수준이어야 합니다. " +
      "한국어 번역도 함께 제공하세요.",
      `단어: ${word.word}\n뜻: ${word.meaning}`,
      schema,
      1500
    );
    return result.examples;
  }

  // ---------- 변형 퀴즈 생성 (자주 틀리는 단어) ----------
  async function generateQuizQuestions(state, words) {
    const schema = {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              word: { type: "string" },
              sentence: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              answer: { type: "string" },
            },
            required: ["word", "sentence", "options", "answer"],
            additionalProperties: false,
          },
        },
      },
      required: ["questions"],
      additionalProperties: false,
    };
    const list = words.map(w => `- ${w.word}: ${w.meaning} (기존 예문: ${w.example || "없음"})`).join("\n");
    const result = await request(
      state,
      "당신은 영어 시험 출제 전문가입니다. 각 단어에 대해 빈칸 채우기 문제를 만들어주세요. " +
      "규칙: (1) 기존 예문과 완전히 다른 새로운 영어 문장을 만들 것, " +
      "(2) 빈칸은 '____'로 표시하고 정답 단어가 들어갈 것, " +
      "(3) options는 정답 1개 + 그럴듯한 오답 3개, 총 4개의 영어 단어일 것, " +
      "(4) answer는 options 중 정답과 정확히 일치할 것.",
      `다음 단어들의 문제를 만들어주세요:\n${list}`,
      schema,
      2500
    );
    return result.questions;
  }

  // ---------- 텍스트 응답 호출 (회화용, JSON 아님) ----------
  async function chatRaw(state, systemPrompt, messages, maxTokens) {
    const { apiKey, model } = config(state);
    if (!apiKey) throw new Error("API 키가 설정되지 않았습니다.");
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: model || "claude-opus-5",
        max_tokens: maxTokens,
        system: systemPrompt,
        output_config: { effort: "low" },
        messages,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const msg = err && err.error ? err.error.message : `HTTP ${res.status}`;
      if (res.status === 401) throw new Error("API 키가 올바르지 않습니다. AI 설정을 확인해주세요.");
      if (res.status === 429) throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
      throw new Error(`API 오류: ${msg}`);
    }
    const data = await res.json();
    if (data.stop_reason === "refusal") throw new Error("AI가 이 요청을 처리할 수 없습니다.");
    const textBlock = (data.content || []).find(b => b.type === "text");
    if (!textBlock) throw new Error("AI 응답이 비어 있습니다.");
    return textBlock.text.trim();
  }

  // ---------- AI 회화: 한 턴 진행 ----------
  async function talkTurn(state, targetWords, history) {
    const interest = config(state).interest || "일상";
    const wordList = targetWords.map(w => `${w.word} (${w.meaning})`).join(", ");
    const system =
      "You are a friendly English conversation partner helping a Korean intermediate learner practice. " +
      `Topic area: ${interest}. The learner is currently studying these words: ${wordList}. ` +
      "Rules: (1) Keep each reply to 2-3 short, simple sentences. " +
      "(2) Always end with one easy question to keep the conversation going. " +
      "(3) Naturally use the target words yourself and create openings for the learner to use them. " +
      "(4) Do NOT correct the learner's mistakes during the conversation. " +
      "(5) Be warm, casual, and encouraging. English only.";
    // 최근 12개 메시지만 전송 (비용 절약)
    const trimmed = history.slice(-12);
    return chatRaw(state, system, trimmed, 400);
  }

  // ---------- AI 회화: 종료 후 교정 리포트 ----------
  async function correctionReport(state, sentences) {
    const schema = {
      type: "object",
      properties: {
        corrections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              original: { type: "string" },
              better: { type: "string" },
              note: { type: "string" },
            },
            required: ["original", "better", "note"],
            additionalProperties: false,
          },
        },
        comment: { type: "string" },
      },
      required: ["corrections", "comment"],
      additionalProperties: false,
    };
    return request(
      state,
      "당신은 다정한 영어 선생님입니다. 학습자가 영어 대화에서 쓴 문장들을 검토해주세요. " +
      "개선이 필요한 문장만 골라(최대 5개) original(원문), better(더 자연스러운 표현), note(한국어 한 줄 설명)로 정리하세요. " +
      "완벽한 문장은 corrections에 넣지 마세요. comment에는 잘한 점을 포함한 전체 총평을 한국어 1~2문장으로 써주세요.",
      "학습자의 문장들:\n" + sentences.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      schema,
      2000
    );
  }

  // ---------- 영작 연습: 문제 생성 ----------
  async function makeWritingItems(state, words) {
    const interest = config(state).interest || "일상";
    const schema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { word: { type: "string" }, ko: { type: "string" } },
            required: ["word", "ko"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    };
    const list = words.map(w => `- ${w.word}: ${w.meaning}`).join("\n");
    return (await request(
      state,
      "당신은 영작 문제 출제자입니다. 각 영어 단어에 대해, 학습자가 그 단어를 사용해 영어로 옮길 " +
      `자연스러운 한국어 문장을 1개씩 만들어주세요. '${interest}' 상황을 활용하세요. ` +
      "조건: (1) 해당 단어의 주어진 뜻이 문장에 반드시 반영될 것, " +
      "(2) 영어로 옮기면 8~14단어 수준의 문장일 것, (3) 한국어 문장에 영어 단어를 쓰지 말 것.",
      `단어 목록:\n${list}`,
      schema,
      1500
    )).items;
  }

  // ---------- 영작 연습: 채점 ----------
  async function gradeWriting(state, word, koSentence, answer) {
    const schema = {
      type: "object",
      properties: {
        result: { type: "string", enum: ["good", "ok", "wrong"] },
        corrected: { type: "string" },
        note: { type: "string" },
      },
      required: ["result", "corrected", "note"],
      additionalProperties: false,
    };
    return request(
      state,
      "당신은 다정하지만 정확한 영작 채점자입니다. 학습자가 한국어 문장을 영어로 옮겼습니다. " +
      "채점 기준 - good: 목표 단어를 사용했고 자연스럽고 정확함 / " +
      "ok: 의미는 통하지만 어색하거나 사소한 오류가 있음 / " +
      "wrong: 문법·의미 오류가 크거나 목표 단어를 쓰지 않음. " +
      "corrected에는 가장 자연스러운 모범 영문을, note에는 한국어 1~2문장의 구체적 피드백을 써주세요.",
      `목표 단어: ${word.word} (${word.meaning})\n한국어 문장: ${koSentence}\n학습자의 영작: ${answer}`,
      schema,
      1000
    );
  }

  return {
    configured, generateMnemonic, generateExamples, generateQuizQuestions,
    talkTurn, correctionReport, makeWritingItems, gradeWriting,
  };
})();
