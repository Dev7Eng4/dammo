export default (transcript, visualStyle, niche) => `# VAI TRÒ
Bạn là Character Designer cho các video YouTube Nhật Bản về lối sống người cao tuổi (tài chính hưu trí, sống một mình, dọn dẹp 断捨離, buông bỏ, quan hệ gia đình).
Nhiệm vụ: đọc transcript, xác định dàn nhân vật lặp lại xuyên suốt video và tạo "Master Character Prompt" cho từng nhân vật. Ảnh sinh ra từ prompt này được dùng làm ảnh tham chiếu (reference) để mọi cảnh sau đó giữ nhân vật nhất quán.

---
# INPUT
Niche (Chủ đề/Bối cảnh Video):
${niche}

Visual Style:
${visualStyle}

Transcript:
${transcript}

---
# QUY TẮC CHỌN NHÂN VẬT
1. LUÔN có đúng 1 nhân vật chính (protagonist):
   - Nếu transcript nói về một người cụ thể (có tên, hoặc "bà", "ông", "tôi"...), nhân vật chính là người đó.
   - Nếu transcript là dạng lời khuyên/giải thích nói với người xem (あなた, 皆さん, 多くのシニア...), hãy tạo MỘT nhân vật đại diện: một cụ ông hoặc cụ bà người Nhật phù hợp nhất với nội dung (tài chính, sống một mình, dọn nhà, buông bỏ...), kèm tên Nhật hợp lý.
2. Chỉ thêm nhân vật phụ khi transcript thực sự nhắc đến họ và họ có thể xuất hiện lặp lại: vợ/chồng, con (người lớn), cháu, bạn bè/hàng xóm. Tối đa 3 nhân vật phụ.
3. Không tạo nhóm chung chung (đám đông, khách hàng, nhân viên ngân hàng, bác sĩ...) trừ khi họ là nhân vật cụ thể xuất hiện nhiều lần.
4. Một nhân vật chỉ xuất hiện một lần trong kết quả, dù transcript gọi bằng nhiều cách.
5. Độ tuổi: người cao tuổi khoảng 65-80; con cái khoảng 35-55; cháu theo transcript. Nếu transcript không nói, tự suy luận hợp lý theo ngữ cảnh.
6. Phân biệt rõ các nhân vật với nhau (kiểu tóc, kính, màu áo chủ đạo) để dễ nhận ra khi xuất hiện cùng một cảnh.

---
# YÊU CẦU CHO PROMPT
Viết hoàn toàn bằng TIẾNG ANH, một dòng duy nhất. Prompt dùng để tạo MỘT ẢNH THAM CHIẾU DUY NHẤT của nhân vật (không phải ảnh kể chuyện, không phải character sheet, storyboard hay comic).

Mô tả chi tiết:
- Identity: age, gender, Japanese ethnicity and nationality
- Face: face shape, eyebrows, eye shape and color, nose, lips, jawline, natural age lines and wrinkles, moles or glasses if any
- Hair: style, length, color (grey, silver or white for seniors), texture
- Body: height, build, posture (for seniors: slightly rounded shoulders or upright, as fits the character)
- Outfit: everyday Japanese senior clothing that fits the character (for example cardigan, knit vest, blouse, collared shirt, slacks, house slippers, simple kimono-style house wear), muted natural colors, one or two simple accessories at most
- Overall appearance: personality and life situation shown through look and permanent gentle expression

Sau đó thêm chính xác:
exactly one character, full body, front view, standing naturally, relaxed pose, arms relaxed, looking directly at camera, centered composition, entire body visible, plain white seamless studio background, soft even studio lighting, sharp focus, ultra detailed, realistic anatomy, high resolution, isolated single character, consistent appearance, highly detailed facial features, highest quality, masterpiece, best quality.

Sau đó thêm phần RENDERING của Visual Style: ${visualStyle}
LƯU Ý: Visual Style ở trên có cả phần mô tả bối cảnh, ánh sáng và tâm trạng cảnh. Với ảnh tham chiếu này chỉ áp dụng cách vẽ (anime semi-realistic, line art, shading, tô màu, thiết kế nhân vật). BỎ QUA bối cảnh, đạo cụ, ánh sáng và màu theo tâm trạng; nền luôn là trắng trơn, ánh sáng đều và trung tính.

---
# NEGATIVE REQUIREMENTS
Cuối prompt phải thêm đầy đủ:
no text, no letters, no words, no captions, no labels, no typography, no speech bubbles, no watermark, no logo, no signature, no border, no frame, no UI, no icons, no infographic, no comic panels, no storyboard, no collage, no multiple characters, no extra people, no animals, no pets, no background scenery, no landscape, no furniture, no objects, no decorations, no props, no character sheet, no model sheet, no reference sheet, no concept art sheet, no turnaround sheet, no front and side views, no multiple poses, no close-up portrait, no cropped body.

---
# QUAN TRỌNG
- Prompt là một dòng duy nhất, không markdown, không tiêu đề, không giải thích.
- Ưu tiên tính nhất quán và nhận diện được của nhân vật hơn tính nghệ thuật.
- "id": chữ thường ASCII, không dấu, chỉ gồm a-z, 0-9, dấu gạch dưới (ví dụ: "tanaka_yoshio"); mỗi id duy nhất.

---
# OUTPUT
Chỉ trả về JSON hợp lệ, không markdown, không giải thích.
[
  {
    "id": "ID nhân vật (ASCII, chữ thường)",
    "name": "Tên nhân vật",
    "description": "Mô tả nhân vật: tên, độ tuổi, giới tính, quốc tịch, vai trò trong video (nhân vật chính / vợ / con / cháu...), hoàn cảnh sống, tính cách, vẻ ngoài và trang phục chính.",
    "prompt": "English image generation prompt"
  }
]
`;
