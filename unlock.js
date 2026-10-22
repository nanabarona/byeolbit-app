/* 비밀번호로 잠근 웹앱(PWA): 암호화된 화면 묶음(bundle.enc)을 이 기기에서 풀어 저장하고 연다.
 * - 암호: 비밀번호 → PBKDF2(SHA-256) → AES-256-GCM. 비밀번호 없이는 묶음을 읽을 수 없다.
 * - 푼 화면 파일은 이 기기의 Cache Storage 에 넣고, sw.js 가 app/ 주소로 내준다(오프라인에서도 열림).
 * - 한 번 맞히면 풀이 열쇠를 이 기기에 기억해, 다음부터는 묻지 않고 새 화면도 알아서 받는다.
 * 이 파일은 공개되어도 된다(비밀은 비밀번호뿐). */
window.Unlock = (() => {
  const FILES = 'byeolbit-pwa-files', KEY = 'byeolbit.pwa.key', BUILD = 'byeolbit.pwa.build';
  const MIME = { html: 'text/html; charset=utf-8', js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', ogg: 'audio/ogg', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8' };
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const enc = u8 => btoa(String.fromCharCode(...u8));
  const base = new URL('./', document.currentScript ? document.currentScript.src : location.href); // 잠금 화면이 있는 곳
  const appUrl = new URL('app/index.html', base);

  async function bundle() {
    const r = await fetch(new URL('bundle.enc', base), { cache: 'no-store' });
    if (!r.ok) throw Error('bundle ' + r.status);
    return r.json();
  }
  async function deriveRaw(pw, b) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFC').trim()), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64(b.salt), iterations: b.iter, hash: 'SHA-256' }, k, 256));
  }
  async function open(raw, b) {
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(b.iv) }, key, b64(b.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function install(p) {
    await caches.delete(FILES);
    const c = await caches.open(FILES);
    const put = (path, body) => c.put(new URL('app/' + path, base).href, new Response(body, { headers: { 'Content-Type': MIME[path.split('.').pop().toLowerCase()] || 'application/octet-stream' } }));
    await Promise.all([
      ...Object.entries(p.files || {}).map(([k, v]) => put(k, v)),
      ...Object.entries(p.bin || {}).map(([k, v]) => put(k, b64(v))),
    ]);
    try { localStorage.setItem(BUILD, p.build); } catch { }
  }
  const savedKey = () => { try { const s = localStorage.getItem(KEY); return s ? b64(s) : null; } catch { return null; } };
  const saveKey = raw => { try { localStorage.setItem(KEY, enc(raw)); } catch { } };
  async function hasApp() { try { return !!(await (await caches.open(FILES)).match(appUrl.href)); } catch { return false; } }
  async function sw() {
    if (!('serviceWorker' in navigator)) throw Error('이 브라우저는 앱 저장(서비스 워커)을 지원하지 않아요.');
    await navigator.serviceWorker.register(new URL('sw.js', base).href, { scope: base.href });
    await navigator.serviceWorker.ready;
  }

  /* 잠금 화면에서 */
  async function boot() {
    const $ = id => document.getElementById(id);
    const say = (t, bad) => { $('msg').textContent = t; $('msg').classList.toggle('bad', !!bad); };
    const go = () => location.replace(appUrl.href + location.search);
    let b = null;
    try { await sw(); } catch (e) { say(e.message, true); return; }
    try { b = await bundle(); } catch {
      if (await hasApp()) return go();          // 인터넷이 없어도 이미 푼 화면이 있으면 연다
      say('화면을 받지 못했어요. 인터넷 연결을 확인해 주세요.', true); return;
    }
    const raw = savedKey();
    if (raw) {
      try {
        if (localStorage.getItem(BUILD) !== b.build || !(await hasApp())) await install(await open(raw, b));
        return go();
      } catch { try { localStorage.removeItem(KEY); } catch { } say('비밀번호가 바뀌었어요. 새 비밀번호를 넣어 주세요.', true); }
    }
    $('f').hidden = false; $('pw').focus();
    $('f').onsubmit = async e => {
      e.preventDefault();
      const btn = $('f').querySelector('button'); btn.disabled = true; say('여는 중…');
      try {
        const k = await deriveRaw($('pw').value, b);
        const p = await open(k, b);
        saveKey(k); await install(p); say('열렸어요!'); go();
      } catch { say('비밀번호가 맞지 않아요. 다시 넣어 주세요.', true); btn.disabled = false; $('pw').select(); }
    };
  }

  /* 앱 화면 안에서: 새 묶음이 올라왔으면 조용히 받아 두었다가 다음에 열 때 바꾼다 */
  async function refresh() {
    try {
      const raw = savedKey(); if (!raw) return;
      const b = await bundle();
      if (localStorage.getItem(BUILD) === b.build) return;
      await install(await open(raw, b));
      if (window.StarUpdated) window.StarUpdated(); // 보던 화면이 없으면 바로 새 화면으로(main.js)
    } catch { }
  }
  return { boot, refresh };
})();
