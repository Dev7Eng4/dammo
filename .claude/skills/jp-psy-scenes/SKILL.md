---
name: jp-psy-scenes
description: Kiểm tra ảnh cảnh (image scene) của video trong dammo có khớp transcript theo khung thời gian không. Với từng cảnh - ảnh có đúng điều lời đọc đang nói không, ảnh có hiện đúng lúc lời đó vang lên không khi app ghép video, có cảnh thiếu ảnh, chồng giờ, hở giờ, lệch dần, không bao giờ hiện không. Nhận id / đường dẫn video (server/data/youtube-channels/<kênh>/videos/<videoId>), id / đường dẫn kênh, hoặc không kèm gì để quét tất cả. Chỉ kiểm tra và đề xuất, không sửa. Dùng khi người dùng hỏi "kiểm tra ảnh cảnh", "check scene", "ảnh có khớp lời / transcript / phụ đề không", "ảnh lệch lời", "hình chạy trước / chạy sau giọng đọc", "cảnh nào sai", "cảnh nào thiếu ảnh", "khung thời gian cảnh", "timeline ảnh", "duyệt ảnh trước khi ghép video", hoặc gõ "scenes" / "scenes <video>", kể cả khi không nói rõ tên skill. Chọn phong cách hình hay xem hình video đối thủ thì dùng jp-psy-images; title và bìa thì dùng jp-psy-ctr.
---

# Kiểm tra ảnh cảnh theo transcript

Hai câu hỏi tách riêng, vì cách sửa khác nhau:
- **Đúng lời:** ảnh có vẽ đúng điều transcript nói trong khung giờ của cảnh không? Sai thì vẽ lại ảnh.
- **Đúng giờ:** khi app ghép video, ảnh có hiện vào đúng khung giờ đó không? Sai thì sửa mốc giờ hoặc cách ghép; vẽ lại ảnh không giúp gì.

App neo mỗi ảnh vào mốc bắt đầu của cảnh (`resolveImageTimeline`, `buildAiTimelineSlides`): ảnh hiện cho tới khi ảnh kế bắt đầu, cảnh thiếu ảnh thì ảnh trước giữ chỗ, cảnh chồng giờ chia nhau ở giữa đoạn chồng, ảnh bị ép dưới 1 giây thì bỏ. Vì vậy lệch giờ thường đến từ **dữ liệu**: mốc cảnh sai, thiếu ảnh, hoặc audio bị cụt. Video ghép trước bản sửa ngày 2026-11-22 nối ảnh theo độ dài nên ảnh lệch dần, có khi hàng chục giây; muốn hết lệch thì ghép lại. Script tính giờ hiện bằng chính các hàm ghép của app, nên thấy ảnh lệch dần đều trở lại là dấu hiệu mã ghép hỏng.

## Chọn việc

| Người dùng gõ | Làm gì |
|---|---|
| `scenes <video>` | Kiểm tra trọn một video (các bước dưới) |
| `scenes <kênh>` | `scan <kênh>`, báo bảng, hỏi muốn xem kỹ video nào |
| `scenes` | `scan` mọi kênh, báo bảng, hỏi như trên |
| "chỉ kiểm tra giờ", "không cần xem ảnh" | Chỉ bước 1, không `save` |
| "xem lại", "force" | Chấm lại video đã có `scene-review.json` (`scan --force`) |

`scan` chỉ kiểm bằng máy nên nhanh. Xem ảnh tốn nhiều token hơn (khoảng 1 bảng cho 9 cảnh), nên không tự xem ảnh hàng loạt video khi người dùng chưa chọn.

## Lệnh

Chạy bằng Bash trong `server/`. Video hay kênh là id hoặc đường dẫn; đường dẫn Windows để trong nháy đơn.

```bash
C=../.claude/skills/jp-psy-scenes/scripts/scene-check.mts
node_modules/.bin/tsx $C scan [kênh] [--status Created] [--force]
node_modules/.bin/tsx $C check  <video> --out <scratchpad>
node_modules/.bin/tsx $C sheet  <video> --out <scratchpad>
node_modules/.bin/tsx $C frames <video> --out <scratchpad>
node_modules/.bin/tsx $C save   <video> <review.json> [--partial]
```

## Kiểm tra một video

### 1. Kiểm giờ bằng máy
`check` in tóm tắt và ghi bảng cảnh `<id>.scenes.json`. Mỗi cảnh có:
- `start`–`end`: khung giờ dự kiến; `saidPlanned`: lời trong khung đó;
- `shownStart`–`shownEnd`: lúc ảnh thật sự hiện; `saidWhileShown`: lời đang đọc lúc đó;
- `drift`: giây lệch (âm là sớm, dương là trễ); `onTime`: phần khung giờ của cảnh được chính ảnh đó phủ;
- `prompt`: prompt đã dùng để vẽ. Cảnh `type: title` là thẻ chữ.

Mọi mốc đều theo giờ của file phụ đề, đã tính `audioSpeed`.

### 2. Xem ảnh
Chạy `sheet`, mở **từng** bảng bằng Read. Nhãn mỗi ô là số cảnh và khung giờ. Ô nào nhìn chưa rõ thì mở ảnh gốc `images/scene-NNN.jpg`. Chấm bằng **ảnh thật**, không chấm bằng prompt: prompt đúng mà ảnh vẽ sai vẫn là sai.

Đọc `saidPlanned` của các cảnh trong bảng **trước** khi chấm bảng đó. Đọc cả lời của cảnh trước và sau, vì transcript tự động hay sai chữ và một câu thường vắt qua hai cảnh.

