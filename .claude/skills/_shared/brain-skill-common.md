# Phần chung cho mọi skill bộ não (jp-psy-*)

Mỗi bộ não trong dammo (`server/src/modules/brains/`) có một skill Claude Code tương ứng; riêng `title-seo` và `thumbnail` dùng chung skill `jp-psy-ctr` (title và bìa là một cặp), còn `script` có hai skill: viết từ mã cụm và viết từ link video. Skill làm **cùng một việc** và **ghi vào cùng một bộ nhớ** (`server/data/brains.json`) với bộ não. Khác biệt duy nhất là người chạy: bộ não chạy trong app (cần ANTHROPIC_API_KEY), còn skill do Claude Code chạy. Kết quả hiện trên bản đồ `/brains` và các bộ não, skill phía sau đọc được.

| Bộ não | Skill | Đọc bộ nhớ của | Lưu loại nơ-ron |
|---|---|---|---|
| jp-psy-trends | jp-psy-trends | — | topic, video, keyword |
| competitors | jp-psy-competitors | jp-psy-trends | channel, video, pattern |
| audience | jp-psy-audience | jp-psy-trends, competitors | insight, keyword |
| ideas | jp-psy-ideas | jp-psy-trends, competitors, audience | idea |
| title-seo | jp-psy-ctr | jp-psy-trends, competitors, audience, ideas (và brief của script nếu đã có) | pattern, title, keyword |
| thumbnail | jp-psy-ctr | jp-psy-trends, competitors | pattern |
| script | jp-psy-script-niche (từ mã cụm), jp-psy-script-remake (từ link video) | jp-psy-trends, competitors, audience, ideas, title-seo | brief |
| voice | jp-psy-voice | audience, jp-psy-trends | recipe, insight |
| images | jp-psy-images (hướng hình), jp-psy-scene-split (tách cảnh + vẽ lại ảnh từng video), jp-psy-motion (chọn cảnh làm clip chuyển động) | jp-psy-trends, competitors, script | pattern, recipe |
| editing | jp-psy-editing | jp-psy-trends, competitors, voice, images | pattern, recipe |
| publish | jp-psy-publish | jp-psy-trends, ideas, title-seo, thumbnail | schedule, pattern |
| studio | jp-psy-studio | jp-psy-trends, ideas, title-seo, competitors | metric, video, insight |
| growth | jp-psy-growth | studio, ideas, script, publish, competitors, audience | action |

Thứ tự khi chạy cả chuỗi: trends → competitors → audience → ideas → ctr (title-seo + thumbnail) → script → voice → images → editing → publish → studio → growth. Bộ nhớ của não phía trước trống thì nói cho người dùng biết và gợi ý chạy skill đó trước. Không tự bịa phần còn thiếu.

## CLI dùng chung

Chạy bằng công cụ Bash, trong thư mục `server/`:

```bash
cd server && npm run -s brain -- list                       # các bộ não, skill, nguồn đọc
cd server && npm run -s brain -- prompt <brainId>           # hướng dẫn gốc của bộ não, công cụ, schema lưu
cd server && npm run -s brain -- call <brainId> <tool> '<json>' [--out <thư mục>]
cd server && npm run -s brain -- save <brainId> <file.json>
cd server && npm run -s brain -- productions [--channel <id>]  # video remake/reup của kênh mình (xem dưới)
```

- **`prompt` là nguồn chuẩn.** Luôn chạy `prompt` của bộ não ở đầu lượt và làm theo phần "How to work" trong đó. File SKILL.md chỉ tóm tắt và thêm phần dành riêng cho Claude Code. Khi hai bên khác nhau, theo `prompt`.
- **`call`** chạy đúng công cụ của bộ não đó, với cùng dữ liệu như bộ não. Công cụ không thuộc bộ não thì lệnh báo lỗi và liệt kê các công cụ được phép. JSON đầu vào để trong dấu nháy đơn; nếu dài thì ghi ra file trong scratchpad rồi truyền đường dẫn file thay cho chuỗi JSON. Dòng `[search] …` in ra stderr là nhật ký, không phải dữ liệu.
- **`web_search`** chạy phía Anthropic nên CLI không gọi được. Dùng WebSearch của Claude Code với truy vấn tiếng Nhật.
- **Công cụ ảnh** (`view_thumbnails`, `view_video_frames`) tải ảnh về `--out` và in đường dẫn từng ảnh (`IMAGE <path>`). Truyền `--out` là thư mục scratchpad của phiên, rồi dùng Read để xem từng ảnh. Bộ não xem được ảnh trực tiếp; skill phải mở file thì mới "thấy".
- **Video và kênh "đã thấy".** Mọi video, kênh mà `call` trả về (kể cả video đọc qua `read_memory`, `my_channel_stats`) được nhớ 72 giờ trong `server/data/trend-scan-cache.json`, dùng chung với `npm run trends`. `save` chỉ nhận video, kênh có trong cache này, giống như bộ não chỉ lưu thứ nó đã thật sự lấy về. Muốn lưu một video thì phải lấy nó qua công cụ trước.
- **`save`** gửi vào server đang chạy (`POST /api/v1/brains/<id>/import`); nếu server tắt thì ghi thẳng vào `data/brains.json`. Lệnh in ra số mục đã lưu và mục nào bị bỏ kèm lý do. Gặp mục bị bỏ thì sửa file rồi chạy `save` lại. Lưu trùng `key` chỉ cập nhật và tăng độ tin, không nhân đôi.

