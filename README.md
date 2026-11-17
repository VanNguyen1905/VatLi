# LABVIRT — Phòng thực hành Vật lý ảo

Website học tập và quản lý phòng thí nghiệm **Vật lý bán dẫn & Linh kiện**, kết hợp giao diện React, phòng Blender tương tác bằng Three.js, trợ giảng Biscot và các dịch vụ Firebase.

**Website đang sử dụng:** https://labthuchanh.web.app  
**Repository:** https://github.com/VanNguyen1905/VatLi  
**Bản nguồn công khai:** xuất ngày 17/11/2026 từ source LABVIRT hiện tại, bao gồm nâng cấp Biscot làm mẫu R1 và hỗ trợ tự thực hành R2.

> Đây là mã nguồn để cài đặt, phát triển và build. Repository không chứa tài khoản đăng nhập, mật khẩu, khóa quản trị Firebase, dữ liệu sinh viên, bản backup hay `node_modules`. Cấu hình production phải được người quản trị cung cấp riêng. Clone repository không tự tạo hoặc sao chép dữ liệu Firebase.

## 1. Các chức năng chính

### Dành cho sinh viên

- Đăng nhập, xem tổng quan, danh mục thí nghiệm và lộ trình thực hành hợp nhất.
- Chương trình gồm **3 bài lớn, 11 phần thực hành**: Bài 1 có 4 phần, Bài 2 có 3 phần, Bài 3 có 4 phần.
- Vào phòng Blender, thay đổi góc nhìn, phóng gần breadboard và tương tác với các thiết bị.
- DMM: lựa chọn thang đo, kết nối jack COM/VΩ, thao tác hai que đo và đọc kết quả.
- Bài 1 Phần 1 có 6 mẫu linh kiện R/C/L, 18 trường hợp SỐNG/CHẠM/ĐỨT và Bảng số liệu 1.1.
- Những phần còn lại có module bán dẫn/transistor, thông số, mạch và bảng ghi tương ứng trong source.
- Xuất số liệu Excel/CSV; xem tiến độ và báo cáo theo quyền tài khoản.
- Biscot hỗ trợ kiến thức, hướng dẫn thao tác và giải thích trạng thái hiện tại.

### Dành cho quản trị

- Quản lý giáo án, thí nghiệm, danh mục thiết bị, lớp và hồ sơ sinh viên.
- Theo dõi tiến độ, số liệu thực hành và báo cáo theo quyền được cấp.
- Cơ chế theo dõi phòng và xem canvas trực tiếp có sẵn trong mã nguồn; phụ thuộc cờ cấu hình, quyền Firestore và khả năng kết nối WebRTC.
- Quyền quản trị được xác minh theo Firebase Auth/custom claims và Rules. Việc nhìn thấy một nút trong giao diện không thay thế kiểm tra quyền ở backend.

**Lưu ý về đo lường:** số đọc là kết quả mô hình mô phỏng theo mẫu giáo trình, không phải dữ liệu từ thiết bị vật lý ngoài đời. Việc mở phòng hoặc có số đọc ở client không tự tạo điểm số đã được giảng viên xác nhận.

## 2. Biscot tương tác trong phòng

Nâng cấp hiện tại tập trung vào **Bài 1 Phần 1**:

1. Hiện hướng dẫn hologram sau khi phòng đã sẵn sàng, không phát video intro cũ.
2. Người học chọn **Xem Biscot làm mẫu R1**.
3. Biscot thực hiện timeline 8 bước: giới thiệu, chọn R1, chuẩn bị DMM, cắm jack, đưa hai que tới hai đầu linh kiện, đọc số, giải thích dung sai và ghi dòng minh họa.
4. Camera, núm xoay, dây/que và LCD sử dụng trạng thái thật của cảnh và measurement engine.
5. **DEMO BISCOT** là dòng riêng, không tăng 18 trường hợp của sinh viên, không gửi thành kết quả học tập và không được đưa vào file xuất kết quả sinh viên.
6. Sau demo chuyển sang R2, DMM OFF và ngắt tiếp xúc để người học tự thao tác.

Điều khiển hỗ trợ: **Tạm dừng / Tiếp tục / Xem lại / Bỏ qua**, tốc độ **0.75× / 1× / 1.25×**, phụ đề, tùy chọn đọc lời thoại, mức giải thích và tắt/bật gợi ý chủ động.

