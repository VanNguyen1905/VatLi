# Virtual Lab Academy — Engineering Guidelines

- Giữ nguyên ZIP nguồn StudyFlow để dự phòng, không xóa dữ liệu người dùng khỏi Firebase.
- Ưu tiên kiến trúc: Experiment > Practical > Verified 3D Lab Session > Evidence > Assessment.
- Mọi điểm số phải xác minh server/admin, không tin trường score/verified do Unity WebGL/React client gửi.
- Chưa có Lab 3D: log WEB_PREPARATION không được xem là 3D đã thực hiện.
- Khi người dùng cung cấp khoảng 20 bài và danh sách 49 sinh viên, nhập đúng dữ liệu, không bịa tiêu đề và hồ sơ.
- Chỉ Owner được sửa bài/roster/chấm điểm ở giai đoạn đầu, cấp giáo viên có giới hạn lớp ở giai đoạn sau.
- Chạy typecheck, tests, build, kiểm tra Firestore Emulator trước production. Không báo thành công khi chưa kiểm thử.
- Không triển khai hoặc thay đổi project Firebase thật nếu chưa có chấp thuận rõ ràng.
