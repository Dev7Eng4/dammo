---
name: jp-psy-ctr
description: Chấm và làm lại title + thumbnail của video YouTube trong dammo để kéo CTR. Chạy không cần input (mọi kênh, mọi video trạng thái Đã tạo), hoặc nhận id / đường dẫn kênh (server/data/youtube-channels/<kênh>), hoặc id / đường dẫn video (…/videos/<videoId>). Với từng video - đọc transcript, xác định nội dung và cụm K1–K11, chấm cặp title + bìa thang 10, dưới 8 thì tự viết title mới, vẽ bìa mới, thay vào video và ghi trạng thái để lần sau không làm lại. Dùng cho MỌI việc về title, tiêu đề, thumbnail, bìa, chữ trên bìa, CTR, SEO, tag - "ctr", "chấm title thumbnail", "đánh giá / review / check bìa", "tối ưu CTR các video", "làm lại title thumbnail", "chạy ctr cho kênh X"; cùng các việc phụ "ctr research K1" (cặp đang thắng), "ctr idea <key>" (gói cho ý tưởng), "ctr log" (ghi CTR thật), "ctr restore <video>" (khôi phục). Dùng cả khi người dùng chỉ nhắc một trong hai.
---

# Tối ưu CTR: title + thumbnail là một cặp

Người xem thấy bìa và title cùng lúc, nên cặp phải **cùng một móc, khác thông tin**. Luật đầy đủ ở `references/pairing.md`; đọc trước khi chấm hay viết.

## Chọn việc

| Người dùng gõ | Làm gì |
|---|---|
| `ctr` (không kèm gì) | Tối ưu **mọi video Đã tạo của mọi kênh** |
| `ctr <kênh>` | Tối ưu các video Đã tạo của kênh đó |
| `ctr <video>` | Tối ưu đúng video đó (kể cả khi mới ở trạng thái Đã chuẩn bị) |
| thêm "làm lại", "force" | Làm cả video đã xong (`--force`) |
| "chỉ chấm", "đừng sửa" | Chấm và ghi điểm, dừng trước bước tạo mới |
| `ctr restore <video>` | `npm run -s ctr -- restore <video>` |
| `ctr research [K]` | `references/research.md` |
| `ctr idea <key>` | `references/idea.md` |
| `ctr log <video> <CTR%>` | mục Ghi CTR ở dưới |

`<kênh>`, `<video>` là id hoặc đường dẫn thư mục; trong Bash đặt đường dẫn Windows trong nháy đơn. "Đã tạo" là trạng thái `Created` trong `video-prepare.json`.

## Vòng tối ưu

Mọi lệnh `npm run` chạy bằng Bash trong thư mục `server/`.

**1. Lấy danh sách.** `npm run -s ctr -- scan [kênh hoặc video] [--force]`
- `review`: chưa chấm. `create`: đã chấm dưới 8, còn thiếu bước tạo mới. `done`: bỏ qua. `blocked`: báo lý do, không làm.
- `init`: video đọc giọng tay ở tab Giọng đọc nên bước metadata của app chưa chạy, chưa có `video-meta.json`. Chạy `npm run -s ctr -- init <video>`: lệnh tạo file tối thiểu với title tạm của kịch bản (từ `remake/*.json` hoặc `video-prepare.json`). Sau đó làm như `review`: không có bìa thì mọi điểm B là 0. Viết luôn `description` và `tags` trong đề xuất, vì file chưa có.
- Video **Đang chuẩn bị**: API sửa nội dung của app chỉ nhận video Đã chuẩn bị / Đã tạo. Khi đó `apply` ghi thẳng title, mô tả, tag, `thumbnail.jpg` vào thư mục video (vẫn sao lưu ở `ctr-backup/`). Lần sau app tải danh sách video, nó tự chuyển video sang Đã chuẩn bị nếu đã đủ giọng, transcript, title, bìa và ảnh cảnh.
- Báo người dùng một dòng: bao nhiêu video, của kênh nào. Rồi làm luôn, không hỏi lại từng video.

**2. Làm lần lượt, trọn vẹn một video mới sang video kế.** Đừng đọc trước nhiều transcript. Trạng thái nằm trong video, nên dừng ở đâu chạy lại tiếp từ đó.

Với mỗi video, theo `references/optimize.md`:
1. `npm run -s ctr -- info <video>`; đọc **hết** transcript; mở ảnh bìa.
2. Xác định nội dung và cụm.
3. Chấm theo `references/review.md`, rồi `npm run -s ctr -- review <video> <file.json>`. CLI tự cộng điểm và quyết định: **từ 8 trở lên** là xong, giữ nguyên; **dưới 8** thì làm tiếp.
4. Viết cặp mới, kiểm tra máy, `npm run -s ctr -- draw <video> <file.json>`.
5. Mở ảnh vừa vẽ, chấm lại cặp mới, `npm run -s ctr -- apply <video> <file.json>`.

Video ở trạng thái `create` thì bắt đầu từ bước 4, dùng điểm và lỗi đã ghi trong `state`, nhưng vẫn phải đọc lại transcript.

**3. Báo cáo.** Sau mỗi 5 video báo một dòng tiến độ. Cuối lượt ghi `docs/brains/ctr/YYYY-MM-DD-run.md` (đã có thì thêm vào cuối) và trả lời bằng bảng:

| Kênh | Video | Cụm | Điểm cũ → mới | Title mới | Kết quả |
|---|---|---|---|---|---|

