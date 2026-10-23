# Bản đồ prompt và style cho 6 ngách người lớn tuổi Tây Ban Nha

Tài liệu này cho biết **ngách nào dùng prompt metadata nào, prompt scene image nào và visual style nào**, kèm quy tắc riêng từng ngách.
Tất cả đã được thêm vào dữ liệu của app (`server/data`) và chọn trong giao diện theo tên bên dưới.

## 1. Tổng quan

| # | Ngách (tên trong app) | Metadata (es, 2 bước) | Scene image (all, 1 bước) | Visual style | Xưng hô | Mức hợp ảnh AI |
|---|---|---|---|---|---|---|
| 1 | Tâm lý & ý nghĩa sống sau hưu | `metadata_es_psy` | `es_psy_scenes` | Acuarela Cálida ES | tú | Rất cao |
| 2 | Cô đơn không mong muốn & sống một mình | `metadata_es_lonely` | `es_lonely_scenes` | Luz de Atardecer Pictórica ES | tú | Rất cao |
| 3 | Hoài niệm & văn hóa đời thường | `metadata_es_nostalgia` | `es_nostalgia_scenes` | Gouache Retro Nostalgia ES | tú | Cao |
| 4 | Sức khỏe & lão hóa chủ động | `metadata_es_health` | `es_health_scenes` | Bienestar Pastel Plano ES | usted | Trung bình |
| 5 | Công nghệ & chống lừa đảo | `metadata_es_tech` | `es_tech_scenes` | Explicativa Clara ES | tú | Thấp–trung bình |
| 6 | Hưu trí & lương hưu | `metadata_es_pension` | `es_pension_scenes` | Explicativa Clara ES | usted | Thấp |

"Mức hợp ảnh AI" là đánh giá của tôi (xem phân tích trước): ngách 1–3 hợp nhất với ảnh AI, ngách 4 hợp với điều kiện chỉ vẽ thói quen đời thường, ngách 5–6 chỉ dùng ảnh AI làm nền và cần đồ họa hoặc quay màn hình thật cho phần chính.

Cách chọn khi tạo kênh:
- **Ngôn ngữ kênh:** Tiếng Tây Ban Nha (`es`). Prompt metadata chỉ khớp với ngôn ngữ này.
- **Ngách:** chọn đúng tên ở cột 2. App tự chọn prompt metadata và prompt scene theo ngách.
- **Visual style:** chọn đúng tên ở cột 5. Style là phần "STYLE BLOCK" được chép vào cuối mỗi prompt ảnh và vào thumbnail.
- **Chế độ ảnh:** luồng 1 bước (không bật ảnh tham chiếu). Mật độ cảnh: trung bình hoặc thấp (30 hoặc 60 giây mỗi cảnh) cho khán giả lớn tuổi nghe là chính.

Thay thế style khi cần (đều hợp cho mọi ngách trừ khi ghi chú):

| Ngách | Style thay thế | Khi nào |
|---|---|---|
| Tâm lý | Luz de Atardecer Pictórica ES | Nội dung trầm, suy ngẫm |
| Cô đơn | Acuarela Cálida ES | Muốn tông ấm và hy vọng hơn |
| Hoài niệm | Acuarela Cálida ES | Muốn mềm hơn kiểu retro |
| Sức khỏe | Acuarela Cálida ES | Muốn ấm hơn kiểu vector |
| Công nghệ, Hưu trí | Bienestar Pastel Plano ES | Muốn dịu hơn |

## 2. ID kỹ thuật

| Ngách | Niche key | Visual style ID |
|---|---|---|
| Tâm lý | `a2d59421-c301-49b1-acdd-7ed5236ba7e2` | `5f4d4657-a4cf-40ca-9dbb-ed3eed406964` |
| Cô đơn | `e24dbee3-bfa0-46e9-88a9-b3899f0d4a36` | `f61da576-2611-46a6-9ad4-b6663965d9c9` |
| Hoài niệm | `f7bdc38d-cd76-4563-b348-7e3a0377cfa1` | `bbf7b3c2-feaa-4013-acfa-896cef915b29` |
| Sức khỏe | `b0738767-b8a1-44e0-9550-54755bf08caf` | `da3d8ef1-48b7-45c9-a675-5a0f541b2b07` |
| Công nghệ | `2e1715e4-884f-4f21-98ac-f461a0f2779d` | `12de0542-5ef7-4c55-930f-36dd4a9079ca` |
| Hưu trí | `86b7d3fe-8320-4508-954e-74bea3927817` | `12de0542-5ef7-4c55-930f-36dd4a9079ca` |

