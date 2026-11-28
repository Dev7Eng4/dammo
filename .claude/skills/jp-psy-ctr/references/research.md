# Chế độ nghiên cứu: cặp title + bìa nào đang thắng

Phân tích title và thumbnail **trên cùng một bộ video**, để thấy được cặp, không phải hai danh sách mẫu rời nhau.

## Quy trình
1. `npm run -s brain -- prompt title-seo` và `npm run -s brain -- prompt thumbnail`. Làm theo phần "How to work" của cả hai.
2. Đọc bộ nhớ:
   - `title-seo` (`pattern`, `title`, `keyword`) và `thumbnail` (`pattern`): mẫu cũ, dùng lại key. Mẫu theo cặp có key bắt đầu bằng `pair-`.
   - `jp-psy-trends` (`video`, `keyword`), `competitors` (`video`, `pattern`).
   - `docs/brains/ctr/ctr-log.csv` nếu có, và bộ não `studio` (`metric`, `insight`): CTR thật của kênh mình. Mẫu từ đối thủ chỉ là giả thuyết khi mâu thuẫn với CTR thật của kênh.
   
   Ví dụ: `npm run -s brain -- call thumbnail read_memory '{"brainId":"jp-psy-trends","kind":"video","limit":40}'`.
3. Chọn **một** bộ video: 12–16 video nóng hoặc vượt chuẩn, cộng 4–6 video bình thường, ưu tiên **cùng kênh** với video thắng để loại ảnh hưởng của cỡ kênh. Có `K{n}` thì chỉ lấy cụm đó. Ưu tiên hệ số `channelRatio` (x so với median kênh) hơn view/giờ tuyệt đối.
4. Xem bìa: `npm run -s brain -- call thumbnail view_thumbnails '{"videoIds":[…]}' --out <scratchpad>/thumbs` (tối đa 12 video một lần), rồi mở **từng** ảnh bằng Read. Chưa mở ảnh thì không kết luận về ảnh đó.
5. Với mỗi video, ghi một hàng:
   - **title**: độ dài, 【】, con số, đối tượng, mệnh lệnh hay câu hỏi, ｜, 30 ký tự đầu;
   - **bìa**: chép lại chữ trên ảnh, số dòng, từ nhấn, nhân vật, biểu cảm, mũi tên, đọc được ở cỡ nhỏ không;
   - **cặp**: móc chung (một câu), kiểu chia vai (bảng trong `pairing.md`), chữ trùng giữa hai bên, bìa thêm điều gì.
6. So nhóm thắng với nhóm thường. Điểm khác nhau chỉ đáng kể khi lặp ở từ 3 video, 2 kênh trở lên. Ít hơn thì ghi là giả thuyết.
7. `npm run -s brain -- call title-seo youtube_suggest '{"query":"…"}'` cho các cụm từ hứa hẹn, để biết người xem thật sự gõ gì.
8. Lưu **hai file**, hai lệnh:
   - `save title-seo`: **pattern** công thức title, **pattern** theo cặp (key `pair-<slug>`, `detail` ghi bìa nói gì, title nói gì, ví dụ, khi nào dùng), **keyword**.
   - `save thumbnail`: **pattern** công thức bìa.
   
   Mỗi pattern có `links` tới `video:<id>` bằng chứng. Cần lưu tiêu đề cho ý tưởng thì dùng `ctr idea <key>`.
9. Báo cáo `docs/brains/ctr/YYYY-MM-DD-research[-k{n}].md`.

## Mẫu báo cáo
```markdown
# Cặp title + bìa đang thắng — YYYY-MM-DD (phạm vi)
## Tóm tắt (3–6 dòng)
## Bảng video
| Nhóm | x kênh | View/giờ | Title | Chữ bìa | Móc chung | Kiểu chia vai | Bìa thêm điều gì |
## Công thức theo cặp
| key | Bìa nói | Title nói | Ví dụ | Khi nào dùng | Độ chắc (mấy video, mấy kênh) |
## Công thức title · Công thức bìa · Từ khoá
## So với prompt cụm
- Điều đang khớp, điều nên cân nhắc đổi (chỉ gợi ý, không tự sửa)
```
