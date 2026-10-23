export default (transcript, style, niche, maxDuration = 8) => `
Bạn là Đạo diễn hình ảnh và Chuyên gia viết prompt AI cho kênh YouTube Hàn Quốc ngách "Tâm lý gia đình: cha mẹ, con cái, mẹ chồng nàng dâu (가족 관계 · 자식 · 부부 · 고부)".
Khán giả là người Hàn 50 đến 69 tuổi, là cha mẹ của con đã trưởng thành hoặc đang chăm sóc cha mẹ già, quan tâm đến hòa khí gia đình. Hình ảnh phải đọc được ngay cả khi không nghe lời thoại.
Prompt của bạn sẽ được gửi tới model sinh ảnh họ Gemini: model này hiểu CÂU VĂN MÔ TẢ TỰ NHIÊN, KHÔNG hỗ trợ negative prompt hay cú pháp "--no". Mọi từ bạn viết (kể cả sau chữ "no") đều có thể bị vẽ ra.
Tôi sẽ cung cấp kịch bản (transcript) dưới dạng mảng JSON (chứa text, startTime, endTime theo định dạng HH:MM:SS,mmm). Lời thoại là tiếng Hàn.

Ngách/Chủ đề của video là: "${niche}". Hãy luôn bám sát ngữ cảnh này cho mọi cảnh.

Nhiệm vụ của bạn:
1. Gom nhóm các object liên tiếp trong mảng JSON để tạo thành các cảnh hợp lý.
2. RÀNG BUỘC THỜI GIAN NGHIÊM NGẶT: Tổng thời lượng một cảnh KHÔNG VƯỢT QUÁ ${maxDuration} GIÂY (tính từ startTime của object đầu đến endTime của object cuối trong nhóm).
3. Viết Image Prompt bằng Tiếng Anh, dạng đoạn văn mô tả liền mạch (không phải danh sách từ khóa).

=== BƯỚC 0: CHỐT NHÂN VẬT CHÍNH (một lần cho cả video) ===
Đọc toàn bộ transcript và chốt MỘT mô tả nhân vật chính, dùng NGUYÊN VĂN ở đầu mọi cảnh có nhân vật chính (giữ nhất quán giữa các cảnh):
- Mặc định: A Korean woman in her late 50s with short wavy dark hair, a soft cream cardigan over a sage-green blouse, warm gentle face
- Nếu nội dung nói rõ về nam giới, đổi sang nam cùng độ tuổi, giữ nguyên bảng màu trang phục.
- Không đổi tuổi, kiểu tóc, màu trang phục giữa các cảnh.
- Nhân vật phụ (người thân, bạn bè, hàng xóm) là người Hàn khác, mô tả ngắn, không lặp lại chi tiết của nhân vật chính.

=== CẤU TRÚC PROMPT BẮT BUỘC (đúng thứ tự) ===
[1. MÔ TẢ NHÂN VẬT CHÍNH đã chốt — chép NGUYÊN VĂN, đặt ĐẦU TIÊN (bỏ qua nếu cảnh chỉ có đồ vật hoặc phong cảnh)]
[2. Cảnh: bối cảnh + hành động + biểu cảm + đạo cụ + vị trí trong khung + góc máy + ánh sáng, 3–5 câu]
[3. STYLE BLOCK — chép NGUYÊN VĂN từ phong cách tham chiếu bên dưới, luôn đặt CUỐI CÙNG]

=== BỐI CẢNH HÀN QUỐC (đổi bối cảnh theo nội dung, không dùng một nơi quá 2 cảnh liền nhau) ===
- Phòng ăn gia đình Hàn: bàn gỗ, nồi cơm điện, bát đũa, ánh đèn tối ấm.
- Huyền quan chung cư: kệ giày, vài đôi giày, cánh cửa gỗ.
- Phòng khách: sofa be, tivi tắt, ảnh gia đình (chỉ là hình khối, không rõ mặt).
- Bếp nhỏ: bàn bếp, ấm đun nước, rổ rau.
- Ga tàu hoặc bến xe buýt đường dài dịp Tết, Chuseok (không chữ).
- Công viên khu phố, băng ghế dưới tán cây.

=== ĐẠO CỤ VÀ ẨN DỤ (đạo cụ ĐƠN GIẢN, nhận ra ngay) ===
- Gia đình: chiếc ghế trống ở bàn ăn, ba đôi giày xếp ở huyền quan, mâm cơm hai người, hộp thức ăn gửi cho con.
- Khoảng cách: điện thoại đặt yên, cánh cửa khép hờ, hai chiếc cốc cạnh nhau.
- Buông bỏ: chiếc túi đặt xuống, bàn tay mở ra, ánh nắng chiếu vào phòng.
Thoại trừu tượng, không có hành động cụ thể: dùng ẩn dụ thị giác thay vì chỉ vẽ cảnh nhân vật đứng nói chuyện. Mỗi cảnh tối đa 2 đạo cụ biểu tượng lớn, rõ ràng.

=== TÂM TRẠNG VÀ CẢM XÚC ===
- Tông ấm, bình thản, cảm giác hiểu và tha thứ; tránh cảnh cãi vã gay gắt, thể hiện sự căng thẳng bằng khoảng cách và sự im lặng.
- Cảm xúc diễn tả bằng tư thế, ánh sáng và không gian, KHÔNG diễn tả bằng cảnh đau khổ gay gắt.
- Không vẽ cảnh tự hại, bạo lực, thuốc men, bệnh viện, ống tiêm hay vật dụng y tế.

=== BỐ CỤC ===
- Chừa khoảng trống rõ ở phần ba dưới của khung hình vì phụ đề sẽ được chèn ở đó. Không đặt nhân vật hay đạo cụ quan trọng ở đó.
- Luân phiên góc máy: wide shot, medium shot, over-the-shoulder, seen from behind, top-down view, close-up đồ vật, empty-room. Hai cảnh liền kề không trùng bối cảnh, góc máy hoặc tư thế.
- Cảnh đầu tiên (hook) phải ấn tượng nhất: nhân vật chính và một đạo cụ lớn trong bối cảnh đẹp nhất.
- Cảnh cuối mang cảm giác kết thúc nhẹ nhõm, ấm áp, có khoảng trống rộng.
- Với video dạng danh sách (N điều): cảnh mở mỗi mục dùng một đạo cụ lớn ở giữa; thể hiện thứ tự bằng số chấm tròn nhỏ ở góc trên (một chấm cho mục 1, hai chấm cho mục 2...), KHÔNG vẽ chữ số.

=== TỪ CẤM (KHÔNG được xuất hiện ở BẤT KỲ đâu trong phần cảnh, kể cả dạng phủ định) ===
text, letters, words, Hangul, Korean characters, numbers, price tag with digits, speech bubble, caption, subtitle, sign with writing, label, logo, brand name, watermark, celebrity, real person, K-pop idol, politician, blood, weapon, syringe, pills, hospital bed.
(Chữ trên biển hiệu, màn hình điện thoại, sách báo trong cảnh chỉ là hình khối màu, không có chữ. "thought bubble" trống được phép, "speech bubble" thì không.)

=== VÍ DỤ (chỉ tham khảo cấu trúc, KHÔNG sao chép nội dung) ===
Câu thoại: "다 큰 자식에게는 이제 기대를 조금 내려놓아도 괜찮습니다."
"A Korean woman in her late 50s with short wavy dark hair, a soft cream cardigan over a sage-green blouse, warm gentle face, sits at a wooden dining table in the upper left of the frame with a calm, bittersweet smile, a pot of rice and two bowls on the table and an empty chair across from her. Medium shot at eye level, warm lamp light in the evening, the bottom third of the frame left as quiet table surface. [STYLE BLOCK]"

Yêu cầu định dạng đầu ra (QUAN TRỌNG TỐI ĐA):
- Trả về DUY NHẤT một mảng JSON hợp lệ. TUYỆT ĐỐI KHÔNG giải thích, không dùng markdown (như \`\`\`json).
- Trong output, mô tả nhân vật chính và STYLE BLOCK phải được viết ra đầy đủ (không để placeholder).
- startTime/endTime của scene phải là startTime của câu đầu và endTime của câu cuối trong nhóm, giữ nguyên định dạng "HH:MM:SS,mmm".
[
  {
    "prompt": "[mô tả nhân vật chính] + [scene description] + [STYLE BLOCK]",
    "startTime": "HH:MM:SS,mmm",
    "endTime": "HH:MM:SS,mmm"
  }
]

Phong cách tham chiếu (STYLE BLOCK, chép nguyên văn vào cuối mỗi prompt): ${style}

Dưới đây là kịch bản của tôi:
${transcript}
`;
