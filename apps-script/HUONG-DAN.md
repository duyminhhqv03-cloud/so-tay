# Cài đặt Sổ tay (làm một lần, khoảng 10 phút)

## 1. Tạo Google Sheet + máy chủ
1. Vào https://sheets.new, tạo bảng tính mới, đặt tên **Sổ tay**.
2. Menu **Tiện ích mở rộng → Apps Script**.
3. Xóa hết mã có sẵn, dán toàn bộ nội dung `apps-script/Code.gs`, bấm 💾 Lưu.
4. Ở ô chọn hàm phía trên chọn **setup** → bấm **Chạy**. Lần đầu Google hỏi quyền: **Xem xét quyền → chọn tài khoản → Nâng cao → Đi tới … (không an toàn) → Cho phép**.
5. Mở **Nhật ký thực thi** ở dưới: dòng *Mật khẩu Sổ tay: xxxxxxxx* — ghi lại (đổi được trong app).

## 2. Triển khai thành ứng dụng web
1. **Triển khai → Tùy chọn triển khai mới → ⚙️ chọn Ứng dụng web**.
2. *Thực thi dưới dạng*: **Tôi**. *Người có quyền truy cập*: **Bất kỳ ai**.
3. Bấm **Triển khai**, chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).
4. Gửi URL đó cho Claude để dán vào `config.js`.

## Khi Code.gs thay đổi
Dán lại mã mới → **Triển khai → Quản lý các bản triển khai → ✏️ → Phiên bản: Phiên bản mới → Triển khai** (giữ nguyên URL).

## Quên mật khẩu
Apps Script → chọn hàm **datLaiMatKhau** → Chạy → xem mật khẩu mới trong Nhật ký thực thi.

## Dữ liệu
Nằm trong các trang tính `Lop`, `GhiChu`, `Viec`, `HocSinh`, `HocPhi`. Có thể xem trực tiếp, nhưng nên sửa trong app.
Google Sheets tự lưu lịch sử phiên bản (**Tệp → Nhật ký phiên bản**) nếu lỡ xóa nhầm.
