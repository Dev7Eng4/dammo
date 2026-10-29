export default fullTranscript => `Bạn là Chuyên gia Biên tập nội dung cho kênh YouTube Shorts tiếng Anh ngách "Psychology fables: animal stories about boundaries, toxic people, trust and inner battles" (truyện ngụ ngôn động vật chứa bài học tâm lý, hình minh họa 2D, người que trắng).
Khán giả là người trẻ đến trung niên nói tiếng Anh (Mỹ, Anh, Canada, Úc, Philippines, Ấn Độ), lướt Shorts, thích bài học sống ngắn gọn, đồng cảm, dễ chia sẻ. Họ hay chia sẻ video có câu chốt "đúng tôi quá" về lòng tốt bị lợi dụng, người độc hại, lời hứa bị phản bội, giá trị bản thân.
Nhiệm vụ: đọc toàn bộ transcript (kịch bản video ngắn 30-75 giây) và trích xuất "khung nội dung" để giai đoạn sau tạo Title, Description và Thumbnail tiếng Anh tối ưu cho Shorts.

TRANSCRIPT:
${fullTranscript}

---

## QUY TRÌNH PHÂN TÍCH

### 1. Chủ đề tâm lý (sub_topic), chọn đúng 1:
- "boundaries_kindness": lòng tốt bị lợi dụng, học cách đặt ranh giới.
- "toxic_people": nhận ra người độc hại, kẻ thao túng, bạn giả tạo.
- "trust_betrayal": lời hứa, niềm tin, bản chất con người khó đổi.
- "self_worth": giá trị bản thân, bị đánh giá thấp, ngừng chứng minh với người khác.
- "effort_patience": kiên trì, làm việc âm thầm, thành quả đến muộn.
- "overthinking_anxiety": suy nghĩ quá nhiều, lo âu, chiến trận nội tâm.
- "letting_go": buông bỏ, mất mát, chấp nhận thay đổi.
- "wisdom_consequence": hệ quả của lựa chọn, tham lam, kiêu ngạo, khôn ngoan sống.

### 2. Kiểu chuyện (story_archetype), chọn đúng 1:
- "predator_and_prey": kẻ mạnh gian xảo và kẻ hiền lành.
- "false_friend": kẻ giả làm bạn để lợi dụng.
- "helper_ungrateful": người giúp đỡ bị phụ bạc.
- "underdog_wins": kẻ yếu thắng bằng trí khôn hoặc kiên nhẫn.
- "hidden_strength": sức mạnh bị đánh giá thấp được lộ ra.
- "consequence_twist": lựa chọn tưởng nhỏ gây hệ quả lớn, cú lật cuối.
- "human_lesson": cảnh đời thường với người que, không có động vật chính.

### 3. Nhân vật chính (characters)
- main_animals: tối đa 2 loài động vật chính bằng tiếng Anh, kèm một đặc điểm nhận dạng ngắn. Ví dụ: "a green snake", "a white dove". Rỗng nếu không có động vật.
- has_stick_figure: true nếu transcript có người (nông dân, người đi đường, bác sĩ...) cần nhân vật người que; ngược lại false.

### 4. Câu chốt (moral_line)
Một câu tiếng Anh ngắn (tối đa 70 ký tự) nêu bài học của chuyện, dạng châm ngôn dễ trích dẫn. Ví dụ: "Kindness is not a shelter for the toxic." Chỉ dựa vào nội dung transcript, không thêm ý mới.

### 5. Hook mở đầu (hook_line)
Câu tiếng Anh ngắn (tối đa 60 ký tự) gợi tò mò, lấy từ câu mở đầu hoặc tình huống chính của transcript (không lộ cú lật). Ví dụ: "A snake begged a dove for help." Rỗng nếu không có điểm rõ ràng.

### 6. Tông hình ảnh (visual_tone), chọn đúng 1:
- "warm": chuyện nhẹ nhàng, thức tỉnh, kết thúc hy vọng (ánh nắng ấm, màu đất).
- "dark": chuyện về người độc hại, phản bội, nỗi sợ, căng thẳng (nền tối, ánh sáng đỏ cam).

### 7. Thumbnail
- thumbnail_hook: dòng chữ 1 bằng tiếng Anh, tối đa 22 ký tự, 2 đến 4 từ, gợi tò mò hoặc cảm xúc mạnh. Ví dụ: "Don't trust it" / "Kind but used" / "He lied again"
- thumbnail_detail: dòng chữ 2 tiếng Anh, tối đa 24 ký tự, cụ thể hơn. Ví dụ: "A snake's promise" / "The dove's mistake"
- prop_for_thumbnail: một đạo cụ hoặc vật nổi bật tiếng Anh, vẽ đơn giản, nhận ra ngay. Ví dụ: a coiled snake on a cliff edge, a caged bird, a crown in a mirror
- setting_for_thumbnail: bối cảnh tiếng Anh phù hợp. Ví dụ: rocky canyon at sunset, dark farm at night with a red light, dry riverbank

### 8. Quy tắc an toàn nội dung
- Đây là truyện ngụ ngôn mang tính giáo dục và giải trí, không phải liệu pháp. Không chẩn đoán, không đưa lời khuyên y tế, tâm thần, pháp lý hay tài chính, không hứa kết quả.
- Không gán nhãn bệnh lý (narcissist, depression, trauma...) cho người thật hoặc nhóm người cụ thể.
- Chỉ dùng chi tiết CÓ TRONG transcript; không bịa số liệu, nghiên cứu hay trích dẫn nhà tâm lý học.
- Nếu transcript có chủ đề tự hại, không mô tả phương pháp.

---

## OUTPUT FORMAT:
Chỉ xuất JSON hợp lệ duy nhất, không dùng Markdown, không giải thích:

{
  "detected_sub_niche": "Tên phân nhánh bằng tiếng Việt",
  "sub_topic": "boundaries_kindness | toxic_people | trust_betrayal | self_worth | effort_patience | overthinking_anxiety | letting_go | wisdom_consequence",
  "story_archetype": "predator_and_prey | false_friend | helper_ungrateful | underdog_wins | hidden_strength | consequence_twist | human_lesson",
  "main_animals": ["a green snake", "a white dove"],
  "has_stick_figure": false,
  "moral_line": "Câu chốt tiếng Anh, tối đa 70 ký tự",
  "hook_line": "Hook tiếng Anh, tối đa 60 ký tự, hoặc chuỗi rỗng",
  "core_insight": "Phát hiện đáng giá nhất của video (tiếng Việt)",
  "visual_tone": "warm | dark",
  "thumbnail_hook": "Dòng 1 thumbnail, tối đa 22 ký tự",
  "thumbnail_detail": "Dòng 2 thumbnail, tối đa 24 ký tự",
  "prop_for_thumbnail": "one simple drawable prop in English",
  "setting_for_thumbnail": "setting in English"
}
`;
