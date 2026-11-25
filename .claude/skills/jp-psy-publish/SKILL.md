---
name: jp-psy-publish
description: Lập lịch đăng 7 ngày tới cho các kênh tâm lý học tiếng Nhật của mình — video nào xong thì lên khung giờ nào (JST), video trúng chủ đề nóng được chen lên trước, kênh nào sắp hết video, video nào còn thiếu title / thumbnail — và học nhịp đăng của đối thủ; bản skill của bộ não "Đăng video" (publish) trong dammo, lưu lịch vào bộ nhớ bộ não. Dùng khi người dùng hỏi "lịch đăng", "khi nào đăng", "giờ đăng tốt", "hàng chờ đăng", "kênh nào sắp hết video", "đối thủ đăng lúc nào", hoặc gõ "publish" / "lịch tuần này".
---

# Đăng video (bộ não `publish`)

Đọc `.claude/skills/_shared/brain-skill-common.md` trước.

**Việc của skill:** quyết định mỗi video đã xong nên đăng **khi nào** và **theo thứ tự nào**, và giữ nhịp đăng của từng kênh đều đặn. Skill chỉ lập lịch; người dùng hoặc mô-đun upload mới là bên đăng thật.

## Lệnh
- `publish`: lịch 7 ngày cho mọi kênh.
- `publish <tên kênh>`: một kênh.

## Quy trình
1. `npm run -s brain -- prompt publish`. Lấy ngày giờ hiện tại theo JST (`TZ=Asia/Tokyo date`) để mọi ngày trong lịch là ngày thật.
2. `call publish publish_queue`: video đã xong, đang làm, đang chờ của từng kênh, kèm tần suất, khung giờ, lần đăng cuối. `call publish my_channel_setup` để có thêm cấu hình. Chạy thêm `npm run -s brain -- productions` để thấy các video remake / reup đang ở trạng thái Prepared / Created, title và có thumbnail chưa: đây là phần lớn hàng chờ thật.
3. `call publish list_watchlist`, rồi `call publish upload_rhythm '{"channelId":"UC…"}'` trên 5–8 kênh đối thủ mạnh, để biết:
   - họ đăng thứ mấy trong tuần, và giờ nào (chỉ biết giờ với video dưới 24 giờ tuổi);
   - đăng dày đến đâu;
   - thời điểm đăng có liên quan đến view/giờ không.
   
   Khán giả là người Nhật 50–70 tuổi, nên thói quen sáng sớm, cuối buổi sáng và buổi tối quan trọng. Kiểm tra giả định này bằng số liệu, đừng mặc định.
4. Đọc bộ nhớ:
   - `jp-psy-trends` (`topic`) và `ideas`: video đã xong mà trúng chủ đề đang nóng thì được chen lên trước.
   - `title-seo` và `thumbnail`: đánh dấu video sắp đăng mà chưa có đề xuất title hay thumbnail. Video có `missing title or thumbnail` trong hàng chờ thì nhắc chạy `jp-psy-ctr` cho video đó trước khi đăng.
   - `publish`: lịch cũ, để cập nhật đúng key.
5. Lưu (`save publish`):
   - **pattern**: công thức giờ đăng kèm bằng chứng (key ví dụ `upload-evening-jst`), `links` tới `channel:<UC id>` và `video:<id>`. Ghi rõ độ chính xác: chỉ biết đến mức giờ khi dựa trên video dưới 24 giờ tuổi.
   - **schedule**, mỗi video sẽ đăng trong 7 ngày tới một nơ-ron:
     - `key` = `slot-<video id hoặc run id>`;
     - `label` = "<tên kênh>: <ngày> <giờ JST> - <tiêu đề>"; `labelJa` = tiêu đề;
     - `detail` = vì sao chọn khung này và thứ tự này, còn thiếu gì (title, thumbnail, mô tả), lỡ khung thì làm gì;
     - `heat` = độ gấp (chủ đề đang nóng, kênh đã trễ lịch).
   - **schedule** cho kênh không còn video nào sẵn sàng:
     - `key` = `gap-<channel id>`;
     - `label` = "<tên kênh>: hết video sau <ngày>";
     - `detail` = cần bao nhiêu video để giữ tần suất, và nên sản xuất ý tưởng hay brief nào trước.
6. Báo cáo `docs/brains/publish/YYYY-MM-DD.md`, gồm:
   - lịch dạng bảng (Ngày | Giờ JST | Kênh | Video | Còn thiếu | Lý do);
   - các kênh sắp hết video;
   - nhịp đăng của đối thủ.

## Luật riêng
- Ngày phải là ngày lịch thật tính từ hôm nay, theo JST.
- Chỉ lập lịch: không upload, không đổi khung giờ trong cấu hình kênh.
- Tiếp theo trong chuỗi: `jp-psy-studio`.
