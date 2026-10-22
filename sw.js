/* 비밀번호 잠금 웹앱의 서비스 워커: 기기 안에 풀어 둔 화면 파일(app/…)을 내준다. 잠금 화면·묶음 파일은 그대로 인터넷에서. */
const FILES = 'byeolbit-pwa-files';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url), app = new URL('./app/', self.registration.scope).href;
  if (url.origin !== location.origin || !url.href.startsWith(app)) return;
  e.respondWith((async () => {
    let key = url.origin + url.pathname;
    if (key.endsWith('/')) key += 'index.html';
    const hit = await (await caches.open(FILES)).match(key);
    if (hit) return hit;
    // 아직 풀지 않았거나 지워졌으면 잠금 화면으로
    if (e.request.mode === 'navigate') return Response.redirect(new URL('./', self.registration.scope).href, 302);
    return new Response('', { status: 404 });
  })());
});
