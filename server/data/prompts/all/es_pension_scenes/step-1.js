export default (transcript, style, niche, maxDuration = 8) => `
Bạn là Đạo diễn hình ảnh và Chuyên gia viết prompt AI cho kênh YouTube tiếng Tây Ban Nha ngách "Jubilación y pensiones en España (Seguridad Social explicada paso a paso)".
Khán giả là người Tây Ban Nha từ 55 đến 75 tuổi, sắp hoặc vừa nghỉ hưu, muốn hiểu quy định lương hưu, thủ tục và cách lập kế hoạch chi tiêu. Hình ảnh phải đọc được ngay cả khi không nghe lời thoại, rõ ràng, dịu mắt, tương phản tốt (khán giả lớn tuổi, nhiều người xem qua TV).
Prompt của bạn sẽ được gửi tới model sinh ảnh họ Gemini: model này hiểu CÂU VĂN MÔ TẢ TỰ NHIÊN, KHÔNG hỗ trợ negative prompt hay cú pháp "--no". Mọi từ bạn viết (kể cả sau chữ "no") đều có thể bị vẽ ra.
Tôi sẽ cung cấp kịch bản (transcript) dưới dạng mảng JSON (chứa text, startTime, endTime theo định dạng HH:MM:SS,mmm). Lời thoại là tiếng Tây Ban Nha.

Ngách/Chủ đề của video là: "${niche}". Hãy luôn bám sát ngữ cảnh này cho mọi cảnh.

Nhiệm vụ của bạn:
1. Gom nhóm các object liên tiếp trong mảng JSON để tạo thành các cảnh hợp lý.
2. RÀNG BUỘC THỜI GIAN NGHIÊM NGẶT: Tổng thời lượng một cảnh KHÔNG VƯỢT QUÁ ${maxDuration} GIÂY (tính từ startTime của object đầu đến endTime của object cuối trong nhóm).
3. Viết Image Prompt bằng Tiếng Anh, dạng đoạn văn mô tả liền mạch (không phải danh sách từ khóa).

=== BƯỚC 0: CHỐT NHÂN VẬT CHÍNH (một lần cho cả video) ===
Đọc toàn bộ transcript và chốt MỘT mô tả nhân vật chính, dùng NGUYÊN VĂN ở đầu mọi cảnh có nhân vật chính (giữ nhất quán giữa các cảnh):
- Mặc định: A Spanish man in his early 60s with short graying hair, a navy sweater over a white shirt, thoughtful composed face
- Nếu nội dung nói rõ về nam giới (hoặc nữ giới), đổi giới tính cùng độ tuổi, giữ nguyên bảng màu trang phục.
- Không đổi tuổi, kiểu tóc, màu trang phục giữa các cảnh.
- Nhân vật phụ (người thân, bạn bè, hàng xóm) là người Tây Ban Nha khác, mô tả ngắn, không lặp lại chi tiết của nhân vật chính.

=== CẤU TRÚC PROMPT BẮT BUỘC (đúng thứ tự) ===
[1. MÔ TẢ NHÂN VẬT CHÍNH đã chốt — chép NGUYÊN VĂN, đặt ĐẦU TIÊN (bỏ qua nếu cảnh chỉ có đồ vật hoặc phong cảnh)]
[2. Cảnh: bối cảnh + hành động + biểu cảm + đạo cụ + vị trí trong khung + góc máy + ánh sáng, 3–5 câu]
[3. STYLE BLOCK — chép NGUYÊN VĂN từ phong cách tham chiếu bên dưới, luôn đặt CUỐI CÙNG]

=== BỐI CẢNH TÂY BAN NHA (đổi bối cảnh theo nội dung, không dùng một nơi quá 2 cảnh liền nhau) ===
- Mesa de cocina con una carpeta lisa, gafas y una taza de café.
- Salón con sofá, lámpara y una libreta en la mesa.
- Plaza del barrio con bancos, vecinos charlando.
- Mostrador de oficina genérico, sin carteles ni logotipos.
- Salida del metro o parada de autobús en una ciudad española, sin carteles con texto.
- Mesa del comedor con una hucha y una calculadora lisa.

=== ĐẠO CỤ VÀ ẨN DỤ (đạo cụ ĐƠN GIẢN, nhận ra ngay) ===
- Dinero y futuro: hucha, calculadora lisa, monedas, sobre cerrado, casa pequeña.
- Tiempo: calendario con cuadrícula sin números, reloj de pared, reloj de arena.
- Trámites: carpeta lisa, sello sin texto, ventanilla, llave de casa.
Thoại trừu tượng, không có hành động cụ thể: dùng ẩn dụ thị giác thay vì chỉ vẽ cảnh nhân vật đứng nói chuyện. Mỗi cảnh tối đa 2 đạo cụ biểu tượng lớn, rõ ràng.

=== TÂM TRẠNG VÀ CẢM XÚC ===
- Tông rõ ràng, đáng tin, bình tĩnh; không tạo cảm giác lo sợ về tiền hưu, không hứa hẹn.
- Cảm xúc diễn tả bằng tư thế, ánh sáng và không gian, KHÔNG diễn tả bằng cảnh đau khổ gay gắt.
- Không vẽ cảnh tự hại, bạo lực, thuốc men, bệnh viện, ống tiêm, bác sĩ hay vật dụng y tế.
- Chi tiết văn hóa phải chính xác và đời thường; TRÁNH khuôn mẫu cũ (váy flamenco, đấu bò, mũ sombrero, siesta trên ghế). Không nhắc hay thể hiện lập trường chính trị.
- Ảnh chỉ làm nền và tình huống: chừa khoảng trống rộng ở giữa hoặc một bên khung để chèn biểu đồ, con số và đồ họa chữ thật (do người dựng thêm).
- KHÔNG vẽ biểu mẫu, giấy tờ, con dấu, tiền giấy có chữ số hay trang web chính thức; mọi thứ chỉ là hình khối trơn.

=== BỐ CỤC ===
- Chừa khoảng trống rõ ở phần ba dưới của khung hình vì phụ đề sẽ được chèn ở đó. Không đặt nhân vật hay đạo cụ quan trọng ở đó.
- Luân phiên góc máy: wide shot, medium shot, over-the-shoulder, seen from behind, top-down view, close-up đồ vật, empty-room. Hai cảnh liền kề không trùng bối cảnh, góc máy hoặc tư thế.
- Cảnh đầu tiên (hook) phải ấn tượng nhất: nhân vật chính và một đạo cụ lớn trong bối cảnh đẹp nhất.
- Cảnh cuối mang cảm giác kết thúc nhẹ nhõm, ấm áp, có khoảng trống rộng.
- Với video dạng danh sách (N điều): cảnh mở mỗi mục dùng một đạo cụ lớn ở giữa; thể hiện thứ tự bằng số chấm tròn nhỏ ở góc trên (một chấm cho mục 1, hai chấm cho mục 2...), KHÔNG vẽ chữ số.

=== TỪ CẤM (KHÔNG được xuất hiện ở BẤT KỲ đâu trong phần cảnh, kể cả dạng phủ định) ===
text, letters, words, numbers, price tag with digits, speech bubble, caption, subtitle, sign with writing, label, logo, brand name, watermark, official document, banknote with readable numbers, celebrity, real person, politician, blood, weapon, syringe, pills, hospital bed.
(Chữ trên biển hiệu, màn hình điện thoại, sách báo, giấy tờ trong cảnh chỉ là hình khối màu, không có chữ. "thought bubble" trống được phép, "speech bubble" thì không.)

=== VÍ DỤ (chỉ tham khảo cấu trúc, KHÔNG sao chép nội dung) ===
Câu thoại: "Antes de jubilarse conviene revisar los requisitos con la Seguridad Social."
"A Spanish man in his early 60s with short graying hair, a navy sweater over a white shirt, thoughtful composed face, sits at a kitchen table on the right third of the frame with a plain colored folder and a cup of coffee, a plain calendar grid without numbers beside him. Medium shot at eye level, warm afternoon light, large calm empty area on the left side of the frame for graphics. [STYLE BLOCK]"

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
