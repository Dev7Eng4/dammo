---
name: jp-psy-script-remake
description: Nhận link video YouTube, đọc hết nội dung video đó, nghiên cứu thêm (xu hướng, video cùng chủ đề, bình luận người xem, nghiên cứu tâm lý có thật) rồi viết kịch bản tiếng Nhật hoàn chỉnh cho một video MỚI cùng chủ đề, khác góc, hợp xu hướng, không chép. Dùng khi người dùng đưa link youtube.com / youtu.be hoặc videoId và muốn "remake", "làm lại video này", "viết kịch bản từ video này", "video này đang hot, làm bản của mình", "đọc video rồi viết lại", hoặc gõ "remake <link>" / "script <link>". Cũng dùng cho "remake auto" (tác vụ hằng đêm viết trước kịch bản cho các video nguồn sắp làm của kênh Remake để app đọc giọng thay vì remake bằng ChatGPT/Gemini). Không có link mà có mã cụm thì dùng jp-psy-script-niche.
---

# Remake: từ một video thành kịch bản mới

Đọc `.claude/skills/_shared/script-writing.md` trước (CLI, luật viết, cách lưu). File này chỉ nói phần tìm hiểu video nguồn và chọn góc.

**Mục tiêu:** giữ **điều khiến người ta bấm xem** video nguồn, bỏ lời, ví dụ, thứ tự và title của nó, rồi nói sâu hơn bằng chất liệu mình tự nghiên cứu.

## Lệnh
- `remake <link>`: một video nguồn. Có thể đưa 2–3 link cùng chủ đề.
- `remake auto [--channel <id>] [--limit 3]`: viết trước kịch bản cho các video nguồn sắp làm của kênh Remake (xem mục cuối).
- Kèm được: `K5`, tên kênh đích, số phút, ghi chú ("nhấn vào người 60 tuổi còn đi làm").
- Không có link: hỏi link. Link không phải YouTube: nói là chưa hỗ trợ.

## Quy trình

**1. Đọc nguồn.** `npm run -s script -- source <link>`
- Đọc **hết** transcript. Không có transcript thì báo và dừng (đừng đoán nội dung từ title). Transcript tiếng khác vẫn dùng được; kịch bản luôn viết tiếng Nhật.
- Ghi: chủ đề thật, các ý (đếm), ví dụ, nghiên cứu được nhắc, cấu trúc, lời hứa của title có được trả không.
- **Xác định loại nguồn** (`narrated`, `manga`, `real-host`, `real-vlog`, `persona`; luật ở cuối `npm run -s trends -- clusters`). `script source` in ra loại mà bộ não săn xu hướng đã gắn, nếu có; chưa có thì tự xác định từ title, kênh, thời lượng và transcript. Kênh mình là thuyết minh + minh hoạ, không quay người thật, nên:
  - `real-vlog` (người thật quay chuyến đi, bữa ăn, nhà, tiền của họ): **chỉ mượn chủ đề** và lý do người xem thích. Không kể lại đời sống, nơi chốn, lời của họ, không biến họ thành "ví dụ". Báo người dùng: sức hút của vlog (con người thật, cảnh thật) không chuyển sang kịch bản được, nên chọn góc tâm lý đủ mạnh để tự đứng.
  - `persona` (nói ngôi thứ nhất như một người nổi tiếng có thật, kiểu 【斎藤一人】): **không nhập vai**, không để tên người đó trong title, không dùng các "danh ngôn" trong transcript như lời của họ (thường là giọng AI, lời có thể bịa). Chỉ mượn chủ đề. Muốn trích người thật thì chỉ dùng câu đã kiểm chứng được nguồn bằng WebSearch, ghi rõ ai nói.
  - `real-host`: trải nghiệm và ý kiến riêng của người dẫn là của họ; kiểm lại mọi khẳng định trước khi dùng.
  - Ghi loại nguồn và cách xử lý vào `research.md`.

**2. Vì sao video này chạy.** Trả lời bằng số liệu, không phỏng đoán:
- `npm run -s trends -- channel <channelId>`: video này gấp mấy lần median view/giờ của kênh. Dưới x2 thì nói với người dùng là nguồn không nổi trội, và vẫn làm tiếp.
- `npm run -s brain -- call audience video_comments '{"videoId":"…","limit":60}'`: người xem đồng cảm ở đâu, hỏi gì, cãi gì, kể chuyện gì. Trích ngắn, không ghi tên.
- Kết luận một câu: người ta xem vì … (nỗi đau, tò mò, so sánh mình với người khác…).

