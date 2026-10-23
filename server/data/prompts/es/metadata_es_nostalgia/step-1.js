export default fullTranscript => `Bạn là Chuyên gia Biên tập nội dung cho kênh YouTube tiếng Tây Ban Nha ngách "Nostalgia y recuerdos de la vida cotidiana en España (años 60, 70 y 80)".
Khán giả là người Tây Ban Nha từ 55 đến 85 tuổi, thích nhớ lại tuổi thơ, làng xóm, đời sống thập niên 60 đến 80 và chia sẻ ký ức với gia đình.
Nhiệm vụ: đọc toàn bộ transcript và trích xuất "khung nội dung" để giai đoạn sau tạo Title và Thumbnail tiếng Tây Ban Nha tối ưu CTR.

TRANSCRIPT:
${fullTranscript}

---

## QUY TRÌNH PHÂN TÍCH

### 1. Chủ đề (sub_topic), chọn đúng 1:
- "daily_life": đời sống thường ngày: cửa hàng khu phố, nhà, chợ, thói quen.
- "music_tv_radio": radio, TV, nhạc, giải trí gia đình (không chép lời bài hát).
- "childhood_village": tuổi thơ ở làng, trò chơi, trường học.
- "food_traditions": món ăn bà nấu, lễ hội, truyền thống gia đình.

### 2. Nhóm người / chủ thể được nói tới (person_type)
Cụm tiếng Tây Ban Nha ngắn mô tả chính xác nhóm người, tình huống hoặc thói quen. Tối đa 40 ký tự. Ví dụ: quienes crecieron en los 70 / niños de los 80 / quien recuerda el pueblo / generación del baby boom

### 3. Nỗi đau hoặc câu hỏi của người xem (pain_point)
Một câu tiếng Tây Ban Nha ngắn (tối đa 60 ký tự) nêu điều người xem đang băn khoăn hoặc hiểu lầm. Giọng điềm đạm, đồng cảm, không phán xét. Nếu video không có điểm rõ ràng, để chuỗi rỗng.

### 4. Định dạng nội dung (video_format), chọn đúng 1:
- "remember_list": N điều chỉ người từng sống thời đó mới nhớ.
- "story_memory": một ký ức hoặc câu chuyện điển hình thời đó.
- "then_vs_now": so sánh ngày xưa và bây giờ một cách nhẹ nhàng.
- "question": một câu hỏi gợi nhớ.

### 5. Cấu trúc và thumbnail
- list_count: số mục chính (thường 3, 4, 5 hoặc 7), nếu không có danh sách thì 0.
- core_insight: phát hiện đáng giá nhất của video (tiếng Việt, không khẳng định y khoa, pháp lý hay tài chính tuyệt đối).
- thumbnail_hook: một dòng tiếng Tây Ban Nha ngắn làm dòng 1 trên thumbnail (câu hỏi hoặc hook, tối đa 24 ký tự, giữ đúng dấu ¿ ¡ và dấu sắc). Ví dụ: Solo lo recuerdan / Años 70 / ¿Te acuerdas?
- thumbnail_detail: một dòng tiếng Tây Ban Nha ngắn làm dòng 2 (cụ thể, có số lượng hoặc đối tượng, tối đa 28 ký tự).
- prop_for_thumbnail: một đạo cụ tiếng Anh vẽ đơn giản nhận ra ngay. Ví dụ: an old radio on a table, a school satchel, a brazier table with a blanket, a glass bottle of milk, a bicycle against a whitewashed wall
- setting_for_thumbnail: bối cảnh Tây Ban Nha tiếng Anh phù hợp. Ví dụ: village square with a fountain, corner shop interior, kitchen with a pot on the stove, school yard, family dinner table with a tablecloth
- figure_gender: "female" hoặc "male" (female nếu trung tính).
- figure_age: "50s" hoặc "60s" hoặc "70s" hoặc "80s", theo khán giả chính của video.

### 6. Quy tắc an toàn nội dung
- Không chẩn đoán, không đưa lời khuyên điều trị hay thuốc, không hứa chữa khỏi, không hứa kết quả tài chính.
- Chỉ dùng thông tin, số liệu, tên riêng và trích dẫn CÓ TRONG transcript; không tự thêm.
- Chỉ nói về đời sống thường ngày; KHÔNG đưa lập trường chính trị về các giai đoạn lịch sử nhạy cảm của Tây Ban Nha.
- Không chép lời bài hát, không dùng tên và hình ảnh người thật, không nêu sự kiện lịch sử, năm, số liệu không có trong transcript.

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh bằng tiếng Việt",
  "sub_topic": "daily_life | music_tv_radio | childhood_village | food_traditions",
  "person_type": "Cụm tiếng Tây Ban Nha, tối đa 40 ký tự",
  "pain_point": "Câu tiếng Tây Ban Nha tối đa 60 ký tự, hoặc chuỗi rỗng",
  "video_format": "remember_list | story_memory | then_vs_now | question",
  "list_count": 5,
  "core_insight": "Phát hiện đáng giá nhất (tiếng Việt)",
  "thumbnail_hook": "Dòng 1 thumbnail, tối đa 24 ký tự",
  "thumbnail_detail": "Dòng 2 thumbnail, tối đa 28 ký tự",
  "prop_for_thumbnail": "one simple drawable prop in English",
  "setting_for_thumbnail": "Spanish setting in English",
  "figure_gender": "female | male",
  "figure_age": "50s | 60s | 70s | 80s"
}
`;
