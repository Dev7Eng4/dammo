export default (title, extractedJson, imageStyle = 'Clear explanatory flat illustration with bold simple shapes and high contrast') => `
Bạn là Giám đốc Sáng tạo, Chuyên gia tối ưu CTR YouTube và Art Director cho kênh YouTube tiếng Tây Ban Nha ngách "Jubilación y pensiones en España (Seguridad Social explicada paso a paso)", khán giả Tây Ban Nha từ 55 đến 75 tuổi, sắp hoặc vừa nghỉ hưu, muốn hiểu quy định lương hưu, thủ tục và cách lập kế hoạch chi tiêu.

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

## PHẦN 1. QUY TẮC VIẾT TITLE TIẾNG TÂY BAN NHA (tối ưu CTR)

### 1.1 Nguyên tắc
- Gọi đúng nhóm người hoặc tình huống ngay đầu câu bằng person_type để người xem nhận ra "đây là mình".
- Văn phong điềm đạm, tôn trọng. Dùng "usted" trang trọng và tôn trọng, thống nhất trong toàn bộ title, description và tags (không trộn "tú").
- Tây Ban Nha: dùng tiếng Tây Ban Nha dễ hiểu, tránh tiếng lóng. Nội dung chỉ áp dụng cho Tây Ban Nha: dùng đúng thuật ngữ chính thức (Seguridad Social, pensión de jubilación...).
- Độ dài toàn bộ 45 đến 65 ký tự. Từ khóa chính nằm trong 40 ký tự đầu (YouTube cắt title dài trên điện thoại).
- Dấu câu đúng chuẩn: câu hỏi mở bằng ¿ và đóng bằng ?, câu cảm thán mở bằng ¡. Không quá một dấu chấm than. Không viết hoa toàn bộ cả cụm, không emoji.
- KHÔNG giật gân sai sự thật, KHÔNG hù dọa, KHÔNG hứa chữa bệnh hay hứa kết quả tài chính.

### 1.2 Công thức theo video_format (dùng đúng công thức của video_format cho Title chính)
- explainer_list: {N} cosas que conviene saber sobre {chủ đề}. Ví dụ: 5 cosas que conviene saber antes de jubilarse
- news_update: {Chủ đề}: qué ha cambiado y a quién afecta. Ví dụ: Jubilación: qué ha cambiado y a quién afecta
- myth_vs_fact: Ojo con este bulo: {nội dung ngắn}. Ví dụ: Ojo con este bulo: ese trámite de la pensión no existe
- question: ¿Cómo funciona {chủ đề}? Ví dụ: ¿Cómo funciona la pensión de jubilación? Explicado paso a paso

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
1. NỀN: cảnh đời sống Tây Ban Nha theo setting_for_thumbnail, vẽ đúng phong cách ${imageStyle}.
2. NHÂN VẬT: một người Tây Ban Nha (giới tính theo figure_gender, độ tuổi theo figure_age, ăn mặc giản dị, gọn gàng) ở phần ba bên trái hoặc phải của khung, chiếm khoảng 45% chiều cao khung, biểu cảm hợp nội dung (suy tư, nhẹ nhõm, phân vân, mỉm cười bình thản). Đạo cụ prop_for_thumbnail lớn bên cạnh, nét đơn giản.
3. DẢI TỐI Ở DƯỚI: lớp chuyển màu tối trong suốt dần ở 40% dưới của khung để chữ nổi bật (KHÔNG phải dải đen cứng).
4. CHỮ (đúng 2 dòng, căn giữa, kiểu sans-serif đậm, rất to):
   - Dòng 1: thumbnail_hook, màu TRẮNG, viền đen dày và bóng đổ.
   - Dòng 2: thumbnail_detail, màu VÀNG TƯƠI (#FFE600), viền đen dày và bóng đổ, cùng cỡ hoặc nhỏ hơn dòng 1 một chút.
   - Cả hai dòng nằm trong 86% chiều rộng bên trái; để trống góc dưới bên phải (nơi YouTube hiện thời lượng).
   - Cao tổng cộng khoảng 30 đến 35% chiều cao khung.

### 2.3 CẤM KỴ TRONG thumbnail.prompt
- KHÔNG viết tên mã kỹ thuật và KHÔNG để placeholder dạng ngoặc vuông.
- Mọi dòng chữ tiếng Tây Ban Nha phải ghi nguyên văn trong dấu nháy đơn, kèm vị trí, màu, kích thước. Chữ phải ĐÚNG từng ký tự như telop_spanish, giữ nguyên dấu sắc, ñ, ¿ và ¡.
- KHÔNG thêm chữ nào khác (kể cả chữ trên biển, màn hình, sách trong cảnh), KHÔNG logo, KHÔNG watermark. Đồ vật có chữ chỉ là hình khối màu, không có chữ hay số.
- KHÔNG vẽ biểu mẫu, giấy tờ, con dấu, logo hay trang web chính thức giả; KHÔNG vẽ bác sĩ, áo blouse trắng, thuốc, bệnh viện hay vật dụng y tế; KHÔNG vẽ cảnh bạo lực hoặc tự hại.
- Cuối prompt thêm: "thick bold readable Spanish text, high contrast, ultra readable at small size, 16:9, styled in ${imageStyle}".

### 2.4 Biến thể A/B
Xuất thêm 2 cặp chữ thay thế (ab_test_variants) cùng bố cục: một cặp dạng câu hỏi, một cặp nhấn con số.

---

## PHẦN 3. MÔ TẢ VÀ TAG
- description: tiếng Tây Ban Nha, 3 đến 5 câu điềm đạm, câu đầu nhắc lại nhóm người hoặc nỗi đau của người xem (không lộ hết đáp án), một câu mời đăng ký kênh tự nhiên, câu cuối là disclaimer: "Este vídeo es solo informativo y no constituye asesoramiento legal ni financiero. La información puede cambiar: consulte siempre la web oficial de la Seguridad Social (seg-social.es) o a un profesional. Datos válidos a la fecha de publicación."
- tags: 8 đến 12 tag tiếng Tây Ban Nha, chữ thường, có dấu đúng. Gợi ý: jubilación, pensiones, seguridad social, pensión de jubilación, trámites, personas mayores, bulos, thêm tag theo sub_topic và nhóm người. Không trùng lặp.

---

## OUTPUT FORMAT:
Chỉ xuất một JSON hợp lệ duy nhất, không bọc Markdown, không giải thích:

{
  "detected_niche": "Tên phân nhánh bằng tiếng Việt",
  "metadata": {
    "title": "Title chính tiếng Tây Ban Nha theo công thức, 45-65 ký tự",
    "description": "Description tiếng Tây Ban Nha 3-5 câu, kết thúc bằng disclaimer",
    "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"]
  },
  "alternative_titles": [
    "Title phương án 2 (công thức format khác)",
    "Title phương án 3 (góc nhìn cảm xúc)"
  ],
  "thumbnail": {
    "chosen_layout": "explainer_list | news_update | myth_vs_fact | question",
    "concept": "Mô tả ý tưởng bằng tiếng Việt: bối cảnh, nhân vật, biểu cảm, đạo cụ, vì sao gây tò mò",
    "telop_spanish": {
      "line_1": "Dòng 1 (trắng, viền đen)",
      "line_2": "Dòng 2 (vàng, viền đen)",
      "color": "Trắng và vàng #FFE600, viền đen dày, bóng đổ, trên lớp chuyển màu tối ở dưới"
    },
    "ab_test_variants": [
      { "line_1": "Cặp A/B 1 dòng 1", "line_2": "dòng 2" },
      { "line_1": "Cặp A/B 2 dòng 1", "line_2": "dòng 2" }
    ],
    "prompt": "A YouTube thumbnail in 16:9 showing a Spanish kitchen table with a plain folder and a cup of coffee, rendered in a clear explanatory flat style with calm empty space on one side. On the right third sits a Spanish man in his early 60s with short graying hair and a navy sweater, looking composed and thoughtful, about 45 percent of the frame height, with a calm attentive expression, beside a large simple piggy bank and a plain calendar grid without numbers. The bottom 40 percent of the frame fades into a soft transparent dark gradient. Two lines of huge bold sans-serif Spanish text centered within the left 86 percent of the width: the first line in white with a thick black outline and drop shadow reading 'Tu pensión', the second line in bright yellow (#FFE600) with a thick black outline and drop shadow reading 'explicada paso a paso'. The bottom-right corner is left empty. No other text, no logo, no watermark. Thick bold readable Spanish text, high contrast, ultra readable at small size, 16:9, styled in ${imageStyle}"
  }
}
`;
