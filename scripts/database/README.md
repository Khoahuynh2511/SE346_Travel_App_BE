# Thư mục script và tài nguyên cơ sở dữ liệu

Dùng chỗ này để gom các file **liên quan tới cơ sở dữ liệu**, không chứa mã máy chủ chính.

## Nội dung

| Mục | Mô tả |
|-----|--------|
| Shell script | Chuỗi thao tác Prisma tái dùng (`db push` hoặc `migrate deploy`, seed). |
| Thư `sql/` | Script SQL tay trên Postgres (đặt tên có hậu tố `.example.sql`). |

### File SQL cho màn frontend (tabs địa điểm + đánh giá + đăng nhập demo)

| Tệp | Khi chạy |
|-----|-----------|
| [sql/frontend-schema-and-demo-seed.example.sql](sql/frontend-schema-and-demo-seed.example.sql) | **DB trống:** tạo toàn bộ bảng + enum như Prisma + nạp 3 địa điểm (Attractions/Dining/Festivals), user **`demo@example.com`**, một review có ảnh. |
| [sql/frontend-demo-seed-only.example.sql](sql/frontend-demo-seed-only.example.sql) | Khung đã có (`prisma db push` xong): xóa bản ghì demo có ID tiền tố **`fe_*`** và nạp lại cùng bộ như trên. |

Đăng nhập thử máy chủ:**`demo@example.com` / `demo1234`**. Khuyến nghị hằng ngày vẫn **`npx prisma db push`** + **`npm run db:seed`**; SQL chỉ dùng khi bạn thích chạy mọi thứ qua SQL Editor của Supabase.

Hướng dẫn đầy đủ **cài máy chủ cục bộ**, **biến môi trường**, **triển khai** xem **`README.md` ở gốc dự án**.

## Thứ tự gợi ý khi mới vào nhóm hoặc dự án mới trên máy của bạn

1. Sao chép `.env.example` thành `.env` và điền thông tin kết nối Supabase.
2. Trong gốc dự án: `npm ci` và `npm run db:generate`.
3. Áp khung vào kho chứa từ xa: `npm run db:push` (hoặc chạy `scripts/database/sync-schema-seed.sh` nếu bạn thích script).
4. Nạp dữ liệu mẫu: `npm run db:seed`.

## Lưu ý

Script shell giả định bạn chạy từ môi trường **Linux / WSL**. Trên máy chỉ có Windows không có Bash, có thể mở từng lệnh tương ứng trong `package.json`.
