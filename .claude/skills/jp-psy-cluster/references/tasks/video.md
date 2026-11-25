# {K} video {title} {summary} — viết kịch bản khi đã có title

Đọc `.claude/skills/_shared/script-writing.md` trước (CLI, luật viết, format, cách kiểm và lưu). Lệnh này là lối vào thứ ba của cùng quy trình đó, bên cạnh `jp-psy-script-remake` (có link) và `jp-psy-script-niche` (chỉ có mã cụm). File này chỉ nói phần khác: chủ đề đã có sẵn, nên nghiên cứu để **làm sâu và làm khác**, không để chọn chủ đề.

Đầu ra là `script.txt` đúng format ô Kịch bản của app (`# title` / `## 1. chương` / mỗi dòng một câu), qua `script check` **ĐẠT**, lưu ở `docs/scripts/`.

## 1. Hiểu đầu vào
- Title bắt buộc; summary có thể không có.
- Title tiếng Việt: viết lại thành title tiếng Nhật theo luật title của `metadata_tlnb_{k}/step-1.js`, giữ đúng lời hứa. Title tiếng Nhật: giữ nguyên, chỉ sửa khi phạm luật title của cụm hoặc phạm mục Tránh (nói rõ đã sửa gì và vì sao).
- Có summary: bám các ý trong summary. Không có: tự xác định ý chính từ title, khán giả và ngách nhỏ của cụm.
- Title có con số (7つ, 5選...) thì số chương mang mục đúng bằng số đó.
- Xác định format theo các format trong file cụm và prompt meta (danh sách, đối lập, khoảng trống tò mò, hệ quả, chân dung, gỡ mặc cảm, lời dạy...) và viết đúng tinh thần format đó (ví dụ khoảng trống tò mò thì giữ điều then chốt tới chương cuối mới nói hết).

## 2. Kiểm trùng
`npm run -s script -- list --cluster K{n}` và `npm run -s brain -- productions` cho các kênh của cụm. Đã có kịch bản cùng `topicKey` hoặc cùng lời hứa trong 90 ngày thì báo người dùng, đề xuất góc khác, và hỏi có viết tiếp không.

## 3. Nghiên cứu (nhẹ hơn remake / niche)
- `npm run -s trends -- search --date month "<cụm từ chính của title>"` với 2–4 cách diễn đạt. Lấy 1–3 video mạnh nhất cùng chủ đề bằng `script -- source` và đọc hết, để biết **điều mọi video đều nói**. Mọi video đã đọc đều vào `sources` và được `check` so độ giống.
- Bình luận của 1–2 video đó (`video_comments`): câu hỏi người xem chưa được trả lời, lời họ dùng.
- WebSearch: 3–5 nghiên cứu hoặc khái niệm cho các chương, xác minh theo `script-writing.md` mục 2. Không xác minh được thì dùng tình huống đời thường, không viết 「心理学では〜と言われています」 cho một kết quả cụ thể.
- Không tìm được video nào cùng chủ đề (YouTube lỗi hoặc chủ đề quá mới): ghi rõ trong `research.md` và viết với `sources` rỗng.
- Chốt góc một câu: "mọi video nói X, video này nói Y". Title đã cố định nên Y nằm ở chất liệu và cách giải thích, không đổi lời hứa.

## 4. Dàn ý, viết, soát, lưu
Theo `script-writing.md` mục 3–7, với:
- `mode: "title"` trong `meta.json`;
- kết bài dùng "Câu hỏi kéo bình luận" của cụm;
- theo mục "Tránh" của cụm (ví dụ K8: không kích động trả thù, không gán bệnh cho người khác).

## 5. Trả lời trong chat
Theo `script-writing.md` mục 7, thêm format đã chọn và title cuối cùng (nếu khác title người dùng đưa thì nói vì sao). Không dán lại cả kịch bản trừ khi người dùng yêu cầu.
