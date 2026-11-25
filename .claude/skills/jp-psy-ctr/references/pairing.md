# Luật ghép cặp title × thumbnail

## Một câu: cùng một móc, khác thông tin

- **Móc** là điều khiến người xem dừng lại: một tình huống, lựa chọn, câu nói, đồ vật hay ý ngược lẽ thường **có thật trong kịch bản**. Cả cặp chỉ có **một** móc.
- **Thông tin** được chia cho hai bên. Bìa làm người ta khựng lại. Title nói chuyện này dành cho ai và xem xong được gì.

Đây cũng là luật của hệ thống: prompt meta của cả 11 cụm yêu cầu title và chữ bìa dùng cùng một cái móc, dòng chính của bìa nói điều title chưa nói. Bước vẽ bìa mascot (`mascot_thumbnail_director`) giữ nguyên móc đó ở bản đầu; nó chỉ cấm lặp lại **câu chữ** của móc, nhãn 【】 và phần sau ｜.

## Năm kiểu chia vai

| Kiểu | Bìa nói | Title nói | Hợp khi kịch bản có |
|---|---|---|---|
| `tinh-huong` Tình huống → lời hứa | một cảnh hay lựa chọn cụ thể (テレビか、金沢か) | cho ai, nên làm gì, được gì | câu chuyện nhân vật, hai lựa chọn |
| `menh-lenh` Mệnh lệnh → lý do | lời phán hoặc mệnh lệnh, dòng ※ | hành vi nào, của ai, mấy điều | hành vi của người khác, điều nên dừng |
| `cam-xuc` Cảm xúc → giải thích | điều người xem đang thấy trong lòng | gọi tên hiện tượng, hứa giải thích | thói quen phổ biến, nỗi lo |
| `giau` Vật giấu → bối cảnh | 「これ」 và một đạo cụ bị che | ai, khi nào, để làm gì | một bí quyết then chốt |
| `lat` Lật lẽ thường → bằng chứng | ý ngược với điều ai cũng tin | căn cứ, số điều, đối tượng | nghiên cứu hay chi tiết bất ngờ |

Kiểu chia vai không thay cho format của cụm. Format trong prompt meta (`server/data/prompts/ja/metadata_tlnb_k*/step-1.js`) quyết định bố cục và chữ được phép; kiểu chia vai quyết định **bên nào nói gì**. Khi hai bên chạm nhau, theo format.

## Bảy phép thử

Cặp trượt phép 1, 2, 4, 5 hoặc 6 thì viết lại. Trượt phép 3 hoặc 7 thì sửa câu chữ.

1. **Cùng móc.** Viết móc thành một câu tiếng Việt. Title và bìa đều phải là một cách nói của câu đó.
2. **Khác thông tin.** Bỏ bìa đi thì mất một điều; bỏ title đi thì mất một điều khác. Nếu không mất gì, hai bên đang lặp nhau.
3. **Đọc liền.** Đọc chữ bìa rồi title (`readAloud`): nghe như một câu chuyện, không hỏi lại câu đã hỏi.
4. **Đứng riêng.** Che title, bìa vẫn cho biết chuyện về ai, việc gì. Che bìa, title vẫn hiểu được (tìm kiếm và thông báo chỉ hiện title).
5. **Cùng chủ thể, cùng chiều.** Cùng nói về người xem hay cùng nói về người khác; cùng là nên làm hay nên tránh.
6. **Kịch bản trả lời.** Chỉ ra chương trả lời cho lời hứa của title **và** cho chữ bìa. Không chỉ ra được là hứa hão.
7. **Cỡ nhỏ.** Móc nằm trong 30 ký tự đầu của title; chữ bìa đọc được ở khoảng 160 px ngang. Hình vẽ đúng thứ mà chữ bìa nói: chữ nhắc TV và 金沢 thì cả hai phải thấy rõ, mũi tên đi đúng hướng.

## Điều làm hỏng cặp
- Title và bìa mỗi bên một móc (title 「いつか」, bìa TV với 体験): người xem phải hiểu hai chuyện trong một giây.
- Bìa chép lại nửa title; cả hai cùng dùng con số mà không bên nào thêm ý. Con số ở dòng ※ được phép khi format cho phép.
- Bìa an ủi trong khi title cảnh báo, hoặc ngược lại.
- Bìa nhử rỗng (その理由は…) khi title đã hỏi なぜ.
- Móc chỉ có trên hình hoặc chỉ có trong title, còn kịch bản nhắc thoáng qua một câu.

## Giới hạn cứng hay quên
- Kênh có prompt riêng thì bố cục, số dòng và cỡ nhân vật theo prompt đó; các số dưới đây là mặc định của cụm K1–K11.
- Mỗi dòng bìa tối đa 12 ký tự, dòng ※ tối đa 14, cả bìa khoảng 8–24 ký tự.
- Mascot chiếm khoảng 35–50% chiều cao ảnh. "Large in the middle" trong prompt cụm là **tầng giữa** (giữa hai dòng chữ), không phải chính giữa theo chiều ngang.
- Góc dưới phải để trống cho nhãn thời lượng. Không chữ trên vật nền.
- Người hay vật nhắc trong chữ bìa phải có trong ảnh.
