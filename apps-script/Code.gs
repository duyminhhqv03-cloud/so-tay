/**
 * Sổ tay giáo viên – máy chủ Google Apps Script (riêng, không liên quan Toán Thầy Minh).
 *
 * Dữ liệu nằm trong Google Sheet chứa script này:
 *   Lop      – các lớp (nhánh HQV / DT)
 *   GhiChu   – nhật ký tiết dạy: đã dạy đến, HS vi phạm, cần nộp, ghi chú khác
 *   Viec     – việc cần làm (việc nhà trường…), có hạn
 *   HocSinh  – danh sách học sinh các lớp
 *   HocPhi   – học phí đã đóng: mỗi dòng = một học sinh đã đóng một tháng
 *
 * Chỉ một người dùng, đăng nhập bằng mật khẩu. Cài đặt: xem apps-script/HUONG-DAN.md.
 */

var TABLES = {
  classes:  { sheet: 'Lop',     cols: ['id', 'branch', 'name', 'order', 'hidden'] },
  notes:    { sheet: 'GhiChu',  cols: ['id', 'classId', 'date', 'taught', 'violations', 'homework', 'other', 'createdAt', 'updatedAt'] },
  tasks:    { sheet: 'Viec',    cols: ['id', 'text', 'due', 'done', 'classId', 'createdAt', 'doneAt'] },
  students: { sheet: 'HocSinh', cols: ['id', 'classId', 'name', 'order', 'note'] },
  fees:     { sheet: 'HocPhi',  cols: ['id', 'studentId', 'month', 'paidAt'] }
};

var DEFAULT_CLASSES = [
  ['hqv-6a1', 'HQV', '6A1'],
  ['hqv-6tc3', 'HQV', '6TC3'],
  ['hqv-7tc4', 'HQV', '7TC4'],
  ['hqv-7tc5', 'HQV', '7TC5'],
  ['dt-t7nsg', 'DT', 'Toán 7 NSG'],
  ['dt-t6nsg', 'DT', 'Toán 6 NSG'],
  ['dt-t7home', 'DT', 'Toán 7 Home'],
  ['dt-t6home', 'DT', 'Toán 6 Home'],
  ['dt-t9', 'DT', 'Toán 9'],
  ['dt-t9nc', 'DT', 'Toán 9NC']
];

var TOKEN_DAYS = 180;
var MAX_CELL = 20000;

/* ───────────── Chạy tay trong trình soạn Apps Script ───────────── */

/** Chạy một lần: tạo các trang tính, lớp mặc định và mật khẩu. Mật khẩu hiện trong Nhật ký thực thi. */
function setup() {
  for (var k in TABLES) sheet_(k);
  var cls = sheet_('classes');
  if (cls.getLastRow() < 2) {
    var rows = DEFAULT_CLASSES.map(function (c, i) { return [c[0], c[1], c[2], String(i + 1), '']; });
    cls.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PW_HASH')) {
    var pw = randomPassword_();
    setPassword_(pw);
    Logger.log('Mật khẩu Sổ tay: ' + pw + '  (vào app → Cài đặt để đổi)');
  } else {
    Logger.log('Đã có mật khẩu từ trước. Quên thì chạy hàm datLaiMatKhau.');
  }
}

/** Quên mật khẩu: chạy hàm này, mật khẩu mới hiện trong Nhật ký thực thi. Mọi máy sẽ phải đăng nhập lại. */
function datLaiMatKhau() {
  var pw = randomPassword_();
  setPassword_(pw);
  killAllTokens_();
  Logger.log('Mật khẩu Sổ tay mới: ' + pw);
}

/* ───────────── Cổng web ───────────── */

function doGet() {
  return ContentService.createTextOutput('Máy chủ Sổ tay đang hoạt động.');
}

