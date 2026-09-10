# Hướng dẫn Đóng gói PWA VKU Field Survey thành ứng dụng Android APK (Capacitor Bridge)

Tài liệu hướng dẫn đầy đủ quy trình chuyển đổi và đóng gói ứng dụng **VKU Field Survey PWA** thành file cài đặt **Android (.apk)** native sử dụng **Capacitor Bridge**.

---

## 📋 1. Môi trường Yêu cầu (Prerequisites)

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt:

1. **Node.js**: Phiên bản LTS `v18.x` hoặc `v20.x` trở lên (đi kèm `npm`).
2. **Java Development Kit (JDK)**: OpenJDK `17` hoặc `21` (Đã cấu hình biến môi trường `JAVA_HOME`).
3. **Android Studio**:
   - Cài đặt **Android SDK** (API Level 33 / 34 / 35).
   - **Android SDK Build-Tools** & **Android Emulator** (nếu muốn chạy giả lập).
   - Đã cấu hình biến môi trường `ANDROID_HOME` (Ví dụ: `C:\Users\<User>\AppData\Local\Android\Sdk`).

---

## 🚀 2. Các Bước Đóng gói Nhanh bằng Cụm Lệnh CLI (Command Line)

### Bước 1: Cài đặt các gói phụ thuộc Capacitor
Mở terminal tại thư mục gốc của dự án và chạy:
```bash
npm install
```

### Bước 2: Khởi tạo & Thêm Nền tảng Android (Nếu chưa có)
```bash
npx cap add android
```
*Lưu ý: Dự án đã được khởi tạo sẵn thư mục native `./android`.*

### Bước 3: Đồng bộ Mã nguồn Web & Plugin vào Native Android Project
Mỗi khi bạn chỉnh sửa các file web (`index.html`, `app.js`, `style.css`), hãy chạy lệnh đồng bộ:
```bash
npx cap sync
```

---

## 🛠️ 3. Biên dịch ra File APK Cài đặt (Build APK)

Có 2 cách để biên dịch ra file APK:

### Cách 1: Biên dịch trực tiếp qua Dòng lệnh CLI (Khuyên dùng - Nhanh nhất)

#### A. Build bản thử nghiệm (Debug APK)
Chạy lệnh sau tại thư mục gốc:
```powershell
# Trên Windows PowerShell:
cd android
.\gradlew assembleDebug
```
- **Vị trí file APK sau khi build xong**:
  `android/app/build/outputs/apk/debug/app-debug.apk`

#### B. Build bản phát hành chính thức (Signed Release APK)
1. **Tạo khóa Ký (Keystore)**:
   ```bash
   keytool -genkey -v -keystore vku-field-survey.keystore -alias vku_alias -keyalg RSA -keysize 2048 -validity 10000
   ```
2. **Biên dịch Release APK**:
   ```powershell
   cd android
   .\gradlew assembleRelease
   ```
- **Vị trí file APK Release**:
  `android/app/build/outputs/apk/release/app-release-unsigned.apk`

---

### Cách 2: Biên dịch qua giao diện Android Studio (Trực quan)

1. Mở dự án trong Android Studio bằng lệnh:
   ```bash
   npx cap open android
   ```
2. Đợi Android Studio hoàn tất Sync Gradle (Indexer).
3. Để tạo file APK:
   - Trên thanh menu chọn **Build** $\rightarrow$ **Build Bundle(s) / APK(s)** $\rightarrow$ **Build APK(s)**.
4. Khi quá trình build hoàn tất, Android Studio sẽ hiển thị thông báo góc dưới bên phải kèm đường dẫn mở thư mục chứa file `app-debug.apk`.

---

## 📱 4. Cài đặt & Thử nghiệm file APK trên Điện thoại Android

1. **Bật chế độ Nhà phát triển (Developer Options)** trên điện thoại:
   - Vào **Cài đặt** $\rightarrow$ **Thông tin điện thoại** $\rightarrow$ Chạm 7 lần vào **Số phiên bản (Build Number)**.
   - Bật tùy chọn **Gỡ lỗi USB (USB Debugging)** và **Cài đặt ứng dụng từ nguồn không xác định**.
2. **Cài đặt trực tiếp qua cáp USB (ADB)**:
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```
3. Hoặc copy trực tiếp file `app-debug.apk` vào điện thoại qua Zalo/Drive/Cáp sạc và mở lên bấm **Cài đặt (Install)**.

---

## ⚙️ 5. Cấu hình Cần thiết cho PWA Native (Capacitor Config)

File `capacitor.config.json` ở thư mục gốc chứa các thiết lập native quan trọng:
```json
{
  "appId": "vn.edu.vku.fieldsurvey",
  "appName": "VKU Field Survey PWA",
  "webDir": "public",
  "bundledWebRuntime": false,
  "server": {
    "androidScheme": "https"
  },
  "plugins": {
    "Camera": {
      "permissions": ["camera", "photos"]
    },
    "Geolocation": {
      "permissions": ["location"]
    }
  }
}
```

---

## ❓ 6. Xử lý Lỗi Thường gặp (Troubleshooting)

| Lỗi | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| `JAVA_HOME is not set` | Chưa cài JDK hoặc chưa đặt biến môi trường | Cài JDK 17/21 và thêm `JAVA_HOME` vào Environment Variables |
| `SDK location not found` | Gradle không tìm thấy Android SDK | Tạo file `android/local.properties` chứa: `sdk.dir=C:\\Users\\<TênUser>\\AppData\\Local\\Android\\Sdk` |
| `ERR_CLEARTEXT_NOT_PERMITTED` | Android chặn HTTP không bảo mật | Trong `capacitor.config.json` giữ nguyên `"androidScheme": "https"` |
