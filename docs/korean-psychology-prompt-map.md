# Bản đồ prompt và style cho 6 ngách tâm lý Hàn Quốc

Tài liệu này cho biết **ngách nào dùng prompt metadata nào, prompt scene image nào và visual style nào**.
Tất cả đã được thêm vào dữ liệu của app (`server/data`), chọn trong giao diện theo tên bên dưới.

## 1. Tổng quan

| # | Ngách (tên trong app) | Metadata (ko, 2 bước) | Scene image (all, 1 bước) | Visual style |
|---|---|---|---|---|
| 1 | Tâm lý quan hệ & cắt giảm người độc hại (인간관계 정리 · 50대 60대) | `metadata_kr_rel` | `kr_rel_scenes` | Warm Webtoon Healing KR |
| 2 | Tâm lý cô đơn tuổi già & sống một mình (노후 외로움 · 1인 가구) | `metadata_kr_lonely` | `kr_lonely_scenes` | Quiet Cinematic Realism KR |
| 3 | Tâm lý gia đình: cha mẹ – con cái – mẹ chồng nàng dâu (가족 관계 · 자식 · 고부) | `metadata_kr_family` | `kr_family_scenes` | Warm Webtoon Healing KR |
| 4 | Tâm lý sức khỏe tinh thần: giấc ngủ, lo âu, kiệt sức (마음 건강 · 불면 · 불안) | `metadata_kr_mind` | `kr_mind_scenes` | Pastel Minimal Flat KR |
| 5 | Tâm lý lời nói & thói quen cảm xúc (말투 · 감정 습관 · 품격 있는 말) | `metadata_kr_speech` | `kr_speech_scenes` | Conversational Cartoon KR |
| 6 | Triết lý nửa sau cuộc đời: buông bỏ & bình yên (인생 후반 철학 · 비움 · 내려놓기) | `metadata_kr_wisdom` | `kr_wisdom_scenes` | Ink Wash Reflection KR |

Cách chọn khi tạo kênh:
- **Ngôn ngữ kênh:** Tiếng Hàn (`ko`). Prompt metadata chỉ khớp với ngôn ngữ này.
- **Ngách:** chọn đúng tên ở cột 2. App tự chọn prompt metadata và prompt scene theo ngách.
- **Visual style:** chọn đúng tên ở cột 5. Style là phần "STYLE BLOCK" được chép vào cuối mỗi prompt ảnh và vào thumbnail.
- **Chế độ ảnh:** dùng luồng 1 bước (không bật ảnh tham chiếu). Chi tiết ở mục 3.

ID kỹ thuật (để tra cứu hoặc gọi API):

| Ngách | Niche key | Visual style ID |
|---|---|---|
| Quan hệ | `1de14c5e-61d7-4782-bcb6-41ae38b04dc2` | `de6d6299-403d-48e1-8605-1791776da8f9` |
| Cô đơn | `20013055-0b1d-44f6-825b-107df365bfe9` | `679aa180-b24f-4177-bc92-745fb689dd6e` |
| Gia đình | `cebaf838-3093-49f3-adae-ecac2a77b2db` | `de6d6299-403d-48e1-8605-1791776da8f9` |
| Tinh thần | `c59a24c4-2076-40f9-b621-67e65e6455bf` | `e36ea674-43bb-4ebb-a891-26b4e3611f71` |
| Lời nói | `18f1bb67-139f-4934-b060-a6ef6ab9ab17` | `af8ba003-2290-4cfd-89dd-75cfc01ea1c7` |
| Triết lý | `a6d5a8a1-70ca-4adc-916b-44a35efc3b13` | `920e0408-4c41-4d11-973f-720bb9537b31` |

File prompt nằm ở `server/data/prompts/ko/<metadata_key>/step-1.js, step-2.js` và `server/data/prompts/all/<scene_key>/step-1.js`.

## 2. Luồng metadata (2 bước)

**Bước 1 – trích khung nội dung** (đầu vào: toàn bộ transcript tiếng Hàn). Trả về JSON:
`sub_topic`, `person_type`, `pain_point`, `video_format`, `list_count`, `core_insight`,
`thumbnail_hook` (≤ 12 ký tự Hangul), `thumbnail_detail` (≤ 14 ký tự), `prop_for_thumbnail`,
`setting_for_thumbnail`, `figure_gender`, `figure_age`.

