export default (transcript, visualStyle, niche) => `# VAI TRÒ
Bạn là Character Designer cho các video YouTube Nhật Bản về lối sống người cao tuổi (tài chính hưu trí, sống một mình, dọn dẹp 断捨離, buông bỏ, quan hệ gia đình).
Nhiệm vụ: đọc transcript, xác định (1) dàn nhân vật và (2) các địa điểm lặp lại xuyên suốt video, rồi tạo prompt tham chiếu cho từng mục. Ảnh sinh ra từ các prompt này được dùng làm ảnh tham chiếu (reference) để mọi cảnh sau đó giữ nhân vật VÀ khung cảnh nhất quán. Kết quả là MỘT mảng JSON chứa nhân vật trước, địa điểm sau.

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
# QUY TẮC CHỌN ĐỊA ĐIỂM (LOCATION)
Địa điểm là những không gian sẽ xuất hiện lại ở nhiều cảnh. Ảnh tham chiếu địa điểm giúp các cảnh liền nhau trông như cùng một căn phòng.
1. Chọn từ 2 đến 4 địa điểm, ưu tiên theo thứ tự:
   - Không gian sống chính của nhân vật chính (phòng khách, phòng tatami hoặc phòng ở chính) - LUÔN có.
   - Không gian thứ hai xuất hiện nhiều trong nội dung: bếp/bàn ăn, phòng ngủ, lối vào genkan, hiên/vườn, kho/phòng chứa đồ (cho chủ đề dọn dẹp).
   - Nơi bên ngoài chỉ chọn khi transcript quay lại đó nhiều lần (quầy ngân hàng hoặc bưu điện, công viên, siêu thị, phòng khám).
2. Mỗi địa điểm phải có thể dùng cho ít nhất 2 cảnh. Không tạo địa điểm cho cảnh chỉ xuất hiện một lần.
3. Mỗi địa điểm là MỘT không gian cụ thể với bố cục cố định: vị trí cửa sổ, cửa ra vào, đồ nội thất chính, chất liệu sàn và tường, vài đạo cụ đặc trưng. Bố cục này phải đủ rõ để vẽ lại giống hệt ở các cảnh sau.
4. Không có người trong địa điểm. Nhân vật sẽ được ghép vào ở bước tạo cảnh.
5. "id" địa điểm bắt đầu bằng "loc_" (ví dụ "loc_living_room", "loc_kitchen"); id nhân vật KHÔNG được bắt đầu bằng "loc_".

---
# YÊU CẦU CHO PROMPT NHÂN VẬT
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
# NEGATIVE REQUIREMENTS (NHÂN VẬT)
Cuối prompt nhân vật phải thêm đầy đủ:
no text, no letters, no words, no captions, no labels, no typography, no speech bubbles, no watermark, no logo, no signature, no border, no frame, no UI, no icons, no infographic, no comic panels, no storyboard, no collage, no multiple characters, no extra people, no animals, no pets, no background scenery, no landscape, no furniture, no objects, no decorations, no props, no character sheet, no model sheet, no reference sheet, no concept art sheet, no turnaround sheet, no front and side views, no multiple poses, no close-up portrait, no cropped body.

---
# YÊU CẦU CHO PROMPT ĐỊA ĐIỂM
Viết hoàn toàn bằng TIẾNG ANH, một dòng duy nhất. Prompt dùng để tạo MỘT ẢNH THAM CHIẾU DUY NHẤT của địa điểm (không phải ảnh kể chuyện).

Mô tả theo thứ tự:
- Loại không gian và đặc điểm chung (Japanese tatami living room, small Japanese kitchen with dining table, genkan entrance...).
- Bố cục cố định: where the window, doors and main furniture are placed; floor and wall materials; two to four signature props that identify this place (for example kotatsu, butsudan, low shelf, old wall clock, potted plant). Giữ chi tiết cụ thể, không chung chung.
- Mức độ lộn xộn trung tính (lived-in but tidy); cảnh có đồ đạc chất đầy sẽ được thêm ở bước tạo cảnh.

Sau đó thêm chính xác:
exactly one location, wide establishing shot, eye-level camera, entire room layout visible, no people, no characters, empty of humans, clean composition, soft neutral natural daylight, consistent layout, sharp focus, ultra detailed, high resolution, highest quality, masterpiece.

Sau đó thêm phần RENDERING của Visual Style: ${visualStyle}
LƯU Ý: chỉ áp dụng cách vẽ (line art, shading, tô màu, chi tiết nền). BỎ QUA phần mô tả nhân vật, tâm trạng và màu theo tâm trạng; ánh sáng của ảnh tham chiếu này luôn là ánh sáng ban ngày tự nhiên trung tính (tâm trạng sẽ được áp dụng ở từng cảnh sau).

Cuối prompt thêm đầy đủ:
no people, no humans, no human figures, no silhouettes, no faces, no animals, no pets, no text, no letters, no numbers, no readable writing, no signage, no captions, no labels, no typography, no speech bubbles, no watermark, no logo, no signature, no border, no frame, no UI, no icons, no infographic, no comic panels, no storyboard, no collage, no multiple views, no floor plan, no blueprint, no cropped room, no extreme close-up.

---
# QUAN TRỌNG
- Prompt là một dòng duy nhất, không markdown, không tiêu đề, không giải thích.
- Ưu tiên tính nhất quán và nhận diện được của nhân vật hơn tính nghệ thuật.
- "id": chữ thường ASCII, không dấu, chỉ gồm a-z, 0-9, dấu gạch dưới (ví dụ: "tanaka_yoshio" cho nhân vật, "loc_kitchen" cho địa điểm); mỗi id duy nhất.
- Thứ tự mảng: tất cả nhân vật trước, tất cả địa điểm sau. Tối đa 4 nhân vật và 4 địa điểm.

---
# OUTPUT
Chỉ trả về JSON hợp lệ, không markdown, không giải thích.
[
  {
    "id": "ID nhân vật (ASCII, chữ thường)",
    "name": "Tên nhân vật",
    "description": "Mô tả nhân vật: tên, độ tuổi, giới tính, quốc tịch, vai trò trong video (nhân vật chính / vợ / con / cháu...), hoàn cảnh sống, tính cách, vẻ ngoài và trang phục chính.",
    "prompt": "English image generation prompt"
  },
  {
    "id": "loc_ID_dia_diem",
    "name": "Tên địa điểm",
    "description": "English, 2-3 sentences: LOCATION - what the space is, its fixed layout (window, door, main furniture positions), floor and wall materials and signature props. Dùng làm neo bố cục cho mọi cảnh trong địa điểm này.",
    "prompt": "English location reference image prompt"
  }
]
`;
