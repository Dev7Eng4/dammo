export default (fullTranscript) => `Bạn là Chuyên gia Phân tích nội dung cho kênh YouTube Nhật Bản ngách "Tâm lý học đại chúng" (心理学の解説・人間関係・職場・認知・脳の仕組み・生きづらさ), video hoạt hình người que (stickman) trên nền tối.
Nhiệm vụ: đọc transcript và bóc tách NGUYÊN LIỆU THẬT để bước sau viết title + thumbnail CTR cao. TUYỆT ĐỐI chỉ dùng thông tin có trong transcript, không bịa thêm con số, tên người, khái niệm, nghiên cứu.

TRANSCRIPT ĐẦU VÀO:
${fullTranscript}

---

## CẦN BÓC TÁCH:

### 1. Dạng video (video_format) — chọn ĐÚNG MỘT
- typology_list: danh sách kiểu người / dấu hiệu / thói quen / bí quyết (vd "7 kiểu người", "5 dấu hiệu").
- through_the_eyes_of: thế giới nhìn qua mắt một nhóm người (IQ cao/thấp, HSP, ADHD, Gen Z, người hay lo...).
- why_phenomenon: giải thích vì sao một hiện tượng tâm lý / não bộ xảy ra (vì sao thời gian trôi nhanh, vì sao bóng đè, vì sao thèm đồ ăn...).
- puzzle: câu đố, thought experiment, bài kiểm tra tư duy.
- healing: lời động viên, đồng cảm, dành cho người thấy cuộc sống khó khăn.

### 2. Chủ đề & ngành tâm lý
- Chủ đề chính và phân nhánh.
- Ngành tâm lý phù hợp nhất để gắn nhãn (社会心理学, 認知心理学, 進化心理学, 組織心理学, 健康心理学, 発達心理学, 家族心理学, アドラー心理学...). Chỉ chọn nhãn khớp nội dung transcript.

### 3. Đối tượng người xem & nỗi đau
- Người xem bị "điểm trúng" là ai (vd: 職場で疲れている人, 人付き合いが苦手な人, 自分を責めがちな人).
- Nỗi đau / câu hỏi họ đang mang, và cảm xúc cốt lõi (tò mò, sợ bị đánh giá, muốn hiểu mình, muốn thông minh hơn, cô đơn...).

### 4. Danh sách mục (items)
- Nếu video có danh sách (typology_list, hoặc through_the_eyes_of có nhiều điểm), liệt kê ĐÚNG THỨ TỰ từng mục: order, nhãn ngắn tiếng Nhật, tóm tắt 1 câu tiếng Việt. Không có danh sách thì mảng rỗng.
- Mỗi mục sẽ được dựng thành 1 cảnh riêng, nên giữ nguyên thứ tự và không gộp.

### 5. So sánh hai nhóm (comparison)
- Dùng cho dạng "A vs B" (IQ 70 vs 160, người nhạy cảm vs người bình thường...). side_a, side_b và các điểm đối lập có thật trong transcript. Không có so sánh thì để chuỗi rỗng / mảng rỗng.

### 6. Khung giải pháp / thông điệp
- Điều người ta thường hiểu sai.
- Hệ quả nếu bỏ qua.
- Hành động / cách nghĩ cụ thể video khuyên (mệnh lệnh ngắn, vd: 比べない, 休む, 距離を置く).
- "Thông điệp số 1": 1 câu ngắn, dùng được làm telop thumbnail.

### 7. Nguyên liệu Hook (QUAN TRỌNG NHẤT)
- Con số CÓ THẬT trong transcript (số mục, tỉ lệ %, số năm...). Không có thì mảng rỗng.
- Tên nhà tâm lý học / khái niệm / hiệu ứng / nghiên cứu được nhắc đến (scientific_anchor). Không có thì mảng rỗng.
- 2–3 câu khẳng định mạnh hoặc đi ngược số đông, trích ý từ transcript (tiếng Nhật tự nhiên, KHÔNG dịch máy).
- Lời cảnh báo mạnh nhất.
- Lời "khen ngầm" dành cho người xem (nếu video nói họ nhạy cảm / thông minh / hiếm...). Chỉ ghi nếu thật sự có trong transcript.

### 8. Cảnh báo nội dung (medical_risk)
- true nếu transcript nhắc rối loạn / bệnh y khoa (ADHD, tâm thần phân liệt, trầm cảm, rối loạn nhân cách...) hoặc đưa ra nhận định giống chẩn đoán. false nếu không.
- Nếu true, bước sau phải dùng giọng giáo dục, KHÔNG hứa chẩn đoán hay chữa bệnh.

### 9. Ẩn dụ thị giác cho thumbnail (tiếng Anh)
Đề xuất 3 cảnh thumbnail đơn giản bằng người que, mỗi cảnh gồm vai (nhân vật chính màu off-white / nhân vật đối lập màu đỏ / người quan sát), biểu cảm, tư thế và TỐI ĐA 2 biểu tượng phẳng. Ưu tiên theo video_format:
- typology_list: một hàng 3 người que khác nhau về tư thế, một người đỏ nổi bật, kính lúp hướng vào người đỏ.
- through_the_eyes_of: màn hình chia đôi hai người que cùng nhìn một vật, một bên thấy bình thường, một bên thấy bị méo / phóng to / rối loạn (thought bubble chứa 1 biểu tượng khác nhau).
- why_phenomenon: người que đứng cạnh hình não đơn giản, một mũi tên đỏ chỉ nguyên nhân.
- puzzle: người que gãi đầu, thought bubble chứa một hình khối đơn giản, dấu hỏi.
- healing: một người que ngồi một mình dưới trăng khuyết nhỏ, khoảng trống rộng.
Mỗi ẩn dụ viết thành 1–2 câu tiếng Anh mô tả hành động và biểu cảm, KHÔNG mô tả phong cách vẽ/màu nền, KHÔNG dùng các từ: person, man, woman, people, realistic, sketch, pencil, chalk, glow, text, letters, words.

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_focus": "Chủ đề chính (tiếng Việt)",
  "video_format": "typology_list | through_the_eyes_of | why_phenomenon | puzzle | healing (chọn 1)",
  "psychology_field_ja": "Ngành tâm lý để gắn nhãn (tiếng Nhật, vd 社会心理学)",
  "target_audience_ja": "Đối tượng bị điểm trúng (tiếng Nhật)",
  "pain_point": "Nỗi đau / câu hỏi cốt lõi của người xem (tiếng Việt)",
  "items": [
    { "order": 1, "label_ja": "Nhãn ngắn tiếng Nhật", "one_line": "Tóm tắt 1 câu tiếng Việt" }
  ],
  "comparison": {
    "side_a": "Nhóm A (rỗng nếu không có)",
    "side_b": "Nhóm B (rỗng nếu không có)",
    "contrast_points": ["Điểm đối lập 1", "..."]
  },
  "solution_framework": {
    "misconception": "Điều hiểu sai",
    "consequence": "Hệ quả nếu bỏ qua",
    "actions_ja": ["Hành động mệnh lệnh ngắn 1", "..."],
    "top_message_ja": "Thông điệp số 1 (tiếng Nhật, ≤12 ký tự nếu có thể)"
  },
  "hook_facts": {
    "numbers": ["Con số có thật trong transcript, vd: 7つのタイプ"],
    "named_concepts": ["Tên người/khái niệm/nghiên cứu có thật trong transcript"],
    "shocking_claims_ja": ["Câu khẳng định mạnh 1", "Câu 2"],
    "strongest_warning_ja": "Lời cảnh báo mạnh nhất",
    "flattery_ja": "Lời khen ngầm dành cho người xem (rỗng nếu không có)"
  },
  "medical_risk": false,
  "thumbnail_metaphors_en": [
    "Ẩn dụ 1",
    "Ẩn dụ 2",
    "Ẩn dụ 3"
  ]
}
`;
