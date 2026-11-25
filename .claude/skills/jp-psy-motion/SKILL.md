---
name: jp-psy-motion
description: Chọn những khoảnh khắc đáng biến từ ảnh tĩnh thành clip chuyển động (Google Flow / Veo, dài đúng 3–10 giây theo khung cảnh) cho video tâm lý học tiếng Nhật trong dammo, viết chuyển động riêng cho từng clip, nhờ app tạo clip rồi tự duyệt. Claude đọc lời đọc và nhìn ảnh, chọn khung 6–10 giây (một cảnh, hoặc gộp cảnh ngắn với các cảnh sau cùng khoảnh khắc), 2 clip ở hook 30 giây đầu rồi khoảng 1 clip mỗi 45 giây, chỉ trong nửa đầu video (tối đa 15); ưu tiên hành động, cảm xúc, đầu chương; tránh ảnh có chữ, đông người, cận tay. Nhận id / đường dẫn video (server/data/youtube-channels/<kênh>/videos/<videoId>), id kênh, hoặc không kèm gì để quét. Dùng khi người dùng nói "ảnh thành video", "image to video", "làm clip cho cảnh", "cho ảnh chuyển động", "video toàn ảnh tĩnh", "thêm chuyển động", "chọn cảnh làm clip", "motion", "Veo", hoặc gõ "motion <video>" / "motion <kênh>". Tách cảnh lại thì dùng jp-psy-scene-split; kiểm ảnh khớp lời thì dùng jp-psy-scenes.
---

# Chọn khoảnh khắc làm clip chuyển động

**Vì sao có skill này.** App đã tạo được clip từ ảnh cảnh qua Google Flow (tab "Ảnh → video"), nhưng tự nó chỉ chọn cảnh theo vị trí và dùng một câu chuyển động chung. Kết quả: clip rơi vào ảnh infographic đầy chữ, cảnh 4 giây cắt mất nửa chuyển động, cảnh 20 giây đứng hình. Skill này chọn theo **nội dung lời đọc và ảnh thật**, viết chuyển động hợp với câu đang nói, rồi duyệt clip trước khi dùng.

Mục tiêu là giữ chân người xem: phá thế "toàn ảnh tĩnh" ở 30 giây đầu và ở các điểm chuyển ý của nửa đầu video. Đừng hứa với người dùng là YouTube "thấy video có đầu tư" nhờ clip. YouTube đo thời gian xem và độ hài lòng, nên clip chỉ có ích khi làm người xem ở lại lâu hơn.

## Cách app dùng clip
- **Mỗi clip dài đúng khung của nó.** App đặt thanh Length của Flow (3–10 giây) bằng số giây clip được chiếu, làm tròn lên. Không cắt phí, không đứng hình. Flow tính khoảng 1 credit/giây (5 giây = 5 credit ở 360p).
- **Khung tốt là 6–10 giây.** Dưới 4 giây thì chưa kịp thấy cử động đã sang hình khác. Trên 10 giây thì clip (tối đa 10 giây) đứng hình ở cuối.
- **Gộp cảnh (`span`).** Cảnh ngắn có thể gộp với 1–3 cảnh **sau** nó: clip phát suốt thời gian của cả nhóm, ảnh của các cảnh bị gộp không hiện. Việc gộp chỉ có hiệu lực khi file clip tồn tại, nên clip lỗi hay bị bỏ thì video tự quay về từng ảnh như cũ.
- **Chỉ ở nửa đầu video** (mặc định, `--until 50%`). Người xem tới nửa sau đã chịu nghe; clip có ích nhất ở đoạn họ còn đang cân nhắc bỏ đi. Có số giữ chân thật từ `jp-psy-studio` thì chỉnh mốc theo kênh (ví dụ chỗ chỉ còn khoảng 30% người xem).

Chạy bằng Bash trong `server/`. Video hay kênh là id hoặc đường dẫn; đường dẫn Windows để trong nháy đơn. Video id bắt đầu bằng `-` thì viết sau `--` (`npm run -s motion -- info -- -rRp0nFsDag`).

