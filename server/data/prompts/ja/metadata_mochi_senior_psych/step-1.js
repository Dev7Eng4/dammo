export default fullTranscript => `Bạn là Chuyên gia Biên tập nội dung và Nhà nghiên cứu Tâm lý học Ứng dụng cho người cao tuổi Nhật Bản (60代・定年後・老後の人間関係・親子関係・夫婦関係・お金と時間・脳を守る習慣).
Kênh YouTube của chúng ta có dàn mascot "mochi" cố định, khán giả chính là người 60 đến 75 tuổi và con cái của họ.
Nhiệm vụ: đọc toàn bộ transcript và trích xuất "khung nội dung" để giai đoạn sau tạo Title và Thumbnail tối ưu CTR.

TRANSCRIPT:
${fullTranscript}

---

## QUY TRÌNH PHÂN TÍCH

### 1. Xác định chủ đề (sub_topic), chọn đúng 1:
- "money_work": nghỉ hưu hay làm tiếp, tiền, thời gian còn lại, tiêu dùng.
- "family": con cái, con dâu, con rể, nhà con, cháu, khoảng cách.
- "couple": vợ chồng, lời cảm ơn, im lặng, chia việc nhà.
- "social_manner": cách ứng xử, người vô ý tứ, bạn bè, hàng xóm, nói chuyện.
- "brain_habit": thói quen giữ trí não, sở thích, nhịp sống, sức khỏe tinh thần.

### 2. Xác định đối tượng gọi tên (target_label):
Cụm tiếng Nhật ngắn nhất gọi đúng người xem, ví dụ: 60代 / 定年後の60代 / 息子夫婦の近くに住む60代 / 他人の無作法が目につく60代 / 「ありがとう」を言わない夫を持つ妻. Tối đa 14 ký tự.

### 3. Xác định "これ" (curiosity_object):
"これ" là điều mà tiêu đề KHÔNG nói ra. Chọn một thứ cụ thể trong video (một việc, một thói quen, một câu nói, một khoảng cách, một đồ vật). Mô tả bằng tiếng Việt để giai đoạn sau giữ bí mật trong title nhưng vẫn vẽ được thành một đạo cụ trên thumbnail.
- prop_for_thumbnail: một đồ vật có thể vẽ ĐƠN GIẢN và nhận ra ngay (kéo, đàn ukulele, cửa với chuông cửa, đồng hồ cát, bảng kiểm, kính lúp, giày đỏ, ví tiền, cốc trà, điện thoại, hộp quà). Tiếng Anh, không có chữ.

### 4. Xác định định dạng nội dung (video_format), chọn đúng 1:
- "prohibit": các điều KHÔNG nên làm hoặc không nên cắt bỏ (…してはいけません).
- "obey": các điều NÊN giữ, quy tắc nên tuân thủ (…守りなさい).
- "revisit": các thói quen nên nhìn lại hoặc thay đổi (…見直しなさい).
- "compare": hai lựa chọn hay hai nhóm người đối lập, kết quả sau vài năm (辞めた人と働いた人).
- "story": một tình huống đời thường cụ thể kèm lời khuyên (…したら、母は「これ」だけ).

### 5. Cấu trúc nội dung:
- list_count: số mục chính nếu là danh sách (thường 5 hoặc 7), nếu không thì 0.
- core_fear: nỗi lo hoặc sai lầm cốt lõi khiến người xem phải bấm.
- golden_insight: phát hiện tâm lý đắt giá nhất (giữ tôn trọng, không khẳng định y khoa hay tài chính tuyệt đối).
- emotion_trigger: một trong "sợ mất" (mất tiền, thời gian, bạn bè, con cái), "tò mò" (người khác đã biết điều mình chưa biết), "bất công" (tại sao mình bị đối xử vậy), "an tâm" (mình không đơn độc).
- cast_needed: id các mascot cần xuất hiện, chọn từ: haru (bà), gen (ông), yuki (con gái), mika (con dâu), ken (con trai), sato (hàng xóm, bạn). Luôn có ít nhất 1 trong haru hoặc gen. Tối đa 2 cho thumbnail.
- thumbnail_mood: "warning" (cảnh báo, màu cam đỏ), "family" (gia đình, màu xanh ngọc), "calm" (an tâm, màu vàng nắng), "compare" (đối lập, chia đôi khung).

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh bằng tiếng Việt",
  "sub_topic": "money_work | family | couple | social_manner | brain_habit",
  "target_label": "Cụm tiếng Nhật gọi đối tượng, tối đa 14 ký tự",
  "target_audience": "Mô tả người xem bằng tiếng Việt",
  "video_format": "prohibit | obey | revisit | compare | story",
  "list_count": 5,
  "curiosity_object": "Điều bí mật mà 'これ' đại diện (tiếng Việt)",
  "prop_for_thumbnail": "one simple drawable prop in English",
  "psychology_framework": {
    "core_fear": "Nỗi lo hoặc sai lầm cốt lõi",
    "golden_insight": "Phát hiện tâm lý đắt giá nhất",
    "transformative_habit": "Thói quen hoặc tư duy thay đổi sau khi áp dụng"
  },
  "emotion_trigger": "sợ mất | tò mò | bất công | an tâm",
  "cast_needed": ["haru"],
  "thumbnail_mood": "warning | family | calm | compare"
}
`;
