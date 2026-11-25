---
name: jp-psy-editing
description: So độ dài, nhịp cảnh, kiểu phụ đề và lớp phủ của các video tâm lý học tiếng Nhật đang thắng với cấu hình dựng của mình, rồi đề xuất độ dài mục tiêu, số giây mỗi cảnh, kiểu phụ đề và lớp phủ nên bật / tắt cho từng kênh — bản skill của bộ não "Dựng video" (editing) trong dammo, lưu vào bộ nhớ bộ não. Dùng khi người dùng hỏi "dựng video", "độ dài video bao nhiêu", "nhịp cảnh", "giây mỗi cảnh", "phụ đề", "caption style", "overlay", "audio bar", "render setting", hoặc gõ "editing" / "editing <tên kênh>".
---

# Dựng video (bộ não `editing`)

Đọc `.claude/skills/_shared/brain-skill-common.md` trước.

**Việc của skill:** học các lựa chọn dựng của video đang thắng (độ dài, nhịp, phụ đề, lớp phủ) để chỉnh cấu hình render của mình.

## Lệnh
- `editing`: mọi kênh.
- `editing <tên kênh>`: một kênh.

## Quy trình
1. `npm run -s brain -- prompt editing`.
2. Đọc bộ nhớ:
   - `editing` (`pattern`, `recipe`): key `edit-<channel id>`;
   - `jp-psy-trends` (`video`) và `competitors` (`video`, `pattern`): mỗi video có số phút và view/giờ;
   - `voice` và `images` (`recipe`): giọng và hình đã đề xuất, để nhịp dựng khớp.
3. So các dải độ dài (dưới 10, 10–15, 15–20, 20–30, trên 30 phút) theo view/giờ. Chạy `call editing channel_snapshot '{"channelId":"UC…"}'` trên 3–5 kênh để xem video vượt chuẩn của kênh dài hơn hay ngắn hơn video thường của chính kênh đó.
4. Xem khung hình của 6–12 video thắng:
   ```bash
   cd server && npm run -s brain -- call editing view_video_frames '{"videoIds":["…"]}' --out <scratchpad>/frames
   ```
   Mở từng ảnh bằng Read. Ghi nhận:
   - kiểu phụ đề: cỡ, màu, viền, vị trí, một hay hai dòng;
   - từ khoá trên màn hình, thẻ chương, thanh tiến trình;
   - logo kênh, lời mời đăng ký;
   - hình có đổi giữa các khung không.
5. `call editing my_channel_setup`, `call editing list_my_productions` và `npm run -s brain -- productions`: caption style, lớp phủ, mật độ cảnh (`max scene sec`), độ dài thật và số giây mỗi cảnh của các video đã làm.
6. Lưu (`save editing`):
   - **pattern** (4–8): công thức dựng kèm bằng chứng (độ dài "ngọt", nhịp cảnh, kiểu phụ đề, độ dài mở đầu…), `links` tới `video:<id>`.
   - **recipe**, mỗi kênh một nơ-ron:
     - `key` = `edit-<channel id>`; `label` = "Dựng cho <tên kênh>";
     - `detail` = khoảng độ dài mục tiêu, số giây mỗi cảnh (và giá trị max-scene-seconds nên đặt), lời khuyên về caption style, lớp phủ nên bật hay tắt (audio bar, subscribe, small video), cách xử lý mở đầu và kết, mỗi ý kèm bằng chứng;
     - `heat` = tác động dự kiến.
7. Báo cáo `docs/brains/editing/YYYY-MM-DD.md`, gồm:
   - bảng dải độ dài và view/giờ (số video mỗi dải);
   - các công thức dựng;
   - bảng theo kênh: hiện tại → đề xuất (độ dài, giây mỗi cảnh, caption, overlay).

## Luật riêng
- View/giờ phụ thuộc chủ yếu vào chủ đề và cách đóng gói. Độ dài và cách dựng là nguyên nhân yếu hơn; nói rõ điều này, nhất là khi mẫu nhỏ.
- Chỉ đề xuất: không đổi cấu hình kênh, không render.
- Tiếp theo trong chuỗi: `jp-psy-publish`.
