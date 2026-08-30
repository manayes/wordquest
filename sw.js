// WordQuest 서비스워커: 설치형 앱 + 오프라인 지원
// 전략: 네트워크 우선(항상 최신), 실패 시 캐시(오프라인)로 대체
const CACHE = "wordquest-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  // 같은 사이트의 GET 요청만 처리 (Claude API, GitHub API 등 외부 요청은 그대로 통과)
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: false }))
  );
});