**3. Xác định cụm và kênh.** `npm run -s trends -- clusters`, xếp theo nội dung. Kênh đích: người dùng nói, hoặc kênh có niche cụm đó (`npm run -s brain -- call script list_my_channels`). Ngoài cụm thì ghi `off`, nói rõ, và viết theo luật chung.

**4. Chủ đề đang đi về đâu.**
- `trends -- search --date week` và `--date month` với 4–6 cách diễn đạt của chủ đề; `trends -- suggest` với 3–4 từ gốc.
- Đọc bộ nhớ nếu có: `jp-psy-trends` (`topic`), `competitors` (`pattern`), `audience` (`insight`), `title-seo` (`pattern`).
- Lấy thêm 1–3 video mạnh nhất cùng chủ đề bằng `script -- source` và đọc, để biết **điều mọi video đều nói**.
- Kết luận: đang lên, đứng hay nguội; nhánh nào đang lên; câu hỏi nào chưa video nào trả lời. Chủ đề đã nguội thì đề xuất nhánh đang lên gần nhất và đi theo nhánh đó.

**5. Nghiên cứu thêm.** WebSearch (tiếng Nhật và tiếng Anh): kiểm tra từng nghiên cứu nguồn nhắc tới (đúng, sai, nói quá); tìm 2–4 nghiên cứu hoặc khái niệm nguồn **không** có; tìm chuyện thời sự Nhật liên quan nếu có.

**6. Chọn góc mới.** Viết 3 góc, mỗi góc một câu, kèm bằng chứng (bình luận nào, khoảng trống nào, nghiên cứu nào). Chọn góc thoả cả bốn:
- trả lời điều người xem hỏi mà nguồn bỏ qua;
- đang có người tìm;
- có đủ chất liệu riêng cho ít nhất một nửa số chương;
- `script -- list` và `productions` cho thấy mình chưa làm.

**7. Dàn ý, viết, soát, lưu** theo `script-writing.md`, `mode: "remake"`, `sources` gồm mọi video đã đọc, và `check` với **tất cả** nguồn đó.

## Chế độ `remake auto`: viết trước cho kênh Remake (chạy hằng đêm)

Lệnh: `remake auto [--channel <id>] [--limit 3]`: với mỗi kênh Remake, remake tối đa `limit` video nguồn chưa làm (chưa chuẩn bị, chưa có kịch bản remake). Thường do tác vụ định kỳ gọi, **không có ai trả lời**: không hỏi, tự quyết theo luật dưới và ghi lý do vào `research.md`.

App dùng kết quả thế nào: khi "Chuẩn bị video" / "Tạo video" của kênh Remake tới một video nguồn có `data/youtube-channels/<kênh>/remake-ready/<videoId nguồn>/` mà `check.json` ĐẠT và đúng với nội dung `script.txt` hiện tại, app **luôn** dùng bản đó: ghi `script.txt` và `remake/remake-<giờ>.txt/.json` (cùng định dạng một lượt remake của app, kèm `.research.md`), đọc giọng, làm metadata theo `title`/`angle`/`hook`. Không có bản dùng được thì app remake bằng LLM như cũ. Người dùng muốn bản khác thì tự bấm Remake ở tab Kịch bản.

Video nguồn có bản dùng được (`check.json` ĐẠT, khớp `script.txt`) mang trạng thái **Đang chuẩn bị** (`Preparing`) thay cho "Chưa xử lý", hiện ở bộ lọc trạng thái của trang kênh và ở màn hình Sản xuất video. Mở video đó ở màn hình Sản xuất video thì app tạo luôn thư mục `videos/<videoId>/` (không tải gì): `script.txt`, `remake/`, và `source/transcript.srt` + `source/info.json` chép từ `data/script-skill/sources/<videoId>/` mà bước 1 (`script source`) đã tải. Vì vậy **đừng xoá** `data/script-skill/sources/<videoId>/` của video đã remake: đó là transcript nguồn của tab Nguồn. Từ đó người dùng làm từng bước ở các tab (giọng đọc, cảnh & ảnh, metadata & thumbnail); đủ giọng đọc, ảnh mọi cảnh, title và thumbnail thì video tự thành "Đã chuẩn bị". Bản chưa kiểm, chưa ĐẠT hoặc đã sửa sau khi kiểm vẫn là "Chưa xử lý", nên kiểm cho ĐẠT là cách duy nhất để video lên màn hình này.