Ví dụ hiện tại: R1 danh định 1000 Ω ±5%, mẫu mô phỏng 996 Ω; R2 danh định 10000 Ω ±5%, mẫu mô phỏng 10120 Ω. Biscot tính khoảng dung sai từ dữ liệu engine; không thay số của engine để khớp một ví dụ trong hội thoại.

### Cách thao tác

| Thao tác | Cách dùng |
|---|---|
| Di chuyển bảng điều khiển | Kéo thanh tiêu đề |
| Thu gọn / mở rộng bảng | Nút − / + |
| Đổi kích thước bảng thiết bị | Kéo góc dưới hoặc dùng phím mũi tên khi chọn nút resize |
| Di chuyển DMM | Kéo thân đồng hồ trong cảnh 3D |
| Xoay DMM | Giữ Shift rồi kéo thân đồng hồ |
| Cắm jack | Kéo đầu cắm tới cổng phù hợp hoặc dùng điều khiển hiện có |
| Đo linh kiện | Đặt hai đầu kim vào hai chân khác nhau, đúng thang và đúng jack |
| Quan sát breadboard | Chọn “Sát breadboard” trên thanh camera |
| Khôi phục vị trí | “Đặt lại DMM” / “Đặt lại bố cục” trong hướng dẫn |

Vị trí, kích thước và trạng thái thu gọn bảng được lưu ở localStorage như **sở thích giao diện**. Đây không phải cơ chế lưu dữ liệu quản trị.

## 3. Công nghệ và yêu cầu

| Thành phần | Công nghệ |
|---|---|
| Giao diện chính | React, TypeScript, React Router, Zustand |
| Build | Vite, Tailwind CSS |
| Phòng 3D | Three.js, OrbitControls, GLTFLoader, GLB xuất từ Blender |
| Đăng nhập / dữ liệu | Firebase Authentication, Cloud Firestore |
| AI | Gateway Firebase AI Logic / Gemini, App Check theo cấu hình hiện có |
| Backend bổ sung | Cloud Functions trong `functions/` |
| Kiểm tra | TypeScript, Oxlint, Node tests, Playwright/Edge |

- Node.js theo `.nvmrc`: **24.12.0** cho frontend.
- npm đi kèm Node; dùng `package-lock.json` để cài đúng dependency.
- Backend `functions/` khai báo **Node 22**, độc lập với phiên bản Node dùng cho frontend.
- Trình duyệt hỗ trợ WebGL và tăng tốc phần cứng. Phòng 3D có tài nguyên tương đối lớn; tốc độ tải phụ thuộc máy, mạng và GPU.
- Windows có thể dùng file CMD đi kèm; macOS/Linux dùng các lệnh npm tương ứng.

## 4. Cài đặt và chạy local

```bash
git clone https://github.com/VanNguyen1905/VatLi.git
cd VatLi
npm ci
```

Tạo cấu hình riêng:

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

```bash
# macOS / Linux
cp .env.example .env.local
```

Điền các biến trong `.env.local` theo project Firebase được cấp quyền. **Không commit file này.** Sau đó:

```bash
npm run dev
```

Mở địa chỉ Vite in trong terminal, mặc định `http://localhost:5173`.

Trên Windows có thể chạy **`MO_LABVIRT_BISCOT_LOCAL.cmd`** sau khi cài dependency. File này mở Vite local và trình duyệt; không deploy Firebase.

Nếu chưa có cấu hình Firebase hợp lệ, các thao tác đăng nhập, đồng bộ hoặc AI online sẽ không hoạt động đầy đủ. Không coi fallback local là bằng chứng kết nối production thành công.

## 5. Biến môi trường

Mọi biến `VITE_*` được đưa vào mã frontend sau build, vì vậy **không đặt service-account key, mật khẩu hoặc secret server vào biến VITE**.

| Biến | Mục đích |
|---|---|
| `VITE_FIREBASE_API_KEY` | Cấu hình Firebase Web App |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domain Authentication |
| `VITE_FIREBASE_PROJECT_ID` | Project Firebase |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket của project |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase Web App ID |
| `VITE_FIREBASE_APPCHECK_SITE_KEY` | Site key reCAPTCHA Enterprise/App Check công khai |
| `VITE_ADMIN_LOGIN_EMAIL` | Ánh xạ đăng nhập Admin theo cấu hình hiện có |
| `VITE_USE_FIREBASE_EMULATOR` | `true` khi dùng Emulator local |
| `VITE_LAB_PROGRESS_SYNC` | Bật luồng đồng bộ tiến độ liên quan khi Rules/backend đã đáp ứng |
| `VITE_TRANSISTOR_PROGRESS_SYNC` | Bật đồng bộ các phần transistor khi đã nghiệm thu backend |
| `VITE_LAB_CANVAS_LIVE` | Cờ tính năng xem canvas phòng trực tiếp |

