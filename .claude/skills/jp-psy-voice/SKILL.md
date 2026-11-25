---
name: jp-psy-voice
description: Chọn giọng VOICEVOX và tốc độ đọc cho từng kênh tâm lý học tiếng Nhật của mình dựa trên số đo thật của các video đã sản xuất (ký tự/phút, thời lượng thật so với mục tiêu) và điều người xem lớn tuổi nói về giọng đọc trong bình luận — bản skill của bộ não "Giọng đọc" (voice) trong dammo, lưu công thức giọng vào bộ nhớ bộ não. Dùng khi người dùng hỏi "giọng đọc", "voicevox", "tốc độ đọc", "speedScale", "video dài hơn dự kiến", "lời dẫn nhanh / chậm quá", "chọn speaker", hoặc gõ "voice" / "voice <tên kênh>".
---

# Giọng đọc (bộ não `voice`)

Đọc `.claude/skills/_shared/brain-skill-common.md` trước.

**Việc của skill:** quyết định mỗi kênh dùng giọng VOICEVOX nào và tốc độ đọc bao nhiêu, đồng thời giữ cho lời dẫn đúng thời lượng mục tiêu.

## Lệnh
- `voice`: mọi kênh đang hoạt động.
- `voice <tên kênh>`: một kênh.

## Quy trình
1. `npm run -s brain -- prompt voice`.
2. Đọc dữ liệu:
   - `call voice list_voices`: giọng đã cài và id style. Chỉ được đề xuất id có trong danh sách này. VOICEVOX không chạy thì công cụ báo vậy; khi đó chỉ đề xuất dựa trên các video đã làm và nói rõ chưa đọc được danh sách giọng.
   - `call voice my_channel_setup`.
   - `call voice list_my_productions '{"limit":40}'`: speaker, tốc độ, ký tự/phút đo được, thời lượng thật so với mục tiêu của từng video.
   - `npm run -s brain -- productions --limit 30`: video remake / reup, với speaker, tốc độ, thời lượng, ký tự/phút và `audioSpeed` lấy từ `remake-state.json` và `ai-render-config.json`. Đây thường là nguồn số đo chính.
   - `read_memory` của `voice`: công thức cũ, key `voice-<channel id>`.
3. `read_memory` của `audience` (`insight`, `keyword`): người xem lớn tuổi nói gì về lời dẫn (nhanh quá, khó nghe, giống máy, dễ chịu, dễ ngủ…).
4. Lấy 3–5 video nóng (`read_memory` của `jp-psy-trends`, kind `video`) rồi `video_comments`, tìm bình luận nói về giọng, tốc độ, âm lượng nhạc nền, chữ dễ đọc. Ghi lại khi bình luận hay tiêu đề cho thấy kênh thắng dùng người đọc thật hay giọng máy.
5. Tính cho từng kênh: ký tự/phút trung bình đo được, độ lệch thời lượng, và số ký tự kịch bản cần để ra đúng số phút mục tiêu.
6. Lưu (`save voice`):
   - **recipe**, mỗi kênh một nơ-ron:
     - `key` = `voice-<channel id>`; `label` = "Giọng cho <tên kênh>";
     - `detail` = speaker + style id, speedScale, ký tự/phút dự kiến, độ dài kịch bản cho đúng số phút mục tiêu, lời khuyên về ngắt nghỉ và giọng điệu cho người nghe 50–70 tuổi, kèm bằng chứng;
     - `heat` = mức tự tin × mức quan trọng lúc này.
   - **recipe** cho lỗi chung của cả pipeline khi số liệu cho thấy vấn đề (ví dụ lời dẫn luôn dài hơn dự kiến 15%: key `voice-pace-drift`).
   - **insight** cho điều người xem nói về giọng (`labelJa` = cụm bình luận thật ngắn, `links` tới `video:<id>`).
7. Báo cáo `docs/brains/voice/YYYY-MM-DD.md`, gồm:
   - bảng theo kênh: speaker hiện tại → đề xuất, speedScale, ký tự/phút đo được, lệch thời lượng, số ký tự cho số phút mục tiêu;
   - các lỗi chung của pipeline;
   - bình luận về giọng.

## Luật riêng
- Không được nói là đã "nghe" giọng nào. Chỉ đánh giá qua tên, style, số đo và bình luận.
- Chỉ đề xuất, không sửa cấu hình kênh. Chưa có video nào được sản xuất thì nói rõ và lưu ít nơ-ron.
- Tiếp theo trong chuỗi: `jp-psy-images`, `jp-psy-editing`.
