/* Hiểu câu nói về học phí, ví dụ:
 *   "Học sinh Nguyễn An lớp Toán 7 NSG đã đóng tháng 11 và 12"
 *   "em Bình với em Chi lớp 9 nâng cao đóng tháng 11 đến tháng 2"
 *   "An lớp 6 home chưa đóng tháng 12"   → bỏ đánh dấu
 * Chạy hoàn toàn trên máy, không gửi tên học sinh đi đâu.
 * Dùng được cả trong trình duyệt (window.SoTayParse) và Node (require). */
(function (root) {
  'use strict';

  var SCHOOL_MONTHS = [11, 12, 1, 2, 3, 4, 5];

  function strip(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  }
  function norm(s) { return strip(s).replace(/[^a-z0-9]+/g, ' ').trim(); }

  var NUM = { mot: 1, gieng: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10, chap: 12 };

  // Các cách gọi phần đuôi tên lớp (sau con số khối)
  var SUFFIX_VARIANTS = {
    nsg: [['nsg'], ['n', 's', 'g'], ['ns', 'g'], ['n', 'sg'], ['no', 'so', 'go'], ['en', 'es', 'gi'], ['n', 's', 'gi']],
    home: [['home'], ['hom'], ['hum'], ['hôm'], ['hoom'], ['hong']],
    nc: [['nc'], ['n', 'c'], ['nang', 'cao'], ['no', 'xe'], ['en', 'xi']]
  };

  function tokenize(text) {
    var s = String(text || '').toLowerCase();
    s = s.replace(/(\d)\s*[-–]\s*(\d)/g, '$1 đến $2');
    s = s.replace(/[,;\/&+]/g, ' và ');
    var raw = s.split(/[\s.:!?()"'“”\-–]+/);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!r) continue;
      var p = strip(r).replace(/[^a-z0-9]/g, '');
      if (!p) continue;
      var m;
      if ((m = /^t(\d{1,2})$/.exec(p))) { out.push({ raw: 'tháng', p: 'thang' }, { raw: m[1], p: m[1] }); continue; }
      if ((m = /^(\d+)([a-z]+)$/.exec(p))) { out.push({ raw: m[1], p: m[1] }, { raw: m[2], p: m[2] }); continue; }
      out.push({ raw: r.replace(/[^0-9a-zà-ỹđ]/g, ''), p: p });
    }
    return out;
  }

  function editDist(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Năm bắt đầu năm học: từ tháng 8 trở đi tính là năm học mới. */
  function schoolYearStart(now) {
    now = now || new Date();
    return now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  }
  function monthKey(m, sy) {
    var y = m >= 8 ? sy : sy + 1;
    return y + '-' + (m < 10 ? '0' : '') + m;
  }
  function schoolMonths(sy) {
    return SCHOOL_MONTHS.map(function (m) { return { m: m, key: monthKey(m, sy), label: 'T' + m }; });
  }

  // Đọc một số tháng ở vị trí i. Trả về {n, len} hoặc null.
  function readNum(toks, i) {
    var t = toks[i];
    if (!t) return null;
    if (/^\d{1,2}$/.test(t.p)) return { n: Number(t.p), len: 1 };
    if (t.p === 'muoi') {
      var nx = toks[i + 1];
      if (nx && nx.p === 'mot') return { n: 11, len: 2 };
      if (nx && nx.p === 'hai') return { n: 12, len: 2 };
      return { n: 10, len: 1 };
    }
    if (NUM.hasOwnProperty(t.p)) return { n: NUM[t.p], len: 1 };
    return null;
  }

  function expandRange(a, b) {
    var ia = SCHOOL_MONTHS.indexOf(a), ib = SCHOOL_MONTHS.indexOf(b);
    if (ia < 0 || ib < 0 || ib < ia) return [a, b];
    return SCHOOL_MONTHS.slice(ia, ib + 1);
  }

  function findMonths(toks, used) {
    var months = [];
    for (var i = 0; i < toks.length; i++) {
      if (used[i] || toks[i].p !== 'thang') continue;
      var j = i + 1, range = false, last = null, got = false;
      used[i] = true;
      while (j < toks.length) {
        var r = readNum(toks, j);
        if (r) {
          for (var k = j; k < j + r.len; k++) used[k] = true;
          if (range && last != null) {
            var ex = expandRange(last, r.n);
            for (var e = 0; e < ex.length; e++) if (months.indexOf(ex[e]) < 0) months.push(ex[e]);
          } else if (months.indexOf(r.n) < 0) months.push(r.n);
          last = r.n; range = false; got = true;
          j += r.len;
          continue;
        }
        var p = toks[j].p;
        if (got && (p === 'va' || p === 'voi' || p === 'cung' || p === 'thang' || p === 'den' || p === 'toi' || p === 'het')) {
          // Chỉ ăn từ nối nếu sau nó còn là tháng
          var k2 = j + 1;
          while (k2 < toks.length && (toks[k2].p === 'thang' || toks[k2].p === 'den' || toks[k2].p === 'toi')) k2++;
          if (!readNum(toks, k2)) break;
          if (p === 'den' || p === 'toi' || p === 'het') range = true;
          for (var u = j; u < k2; u++) { if (toks[u].p === 'den' || toks[u].p === 'toi') range = true; used[u] = true; }
          j = k2;
          continue;
        }
        break;
      }
    }
    return months;
  }

  // Mẫu nhận diện cho từng lớp: [ [token, token...], ... ]
  function classPatterns(c) {
    var n = norm(c.name).replace(/^toan\s+/, '');
    var parts = [];
    n.split(' ').forEach(function (w) {
      var m = /^(\d+)([a-z]+)$/.exec(w);
      if (m) { parts.push(m[1], m[2]); } else if (w) parts.push(w);
    });
    var pats = [parts];
    if (/^\d+$/.test(parts[0])) {
      var digitWords = [];
      for (var w in NUM) if (NUM[w] === Number(parts[0]) && w !== 'gieng' && w !== 'chap') digitWords.push(w);
      var rest = parts.slice(1);
      var restVariants = [rest];
      if (rest.length === 1 && SUFFIX_VARIANTS[rest[0]]) {
        restVariants = SUFFIX_VARIANTS[rest[0]].map(function (v) { return v.map(norm); });
      }
      var heads = [[parts[0]]].concat(digitWords.map(function (d) { return [d]; }));
      pats = [];
      heads.forEach(function (h) { restVariants.forEach(function (r) { pats.push(h.concat(r)); }); });
    }
    return pats;
  }

  function findClass(toks, used, classes) {
    var best = null;
    for (var ci = 0; ci < classes.length; ci++) {
      var pats = classPatterns(classes[ci]);
      for (var pi = 0; pi < pats.length; pi++) {
        var pat = pats[pi];
        for (var i = 0; i + pat.length <= toks.length; i++) {
          var ok = true;
          for (var k = 0; k < pat.length; k++) if (used[i + k] || toks[i + k].p !== pat[k]) { ok = false; break; }
          if (!ok) continue;
          // Số khối viết bằng chữ ("bảy") chỉ tính khi đứng sau "lớp"/"toán"
          var prev = toks[i - 1] && toks[i - 1].p;
          if (!/^\d/.test(pat[0]) && prev !== 'lop' && prev !== 'toan') continue;
          var score = pat.length * 10 + (prev === 'lop' || prev === 'toan' ? 1 : 0);
          if (!best || score > best.score) best = { cls: classes[ci], start: i, len: pat.length, score: score };
        }
      }
    }
    if (!best) return null;
    for (var q = best.start; q < best.start + best.len; q++) used[q] = true;
    for (var b = best.start - 1; b >= 0 && (toks[b].p === 'lop' || toks[b].p === 'toan'); b--) used[b] = true;
    return best.cls;
  }

  var STOP = {
    hs: 1, em: 1, ban: 1, con: 1, chau: 1, be: 1, da: 1, roi: 1, du: 1, tien: 1, phi: 1, cua: 1, la: 1,
    nop: 1, lop: 1, toan: 1, chua: 1, huy: 1, xoa: 1, tick: 1, tich: 1, danh: 1, dau: 1, cho: 1, vua: 1, moi: 1, bo: 1, thanh: 0
  };

  // "hủy/xóa" là lệnh bỏ đánh dấu; "Huy" không dấu có thể là tên → chỉ tính khi đi với tick/đánh dấu/tháng
  function isCancel(toks, i) {
    var t = toks[i], nx = toks[i + 1] && toks[i + 1].p;
    if (t.p !== 'huy' && t.p !== 'xoa') return false;
    if (t.raw === 'hủy' || t.raw === 'xóa' || t.raw === 'xoá') return true;
    return t.raw === t.p && /^(tick|tich|danh|dau|thang|hoc)$/.test(nx || '');
  }

  function findPaidFlag(toks) {
    for (var i = 0; i < toks.length; i++) {
      var p = toks[i].p;
      if (p === 'chua' || isCancel(toks, i)) return false;
      if (p === 'bo' && toks[i + 1] && /^(tick|tich|danh|dau)$/.test(toks[i + 1].p)) return false;
    }
    return true;
  }

  function consumeStop(toks, used) {
    for (var i = 0; i < toks.length; i++) {
      if (used[i]) continue;
      var t = toks[i], p = t.p, nx = toks[i + 1] && toks[i + 1].p, pv = toks[i - 1] && toks[i - 1].p;
      if (p === 'hoc' && (nx === 'sinh' || nx === 'phi')) { used[i] = used[i + 1] = true; continue; }
      if (p === 'dong') {
        // "đóng" (nộp tiền) khác tên "Đông": có dấu thì phân biệt được, không dấu thì xem ngữ cảnh
        var isVerb = t.raw === 'đóng' || (t.raw === 'dong' && (/^(da|chua|vua|moi|roi)$/.test(pv || '') || /^(thang|tien|hoc|du|roi)$/.test(nx || '') || !nx));
        if (isVerb) { used[i] = true; continue; }
      }
      if (p === 'huy' || p === 'xoa') { if (isCancel(toks, i)) used[i] = true; continue; }
      if (STOP[p] === 1) {
        // "bo" chỉ bỏ khi là "bỏ tick/bỏ đánh dấu"; "con" "em" ... luôn bỏ
        if (p === 'bo' && !/^(tick|tich|danh|dau)$/.test(nx || '')) continue;
        if ((p === 'danh' || p === 'dau') && !(pv === 'danh' || nx === 'dau' || pv === 'bo')) continue;
        used[i] = true;
      }
    }
  }

  function nameGroups(toks, used) {
    var groups = [], cur = [];
    for (var i = 0; i < toks.length; i++) {
      if (used[i]) { if (cur.length) { groups.push(cur); cur = []; } continue; }
      if (toks[i].p === 'va' || toks[i].p === 'voi') { if (cur.length) groups.push(cur); cur = []; continue; }
      cur.push(toks[i]);
    }
    if (cur.length) groups.push(cur);
    return groups;
  }

  function matchStudent(q, students) {
    var res = [];
    for (var s = 0; s < students.length; s++) {
      var st = students[s];
      var nameRaw = String(st.name || '').toLowerCase().split(/\s+/);
      var nameP = nameRaw.map(function (w) { return strip(w).replace(/[^a-z0-9]/g, ''); });
      var pos = 0, score = 0, ok = true, lastIdx = -1;
      for (var k = 0; k < q.length; k++) {
        var found = -1, fuzzy = false;
        for (var j = pos; j < nameP.length; j++) {
          if (nameP[j] === q[k].p) { found = j; break; }
        }
        if (found < 0 && q[k].p.length >= 3) {
          for (var j2 = pos; j2 < nameP.length; j2++) if (nameP[j2].length >= 2 && editDist(nameP[j2], q[k].p) <= 1) { found = j2; fuzzy = true; break; }
        }
        if (found < 0) { ok = false; break; }
        score += fuzzy ? 1 : 3;
        if (!fuzzy && nameRaw[found].replace(/[^0-9a-zà-ỹđ]/g, '') === q[k].raw) score += 1;
        pos = found + 1; lastIdx = found;
      }
      if (!ok) continue;
      if (lastIdx === nameP.length - 1) score += 2;          // khớp tên gọi (chữ cuối)
      if (q.length === nameP.length) score += 2;             // nói đủ họ tên
      res.push({ student: st, score: score });
    }
    res.sort(function (a, b) { return b.score - a.score; });
    return res;
  }

  /**
   * text: câu nói; classes: [{id,name}]; students: [{id,classId,name}]
   * opts: { defaultClassId, now }
   */
  function parseFee(text, classes, students, opts) {
    opts = opts || {};
    var toks = tokenize(text);
    var used = toks.map(function () { return false; });
    var problems = [];
    var paid = findPaidFlag(toks);
    var nums = findMonths(toks, used);
    var cls = findClass(toks, used, classes);
    consumeStop(toks, used);
    var groups = nameGroups(toks, used);

    var sy = schoolYearStart(opts.now);
    var months = [];
    nums.forEach(function (m) {
      if (SCHOOL_MONTHS.indexOf(m) < 0) problems.push('Tháng ' + m + ' không có trong bảng (T11 – T5).');
      else months.push({ m: m, key: monthKey(m, sy), label: 'T' + m });
    });
    if (!nums.length) problems.push('Chưa nghe rõ tháng nào. Nói thêm “tháng …”.');

    var classId = cls ? cls.id : (opts.defaultClassId || null);
    var pool = students.filter(function (s) { return classId ? s.classId === classId : true; });
    var people = groups.map(function (g) {
      var cands = matchStudent(g, pool);
      if (!cands.length && classId && !cls) cands = matchStudent(g, students);   // lớp chỉ là mặc định → tìm rộng hơn
      var best = -1;
      if (cands.length === 1 || (cands.length > 1 && cands[0].score > cands[1].score)) best = 0;
      return {
        query: g.map(function (t) { return t.raw; }).join(' '),
        candidates: cands.slice(0, 8),
        best: best
      };
    });
    if (!people.length) problems.push('Chưa nghe rõ tên học sinh.');
    people.forEach(function (p) { if (!p.candidates.length) problems.push('Không tìm thấy học sinh “' + p.query + '”' + (classId ? ' trong lớp này' : '') + '.'); });

    return { paid: paid, months: months, classId: cls ? cls.id : null, usedDefaultClass: !cls && !!opts.defaultClassId, people: people, problems: problems };
  }

  /** Tách danh sách dán vào (mỗi dòng một em, có thể kèm số thứ tự hoặc cột Excel). */
  function parseNameList(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var pick = '', words = 0;
      line.split(/\t|\s{3,}/).forEach(function (cell) {
        var c = cell.replace(/^\s*\d+\s*[.)\-:]?\s*/, '').replace(/\s+/g, ' ').trim();
        if (!/[a-zà-ỹđ]{2,}/i.test(c) || /@|http|\d{3,}/i.test(c)) return;
        var n = c.split(' ').length;
        if (n > words) { pick = c; words = n; }
      });
      if (pick && !/^(họ và tên|họ tên|ho va ten|ho ten|tên|stt)$/i.test(pick)) out.push(pick);
    });
    return out;
  }

  var api = {
    parseFee: parseFee, parseNameList: parseNameList, norm: norm, strip: strip,
    schoolYearStart: schoolYearStart, schoolMonths: schoolMonths, monthKey: monthKey, tokenize: tokenize
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SoTayParse = api;
})(this);