Các cờ đồng bộ không được mặc định coi là an toàn chỉ vì build thành công. Cần kiểm tra Rules và quyền Student/Admin của môi trường đích trước khi bật.

Khi dùng Emulator, frontend hiện kết nối Auth tại `localhost:9099`, Firestore tại `localhost:8080`. Cần tự khởi động các Emulator tương ứng bằng cấu hình môi trường kiểm thử của người quản trị; repository công khai không mang theo dữ liệu hoặc profile Emulator riêng của máy phát triển.

## 6. Cấu trúc mã nguồn

```text
VatLi/
├── src/
│   ├── components/             # Layout và UI React
│   ├── features/auth/          # Đăng nhập / đăng ký
│   ├── features/lab/           # Nghiệp vụ, tiến độ, giáo trình
│   ├── features/lab-admin/     # Dashboard và công cụ quản trị
│   ├── features/lab-live/      # Canvas streaming và signaling
│   ├── features/ai-tutor/      # Biscot, live context và gateway
│   ├── features/labvirt-portal/# React nhúng Studio
│   ├── services/firebase/     # Kết nối Firebase và AI
│   ├── stores/                # Auth và trạng thái ứng dụng
│   ├── routes/                # Điều hướng
│   └── tests/                 # Kiểm tra nghiệp vụ frontend
├── public/labvirt/
│   ├── index.html             # Studio / danh mục & lộ trình
│   ├── lab-v11/               # Runtime phòng Blender đang dùng
│   │   ├── assets/            # GLB và manifest/anchor gốc
│   │   ├── measurement-core.js# Engine mẫu R/C/L
│   │   ├── biscot-tutor*.js   # Context, timeline và UI hướng dẫn
│   │   └── vendor/three/      # Thư viện Three.js kèm giấy phép
│   └── live/                  # Kết nối canvas phòng
├── public/utt-*/              # Tài nguyên và module tương thích còn được giữ
├── assets/                    # Manifest thiết bị
├── functions/                 # Source Cloud Functions và tests
├── scripts/                   # Kiểm thử Biscot
├── firestore.rules            # Security Rules
├── firestore.indexes.json     # Khai báo index
├── firebase.labmoi.json        # Cấu hình Hosting target labmoi
├── firebase.json              # Cấu hình nền; không dùng deploy toàn bộ tùy tiện
├── .env.example               # Mẫu cấu hình, không có secret
└── MO_LABVIRT_BISCOT_LOCAL.cmd
```

Một số thư mục `utt-*` được giữ để các đường dẫn/tài nguyên cũ tiếp tục hoạt động. Không xóa chỉ dựa vào tên phiên bản. Không sửa `node_modules`; sửa source ứng dụng, runtime hoặc cấu hình tương ứng.

### Các URL chính

| URL | Chức năng |
|---|---|
| `/` | Tổng quan |
| `/login`, `/register` | Tài khoản |
| `/experiments` | Thí nghiệm và lộ trình hợp nhất |
| `/roadmap`, `/module-1` | Chuyển tiếp sang danh mục hợp nhất |
| `/my-practices` | Thực hành của tôi |
| `/lab-reports` | Kết quả và báo cáo |
| `/settings` | Cài đặt tài khoản |
| `/admin/lab` | Quản trị theo quyền |
| `/labvirt/lab-v11/index.html` | Runtime 3D độc lập; không tương đương phiên học đã đăng nhập trong React |

## 7. Dữ liệu, quyền và bảo mật

- Dữ liệu lâu dài và quyền phải gắn với schema Firestore hiện có. Không tạo collection khác chỉ để né Rules.
- Điểm số đã xác minh phải do backend hoặc giảng viên có quyền xác nhận; không tin cờ `verified` do client tự gửi.
- Các số đo local, dữ liệu demo và thông tin “đã mở phòng” không tự trở thành kết quả được duyệt.
- Không tắt App Check hoặc nới Rules để chữa lỗi AI/permission.
- Repo này đã thay tên/MSSV viết sẵn trong các ví dụ giao diện và test bằng dữ liệu minh họa. Không có danh sách lớp thật hoặc tài khoản Auth được xuất vào repo.
- Bản source công khai đã được tách khỏi lịch sử checkpoint riêng, log QA, credential cache và các bản sao lưu trên máy phát triển.
- Không commit `.env.local`, file service-account/adminsdk, token GitHub, profile trình duyệt, dữ liệu xuất từ Firestore hoặc file danh sách sinh viên.

