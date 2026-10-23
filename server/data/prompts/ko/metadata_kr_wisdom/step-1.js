export default fullTranscript => `Bạn là Chuyên gia Biên tập nội dung cho kênh YouTube Hàn Quốc ngách "Triết lý nửa sau cuộc đời: buông bỏ và bình yên (인생 후반 철학 · 비움 · 내려놓기 · 지혜)".
Khán giả là người Hàn 50 đến 75 tuổi, suy ngẫm về cuộc đời, muốn bình yên, buông bỏ và sống có ý nghĩa.
Nhiệm vụ: đọc toàn bộ transcript và trích xuất "khung nội dung" để giai đoạn sau tạo Title và Thumbnail tiếng Hàn tối ưu CTR.

TRANSCRIPT:
${fullTranscript}

---

## QUY TRÌNH PHÂN TÍCH

### 1. Chủ đề (sub_topic), chọn đúng 1:
- "letting_go": buông bỏ, nhẹ lòng, cách không bám víu.
- "acceptance_aging": chấp nhận tuổi già, thời gian, thay đổi.
- "stoic_wisdom": trí tuệ Stoic, Phật giáo, triết gia (chỉ khi transcript có nêu).
- "gratitude_regret": biết ơn, hối tiếc, sống trọn hiện tại.

### 2. Nhóm người / chủ thể được nói tới (person_type)
Cụm tiếng Hàn ngắn mô tả chính xác nhóm người, tình huống hoặc thói quen. Tối đa 20 ký tự. Ví dụ: 인생 후반을 사는 분 / 마음을 비우는 사람 / 내려놓을 줄 아는 사람 / 지혜로운 어른

### 3. Nỗi đau hoặc hiểu lầm của người xem (pain_point)
Một câu tiếng Hàn ngắn (tối đa 30 ký tự) nêu điều người xem đang băn khoăn hoặc hiểu lầm về chủ đề. Dùng giọng điềm đạm, đồng cảm, không phán xét. Nếu video không có điểm rõ ràng, để chuỗi rỗng.

### 4. Định dạng nội dung (video_format), chọn đúng 1:
- "wisdom_list": N lời dạy hoặc N điều đáng nhớ.
- "quote_story": một câu nói của một nhân vật hoặc triết gia và câu chuyện đi kèm.
- "advice": lời khuyên trực tiếp, điềm đạm.
- "question": một câu hỏi triết lý gợi suy ngẫm.

### 5. Cấu trúc và thumbnail
- list_count: số mục chính (thường 3, 4, 5 hoặc 7), nếu không có danh sách thì 0.
- core_insight: phát hiện đáng giá nhất của video (tiếng Việt, không khẳng định y khoa hay tài chính tuyệt đối).
- thumbnail_hook: một dòng tiếng Hàn ngắn làm dòng 1 trên thumbnail (câu hỏi hoặc hook, tối đa 12 ký tự Hangul). Ví dụ: 마음을 비우면 / 내려놓으세요 / 인생 후반에
- thumbnail_detail: một dòng tiếng Hàn ngắn làm dòng 2 (cụ thể, có số lượng hoặc đối tượng, tối đa 14 ký tự Hangul).
- prop_for_thumbnail: một đạo cụ tiếng Anh vẽ đơn giản nhận ra ngay. Ví dụ: a single brush and ink stone, a lone pine tree, a boat on a misty river, a stone path up a mountain, a teacup beside an open window
- setting_for_thumbnail: bối cảnh Hàn Quốc tiếng Anh phù hợp. Ví dụ: misty mountains at dawn, hanok courtyard with a pine tree, quiet river at dusk, temple garden path
- figure_gender: "female" hoặc "male" (female nếu trung tính).
- figure_age: "50s" hoặc "60s" hoặc "70s", theo khán giả chính của video.

### 6. Quy tắc an toàn nội dung
- Không chẩn đoán, không đưa lời khuyên điều trị hay thuốc, không hứa chữa khỏi.
- Không tạo ra trích dẫn, số liệu hay tên chuyên gia không có trong transcript.
- Chỉ nêu tên người hoặc trích dẫn khi có trong transcript; không bịa lời trích dẫn hay gán sai nguồn.
- Không giảng đạo hay áp đặt tôn giáo; giữ giọng chia sẻ.

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh bằng tiếng Việt",
  "sub_topic": "letting_go | acceptance_aging | stoic_wisdom | gratitude_regret",
  "person_type": "Cụm tiếng Hàn, tối đa 20 ký tự",
  "pain_point": "Câu tiếng Hàn tối đa 30 ký tự, hoặc chuỗi rỗng",
  "video_format": "wisdom_list | quote_story | advice | question",
  "list_count": 5,
  "core_insight": "Phát hiện đáng giá nhất (tiếng Việt)",
  "thumbnail_hook": "Dòng 1 thumbnail, tối đa 12 ký tự Hangul",
  "thumbnail_detail": "Dòng 2 thumbnail, tối đa 14 ký tự Hangul",
  "prop_for_thumbnail": "one simple drawable prop in English",
  "setting_for_thumbnail": "Korean setting in English",
  "figure_gender": "female | male",
  "figure_age": "50s | 60s | 70s"
}
`;
