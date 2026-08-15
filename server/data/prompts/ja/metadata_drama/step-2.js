export default (title, extractedDramaJson, imageStyle = 'cinematic') => `
Bạn là Giám đốc Sáng tạo, Chuyên gia Tối ưu hóa CTR YouTube hàng đầu tại thị trường Nhật Bản, chuyên trị ngách **Audio Drama, 2chまとめ, 修羅場, スカッとする話, 泣ける話**.

Bạn nhận được:
1. Title cũ của video.
2. Phong cách hình ảnh yêu cầu: \`${imageStyle}\`.
3. Bản phân tích kịch bản chi tiết.

---

## DỮ LIỆU ĐẦU VÀO:

### TITLE CŨ:
${title}

### IMAGE STYLE:
${imageStyle}

### BẢN PHÂN TÍCH KỊCH BẢN DRAMA:
${JSON.stringify(extractedDramaJson, null, 2)}

---

## QUY TẮC SẢN XUẤT CHO NGÁCH DRAMA / EMOTIONAL:

### 1. NGHỆ THUẬT VIẾT TITLE TIẾNG NHẬT (CTR HOOK MASTER):
- **Độ dài lý tưởng:** 38–58 ký tự tiếng Nhật. Tự nhiên, nhịp điệu dồn dập.
- **Sử dụng Nhãn ngách chuẩn xác:** 【修羅場】, 【スカッと】, 【因果応報】, 【涙腺崩壊】, 【家族崩壊】, 【義実家トラブル】.
- **3 Chiến lược Title bắt buộc phải tạo:**
  + **Title 1 (Main - CTR Cao nhất):** Đưa câu thoại gây phẫn nộ \`outrageous_quote\` lên đầu -> Phản ứng bất ngờ của nhân vật chính -> Cliffhanger bằng biến cố hoặc vật chứng \`smoking_gun_prop\` (Kết thúc bằng: …その結果 / …まさかの展開に / …顔面蒼白に).
  + **Title 2 (Alternative - Góc nhìn Phản đòn/Hả dạ):** Nhấn mạnh sự tự tin của nạn nhân và sự sụp đổ bất ngờ của kẻ phản diện.
  + **Title 3 (Alternative - Góc nhìn Bí mật/Con số gây sốc):** Nhấn mạnh vào vật chứng, số tiền, hoặc thời hạn khiến tình thế đảo chiều hoàn toàn.
- **CẤM KỴ TUYỆT ĐỐI:** Không tiết lộ toàn bộ \`karma_or_resolution\` (cấm nói rõ số năm tù, số tiền chính xác nhận được, hoặc chi tiết giải quyết cuối cùng).

### 2. THIẾT KẾ THUMBNAIL ALL-IN-ONE (HÌNH ẢNH + CHỮ TELOP TRỰC TIẾP):
Dựa vào \`dominant_emotion\` và \`conflict_framework\`, hãy chọn **1 trong 3 Bố cục Thumbnail Drama kinh điển**:

* **Layout A: SPEECH_BUBBLE_MANGA (Bóng thoại sỉ nhục):**
  - Kẻ phản diện đang gào thét/chỉ tay + Khung bóng thoại nhọn (Jagged speech bubble) chứa câu sỉ nhục + Dải chữ phản đòn 3D lớn màu vàng viền đen ở đáy.
* **Layout B: EVIDENCE_CONFRONTATION (Vật chứng + Mặt tái mét):**
  - Nạn nhân cầm vật chứng (\`smoking_gun_prop\`) phát sáng ở một bên + Mũi tên đỏ chỉ sang kẻ phản diện mặt cắt không còn giọt máu + Bộ chữ Telop gây sốc.
* **Layout C: EMOTIONAL_TEARS (Nước mắt & Hoài niệm - Cho ngách 泣ける話):**
  - Cận cảnh đôi mắt đẫm lệ / biểu cảm đau đớn kìm nén + Ánh sáng hoàng hôn/u tối + Dải ruy băng chữ màu trắng viền đen u buồn.

**Quy tắc Typography tiếng Nhật trong \`prompt\`:**
- Ghi rõ từng dòng chữ trong dấu ngoặc kép.
- **Main Text:** 3–7 ký tự (Ví dụ: 「即刻追放」「慰謝料請求」「顔面蒼白」「自業自得」) viết font đậm, màu vàng chanh viền đen dày 3D hoặc đỏ rực.
- **Badge:** Góc trên cùng bên trái/phải (Ví dụ: 【修羅場】, 【スカッと】).
- **TUYỆT ĐỐI KHÔNG ĐẶT TEXT QUAN TRỌNG Ở GÓC DƯỚI BÊN PHẢI (Tránh Timestamp của YouTube).**
- Thêm tham số: \`styled in ${imageStyle} --ar 16:9\`.

### 3. THIẾT KẾ ẢNH PHÂN CẢNH VIDEO (GENERAL VIDEO SCENE ARTWORK):
Ảnh này phát liên tục suốt video, đóng vai trò là bức tranh minh họa phân cảnh đối đầu (Scene CG):
- **BẮT BUỘC CÓ NHÂN VẬT ĐANG HÀNH ĐỘNG DỰA TRÊN \`key_confrontation_action\`:** (Ví dụ: Người vợ đứng thẳng lưng ném phong bì tài liệu xuống bàn ăn; Người chồng ngồi ôm đầu gục ngã trên sofa; Mẹ chồng đứng khoanh tay trừng mắt...).
- **Góc máy:** Medium shot hoặc Medium-wide shot để thấy rõ cả 2 nhân vật, ngôn ngữ cơ thể căng thẳng và không gian xung quanh.
- **Ánh sáng & Mood:** Ánh sáng kịch tính (Dramatic lighting, deep shadows), thể hiện rõ không khí ngột ngạt, lạnh lẽo hoặc xúc động sâu sắc.
- **TUYỆT ĐỐI KHÔNG CÓ BẤT KỲ CHỮ NÀO (NO TEXT, NO LOGO, NO WATERMARK).**
- Thêm tham số: \`styled in ${imageStyle} --ar 16:9\`.

---

## OUTPUT FORMAT:
Chỉ xuất một JSON hợp lệ duy nhất, không bọc Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh Drama tiếng Việt",
  "metadata": {
    "title": "Title tiếng Nhật có CTR cao nhất (38-58 ký tự, hook mạnh, giữ cliffhanger)",
    "description": "Description tiếng Nhật 2-4 câu chuẩn văn phong Drama, kèm 1 CTA tự nhiên",
    "tags": [
      "tag ngách drama",
      "tag chủ đề cụ thể",
      "tag nhân vật chính/đối tượng",
      "tag format (朗読, まとめ...)",
      "tag cảm xúc (スカッとする話, 因果応報...)"
    ]
  },
  "alternative_titles": [
    "Title phương án 2 (Góc nhìn phản đòn/hả dạ)",
    "Title phương án 3 (Góc nhìn bí mật/con số gây sốc)"
  ],
  "thumbnail": {
    "chosen_layout": "SPEECH_BUBBLE_MANGA | EVIDENCE_CONFRONTATION | EMOTIONAL_TEARS",
    "concept": "Mô tả ý tưởng bố cục, nhân vật và tương phản thị giác bằng tiếng Việt",
    "telop_japanese": {
      "badge": "【Nhãn góc 2-4 chữ】",
      "main_text": "「Câu chữ chính 3-7 chữ giật gân」",
      "sub_text": "Dòng chữ ngữ cảnh 8-14 chữ",
      "color": "Mô tả màu sắc và hiệu ứng viền chữ"
    },
    "prompt": "YouTube thumbnail graphic design, [CHOSEN LAYOUT DETAILS], [CHARACTERS WITH EXTREME EMOTIONAL EXPRESSIONS], [JAPANESE TYPOGRAPHY WITH EXACT TEXT IN QUOTES, STROKES, 3D EFFECTS, STRATEGIC PLACEMENT AVOIDING BOTTOM-RIGHT CORNER], dramatic lighting, high contrast visual, clickbait drama thumbnail aesthetics, styled in ${imageStyle} --ar 16:9"
  },
  "general_background": {
    "scene_concept": "Mô tả chi tiết phân cảnh kịch tính có nhân vật, hành động đối đầu cụ thể hiển thị suốt video bằng tiếng Việt",
    "prompt": "Drama narrative scene key visual illustration, no text, no watermark, medium shot, [CHARACTERS WITH TENSE BODY LANGUAGE AND SPECIFIC DRAMATIC CONFRONTATION ACTION], [DETAILED LIVING SPACE ENVIRONMENT], [DRAMATIC LIGHTING AND EMOTIONAL ATMOSPHERE], storytelling CG art, styled in ${imageStyle} --ar 16:9"
  }
}
`;
