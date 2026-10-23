export default fullTranscript => `Bạn là Chuyên gia Biên tập nội dung cho kênh YouTube Hàn Quốc ngách "Tâm lý lời nói và thói quen cảm xúc (말투 · 감정 습관 · 품격 있는 말 · 화 다스리기)".
Khán giả là người Hàn 45 đến 69 tuổi, muốn giao tiếp tử tế hơn, kiểm soát cảm xúc và để lại ấn tượng tốt.
Nhiệm vụ: đọc toàn bộ transcript và trích xuất "khung nội dung" để giai đoạn sau tạo Title và Thumbnail tiếng Hàn tối ưu CTR.

TRANSCRIPT:
${fullTranscript}

---

## QUY TRÌNH PHÂN TÍCH

### 1. Chủ đề (sub_topic), chọn đúng 1:
- "speech_habits": thói quen nói chuyện, câu cửa miệng, giọng điệu.
- "anger_control": kiềm chế cơn giận, bình tĩnh trước lời khó nghe.
- "listening_empathy": lắng nghe, đồng cảm, hỏi han.
- "regret_words": những lời đã nói và hối tiếc, cách xin lỗi.

### 2. Nhóm người / chủ thể được nói tới (person_type)
Cụm tiếng Hàn ngắn mô tả chính xác nhóm người, tình huống hoặc thói quen. Tối đa 20 ký tự. Ví dụ: 말투가 품격 있는 사람 / 화를 잘 참는 사람 / 잔소리가 많아진 분 / 말을 잘 들어주는 사람

### 3. Nỗi đau hoặc hiểu lầm của người xem (pain_point)
Một câu tiếng Hàn ngắn (tối đa 30 ký tự) nêu điều người xem đang băn khoăn hoặc hiểu lầm về chủ đề. Dùng giọng điềm đạm, đồng cảm, không phán xét. Nếu video không có điểm rõ ràng, để chuỗi rỗng.

### 4. Định dạng nội dung (video_format), chọn đúng 1:
- "avoid_phrases": N câu nên bớt nói khi lớn tuổi.
- "trait_list": N đặc điểm của người nói chuyện có phẩm cách.
- "good_vs_bad": so sánh cách nói nên và không nên.
- "question": câu hỏi gợi tò mò về lời nói.

### 5. Cấu trúc và thumbnail
- list_count: số mục chính (thường 3, 4, 5 hoặc 7), nếu không có danh sách thì 0.
- core_insight: phát hiện đáng giá nhất của video (tiếng Việt, không khẳng định y khoa hay tài chính tuyệt đối).
- thumbnail_hook: một dòng tiếng Hàn ngắn làm dòng 1 trên thumbnail (câu hỏi hoặc hook, tối đa 12 ký tự Hangul). Ví dụ: 이 말은 줄이세요 / 품격 있는 말투 / 한마디의 힘
- thumbnail_detail: một dòng tiếng Hàn ngắn làm dòng 2 (cụ thể, có số lượng hoặc đối tượng, tối đa 14 ký tự Hangul).
- prop_for_thumbnail: một đạo cụ tiếng Anh vẽ đơn giản nhận ra ngay. Ví dụ: two empty speech balloon shapes, a teacup between two people, a closed mouth icon drawn simply, a small megaphone turned down, a heart-shaped handkerchief
- setting_for_thumbnail: bối cảnh Hàn Quốc tiếng Anh phù hợp. Ví dụ: family living room, neighborhood market, hiking trail rest area, community center, small cafe
- figure_gender: "female" hoặc "male" (female nếu trung tính).
- figure_age: "50s" hoặc "60s" hoặc "70s", theo khán giả chính của video.

### 6. Quy tắc an toàn nội dung
- Không chẩn đoán, không đưa lời khuyên điều trị hay thuốc, không hứa chữa khỏi.
- Không tạo ra trích dẫn, số liệu hay tên chuyên gia không có trong transcript.
- Không dùng ví dụ tục tĩu hay xúc phạm; lời không nên nói được diễn đạt lịch sự, chỉ nhắc tinh thần.
- Không chỉ trích nhóm tuổi hay giới tính cụ thể.

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh bằng tiếng Việt",
  "sub_topic": "speech_habits | anger_control | listening_empathy | regret_words",
  "person_type": "Cụm tiếng Hàn, tối đa 20 ký tự",
  "pain_point": "Câu tiếng Hàn tối đa 30 ký tự, hoặc chuỗi rỗng",
  "video_format": "avoid_phrases | trait_list | good_vs_bad | question",
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
