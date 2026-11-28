# Một video, từ đầu đến cuối

Ghi các file JSON vào scratchpad, đặt tên theo videoId.

## A. Đọc
`npm run -s ctr -- info <video>` cho biết: `files.transcript`, `files.thumbnail`, `current` (title, title phụ, chữ bìa, prompt ảnh), `channel` (niche, `cluster`, `promptFiles`, `promptIsOwn`, `siblings`), `draw.flow`, `state`.

0. Đọc `channel.measured`: CTR Studio thật của các video kênh đã đăng, cao nhất trước. Mở bằng Read 3 bìa CTR cao nhất và 2 bìa thấp nhất; ghi ra khuôn bìa và khuôn title của nhóm cao, và chủ đề của nhóm thấp. Đây là chuẩn cho B3, T2. Rỗng thì nhờ người dùng chạy `jp-psy-studio` khi kênh đã đăng từ 5 video.
1. Đọc **hết** transcript (bỏ số thứ tự và mốc giờ). Transcript tự động hay sai chữ; hiểu theo nghĩa.
2. Mở ảnh bìa bằng Read. Không có bìa thì mọi điểm B là 0; C1 và C2 chấm theo chữ dự kiến, tối đa nửa điểm.
3. Ghi ra cho mình: chủ đề thật; **tự đếm số mục**; chiều nội dung; người xem là ai; mốc tuổi có được nói không; 5–8 chi tiết cụ thể kèm câu trích.

## B. Xác định cụm
1. Kênh có `channel.cluster` thì đó là cụm của **kênh**; vẫn phải kiểm tra nội dung có thật sự thuộc cụm đó không.
2. Kênh không có cụm: chạy `npm run -s trends -- clusters` (một lần mỗi phiên) và xếp theo **nội dung transcript**, không theo tên kênh hay title.
3. Không khớp cụm nào (dinh dưỡng, mẹo sức khoẻ, lừa đảo, câu chuyện kịch tính thuần…): `off`. Đừng ép vào cụm.

Cụm quyết định **khán giả, động lực bấm và kỹ thuật title**. **Giao diện bìa** thì theo kênh:

| Kênh | Chuẩn title | Chuẩn giao diện bìa |
|---|---|---|
| có `channel.measured` từ 5 video | khuôn title của nhóm CTR cao | khuôn bìa của nhóm CTR cao; đứng trên mọi dòng dưới, kể cả các bố cục khác mà prompt kênh cho phép |
| niche `ja-psy-k*` | prompt của cụm kênh | prompt của cụm kênh |
| có prompt riêng (`promptIsOwn`) | luật của cụm nội dung, cộng luật bắt buộc của kênh (nhãn 【】, độ dài) | prompt kênh: bố cục, màu, mô tả nhân vật chép nguyên văn |
| không có prompt riêng | luật của cụm nội dung, hoặc luật title chung khi `off` | nhìn 3–4 ảnh trong `siblings` và `current.imagePrompt`, giữ đúng một phong cách |

Prompt của kênh có **mẫu câu chữ** bắt bìa lặp title (ví dụ 「※「これ」を見直しなさい」 ở kênh Mochi) thì giữ bố cục và màu, **thay câu chữ** theo `pairing.md`.

## C. Chấm
Chấm theo `review.md`, rồi ghi:
```json
{
  "cluster": "K1", "clusterReason": "vì sao, một câu", "topic": "nội dung thật, một câu",
  "scores": { "C1": 6, "C2": 2, "C3": 7, "C4": 3, "C5": 2, "T1": 1, "T2": 4, "T3": 5, "T4": 3, "T5": 3, "B1": 3, "B2": 4, "B3": 4, "B4": 2, "B5": 4 },
  "blocking": ["title ghi 7つ nhưng kịch bản có 10 mục"],
  "issues": ["bìa chép lại gần hết title"]
}
```
`npm run -s ctr -- review <video> <file>`. Có lỗi chặn thì điểm tối đa là 5.

