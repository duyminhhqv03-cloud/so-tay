/* Mở Sổ tay nhanh: lấy ngay bản đã lưu trên máy, đồng thời tải bản mới ở nền cho lần mở sau.
 * Mất mạng vẫn mở được. Các file có ?v= nên đổi phiên bản là tải file mới ngay. */
var CACHE = 'so-tay-v2';
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // Cùng tên miền với Toán Thầy Minh (bộ nhớ đệm dùng chung) → chỉ xóa bản cũ của Sổ tay
    return Promise.all(keys.filter(function (k) { return k.indexOf('so-tay-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  var key = req.mode === 'navigate' ? './' : req;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(key).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) c.put(key, res.clone());
        return res;
      });
      if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
      return net;
    });
  }));
});