## 8. Build và kiểm thử

```bash
npm run lint
npm test
npm run test:qa
npm run build
npm run preview
```

- `npm run build` chạy TypeScript trước rồi build Vite, tạo `dist/`.
- `npm test` kiểm tra các nghiệp vụ frontend.
- `npm run test:qa` trong bản công khai chạy các test Biscot kèm repository. Bộ hồi quy nội bộ lịch sử không được đóng gói toàn bộ vì có phụ thuộc dữ liệu QA/backup riêng.
- Cảnh báo chunk lớn của Vite không đồng nghĩa build thất bại, nhưng vẫn cần theo dõi tải và hiệu năng.

### Kiểm thử trình duyệt Biscot

```bash
# Cài tạm công cụ kiểm thử, không sửa package-lock
npm install --no-save --package-lock=false playwright
node scripts/qa-biscot-tutor.mjs
```

Script hiện dùng **Microsoft Edge** (`channel: 'msedge'`), tạo profile cô lập và server local tự động. Máy cần có Edge. Kết quả/screenshot nằm trong `docs/labvirt-final-qa/biscot-tutor/` và được gitignore.

Kiểm tra gồm: demo R1, pause/resume, jack, que đo, LCD, dung sai, dòng DEMO riêng, bàn giao R2, thao tác pointer trên canvas thật, kéo/xoay DMM, panel, chẩn đoán sai thang/sai jack, O.L, replay/skip, mobile landscape và Console. Script chặn yêu cầu ra origin bên ngoài, không dùng account production.

### Backend tests

```bash
cd functions
npm ci
npm run check
npm test
```

Tests của backend không thay thế kiểm thử Firestore Rules bằng Emulator. Trước mọi thay đổi Rules cần bổ sung kiểm thử phân quyền Student/Admin trên môi trường cô lập.

### Kết quả đã ghi nhận trước khi xuất source

| Hạng mục | Kết quả |
|---|---|
| TypeScript + Vite build | PASS |
| Oxlint và kiểm tra ESLint các file thay đổi | PASS trong workspace phát triển |
| Bộ test nghiệp vụ TypeScript | PASS |
| Bộ hồi quy Node nội bộ | 546/546 PASS, gồm 18 test Biscot mới |
| Edge WebGL local | 20 nhóm kiểm tra PASS |
| React build → Studio → Blender | PASS |
| 34 tài nguyên bất biến | SHA-256 giữ nguyên |
| Gemini production / giọng nói thực | NOT VERIFIED trong đợt QA này |
| Browser sau phát hành Hosting | NOT VERIFIED; phiên kiểm thử live bị giới hạn công cụ |

Các số liệu trên là bằng chứng cho bản phát triển đã nghiệm thu, không thay thế việc chạy lại test trên máy mới. Source công khai cần cấu hình môi trường riêng.

## 9. Triển khai Firebase Hosting đúng site

Môi trường hiện tại của chủ dự án:

- Firebase project: **`virtual-lab-83b87a7d`**
- Hosting target: **`labmoi`**
- Hosting site: **`labthuchanh`**
- Website: **https://labthuchanh.web.app**
- Site cũ cần giữ: **`ladthuchanh.web.app`** (chú ý khác một ký tự).

`.firebaserc` riêng của máy không được commit. Người có quyền triển khai cần đăng nhập và thiết lập mapping local:

```bash
npx firebase-tools login
npx firebase-tools target:apply hosting labmoi labthuchanh --project virtual-lab-83b87a7d
```

Sau khi kiểm tra cấu hình môi trường và các test đạt:

```bash
npm run build
npx firebase-tools deploy --only hosting:labmoi --config firebase.labmoi.json --project virtual-lab-83b87a7d
```

**Không chạy `firebase deploy` trống tham số.** Lệnh triển khai Hosting không bao gồm Rules/Functions/Auth hoặc dữ liệu người dùng. Mọi thay đổi backend cần kiểm thử và phê duyệt riêng. Upload source lên GitHub cũng không tự deploy Hosting; repo không kèm GitHub Actions tự phát hành.

Bản Hosting Biscot đã phát hành lúc **20:26 ngày 16/11/2026 (UTC+7)**, version **`f5020b55a878d3cf`**. CLI xác nhận thành công; kiểm tra tương tác trên bản live chưa hoàn thành do giới hạn công cụ, không báo PASS production thay cho QA local.

### Sau deploy cần kiểm tra

