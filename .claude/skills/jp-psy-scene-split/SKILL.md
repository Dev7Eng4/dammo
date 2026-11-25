---
name: jp-psy-scene-split
description: Tách lại cảnh và viết lại prompt ảnh cho video trong dammo theo NỘI DUNG lời đọc, với nhịp đổi ảnh hợp lý cho người xem giữ lại xem lâu, không theo mức 12/20/30 giây của kênh; rồi nhờ app vẽ ảnh mới. Claude đọc transcript, tự chia cảnh (mỗi cảnh một ý hình, cắt ở cuối câu, 3–6 giây đầu video, tối đa 12–15 giây về sau), viết prompt tiếng Anh theo đúng bộ luật hình của kênh (thường / mascot / ảnh tham chiếu), CLI kiểm bằng luật của app, thay vào video (có sao lưu) và gọi server vẽ ảnh. Nhận id / đường dẫn video (server/data/youtube-channels/<kênh>/videos/<videoId>), id kênh, hoặc không kèm gì để quét. Dùng khi người dùng nói "tách cảnh", "chia cảnh lại", "làm lại prompt ảnh", "tạo lại ảnh cảnh", "ảnh đứng lâu quá", "nhịp cảnh chậm", "đổi ảnh nhanh hơn", "giữ chân thấp vì hình", "scene split", hoặc gõ "split <video>" / "split <kênh>". Chỉ kiểm tra ảnh đã có khớp lời không thì dùng jp-psy-scenes; chọn phong cách hình của kênh thì dùng jp-psy-images.
---

# Tách cảnh theo nội dung và tạo lại ảnh

**Vì sao có skill này.** App để LLM qua trình duyệt chia cảnh theo tầng 12/20/30 giây, càng về cuối video càng chậm. Đo 25.180 cảnh của 310 video: sau phút 10 trung vị 22 giây một ảnh, có ảnh đứng 50–80 giây, 30% cảnh dài hơn 15 giây. Người xem 50–70 tuổi vẫn bỏ đi khi hình đứng yên quá lâu. Skill này chia lại theo ý, nhịp đều, và để app vẽ.

Chạy bằng Bash trong `server/`. Video hay kênh là id hoặc đường dẫn; đường dẫn Windows để trong nháy đơn. Video id bắt đầu bằng `-` thì viết sau `--` (`npm run -s scene -- info -- -rRp0nFsDag`).

```bash
npm run -s scene -- scan [kênh|video] [--json] [--force] # video Prepared/Created: số cảnh, trung vị, p90, % >12s, thiếu ảnh, trạng thái skill
npm run -s scene -- info <video>                      # ghi cues.txt + rules.md vào data/scene-skill/<kênh>/<video>/
npm run -s scene -- check <video> [plan.json] --part  # kiểm phần đã viết
npm run -s scene -- check <video> [plan.json]         # kiểm cả kế hoạch, ghi check.json
npm run -s scene -- apply <video> [plan.json]         # sao lưu bộ cảnh cũ, ghi ai-scene-prompts.json mới
npm run -s scene -- draw <video>                      # server vẽ các ảnh còn thiếu (lâu, chạy nền)
npm run -s scene -- restore <video>                   # trả lại bộ cảnh trước
```

## Chọn việc

| Người dùng gõ | Làm gì |
|---|---|
| `split` / `split <kênh>` | `scan`, báo 10 video tệ nhất theo p90 và % >12s, hỏi làm video nào. Không tự làm hàng loạt |
| `split <video>` | Làm trọn các bước dưới cho video đó |
| "chỉ viết kế hoạch", "chưa ghi vào video" | Dừng sau `check` đạt, không `apply` |
| "chưa vẽ" | `apply` như thường, không `draw` |
| "trả lại", "restore" | `restore <video>` |

`scan` mặc định bỏ qua video đã có `scene-split.json` trạng thái `drawn`; nếu người dùng muốn làm lại thì hỏi trước.

## Quy trình một video

### 1. Đọc
`info <video>` in thời lượng, số câu, luồng hình của kênh, số liệu cảnh hiện tại, số cảnh ước lượng. Rồi đọc **hết** hai file nó ghi:
- `rules.md`: bộ luật hình mà app dùng cho kênh này (nhân vật, phong cách, từ cấm, biểu cảm, tư thế, ví dụ), cùng các khối cố định viết bằng placeholder (`{{MASCOT}}`, `{{STYLE}}`, `{{CHARACTER BLOCK}}`…). Làm theo luật này cho phần **hình**. Phần thời lượng cảnh và định dạng JSON trong đó không áp dụng.
- `cues.txt`: từng câu đánh số `#n giờ (độ dài) lời`. Câu kết thúc bằng `●` là hết câu, `○` là hết vế (dấu 、). `=== CHƯƠNG ===` là đầu chương (lấy từ `script.txt`).

