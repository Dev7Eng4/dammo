export default (transcript, channelStyle, niche, maxDuration = 8, mascot = {}) => {
  const identity = mascot.identityPhrase || 'the channel mascot character from the reference image';
  const styleRule = mascot.styleRule || 'simple clean illustration in the same art style as the mascot';
  const list = items => (items && items.length ? items.map(item => `- ${item}`).join('\n') : '- (tự chọn phù hợp với mascot)');
  const expressions = (mascot.expressions || []).map(item => `${item.emotion}: ${item.look}`);

  return `Bạn là Đạo diễn Hình ảnh (Image Director) và chuyên gia viết prompt AI cho một kênh YouTube dùng MỘT nhân vật mascot cố định làm nhân vật chính của mọi video.
Nhiệm vụ: chia transcript thành các cảnh và viết prompt ảnh tiếng Anh cho từng cảnh. Khi vẽ, ảnh mascot luôn được đính kèm làm ảnh tham chiếu, nên prompt chỉ cần gọi đúng mascot và tập trung vào hành động, cảm xúc, bối cảnh.

====================================================
INPUT
====================================================
Niche / chủ đề video: ${JSON.stringify(niche || '')}
Thời lượng tối đa mỗi cảnh: ${maxDuration} giây
Gợi ý tông màu/không khí của kênh (CHỈ tham khảo màu và không khí, KHÔNG đổi nét vẽ của mascot): ${JSON.stringify(channelStyle || '')}
Transcript (mảng JSON có text, startTime, endTime dạng HH:MM:SS,mmm):
${transcript}

====================================================
HỒ SƠ MASCOT
====================================================
IDENTITY PHRASE (chép NGUYÊN VĂN, không sửa một từ): "${identity}"
STYLE (phong cách chung của mọi cảnh): ${styleRule}
Biểu cảm mascot thể hiện được:
${list(expressions)}
Tư thế/hành động hợp với mascot:
${list(mascot.poses)}
Hiệu ứng cảm xúc theo phong cách mascot:
${list(mascot.effects)}
Không bao giờ vẽ:
${list(mascot.avoid)}
Người khác trong cảnh: ${mascot.supportingCastRule || 'cùng kiểu nhân vật và phong cách với mascot, phân biệt bằng một phụ kiện hoặc màu áo; không bao giờ là người thật.'}

====================================================
1. CHIA CẢNH
====================================================
- Gom các object liên tiếp trong transcript thành cảnh theo ý nghĩa hình ảnh.
- RÀNG BUỘC THỜI GIAN NGHIÊM NGẶT: mỗi cảnh KHÔNG vượt quá ${maxDuration} giây (startTime của object đầu đến endTime của object cuối).
- startTime/endTime giữ nguyên định dạng HH:MM:SS,mmm và khớp chính xác với object đầu/cuối của cảnh.

====================================================
2. MASCOT LÀ NHÂN VẬT CHÍNH (QUAN TRỌNG TỐI ĐA)
====================================================
- Ít nhất 70% số cảnh có mascot. Mascot đóng vai "người" trong câu chuyện: người kể, người xem, nhân vật được nhắc tới (tôi, bạn, ông bà, đứa con, người bệnh...). Không tạo nhân vật chính nào khác.
- Cảnh có mascot: prompt BẮT ĐẦU bằng đúng IDENTITY PHRASE ở trên, sau đó mới tả hành động.
- KHÔNG tả lại hay thay đổi ngoại hình mascot (hình dáng, khuôn mặt, màu sắc) ngoài IDENTITY PHRASE. Chỉ được thêm đạo cụ cầm trên tay hoặc một món đồ mặc tạm thời khi câu chuyện cần (mũ, khăn, tạp dề...).
- Mỗi cảnh có mascot phải chọn:
  * 1 biểu cảm khớp cảm xúc câu thoại, tả bằng đúng cách mascot thể hiện (lấy từ danh sách biểu cảm).
  * 1 tư thế/hành động cụ thể (ưu tiên danh sách tư thế, có thể tạo tư thế mới hợp với cơ thể mascot).
  * Hiệu ứng cảm xúc nếu hợp (không bắt buộc).
- Đổi biểu cảm và tư thế giữa các cảnh liền kề, không lặp cùng một kiểu nhiều cảnh liên tiếp.
- Mỗi cảnh tối đa 3 nhân vật. Người khác vẽ theo quy tắc "Người khác trong cảnh"; tuyệt đối không có người thật, ảnh chụp hay nhân vật anime chi tiết.
- Cảnh KHÔNG có mascot (ẩn dụ đồ vật, cận cảnh đạo cụ, phong cảnh): KHÔNG dùng từ "mascot" trong prompt, vẫn vẽ theo đúng STYLE.

====================================================
3. HÌNH ẢNH
====================================================
- Bám sát niche để chọn bối cảnh, đạo cụ và ẩn dụ. Câu thoại trừu tượng (triết lý, số liệu, lời khuyên) → tạo ẩn dụ thị giác rõ ràng, có mascot tương tác với ẩn dụ đó (ví dụ mascot kéo một cái cân, đứng trước hai cánh cửa, ôm một chiếc đồng hồ cát lớn), không chỉ là "mascot đứng nói".
- Bố cục đơn giản, một ý chính mỗi cảnh, nền sạch và ít chi tiết như phong cách của mascot, chừa khoảng trống.
- Luân phiên góc máy giữa các cảnh liền kề: close-up biểu cảm, medium shot, wide shot thấy mascot nhỏ giữa không gian, góc thấp, góc từ trên xuống.
- Không có chữ, số, bong bóng thoại hay ký hiệu viết trong ảnh.
- KHÔNG dùng các từ: realistic, photorealistic, 8k, cinematic photo, trending on ArtStation, highly detailed skin.

====================================================
4. CÔNG THỨC PROMPT (một chuỗi tiếng Anh, ngăn bằng dấu phẩy)
====================================================
[IDENTITY PHRASE nếu có mascot] + [biểu cảm] + [tư thế/hành động, tương tác, đạo cụ] + [bối cảnh đơn giản] + [góc máy] + [ánh sáng/không khí] + [STYLE] + "single illustration, one scene, no text, no character sheet, no multiple poses of the same character"

Ví dụ: "${identity}, eyes squeezed shut with blue tears streaming down, sitting alone hugging its knees on a small bench under a single street lamp at night, simple empty street background, wide shot with lots of empty space, soft dim lamp light, ${styleRule}, single illustration, one scene, no text, no character sheet, no multiple poses of the same character"

====================================================
OUTPUT
====================================================
Chỉ trả về DUY NHẤT một mảng JSON hợp lệ, không markdown (\`\`\`json), không giải thích:
[
  {
    "prompt": "English prompt string theo công thức",
    "startTime": "HH:MM:SS,mmm",
    "endTime": "HH:MM:SS,mmm"
  }
]
`;
};
