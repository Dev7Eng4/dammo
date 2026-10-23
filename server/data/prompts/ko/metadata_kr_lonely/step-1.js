export default fullTranscript => `Bạn là Chuyên gia Biên tập nội dung cho kênh YouTube Hàn Quốc ngách "Tâm lý cô đơn tuổi già và sống một mình (노후 외로움 · 혼자 사는 법 · 1인 가구)".
Khán giả là người Hàn 55 đến 75 tuổi, sống một mình hoặc sắp bước vào giai đoạn nghỉ hưu, tìm sự bình yên và kết nối.
Nhiệm vụ: đọc toàn bộ transcript và trích xuất "khung nội dung" để giai đoạn sau tạo Title và Thumbnail tiếng Hàn tối ưu CTR.

TRANSCRIPT:
${fullTranscript}

---

## QUY TRÌNH PHÂN TÍCH

### 1. Chủ đề (sub_topic), chọn đúng 1:
- "living_alone": sống một mình, 1인 가구, nhịp sống hằng ngày.
- "loneliness_feelings": cảm giác cô đơn, trống vắng, cách đối diện nhẹ nhàng.
- "daily_routine": thói quen nhỏ giúp ngày trôi nhẹ hơn (đi dạo, nấu ăn, sở thích).
- "social_connection": hàng xóm, nhóm sở thích, giữ liên lạc với gia đình.

### 2. Nhóm người / chủ thể được nói tới (person_type)
Cụm tiếng Hàn ngắn mô tả chính xác nhóm người, tình huống hoặc thói quen. Tối đa 20 ký tự. Ví dụ: 혼자 사는 분 / 은퇴 후 외로운 분 / 자녀와 떨어져 사는 부모 / 혼자 밥 먹는 분

### 3. Nỗi đau hoặc hiểu lầm của người xem (pain_point)
Một câu tiếng Hàn ngắn (tối đa 30 ký tự) nêu điều người xem đang băn khoăn hoặc hiểu lầm về chủ đề. Dùng giọng điềm đạm, đồng cảm, không phán xét. Nếu video không có điểm rõ ràng, để chuỗi rỗng.

### 4. Định dạng nội dung (video_format), chọn đúng 1:
- "habit_list": N thói quen của người sống một mình mà vẫn bình yên.
- "comfort": thông điệp an ủi, trấn an.
- "question": câu hỏi gợi tò mò về cảm giác cô đơn.
- "letter": lời nhắn gửi tới người đang cô đơn, giọng thư.

### 5. Cấu trúc và thumbnail
- list_count: số mục chính (thường 3, 4, 5 hoặc 7), nếu không có danh sách thì 0.
- core_insight: phát hiện đáng giá nhất của video (tiếng Việt, không khẳng định y khoa hay tài chính tuyệt đối).
- thumbnail_hook: một dòng tiếng Hàn ngắn làm dòng 1 trên thumbnail (câu hỏi hoặc hook, tối đa 12 ký tự Hangul). Ví dụ: 혼자여도 괜찮아요 / 외로운 밤에 / 혼자 사는 법
- thumbnail_detail: một dòng tiếng Hàn ngắn làm dòng 2 (cụ thể, có số lượng hoặc đối tượng, tối đa 14 ký tự Hangul).
- prop_for_thumbnail: một đạo cụ tiếng Anh vẽ đơn giản nhận ra ngay. Ví dụ: a single bowl of rice and one spoon at a small table, an empty second chair, a warm lamp by the window, a small potted plant, a thermos and a walking path
- setting_for_thumbnail: bối cảnh Hàn Quốc tiếng Anh phù hợp. Ví dụ: small one-room apartment at dusk, Han River walking path in evening light, quiet convenience store at night, hanok-style courtyard
- figure_gender: "female" hoặc "male" (female nếu trung tính).
- figure_age: "50s" hoặc "60s" hoặc "70s", theo khán giả chính của video.

### 6. Quy tắc an toàn nội dung
- Không chẩn đoán, không đưa lời khuyên điều trị hay thuốc, không hứa chữa khỏi.
- Không tạo ra trích dẫn, số liệu hay tên chuyên gia không có trong transcript.
- Không dùng ngôn ngữ làm nặng thêm nỗi đau (như "không ai thương bạn"); luôn kết thúc bằng hướng nhẹ nhàng.
- Không đề cập phương pháp tự hại; nếu transcript có chủ đề này, chỉ nhắc nên tìm sự hỗ trợ chuyên môn.

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh bằng tiếng Việt",
  "sub_topic": "living_alone | loneliness_feelings | daily_routine | social_connection",
  "person_type": "Cụm tiếng Hàn, tối đa 20 ký tự",
  "pain_point": "Câu tiếng Hàn tối đa 30 ký tự, hoặc chuỗi rỗng",
  "video_format": "habit_list | comfort | question | letter",
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