Kèm số video: giữ nguyên, đã làm lại, giữ bản cũ, còn dở, không làm được và lý do. Nói rõ nếu chưa hết danh sách.

## Khi trục trặc
- **Vẽ lỗi do trình duyệt, đăng nhập, hết lượt, server bận:** thử lại tối đa 2 lần, rồi để nguyên `needs_work` và sang video khác. Không dùng `keep` cho lỗi kỹ thuật: lượt sau phải làm tiếp. Ba video liên tiếp lỗi vẽ thì dừng bước vẽ và báo người dùng; vẫn chấm tiếp các video còn lại.
- **Cặp mới vẫn dưới 8** sau 2 lần viết và 2 lần vẽ: `npm run -s ctr -- keep <video> --reason "…"`. Bản cũ giữ nguyên, video tính là xong, và nêu trong báo cáo. Bản cũ có **lỗi chặn** thì không `keep`; để `needs_work` và nêu để người dùng quyết.
- **Không nâng điểm cho qua.** Chấm bản mới nghiêm như bản cũ. CLI từ chối áp dụng khi điểm mới dưới 8 hoặc không hơn bản cũ.
- Cần đăng nhập Google / Flow thì nhờ người dùng tự đăng nhập.

## Kiểm tra máy theo cặp

Chạy từ thư mục gốc repo:
```bash
server/node_modules/.bin/tsx .claude/skills/jp-psy-ctr/scripts/ctr-check.mts <video> --cluster K1 --pair "title || dòng 1|dòng 2" --pair "…"
```
Cặp phải sạch `pipelineGuard`, có `thumbnailAddsSomething`, `titleCheck.lengthOk`, không dòng nào `tooLong` hay `startsWithParticle`. Nội dung ngoài cụm thì bỏ `--cluster`, và tự xét theo luật title chung. `draw` và `apply` cũng tự chạy lại phần chép, hứa quá và bịa số.

## Ghi CTR thật

Chỉ YouTube Studio có CTR. Skill `jp-psy-studio` tự ghi số đọc được vào file này. Khi người dùng đưa số tay, thêm một dòng vào `docs/brains/ctr/ctr-log.csv` (dòng đầu là tên cột): `ngay,videoId,cum,title,chu_bia,kieu_cap,ctr_phan_tram,luot_hien_thi,gio_sau_dang,ghi_chu`. Ô thiếu để trống. `ctr info` đưa số của kênh vào `channel.measured` (cao nhất trước, kèm đường dẫn bìa); dưới 5 video cùng kênh thì chỉ nêu số, chưa kết luận.

**CTR thật đứng trên điểm của skill.** Bài học 2026-11-25 (kênh 黄金色のノート): khuôn bìa sáng của kênh đạt CTR 10–12.6%, hai video đổi sang bìa tối, mặt lo âu chỉ còn 2.8% và 3.6% dù skill chấm 8+. Vì vậy:
- kênh có số đo thì giữ khuôn bìa và khuôn title của nhóm CTR cao (`references/review.md`, B3, T2);
- **video đã đăng**: chỉ đề xuất đổi khi CTR thật dưới trung vị kênh sau ít nhất 48 giờ và 1.000 lượt hiển thị; đề xuất dạng A/B (Test & compare trong Studio), không thay hẳn;
- sau khi đổi, nhờ người dùng chạy `jp-psy-studio` lại sau 3–7 ngày để so.

## Credit VOICEVOX
Video đọc bằng VOICEVOX phải ghi credit nhân vật, ví dụ `VOICEVOX:青山龍星`, ở chỗ người xem thấy được. Đây là điều khoản sử dụng của VOICEVOX.
- App tự thêm từ 2026-11-24. Mỗi lần đọc giọng, app ghi `narration-voice.json`; video cũ thì app tra `voice` trong `remake-state.json`. Bước metadata nối credit vào cuối mô tả, sau dòng miễn trừ của kênh. Bước upload kiểm lại lần cuối trước khi dán mô tả. Logic nằm ở `server/src/modules/voice/voicevox-credit.ts`; CLI dùng chung module này.
- `apply` tự thêm dòng credit vào cuối mô tả. Tên lấy từ preset giọng đã lưu, không có thì hỏi engine VOICEVOX. Không cần viết credit trong `description` của đề xuất.
- Video đã xong mà thiếu credit: `npm run -s ctr -- credit <video>`. Lệnh chỉ thêm dòng đó, giữ title và bìa, có sao lưu `ctr-backup/<giờ>-credit` (`restore` bỏ qua bản này).
- CLI báo `CHÚ Ý` khi video có giọng VOICEVOX mà không tra được tên: thêm tay rồi báo người dùng.

## Luật riêng
- Chỉ sửa video `Prepared` / `Created`. Không upload, không đổi trạng thái sản xuất của video, không sửa prompt meta hay cấu hình kênh.
- Không sửa tay `video-meta.json`: mọi thay đổi đi qua `npm run ctr` để có sao lưu (`ctr-backup/` trong thư mục video) và đồng bộ với app. Trạng thái nằm ở `ctr_review` trong file đó: `passed` (đạt sẵn), `improved` (đã làm lại), `kept` (giữ bản cũ) là xong; `needs_work` là còn dở.
- Điểm là đánh giá của skill, không phải CTR đo được. Không bịa CTR hay hứa con số.
- `videoId` thường là id **video gốc của kênh khác**. Không gắn `video:<id>` đó như video của mình trong bộ nhớ bộ não.
