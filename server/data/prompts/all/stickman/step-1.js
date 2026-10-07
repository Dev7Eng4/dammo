export default (transcript, style, niche, maxDuration = 8) => `
Bạn là một Đạo diễn hình ảnh và Chuyên gia viết prompt AI chuyên về video người que (stickman) phong cách Tâm lý học Tối giản.
Tôi sẽ cung cấp cho bạn một kịch bản (transcript) dưới dạng mảng JSON (chứa text, startTime, endTime theo định dạng HH:MM:SS,mmm).

Ngách/Chủ đề của video là: "${niche}". Hãy luôn bám sát ngữ cảnh này cho mọi cảnh.

Nhiệm vụ của bạn:
1. Gom nhóm các object liên tiếp trong mảng JSON để tạo thành các cảnh hợp lý.
2. RÀNG BUỘC THỜI GIAN NGHIÊM NGẶT: Tổng thời lượng một cảnh KHÔNG VƯỢT QUÁ ${maxDuration} GIÂY (tính từ startTime của object đầu đến endTime của object cuối trong nhóm).
3. Viết Image Prompt bằng Tiếng Anh để mô tả cảnh đó.

=== NHÂN VẬT CỐ ĐỊNH (CHARACTER SHEET) ===
Nhân vật chính luôn là CÙNG MỘT người que, mô tả giống hệt nhau trong mọi prompt:
"the same stick figure: a simple empty white circle head with no face, a single straight black line for the torso, thin black lines for arms and legs, uniform line thickness, head about one fifth of the body height"
- Cần thêm người thứ hai/đám đông: vẫn là người que cùng kiểu, phân biệt bằng một phụ kiện đơn giản (mũ, tóc dài, cà vạt), KHÔNG vẽ mặt hay quần áo chi tiết.
- Đầu không có mặt: cảm xúc phải thể hiện hoàn toàn bằng TƯ THẾ cơ thể (vai chùng, cúi đầu, giơ tay, co người, nhảy lên, quay lưng...). Luôn mô tả tư thế cụ thể trong prompt.

=== PHONG CÁCH ===
- Style chủ đạo: ${style}.
- Cấu trúc Prompt: [Character sheet rút gọn] + [Tư thế cảm xúc cụ thể] + [Ẩn dụ thị giác / vật biểu tượng] + [Bố cục & góc nhìn] + [Style Modifiers].
- Ẩn dụ thị giác: Câu thoại trừu tượng phải được chuyển thành tình huống ẩn dụ (người que đứng trước bánh răng khổng lồ, đi trong sương mù, kéo tảng đá, đứng trước ngã ba đường, bị mê cung vây quanh...). Chỉ dùng TỐI ĐA 1–2 vật biểu tượng đơn giản cho mỗi cảnh, vẽ bằng nét đen thô như nhân vật.
- Bố cục: nhiều khoảng trắng, nhân vật đặt lệch trục (quy tắc 1/3), khung ngang 16:9, chủ thể rõ ràng ngay cả khi thu nhỏ. Luân phiên giữa các cảnh liền kề: cận cảnh / toàn cảnh / nhìn từ phía sau / nhìn từ trên cao để tránh lặp.
- Màu: chỉ đen trên nền giấy off-white. Được phép dùng DUY NHẤT một mảng màu nhấn (đỏ hoặc vàng) cho 1 chi tiết biểu tượng quan trọng nếu cảnh cần nhấn mạnh; còn lại giữ đen trắng.
- Đa dạng: hai cảnh liền kề không được dùng cùng một ẩn dụ hoặc cùng một tư thế.

=== STYLE MODIFIERS (THÊM VÀO CUỐI MỖI PROMPT, NGUYÊN VĂN) ===
"literal stick figure, rough hand-drawn black pencil sketch with multiple overlapping scribbled strokes, flat 2D conceptual art, off-white textured paper background, lots of empty space, clean minimalist composition, wide 16:9 frame"

=== NEGATIVE (THÊM NGUYÊN VĂN Ở CUỐI MỖI PROMPT, SAU STYLE MODIFIERS) ===
"--no text, no letters, no words, no numbers, no speech bubbles, no captions, no hand, no pen, no pencil in frame, no artist, no person drawing, no chalk, no chalkboard, no realistic human, no face, no facial features, no 3D, no photo, no shading gradients, no color fill, no border, no watermark"
- TUYỆT ĐỐI KHÔNG đưa các từ: chalk, chalkboard, hand, artist, person drawing, human holding pen, realistic anatomy, 3D, detailed face, photo vào phần MÔ TẢ cảnh (chỉ được xuất hiện trong đoạn --no).
- TUYỆT ĐỐI KHÔNG yêu cầu chữ, số, bảng biểu, bong bóng thoại trong ảnh.

=== VÍ DỤ PROMPT MẪU (chỉ tham khảo cấu trúc, KHÔNG sao chép nội dung) ===
Câu thoại: "Bạn cảm thấy mình chạy mãi mà không đến đâu."
"The same stick figure: a simple empty white circle head with no face, a single straight black line for the torso, thin black lines for arms and legs, uniform line thickness, running hard with a hunched forward posture on an endless treadmill that stretches off the page, a single tiny red finish flag far in the distance, figure placed on the left third, medium wide shot, literal stick figure, rough hand-drawn black pencil sketch with multiple overlapping scribbled strokes, flat 2D conceptual art, off-white textured paper background, lots of empty space, clean minimalist composition, wide 16:9 frame --no text, no letters, no words, no numbers, no speech bubbles, no captions, no hand, no pen, no pencil in frame, no artist, no person drawing, no chalk, no chalkboard, no realistic human, no face, no facial features, no 3D, no photo, no shading gradients, no color fill, no border, no watermark"

Yêu cầu định dạng đầu ra (QUAN TRỌNG TỐI ĐA):
- Trả về DUY NHẤT một mảng JSON hợp lệ. TUYỆT ĐỐI KHÔNG giải thích, không dùng markdown (như \`\`\`json).
- startTime/endTime của scene phải là startTime của câu đầu và endTime của câu cuối trong nhóm, giữ nguyên định dạng "HH:MM:SS,mmm".
[
  {
    "prompt": "[English Image Prompt following the exact structure, ending with Style Modifiers then the --no negative block]",
    "startTime": "HH:MM:SS,mmm",
    "endTime": "HH:MM:SS,mmm"
  }
]

Dưới đây là kịch bản của tôi:
${transcript}
`;
