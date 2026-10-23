export default fullTranscript => `Bạn là Chuyên gia Biên tập nội dung cho kênh YouTube tiếng Tây Ban Nha ngách "Soledad no deseada y vivir solo en la vejez (acompañamiento emocional para mayores)".
Khán giả là người Tây Ban Nha từ 60 đến 85 tuổi, sống một mình hoặc xa gia đình, tìm sự bình yên, thói quen tốt và cách kết nối với người khác.
Nhiệm vụ: đọc toàn bộ transcript và trích xuất "khung nội dung" để giai đoạn sau tạo Title và Thumbnail tiếng Tây Ban Nha tối ưu CTR.

TRANSCRIPT:
${fullTranscript}

---

## QUY TRÌNH PHÂN TÍCH

### 1. Chủ đề (sub_topic), chọn đúng 1:
- "living_alone": sống một mình, nhịp sống và thói quen hằng ngày.
- "feeling_lonely": cảm giác cô đơn, trống vắng, cách đối diện không tự trách.
- "connection": kết nối với hàng xóm, nhóm sở thích, tình nguyện, gia đình ở xa.
- "evenings_holidays": buổi tối, chủ nhật, lễ Giáng sinh và các dịp dễ thấy trống vắng.

### 2. Nhóm người / chủ thể được nói tới (person_type)
Cụm tiếng Tây Ban Nha ngắn mô tả chính xác nhóm người, tình huống hoặc thói quen. Tối đa 40 ký tự. Ví dụ: quien vive solo / personas mayores que viven solas / quien pasa las fiestas sin familia / viudos y viudas

### 3. Nỗi đau hoặc câu hỏi của người xem (pain_point)
Một câu tiếng Tây Ban Nha ngắn (tối đa 60 ký tự) nêu điều người xem đang băn khoăn hoặc hiểu lầm. Giọng điềm đạm, đồng cảm, không phán xét. Nếu video không có điểm rõ ràng, để chuỗi rỗng.

### 4. Định dạng nội dung (video_format), chọn đúng 1:
- "habit_list": N thói quen của người sống một mình mà vẫn bình yên.
- "comfort": thông điệp an ủi, trấn an.
- "question": câu hỏi gợi tò mò về cảm giác cô đơn.
- "letter": lời nhắn gửi người đang cô đơn, giọng thư.

### 5. Cấu trúc và thumbnail
- list_count: số mục chính (thường 3, 4, 5 hoặc 7), nếu không có danh sách thì 0.
- core_insight: phát hiện đáng giá nhất của video (tiếng Việt, không khẳng định y khoa, pháp lý hay tài chính tuyệt đối).
- thumbnail_hook: một dòng tiếng Tây Ban Nha ngắn làm dòng 1 trên thumbnail (câu hỏi hoặc hook, tối đa 24 ký tự, giữ đúng dấu ¿ ¡ và dấu sắc). Ví dụ: Vivir solo / Los domingos / Una carta para ti
- thumbnail_detail: một dòng tiếng Tây Ban Nha ngắn làm dòng 2 (cụ thể, có số lượng hoặc đối tượng, tối đa 28 ký tự).
- prop_for_thumbnail: một đạo cụ tiếng Anh vẽ đơn giản nhận ra ngay. Ví dụ: a single cup and plate on a small table, an empty second chair, a warm lamp by the window, a potted geranium on a balcony, a phone resting on a table
- setting_for_thumbnail: bối cảnh Tây Ban Nha tiếng Anh phù hợp. Ví dụ: small apartment living room at dusk with a warm lamp, village street at sunset, balcony with geraniums, quiet plaza in the evening
- figure_gender: "female" hoặc "male" (female nếu trung tính).
- figure_age: "50s" hoặc "60s" hoặc "70s" hoặc "80s", theo khán giả chính của video.

### 6. Quy tắc an toàn nội dung
- Không chẩn đoán, không đưa lời khuyên điều trị hay thuốc, không hứa chữa khỏi, không hứa kết quả tài chính.
- Chỉ dùng thông tin, số liệu, tên riêng và trích dẫn CÓ TRONG transcript; không tự thêm.
- Không dùng ngôn ngữ làm nặng thêm nỗi đau (như "nadie te quiere"); luôn kết thúc theo hướng nhẹ nhàng, có điểm sáng.
- Nếu transcript có chủ đề tự hại, không mô tả phương pháp; chỉ khuyên tìm hỗ trợ chuyên môn.
- Không hứa "hết cô đơn"; nói về cách sống tốt hơn với nó.

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh bằng tiếng Việt",
  "sub_topic": "living_alone | feeling_lonely | connection | evenings_holidays",
  "person_type": "Cụm tiếng Tây Ban Nha, tối đa 40 ký tự",
  "pain_point": "Câu tiếng Tây Ban Nha tối đa 60 ký tự, hoặc chuỗi rỗng",
  "video_format": "habit_list | comfort | question | letter",
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
