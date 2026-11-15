// sw.js: lets Sukkiri open offline.
// To ship an update: change VERSION below, then upload the folder again.
const VERSION = "sukkiri-v1";
const FILES = ["./", "index.html", "style.css", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "data.js", "focus.js", "intro.js", "main.js", "parser.js", "plan.js", "progress.js", "reminders.js", "review.js", "sky.js", "string.js", "tasks.js", "ui.js"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Fonts: keep what we've fetched, refresh quietly.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(VERSION).then(cache =>
        cache.match(request).then(hit => {
          const fresh = fetch(request).then(response => { cache.put(request, response.clone()); return response; }).catch(() => hit);
          return hit || fresh;
        })
      )
    );
    return;
  }
  if (url.origin !== location.origin) return;

  // The page itself: newest when online, saved copy when not.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("index.html")));
    return;
  }
  // Everything else: the saved copy first, so it opens instantly.
  event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
