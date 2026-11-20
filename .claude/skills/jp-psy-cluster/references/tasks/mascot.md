# {K} mascot — 3 prompt tạo mascot

Mục tiêu: 3 prompt tiếng Anh, mỗi prompt tạo **một ảnh tham chiếu nhân vật** (reference sheet) trên Google Flow, đúng bố cục mascot đang dùng trong dammo: nền trắng trơn, 4 góc nhìn, 6 đầu biểu cảm, 5 tư thế. Ảnh này được tải lên làm mascot kênh; hệ thống đọc nó để viết hồ sơ mascot và vẽ thumbnail, nên nó phải là ảnh tham chiếu sạch chứ không phải một cảnh minh hoạ.

## Thiết kế 3 nhân vật
Đọc phần "Mascot" trong file cụm, rồi thiết kế 3 nhân vật:
- **Khác 3 thiết kế đã có** trong file cụm (người dùng cần mascot mới cho kênh mới). Chỉ dùng lại khi người dùng nói rõ muốn bản gốc.
- **Khác nhau rõ** về dáng, giới tính / độ tuổi gợi ý và màu chính, để mỗi kênh cùng cụm có một mascot riêng.
- **Màu chính tương phản** với "Giao diện thumbnail của cụm" (nền ấm thì mascot màu lạnh và ngược lại); ghi mã màu kèm tên màu.
- **Đúng 1 món đồ đặc trưng** gắn với chủ đề cụm (ví dụ kính đẩy lên trán cho cụm não tuổi già).
- Người xem là người Nhật lớn tuổi: dấu hiệu tuổi tinh tế (kính, cardigan, tóc bạc), không chế giễu tuổi già.
- Tránh kiểu đã phổ biến trong ngách (đầu tròn màu cam, người que trắng) và mọi nhân vật có bản quyền.
- K11: nhân vật trang nghiêm, tỉ lệ người thật, không dễ thương (xem file k11).

## Mẫu prompt (giữ nguyên thứ tự: loại ảnh trước, nhân vật sau)
Điền `{SUBJECT}`, `{EXPRESSIONS}`, `{POSES}`, `{CONCEPT}`, `{DESIGN}`, `{STYLE}`, `{BODY}`:
- `{SUBJECT}`: `ONE character` (cặp đôi thì `ONE elderly couple (husband and wife always together)`).
- `{EXPRESSIONS}` / `{POSES}` / `{STYLE}`: lấy từ phần Mascot của file cụm.
- `{BODY}`: `big round head (about 40% of the body height), simple mitten-like hands, no detailed fingers`; với K11 dùng `realistic adult proportions, dignified and respectful, never chibi or cartoonish`.

```
Character reference sheet (model sheet) of {SUBJECT} for a YouTube mascot, on a PURE WHITE background. This is NOT a scene and NOT an illustration of a story. Layout like a sticker sheet: top-left, 4 full-body turnaround views in a row (front, three-quarter, side, back), standing neutral; top-right, a 3x2 grid of 6 head-only expression close-ups: {EXPRESSIONS}; bottom row, 5 full-body poses: {POSES}. Character: {CONCEPT} {DESIGN} Style: {STYLE} Simple sticker-like look, {BODY}. Same proportions, colors and outfit in every drawing. Only a soft gray oval shadow under the feet. No floor, no room, no furniture, no trees, no sky, no scenery, no props except the signature item, no text, no labels, no numbers, no logo, no watermark, no other characters.
```

`{CONCEPT}` là một câu: nhân vật là ai, tính cách. `{DESIGN}` mô tả cố định: đầu, mắt, tóc, trang phục + mã màu, món đồ đặc trưng, tỉ lệ đầu thân.

## Định dạng trả lời
Tiêu đề `{K} mascot — {tên cụm}`, rồi với mỗi nhân vật:

### {số}. {tên nhân vật tiếng Việt}
- Ý tưởng: 1 câu tiếng Việt (vì sao hợp cụm, màu nổi trên nền nào).
- Prompt (trong code block để copy):
```
...
```

Cuối cùng 2–3 dòng nhắc cách dùng: chế độ tạo ảnh trên Flow, tỉ lệ 16:9, bỏ bản nào có cảnh nền; nếu Flow hay ra cảnh thì đính kèm mascot cũ làm mẫu bố cục và thêm câu đầu `Use the same sheet layout as the reference image, but draw this new character:`; mã màu bị vẽ thành chữ thì xoá mã, giữ tên màu.
