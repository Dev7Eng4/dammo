export default fullTranscript => `Bạn là Chuyên gia Biên tập nội dung cho kênh YouTube Hàn Quốc ngách "Tâm lý quan hệ và cắt giảm người độc hại (인간관계 정리 · 거리 두기 · 50대 60대)".
Khán giả là người Hàn 50 đến 69 tuổi, cả nam và nữ, muốn gọn lại các mối quan hệ và sống thanh thản hơn.
Nhiệm vụ: đọc toàn bộ transcript và trích xuất "khung nội dung" để giai đoạn sau tạo Title và Thumbnail tiếng Hàn tối ưu CTR.

TRANSCRIPT:
${fullTranscript}

---

## QUY TRÌNH PHÂN TÍCH

### 1. Chủ đề (sub_topic), chọn đúng 1:
- "toxic_people": người nên giữ khoảng cách (hay nói xấu, lợi dụng, khoe công, thiếu tôn trọng).
- "friends_gatherings": bạn bè, họp lớp, hội nhóm, quan hệ ở tuổi trung niên.
- "boundaries": ranh giới, cách từ chối, giữ khoảng cách mà không áy náy.
- "letting_go": buông bỏ, tha thứ, chấp nhận người đã xa.

### 2. Nhóm người / chủ thể được nói tới (person_type)
Cụm tiếng Hàn ngắn mô tả chính xác nhóm người, tình huống hoặc thói quen. Tối đa 20 ký tự. Ví dụ: 험담을 즐기는 사람 / 필요할 때만 연락하는 사람 / 생색내는 사람 / 오래된 친구

### 3. Nỗi đau hoặc hiểu lầm của người xem (pain_point)
Một câu tiếng Hàn ngắn (tối đa 30 ký tự) nêu điều người xem đang băn khoăn hoặc hiểu lầm về chủ đề. Dùng giọng điềm đạm, đồng cảm, không phán xét. Nếu video không có điểm rõ ràng, để chuỗi rỗng.

### 4. Định dạng nội dung (video_format), chọn đúng 1:
- "avoid_list": "나이 들수록 멀리해야 할 사람 N가지".
- "trait_list": N đặc điểm của một nhóm người.
- "advice": lời khuyên trực tiếp, trấn an người xem.
- "question": một câu hỏi gợi tò mò về tâm lý quan hệ.

### 5. Cấu trúc và thumbnail
- list_count: số mục chính (thường 3, 4, 5 hoặc 7), nếu không có danh sách thì 0.
- core_insight: phát hiện đáng giá nhất của video (tiếng Việt, không khẳng định y khoa hay tài chính tuyệt đối).
- thumbnail_hook: một dòng tiếng Hàn ngắn làm dòng 1 trên thumbnail (câu hỏi hoặc hook, tối đa 12 ký tự Hangul). Ví dụ: 멀리하세요 / 정리할 시간 / 거리를 두세요
- thumbnail_detail: một dòng tiếng Hàn ngắn làm dòng 2 (cụ thể, có số lượng hoặc đối tượng, tối đa 14 ký tự Hangul).
- prop_for_thumbnail: một đạo cụ tiếng Anh vẽ đơn giản nhận ra ngay. Ví dụ: two tea cups with one untouched, a phone lying face down, a wooden door slightly open, a long wooden bench, an umbrella shared by two
- setting_for_thumbnail: bối cảnh Hàn Quốc tiếng Anh phù hợp. Ví dụ: small neighborhood cafe, apartment living room with ondol floor, riverside park bench, mountain trail entrance
- figure_gender: "female" hoặc "male" (female nếu trung tính).
- figure_age: "50s" hoặc "60s" hoặc "70s", theo khán giả chính của video.

### 6. Quy tắc an toàn nội dung
- Không chẩn đoán, không đưa lời khuyên điều trị hay thuốc, không hứa chữa khỏi.
- Không tạo ra trích dẫn, số liệu hay tên chuyên gia không có trong transcript.
- Không gán nhãn bệnh lý (như "nhân cách độc hại", "rối loạn") cho người thật; chỉ mô tả hành vi.

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh bằng tiếng Việt",
  "sub_topic": "toxic_people | friends_gatherings | boundaries | letting_go",
  "person_type": "Cụm tiếng Hàn, tối đa 20 ký tự",
  "pain_point": "Câu tiếng Hàn tối đa 30 ký tự, hoặc chuỗi rỗng",
  "video_format": "avoid_list | trait_list | advice | question",
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