Ghi chú nhanh cho mình: nhân vật xuyên suốt (tên, tuổi, ai là mascot), các mục của danh sách (nếu title có số), chỗ nào là chuyện kể, chỗ nào là nghiên cứu, chỗ nào là lời khuyên.

Báo trước cho người dùng nếu: video dài hơn 40 phút (số ảnh ước lượng trên 300), trạng thái không phải Prepared/Created, hoặc kênh dùng ảnh tham chiếu mà chưa có `character-references.json`.

### 2. Chia cảnh: theo ý, rồi mới theo giờ
Mỗi cảnh là **một ý hình**: một người làm một việc, một ẩn dụ, một vật then chốt. Đổi ảnh khi lời đổi chủ thể, đổi nơi, đổi thời điểm (trước/sau), đổi cảm xúc, sang mục mới của danh sách, hay chuyển từ chuyện kể sang giải thích.

Nhịp (giây trên màn hình, CLI đã tính tốc độ đọc):

| Đoạn | Mỗi cảnh | Vì sao |
|---|---|---|
| 0–30 giây | 2,5–6 | Hook: hình phải chạy theo từng câu để giữ người vừa bấm vào |
| 30 giây – 3 phút | 3–8 | Người xem đang quyết định ở lại |
| 3–10 phút | 4–12 | Thân bài, vẫn đổi hình đều |
| sau phút 10 | 5–15 | Người ở lại đã nghe là chính, nhưng không để hình đứng yên |
| cảnh `"hold": true` | tới 18 | Chỉ cho đoạn lắng (chữa lành, kết chương), tối đa 10% số cảnh, không dùng trong 30 giây đầu |

Luật cắt:
- Chỉ cắt ở `●`; cắt ở `○` khi câu quá dài. CLI báo lỗi khi hơn 10% chỗ đổi ảnh nằm giữa câu.
- Một ý giải thích dài hơn giới hạn: **tách 2–3 ảnh cùng ý, đổi góc** (toàn cảnh → cận mặt → vật/biểu tượng), không chuyển sang hình chẳng liên quan.
- Đầu mỗi chương: một cảnh đổi hẳn bố cục hay bối cảnh để người xem biết đã sang phần mới. Danh sách: mỗi mục mở bằng cảnh riêng.
- Câu mời bình luận / đăng ký (cuối chương 1, giữa video, cuối video): một hình ấm, nhân vật chính nhìn về người xem.
- Không có cảnh dưới 2 giây (CLI báo lỗi). Câu đơn quá dài thì để nguyên (CLI chỉ nhắc).

### 3. Viết prompt
Mỗi prompt viết **tiếng Anh**, theo công thức trong `rules.md`, dùng placeholder cho phần cố định:
- Kênh mascot: cảnh có mascot **bắt đầu** bằng `{{MASCOT}}`, mỗi cảnh ảnh **kết thúc** bằng `{{STYLE}}`. Ít nhất 70% cảnh có mascot. Người khác tả bằng cụm riêng, giữ nguyên cụm đó mỗi lần họ xuất hiện (ví dụ "a different elderly woman with a short silver bob, round glasses and a lavender cardigan").
- Kênh có khối cố định (`{{CHARACTER BLOCK}}`, `{{STYLE BLOCK}}`): đặt đúng chỗ luật yêu cầu.
- Kênh ảnh tham chiếu: mỗi cảnh ảnh có `"references"` là id nhân vật trong `rules.md`.

Phần mô tả cảnh (150–500 ký tự): ai, biểu cảm, tư thế, làm gì với vật gì, bối cảnh, góc máy, ánh sáng. Vẽ **đúng điều câu đang nói**, cụ thể như tên nơi chốn, đồ vật trong lời. Không chữ, số, logo, người thật; nhắc tới người thật (nhà nghiên cứu) thì vẽ bối cảnh hay vật, không vẽ chân dung. Hai cảnh liền nhau đổi góc máy, tư thế hoặc bố cục (CLI nhắc khi 75% từ trùng).

