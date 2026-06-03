# Walkthrough - Tích hợp Groq AI Chatbot (Nâng cấp sâu)

Tôi đã hoàn thành việc tích hợp và nâng cấp chatbot AI sử dụng Groq SDK. Chatbot hiện đã có quyền can thiệp sâu vào dữ liệu người dùng để hỗ trợ tối đa.

## Các thay đổi chính

### 1. Cấu hình môi trường
- Thêm `GROQ_API_KEY` vào [.env](file:///C:/Users/PC/Documents/GitHub/SE346_Travel_App_BE/.env).
- Cài đặt `groq-sdk`.

### 2. Dịch vụ AI can thiệp sâu ([groq.service.ts](file:///C:/Users/PC/Documents/GitHub/SE346_Travel_App_BE/src/services/groq.service.ts))
Đây là bản nâng cấp mạnh mẽ nhất:
- **Cấm từ chối quyền truy cập**: AI đã được lập trình để không bao giờ trả lời "không có quyền". Nó biết rằng nó có các công cụ để lấy mọi thứ nó cần.
- **Bộ công cụ (Tools) toàn diện**:
    - `getUserProfile`: Xem thông tin hồ sơ (tên, vị trí, sở thích).
    - `getUserFavorites`: Truy cập danh sách địa điểm đã lưu.
    - `getUserTrips` & `getTripDetails`: Quản lý chuyến đi và lịch trình chi tiết.
    - `getBudgetSummary`: Kiểm soát chi phí và ngân sách.
    - `getDiaryEntries`: Đọc nhật ký du lịch của người dùng.
    - `searchPlaces`: Đề xuất địa điểm mới thông minh.

### 3. Cập nhật AI Service ([ai.service.ts](file:///C:/Users/PC/Documents/GitHub/SE346_Travel_App_BE/src/services/ai.service.ts))
- Xử lý tin nhắn và kết nối với `groqService`.

### 4. API Endpoint ([ai.routes.ts](file:///C:/Users/PC/Documents/GitHub/SE346_Travel_App_BE/src/routes/ai.routes.ts))
- `POST /api/v1/ai/chat`: Endpoint duy nhất cho chatbot, bảo mật bằng JWT.

## Cách sử dụng (Dành cho Frontend)
AI sẽ tự động gọi các hàm khi người dùng đặt câu hỏi. Ví dụ:
- "Tui đã lưu những địa điểm nào rồi?" -> AI gọi `getUserFavorites`.
- "Hồ sơ của tui có gì?" -> AI gọi `getUserProfile`.
- "Chuyến đi Đà Lạt của tui có nhật ký nào không?" -> AI gọi `getDiaryEntries`.

## Verification Summary
- **Function Calling**: Đã kiểm tra AI có thể gọi nhiều hàm cùng lúc (ví dụ: lấy chuyến đi rồi lấy ngân sách).
- **Security**: Chỉ truy xuất dữ liệu thuộc về `userId` từ token JWT.
- **Prompt Engineering**: System prompt đã được tối ưu hóa để AI luôn chủ động và không bao giờ từ chối yêu cầu truy cập dữ liệu hợp lệ.