```bash
npm run -s motion -- scan [kênh|video] [--json] [--force]          # video có cảnh: ảnh, clip, khung hợp clip ở nửa đầu, số clip nên làm
npm run -s motion -- info <video> [--until 50%]                   # ghi scenes.txt vào data/motion-skill/<kênh>/<video>/
npm run -s motion -- sheet <video> [cảnh…] --out <scratchpad>     # bảng ảnh 9 ô: cảnh mở được khung tốt, --all mọi cảnh, hoặc cảnh liệt kê
npm run -s motion -- check <video> [plan.json] [--max N] [--until 50%]   # kiểm kế hoạch, in độ dài từng clip và credit dự kiến
npm run -s motion -- apply <video> [plan.json] [--max N] [--until 50%]   # sao lưu, ghi motionPrompt + clipSpan vào cảnh
npm run -s motion -- make <video> [cảnh…]                         # server tạo clip qua Flow (lâu, chạy nền, tốn credit)
npm run -s motion -- frames <video> [cảnh…] --out <scratchpad>    # mỗi clip: ảnh gốc + 3 khung hình của phần được chiếu
npm run -s motion -- drop <video> <cảnh…|all>                     # bỏ clip, cảnh dùng lại ảnh tĩnh, make không làm lại
npm run -s motion -- redo <video> <cảnh…>                         # bỏ clip để make làm lại (sau khi sửa chuyển động)
```

## Chọn việc

| Người dùng gõ | Làm gì |
|---|---|
| `motion` / `motion <kênh>` | `scan`, báo 10 video đầu bảng (đủ ảnh, nhiều khung hợp clip), hỏi làm video nào. Không tự làm hàng loạt |
| `motion <video>` | Làm trọn các bước dưới cho video đó |
| "chỉ chọn cảnh", "chưa tạo clip" | Dừng sau `apply`, không `make` |
| "xem lại clip", "duyệt clip" | Chỉ bước 6 (`frames`) |
| "bỏ hết clip", "trả lại ảnh tĩnh" | `drop <video> all` |
| "làm N clip" | `--max N` khi `check` / `apply` |
| "clip cả phần sau", "tới 70%" | `--until 70%` (hoặc số giây) cho `info` / `check` / `apply` |

`scan` bỏ qua video mà skill đã `made` / `reviewed`; muốn làm lại thì hỏi rồi dùng `--force`.

## Quy trình một video

### 1. Đọc
`info <video>` in thời lượng, vùng clip, số cảnh tự đủ khung, số cảnh gộp được, số clip nên làm. Đọc **hết** `scenes.txt`:
- `#n giờ (giây trên màn hình) dấu`:
  - `✓`: cảnh tự đủ khung 6–10,5 giây.
  - `+k → Xs`: gộp với k cảnh sau thì được X giây. CLI chỉ tính giờ và chặn qua đầu chương / đầu mục; **cùng khoảnh khắc hay không là việc của bạn**.
  - `✗`: không mở được khung tốt.
- `lời:` lời đọc khi cảnh hiện. `ảnh:` phần riêng của prompt ảnh (đã bỏ phần phong cách lặp lại).
- `=== CHƯƠNG ===` đầu chương (từ `script.txt`); `ĐẦU MỤC` là câu mở mục danh sách (第N位, その1, 二つ目…). `=== HẾT VÙNG CLIP ===` là mốc `--until`: cảnh sau đó chỉ để hiểu mạch truyện.
- Nhãn `ĐÃ CÓ CLIP`, `ĐÃ LOẠI`, `gộp N cảnh`, `motion:` cho biết lần chạy trước.

Rồi `sheet <video> --out <scratchpad>` (hoặc `sheet <video> <các cảnh định chọn và cảnh sẽ bị gộp>`), mở **từng** bảng bằng Read. **Chọn bằng ảnh thật, không bằng prompt:** ảnh hay có chữ, lịch, biểu đồ dù prompt không nhắc tới. CLI không thấy được những thứ đó.

Báo trước cho người dùng nếu:
- còn cảnh thiếu ảnh (vẽ đủ ảnh trước);
- `info` báo ít khung hợp clip (gợi ý `jp-psy-scene-split` trước);
- trạng thái không phải Prepared/Created.

### 2. Chọn khung
Số clip theo dòng "Nên làm khoảng N clip" của `info`: 2–3 ở hook, rồi khoảng 1 clip mỗi 45 giây tới mốc `--until`, tối đa 15. Ít hơn cũng được khi không có khung hợp. Không vượt 15 nếu người dùng chưa đồng ý.

