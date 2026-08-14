// 학습 기록 동기화: GitHub Gist(비공개)에 백업/복원
// 토큰/API 키 같은 민감 정보는 백업에서 제외됨

const Sync = (() => {
  const API = "https://api.github.com";
  const FILE = "wordquest-data.json";

  function config(state) { return state.settings.sync || {}; }
  function configured(state) { return !!config(state).token; }

  async function gh(state, method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: {
        "Authorization": "Bearer " + config(state).token,
        "Accept": "application/vnd.github+json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) throw new Error("GitHub 토큰이 올바르지 않습니다.");
    if (res.status === 404) throw new Error("백업(Gist)을 찾을 수 없습니다.");
    if (!res.ok) throw new Error(`GitHub API 오류 (HTTP ${res.status})`);
    return res.json();
  }

  // 백업본에서 민감 정보 제거
  function exportData(state) {
    const data = JSON.parse(JSON.stringify(state));
    if (data.settings) {
      delete data.settings.sync;
      if (data.settings.ai) delete data.settings.ai.apiKey;
    }
    return data;
  }

  // 백업 (gist가 없으면 새로 생성하고 config에 id 기록)
  async function push(state) {
    const content = JSON.stringify(exportData(state));
    const cfg = config(state);
    if (cfg.gistId) {
      try {
        await gh(state, "PATCH", "/gists/" + cfg.gistId, { files: { [FILE]: { content } } });
        return cfg.gistId;
      } catch (e) {
        if (!e.message.includes("찾을 수 없습니다")) throw e;
        cfg.gistId = ""; // 삭제된 gist → 새로 생성
      }
    }
    const created = await gh(state, "POST", "/gists", {
      description: "WordQuest 학습 기록 백업 (자동 생성)",
      public: false,
      files: { [FILE]: { content } },
    });
    cfg.gistId = created.id;
    return created.id;
  }

  // 내 계정의 gist 목록에서 기존 백업 찾기 (새 기기에서 토큰만 넣으면 연결되도록)
  async function findExisting(state) {
    const gists = await gh(state, "GET", "/gists?per_page=100");
    const found = gists.find(g => g.files && g.files[FILE]);
    return found ? found.id : null;
  }

  // 복원 (원격 상태 JSON 반환, 없으면 null)
  async function pull(state) {
    const cfg = config(state);
    if (!cfg.gistId) return null;
    const gist = await gh(state, "GET", "/gists/" + cfg.gistId);
    const file = gist.files && gist.files[FILE];
    if (!file) return null;
    let content = file.content;
    if (file.truncated) {
      const raw = await fetch(file.raw_url);
      content = await raw.text();
    }
    return JSON.parse(content);
  }

  return { config, configured, push, pull, findExisting };
})();