function doPost(e) {
  var out;
  try {
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = handle_(p) || {};
    out.ok = true;
  } catch (err) {
    out = { ok: false, code: err.code || 500, error: err.userFacing ? err.message : 'Lỗi máy chủ: ' + (err && err.message) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(p) {
  var action = String(p.action || '');
  if (action === 'login') return login_(String(p.password || ''));
  checkToken_(p.token);
  switch (action) {
    case 'logout': revokeToken_(p.token); return {};
    case 'load': return { data: loadAll_() };
    case 'ops': return withLock_(function () { return applyOps_(p.ops); });
    case 'changePassword': return changePassword_(p);
  }
  throw err_('Yêu cầu không hợp lệ.', 400);
}

/* ───────────── Dữ liệu ───────────── */

function sheet_(table) {
  var t = TABLES[table];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(t.sheet);
  if (!sh) {
    sh = ss.insertSheet(t.sheet);
    sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  // Giữ mọi ô ở dạng chữ để Sheets không tự đổi ngày/số
  sh.getRange(1, 1, sh.getMaxRows(), t.cols.length).setNumberFormat('@');
  return sh;
}

function readTable_(table) {
  var t = TABLES[table];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(t.sheet) || sheet_(table);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var vals = sh.getRange(2, 1, n, t.cols.length).getDisplayValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!vals[i][0]) continue;
    var o = {};
    for (var j = 0; j < t.cols.length; j++) o[t.cols[j]] = vals[i][j];
    out.push(o);
  }
  return out;
}

function writeTable_(table, rows) {
  var t = TABLES[table];
  var sh = sheet_(table);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, t.cols.length).clearContent();
  if (!rows.length) return;
  var vals = rows.map(function (r) {
    return t.cols.map(function (c) { return r[c] == null ? '' : String(r[c]); });
  });
  if (sh.getMaxRows() < vals.length + 1) sh.insertRowsAfter(sh.getMaxRows(), vals.length + 1 - sh.getMaxRows());
  var range = sh.getRange(2, 1, vals.length, t.cols.length);
  range.setNumberFormat('@');
  range.setValues(vals);
}

function loadAll_() {
  var d = {};
  for (var k in TABLES) d[k] = readTable_(k);
  return d;
}

/** ops: [{t:'put', table, row}, {t:'del', table, id}] — áp dụng theo thứ tự, ghi mỗi bảng một lần. */
function applyOps_(ops) {
  if (!ops || !ops.length) return { applied: 0 };
  if (ops.length > 500) throw err_('Quá nhiều thay đổi một lúc.', 400);
  var cache = {};
  function tbl(name) {
    if (!TABLES[name]) throw err_('Bảng không hợp lệ: ' + name, 400);
    if (!cache[name]) cache[name] = readTable_(name);
    return cache[name];
  }
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i] || {};
    var rows = tbl(String(op.table || ''));
    var cols = TABLES[op.table].cols;
    if (op.t === 'put') {
      var src = op.row || {};
      var id = String(src.id || '');
      if (!id || id.length > 100) throw err_('Thiếu mã dòng.', 400);
      var row = {};
      for (var j = 0; j < cols.length; j++) {
        var v = src[cols[j]];
        v = v == null ? '' : String(v);
        if (v.length > MAX_CELL) v = v.slice(0, MAX_CELL);
        row[cols[j]] = v;
      }
      var found = false;
      for (var r = 0; r < rows.length; r++) if (rows[r].id === id) { rows[r] = row; found = true; break; }
      if (!found) rows.push(row);
    } else if (op.t === 'del') {
      var did = String(op.id || '');
      for (var q = rows.length - 1; q >= 0; q--) if (rows[q].id === did) rows.splice(q, 1);
    } else {
      throw err_('Thao tác không hợp lệ.', 400);
    }
  }
  for (var name in cache) writeTable_(name, cache[name]);
  return { applied: ops.length };
}

/* ───────────── Đăng nhập ───────────── */

function login_(pw) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('fails') || 0);
  if (fails >= 10) throw err_('Sai mật khẩu quá nhiều lần. Đợi 15 phút rồi thử lại.', 429);
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('PW_SALT') || '';
  var hash = props.getProperty('PW_HASH');
  if (!hash) throw err_('Máy chủ chưa cài đặt. Chạy hàm setup trong Apps Script.', 500);
  if (sha_(salt + pw) !== hash) {
    cache.put('fails', String(fails + 1), 900);
    throw err_('Sai mật khẩu.', 401);
  }
  cleanTokens_();
  var token = Utilities.getUuid() + Utilities.getUuid();
  props.setProperty('tk_' + sha_(token), String(Date.now() + TOKEN_DAYS * 864e5));
  return { token: token };
}

function checkToken_(token) {
  token = String(token || '');
  var exp = token ? PropertiesService.getScriptProperties().getProperty('tk_' + sha_(token)) : null;
  if (!exp || Number(exp) < Date.now()) throw err_('Phiên đăng nhập đã hết. Đăng nhập lại.', 401);
}

function revokeToken_(token) {
  PropertiesService.getScriptProperties().deleteProperty('tk_' + sha_(String(token || '')));
}

function changePassword_(p) {
  var oldPw = String(p.oldPassword || ''), newPw = String(p.newPassword || '');
  var props = PropertiesService.getScriptProperties();
  if (sha_((props.getProperty('PW_SALT') || '') + oldPw) !== props.getProperty('PW_HASH')) throw err_('Mật khẩu cũ không đúng.', 400);
  if (newPw.length < 6) throw err_('Mật khẩu mới cần ít nhất 6 ký tự.', 400);
  setPassword_(newPw);
  return {};
}

function setPassword_(pw) {
  var salt = Utilities.getUuid();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PW_SALT', salt);
  props.setProperty('PW_HASH', sha_(salt + pw));
}

function cleanTokens_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties(), now = Date.now();
  for (var k in all) if (k.indexOf('tk_') === 0 && Number(all[k]) < now) props.deleteProperty(k);
}

function killAllTokens_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  for (var k in all) if (k.indexOf('tk_') === 0) props.deleteProperty(k);
}

/* ───────────── Tiện ích ───────────── */

function sha_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('');
}

function randomPassword_() {
  var abc = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < 8; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw err_('Máy chủ đang bận, thử lại sau ít giây.', 503);
  try { return fn(); } finally { lock.releaseLock(); }
}

function err_(msg, code) {
  var e = new Error(msg);
  e.code = code || 400;
  e.userFacing = true;
  return e;
}
