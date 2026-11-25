---
name: jp-psy-script-niche
description: Nhận mã cụm ngách (K1–K11), tự nghiên cứu xem trong cụm đó chủ đề nào đang tốt, đang lên trên YouTube Nhật, chấm điểm các chủ đề, tự chọn một chủ đề tốt nhất rồi viết kịch bản tiếng Nhật hoàn chỉnh cho video chủ đề đó. Dùng khi người dùng đưa mã cụm và muốn "kịch bản cho K3", "chọn chủ đề rồi viết luôn", "tìm chủ đề đang lên của K5 và làm kịch bản", "video tiếp theo cho cụm K8", hoặc gõ "script K3" / "kịch bản K3". Có link video thì dùng jp-psy-script-remake; đã có sẵn title thì dùng jp-psy-cluster "K3 video <title>".
---

# Kịch bản theo cụm: tự tìm chủ đề rồi viết

Đọc `.claude/skills/_shared/script-writing.md` trước (CLI, luật viết, cách lưu). File này nói phần nghiên cứu và chọn chủ đề.

## Lệnh
- `script K3`: nghiên cứu, chọn một chủ đề, viết kịch bản. Làm luôn, không hỏi chọn chủ đề nào.
- Kèm được: kênh đích, số phút, ghi chú, "chỉ chọn chủ đề" (dừng sau bước 4).
- Mã cụm hợp lệ là các file trong `.claude/skills/jp-psy-cluster/references/clusters/` (hiện là K1–K11). Mã khác, ví dụ K12, thì nói chưa có cụm đó, đưa danh sách cụm trong `references/common.md` và hỏi. Không tự nghĩ ra cụm.

## Quy trình

**1. Hiểu cụm.** Đọc `clusters/k{n}.md`, phần đầu và các format của `metadata_tlnb_k{n}/step-1.js` (trọng tâm, khán giả, động lực bấm, **kiểu nội dung thắng và thua**), và dòng của cụm trong `npm run -s trends -- clusters`.

**2. Biết mình đã làm gì.** `npm run -s script -- list --cluster K{n}`, `npm run -s brain -- productions` cho các kênh của cụm, `npm run -s brain -- call script read_memory '{"brainId":"script","kind":"brief","days":90}'`. Chủ đề trùng `topicKey` hoặc cùng lời hứa trong 90 ngày thì loại.

**3. Tìm chủ đề đang lên.**
- Bộ nhớ trước: `jp-psy-trends` (`topic`, `video` có cụm K{n}), `competitors`, `audience`, `ideas`. Dữ liệu dưới 3 ngày thì dùng lại, chỉ tìm thêm chỗ thiếu.
- `trends -- search`: 8–12 truy vấn tiếng Nhật phủ các ngách nhỏ của cụm, cả `--date week` và `--date month`. Cụm từ nào lặp ở nhiều video thì tìm thẳng cụm từ đó.
- `trends -- suggest`: 5–8 từ gốc của cụm, để biết người xem đang gõ gì.
- `trends -- channel`: 5–8 kênh đứng sau video mạnh, lấy hệ số `x` so với median.
- Bình luận của 4–6 video mạnh nhất (`video_comments`): câu hỏi chưa ai trả lời.
- WebSearch: 2–3 lượt về chuyện người Nhật lớn tuổi đang bàn liên quan tới cụm.

Chỉ tính video thật sự thuộc cụm theo nội dung. Một chủ đề là **một câu hỏi hay tình huống cụ thể**, không phải một ngách ("夜中に目が覚める人" là chủ đề; "睡眠" thì không).

**4. Chấm và chọn.** Gom 6–10 ứng viên, chấm 100:

| Tiêu chí | Điểm | Dựa vào |
|---|---|---|
| Cầu | 30 | view/giờ, hệ số `x`, số **kênh khác nhau** cùng thắng (từ 3 kênh mới được trên 20) |
| Đà | 20 | video tuần này so với tháng, gợi ý tìm kiếm mới, heat trong bộ nhớ tăng hay giảm |
| Khoảng trống | 20 | bao nhiêu video tháng này đã nói đúng điều đó; câu hỏi trong bình luận chưa ai trả lời |
| Hợp cụm | 15 | đúng trọng tâm, đúng kiểu nội dung cụm đang thắng, không phạm mục Tránh |
| Chất liệu | 15 | có ít nhất 3 nghiên cứu hay khái niệm xác minh được, và đủ tình huống cho 5 chương trở lên |

- Loại thẳng: chỉ một kênh thắng nhờ tên tuổi; cần chẩn đoán hay hù doạ; tin thời sự sẽ cũ trong một tuần; đã làm trong 90 ngày.
- Chọn điểm cao nhất. Hai ứng viên cách nhau dưới 5 điểm thì chọn cái có **khoảng trống** lớn hơn.
- Cao nhất dưới 60: nói thẳng cụm đang không có chủ đề mạnh, nêu ứng viên tốt nhất và lý do, rồi hỏi có viết không.
- Ghi cả bảng vào `research.md`; 3 ứng viên kế tiếp là gợi ý cho lượt sau.

**5. Nghiên cứu sâu chủ đề đã chọn.**
- `script -- source` cho 3–5 video mạnh nhất của chủ đề và đọc hết: **điều mọi video đều nói**, ví dụ nào bị dùng mòn, chỗ nào nói sai hoặc nói quá.
- Bình luận của các video đó: nỗi lo thật, lời người xem dùng.
- WebSearch: 3–5 nghiên cứu hoặc khái niệm, xác minh theo `script-writing.md`.
- Chốt góc: một câu "mọi video nói X, video này nói Y vì Z". Không có Y thì quay lại bước 4 lấy ứng viên kế tiếp.

**6. Dàn ý, viết, soát, lưu** theo `script-writing.md`, `mode: "niche"`, `sources` gồm mọi video đã đọc, và `check` với **tất cả** nguồn đó. Format và title tạm theo prompt meta của cụm (đúng "Dùng khi" và thứ tự ưu tiên).

## Lưu ý
- Số liệu chỉ lấy từ lệnh và WebSearch; thiếu thì ghi `?`. Không bịa xu hướng để có chủ đề.
- YouTube lỗi giữa chừng thì làm với dữ liệu đã có và nói rõ thiếu phần nào; dưới 10 video thuộc cụm thì chưa đủ để chọn, báo người dùng.
