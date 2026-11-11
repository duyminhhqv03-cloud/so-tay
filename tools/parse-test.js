// Kiểm tra bộ hiểu câu nói học phí: node tools/parse-test.js
var P = require('../parse.js');

var classes = [
  { id: 'dt-t7nsg', name: 'Toán 7 NSG' }, { id: 'dt-t6nsg', name: 'Toán 6 NSG' },
  { id: 'dt-t7home', name: 'Toán 7 Home' }, { id: 'dt-t6home', name: 'Toán 6 Home' },
  { id: 'dt-t9', name: 'Toán 9' }, { id: 'dt-t9nc', name: 'Toán 9NC' }
];
var students = [
  { id: 's1', classId: 'dt-t7nsg', name: 'Nguyễn Văn An' },
  { id: 's2', classId: 'dt-t7nsg', name: 'Trần Thị Bình' },
  { id: 's3', classId: 'dt-t7nsg', name: 'Lê Hoàng Đông' },
  { id: 's4', classId: 'dt-t9nc', name: 'Phạm Minh Chi' },
  { id: 's5', classId: 'dt-t9nc', name: 'Đỗ Thanh An' },
  { id: 's6', classId: 'dt-t9', name: 'Vũ Ánh' },
  { id: 's7', classId: 'dt-t9', name: 'Vũ Anh' },
  { id: 's8', classId: 'dt-t6home', name: 'Hoàng Gia Huy' },
  { id: 's9', classId: 'dt-t7home', name: 'Ngô Bảo Năm' }
];
var now = new Date(2026, 10, 11);

var fails = 0;
function check(text, exp, opts) {
  var o = Object.assign({ now: now }, opts || {});
  var r = P.parseFee(text, classes, students, o);
  var got = {
    paid: r.paid,
    classId: r.classId,
    months: r.months.map(function (m) { return m.key; }).join(','),
    people: r.people.map(function (p) { return p.best >= 0 ? p.candidates[p.best].student.id : '?' + p.candidates.map(function (c) { return c.student.id; }).join('|'); }).join(',')
  };
  var bad = [];
  for (var k in exp) if (String(got[k]) !== String(exp[k])) bad.push(k + ': muốn ' + exp[k] + ', được ' + got[k]);
  if (bad.length) { fails++; console.log('✗ ' + text + '\n   ' + bad.join('\n   ') + '\n   ' + JSON.stringify(r.problems)); }
  else console.log('✓ ' + text);
}

check('Học sinh Nguyễn Văn An lớp Toán 7 NSG đã đóng tháng 11', { paid: true, classId: 'dt-t7nsg', months: '2026-11', people: 's1' });
check('HS An lớp 7 NSG đóng tháng 11 và 12', { classId: 'dt-t7nsg', months: '2026-11,2026-12', people: 's1' });
check('em Bình lớp toán bảy n s g đã đóng tháng mười một, tháng mười hai', { classId: 'dt-t7nsg', months: '2026-11,2026-12', people: 's2' });
check('Chi lớp 9 nâng cao đóng tháng 11 đến tháng 2', { classId: 'dt-t9nc', months: '2026-11,2026-12,2027-01,2027-02', people: 's4' });
check('An lớp 9NC đã đóng T12', { classId: 'dt-t9nc', months: '2026-12', people: 's5' });
check('Học sinh An lớp toán 9 đã đóng tháng 11', { classId: 'dt-t9', people: '?' });
check('em Ánh lớp toán 9 đóng tháng 1', { classId: 'dt-t9', months: '2027-01', people: 's6' });
check('em Bình và em Đông lớp 7 NSG đã đóng tháng 11', { classId: 'dt-t7nsg', people: 's2,s3' });
check('Đông lớp 7 nsg chưa đóng tháng 12', { paid: false, people: 's3' });
check('hoc sinh dong lop 7 nsg da dong thang 11', { paid: true, people: 's3', months: '2026-11' });
check('Huy lớp 6 home đóng tháng 3', { paid: true, classId: 'dt-t6home', people: 's8', months: '2027-03' });
check('Năm lớp 7 Home đã đóng tháng 11', { classId: 'dt-t7home', people: 's9', months: '2026-11' });
check('Bình đã đóng tháng 11, 12, 1', { classId: 'null', people: 's2', months: '2026-11,2026-12,2027-01' }, { defaultClassId: 'dt-t7nsg' });
check('hủy tick Bình lớp 7 NSG tháng 11', { paid: false, people: 's2' });
check('Gia Huy đóng tháng 11', { classId: 'null', people: 's8' });
check('Nguyễn Văn Ann lớp 7 NSG đóng tháng 11', { people: 's1' });
check('Lớp 7 NSG em An đóng tháng 11-12', { classId: 'dt-t7nsg', people: 's1', months: '2026-11,2026-12' });

var list = P.parseNameList('STT\tHọ và tên\tGhi chú\n1\tNguyễn Văn An\tNam\n2. Trần Thị Bình\n\n 3) Lê Hoàng Đông \n4\tPhạm Chi\t0912345678');
var expList = 'Nguyễn Văn An|Trần Thị Bình|Lê Hoàng Đông|Phạm Chi';
if (list.join('|') !== expList) { fails++; console.log('✗ parseNameList: ' + list.join('|')); } else console.log('✓ parseNameList');

console.log(fails ? '\n' + fails + ' lỗi' : '\nTất cả đều đúng');
process.exit(fails ? 1 : 0);
