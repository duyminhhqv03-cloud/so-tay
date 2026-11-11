/* Địa chỉ máy chủ Apps Script của Sổ tay (dán sau khi Triển khai → Ứng dụng web).
 * Chạy thử trên máy (node tools/mock-server.mjs) thì tự dùng máy chủ giả. */
window.SO_TAY_API = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  ? '/api'
  : 'https://script.google.com/macros/s/AKfycbx2Qm-y6FPv8OT8V_CtPKdvxSLSfII6klWqS6C5VuNKVeYtXHizJwlqy0hZT_sqIfrg9A/exec';
