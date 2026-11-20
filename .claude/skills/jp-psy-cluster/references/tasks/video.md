# {K} video {title} {summary} — viết transcript

Mục tiêu: transcript lời đọc tiếng Nhật hoàn chỉnh cho một video 12–30 phút của cụm, dùng để đọc bằng giọng đọc (TTS) hoặc người đọc. Title bắt buộc; summary có thể không có.

## 1. Hiểu đầu vào
- Title có thể là tiếng Nhật hoặc tiếng Việt; transcript luôn viết tiếng Nhật và giữ đúng lời hứa của title.
- Có summary: bám sát các ý trong summary. Không có: tự xác định 3–9 ý chính từ title, khán giả và ngách nhỏ của cụm.
- Title có con số (7つ, 5選...) thì transcript trình bày đúng số ý đó.
- Xác định format của video theo các format A–D trong file cụm (danh sách, đối lập, khoảng trống tò mò, hệ quả, chân dung, gỡ mặc cảm, lời dạy...) và viết theo đúng tinh thần format đó (ví dụ format khoảng trống tò mò thì giữ "điều then chốt" tới gần cuối mới nói hết).

## 2. Chọn thời lượng
Tốc độ đọc tham chiếu: khoảng 300 ký tự tiếng Nhật mỗi phút (giọng chậm, hợp người lớn tuổi).

| Loại nội dung | Thời lượng hợp lý | Số ký tự mục tiêu |
|---|---|---|
| 3–4 ý, hoặc một lời dạy / một nghịch lý | 12–15 phút | 3.600–4.500 |
| 5–7 ý, hoặc đối lập có ví dụ | 16–22 phút | 4.800–6.600 |
| 8–10 ý, hoặc chủ đề có nhiều tình huống | 23–30 phút | 6.900–9.000 |

Mỗi ý khoảng 2–3 phút; mở đầu ~1 phút; kết ~1 phút. Chọn mức ngắn nhất mà vẫn nói đủ sâu: kéo dài bằng ý lặp lại làm người xem bỏ đi giữa chừng.

## 3. Cấu trúc
1. **Hook (30–60 giây đầu)**: vào thẳng tình huống hoặc câu hỏi chạm vào người xem; không chào hỏi, không giới thiệu kênh trước hook. Hứa điều người xem sẽ hiểu ra khi xem hết.
2. **Mở bài ngắn**: vì sao chủ đề quan trọng với khán giả cụm; lời chào rất ngắn có thể đặt ở đây.
3. **Thân bài**: từng ý có dấu hiệu rõ (「1つ目は…」「次に…」), mỗi ý gồm:
   - nêu ý bằng lời đời thường;
   - giải thích vì sao theo tâm lý học / khoa học não bộ, đơn giản, không thuật ngữ khó (nếu dùng thuật ngữ thì giải thích ngay);
   - một tình huống đời thường có nhân vật cụ thể (ví dụ 「68歳の佐藤さん」), bối cảnh Nhật Bản quen thuộc;
   - điều người xem có thể làm hoặc nhận ra.
4. **Giữ chân giữa video**: cứ khoảng 4–5 phút có một câu gợi tò mò cho phần sau (ví dụ 「実は、最後にお話しする○つ目が一番大切です」).
5. **Kết**: tóm tắt ngắn các ý; một thông điệp ấm áp, an tâm; câu hỏi mời bình luận theo "Câu hỏi kéo bình luận" của cụm; lời mời đăng ký ngắn gọn, lịch sự.

## 4. Giọng văn và an toàn
- Thể です・ます lịch sự, ấm, chậm rãi; câu ngắn; dùng từ thường ngày. Không suồng sã (〜だよね、〜じゃん).
- Viết để đọc thành tiếng: không bảng, không ký hiệu đầu dòng, không chú thích sân khấu trong lời đọc; số viết cách đọc tự nhiên.
- Không bịa nghiên cứu, tên nhà khoa học, trường đại học hay số liệu. Chỉ nhắc khái niệm có thật và phổ biến (ví dụ 確証バイアス, ザイアンス効果) và nói chung chung (「心理学では〜と言われています」).
- Không chẩn đoán, không hứa chữa khỏi, không hù doạ bệnh tật hay cái chết; chủ đề sức khoẻ thì khuyên hỏi ý kiến chuyên gia khi cần.
- Theo mục "Tránh" của cụm (ví dụ K8: không kích động trả thù, không gán bệnh cho người khác).

## 5. Lưu file và kiểm tra độ dài
Lưu transcript vào `docs/transcripts/{k}/{YYYY-MM-DD}-{slug}.md` (thư mục cụm viết thường, `slug` là vài từ romaji / tiếng Anh không dấu), theo mẫu:

```
# {title}
- Cụm: {K} {tên cụm} · Format: {K-?} · Thời lượng ước tính: {phút} phút · Số ký tự lời đọc: {n}
- Summary: {summary đã dùng}

## Mục lục (ước tính)
00:00 ...
...

## Transcript
{toàn bộ lời đọc tiếng Nhật, chia đoạn bằng dòng trống, không tiêu đề chương}
```

Sau khi lưu, đếm số ký tự phần Transcript bằng script (ví dụ đọc file bằng Python, lấy phần sau `## Transcript`, bỏ khoảng trắng và xuống dòng, `len(...)`). Nếu lệch khỏi khoảng mục tiêu quá 10% thì viết thêm hoặc cắt bớt rồi đếm lại, và cập nhật dòng thông tin ở đầu file.

## 6. Trả lời trong chat
Ngắn gọn: đường dẫn file, thời lượng ước tính và số ký tự, format đã chọn, mục lục. Không dán lại toàn bộ transcript trừ khi người dùng yêu cầu.