## Video kênh mình đã làm: luôn đọc cả hai nguồn

```bash
cd server && npm run -s brain -- productions [--channel <id kênh của mình>] [--limit 15]
```

Công cụ `list_my_productions` của bộ não **chỉ thấy video làm qua Agent tạo video**. Phần lớn video của các kênh lại được làm bằng pipeline remake / reup audio, và nằm ở `server/data/youtube-channels/<id kênh>/videos/<videoId>/`. Lệnh `productions` tóm tắt các video đó, gồm:
- trạng thái trong `video-prepare.json` (Prepared / Created / Uploaded…);
- title và format cụm (từ `video-meta.json`);
- số ký tự `script.txt`;
- speaker, tốc độ và thời lượng giọng (từ `remake-state.json`), và ký tự/phút;
- `audioSpeed`;
- số cảnh và giây mỗi cảnh (từ `ai-scene-prompts.json`);
- có thumbnail chưa, chữ thumbnail, trạng thái `jp-psy-ctr` (điểm, đã làm lại chưa).

Skill nào cần biết kênh đã làm gì (script, voice, images, editing, publish, studio, growth) thì chạy **cả** `list_my_productions` **và** `productions`. Cần chi tiết một video thì đọc thẳng các file trong thư mục video. Dữ liệu từ `productions` không phải nơ-ron và không lưu được thành video; chỉ dùng làm bằng chứng trong `detail`.

## File kết quả để `save`

Ghi vào scratchpad, dạng:

```json
{
  "summary": "3-6 dòng tiếng Việt: điều quan trọng nhất của lượt này",
  "items": [
    { "kind": "pattern", "key": "list-number-sho", "label": "…", "labelJa": "…", "detail": "…", "heat": 80, "links": ["video:AZvQGM0aTf8"] },
    { "kind": "video", "videoId": "AZvQGM0aTf8", "label": "-", "detail": "x6.2 so với median kênh …", "heat": 85, "links": ["channel:UC…"] },
    { "kind": "channel", "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx", "label": "tên kênh", "detail": "…", "heat": 70 }
  ]
}
```

- `kind` phải nằm trong các loại bộ não được lưu (bảng trên); loại khác bị bỏ.
- `key` là slug ngắn, ổn định (romaji/tiếng Anh, chữ thường, gạch nối). Dùng lại đúng `key` cũ khi cùng một thứ, theo quy ước key trong `prompt` (ví dụ `voice-<channel id>`, `<idea key>-brief`). Video và kênh không cần `key`, vì id là key.
- `label` và `detail` viết tiếng Việt; `labelJa` giữ cụm tiếng Nhật. Với video, tiêu đề và số liệu lấy từ cache nên `label` để `-` cũng được.
- `heat` 0–100 theo ý nghĩa mà `prompt` của từng bộ não định nghĩa.
- `links` trỏ tới nơ-ron khác dạng `<kind>:<key>` (`video:<id>`, `channel:<UC id>`, `topic:<key>`, `idea:<key>`…), kể cả nơ-ron của bộ não khác đã đọc qua `read_memory`.
- `cluster` / `subCluster` / `format` là tuỳ chọn (bắt buộc cho video của jp-psy-trends). Dùng khi gắn được với cụm K1–K11.

## Quy trình chung

1. `prompt <brainId>`: đọc hướng dẫn gốc, công cụ, loại nơ-ron.
2. Đọc bộ nhớ của chính bộ não (`read_memory` với `brainId` của nó) để dùng lại key cũ và biết lần trước kết luận gì, rồi đọc các bộ não nguồn.
3. Làm các bước "How to work" bằng `call` (và WebSearch nếu bộ não có `web_search`).
4. Ghi file kết quả, `save`, đọc kết quả, sửa mục bị bỏ, `save` lại.
5. Viết báo cáo markdown vào `docs/brains/<brainId>/YYYY-MM-DD.md` (ghi đè nếu chạy lại trong ngày) theo mẫu trong SKILL.md.
6. Trả lời trong chat: tóm tắt 3–6 dòng, những mục quan trọng nhất, số nơ-ron đã lưu theo loại, đường dẫn báo cáo, và skill nên chạy tiếp theo trong chuỗi.

## Luật chung

- **Không bịa** video id, channel id, số liệu, trích dẫn, nghiên cứu. Chỉ dùng thứ công cụ hoặc WebSearch trả về. Thiếu thì ghi `?` hoặc nói rõ là thiếu.
- Giải thích bằng tiếng Việt; tiêu đề, cụm từ, câu thoại cho người xem bằng tiếng Nhật tự nhiên; prompt ảnh bằng tiếng Anh.
- Các skill sản xuất, phát hành, phân tích **chỉ đọc và đề xuất**: không chạy render, không sửa cấu hình kênh, không upload. Dữ liệu ít (ví dụ chưa có video nào được sản xuất) thì nói thẳng và lưu ít nơ-ron hơn.
- Ngữ cảnh cụm K1–K11 (khán giả, ngách nhỏ, format title và thumbnail) nằm trong `.claude/skills/jp-psy-cluster/references/` và prompt meta `server/data/prompts/ja/metadata_tlnb_k*/step-1.js`. Khi hai nơi khác nhau, prompt meta là bản mới nhất.
- Khi đổi cách làm của một skill mà bộ não cũng nên đổi theo, sửa cả prompt bộ não (`brain-agents.ts` / `brain-production-agents.ts`) để hai bên vẫn giống nhau.