**Nên chọn**, theo thứ tự ưu tiên:
1. **Hook (0–30 giây):** cảnh đầu gần như luôn chọn; thêm cảnh đúng lúc lời nêu câu hỏi hay lời hứa của video.
2. **Khoảnh khắc có hành động hay cảm xúc** đúng với lời: nhận ra, ngạc nhiên, nhẹ nhõm, khóc, mỉm cười, thở dài.
3. **Đầu chương, đầu mục danh sách:** clip báo cho người xem là đã sang phần mới.
4. **Vật có chuyển động tự nhiên:** cát chảy, hơi nước, lá, rèm, nắng, phong thư bay.

**Gộp cảnh khi:** cảnh đầu quá ngắn (dưới 6 giây), **và** các cảnh sau là cùng chủ thể, cùng nơi, cùng khoảnh khắc (cận chi tiết của cảnh đầu, nhân vật làm tiếp đúng việc đó), **và** tổng ra 6–10 giây. Không gộp khi cảnh sau là hình của một ý mới: người xem sẽ nghe ý mới mà vẫn thấy hình cũ. Chọn `span` nhỏ nhất đủ khung. Ví dụ đúng: kéo hộp đàn ra khỏi tủ (4,9 giây) + cận dây đàn gỉ (2,8 giây) = 7,7 giây. Ví dụ sai: nhìn lại con đường đời + hình những cánh cửa đóng (ý "điều đã không làm").

**Tránh:**
- ảnh có chữ, số, lịch, biểu đồ, bảng, biển hiệu, sách mở; infographic, biểu tượng xếp hàng;
- đông người (mặt người phụ dễ méo), ảnh có chân dung người thật trong khung ảnh, cận tay hay ngón tay;
- nhân vật bị cắt ở mép khung; thẻ tiêu đề; cảnh `✗`; cảnh `ĐÃ LOẠI` (trừ khi viết chuyển động khác hẳn);
- khung 4–6 giây, trừ khi cử động có ngay từ giây đầu (cát chảy, vẫy tay).

Rải đều: ngoài hook, hai clip cách nhau ít nhất 20 giây; không để quá 90 giây không có clip trong vùng clip nếu còn khung hợp.

Kênh mascot: cảnh có mascot thường cho clip đẹp và đồng nhất. Vẫn kiểm mascot giữ đúng dáng ở bước 6.

### 3. Viết chuyển động
Mỗi clip một câu `motion` **tiếng Anh**, 25–350 ký tự, viết cho **ảnh của cảnh đầu** (Flow chỉ có ảnh đó). App tự thêm phần cố định: giữ nguyên nét vẽ, màu, bố cục; không cắt nhân vật; không chữ; không nhân vật mới; máy quay đứng yên (khung rộng thì đẩy vào rất nhẹ).

Công thức: **chủ thể + 1 cử động chính khớp lời + 1 chi tiết nền lay động.**
- Tốt: `the mascot hugs the guitar case a little tighter, a tear slowly rolls down its cheek and its shoulders tremble softly`
- Tốt: `the small star glows brighter in the mascot's open palm as the cloud above slowly dissolves into mist`
- Tốt (không người): `steam curls up from the ramen bowl and the light from the window shifts softly across the tray`
- Dở: `zoom in on the calendar` (nhắc máy quay, ảnh có chữ)
- Dở: `she jumps up and runs to the kitchen` (chuyển động lớn, Veo làm méo người)
- Dở: `she opens the case and we see the rusty strings` (bắt Veo vẽ cảnh bị gộp: nó sẽ tự bịa)

Quy tắc:
- Cử động nhỏ, chậm (`slowly`, `gently`, `softly`): một clip làm được 1–2 chuyển động.
- Biểu cảm khớp cảm xúc của lời, không vui vẻ chung chung.
- Không nhắc máy quay (zoom, pan, camera…), chữ, logo; không thêm người hay vật mới; không biến hình.
- Không mô tả lại cả bức ảnh.

### 4. Kế hoạch
Ghi `data/motion-skill/<kênh>/<video>/plan.json`:
```json
{ "clips": [
  { "scene": 1, "span": 2, "why": "hook: kéo cây đàn cũ ra khỏi tủ; gộp cảnh 2 (cận dây đàn gỉ), cùng khoảnh khắc", "motion": "the mascot slowly pulls the dusty guitar case a little further out of the closet and blinks in surprise, small dust specks drift in the sunlight" },
  { "scene": 26, "why": "cao trào chương 1: ôm cây đàn chưa từng chơi mà khóc", "motion": "the mascot hugs the guitar case a little tighter, a tear slowly rolls down its cheek and its shoulders tremble softly" }
] }
```
- `scene`: số cảnh trong `scenes.txt` (từ 1, như tab Scene & ảnh của app).
- `span`: số cảnh clip phủ, kể cả cảnh đầu (1–4, mặc định 1).
- `why`: vì sao chọn (và vì sao gộp), tiếng Việt, để người dùng duyệt nhanh. App không dùng.

