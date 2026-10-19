export default fullTranscript => `Bạn là Chuyên gia Biên tập nội dung cho kênh YouTube Nhật Bản ngách "Tâm lý học tiền bạc và lối sống tiết kiệm" (お金の心理・節約・賢いお金の使い方・シンプルな暮らし・買い物の習慣・年を重ねるほど賢い女性).
Khán giả là người Nhật 40 đến 65 tuổi, đặc biệt phụ nữ, quan tâm tiết kiệm, nhà cửa gọn gàng và cách dùng tiền thông minh.
Nhiệm vụ: đọc toàn bộ transcript và trích xuất "khung nội dung" để giai đoạn sau tạo Title và Thumbnail tối ưu CTR.

TRANSCRIPT:
${fullTranscript}

---

## QUY TRÌNH PHÂN TÍCH

### 1. Chủ đề (sub_topic), chọn đúng 1:
- "saving": tiết kiệm, tiền tích lũy, tài khoản ngân hàng, chi tiêu thầm lặng.
- "shopping": mua sắm, giảm giá, thẻ tín dụng, thanh toán, quần áo, thương hiệu.
- "home_belongings": nhà cửa, đồ đạc, dọn dẹp, nhà nhỏ, thứ không đưa vào nhà.
- "daily_habits": thói quen nhỏ lộ tính cách (đến sớm, xếp giày, lau bàn, lời nói ở quầy thu ngân).
- "women_wisdom": phụ nữ càng lớn tuổi càng khôn ngoan về tiền và cuộc sống.
- "mens_life": đàn ông 50 tuổi, nghỉ hưu, sở thích và bạn bè.

### 2. Nhóm người được nói tới (person_type)
Cụm tiếng Nhật ngắn mô tả chính xác nhóm người hoặc hành vi, ví dụ: クレジットカードを持たない人たち / 中古車ばかり乗る人 / 家に物を増やさない人 / 年を重ねるほど賢い女性 / 靴を脱ぐと必ず揃える人. Tối đa 24 ký tự.

### 3. Hiểu lầm cần phủ định (misconception)
Đây là yếu tố quan trọng nhất của title. Xác định điều mà người ngoài thường đánh giá sai về nhóm người này (nghèo, keo kiệt, không có tín nhiệm, sĩ diện, lười, khó gần...). Viết dạng câu phủ định tiếng Nhật ngắn kết thúc bằng ではありません, ví dụ: お金がないからではありません / ケチだからではありません / 信用がないからではありません. Nếu video không có hiểu lầm rõ ràng, để chuỗi rỗng.

### 4. Định dạng nội dung (video_format), chọn đúng 1:
- "misconception": nhóm người + 実はこんな人です + (phủ định hiểu lầm).
- "series_women": series "年を重ねるほど賢い女性が…" kèm N thứ hoặc N nơi.
- "trait_list": N đặc điểm hoặc N điểm chung của một nhóm người.
- "habit_psychology": một thói quen nhỏ và tâm lý đằng sau nó.

### 5. Cấu trúc và thumbnail
- list_count: số mục chính (thường 3, 4, 5 hoặc 7), nếu không có danh sách thì 0.
- core_insight: phát hiện đáng giá nhất của video (tiếng Việt, không khẳng định tài chính tuyệt đối).
- thumbnail_hook: một dòng ngắn tiếng Nhật làm dòng 1 trên thumbnail (câu hỏi hoặc hook, tối đa 14 ký tự), ví dụ お金に困ったから？ / 安くても買わない / 一着のブランド服.
- thumbnail_detail: một dòng ngắn tiếng Nhật làm dòng 2 (cụ thể, có số lượng hoặc đối tượng, tối đa 16 ký tự).
- prop_for_thumbnail: một đạo cụ tiếng Anh vẽ đơn giản nhận ra ngay (piggy bank, credit card cut by scissors, shopping bags, clothes rack with a red sale tag shape, small house, clock, coin stack, shoes lined up...).
- setting_for_thumbnail: bối cảnh tiếng Anh phù hợp (sunlit cafe, cozy living room, supermarket checkout, boutique, entrance hall, car showroom...).
- figure_gender: "female" hoặc "male" (female nếu trung tính).

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh bằng tiếng Việt",
  "sub_topic": "saving | shopping | home_belongings | daily_habits | women_wisdom | mens_life",
  "person_type": "Cụm tiếng Nhật, tối đa 24 ký tự",
  "misconception": "Câu phủ định tiếng Nhật kết thúc bằng ではありません, hoặc chuỗi rỗng",
  "video_format": "misconception | series_women | trait_list | habit_psychology",
  "list_count": 5,
  "core_insight": "Phát hiện đáng giá nhất (tiếng Việt)",
  "thumbnail_hook": "Dòng 1 thumbnail, tối đa 14 ký tự",
  "thumbnail_detail": "Dòng 2 thumbnail, tối đa 16 ký tự",
  "prop_for_thumbnail": "one simple drawable prop in English",
  "setting_for_thumbnail": "setting in English",
  "figure_gender": "female | male"
}
`;