1. `npm run -s script -- queue --json --limit <N>` (kèm `--channel` nếu có). Mỗi video có `ready`, `reason`, `dir`. Bỏ qua video `ready`. Làm lần lượt các video còn lại, xen kẽ giữa các kênh (video đầu của mỗi kênh trước).
   - `unchecked` / `edited`: chạy lại `check --save` (bước 4); ĐẠT là xong.
   - `failed`: đọc `check.json` → `problems`, sửa đúng chỗ đó, kiểm lại.
   - `missing`: viết mới.
2. Làm đủ Quy trình ở trên (bước 1–7) với video nguồn là `id` của queue và kênh đích là kênh của queue. Tự quyết:
   - Không có transcript: bỏ video, ghi vào báo cáo.
   - Nguồn không nổi trội, chủ đề đứng: vẫn làm. Chủ đề đã nguội: đi nhánh đang lên gần nhất.
   - Cụm: theo `trendClusters` / `niche` của kênh và nội dung nguồn; ngoài cụm thì `off`.
   - Nguồn `real-vlog` / `persona`: vẫn làm, nhưng chỉ mượn chủ đề theo bước 1; ghi vào cột lý do của báo cáo.
3. Lưu vào `dir` của queue (không phải `docs/scripts/`): `script.txt`, `research.md`, `meta.json` như `script-writing.md` mục 6, thêm các trường giống dàn ý remake của app: `"angle"` (góc mới, một câu tiếng Nhật), `"hook"` (30 giây đầu nói gì), `"story"` (nhân vật xuyên suốt và mạch từ chương đầu tới cuối, tiếng Nhật), `"lengthReason"` (vì sao độ dài này, tiếng Việt), cùng `"channelId"`, `"sourceVideoId"`, `"mode": "remake"`. App dùng `title`, `angle`, `hook` để làm metadata.
4. `npm run -s script -- check <dir>/script.txt --source <videoId nguồn> [--source …] --save`. Phải **ĐẠT**; chưa đạt thì sửa và chạy lại, tối đa 3 vòng. Vẫn chưa đạt thì để nguyên (`check.json` ghi `passed: false`, app sẽ remake bằng LLM cho video đó) và sang video sau. Sửa `script.txt` sau khi kiểm thì phải kiểm lại, nếu không app sẽ không dùng.
5. Kiểm cách đọc: `npm run -s script -- readings <dir>/script.txt` rồi xử lý theo `script-writing.md` mục 5 bước 4. Lệnh này chỉ hỏi VOICEVOX cách đọc, không đọc giọng. VOICEVOX chưa mở thì bỏ qua và ghi vào báo cáo. Sửa `script.txt` thì chạy lại `check --save`.
6. Lưu nơ-ron `brief` vào bộ não `script` như `script-writing.md` mục 6.
7. Báo cáo: ghi `data/script-skill/auto-runs/<YYYY-MM-DD>.md` (nối thêm nếu đã có): mỗi video một dòng `kênh | videoId | title mới | ĐẠT/CHƯA ĐẠT/bỏ | phút | lý do`. Trả lời chat bằng đúng bảng đó.

Không tự bấm "Chuẩn bị video", không sửa `script.txt` trong thư mục `videos/` của kênh, không đọc giọng (kiểm cách đọc bằng `readings` thì được).

## Ranh giới với nguồn
| Được lấy | Không được lấy |
|---|---|
| chủ đề, điều người xem quan tâm, khái niệm tâm lý phổ biến | câu chữ, cách nói, title, chữ trên bìa |
| nghiên cứu có thật (đã tự xác minh, kể lại bằng lời mình) | ví dụ, nhân vật, câu thoại, trải nghiệm riêng của người làm video |
| | đời sống người thật trong vlog; giọng ngôi thứ nhất và "danh ngôn" của video nhập vai người nổi tiếng |
| dạng nội dung (danh sách, đối lập, câu chuyện) | thứ tự các ý, trọn bộ danh sách các mục |

Danh sách của mình phải khác ít nhất một nửa số mục so với nguồn. Bộ kiểm đo câu chữ, không đo ý: phần này tự chịu trách nhiệm.
