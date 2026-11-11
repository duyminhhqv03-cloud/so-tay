/* Địa chỉ máy chủ Apps Script của Sổ tay (dán sau khi Triển khai → Ứng dụng web).
 * Chạy thử trên máy (node tools/mock-server.mjs) thì tự dùng máy chủ giả. */
window.SO_TAY_API = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  ? '/api'
  : '';
