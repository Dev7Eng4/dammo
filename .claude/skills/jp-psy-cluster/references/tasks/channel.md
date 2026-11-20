# {K} channel — 3 bộ thông tin kênh

Mục tiêu: 3 kênh YouTube tiếng Nhật cho cùng cụm, mỗi kênh đủ để tạo ngay: tên kênh, handle, mô tả, tags, prompt avatar, prompt banner. Ba kênh cùng cụm nhưng **mỗi kênh một góc riêng** (một ngách nhỏ hoặc một giọng văn khác), để chúng không tranh khán giả của nhau và YouTube hiểu mỗi kênh dành cho ai.

## Chọn góc cho 3 kênh
Dựa vào "Ngách nhỏ" và "Trọng tâm" của file cụm. Ví dụ K1: một kênh nghiêng về thói quen hằng ngày, một kênh về phẩm cách và cách nói, một kênh về hạnh phúc và buông bỏ. Mỗi kênh vẫn giữ cụm chính ~80% và cụm giáp ranh ~20%. Kênh i dùng mascot thiết kế thứ i (của lệnh `{K} mascot` gần nhất trong cuộc trò chuyện nếu có, nếu không thì 3 thiết kế trong file cụm).

## Từng mục
1. **Tên kênh (チャンネル名)**: tiếng Nhật, 6–14 ký tự, dễ nhớ, đọc lên là biết chủ đề; nên chứa một từ ngách (心理学 / 脳科学 / 心 / 人生 ...) cộng một từ thương hiệu riêng. Không trùng hoặc na ná tên trong `references/common.md`.
2. **Handle (tên người dùng)**: `@` + chữ Latin thường, số, `.`, `_`, `-`; 3–30 ký tự; thường là romaji của tên kênh hoặc ý nghĩa của nó (ví dụ `@nagi.shinri`). Thêm 1 phương án dự phòng vì handle có thể đã bị lấy.
3. **Mô tả kênh (概要)**: tiếng Nhật, 400–800 ký tự, giọng です・ます:
   - 2 câu đầu (hiện trong kết quả tìm kiếm): kênh giúp ai, về điều gì, chứa từ khoá chính.
   - Kênh dành cho ai (khán giả của cụm, nói bằng tình huống đời thường).
   - Các chủ đề sẽ có (liệt kê 4–6 ngách nhỏ bằng lời thường).
   - Lịch đăng (ví dụ 毎日19時), lời mời đăng ký và bình luận.
   - Một dòng lưu ý: nội dung dựa trên kiến thức tâm lý học / khoa học não bộ phổ thông, không thay cho chẩn đoán hay tư vấn chuyên môn (bắt buộc với K2; nên có với mọi cụm).
4. **Tags kênh (キーワード)**: 15–25 từ khoá tiếng Nhật, phân tách bằng dấu phẩy, tổng dưới 500 ký tự: từ khoá ngách rộng (心理学, 脳科学, 人間関係...), từ khoá ngách nhỏ của kênh, từ khoá độ tuổi khán giả (60代, 老後...) khi hợp, và tên kênh.
5. **Prompt avatar** (tiếng Anh, đính kèm ảnh mascot của kênh):
```
Use the attached character sheet as the exact character reference (same face, colors, outfit, signature item, line style).
YouTube channel avatar: head-and-shoulders portrait of this character, centered, facing the viewer with a {EXPRESSION}, head filling about 70% of the frame.
Solid flat background color {AVATAR_BG} with a very subtle lighter circle behind the head.
Square 1:1, everything important inside the central circle, thick clean outlines, high contrast, readable at 48 pixels.
No text, no letters, no logo, no border, no other characters, no scenery.
```
6. **Prompt banner có chữ** (tiếng Anh, đính kèm ảnh mascot; chữ tiếng Nhật nằm trong nháy đơn):
```
Use the attached character sheet as the exact character reference (same face, colors, outfit, signature item, line style).
YouTube channel banner, 16:9 wide, 2560x1440 composition.
Background: {BANNER_SCENE}, in the same flat 2D style as the character sheet.
The character stands to the right of the text in a {BANNER_POSE} pose, at about 35% of the image height.
Text, centered-left, written exactly as given, in Japanese:
 - Line 1 (channel name, large, very bold gothic font, {NAME_COLOR} with thick dark outline): '{チャンネル名}'
 - Line 2 (tagline, about 40% of line 1 size, bold gothic, {ACCENT}): '{キャッチコピー}'
 - Line 3 (small rounded label box): '{更新ラベル}'
Every character spelled exactly as written, no extra words, no English text.
All text and the character must stay inside the central horizontal strip (about 60% width x 30% height in the middle); the top and bottom edges are only soft background.
High contrast, readable on a phone. No logo, no watermark, no other characters.
```
Lấy `{AVATAR_BG}`, `{BANNER_SCENE}`, `{BANNER_POSE}` từ phần "Kênh" của file cụm (có thể chỉnh nhẹ cho từng kênh); `{ACCENT}` lấy màu nhấn trong "Giao diện thumbnail của cụm". Khẩu hiệu tối đa ~16 ký tự, mỗi kênh một câu riêng (câu gợi ý trong file cụm dùng cho tối đa một kênh). Nhãn lịch đăng ví dụ 「毎日19時更新」.

## Định dạng trả lời
Tiêu đề `{K} channel — {tên cụm}`, rồi 3 khối:

### Kênh {số}: {チャンネル名}
- Góc của kênh: 1 câu tiếng Việt.
- Mascot dùng: thiết kế nào.
- Tên kênh / Handle (+ dự phòng)
- Mô tả kênh (code block)
- Tags (code block)
- Prompt avatar (code block)
- Prompt banner (code block)

Cuối cùng nhắc: soát từng chữ Hán trên banner khi phóng to, sai thì tạo lại; avatar không có chữ.
