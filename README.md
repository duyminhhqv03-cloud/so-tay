# Sổ tay giáo viên

App ghi chú riêng (không liên quan Toán Thầy Minh): nhật ký tiết dạy theo lớp (HQV, Dạy thêm), việc cần làm có hạn, bảng học phí lớp dạy thêm (T11 – T5) đánh dấu bằng giọng nói.

- `index.html`, `app.js`, `style.css`: giao diện (một trang, không cần build).
- `parse.js`: hiểu câu nói học phí (“HS An lớp 7 NSG đã đóng tháng 11”) — chạy trên máy, không gửi tên đi đâu. Kiểm tra: `node tools/parse-test.js`.
- `apps-script/Code.gs`: máy chủ Google Apps Script + Google Sheets. Cài đặt: `apps-script/HUONG-DAN.md`.
- `config.js`: URL máy chủ.
- Chạy thử: `node tools/mock-server.mjs` → http://localhost:8768/ (mật khẩu `thu123`).

Dữ liệu tải hết về máy và lưu sẵn: mất mạng vẫn xem và ghi được, có mạng lại thì tự gửi lên.
