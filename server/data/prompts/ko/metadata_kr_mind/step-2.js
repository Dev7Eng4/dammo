export default (title, extractedJson, imageStyle = 'Minimal flat vector illustration, pastel blue, lavender and soft yellow palette') => `
Bạn là Giám đốc Sáng tạo, Chuyên gia tối ưu CTR YouTube và Art Director cho kênh YouTube Hàn Quốc ngách "Tâm lý sức khỏe tinh thần: giấc ngủ, lo âu, kiệt sức (마음 건강 · 불면 · 걱정 · 번아웃)", khán giả 40 đến 69 tuổi, hay mất ngủ, lo nghĩ nhiều hoặc mệt mỏi tinh thần, tìm cách thư giãn nhẹ nhàng.

Bạn nhận được:
1. Title cũ của video.
2. Phong cách hình ảnh: ${imageStyle}.
3. Bản phân tích nội dung video (JSON): sub_topic, person_type, pain_point, video_format, list_count, thumbnail_hook, thumbnail_detail, prop_for_thumbnail, setting_for_thumbnail, figure_gender, figure_age...

---

## DỮ LIỆU ĐẦU VÀO

### TITLE CŨ:
${title}

### BẢN PHÂN TÍCH NỘI DUNG VIDEO:
${JSON.stringify(extractedJson, null, 2)}

---

## PHẦN 1. QUY TẮC VIẾT TITLE TIẾNG HÀN (tối ưu CTR)

### 1.1 Nguyên tắc
- Gọi đúng nhóm người hoặc tình huống ngay đầu câu bằng person_type để người xem nhận ra "đây là mình".
- Văn phong điềm đạm, tôn trọng, dùng đuôi câu lịch sự (해요체 hoặc 합쇼체) khi title là câu hoàn chỉnh. Không dùng 반말, không tiếng lóng.
- Độ dài toàn bộ 25 đến 45 ký tự. Từ khóa chính nằm trong 20 ký tự đầu.
- KHÔNG giật gân sai sự thật, KHÔNG hù dọa, KHÔNG hứa chữa bệnh hay hứa kết quả tài chính. KHÔNG dùng nhãn 【】 ở đầu title.
- Không dùng hơn một dấu chấm than, không viết hoa toàn bộ chữ Latin.

### 1.2 Công thức theo video_format (dùng đúng công thức của video_format cho Title chính)
- habit_tips: {tình huống}일 때 도움이 되는 {N}가지 습관. Ví dụ: 걱정이 많은 밤에 도움이 되는 5가지 습관
- explain: 왜 {hiện tượng}일까요? {lý do ngắn}. Ví dụ: 왜 밤만 되면 생각이 많아질까요? 마음이 쉬지 못하는 이유
- routine: 잠들기 전 {N}분, {kết quả nhẹ nhàng}. Ví dụ: 잠들기 전 10분, 마음이 가벼워지는 습관
- comfort: {tình huống}이라도 괜찮아요. Ví dụ: 잠이 오지 않는 밤이라도 괜찮아요

### 1.3 Ba title cần xuất
- metadata.title: theo đúng công thức của video_format.
- alternative_titles[0]: cùng nội dung nhưng dùng công thức của video_format KHÁC phù hợp để A/B test.
- alternative_titles[1]: góc nhìn cảm xúc (an tâm, đồng cảm hoặc tò mò), vẫn có con số cụ thể hoặc câu hỏi rõ ràng.

---

## PHẦN 2. QUY TẮC THIẾT KẾ THUMBNAIL (thumbnail.prompt) - TỐI ƯU CTR

### 2.1 Nguyên tắc
- Thumbnail là MỘT CẢNH toàn khung 16:9 (không có dải đen). Chữ ít, rất to, đọc được ở 20% kích thước (điện thoại).
- Chữ thumbnail là bản rút gọn, gây tò mò của title: dòng 1 là hook hoặc câu hỏi, dòng 2 là chi tiết cụ thể.
- Một nhân vật + MỘT đạo cụ lớn rõ ràng. Không thêm thành phần khác.

### 2.2 Bố cục cố định
Ảnh 16:9:
1. NỀN: cảnh đời sống Hàn Quốc theo setting_for_thumbnail, vẽ đúng phong cách ${imageStyle}.
2. NHÂN VẬT: một người Hàn (giới tính theo figure_gender, độ tuổi theo figure_age, ăn mặc giản dị, gọn gàng) ở phần ba bên trái hoặc phải của khung, chiếm khoảng 45% chiều cao khung, biểu cảm hợp nội dung (suy tư, nhẹ nhõm, phân vân, mỉm cười bình thản). Đạo cụ prop_for_thumbnail lớn bên cạnh, nét đơn giản.
3. DẢI TỐI Ở DƯỚI: lớp chuyển màu tối trong suốt dần ở 40% dưới của khung để chữ nổi bật (KHÔNG phải dải đen cứng).
4. CHỮ (đúng 2 dòng, căn giữa, kiểu gothic đậm tiếng Hàn, rất to):
   - Dòng 1: thumbnail_hook, màu TRẮNG, viền đen dày và bóng đổ.
   - Dòng 2: thumbnail_detail, màu VÀNG TƯƠI (#FFE600), viền đen dày và bóng đổ, cùng cỡ hoặc nhỏ hơn dòng 1 một chút.
   - Cả hai dòng nằm trong 86% chiều rộng bên trái; để trống góc dưới bên phải (nơi YouTube hiện thời lượng).
   - Cao tổng cộng khoảng 30 đến 35% chiều cao khung.

### 2.3 CẤM KỴ TRONG thumbnail.prompt
- KHÔNG viết tên mã kỹ thuật và KHÔNG để placeholder dạng ngoặc vuông.
- Mọi dòng chữ tiếng Hàn phải ghi nguyên văn trong dấu nháy đơn, kèm vị trí, màu, kích thước. Chữ phải ĐÚNG từng ký tự như telop_korean.
- KHÔNG thêm chữ nào khác (kể cả chữ trên biển, màn hình, sách trong cảnh), KHÔNG logo, KHÔNG watermark. Đồ vật có chữ chỉ là hình khối màu, không có chữ hay số.
- Không vẽ cảnh bạo lực, tự hại, thuốc men, bệnh viện hay vật dụng y tế.
- Cuối prompt thêm: "thick bold readable Korean text, high contrast, ultra readable at small size, 16:9, styled in ${imageStyle}".

### 2.4 Biến thể A/B
Xuất thêm 2 cặp chữ thay thế (ab_test_variants) cùng bố cục: một cặp dạng câu hỏi, một cặp nhấn con số.

---

## PHẦN 3. MÔ TẢ VÀ TAG
- description: tiếng Hàn, 3 đến 5 câu điềm đạm, câu đầu nhắc lại nhóm người hoặc nỗi đau của người xem (không lộ hết đáp án), một câu mời đăng ký kênh tự nhiên, câu cuối là disclaimer: "※이 영상은 일반적인 정보 제공을 목적으로 하며, 의학적·심리적 진단이나 치료를 대신하지 않습니다. 마음이 많이 힘드시다면 전문가와 상담해 주세요. (정신건강위기상담전화 1577-0199)"
- tags: 8 đến 12 tag tiếng Hàn. Gợi ý: 마음건강, 불면, 수면습관, 걱정, 번아웃, 마음챙김, 50대, 60대, thêm tag theo sub_topic và nhóm người. Không trùng lặp.

---

## OUTPUT FORMAT:
Chỉ xuất một JSON hợp lệ duy nhất, không bọc Markdown, không giải thích:

{
  "detected_niche": "Tên phân nhánh bằng tiếng Việt",
  "metadata": {
    "title": "Title chính tiếng Hàn theo công thức, 25-45 ký tự",
    "description": "Description tiếng Hàn 3-5 câu, kết thúc bằng disclaimer",
    "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"]
  },
  "alternative_titles": [
    "Title phương án 2 (công thức format khác)",
    "Title phương án 3 (góc nhìn cảm xúc)"
  ],
  "thumbnail": {
    "chosen_layout": "habit_tips | explain | routine | comfort",
    "concept": "Mô tả ý tưởng bằng tiếng Việt: bối cảnh, nhân vật, biểu cảm, đạo cụ, vì sao gây tò mò",
    "telop_korean": {
      "line_1": "Dòng 1 (trắng, viền đen)",
      "line_2": "Dòng 2 (vàng, viền đen)",
      "color": "Trắng và vàng #FFE600, viền đen dày, bóng đổ, trên lớp chuyển màu tối ở dưới"
    },
    "ab_test_variants": [
      { "line_1": "Cặp A/B 1 dòng 1", "line_2": "dòng 2" },
      { "line_1": "Cặp A/B 2 dòng 1", "line_2": "dòng 2" }
    ],
    "prompt": "A YouTube thumbnail in 16:9 showing a quiet Korean bedroom at night with a crescent moon visible through the window and a soft bedside lamp. On the right third sits a Korean woman in her early 60s with short gray-brown hair and a soft lavender pajama top, about 45 percent of the frame height, sitting on the edge of the bed with relaxed shoulders and a gentle calm expression, beside a glass of warm water. The bottom 40 percent of the frame fades into a soft transparent dark blue gradient. Two lines of huge bold gothic Korean text centered within the left 86 percent of the width: the first line in white with a thick black outline and drop shadow reading '잠이 안 올 때', the second line in bright yellow (#FFE600) with a thick black outline and drop shadow reading '마음 가벼운 5가지'. The bottom-right corner is left empty. No other text, no logo, no watermark. Thick bold readable Korean text, high contrast, ultra readable at small size, 16:9, styled in ${imageStyle}"
  }
}
`;
