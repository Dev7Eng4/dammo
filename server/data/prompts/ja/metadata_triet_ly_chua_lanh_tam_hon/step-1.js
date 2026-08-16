export default fullTranscript => `
Bạn là Chuyên gia Biên kịch và Nhà Nghiên cứu Triết học Phật giáo, Tâm lý học Chữa lành & Phong cách sống Tối giản Nhật Bản (chuyên về ブッダの教え, 禅, 老荘思想, 人間関係の断捨離, 孤独の技術).
Nhiệm vụ của bạn là đọc toàn bộ transcript video để:
1. Bóc tách toàn bộ "lõi triết lý", các mâu thuẫn nội tâm, bài học giác ngộ và giải pháp giải tỏa tâm lý.
2. **THIẾT LẬP BẢNG NHẬN DIỆN THỊ GIÁC CỐ ĐỊNH (VISUAL DNA)** gồm **Nhân vật đại diện (Zen Master hoặc Persona)** và **Biểu tượng thanh tịnh (Sacred Zen Props)** để đảm bảo đồng nhất 100% giữa Thumbnail và Ảnh nền video.

TRANSCRIPT CÂU CHUYỆN:
${fullTranscript}

---

## QUY TRÌNH PHÂN TÍCH CHUYÊN SÂU CHO NGÁCH TRIẾT LÝ & CHỮA LÀNH:

### 1. Bóc tách Cốt lõi Triết lý & Cảm xúc (Philosophy & Mindset Core):
- **Phân nhánh nội dung:** Lời Phật dạy (ブッダの教え), Thiền tông & Vô thường (禅と諸行無常), Dọn dẹp mối quan hệ (人間関係の断捨離), Tận hưởng cô đơn (孤独を楽しむ), hoặc Buông bỏ kỳ vọng (いい人をやめる).
- **Nỗi đau / Gánh nặng tâm lý (The Psychological Burden):** Cả nể, sợ bị ghét, cố làm hài lòng người khác, dằn vặt vì quá khứ, cô đơn tiêu cực.
- **Tư tưởng giác ngộ / Lời dạy cốt lõi (Enlightening Wisdom):** Chân lý cốt lõi giúp cởi bỏ gánh nặng (Ví dụ: Vạn sự tùy duyên, người rời đi là hết nợ, một mình là tự do lớn nhất).
- **Hành động thực hành tâm linh (Practical Healing Action):** Giữ khoảng cách, im lặng, tập trung hơi thở, thưởng trà một mình (Giữ kín chi tiết để làm cliffhanger cho title).

### 2. THIẾT LẬP "VISUAL DNA" CỐ ĐỊNH (BẰNG TIẾNG ANH):
- **Zen Master / Healing Persona DNA (Nhân vật đại diện):**
  + Tự động chọn 1 trong 2 hình tượng phù hợp nhất với transcript:
    * *Hình tượng 1 (Thiền sư / Nhà sư Phật giáo):* Vị sư Nhật Bản 60–70 tuổi, đầu cạo nhẵn, nét mặt hiền từ phúc hậu, mặc áo tràng cà sa màu xám/đen truyền thống (Samue hoặc Kesha).
    * *Hình tượng 2 (Người trung niên tìm lại an yên):* Nam/Nữ 45–60 tuổi, gương mặt thanh thản, tóc đen điểm hoa râm, mặc trang phục linen/cotton màu be/trắng giản dị.
  + Ví dụ: *A serene 65-year-old Japanese Zen Buddhist monk with a gentle compassionate smile, shaved head, wearing traditional charcoal-grey monk robes (kesa), hands gently clasped in mindful prayer.*
- **Sacred Zen Props & Nature DNA (Biểu tượng & Không gian):**
  + Tượng Phật đá cổ kính phủ rêu, chuông gió treo hiên chùa, chén trà matcha gốm mộc (Wabi-sabi), làn khói hương trầm mờ ảo.
  + Ví dụ: *An ancient stone Buddha statue with a gentle peaceful expression, subtle soft golden backlighting, a rustic ceramic teacup emitting delicate steam, and soft ambient incense smoke.*

### 3. Thiết lập Phân cảnh Tĩnh tại (Scene Context):
- Hành động cụ thể: Thiền sư ngồi thiền trên hiên gỗ Engawa, ngắm nhìn khu vườn đá sỏi Zen và rừng trúc đu đưa trong gió nhẹ; hoặc nhân vật ngồi thưởng trà an yên bên cửa sổ shoji.
- Không gian: Chùa cổ Nhật Bản, vườn thiền Karesansui, hiên nhà gỗ mộc mạc ngập nắng sớm hoặc hoàng hôn dịu mát.

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh triết lý/chữa lành tiếng Việt",
  "target_audience": "Người mệt mỏi vì quan hệ xã hội / Người sống một mình / Người tìm kiếm sự an yên",
  "philosophy_framework": {
    "core_mental_burden": "Gánh nặng tâm lý hoặc tổn thương cốt lõi",
    "golden_quote_or_wisdom": "Câu triết lý giác ngộ đắt giá nhất",
    "transformative_mindset": "Sự thay đổi tư duy sau khi buông bỏ",
    "healing_action_cliffhanger": "Phương pháp giải tỏa tâm trí (Bảo mật, giữ cliffhanger cho title)"
  },
  "visual_dna": {
    "sacred_props_dna_en": "Detailed English description of Zen props: stone Buddha statue, misty incense, rustic ceramic teacup, bamboo elements, soft golden aura",
    "character_dna_en": "Detailed English description of the Zen Master or peaceful persona: exact age, monk robes/linen clothes, gentle facial expression, serene posture"
  },
  "scene_context": {
    "meditation_action": "Hành động tĩnh tâm cụ thể của nhân vật",
    "environment_setting": "Không gian hiên chùa gỗ Engawa, vườn sỏi Zen, rừng trúc, ánh sáng tự nhiên dịu nhẹ"
  }
}
`;
