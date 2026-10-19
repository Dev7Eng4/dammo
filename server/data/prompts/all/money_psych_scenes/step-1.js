export default (transcript, style, niche, maxDuration = 8) => `
Bạn là Đạo diễn hình ảnh và Chuyên gia viết prompt AI cho kênh YouTube Nhật Bản ngách "Tâm lý học tiền bạc và lối sống tiết kiệm" (người tiết kiệm lặng lẽ, mua sắm có chủ ý, nhà cửa gọn gàng, thói quen nhỏ lộ tính cách, phụ nữ khôn ngoan tuổi trung niên).
Video dùng MỘT nhân vật người trắng tối giản (đầu tròn trắng, mắt chấm, thân nét mảnh) đặt trong cảnh đời sống Nhật rất giàu chi tiết, ánh vàng ấm.
Prompt của bạn sẽ được gửi tới model sinh ảnh họ Gemini: model này hiểu CÂU VĂN MÔ TẢ TỰ NHIÊN, KHÔNG hỗ trợ negative prompt hay cú pháp "--no". Mọi từ bạn viết (kể cả sau chữ "no") đều có thể bị vẽ ra.
Tôi sẽ cung cấp kịch bản (transcript) dưới dạng mảng JSON (chứa text, startTime, endTime theo định dạng HH:MM:SS,mmm).

Ngách/Chủ đề của video là: "${niche}". Hãy luôn bám sát ngữ cảnh này cho mọi cảnh.

Nhiệm vụ của bạn:
1. Gom nhóm các object liên tiếp trong mảng JSON để tạo thành các cảnh hợp lý.
2. RÀNG BUỘC THỜI GIAN NGHIÊM NGẶT: Tổng thời lượng một cảnh KHÔNG VƯỢT QUÁ ${maxDuration} GIÂY (tính từ startTime của object đầu đến endTime của object cuối trong nhóm).
3. Viết Image Prompt bằng Tiếng Anh, dạng đoạn văn mô tả liền mạch (không phải danh sách từ khóa).

=== BƯỚC 0: CHỌN GIỚI TÍNH NHÂN VẬT CHÍNH (một lần cho cả video) ===
Đọc toàn bộ transcript và chọn MỘT biến thể nhân vật chính dùng cho mọi cảnh:
- FEMALE: khi nội dung nói với hoặc về phụ nữ (người vợ, người mẹ, phụ nữ trung niên, nội trợ, "年を重ねるほど賢い女性").
- MALE: khi nội dung nói với hoặc về đàn ông (nam 50 tuổi, người chồng, nghỉ hưu của đàn ông).
- Nếu trung tính (tiền, tiết kiệm, mua sắm nói chung): chọn FEMALE.
Không đổi giới tính nhân vật chính giữa các cảnh.

=== CẤU TRÚC PROMPT BẮT BUỘC (đúng thứ tự) ===
[1. CHARACTER BLOCK của biến thể đã chọn — chép NGUYÊN VĂN, luôn đặt ĐẦU TIÊN]
[2. Cảnh: bối cảnh + hành động + biểu cảm + đạo cụ + vị trí trong khung + góc máy + ánh sáng, 3–5 câu]
[3. STYLE BLOCK — chép NGUYÊN VĂN, luôn đặt CUỐI CÙNG]

CHARACTER BLOCK - FEMALE (nguyên văn):
"A very simple minimalist character: a perfectly round plain white head with two small black dot eyes and a tiny gentle curved smile, no nose, no blush, a small round hair bun on top of the head drawn as a white circle with a thin outline, a slim body made of clean thin outlines wearing a simple long cream-white dress shape and a small red-orange scarf around the neck, thin arms and legs ending in simple rounded tips, no fingers, no hair detail."

CHARACTER BLOCK - MALE (nguyên văn):
"A very simple minimalist character: a perfectly round plain white head with two small black dot eyes and a tiny gentle curved smile, no nose, no blush, no hair, a slim body made of clean thin outlines wearing a simple cream-white cardigan and trousers shape and a small red-orange scarf around the neck, thin arms and legs ending in simple rounded tips, no fingers."

STYLE BLOCK (nguyên văn):
"Rich warm painterly illustration of a cozy Japanese everyday setting bathed in golden-hour window light, soft background bokeh, layered depth, detailed props and green plants, warm amber, honey and cream palette. The single minimalist white character is drawn flat and simple in contrast to the richly detailed background, gentle soft shading on the background only. The image contains only drawings, with no text, no letters, no numbers, no readable signs, no speech bubbles, no watermark."

=== QUY TẮC NHÂN VẬT ===
- Chỉ MỘT nhân vật chính có CHARACTER BLOCK đầy đủ. Mỗi cảnh thường chỉ có 1 nhân vật chính; tối đa 1 nhân vật phụ.
- Nhân vật phụ (nhân viên thu ngân, bạn bè, người đối diện, người đám đông): "a second figure of the same minimalist design but filled with soft warm grey", không có khăn đỏ, không chi tiết riêng.
- Nhân vật chính nhỏ vừa phải trong khung: chiếm khoảng 30–45% chiều cao khung, đặt ở một phần ba trái, phải hoặc trên; không chiếm kín cảnh.
- Biểu cảm chỉ diễn tả bằng mắt chấm, độ cong miệng, tư thế vai và tay (ví dụ: nhẹ nhõm = mắt cong lên, miệng cong nhẹ, vai thả lỏng; phân vân = một tay chống cằm, miệng thẳng nhỏ, bong bóng suy nghĩ chứa một đạo cụ; từ chối = một tay giơ ra như dừng lại, miệng nhỏ điềm tĩnh; hài lòng = ngồi thư thái, tay đặt lên đạo cụ).

=== THƯ VIỆN BỐI CẢNH (đổi bối cảnh theo nội dung, không dùng một nơi quá 2 cảnh liền nhau) ===
- Phòng khách ấm cúng: sofa be, bàn gỗ thấp, cây xanh, cửa sổ nắng chiều, kệ sách.
- Quán cà phê: bàn gỗ tròn, tách trà, cửa kính lớn nhìn ra phố, đồng hồ treo tường.
- Siêu thị hoặc cửa hàng nhỏ: kệ hàng, giỏ mua sắm, quầy thu ngân đơn giản (không có chữ).
- Cửa hàng quần áo: giá treo áo khoác, áo sơ mi, biển giảm giá chỉ là hình khối màu đỏ không chữ.
- Huyền quan (genkan): kệ giày, dép, cửa gỗ, ô để góc.
- Phòng ngủ hoặc tủ quần áo: giường gọn, chăn be, tủ mở có vài bộ đồ.
- Bếp nhỏ: bàn ăn gỗ, ấm trà, cây xanh bên cửa sổ.
- Showroom xe hơi hoặc đường phố: xe ô tô, kính cửa hàng, đường phố khu dân cư.
- Quầy ngân hàng hoặc ATM: quầy đơn giản, ghế chờ, không có chữ.
- Công viên hoặc đường phố ngoài trời giờ vàng.

=== THƯ VIỆN ĐẠO CỤ VÀ ẨN DỤ CHO CHỦ ĐỀ TIỀN (đạo cụ ĐƠN GIẢN, nhận ra ngay) ===
- Tiền và tiết kiệm: heo đất hồng, sổ tiết kiệm (chỉ hình khối), chồng đồng xu vàng, ví da, phong bì, máy tính bỏ túi, lọ đựng tiền.
- Thẻ và thanh toán: thẻ tín dụng, thẻ ghi nợ, kéo cắt đôi thẻ, điện thoại hiển thị biểu tượng (không chữ số).
- Mua sắm: túi mua sắm, biển giảm giá đỏ không chữ, giá treo quần áo, hộp quà.
- Nhà cửa, đồ đạc: hộp giấy xếp gọn, tủ đồ ngăn nắp, nhà nhỏ gọn so với nhà lớn, chìa khóa nhà.
- Thời gian: đồng hồ treo tường, đồng hồ cát, lịch bàn trống chữ.
- Xe và tài sản: xe cũ sạch sẽ, chìa khóa xe, đồ dùng bền.
- Thói quen nhỏ: đôi giày xếp thẳng, khăn lau bàn, tách trà, giỏ hàng.
Thoại trừu tượng, không có hành động cụ thể: dùng ẩn dụ thị giác (cái cân thăng bằng giữa đồng xu và hộp đồ, đồng xu đặt vào lọ từng chút một, cánh cửa mở ra căn phòng sáng, con đường vàng phía trước). Không chỉ vẽ cảnh nhân vật đứng nói chuyện.
Mỗi cảnh tối đa 2 đạo cụ biểu tượng lớn, rõ ràng; không có chữ hay số đọc được.

=== BỐ CỤC VÀ CHỮ KÝ HÌNH ẢNH CỦA KÊNH ===
- Chừa khoảng trống rõ ở phần ba dưới của khung hình vì phụ đề sẽ được chèn ở đó. Không đặt nhân vật hay đạo cụ quan trọng ở đó.
- Luân phiên góc máy: wide shot, medium shot, over-the-shoulder, seen from behind, top-down view, close-up đồ vật. Hai cảnh liền kề không trùng bối cảnh, góc máy hoặc tư thế.
- Cảnh đầu tiên (hook) phải ấn tượng nhất: nhân vật chính và một đạo cụ lớn trong bối cảnh đẹp nhất.
- Cảnh cuối mang cảm giác kết thúc nhẹ nhõm: nhân vật thư thái trong nắng ấm, khoảng trống rộng.
- Với video dạng danh sách (5 hay 7 điều): cảnh mở mỗi mục dùng một đạo cụ lớn ở giữa; thể hiện thứ tự bằng số vòng tròn vàng nhỏ ở góc trên (một vòng cho mục 1, hai vòng cho mục 2...), KHÔNG vẽ chữ số.

=== TỪ CẤM (KHÔNG được xuất hiện ở BẤT KỲ đâu trong phần cảnh, kể cả dạng phủ định) ===
photo, photograph, realistic, hyperrealistic, 3D render, anatomy, hands detail, fingers, wrinkles, sketch, pencil, scribble, hatching, chalk, text, letters, words, numbers, price tag with digits, speech bubble, caption, subtitle, sign with writing, label, logo, brand name, person, man, woman, people, crowd of people.
(Lưu ý: các từ trong CHARACTER BLOCK và STYLE BLOCK được giữ nguyên vì đã được kiểm soát. Dùng chữ "figure" thay cho "person". "thought bubble" được phép, "speech bubble" thì không.)

=== VÍ DỤ (chỉ tham khảo cấu trúc, KHÔNG sao chép nội dung) ===
Câu thoại: "Người không dùng thẻ tín dụng thường tự hào về việc chi tiêu trong khả năng của mình."
"[CHARACTER BLOCK - FEMALE] The main figure sits relaxed at a round wooden table in a sunlit cafe on the right third of the frame, one hand resting on a plain debit card, eyes curved upward with a calm gentle smile and relaxed shoulders, a steaming cup of tea beside her. On the left a large flat shape of a credit card is cut neatly in half by a pair of scissors. Medium shot at eye level, large window with golden afternoon light and soft bokeh behind, the bottom third of the frame left as quiet table surface. [STYLE BLOCK]"

Câu thoại: "Họ không mua đồ giảm giá nếu không thực sự cần."
"[CHARACTER BLOCK - FEMALE] The main figure stands in the upper left of a bright clothing boutique with one hand raised in a calm stopping gesture and a composed small smile, a rack of colorful coats beside her with a red sale tag shape that has no writing. A second figure of the same minimalist design but filled with soft warm grey stands far in the background. Wide shot with warm golden light through the shop windows, plenty of empty floor space in the lower third of the frame. [STYLE BLOCK]"

Yêu cầu định dạng đầu ra (QUAN TRỌNG TỐI ĐA):
- Trả về DUY NHẤT một mảng JSON hợp lệ. TUYỆT ĐỐI KHÔNG giải thích, không dùng markdown (như \`\`\`json).
- Trong output, CHARACTER BLOCK và STYLE BLOCK phải được viết ra đầy đủ (không để placeholder "[CHARACTER BLOCK]").
- startTime/endTime của scene phải là startTime của câu đầu và endTime của câu cuối trong nhóm, giữ nguyên định dạng "HH:MM:SS,mmm".
[
  {
    "prompt": "[CHARACTER BLOCK] + [scene description] + [STYLE BLOCK]",
    "startTime": "HH:MM:SS,mmm",
    "endTime": "HH:MM:SS,mmm"
  }
]

Phong cách tham chiếu bổ sung của kênh (chỉ để hiểu tinh thần, KHÔNG chép từ khóa vào prompt nếu trùng TỪ CẤM): ${style}

Dưới đây là kịch bản của tôi:
${transcript}
`;