### 4. Kế hoạch
Ghi vào `data/scene-skill/<kênh>/<video>/plan.json`, hoặc chia `plan-01.json`, `plan-02.json`… theo chương khi video dài (CLI tự nối theo tên):
```json
{ "scenes": [
  { "from": 1, "to": 2, "beat": "hook: mở sổ tay mới", "prompt": "{{MASCOT}}, gentle curved closed eyes, … medium shot, warm light, {{STYLE}}" },
  { "from": 3, "to": 3, "beat": "trang cuối có dòng nguệch ngoạc", "prompt": "Close-up of … {{STYLE}}" },
  { "from": 40, "to": 41, "title": "その1" },
  { "from": 120, "to": 123, "hold": true, "beat": "lắng lại cuối chương", "prompt": "…" }
] }
```
- `from`/`to` là số câu trong `cues.txt`, liền nhau từ câu 1 tới câu cuối: không bỏ, không chồng. CLI tự đổi ra mốc giờ.
- `beat`: ý của cảnh bằng tiếng Việt, để người dùng duyệt nhanh. App không dùng.
- `title`: thẻ chữ do app tự vẽ, chỉ dùng khi luật kênh có thẻ chương.

Viết **từng chương một**, sau mỗi chương chạy `check --part` và sửa ngay mọi `LỖI`. Không viết hết rồi mới kiểm.

### 5. Kiểm, duyệt, thay
1. `check <video>` cả kế hoạch tới khi **ĐẠT**. Đọc cả `NHẮC`; sửa nhắc về cảnh giống nhau và cảnh quá ngắn khi sửa được.
2. ĐẠT thì `apply <video>` **ngay, không hỏi** (người dùng đã dặn: skill xong thì ghi luôn vào video). Bộ cảnh cũ (prompt, ảnh, clip) chuyển vào `scene-backup/<giờ>/` trong thư mục video, trả lại được bằng `restore`; `scene-split.json` ghi trạng thái. Sau đó tab "5. Scene & ảnh" của app hiện các cảnh mới với prompt và mốc giờ, chưa có ảnh.
3. Báo người dùng: số cảnh cũ → mới, trung vị / p90 / dài nhất cũ → mới, số ảnh sẽ vẽ, 5 `beat` mẫu, và rằng cảnh đã nằm trong tab Scene & ảnh. **Hỏi trước khi `draw`**: vẽ hàng trăm ảnh tốn lượt Flow/Meta trong ngày.
4. `draw <video>` chạy **nền** (`run_in_background`). Server phải đang chạy; CLI báo nếu hàng đợi app đang bận. Còn thiếu ảnh thì chạy `draw` lại (lỗi Flow, hết lượt). Hết lượt trong ngày thì dừng, báo người dùng, hôm sau chạy tiếp.
5. Kiểm ảnh bằng `jp-psy-scenes` (`check` rồi `sheet`) ít nhất cho 30 cảnh đầu; ảnh `wrong` thì sửa prompt bằng `PATCH /api/v1/video-production/videos/<kênh>/<video>/scenes/<i>` rồi `POST …/scenes/<i>/regenerate`.

### 6. Sau khi vẽ
- Video **Prepared**: xong. Khi người dùng bấm "Tạo video", app ghép từ bộ cảnh mới.
- Video **Created**: file mp4 vẫn là bản cũ. Hỏi người dùng rồi mới ghép lại: `npm run reassemble-video -- --channel <kênh> --video <video>` (chạy nền).
- Báo: số cảnh, nhịp mới, số ảnh vẽ được / lỗi, đường dẫn sao lưu, cách trả lại (`restore`).
- Clip chuyển động cũ (nếu có) đã vào sao lưu cùng bộ cảnh cũ. Muốn có clip cho bộ cảnh mới thì gợi ý `jp-psy-motion` sau khi vẽ đủ ảnh.
- Sau khi đăng 2–3 video theo nhịp mới, so tỉ lệ xem hết với video cũ của cùng kênh bằng `jp-psy-studio` trước khi làm cả kênh.

## Ranh giới
- Không bấm "Chuẩn bị video" / "Tạo video", không đăng video, không xoá `scene-backup/`.
- Không sửa prompt luật hình của kênh (`server/data/prompts/…`), không đổi cài đặt kênh (`aiSceneDensityMaxSec`…). Thấy luật kênh có vấn đề thì đề xuất cho người dùng.
- Không vẽ ảnh bằng trình duyệt riêng: chỉ qua server, vì server giữ các profile Flow/Meta.
- `scene-cli.ts` nằm trong `server/src/scripts/`, không được main.ts import, nên sửa nó không làm server khởi động lại.
