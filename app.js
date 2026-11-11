/* Sổ tay giáo viên – nhật ký tiết dạy, việc cần làm, học phí lớp dạy thêm.
 * Dữ liệu: tải hết về máy (lưu sẵn để mở khi mất mạng), mọi thay đổi xếp hàng rồi gửi lên máy chủ. */
(function () {
  'use strict';

  var API = window.SO_TAY_API || '';
  var P = window.SoTayParse;
  var LS = { token: 'st_token', data: 'st_data', outbox: 'st_outbox', synced: 'st_synced', draft: 'st_draft_' };
  var TABLE_NAMES = ['classes', 'notes', 'tasks', 'students', 'fees'];
  var BRANCH_LABEL = { HQV: 'HQV', DT: 'Dạy thêm' };

  var view = document.getElementById('view');
  var syncEl = document.getElementById('sync');

  /* ═════════ Lưu trên máy ═════════ */

  function lsGet(k, def) {
    try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  }
  function lsSet(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* đầy bộ nhớ: bỏ qua */ }
  }

  var token = lsGet(LS.token, null);
  var server = lsGet(LS.data, null) || emptyData();
  var outbox = lsGet(LS.outbox, []);
  var state = emptyData();
  var lastSynced = lsGet(LS.synced, 0);
  var sending = false, loading = false, lastError = '';

  function emptyData() { var d = {}; TABLE_NAMES.forEach(function (t) { d[t] = []; }); return d; }

  function applyOp(d, op) {
    var rows = d[op.table];
    if (!rows) return;
    if (op.t === 'put') {
      for (var i = 0; i < rows.length; i++) if (rows[i].id === op.row.id) { rows[i] = op.row; return; }
      rows.push(op.row);
    } else if (op.t === 'del') {
      for (var j = rows.length - 1; j >= 0; j--) if (rows[j].id === op.id) rows.splice(j, 1);
    }
  }

  function recompute() {
    state = JSON.parse(JSON.stringify(server));
    TABLE_NAMES.forEach(function (t) { if (!state[t]) state[t] = []; });
    outbox.forEach(function (op) { applyOp(state, op); });
  }

  function commit(ops, msg) {
    if (!ops.length) return;
    outbox = outbox.concat(ops);
    lsSet(LS.outbox, outbox);
    recompute();
    render(true);
    if (msg) toast(msg);
    flush();
  }

  /* ═════════ Máy chủ ═════════ */

  function api(action, params) {
    if (!API) return Promise.reject(httpErr('Chưa có địa chỉ máy chủ (SO_TAY_API trong config.js).', 0));
    var body = Object.assign({ action: action, token: token }, params || {});
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .catch(function () { throw httpErr('Không kết nối được máy chủ.', 0); })
      .then(function (res) { return res.json().catch(function () { throw httpErr('Máy chủ trả về dữ liệu lạ.', 500); }); })
      .then(function (data) {
        if (!data.ok) {
          if (data.code === 401 && action !== 'login') { token = null; lsSet(LS.token, null); render(true); }
          throw httpErr(data.error || 'Có lỗi xảy ra.', data.code || 500);
        }
        return data;
      });
  }
  function httpErr(msg, code) { var e = new Error(msg); e.code = code; return e; }

  function load() {
    if (!token || loading) return Promise.resolve();
    loading = true; showSync();
    return api('load').then(function (res) {
      server = res.data || emptyData();
      lsSet(LS.data, server);
      lastSynced = Date.now(); lsSet(LS.synced, lastSynced);
      lastError = '';
      recompute();
      render(false);
    }).catch(function (e) { lastError = e.message; }).then(function () { loading = false; showSync(); });
  }

  var retryTimer = null;
  function flush() {
    if (!token || sending || !outbox.length) { showSync(); return; }
    sending = true; showSync();
    var batch = outbox.slice(0, 200);
    api('ops', { ops: batch }).then(function () {
      batch.forEach(function (op) { applyOp(server, op); });
      outbox = outbox.slice(batch.length);
      lsSet(LS.outbox, outbox); lsSet(LS.data, server);
      lastSynced = Date.now(); lsSet(LS.synced, lastSynced);
      lastError = '';
      sending = false;
      flush();
    }).catch(function (e) {
      sending = false;
      lastError = e.message;
      if (e.code >= 400 && e.code < 500 && e.code !== 401 && e.code !== 429) {
        // Thay đổi bị máy chủ từ chối hẳn → bỏ để không kẹt hàng chờ
        outbox = outbox.slice(batch.length); lsSet(LS.outbox, outbox);
        recompute(); render(true);
        toast('Máy chủ từ chối một thay đổi: ' + e.message);
      } else {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(flush, 20000);
      }
      showSync();
    });
  }

  window.addEventListener('online', function () { flush(); });
  window.addEventListener('offline', showSync);
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    flush();
    if (Date.now() - hiddenAt > 60000 && !outbox.length) load();
  });

  function showSync() {
    var txt, cls = 'sync';
    if (!token) txt = '';
    else if (!navigator.onLine) { txt = 'Ngoại tuyến' + (outbox.length ? ' · ' + outbox.length + ' chờ gửi' : ''); cls += ' warn'; }
    else if (sending || loading) txt = 'Đang đồng bộ…';
    else if (outbox.length) { txt = outbox.length + ' chờ gửi'; cls += ' warn'; }
    else if (lastError) { txt = 'Lỗi đồng bộ'; cls += ' warn'; }
    else txt = '✓ Đã lưu';
    syncEl.textContent = txt;
    syncEl.className = cls;
    syncEl.title = lastError || '';
  }

  /* ═════════ Tiện ích ═════════ */

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function parseYmd(s) { var a = String(s).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  var WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  function fmtDate(s) {
    if (!s) return '';
    var d = parseYmd(s);
    if (isNaN(d)) return s;
    var t = today();
    var lbl = s === t ? 'Hôm nay' : s === addDays(t, -1) ? 'Hôm qua' : s === addDays(t, 1) ? 'Ngày mai' : WD[d.getDay()];
    return lbl + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + (d.getFullYear() !== new Date().getFullYear() ? '/' + d.getFullYear() : '');
  }
  function nowIso() { return new Date().toISOString(); }

  function byId(table, id) {
    var rows = state[table];
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }
  function classesOf(branch) {
    return state.classes.filter(function (c) { return !c.hidden && (!branch || c.branch === branch); })
      .sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
  }
  function className(id) { var c = byId('classes', id); return c ? c.name : ''; }
  function homework(note) {
    try { var a = JSON.parse(note.homework || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function notesOf(classId) {
    return state.notes.filter(function (n) { return n.classId === classId; }).sort(noteSort);
  }
  function noteSort(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
  }
  function studentsOf(classId) {
    return state.students.filter(function (s) { return s.classId === classId; }).sort(function (a, b) {
      return (Number(a.order) || 0) - (Number(b.order) || 0) || a.name.localeCompare(b.name, 'vi');
    });
  }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  function modal(title, body, buttons) {
    var back = h('div', { class: 'modal-back' });
    function close() { if (back.parentNode) back.parentNode.removeChild(back); stopMic(); }
    var box = h('div', { class: 'modal', role: 'dialog', 'aria-label': title },
      h('h2', null, title), body,
      h('div', { class: 'modal-btns' }, (buttons || [{ label: 'Đóng' }]).map(function (b) {
        return h('button', { class: 'btn ' + (b.cls || ''), onclick: function () { if (!b.onClick || b.onClick() !== false) close(); } }, b.label);
      })));
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.appendChild(box);
    document.body.appendChild(back);
    return close;
  }

  function confirmBox(msg, okLabel, onOk) {
    modal('Xác nhận', h('p', null, msg), [{ label: 'Thôi' }, { label: okLabel, cls: 'danger', onClick: onOk }]);
  }

  function autoGrow(ta) {
    function fit() { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 44) + 'px'; }
    ta.addEventListener('input', fit);
    setTimeout(fit, 0);
    return ta;
  }

  /* ═════════ Nói thành chữ ═════════ */

  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var mic = null;   // phiên nghe đang chạy: { r, btn, finish }
  var MIC_MAX_MS = 30000;

  /** Dừng phiên nghe. iPhone đôi khi không báo "đã dừng" → tự hủy hẳn sau 1,5 giây. */
  function stopMic() {
    var m = mic;
    if (!m) return;
    try { m.r.stop(); } catch (e) { /* bỏ qua */ }
    setTimeout(function () {
      if (mic !== m) return;
      try { m.r.abort(); } catch (e) { /* bỏ qua */ }
      m.finish();
    }, 1500);
  }

  /** Ghép kết quả nhận dạng. Safari trên iPhone hay gửi lại cả câu từ đầu (câu sau chứa câu trước)
   * → thay thế thay vì cộng dồn, để chữ không bị nhân lên làm treo app. */
  function joinResults(results) {
    var finals = [], interim = '';
    for (var i = 0; i < results.length; i++) {
      var t = String(results[i][0] && results[i][0].transcript || '').trim();
      if (!t) continue;
      if (!results[i].isFinal) { interim = t; continue; }
      var last = finals[finals.length - 1];
      if (last && t.indexOf(last) === 0) finals[finals.length - 1] = t;
      else if (!last || last.indexOf(t) !== 0) finals.push(t);
    }
    var fin = finals.join(' ');
    if (interim && fin && interim.indexOf(fin) === 0) interim = interim.slice(fin.length).trim();
    return { fin: fin, interim: interim };
  }

  /** Nút micro: nghe tiếng Việt rồi chèn chữ vào ô target (hoặc gọi onText). */
  function micBtn(target, onText) {
    var btn = h('button', { type: 'button', class: 'mic', 'aria-label': 'Nói để nhập chữ', title: 'Nói để nhập chữ' }, '🎤');
    btn.addEventListener('click', function () {
      if (mic) { stopMic(); return; }   // đang nghe (ở nút này hay nút khác) → bấm lần nữa là dừng
      if (!Rec) {
        if (target) target.focus();
        toast('Máy này chưa cho nói trong trang. Bấm vào ô rồi dùng nút 🎤 trên bàn phím.');
        return;
      }
      var r;
      try { r = new Rec(); } catch (e0) { toast('Không mở được micro.'); return; }
      r.lang = 'vi-VN';
      r.interimResults = true;
      r.continuous = false;          // iPhone ổn định hơn: nói xong một câu tự dừng, muốn nói tiếp thì bấm lại
      r.maxAlternatives = 1;
      var base = target ? target.value : '';
      var sep = base && !/\s$/.test(base) ? ' ' : '';
      var last = { fin: '', interim: '' };
      var done = false, paint = null, maxTimer = null;

      function show(withInterim) {
        if (!target) return;
        var txt = last.fin + (withInterim && last.interim ? (last.fin ? ' ' : '') + last.interim : '');
        target.value = base + (txt ? sep + txt : '');
        target.dispatchEvent(new Event('input'));
      }
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(paint); clearTimeout(maxTimer);
        r.onresult = r.onerror = r.onend = null;
        btn.classList.remove('on');
        if (mic && mic.r === r) mic = null;
        if (!last.fin && last.interim) last.fin = last.interim;   // iPhone đôi khi không trả kết quả "chốt"
        last.interim = '';
        show(false);
        if (onText && last.fin) onText(last.fin);
      }

      r.onresult = function (ev) {
        last = joinResults(ev.results);
        if (!paint) paint = setTimeout(function () { paint = null; if (!done) show(true); }, 120);
      };
      r.onerror = function (ev) {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast('Chưa được phép dùng micro. Vào Cài đặt → Safari → Micrô → Cho phép, hoặc dùng 🎤 trên bàn phím.');
        else if (ev.error === 'no-speech') toast('Chưa nghe thấy gì, thầy bấm 🎤 nói lại nhé.');
        else if (ev.error !== 'aborted') toast('Lỗi micro: ' + ev.error);
        finish();
      };
      r.onend = finish;

      try { r.start(); } catch (e) { toast('Không mở được micro, thử lại sau giây lát.'); return; }
      mic = { r: r, btn: btn, finish: finish };
      btn.classList.add('on');
      maxTimer = setTimeout(stopMic, MIC_MAX_MS);
    });
    return btn;
  }

  function field(label, ta) {
    return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), h('div', { class: 'with-mic' }, ta, micBtn(ta)));
  }

  /* ═════════ Đăng nhập ═════════ */

  function viewLogin() {
    // Có ô tên đăng nhập (chỉ đọc) để Chuỗi khóa iCloud / trình duyệt nhận ra và đề nghị lưu, tự điền mật khẩu
    var user = h('input', { type: 'text', name: 'username', id: 'st-user', autocomplete: 'username', value: 'so-tay', readonly: true, 'aria-label': 'Tài khoản' });
    var pw = h('input', { type: 'password', name: 'password', id: 'st-pass', placeholder: 'Mật khẩu', autocomplete: 'current-password' });
    var msg = h('p', { class: 'err' });
    var btn = h('button', { class: 'btn primary', type: 'submit' }, 'Mở sổ tay');
    var form = h('form', { class: 'login card', method: 'post', action: '#', onsubmit: function (e) {
      e.preventDefault();
      btn.disabled = true; msg.textContent = '';
      api('login', { password: pw.value }).then(function (res) {
        token = res.token; lsSet(LS.token, token);
        try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e3) { /* bỏ qua */ }
        render(true); load(); flush();
      }).catch(function (e2) { msg.textContent = e2.message; btn.disabled = false; });
    } }, h('h1', null, '📒 Sổ tay'), h('p', { class: 'muted' }, 'Nhật ký tiết dạy, việc cần làm và học phí.'),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Tài khoản'), user),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Mật khẩu'), pw), btn, msg,
      h('p', { class: 'muted small' }, 'Đăng nhập một lần là máy nhớ 180 ngày. Khi iPhone hỏi “Lưu mật khẩu?”, bấm Lưu để lần sau tự điền.'));
    setTimeout(function () { pw.focus(); }, 50);
    return form;
  }

  /* ═════════ Hôm nay ═════════ */

  function viewHome() {
    var t = today();
    var soon = addDays(t, 3);
    var urgent = state.tasks.filter(function (x) { return !x.done && x.due && x.due <= soon; }).sort(taskSort);
    var recent = state.notes.slice().sort(noteSort).slice(0, 6);
    var d = new Date();
    return h('div', null,
      h('h1', { class: 'page-title' }, ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][d.getDay()] + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1)),
      h('a', { class: 'btn primary big', href: '#/chonlop' }, '✏️ Ghi tiết dạy'),
      h('section', null,
        h('div', { class: 'sec-head' }, h('h2', null, 'Việc cần chú ý'), h('a', { href: '#/viec' }, 'Tất cả việc')),
        urgent.length ? h('div', { class: 'card list' }, urgent.map(taskRow)) : h('p', { class: 'muted' }, 'Không có việc nào quá hạn hay sắp tới hạn trong 3 ngày.'),
        quickTask()),
      h('section', null,
        h('h2', null, 'Ghi chú gần đây'),
        recent.length ? recent.map(function (n) { return noteCard(n, true); }) : h('p', { class: 'muted' }, 'Chưa có ghi chú nào.')));
  }

  function viewChooseClass() {
    return h('div', null, h('h1', { class: 'page-title' }, 'Ghi tiết dạy lớp nào?'),
      ['HQV', 'DT'].map(function (b) {
        return h('section', null, h('h2', null, BRANCH_LABEL[b]),
          h('div', { class: 'chips big' }, classesOf(b).map(function (c) {
            return h('a', { class: 'chip', href: '#/ghi/moi?lop=' + encodeURIComponent(c.id) }, c.name);
          })));
      }));
  }

  /* ═════════ Lớp ═════════ */

  function viewClasses() {
    return h('div', null, h('h1', { class: 'page-title' }, 'Các lớp'),
      ['HQV', 'DT'].map(function (b) {
        return h('section', null, h('h2', null, BRANCH_LABEL[b]),
          h('div', { class: 'grid' }, classesOf(b).map(function (c) {
            var ns = notesOf(c.id);
            var last = ns[0];
            var pending = 0;
            ns.forEach(function (n) { homework(n).forEach(function (it) { if (!it.d) pending++; }); });
            return h('a', { class: 'card cls', href: '#/lop/' + encodeURIComponent(c.id) },
              h('div', { class: 'cls-name' }, c.name),
              h('div', { class: 'muted small' }, last ? fmtDate(last.date) + (last.taught ? ' · ' + last.taught.slice(0, 60) : '') : 'Chưa ghi tiết nào'),
              pending ? h('span', { class: 'badge' }, pending + ' việc cần nộp') : null);
          })));
      }));
  }

  function viewClass(id) {
    var c = byId('classes', id);
    if (!c) return h('p', null, 'Không tìm thấy lớp.');
    var ns = notesOf(id);
    var pend = [];
    ns.forEach(function (n) { homework(n).forEach(function (it, i) { if (!it.d) pend.push({ note: n, i: i, it: it }); }); });
    var tasks = state.tasks.filter(function (x) { return x.classId === id && !x.done; }).sort(taskSort);
    return h('div', null,
      h('div', { class: 'page-head' }, h('a', { class: 'back', href: '#/lop' }, '‹ Lớp'), h('h1', null, c.name),
        c.branch === 'DT' ? h('a', { class: 'link', href: '#/hocphi/' + encodeURIComponent(id) }, '💰 Học phí') : null),
      h('a', { class: 'btn primary big', href: '#/ghi/moi?lop=' + encodeURIComponent(id) }, '✏️ Ghi tiết mới'),
      ns[0] && ns[0].taught ? h('div', { class: 'card hint' }, h('b', null, 'Lần trước dạy đến: '), ns[0].taught, h('span', { class: 'muted small' }, ' (' + fmtDate(ns[0].date) + ')')) : null,
      pend.length ? h('section', null, h('h2', null, 'Cần nộp – chưa xong'),
        h('div', { class: 'card list' }, pend.map(function (p) {
          return h('label', { class: 'row check' },
            h('input', { type: 'checkbox', onchange: function () { toggleHomework(p.note, p.i); } }),
            h('span', { class: 'grow' }, p.it.t), h('span', { class: 'muted small' }, fmtDate(p.note.date)));
        }))) : null,
      tasks.length ? h('section', null, h('h2', null, 'Việc của lớp'), h('div', { class: 'card list' }, tasks.map(taskRow))) : null,
      h('section', null, h('h2', null, 'Nhật ký'),
        ns.length ? ns.map(function (n) { return noteCard(n, false); }) : h('p', { class: 'muted' }, 'Chưa có ghi chú nào cho lớp này.')));
  }

  function toggleHomework(note, i) {
    var hw = homework(note);
    if (!hw[i]) return;
    hw[i].d = !hw[i].d;
    var row = Object.assign({}, note, { homework: JSON.stringify(hw), updatedAt: nowIso() });
    commit([{ t: 'put', table: 'notes', row: row }]);
  }

  function noteCard(n, showClass) {
    var hw = homework(n);
    return h('div', { class: 'card note' },
      h('div', { class: 'note-head' },
        h('b', null, fmtDate(n.date)),
        showClass ? h('a', { class: 'tag', href: '#/lop/' + encodeURIComponent(n.classId) }, className(n.classId)) : null,
        h('a', { class: 'edit', href: '#/ghi/' + encodeURIComponent(n.id) }, 'Sửa')),
      n.taught ? h('p', null, h('span', { class: 'ico' }, '📘'), h('span', { class: 'pre' }, n.taught)) : null,
      n.violations ? h('p', { class: 'viol' }, h('span', { class: 'ico' }, '⚠️'), h('span', { class: 'pre' }, n.violations)) : null,
      hw.length ? h('div', { class: 'hw' }, h('span', { class: 'ico' }, '📝'), h('div', null, hw.map(function (it, i) {
        return h('label', { class: 'check' + (it.d ? ' done' : '') },
          h('input', { type: 'checkbox', checked: !!it.d, onchange: function () { toggleHomework(n, i); } }), ' ', it.t);
      }))) : null,
      n.other ? h('p', null, h('span', { class: 'ico' }, '💬'), h('span', { class: 'pre' }, n.other)) : null);
  }

  /* ═════════ Sửa ghi chú ═════════ */

  function viewNote(id, query) {
    var isNew = id === 'moi';
    var note = isNew ? null : byId('notes', id);
    if (!isNew && !note) return h('p', null, 'Không tìm thấy ghi chú (có thể đã xóa).');
    var draftKey = LS.draft + (isNew ? 'moi-' + (query.lop || '') : id);
    var draft = lsGet(draftKey, null);
    var src = draft || note || { classId: query.lop || '', date: today(), taught: '', violations: '', homework: '[]', other: '' };

    var date = h('input', { type: 'date', value: src.date || today() });
    var cls = h('select', null, h('option', { value: '' }, '— Chọn lớp —'), ['HQV', 'DT'].map(function (b) {
      return h('optgroup', { label: BRANCH_LABEL[b] }, classesOf(b).map(function (c) {
        return h('option', { value: c.id, selected: c.id === src.classId }, c.name);
      }));
    }));
    var taught = autoGrow(h('textarea', { rows: 2, placeholder: 'VD: Bài 5 – Phép cộng số nguyên, xong ví dụ 3', value: src.taught || '' }));
    var viol = autoGrow(h('textarea', { rows: 2, placeholder: 'VD: An nói chuyện, Bình quên vở', value: src.violations || '' }));
    var other = autoGrow(h('textarea', { rows: 2, placeholder: 'Ghi chú khác', value: src.other || '' }));
    var hw = [];
    try { hw = JSON.parse(src.homework || '[]'); } catch (e) { hw = []; }

    var hwList = h('div', { class: 'hw-edit' });
    function drawHw() {
      hwList.innerHTML = '';
      hw.forEach(function (it, i) {
        var inp = h('input', { type: 'text', value: it.t, oninput: function () { it.t = inp.value; saveDraft(); } });
        hwList.appendChild(h('div', { class: 'row' },
          h('input', { type: 'checkbox', checked: !!it.d, onchange: function (e) { it.d = e.target.checked; saveDraft(); } }),
          inp,
          h('button', { type: 'button', class: 'x', 'aria-label': 'Xóa', onclick: function () { hw.splice(i, 1); drawHw(); saveDraft(); } }, '✕')));
      });
    }
    drawHw();
    var newHw = h('input', { type: 'text', placeholder: 'VD: Nộp vở bài tập trang 45', enterkeyhint: 'done' });
    function addHw() {
      var v = newHw.value.trim();
      if (!v) return;
      // Nói/gõ nhiều mục cách nhau bằng dấu chấm phẩy hoặc xuống dòng
      v.split(/\s*[;\n]\s*/).forEach(function (x) { if (x) hw.push({ t: x, d: false }); });
      newHw.value = ''; drawHw(); saveDraft();
    }
    newHw.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addHw(); } });

    function collect() {
      if (newHw.value.trim()) addHw();
      return { classId: cls.value, date: date.value || today(), taught: taught.value.trim(), violations: viol.value.trim(), homework: JSON.stringify(hw.filter(function (x) { return x.t && x.t.trim(); })), other: other.value.trim() };
    }
    function saveDraft() { lsSet(draftKey, Object.assign(collect(), { _d: 1 })); }
    [date, cls, taught, viol, other].forEach(function (el) { el.addEventListener('input', saveDraft); el.addEventListener('change', saveDraft); });

    function save() {
      var v = collect();
      if (!v.classId) { toast('Chọn lớp trước đã.'); return; }
      if (!v.taught && !v.violations && v.homework === '[]' && !v.other) { toast('Ghi chú đang trống.'); return; }
      var row = Object.assign({}, note || { id: uid('n'), createdAt: nowIso() }, v, { updatedAt: nowIso() });
      lsSet(draftKey, null);
      editing = false;
      location.hash = '#/lop/' + encodeURIComponent(row.classId);
      commit([{ t: 'put', table: 'notes', row: row }], 'Đã lưu ghi chú');
    }

    editing = true;
    return h('div', { class: 'editor' },
      h('div', { class: 'page-head' }, h('a', { class: 'back', href: src.classId ? '#/lop/' + encodeURIComponent(src.classId) : '#/' , onclick: function () { lsSet(draftKey, null); } }, '‹ Hủy'),
        h('h1', null, isNew ? 'Ghi tiết dạy' : 'Sửa ghi chú')),
      draft ? h('p', { class: 'muted small' }, 'Đã mở lại bản nháp chưa lưu.') : null,
      h('div', { class: 'card form' },
        h('div', { class: 'two' }, h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Lớp'), cls), h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Ngày'), date)),
        field('📘 Đã dạy đến', taught),
        field('⚠️ Học sinh vi phạm', viol),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, '📝 Cần nộp'), hwList,
          h('div', { class: 'with-mic' }, newHw, micBtn(newHw), h('button', { type: 'button', class: 'btn small', onclick: addHw }, 'Thêm'))),
        field('💬 Ghi chú khác', other)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary big', onclick: save }, 'Lưu'),
        note ? h('button', { class: 'btn danger', onclick: function () {
          confirmBox('Xóa ghi chú ngày ' + fmtDate(note.date) + '?', 'Xóa', function () {
            lsSet(draftKey, null); editing = false;
            location.hash = '#/lop/' + encodeURIComponent(note.classId);
            commit([{ t: 'del', table: 'notes', id: note.id }], 'Đã xóa');
          });
        } }, 'Xóa') : null));
  }

  /* ═════════ Việc cần làm ═════════ */

  function taskSort(a, b) {
    if (!a.due !== !b.due) return a.due ? -1 : 1;
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
    return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
  }

  function taskRow(x) {
    var t = today(), late = x.due && x.due < t && !x.done, soon = x.due && x.due >= t && x.due <= addDays(t, 3) && !x.done;
    return h('div', { class: 'row task' + (x.done ? ' done' : '') },
      h('input', { type: 'checkbox', checked: !!x.done, 'aria-label': 'Xong', onchange: function (e) {
        commit([{ t: 'put', table: 'tasks', row: Object.assign({}, x, { done: e.target.checked ? '1' : '', doneAt: e.target.checked ? nowIso() : '' }) }], e.target.checked ? 'Đã xong ✓' : null);
      } }),
      h('div', { class: 'grow', onclick: function () { editTask(x); } },
        h('div', { class: 'pre' }, x.text),
        h('div', { class: 'small' },
          x.due ? h('span', { class: late ? 'late' : soon ? 'soon' : 'muted' }, (late ? 'Quá hạn · ' : '') + fmtDate(x.due)) : null,
          x.classId ? h('span', { class: 'tag' }, className(x.classId)) : null)));
  }

  function taskForm(x) {
    var text = autoGrow(h('textarea', { rows: 2, placeholder: 'VD: Nộp kế hoạch bài dạy cho tổ', value: x ? x.text : '' }));
    var due = h('input', { type: 'date', value: x ? x.due : '' });
    var cls = h('select', null, h('option', { value: '' }, 'Việc chung (nhà trường)'), state.classes.filter(function (c) { return !c.hidden; }).map(function (c) {
      return h('option', { value: c.id, selected: x && x.classId === c.id }, c.name);
    }));
    var quick = h('div', { class: 'chips' }, [['Hôm nay', 0], ['Mai', 1], ['3 ngày', 3], ['1 tuần', 7]].map(function (q) {
      return h('button', { type: 'button', class: 'chip', onclick: function () { due.value = addDays(today(), q[1]); } }, q[0]);
    }));
    return {
      el: h('div', { class: 'form' }, h('div', { class: 'with-mic' }, text, micBtn(text)),
        h('div', { class: 'two' }, h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Hạn'), due), h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Thuộc'), cls)), quick),
      get: function () { return { text: text.value.trim(), due: due.value, classId: cls.value }; },
      reset: function () { text.value = ''; due.value = ''; text.style.height = ''; }
    };
  }

  function quickTask() {
    var f = taskForm(null);
    return h('details', { class: 'card add' }, h('summary', null, '+ Thêm việc'), f.el,
      h('button', { class: 'btn primary', onclick: function () {
        var v = f.get();
        if (!v.text) { toast('Nhập nội dung việc.'); return; }
        f.reset();
        commit([{ t: 'put', table: 'tasks', row: Object.assign({ id: uid('t'), done: '', createdAt: nowIso(), doneAt: '' }, v) }], 'Đã thêm việc');
      } }, 'Thêm việc'));
  }

  function editTask(x) {
    var f = taskForm(x);
    modal('Sửa việc', f.el, [
      { label: 'Xóa', cls: 'danger', onClick: function () { commit([{ t: 'del', table: 'tasks', id: x.id }], 'Đã xóa việc'); } },
      { label: 'Thôi' },
      { label: 'Lưu', cls: 'primary', onClick: function () {
        var v = f.get();
        if (!v.text) { toast('Nhập nội dung việc.'); return false; }
        commit([{ t: 'put', table: 'tasks', row: Object.assign({}, x, v) }], 'Đã lưu');
      } }
    ]);
  }

  function viewTasks() {
    var t = today(), soon = addDays(t, 3);
    var open = state.tasks.filter(function (x) { return !x.done; }).sort(taskSort);
    var groups = [
      ['Quá hạn', open.filter(function (x) { return x.due && x.due < t; })],
      ['Hôm nay & 3 ngày tới', open.filter(function (x) { return x.due && x.due >= t && x.due <= soon; })],
      ['Sắp tới', open.filter(function (x) { return x.due && x.due > soon; })],
      ['Không có hạn', open.filter(function (x) { return !x.due; })]
    ];
    var done = state.tasks.filter(function (x) { return x.done; }).sort(function (a, b) { return (a.doneAt || '') < (b.doneAt || '') ? 1 : -1; });
    return h('div', null, h('h1', { class: 'page-title' }, 'Việc cần làm'), quickTask(),
      groups.map(function (g) {
        return g[1].length ? h('section', null, h('h2', null, g[0] + ' (' + g[1].length + ')'), h('div', { class: 'card list' }, g[1].map(taskRow))) : null;
      }),
      !open.length ? h('p', { class: 'muted' }, 'Hết việc rồi 🎉') : null,
      done.length ? h('details', { class: 'done-list' }, h('summary', null, 'Đã xong (' + done.length + ')'),
        h('div', { class: 'card list' }, done.slice(0, 50).map(taskRow))) : null);
  }

  /* ═════════ Học phí ═════════ */

  var feeClass = lsGet('st_feeClass', '');

  function feeId(sid, key) { return sid + '|' + key; }
  function feeMap() {
    var m = {};
    state.fees.forEach(function (f) { m[f.studentId + '|' + f.month] = f; });
    return m;
  }
  function curMonths() { return P.schoolMonths(P.schoolYearStart(new Date())); }

  function viewFees(id) {
    var dt = classesOf('DT');
    if (!dt.length) return h('p', null, 'Chưa có lớp dạy thêm nào (nhánh DT).');
    if (id) { feeClass = id; lsSet('st_feeClass', id); }
    var c = byId('classes', feeClass);
    if (!c || c.branch !== 'DT') c = dt[0];
    var months = curMonths();
    var fm = feeMap();
    var sts = studentsOf(c.id);

    var said = h('input', { type: 'text', placeholder: 'VD: An lớp 7 NSG đã đóng tháng 11', enterkeyhint: 'go' });
    function go() { if (said.value.trim()) feeCommand(said.value, c.id, function () { said.value = ''; }); }
    said.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    var bigMic = micBtn(null, function (text) { said.value = text; go(); });
    bigMic.className = 'mic huge';
    bigMic.textContent = '🎤 Nói';

    var thisM = months.filter(function (m) { return m.key === ymd(new Date()).slice(0, 7); })[0] || months[0];

    var table = h('table', { class: 'fees' },
      h('thead', null, h('tr', null, h('th', { class: 'name' }, 'Học sinh (' + sts.length + ')'), months.map(function (m) { return h('th', { class: m.key === thisM.key ? 'now' : '' }, m.label); }))),
      h('tbody', null, sts.map(function (s, idx) {
        return h('tr', null, h('td', { class: 'name' }, h('span', { class: 'muted' }, (idx + 1) + '. '), s.name),
          months.map(function (m) {
            var f = fm[feeId(s.id, m.key)];
            return h('td', { class: 'cell' + (f ? ' paid' : '') + (m.key === thisM.key ? ' now' : ''), onclick: function () { tapFee(s, m, f); } }, f ? '✓' : '');
          }));
      })),
      h('tfoot', null, h('tr', null, h('td', { class: 'name' }, 'Đã đóng'), months.map(function (m) {
        var n = sts.filter(function (s) { return fm[feeId(s.id, m.key)]; }).length;
        return h('td', null, n + '/' + sts.length);
      }))));

    return h('div', null,
      h('h1', { class: 'page-title' }, 'Học phí dạy thêm'),
      h('div', { class: 'chips scroll' }, dt.map(function (x) {
        return h('a', { class: 'chip' + (x.id === c.id ? ' on' : ''), href: '#/hocphi/' + encodeURIComponent(x.id) }, x.name);
      })),
      h('div', { class: 'card voice' }, h('div', { class: 'with-mic' }, said, h('button', { class: 'btn small', onclick: go }, 'Đánh dấu')), bigMic,
        h('p', { class: 'muted small' }, 'Nói: “Học sinh … lớp … đã đóng tháng …”. Có thể nói nhiều em (“An và Bình”) hoặc nhiều tháng (“tháng 11 đến tháng 2”). Nói “chưa đóng” để bỏ dấu. App luôn hỏi lại trước khi đánh dấu.')),
      sts.length ? h('div', { class: 'table-wrap' }, table) : h('p', { class: 'muted' }, 'Lớp này chưa có danh sách học sinh.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: function () { manageStudents(c); } }, '👥 Danh sách học sinh'),
        sts.length ? h('button', { class: 'btn', onclick: function () { copyUnpaid(c, sts, thisM, fm); } }, '📋 Chép DS chưa đóng ' + thisM.label) : null));
  }

  function tapFee(s, m, f) {
    if (f) {
      confirmBox('Bỏ đánh dấu ' + s.name + ' đã đóng ' + m.label + '?', 'Bỏ dấu', function () {
        commit([{ t: 'del', table: 'fees', id: f.id }], 'Đã bỏ dấu');
      });
    } else {
      commit([{ t: 'put', table: 'fees', row: { id: feeId(s.id, m.key), studentId: s.id, month: m.key, paidAt: nowIso() } }], s.name + ' · ' + m.label + ' ✓');
    }
  }

  function copyUnpaid(c, sts, m, fm) {
    var un = sts.filter(function (s) { return !fm[feeId(s.id, m.key)]; });
    var txt = un.length ? 'Lớp ' + c.name + ' – chưa đóng học phí ' + m.label + ':\n' + un.map(function (s, i) { return (i + 1) + '. ' + s.name; }).join('\n') : 'Lớp ' + c.name + ': tất cả đã đóng ' + m.label + '.';
    copyText(txt, un.length ? 'Đã chép ' + un.length + ' em chưa đóng' : 'Cả lớp đã đóng');
  }

  function copyText(txt, okMsg) {
    function fallback() {
      var ta = h('textarea', { value: txt, readonly: true });
      modal('Chép đoạn này', ta, [{ label: 'Đóng' }]);
      setTimeout(function () { ta.focus(); ta.select(); }, 50);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast(okMsg); }, fallback);
    else fallback();
  }

  function feeCommand(text, defaultClassId, onDone) {
    var dt = classesOf('DT');
    var r = P.parseFee(text, dt, state.students.filter(function (s) { return byId('classes', s.classId); }), { defaultClassId: defaultClassId });
    var months = curMonths();
    var picked = {};
    r.months.forEach(function (m) { picked[m.key] = true; });
    var paid = r.paid;

    var seg = h('div', { class: 'seg' });
    function drawSeg() {
      seg.innerHTML = '';
      seg.appendChild(h('button', { type: 'button', class: paid ? 'on ok' : '', onclick: function () { paid = true; drawSeg(); } }, '✓ Đã đóng'));
      seg.appendChild(h('button', { type: 'button', class: !paid ? 'on bad' : '', onclick: function () { paid = false; drawSeg(); } }, '✕ Chưa đóng (bỏ dấu)'));
    }
    drawSeg();

    var mchips = h('div', { class: 'chips' }, months.map(function (m) {
      var b = h('button', { type: 'button', class: 'chip' + (picked[m.key] ? ' on' : ''), onclick: function () {
        picked[m.key] = !picked[m.key]; b.className = 'chip' + (picked[m.key] ? ' on' : '');
      } }, m.label);
      return b;
    }));

    var choice = r.people.map(function (p) { return p.best >= 0 ? p.candidates[p.best].student.id : ''; });
    var peopleBox = h('div', null, r.people.map(function (p, pi) {
      var name = 'p' + pi + '_' + Date.now();
      return h('div', { class: 'person' },
        h('div', { class: 'muted small' }, 'Nghe được: “' + p.query + '”'),
        p.candidates.length ? p.candidates.map(function (cd) {
          return h('label', { class: 'row check' },
            h('input', { type: 'radio', name: name, checked: choice[pi] === cd.student.id, onchange: function () { choice[pi] = cd.student.id; } }),
            h('span', { class: 'grow' }, cd.student.name), h('span', { class: 'tag' }, className(cd.student.classId)));
        }).concat(p.candidates.length > 1 ? [h('label', { class: 'row check muted' }, h('input', { type: 'radio', name: name, checked: !choice[pi], onchange: function () { choice[pi] = ''; } }), 'Không phải em nào')] : [])
          : h('p', { class: 'err' }, 'Không tìm thấy em này.'));
    }));

    var probs = r.problems.filter(function (x) { return !/^Không tìm thấy học sinh/.test(x); });
    var body = h('div', { class: 'fee-confirm' },
      h('p', { class: 'said' }, '“' + text + '”'),
      seg,
      r.classId ? h('p', null, 'Lớp: ', h('b', null, className(r.classId))) : r.usedDefaultClass ? h('p', { class: 'muted small' }, 'Không nghe thấy tên lớp – tìm trong lớp ' + className(defaultClassId) + '.') : null,
      h('div', { class: 'lbl' }, 'Tháng'), mchips,
      h('div', { class: 'lbl' }, 'Học sinh'), r.people.length ? peopleBox : h('p', { class: 'err' }, 'Chưa nghe rõ tên học sinh.'),
      probs.length ? h('ul', { class: 'warnbox' }, probs.map(function (x) { return h('li', null, x); })) : null);

    modal('Xác nhận học phí', body, [
      { label: 'Hủy' },
      { label: 'Xác nhận', cls: 'primary', onClick: function () {
        var ids = choice.filter(function (x, i) { return x && choice.indexOf(x) === i; });
        var keys = months.filter(function (m) { return picked[m.key]; });
        if (!ids.length) { toast('Chọn học sinh trước.'); return false; }
        if (!keys.length) { toast('Chọn ít nhất một tháng.'); return false; }
        var fm = feeMap(), ops = [];
        ids.forEach(function (sid) {
          keys.forEach(function (m) {
            var f = fm[feeId(sid, m.key)];
            if (paid && !f) ops.push({ t: 'put', table: 'fees', row: { id: feeId(sid, m.key), studentId: sid, month: m.key, paidAt: nowIso() } });
            if (!paid && f) ops.push({ t: 'del', table: 'fees', id: f.id });
          });
        });
        var names = ids.map(function (sid) { var s = byId('students', sid); return s ? s.name : ''; }).join(', ');
        var lbl = keys.map(function (m) { return m.label; }).join(', ');
        var first = byId('students', ids[0]);
        if (first && first.classId !== feeClass) location.hash = '#/hocphi/' + encodeURIComponent(first.classId);
        if (ops.length) commit(ops, (paid ? '✓ ' : 'Bỏ dấu: ') + names + ' · ' + lbl);
        else toast('Không có gì thay đổi (đã đánh dấu từ trước).');
        if (onDone) onDone();
      } }
    ]);
  }

  function manageStudents(c) {
    var ta = h('textarea', { rows: 6, placeholder: 'Dán danh sách học sinh, mỗi dòng một em.\nCó thể dán thẳng từ Excel (cột STT, Họ và tên…).' });
    var list = h('div', { class: 'list st-list' });
    function draw() {
      list.innerHTML = '';
      studentsOf(c.id).forEach(function (s) {
        var inp = h('input', { type: 'text', value: s.name });
        inp.addEventListener('change', function () {
          var v = inp.value.trim();
          if (v && v !== s.name) commit([{ t: 'put', table: 'students', row: Object.assign({}, s, { name: v }) }], 'Đã đổi tên');
        });
        list.appendChild(h('div', { class: 'row' }, inp, h('button', { type: 'button', class: 'x', 'aria-label': 'Xóa', onclick: function () {
          if (!window.confirm('Xóa ' + s.name + ' khỏi lớp (kèm dấu học phí)?')) return;
          var ops = [{ t: 'del', table: 'students', id: s.id }];
          state.fees.forEach(function (f) { if (f.studentId === s.id) ops.push({ t: 'del', table: 'fees', id: f.id }); });
          commit(ops, 'Đã xóa ' + s.name); draw();
        } }, '✕')));
      });
      if (!list.childNodes.length) list.appendChild(h('p', { class: 'muted' }, 'Chưa có học sinh.'));
    }
    draw();
    modal('Học sinh lớp ' + c.name, h('div', null, ta,
      h('button', { class: 'btn primary', onclick: function () {
        var names = P.parseNameList(ta.value);
        if (!names.length) { toast('Chưa có tên nào.'); return; }
        var have = {};
        var cur = studentsOf(c.id), maxO = 0;
        cur.forEach(function (s) { have[P.norm(s.name)] = 1; maxO = Math.max(maxO, Number(s.order) || 0); });
        var ops = [], skip = 0;
        names.forEach(function (n) {
          if (have[P.norm(n)]) { skip++; return; }
          have[P.norm(n)] = 1;
          ops.push({ t: 'put', table: 'students', row: { id: uid('s'), classId: c.id, name: n, order: String(++maxO), note: '' } });
        });
        ta.value = '';
        if (ops.length) commit(ops);
        toast('Thêm ' + ops.length + ' em' + (skip ? ', bỏ qua ' + skip + ' em đã có' : ''));
        draw();
      } }, 'Thêm vào lớp'),
      h('h3', null, 'Đang có'), list), [{ label: 'Xong' }]);
  }

  /* ═════════ Cài đặt ═════════ */

  function viewSettings() {
    var cls = state.classes.slice().sort(function (a, b) { return (a.branch < b.branch ? -1 : a.branch > b.branch ? 1 : 0) || (Number(a.order) || 0) - (Number(b.order) || 0); });
    var newName = h('input', { type: 'text', placeholder: 'Tên lớp mới' });
    var newBranch = h('select', null, h('option', { value: 'HQV' }, 'HQV'), h('option', { value: 'DT' }, 'Dạy thêm'));
    return h('div', null, h('h1', { class: 'page-title' }, 'Cài đặt'),
      h('section', null, h('h2', null, 'Đồng bộ'),
        h('div', { class: 'card' },
          h('p', null, outbox.length ? outbox.length + ' thay đổi đang chờ gửi lên máy chủ.' : 'Mọi thay đổi đã lưu lên máy chủ.'),
          lastSynced ? h('p', { class: 'muted small' }, 'Lần cuối: ' + new Date(lastSynced).toLocaleString('vi-VN')) : null,
          lastError ? h('p', { class: 'err' }, lastError) : null,
          h('button', { class: 'btn', onclick: function () { flush(); load().then(function () { toast('Đã tải lại'); }); } }, '🔄 Tải lại từ máy chủ'))),
      h('section', null, h('h2', null, 'Lớp'),
        h('div', { class: 'card list' }, cls.map(function (c) {
          var inp = h('input', { type: 'text', value: c.name });
          inp.addEventListener('change', function () { var v = inp.value.trim(); if (v) commit([{ t: 'put', table: 'classes', row: Object.assign({}, c, { name: v }) }], 'Đã đổi tên lớp'); });
          return h('div', { class: 'row' }, h('span', { class: 'tag' }, BRANCH_LABEL[c.branch] || c.branch), inp,
            h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!c.hidden, onchange: function (e) {
              commit([{ t: 'put', table: 'classes', row: Object.assign({}, c, { hidden: e.target.checked ? '1' : '' }) }]);
            } }), ' Ẩn'));
        }),
        h('div', { class: 'row' }, newBranch, newName, h('button', { class: 'btn small', onclick: function () {
          var v = newName.value.trim();
          if (!v) return;
          var maxO = 0; state.classes.forEach(function (x) { maxO = Math.max(maxO, Number(x.order) || 0); });
          commit([{ t: 'put', table: 'classes', row: { id: uid('c'), branch: newBranch.value, name: v, order: String(maxO + 1), hidden: '' } }], 'Đã thêm lớp ' + v);
        } }, 'Thêm'))),
        h('p', { class: 'muted small' }, 'Lớp đã nghỉ thì tích “Ẩn” – ghi chú cũ vẫn giữ.')),
      viewBedtime(),
      h('section', null, h('h2', null, 'Tài khoản'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: changePw }, '🔑 Đổi mật khẩu'),
          h('button', { class: 'btn danger', onclick: function () {
            var warn = outbox.length ? ' Còn ' + outbox.length + ' thay đổi chưa gửi sẽ bị mất!' : '';
            confirmBox('Đăng xuất khỏi máy này?' + warn, 'Đăng xuất', function () {
              api('logout').catch(function () {});
              token = null; outbox = []; server = emptyData();
              [LS.token, LS.data, LS.outbox, LS.synced].forEach(function (k) { lsSet(k, null); });
              recompute(); render(true);
            });
          } }, 'Đăng xuất'))));
  }

  /* Trang web không được phép bật Chế độ máy bay của iPhone → dùng Tự động hóa trong app Phím tắt (Shortcuts).
   * App chỉ hướng dẫn cài và có nút gọi phím tắt tắt máy bay (phím tắt đó tự hỏi “Chắc chưa?”). */
  var REOPEN_SHORTCUT = 'Tắt máy bay';

  function viewBedtime() {
    function step(t) { return h('li', null, t); }
    return h('section', null, h('h2', null, '🌙 Giờ ngủ – tự bật Chế độ máy bay'),
      h('div', { class: 'card' },
        h('p', { class: 'small muted' }, 'Đến giờ (VD 22:00) iPhone tự bật ✈️ Chế độ máy bay: tắt hết Wi‑Fi, 4G. Cài một lần trong app Phím tắt có sẵn của iPhone.'),
        h('div', { class: 'actions' },
          h('a', { class: 'btn primary', href: 'shortcuts://run-shortcut?name=' + encodeURIComponent(REOPEN_SHORTCUT) }, '✈️ Tắt chế độ máy bay'),
          h('a', { class: 'btn', href: 'shortcuts://' }, 'Mở app Phím tắt')),
        h('details', { class: 'guide' }, h('summary', null, '① Hẹn giờ tự bật máy bay'),
          h('ol', null,
            step('Mở app Phím tắt → tab Tự động hóa → bấm +.'),
            step('Chọn Thời gian trong ngày → chọn giờ (VD 22:00) → Hằng ngày → Chạy ngay lập tức → Tiếp.'),
            step('Chọn Tự động hóa trống mới → Thêm tác vụ → gõ “máy bay” → chọn Đặt Chế độ máy bay → để là Bật.'),
            step('Bấm Xong. Muốn đổi giờ: vào lại tab Tự động hóa, bấm vào dòng này, sửa giờ.'))),
        h('details', { class: 'guide' }, h('summary', null, '② Phím tắt “' + REOPEN_SHORTCUT + '” (hỏi chắc chưa)'),
          h('ol', null,
            step('App Phím tắt → tab Phím tắt → bấm + → đặt tên đúng: ' + REOPEN_SHORTCUT + '.'),
            step('Thêm tác vụ Hiển thị cảnh báo: “Đã quá giờ ngủ. Chắc chắn tắt chế độ máy bay chưa?”, bật Hiển thị nút Hủy.'),
            step('Thêm tác vụ Đặt Chế độ máy bay → Tắt. Bấm Xong.'),
            step('Từ giờ bấm nút “✈️ Tắt chế độ máy bay” ở trên: iPhone hỏi lại, bấm Hủy là thôi, bấm OK mới có mạng.'))),
        h('details', { class: 'guide' }, h('summary', null, '③ (Tùy chọn) Sáng tự tắt máy bay'),
          h('p', { class: 'small' }, 'Làm như bước ① nhưng chọn giờ sáng (VD 6:00) và Đặt Chế độ máy bay → Tắt.')),
        h('p', { class: 'small muted' }, 'Lưu ý: nếu đang ở chế độ máy bay mà thầy tự bật lại Wi‑Fi, iPhone sẽ nhớ và lần sau bật máy bay vẫn để Wi‑Fi. Muốn chắc ăn, ở bước ① thêm tác vụ Đặt Wi‑Fi → Tắt. Sổ tay vẫn mở và ghi được khi không có mạng, có mạng lại sẽ tự gửi lên.')));
  }

  function changePw() {
    var o = h('input', { type: 'password', placeholder: 'Mật khẩu cũ', autocomplete: 'current-password' });
    var n = h('input', { type: 'password', placeholder: 'Mật khẩu mới (ít nhất 6 ký tự)', autocomplete: 'new-password' });
    modal('Đổi mật khẩu', h('div', { class: 'form' }, o, n), [{ label: 'Thôi' }, { label: 'Đổi', cls: 'primary', onClick: function () {
      api('changePassword', { oldPassword: o.value, newPassword: n.value }).then(function () { toast('Đã đổi mật khẩu'); }, function (e) { toast(e.message); });
    } }]);
  }

  /* ═════════ Điều hướng ═════════ */

  var editing = false, lastRoute = '';

  function parseRoute() {
    var hash = location.hash.replace(/^#\/?/, '');
    var qi = hash.indexOf('?');
    var path = qi >= 0 ? hash.slice(0, qi) : hash;
    var query = {};
    if (qi >= 0) hash.slice(qi + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) query[p[0]] = decodeURIComponent(p[1] || ''); });
    var parts = path.split('/').map(function (x) { return decodeURIComponent(x); });
    return { key: hash, parts: parts, query: query };
  }

  /** force=false: chỉ vẽ lại nếu không đang soạn (dữ liệu tải về ngầm không xóa chữ đang gõ). */
  function render(force) {
    var r = parseRoute();
    if (r.key !== lastRoute) { editing = false; }
    if (editing && !force && r.key === lastRoute) return;
    if (editing && force && r.key === lastRoute) return;   // đang soạn: không vẽ đè
    var scroll = r.key === lastRoute ? window.scrollY : 0;
    lastRoute = r.key;
    document.body.className = token ? '' : 'logged-out';
    var el;
    if (!token) el = viewLogin();
    else {
      var p = r.parts;
      switch (p[0]) {
        case 'chonlop': el = viewChooseClass(); break;
        case 'lop': el = p[1] ? viewClass(p[1]) : viewClasses(); break;
        case 'ghi': el = viewNote(p[1] || 'moi', r.query); break;
        case 'viec': el = viewTasks(); break;
        case 'hocphi': el = viewFees(p[1]); break;
        case 'caidat': el = viewSettings(); break;
        default: el = viewHome();
      }
    }
    view.innerHTML = '';
    view.appendChild(el);
    window.scrollTo(0, scroll);
    var tab = { lop: 'lop', chonlop: 'home', ghi: 'lop', viec: 'viec', hocphi: 'hocphi' }[r.parts[0]] || (r.parts[0] === 'caidat' ? '' : 'home');
    var as = document.querySelectorAll('#tabs a');
    for (var i = 0; i < as.length; i++) as[i].className = as[i].getAttribute('data-tab') === tab ? 'on' : '';
    showSync();
  }

  window.addEventListener('hashchange', function () { stopMic(); render(true); });

  recompute();
  render(true);
  if (token) { load(); flush(); }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* bỏ qua */ });
  }
})();