1. Trang chủ, đăng nhập và danh mục/lộ trình.
2. Vào phòng 3D; Console/Network không có lỗi JS hoặc asset 404.
3. Demo R1, tự đo R2, kết quả và Excel/CSV.
4. Cache/service worker có nhận tài nguyên mới không.
5. Luồng đồng bộ theo tài khoản kiểm thử được cấp phép; không ghi thử vào tài khoản sinh viên thật tùy tiện.
6. Biscot/Gemini và App Check bằng môi trường được phép.

## 10. Các giới hạn cần biết

- Mascot hologram là **sprite 2D với CSS**, không phải nhân vật 3D có rig tay/mắt.
- Thân DMM, núm và que dùng mesh gốc. Đầu grip của dây được bổ sung ở runtime vì asset nguồn không có jack rời để kéo.
- Demo 8 bước hiện dành cho **R1 Bài 1 Phần 1**. Những phần khác giữ cơ chế hướng dẫn hiện có.
- TTS/STT phụ thuộc trình duyệt, hệ điều hành, quyền mic và dịch vụ nhận giọng nói. Luôn có nhập chữ/phụ đề dự phòng.
- Hướng dẫn chẩn đoán local được phân biệt với câu trả lời Gemini, không giả lập AI online khi mất mạng.
- Một lượt QA máy phát triển ghi nhận ~31.7 giây đến render và ~35.6 giây đến thấy phòng qua React. Đây không phải cam kết tốc độ; tối ưu mở phòng vẫn cần đánh giá riêng.
- Khả năng canvas live/WebRTC phụ thuộc mạng, signaling, quyền và cấu hình; không bảo đảm mọi mạng NAT đều kết nối được.
- Kho tài nguyên có license của thư viện đi kèm; repo chưa bổ sung giấy phép sử dụng tổng thể. Repo công khai không có nghĩa mọi hình ảnh, giáo trình và asset đều được cấp phép tái sử dụng tự do.

## 11. Xử lý lỗi thường gặp

| Hiện tượng | Kiểm tra |
|---|---|
| VS Code báo không tìm thấy React | Mở đúng thư mục có `package.json`, chạy `npm ci`; không mở source backup rời |
| Thiếu cấu hình Firebase | Kiểm tra `.env.local`, tên biến VITE, restart Vite sau khi sửa |
| Đăng nhập bị từ chối | Kiểm tra project, domain Auth và tài khoản thật; không tạo UID giả |
| Firestore permission-denied | Kiểm tra UID/claims/schema/Rules của môi trường; không nới quyền toàn bộ |
| App Check 403 / Gemini lỗi | Kiểm tra domain, site key, quyền và cấu hình dịch vụ; không tắt enforcement |
| DMM không cho ghi | Kiểm tra jack, thang đo, hai chân khác nhau, vị trí linh kiện và nguồn mạch |
| O.L | Phân biệt mẫu hở mạch hợp lệ với chưa đủ điều kiện đo theo trạng thái engine |
| Phòng mở chậm | Kiểm tra Network tải GLB, WebGL/GPU, RAM và Console; tránh mở nhiều tab 3D cùng lúc |
| Chưa thấy giao diện mới | Kiểm tra URL site, cache/service worker và version đã phát hành |
| Windows `uv_os_get_passwd ENOMEM` khi chạy tsx | Đã gặp trong sandbox công cụ; thử terminal Windows bình thường với cùng Node trước khi kết luận source lỗi |

## 12. Quy trình phát triển và bảo trì

1. Tạo nhánh Git và checkpoint trước khi sửa.
2. Xác định đúng file React hoặc runtime liên quan; giữ nguyên tài nguyên Blender khi không có yêu cầu thay mô hình.
3. Chạy kiểm tra phù hợp, kiểm thử canvas thật nếu thay tương tác Three.js.
4. Ghi rõ PASS / FAIL / NOT VERIFIED; không lấy dữ liệu minh họa làm bằng chứng production.
5. Review diff, kiểm tra dữ liệu nhạy cảm trước khi push.
6. Build rồi deploy riêng Hosting khi được chủ dự án cho phép.
7. Lưu version phát hành để rollback Hosting về bản trước nếu cần; không rollback dữ liệu Firestore bằng cách deploy frontend.

Để báo lỗi, ghi rõ URL, bài/phần, bước tái hiện, trình duyệt, lỗi Console đã che thông tin riêng và ảnh minh họa. Không đưa mật khẩu, token, danh sách lớp hoặc dữ liệu cá nhân vào issue công khai.
