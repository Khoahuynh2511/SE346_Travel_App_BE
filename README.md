# Travel App — Backend API

Backend cho ứng dụng du lịch (Expo/React Native): đăng nhập, địa điểm, đánh giá, yêu thích, quản lý owner, upload ảnh qua Supabase Storage.

**Stack:** Node.js 20+, TypeScript, Express 5, Prisma, PostgreSQL (Supabase).

---

## Bắt đầu nhanh (5 bước)

```bash
git clone https://github.com/Khoahuynh2511/SE346_Travel_App_BE.git
cd SE346_Travel_App_BE
npm install
cp .env.example .env
# Sửa .env (xem bảng bên dưới), rồi:
npm run db:sync
npm run storage:verify   # tùy chọn — kiểm tra Supabase Storage
npm run dev
```

Mở trình duyệt:

| URL | Mục đích |
|-----|----------|
| http://localhost:8000/health | Kiểm tra server + Supabase |
| http://localhost:8000/docs | Swagger UI (thử API) |

**Tài khoản mẫu** (sau `npm run db:seed`):

| Email | Mật khẩu | Vai trò |
|-------|----------|---------|
| `demo@example.com` | `demo1234` | Traveler |
| `owner@example.com` | `demo1234` | Owner (quản lý địa điểm) |

---

## Biến môi trường (`.env`)

Sao chép từ `.env.example` và điền:

| Biến | Bắt buộc | Mô tả |
|------|----------|--------|
| `DATABASE_URL` | Có | Postgres pooler (Supabase: port **6543**, `?pgbouncer=true`) |
| `DIRECT_URL` | Có | Postgres direct (port **5432**) — dùng cho migrate / db push |
| `JWT_SECRET` | Có | Chuỗi bí mật ký JWT (production: dùng chuỗi dài ngẫu nhiên) |
| `PORT` | Không | Cổng HTTP, mặc định **8000** |
| `SUPABASE_URL` | Upload ảnh | Project URL từ Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Upload ảnh | **`service_role`** (JWT `eyJ...`) — **không** dùng `sb_publishable_*` |
| `SUPABASE_STORAGE_BUCKET` | Không | Tên bucket, mặc định `review-images` |
| `SUPABASE_BROADCAST_CHANNEL` | Không | Kênh Realtime, mặc định `travel-app` |

**Lưu ý Supabase Storage**

1. Dashboard → **API** → copy **service_role** (secret, bắt đầu `eyJ...`).
2. Chạy `npm run storage:verify` — script tự tạo bucket public nếu chưa có.
3. `/health` trả `"supabase": true` khi cấu hình đúng.

Không có Supabase: API vẫn chạy; upload trả `STORAGE_UNAVAILABLE`.

**Mật khẩu Postgres có ký tự đặc biệt** (`@`, `#`, …) phải [URL-encode](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding) trong connection string.

---

## Lệnh npm thường dùng

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Chạy dev server (tsx watch) |
| `npm run build` | Build TypeScript → `dist/` |
| `npm start` | Chạy bản build |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:push` | Đồng bộ schema lên DB |
| `npm run db:migrate` | Tạo migration mới (dev) |
| `npm run db:migrate:deploy` | Áp migrations (production) |
| `npm run db:seed` | Dữ liệu mẫu |
| `npm run db:sync` | `generate` + `push` + `seed` |
| `npm run db:studio` | Prisma Studio |
| `npm run storage:verify` | Kiểm tra / tạo bucket Supabase |
| `npm run test` | Vitest |

---

## API (tóm tắt)

Tiền tố: `/api/v1`

### Auth
| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/register` | — |
| POST | `/auth/login` | — |
| POST | `/auth/forgot-password` | — |
| POST | `/auth/reset-password` | — |
| POST | `/auth/oauth/:provider` | — (google/apple: 501 chưa cấu hình) |

### Users
| Method | Path | Auth |
|--------|------|------|
| GET/PATCH | `/users/me` | JWT |
| GET | `/users/me/reviews` | JWT |
| GET/POST/DELETE | `/users/me/favorites/places/:placeId` | JWT |

### Places & Reviews
| Method | Path | Auth |
|--------|------|------|
| GET | `/places?category=ATTRACTIONS\|DINING\|FESTIVALS\|STAYS\|SHOPPING` | — |
| GET | `/places/:placeId` | JWT tùy chọn |
| GET/POST | `/places/:placeId/reviews` | POST cần JWT |
| PATCH/DELETE | `/reviews/:reviewId` | JWT |
| POST | `/reviews/:reviewId/likes/toggle` | JWT |

### Owner (role OWNER)
| Method | Path | Auth |
|--------|------|------|
| GET/POST | `/owner/places` | JWT + Owner |
| GET/PATCH/DELETE | `/owner/places/:placeId` | JWT + Owner |
| GET/POST | `/owner/places/:placeId/promotions` | JWT + Owner |
| PATCH/DELETE/POST toggle | `/owner/promotions/:promotionId` | JWT + Owner |

### Uploads
| Method | Path | Auth |
|--------|------|------|
| POST | `/uploads/review-image` | JWT (multipart `file`) |
| POST | `/uploads/place-cover` | JWT + Owner |

### AI (preview)
| Method | Path | Auth |
|--------|------|------|
| POST | `/ai/trip-plan` | JWT |

Chi tiết request/response: **http://localhost:8000/docs** hoặc `docs/openapi.json`.

---

## Cấu trúc thư mục

```
src/
  app.ts          # Express, CORS, routes
  server.ts       # Entry
  routes/         # HTTP routes
  services/       # Business logic
  middleware/     # auth, requireOwner
prisma/
  schema.prisma
  seed.ts
  migrations/
docs/openapi.json
scripts/
  verify-supabase-storage.ts
  database/       # Shell helpers
```

---

## Kết nối app mobile (Expo)

Trong app React Native, đặt base URL trỏ tới máy chạy backend:

| Môi trường | URL gợi ý |
|------------|-----------|
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://localhost:8000` |
| Máy thật | `http://<IP-LAN-máy-dev>:8000` |

Đăng nhập → lưu `accessToken` → gửi header `Authorization: Bearer <token>`.

---

## Docker (tùy chọn)

```bash
docker compose build
docker compose up -d
```

Chạy migrate/seed **một lần** trước khi nhận traffic (container không tự migrate).

---

## Triển khai cloud

1. Build: `npm ci && npx prisma generate && npm run build`
2. Start: `node dist/server.js`
3. Env: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `SUPABASE_*`
4. Lần đầu: `npx prisma migrate deploy && npm run db:seed`

---

## Bảo mật

- Không commit `.env` (đã có trong `.gitignore`).
- Không đưa `service_role` vào app mobile.
- Production: đổi `JWT_SECRET`, thu hẹp CORS trong `src/app.ts`.

---

## License

Dự án học tập SE346.