## D. Viết cặp mới (dưới 8 điểm)
1. Liệt kê 5–8 móc có câu trích. Chọn móc cụ thể nhất, "chuyện của chính mình", vẽ được, kịch bản trả lời được. Không lấy móc của `sourceTitle`.
2. Viết 2–3 cặp theo `pairing.md`, khác móc hoặc khác kiểu chia vai, **trong khuôn đã chứng minh** của kênh (nhãn 【】, bố cục, nhân vật, tông). Chỉ tránh trùng câu chữ móc với `siblings`; khuôn chung không phải lỗi. Nội dung thuộc chủ đề mà nhóm CTR thấp đang dùng thì đóng khung lại theo góc của nhóm cao khi transcript cho phép (ví dụ chuyện lương hưu: nói về tiền, đừng kể thành chuyện tình bạn đổ vỡ).
3. Kiểm tra máy (`ctr-check.mts`), chạy bảy phép thử, chọn một cặp.
4. Title 30–70 ký tự (app nhận tối đa 100), móc trong 30 ký tự đầu. Số mục đúng số tự đếm. Mốc tuổi chỉ dùng khi transcript nói về tuổi đó.
5. Description, tags giữ nguyên, trừ khi mâu thuẫn với title mới (ví dụ nhắc số mục sai).

## E. Prompt ảnh
- Bắt đầu từ `current.imagePrompt`: giữ cấu trúc, màu, mô tả nhân vật, câu kết; chỉ thay chữ, cảnh, đạo cụ, biểu cảm, mũi tên.
- Chép **nguyên văn** từng dòng chữ trong nháy đơn, mỗi dòng một hàng. Không thêm chữ nào khác, không chữ trên vật nền, góc dưới phải trống.
- Vật và người được nhắc trong chữ phải có trong cảnh. Đạo cụ phải giải thích được móc: đồng hồ cát cho chuyện quan hệ là đạo cụ rỗng.
- `draw.flow`:
  - `prompt`: không có ảnh tham chiếu, phải mô tả đủ nhân vật.
  - `mascot`: gọi "the mascot character from the reference image", không tả lại ngoại hình.
  - `celebrity`: giữ nguyên câu yêu cầu dùng ảnh người làm "unaltered cutout". Chữ bìa và title không được gán cho người thật câu nói, bệnh tật hay sự việc mà transcript không có; giữ nhãn tên 【…】.

## F. Vẽ
```json
{
  "title": "…", "hookLines": ["dòng 1", "※dòng 2"], "emphasis": "…",
  "hook": "móc bằng một câu tiếng Việt", "alternativeTitles": ["…", "…"],
  "thumbnailPrompt": "full English prompt",
  "thumbnailPatch": { "telop_japanese": { "top_text": "…", "bottom_text": "…" } }
}
```
`thumbnailPatch` dùng đúng các khoá đang có trong `current.thumbnailPlan` (ví dụ `telop_japanese.main_text`, `line_1.text`, `hook_lines`). Có `description` hoặc `tags` mới thì thêm vào.

`npm run -s ctr -- draw <video> <file>` mở trình duyệt để vẽ, mất vài phút: đặt timeout 10 phút hoặc chạy nền. Ảnh ra `ctr-work/thumbnail.jpg`; bìa thật chưa đổi.

## G. Chấm ảnh mới rồi áp dụng
1. Mở ảnh bằng Read. So **từng ký tự** với `hookLines`. Sai chữ, thiếu người hay vật, mũi tên sai, chữ lạ: sửa prompt và vẽ lại (tối đa 2 lần).
2. Thêm `"after": { …cùng dạng file chấm… }` vào file đề xuất, chấm trên **ảnh thật**.
3. `npm run -s ctr -- apply <video> <file>`. Lệnh sao lưu bản cũ, thay title và bìa qua app, và ghi `ctr_review.status = improved`.
