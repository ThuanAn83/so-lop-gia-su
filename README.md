# Sổ lớp gia sư

Website quản lý lớp học thêm: điểm danh, nội dung buổi học, bài tập về nhà, nhận xét từng em, học phí và mã QR chuyển khoản.

- **Gia sư (admin):** đăng ký bằng email. Mỗi gia sư có sổ riêng, không ai xem được học sinh của người khác.
- **Phụ huynh:** đăng nhập bằng số điện thoại và mật khẩu do gia sư tạo. Chỉ xem được thông tin của con mình.

## Cấu trúc

- `index.html`, `style.css`, `app.js`: giao diện (trang tĩnh, chạy trên GitHub Pages).
- `config.js`: địa chỉ Supabase và khóa công khai.
- `vendor/`: thư viện supabase-js 2.45.4 và qrcode-generator 1.4.4.
- `supabase/migrations/`: cấu trúc cơ sở dữ liệu và quy tắc phân quyền (RLS).
- `supabase/functions/parent-account/`: tạo tài khoản phụ huynh (chỉ gia sư gọi được).