### 3. Chấm từng cảnh: ảnh so với `saidPlanned`

| Verdict | Khi nào |
|---|---|
| `ok` | Người, việc, nơi chốn hoặc cảm xúc chính của lời có trong ảnh. Ẩn dụ được tính `ok` khi người xem 50–70 tuổi hiểu ngay nó nói về câu đang nghe |
| `weak` | Đúng chủ đề chung nhưng không phải điều đang nói; ẩn dụ khó hiểu; thiếu vật then chốt; khung dài trên 30 giây mà lời đã sang ý khác nhưng ảnh chỉ vẽ ý đầu |
| `wrong` | Sai người (tuổi, giới, nhân vật khác), sai việc, trái cảm xúc, thuộc đoạn khác của câu chuyện, tiết lộ trước kết cục, hoặc lỗi hiển thị rõ (chữ lạ, mặt hay tay dị dạng) |

Ngoài ra để ý cả chuỗi: một nhân vật phải giữ nguyên tuổi, tóc, trang phục theo mạch truyện; trang phục đổi theo diễn biến (trước / sau thay đổi) là hợp lý. Trước khi kết luận "sai người" thì xem `character-references.json` nếu có.

`weak` và `wrong` phải có `note` nêu **câu trong lời** và **thứ thấy trên ảnh**. Không suy diễn ngoài hai thứ đó. Phân vân giữa hai mức thì chọn mức nhẹ hơn và nói lý do: báo oan làm người dùng vẽ lại ảnh tốt.

### 4. Ghi kết quả
Viết vào scratchpad:
```json
{
  "summary": "2–4 dòng tiếng Việt: vấn đề lớn nhất, nên làm gì trước",
  "scenes": [
    { "n": 1, "verdict": "ok" },
    { "n": 7, "verdict": "wrong", "note": "lời: 「さえ子の家」 — ảnh: siêu thị", "fix": "English image prompt thay thế, giữ style và mô tả nhân vật của prompt cũ" }
  ]
}
```
Chấm đủ mọi cảnh có ảnh (thẻ `title` không bắt buộc). `fix` là prompt tiếng Anh cho cảnh `wrong`, và cho `weak` khi sửa prompt là đủ: bắt đầu từ `prompt` cũ, giữ style, mô tả nhân vật và đuôi `no text…`, chỉ thay cảnh.

`save` tính điểm, ghi `scene-review.json` vào thư mục video, và in:
- **ảnh đúng lời**: ok 1, weak 0,5, wrong 0, thiếu ảnh 0, tính theo số giây của cảnh;
- **đúng lời và đúng giờ khi ghép**: như trên, nhân với `onTime`. Con số này thận trọng: ảnh lệch giờ bị tính là không khớp, dù đôi khi tình cờ vẫn hợp lời.

Đạt khi cả hai từ 85%. Mốc này là lựa chọn của skill, không phải số đo của YouTube.

### 5. Trả lời
1. Một câu kết luận: ghép được chưa, vì sao.
2. Hai con số phần trăm.
3. **Lỗi giờ**: nguyên nhân (thiếu ảnh, chồng giờ, mốc cảnh sai, audio cụt), lệch từ cảnh nào, lệch nhất bao nhiêu giây. Dẫn 2–3 ví dụ "phút x: ảnh cảnh A, lời của cảnh B".
4. **Bảng cảnh cần sửa** (chỉ `wrong` và `weak` đáng sửa): cảnh | giờ | lời đang nói | ảnh vẽ gì | prompt đề xuất.
5. Cảnh thiếu ảnh, ảnh trùng, cảnh quá dài (trên 60 giây), cảnh không bao giờ hiện.
6. Việc nên làm, theo thứ tự. Lỗi giờ sửa trước, vì ảnh đúng đến mấy mà lệch giờ thì vẫn sai.

## Video đã render
`shownStart` là dự đoán cho lần ghép **tiếp theo** bằng mã hiện tại và cài đặt chuyển cảnh hiện tại. File mp4 cũ có thể ghép bằng mã cũ. Muốn biết mp4 đang có thì chạy `frames`: mỗi ô là khung hình thật ở giữa khung giờ của một cảnh, kèm phụ đề cháy vào hình; so với ô cùng số trong `sheet`. Nói rõ kết luận nào từ mp4, kết luận nào là dự đoán.

## Luật
- Chỉ kiểm tra và đề xuất. Không sửa prompt, mốc giờ, ảnh, cài đặt, không vẽ lại, không ghép lại. Lệnh duy nhất ghi vào thư mục video là `save`.
- Người dùng bảo sửa thì mới sửa, và từng loại một: ảnh sai thì sửa prompt rồi vẽ lại trong màn hình cảnh của app; thiếu ảnh thì vẽ bù; audio cụt thì tải lại audio (`npm run scan-truncated-audio` để dò); lệch do mã ghép thì nêu file và hàm (`ai-video-scene-timing.ts`, `ai-video-slide-spec.ts`) rồi hỏi trước khi sửa.
- Không bịa lời hay chi tiết ảnh. Chưa mở ảnh nào thì không chấm cảnh đó; chấm dở thì `save --partial` và nói rõ còn cảnh nào.
- Video một ảnh tĩnh (kênh lời dạy người nổi tiếng) hay chưa có cảnh, phụ đề, audio: script báo lý do, chuyển lại cho người dùng.
