# VKU Field Survey PWA - Offline-First Campus Inspection App

[![PWA Ready](https://img.shields.io/badge/PWA-100%25%20Offline-brightgreen)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![Deploy with Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare_Pages-orange)](https://pages.cloudflare.com)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-black)](https://vercel.com)
[![Capacitor Ready](https://img.shields.io/badge/Capacitor-Android%20APK-blue)](https://capacitorjs.com)

**Mini-Project 1 - VKU Field Survey PWA** là ứng dụng Web Progressive (PWA) thiết kế theo cơ chế **Offline-First** phục vụ khảo sát, kiểm tra và đánh giá cơ sở vật chất (hạ tầng, phòng máy tính, điều hòa, hệ thống điện, Wi-Fi, PCCC, vệ sinh) tại các tòa nhà khuôn viên Trường Đại học CNTT & TT Việt - Hàn (VKU). 

Ứng dụng hoạt động hoàn hảo ngay cả khi thiết bị **hoàn toàn không có kết nối mạng (zero network connectivity)**.

---

## 🌟 Tính năng Nổi bật

1. **Chạy Hoàn Toàn Offline (Zero Network Connectivity)**:
   - **Service Worker (`sw.js`)**: Caching toàn bộ App Shell (HTML, CSS, JS, Icon) với chiến lược **Cache-First**. Khởi động lại ứng dụng tức thì (< 1s) mà không cần internet.
   - **IndexedDB Storage (`VKUSurveyDB`)**: Lưu trữ không giới hạn các bản ghi khảo sát, hình ảnh chụp thực tế (Base64/Blob), thông tin vị trí và tọa độ GPS trên bộ nhớ máy.

2. **Giao diện Khảo sát Đa Hạng mục Động (Dynamic Multi-Item Inspection Form)**:
   - Mỗi phiếu kiểm tra cho phép **thêm nhiều hạng mục thiết bị** (Máy tính, Điều hòa, Điện/Đèn, Bàn ghế, Mạng Wi-Fi...).
   - Mỗi hạng mục có **tình trạng riêng** (🟢 Tốt, 🟡 Bảo trì, 🔴 Hỏng hóc, 🚨 Nguy hiểm), **ghi chú sự cố riêng** và **ảnh chụp minh chứng camera riêng**.

3. **Đồng bộ Tự động (Background Sync API) & Xuất Dữ liệu Offline**:
   - **Tự động nhận diện mạng**: Huy hiệu Online 🟢 / Offline 🔴 cập nhật thời gian thực.
   - **Hàng chờ Đồng bộ (Offline Queue)**: Lưu các bản ghi chưa gửi. Tự động đồng bộ lên máy chủ ngay khi thiết bị có mạng trở lại.
   - **Xuất dữ liệu linh hoạt**: Cho phép xuất dữ liệu khảo sát ra file **CSV (mở trực tiếp bằng Excel)** và **JSON (sao lưu)** để phục vụ báo cáo khi làm việc tại khu vực không có sóng mạng.

4. **Tương thích Cloudflare Pages & Vercel**:
   - Đã được cấu hình đầy đủ file `_headers`, `_redirects` và `wrangler.toml` để triển khai lên Cloudflare Pages chạy HTTPS chính thức.

5. **Sẵn sàng Đóng gói thành App Android Native (Capacitor Bridge)**:
   - Cấu trúc thư mục chuẩn PWA (`manifest.json` standalone, PWA icons, `capacitor.config.json`) sẵn sàng đóng gói thành file **APK Android Native** chỉ với 1 câu lệnh.

---

## 📁 Cấu trúc Dự án (Project Structure)

```text
Form/
├── index.html              # Giao diện chính Single Page Application (SPA)
├── style.css               # Hệ thống CSS VKU Theme, Responsive & Component Layout
├── app.js                  # Engine chính: IndexedDB, Form động, GPS, Sync & Export logic
├── sw.js                   # Service Worker: Caching strategies & Background Sync
├── manifest.json           # PWA Manifest (Standalone display, Theme colors, Icons)
├── _headers                # Cấu hình Headers cho Cloudflare Pages (ServiceWorker / Cache)
├── _redirects              # Cấu hình SPA Redirects cho Cloudflare Pages
├── wrangler.toml           # Cấu hình Cloudflare Wrangler Deployment
├── vercel.json             # Cấu hình Deploy tự động Vercel
├── capacitor.config.json   # Cấu hình đóng gói Capacitor Android Bridge
├── TECHNICAL_REPORT.md     # Báo cáo kỹ thuật chi tiết (2-4 trang PDF ready)
└── README.md               # Hướng dẫn dự án
```

---

## 🚀 Hướng dẫn Cài đặt & Chạy cục bộ (Local Setup)

```bash
# 1. Cài đặt các gói phụ thuộc
npm install

# 2. Khởi chạy Local Web Server
npm start
```

---

## ☁️ Hướng dẫn Deploy lên Cloudflare Pages (Hoàn chỉnh 100%)

### Cách 1: Deploy tự động qua GitHub Repo (Khuyên dùng)
1. Đẩy toàn bộ mã nguồn dự án lên một **Public GitHub Repository**.
2. Truy cập [Cloudflare Dashboard](https://dash.cloudflare.com) -> Vào **Workers & Pages**.
3. Chọn **Create Application** -> **Pages** -> **Connect to Git**.
4. Chọn Repository dự án VKU Field Survey PWA.
5. Cấu hình triển khai:
   - **Framework preset**: `None`
   - **Build output directory**: `/` (hoặc `public`)
6. Bấm **Save and Deploy**. Cloudflare sẽ tự động cấp domain HTTPS dạng `https://vku-field-survey-pwa.pages.dev`.

### Cách 2: Deploy trực tiếp qua Dòng lệnh (Cloudflare CLI / Wrangler)
```bash
# 1. Đăng nhập Cloudflare bằng Wrangler
npx wrangler login

# 2. Đẩy dự án lên Cloudflare Pages ngay lập tức
npm run deploy:cloudflare
```

---

## 📱 Hướng dẫn Đóng gói thành App Android (Capacitor Bridge)

```bash
# 1. Khởi tạo Android platform cho dự án
npx cap add android

# 2. Đồng bộ mã nguồn PWA vào Android Native Studio Project
npx cap sync

# 3. Mở dự án trong Android Studio để Build file APK / App Bundle
npx cap open android
```

---

## 👨‍💻 Tác giả & Bản quyền
- **Đồ án**: Mini-Project 1 - VKU Field Survey PWA
- **Trường**: Đại học CNTT & TT Việt - Hàn (VKU)
- **Giấy phép**: MIT License
