# Thang chấm: 100 điểm chi tiết, quy ra thang 10

CLI cộng điểm và chia 10. Từ **8.0** là đạt. Trọng số nghiêng về cặp là lựa chọn thiết kế; điểm để so và quyết định làm lại, không dự đoán CTR. **CTR thật thắng điểm:** khi `channel.measured` (CTR Studio của kênh) mâu thuẫn với cảm nhận khi chấm, theo CTR thật. Mỗi điểm trừ phải chỉ ra được bằng chứng: câu trong transcript, kết quả máy, hoặc vị trí trên ảnh. Chỗ nào luật hiểu được hai cách thì không trừ.

**Cặp (40)**
| Mã | Tối đa | Tiêu chí |
|---|---|---|
| C1 | 10 | Cùng một móc, móc có thật trong transcript |
| C2 | 10 | Mỗi bên nói một điều bên kia chưa nói. Bìa chép title: 0–2 |
| C3 | 8 | Cùng chủ thể, cùng chiều (nên làm / nên tránh) |
| C4 | 6 | Đọc liền thành một câu chuyện; che một bên, bên kia vẫn hiểu |
| C5 | 6 | Chỉ ra được đoạn transcript trả lời cả title lẫn bìa |

**Title (30)**
| Mã | Tối đa | Tiêu chí |
|---|---|---|
| T1 | 8 | Đúng nội dung: chủ đề, số mục tự đếm, lời hứa, mốc tuổi |
| T2 | 8 | Hợp kênh: theo **khuôn title của nhóm CTR cao** trong `channel.measured` (nhãn 【】, độ dài, con số, giọng); chủ đề đóng khung theo góc mà kênh đã thắng khi transcript cho phép. Chưa có số đo: hợp cụm nội dung (khán giả, động lực bấm, format). `off`: hợp chủ đề kênh |
| T3 | 6 | Móc cụ thể trong 30 ký tự đầu, khác móc title gốc, không trùng **câu chữ móc** với video anh em. Dùng chung khuôn đã chứng minh của kênh là đúng, không trừ |
| T4 | 4 | Dùng kỹ thuật hệ số cao của ngách khi nội dung cho phép; không nhồi |
| T5 | 4 | 30–70 ký tự, một nhãn 【】, vế sau ｜ trọn nghĩa, lịch sự, không giật gân |

**Bìa (30)**
| Mã | Tối đa | Tiêu chí |
|---|---|---|
| B1 | 7 | Dòng chính mang móc; từ nhấn là từ mang nghĩa chính |
| B2 | 4 | Ít chữ, ngắt theo cụm nghĩa, mỗi dòng khoảng 12 ký tự (dòng ※ 14); kênh có giới hạn riêng thì theo kênh |
| B3 | 9 | Đúng **khuôn bìa đã chứng minh** của kênh: mở 3 bìa CTR cao nhất trong `channel.measured` và giữ bối cảnh, ánh sáng, nhân vật, biểu cảm, nhãn, màu chữ. Đổi tông (sáng → tối, cười → lo âu, minh hoạ toàn cảnh → cận mặt) là 0–2. Chưa có số đo: đúng giao diện các video khác của kênh. Góc dưới phải trống |
| B4 | 6 | Hình vẽ đúng điều chữ nói: người, vật, mũi tên; đạo cụ giải thích được móc |
| B5 | 4 | Đọc được ở 160 px; không sai chữ, chữ lạ, watermark, dị dạng |

**Lỗi chặn** (điểm tối đa 5):
- sai sự thật: số mục lệch, hứa điều không có, bịa số liệu, gán cho người thật câu họ không nói;
- title chép title gốc hoặc chép mẫu;
- chữ trên ảnh sai đến mức đổi nghĩa;
- title và bìa ngược chiều;
- hù doạ bệnh tật, cái chết; chẩn đoán hay hứa chữa bệnh; chế giễu người già;
- kênh có từ 5 video đo CTR (`channel.measured`) mà bìa mới bỏ khuôn của nhóm CTR cao (đổi bối cảnh, tông màu hay biểu cảm nhân vật).

`pipelineGuard` báo **chỉ vì bìa lặp title** thì trừ ở C2 và B1, không tính là lỗi chặn.

**Mốc để chấm đều tay:** 9 là cặp khó nghĩ ra cách hơn; 8 là đăng được ngay; 6–7 là đúng nhưng nhạt hoặc lặp; 4–5 là lệch móc hoặc chung chung; dưới 4 là sai. Bản cũ và bản mới chấm cùng một thước.