**Bước 2 – viết metadata và thumbnail** (đầu vào: title cũ, JSON bước 1, visual style). Trả về JSON:
`metadata.title / description / tags`, `alternative_titles` (2 phương án A/B), `thumbnail.prompt`,
`thumbnail.telop_korean`, `thumbnail.ab_test_variants`.

Quy tắc chung của mọi prompt metadata:
- Title 25–45 ký tự, từ khóa chính trong 20 ký tự đầu, đuôi câu lịch sự (해요체/합쇼체), không giật gân sai sự thật.
- Description 3–5 câu, kết thúc bằng disclaimer tiếng Hàn.
- Thumbnail là một cảnh toàn khung 16:9, 2 dòng chữ (trắng và vàng #FFE600, viền đen), chừa góc dưới bên phải.
- Chữ trong thumbnail được ghi nguyên văn trong prompt để model ảnh vẽ. Hangul có thể vẽ sai ở một số lần, nên kiểm tra thumbnail trước khi đăng.

Công thức title theo ngách:

| Ngách | Các định dạng video (`video_format`) |
|---|---|
| Quan hệ | `avoid_list` (나이 들수록 멀리해야 할 사람 N가지), `trait_list`, `advice`, `question` |
| Cô đơn | `habit_list`, `comfort`, `question`, `letter` |
| Gia đình | `expectation`, `dont_say`, `story_insight`, `question` |
| Tinh thần | `habit_tips`, `explain`, `routine`, `comfort` |
| Lời nói | `avoid_phrases`, `trait_list`, `good_vs_bad`, `question` |
| Triết lý | `wisdom_list`, `quote_story`, `advice`, `question` |

## 3. Luồng scene image (1 bước)

Đầu vào: transcript dạng mảng JSON (`text`, `startTime`, `endTime`), visual style, tên ngách, thời lượng tối đa một cảnh.
Đầu ra: mảng `[{ prompt, startTime, endTime }]`.

Luồng hoạt động:
1. Chốt **một nhân vật chính** cho cả video (tuổi, tóc, màu trang phục mặc định theo ngách) và chép nguyên văn ở đầu mọi cảnh có nhân vật.
2. Gom các câu thoại liền nhau thành cảnh, mỗi cảnh không vượt quá thời lượng tối đa.
3. Viết prompt tiếng Anh theo thứ tự: **nhân vật** → **cảnh** (bối cảnh Hàn, hành động, biểu cảm, đạo cụ, góc máy, ánh sáng) → **style** (chép nguyên văn từ visual style đã chọn).
4. Luôn chừa 1/3 dưới khung hình cho phụ đề; luân phiên bối cảnh và góc máy.
5. Không có chữ, số, logo, người nổi tiếng, cảnh y tế hay bạo lực trong ảnh.

Hạn chế: luồng 1 bước giữ nhân vật nhất quán chỉ bằng mô tả chữ, nên khuôn mặt có thể thay đổi nhẹ giữa các cảnh. Nếu cần nhất quán mạnh hơn, hãy dùng luồng tham chiếu (2 bước, bật ảnh tham chiếu) kèm mascot trong thư viện Assets. Hiện chưa có luồng 2 bước riêng cho 6 ngách này.

## 4. Mô tả từng ngách

### 1. Quan hệ (Warm Webtoon Healing KR)
- **Khán giả:** 50–69 tuổi, muốn gọn lại các mối quan hệ.
- **Chủ đề con:** người nên giữ khoảng cách, bạn bè/hội nhóm, ranh giới, buông bỏ.
- **Style:** webtoon Hàn ấm, tông kem và xanh sage, hợp cảnh nội thất chung cư và quán cà phê.
- **Nhân vật mặc định:** phụ nữ Hàn cuối 50 tuổi, tóc ngắn gợn sóng, áo len kem.
- **Lưu ý:** chỉ mô tả hành vi, không gán nhãn bệnh lý cho người khác.

### 2. Cô đơn tuổi già (Quiet Cinematic Realism KR)
- **Khán giả:** 55–75 tuổi, sống một mình hoặc sắp nghỉ hưu.
- **Chủ đề con:** sống một mình, cảm giác cô đơn, thói quen hằng ngày, kết nối xã hội.
- **Style:** ảnh điện ảnh tả thực, tông teal và hổ phách, nhiều khoảng trống.
- **Nhân vật mặc định:** đàn ông Hàn giữa 60 tuổi, tóc ngắn bạc, áo len xám.
- **Lưu ý:** description có số đường dây hỗ trợ. Luôn kết thúc theo hướng nhẹ nhàng, không bi kịch hóa.

### 3. Gia đình (Warm Webtoon Healing KR)
- **Khán giả:** 50–69 tuổi, cha mẹ của con đã lớn hoặc đang chăm cha mẹ già.
- **Chủ đề con:** con cái trưởng thành, cha mẹ già, mẹ chồng nàng dâu, vợ chồng.
- **Style:** như ngách 1 (cùng phong cách webtoon ấm).
- **Nhân vật mặc định:** phụ nữ Hàn cuối 50 tuổi, như ngách 1.
- **Lưu ý:** không đứng về một phía, không chỉ trích thành viên cụ thể.

### 4. Sức khỏe tinh thần (Pastel Minimal Flat KR)
- **Khán giả:** 40–69 tuổi, hay mất ngủ hoặc lo nghĩ nhiều.
- **Chủ đề con:** giấc ngủ, lo nghĩ quá mức, kiệt sức, điều hòa cảm xúc.
- **Style:** minh họa phẳng pastel xanh, tím oải hương, vàng nhạt; dịu, không gây căng thẳng.
- **Nhân vật mặc định:** phụ nữ Hàn đầu 60 tuổi, tóc ngắn xám nâu, áo ngủ tím nhạt.
- **Lưu ý (quan trọng nhất):** không chẩn đoán, không nhắc thuốc, không hứa chữa khỏi. Đây là ngách rủi ro cao nhất về chính sách và pháp lý.

### 5. Lời nói và thói quen cảm xúc (Conversational Cartoon KR)
- **Khán giả:** 45–69 tuổi, muốn giao tiếp tử tế hơn.
- **Chủ đề con:** thói quen nói chuyện, kiềm chế giận, lắng nghe, lời hối tiếc.
- **Style:** hoạt hình 2D thân thiện, nét đậm, dễ đọc khi nhỏ, hợp chủ đề "nên và không nên".
- **Nhân vật mặc định:** đàn ông Hàn cuối 50 tuổi, áo len xanh navy.
- **Lưu ý:** không vẽ bong bóng thoại có chữ; dùng đạo cụ thay thế (đám mây, loa nhỏ, tay đặt lên miệng).

### 6. Triết lý nửa sau cuộc đời (Ink Wash Reflection KR)
- **Khán giả:** 50–75 tuổi, suy ngẫm và tìm bình yên.
- **Chủ đề con:** buông bỏ, chấp nhận tuổi già, trí tuệ triết gia, biết ơn và hối tiếc.
- **Style:** tranh thủy mặc Hàn trên giấy hanji, một dấu triện đỏ, nhiều khoảng trống.
- **Nhân vật mặc định:** đàn ông Hàn cuối 60 tuổi, tóc trắng, áo khoác kiểu hanbok xám.
- **Lưu ý:** chỉ trích dẫn khi có trong transcript; không bịa lời hoặc gán sai nguồn; không tôn giáo hóa.

## 5. Việc cần kiểm tra trước khi dùng thật

1. **Số đường dây hỗ trợ** (1577-0199, đường dây khủng hoảng sức khỏe tâm thần) có trong description của ngách 2 và 4. Tôi nhớ đây là số đúng nhưng chưa tra lại. Hãy xác minh trước khi đăng, và sửa trong `server/data/prompts/ko/metadata_kr_lonely/step-2.js` và `metadata_kr_mind/step-2.js` nếu số đã đổi.
2. **Chạy thử một video mỗi ngách.** Các prompt này mới được kiểm tra về cú pháp và việc app tìm đúng prompt theo ngách, chưa chạy với model thật. Hãy xem title, thumbnail và ảnh cảnh đầu tiên.
3. **Nhờ người bản ngữ đọc title và description** để kiểm tra giọng văn và cách xưng hô.
4. **Style KR chưa có nhân vật cố định.** Nếu muốn một mascot xuyên suốt, hãy dùng luồng tham chiếu như ghi ở mục 3.
5. **Hoàn nguyên:** bản sao lưu `prompts.json`, `niches.json` nằm trong thư mục scratchpad của phiên làm việc này, hoặc dùng `git checkout` để bỏ các thay đổi.