File prompt: `server/data/prompts/es/<metadata_key>/step-1.js, step-2.js` và `server/data/prompts/all/<scene_key>/step-1.js`.

## 3. Luồng metadata (2 bước)

**Bước 1 – trích khung nội dung** (đầu vào: toàn bộ transcript tiếng Tây Ban Nha). Trả về JSON:
`sub_topic`, `person_type`, `pain_point`, `video_format`, `list_count`, `core_insight`,
`thumbnail_hook` (≤ 24 ký tự), `thumbnail_detail` (≤ 28 ký tự), `prop_for_thumbnail`,
`setting_for_thumbnail`, `figure_gender`, `figure_age` (50s đến 80s).

**Bước 2 – viết metadata và thumbnail** (đầu vào: title cũ, JSON bước 1, visual style). Trả về JSON:
`metadata.title / description / tags`, `alternative_titles` (2 phương án A/B), `thumbnail.prompt`,
`thumbnail.telop_spanish`, `thumbnail.ab_test_variants`.

Quy tắc chung của mọi prompt metadata:
- Title 45–65 ký tự, từ khóa chính trong 40 ký tự đầu, dấu câu đúng (¿ ? ¡ !), không giật gân sai sự thật.
- Description 3–5 câu, kết thúc bằng disclaimer đúng ngách (xem mục 5).
- Thumbnail là một cảnh toàn khung 16:9, 2 dòng chữ (trắng và vàng #FFE600, viền đen), chừa góc dưới bên phải.
- Chữ trong thumbnail được ghi nguyên văn trong prompt, giữ dấu sắc, ñ, ¿ và ¡. Model ảnh có thể vẽ sai chữ ở một số lần, nên kiểm tra thumbnail trước khi đăng.
- Không vẽ giấy tờ, con dấu, logo, trang web chính thức giả, bác sĩ, thuốc hay thiết bị y tế.
- Tags: 8–12 tag tiếng Tây Ban Nha, chữ thường, có dấu đúng.

## 4. Luồng scene image (1 bước)

Đầu vào: transcript dạng mảng JSON (`text`, `startTime`, `endTime`), visual style, tên ngách, thời lượng tối đa một cảnh.
Đầu ra: mảng `[{ prompt, startTime, endTime }]`.

Luồng hoạt động:
1. Chốt **một nhân vật chính** cho cả video (tuổi, tóc, màu trang phục mặc định theo ngách) và chép nguyên văn ở đầu mọi cảnh có nhân vật.
2. Gom các câu thoại liền nhau thành cảnh, mỗi cảnh không vượt quá thời lượng tối đa.
3. Viết prompt tiếng Anh theo thứ tự: **nhân vật** → **cảnh** (bối cảnh Tây Ban Nha, hành động, biểu cảm, đạo cụ, góc máy, ánh sáng) → **style** (chép nguyên văn từ visual style đã chọn).
4. Luôn chừa 1/3 dưới khung hình cho phụ đề; luân phiên bối cảnh và góc máy.
5. Không có chữ, số, logo, người nổi tiếng, giấy tờ, tiền có số, cảnh y tế hay bạo lực trong ảnh. Không dùng khuôn mẫu cũ (váy flamenco, đấu bò, sombrero, siesta) và không đưa lập trường chính trị.

Với ngách 5 và 6, prompt thêm yêu cầu **chừa khoảng trống rộng ở giữa hoặc một bên khung** để dựng thêm đồ họa, biểu đồ hay ảnh chụp màn hình thật, và mọi màn hình, giấy tờ chỉ là hình khối trơn.

Hạn chế: luồng 1 bước giữ nhân vật nhất quán chỉ bằng mô tả chữ, nên khuôn mặt có thể thay đổi nhẹ giữa các cảnh. Nếu cần nhất quán mạnh hơn, hãy dùng luồng tham chiếu (2 bước, bật ảnh tham chiếu) kèm mascot trong thư viện Assets. Hiện chưa có luồng 2 bước riêng cho 6 ngách này.

## 5. Mô tả chi tiết từng ngách

### 1. Tâm lý & ý nghĩa sống sau hưu (Acuarela Cálida ES)
- **Khán giả:** 55–75 tuổi, mới hoặc sắp nghỉ hưu.
- **Chủ đề con:** ý nghĩa sau hưu, con cháu và ranh giới, cảm giác bị xem nhẹ vì tuổi, mất mát và thay đổi.
- **Định dạng video:** `habit_list`, `question`, `advice`, `story_insight`.
- **Xưng hô:** tú, cercano y respetuoso.
- **Nhân vật mặc định:** phụ nữ Tây Ban Nha giữa 60 tuổi, tóc bạc ngắn, áo len màu đất nung.
- **Disclaimer:** thông tin chung, không thay thế chuyên gia sức khỏe tâm thần, kèm 024 và 112.
- **Lưu ý:** không gán nhãn bệnh lý, không mô tả tự hại.

### 2. Cô đơn không mong muốn & sống một mình (Luz de Atardecer Pictórica ES)
- **Khán giả:** 60–85 tuổi, sống một mình hoặc xa gia đình.
- **Chủ đề con:** sống một mình, cảm giác cô đơn, kết nối, buổi tối và dịp lễ.
- **Định dạng video:** `habit_list`, `comfort`, `question`, `letter`.
- **Xưng hô:** tú.
- **Nhân vật mặc định:** đàn ông Tây Ban Nha đầu 70 tuổi, tóc trắng thưa, kính tròn, áo len xám.
- **Disclaimer:** như ngách 1.
- **Lưu ý:** không câu chữ làm nặng nỗi đau, mỗi cảnh luôn có một điểm sáng ấm, không hứa "hết cô đơn".

### 3. Hoài niệm & văn hóa đời thường (Gouache Retro Nostalgia ES)
- **Khán giả:** 55–85 tuổi, thích nhớ lại thập niên 60–80.
- **Chủ đề con:** đời sống thường ngày, radio và TV, tuổi thơ ở làng, món ăn và lễ hội.
- **Định dạng video:** `remember_list`, `story_memory`, `then_vs_now`, `question`.
- **Xưng hô:** tú.
- **Nhân vật mặc định:** phụ nữ Tây Ban Nha cuối 60 tuổi, tóc xám xoăn ngắn, áo hoa.
- **Disclaimer:** ghi rõ hình ảnh là minh họa.
- **Lưu ý:** không đưa lập trường chính trị về các giai đoạn lịch sử nhạy cảm, không chép lời bài hát, không dùng người thật hay sự kiện không có trong transcript.

### 4. Sức khỏe & lão hóa chủ động (Bienestar Pastel Plano ES)
- **Khán giả:** 60–80 tuổi, muốn giữ sức khỏe bằng thói quen.
- **Chủ đề con:** giấc ngủ, ăn uống đơn giản kiểu Địa Trung Hải, vận động nhẹ, giữ đầu óc minh mẫn.
- **Định dạng video:** `habit_list`, `explain`, `routine`, `myth_vs_fact`.
- **Xưng hô:** usted.
- **Nhân vật mặc định:** đàn ông Tây Ban Nha giữa 60 tuổi, tóc xám ngắn, áo polo xanh nhạt.
- **Disclaimer:** không thay thế lời khuyên chuyên gia y tế, nhắc hỏi bác sĩ.
- **Lưu ý (rủi ro cao):** không chẩn đoán, không thuốc, thực phẩm chức năng hay "cura/milagro", không số liệu nghiên cứu ngoài transcript; ảnh chỉ vẽ động tác đời thường, không giải phẫu hay thiết bị y tế.

### 5. Công nghệ & chống lừa đảo (Explicativa Clara ES)
- **Khán giả:** 60–80 tuổi, dùng điện thoại, WhatsApp, ngân hàng điện tử.
- **Chủ đề con:** lừa đảo, WhatsApp và điện thoại, an toàn ngân hàng điện tử, gọi video với gia đình.
- **Định dạng video:** `warning_signs`, `how_to`, `case_story`, `question`.
- **Xưng hô:** tú.
- **Nhân vật mặc định:** phụ nữ Tây Ban Nha cuối 60 tuổi, tóc xám xoăn ngắn, áo len xanh teal, kính đeo dây.
- **Disclaimer:** lời khuyên chung, liên hệ ngân hàng qua kênh chính thức, báo Policía Nacional hoặc Guardia Civil.
- **Lưu ý:** không tự thêm bước thao tác hay tên ứng dụng ngoài transcript; ảnh AI không vẽ giao diện hay tin nhắn thật (hình khối trơn), phần hướng dẫn nên quay màn hình thật.

### 6. Hưu trí & lương hưu (Explicativa Clara ES)
- **Khán giả:** 55–75 tuổi, sắp hoặc vừa nghỉ hưu.
- **Chủ đề con:** khái niệm cơ bản, thay đổi quy định, thủ tục, lập ngân sách.
- **Định dạng video:** `explainer_list`, `news_update`, `myth_vs_fact`, `question`.
- **Xưng hô:** usted. **Phạm vi:** chỉ áp dụng cho Tây Ban Nha.
- **Nhân vật mặc định:** đàn ông Tây Ban Nha đầu 60 tuổi, tóc hoa râm ngắn, áo len xanh navy.
- **Disclaimer:** không phải tư vấn pháp lý hay tài chính, thông tin có thể thay đổi, trỏ tới seg-social.es, dữ liệu đúng tại ngày đăng.
- **Lưu ý (rủi ro cao nhất):** prompt cấm tự thêm mức lương, tuổi, thời hạn, điều kiện không có trong transcript. Nội dung ngách này hay bị lan truyền thông tin sai, nên mỗi con số cần trích nguồn chính thức. Phần chính của video nên là đồ họa chữ và biểu đồ, ảnh AI chỉ làm nền.

## 6. Việc cần kiểm tra trước khi dùng thật

1. **Số điện thoại 024** (đường dây hỗ trợ hành vi tự sát của Bộ Y tế) trong disclaimer ngách 1 và 2: tôi nhớ đây là số đúng nhưng chưa tra lại. Hãy xác minh trước khi đăng, và sửa trong `server/data/prompts/es/metadata_es_psy/step-2.js` và `metadata_es_lonely/step-2.js` nếu đã đổi.
2. **Trang seg-social.es** trong disclaimer ngách 6: hãy kiểm tra tên miền chính thức trước khi dùng.
3. **Chọn tú hay usted:** tôi đặt tú cho ngách 1, 2, 3, 5 và usted cho ngách 4, 6 theo mức độ trang trọng của nội dung. Đây là quyết định của tôi, chưa có bằng chứng nào cho thấy cách nào hiệu quả hơn với khán giả Tây Ban Nha. Hãy nhờ người bản ngữ xác nhận, và giữ nhất quán trong từng kênh.
4. **Chạy thử một video mỗi ngách.** Các prompt mới chỉ được kiểm tra về cú pháp và việc app tìm đúng prompt theo ngách, chưa chạy với model thật. Hãy xem title, thumbnail và ảnh cảnh đầu tiên.
5. **Thumbnail:** model ảnh có thể vẽ sai dấu hoặc chữ tiếng Tây Ban Nha (ñ, á, ¿). Nếu hay sai, hãy chèn chữ bằng phần mềm thay vì để model vẽ.
6. **Chính sách YouTube:** mỗi video cần kịch bản và nội dung riêng, tránh dùng chung một khuôn và một lời dẫn cho nhiều video (xem phân tích về nội dung lặp lại).
7. **Hoàn nguyên:** bản sao lưu `prompts.json`, `niches.json`, `visual-styles.json` (bản `*.backup2.json`) nằm trong thư mục scratchpad của phiên này, hoặc dùng `git checkout` để bỏ các thay đổi chưa commit.
