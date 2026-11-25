---
name: jp-psy-cluster
description: Tạo nội dung cho kênh YouTube tâm lý học / khoa học não bộ tiếng Nhật theo 11 cụm K1–K11 của dammo. Dùng skill này mỗi khi tin nhắn bắt đầu bằng mã cụm K1…K11 (viết hoa hay thường) kèm một việc — "K1 mascot" (3 prompt tạo mascot trên Flow), "K5 channel" (3 bộ tên kênh, handle, mô tả, tags, prompt avatar và banner), "K8 videos" (10 chủ đề title + summary), "K2 video <title> <summary>" (viết kịch bản tiếng Nhật 12–30 phút đúng format ô Kịch bản của app, qua `script check`) — hoặc khi người dùng muốn mascot, thông tin kênh, ý tưởng video hay kịch bản cho một cụm tâm lý Nhật (人生後半, 脳科学, お金持ち, 人間関係, ひとり時間, ブッダの教え...), kể cả khi không gõ đúng cú pháp.
---

# Cụm tâm lý tiếng Nhật (K1–K11)

Lệnh có dạng `{K} {việc} [tham số]`. Skill này gom lại những gì đã phân tích cho từng cụm (khán giả, ngách nhỏ, format title + thumbnail, mascot, nhận diện kênh) để mọi đầu ra của cùng một cụm nhất quán với nhau và với hệ thống tạo video của dammo.

## Bước 1 — Đọc lệnh
- `{K}`: K1…K11, không phân biệt hoa thường. Thiếu hoặc sai mã cụm thì hỏi lại, kèm bảng cụm trong `references/common.md`.
- `{việc}`:
  - `mascot` → `references/tasks/mascot.md`
  - `channel` (hoặc `kênh`) → `references/tasks/channel.md`
  - `videos` (số nhiều, hoặc "chủ đề") → `references/tasks/videos.md`
  - `video {title} {summary}` (số ít) → `references/tasks/video.md`. Title bắt buộc; nếu thiếu thì hỏi. Phần còn lại sau title là summary (có thể trống). Title tiếng Nhật thường dừng ở dấu cách hoặc xuống dòng đầu tiên sau nó; nếu không chắc chỗ tách title / summary thì coi dòng đầu là title.

## Bước 2 — Đọc ngữ cảnh
Luôn đọc theo thứ tự:
1. `references/common.md` — bối cảnh, bảng cụm, tên kênh đã có, luật chung.
2. `references/clusters/{k}.md` — dữ liệu của đúng cụm được gọi (k viết thường, ví dụ `k8.md`).
3. File việc tương ứng ở bước 1.

Với `channel`, `videos`, `video`: nếu cần format title chi tiết hơn, đọc thêm prompt meta của cụm ở `server/data/prompts/ja/metadata_tlnb_{k}/step-1.js`; file đó là bản đang chạy trong hệ thống, nên khi khác với file cụm thì theo file đó.

## Bước 3 — Làm việc và trả lời
Làm đúng hướng dẫn và định dạng trả lời trong file việc. Giải thích cho người dùng bằng tiếng Việt; nội dung cho người xem (title, mô tả kênh, tags, kịch bản, chữ trên banner) bằng tiếng Nhật; prompt tạo ảnh bằng tiếng Anh.

Nếu người dùng gọi nhiều việc liền nhau trong cùng cuộc trò chuyện (ví dụ `K8 mascot` rồi `K8 channel`), dùng lại kết quả trước: kênh thứ i dùng mascot thứ i, chủ đề video không trùng các title đã tạo.