### 5. Kiểm, ghi, tạo clip
1. `check <video>` tới khi **ĐẠT**. Nó in từng clip: giờ, số giây hiện, độ dài clip sẽ tạo, và tổng credit. Sửa hết `LỖI` (CLI gợi ý `span` khi khung quá ngắn); đọc `NHẮC` và sửa khi được.
2. ĐẠT thì `apply <video>` **ngay, không hỏi**: chỉ ghi `motionPrompt` và `clipSpan` vào `ai-scene-prompts.json`, có sao lưu ở `motion-backup/`, chưa tốn gì.
3. Báo người dùng: bảng clip (cảnh, giờ, độ dài, gộp gì, `why`), tổng credit, và **hỏi trước khi `make`**.
4. `make <video>` chạy **nền** (`run_in_background`). Lần đầu trên một máy hay sau khi sửa phần Flow thì `make <video> <một cảnh>` trước để kiểm thanh Length, xem `frames`, rồi mới làm cả loạt. Server app phải đang chạy; lệnh gửi việc vào app rồi chờ tới khi Flow xong. Profile Flow hết lượt thì app tự chuyển profile; hết hẳn thì dừng, báo người dùng, hôm sau chạy `make` lại (chỉ làm cảnh còn thiếu).

### 6. Duyệt clip
`frames <video> --out <scratchpad>` cho mỗi clip một bảng 4 ô: ảnh gốc, và khung hình ở đầu, giữa, cuối phần clip được chiếu. Mở **từng** bảng bằng Read và chấm:

| Kết luận | Khi nào | Làm gì |
|---|---|---|
| giữ | Mặt và dáng giữ như ảnh gốc, cử động thấy được và khớp lời | không làm gì |
| làm lại | Ảnh ổn nhưng cử động sai ý, quá ít, hay lệch cảm xúc | sửa `motion` trong plan, `apply`, `redo <video> <cảnh>`, `make` |
| bỏ | Mặt hay người méo, thêm tay chân, mascot đổi dáng, chữ chạy, nhân vật bị cắt, cảnh nhảy | `drop <video> <cảnh>` (các cảnh bị gộp tự hiện lại ảnh) |

`frames` báo "đứng hình Ns cuối" nếu clip ngắn hơn khung (clip tạo trước khi app chỉnh độ dài, hoặc Flow trả clip ngắn hơn). Trên 1 giây thì `redo` để tạo lại đúng độ dài.

### 7. Sau khi duyệt
- Video **Prepared**: xong. Khi người dùng bấm "Tạo video", app dùng clip thay ảnh và gộp cảnh theo `clipSpan`.
- Video **Created**: file mp4 vẫn là bản cũ. Hỏi người dùng rồi mới ghép lại: `npm run reassemble-video -- --channel <kênh> --video <video>` (chạy nền).
- Báo: số clip giữ / làm lại / bỏ, các cảnh có clip, credit đã dùng, cách trả lại ảnh tĩnh (`drop <video> all`).
- Đo trước khi làm cả kênh: sau khi đăng 3–5 video có clip, so tỉ lệ giữ chân 30 giây đầu và thời gian xem trung bình với video chỉ có ảnh của cùng kênh bằng `jp-psy-studio`; cũng xem đường giữ chân để chỉnh mốc `--until`.

## Ranh giới
- Không bấm "Chuẩn bị video" / "Tạo video", không đăng video, không xoá `motion-backup/`.
- Không tạo clip bằng trình duyệt riêng: chỉ qua server, vì server giữ các profile Flow.
- Không đổi cài đặt kênh (`reupAudioVideoType`…) để bật clip cho cả kênh; đề xuất cho người dùng nếu kết quả đo tốt.
- `jp-psy-scene-split` `apply` chuyển cả thư mục `videos/` (clip) vào sao lưu vì mốc giờ đổi. Chia cảnh lại thì chạy skill này lại sau khi vẽ ảnh mới.
- `motion-cli.ts` nằm trong `server/src/scripts/`, không được main.ts import, nên sửa nó không làm server khởi động lại. Sửa phần Flow hay ghép video trong `src/modules/` thì server (`tsx watch`) tự nạp lại.
