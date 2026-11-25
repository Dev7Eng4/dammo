---
name: jp-psy-growth
description: Gộp mọi thứ mạng lưới bộ não biết thành 6–12 việc tăng trưởng nên làm trong 2 tuần tới cho các kênh tâm lý học tiếng Nhật của mình — nhân đôi thứ đang thắng, kéo chéo giữa các kênh, lấp khoảng trống ngách, kênh nên dừng hay đổi hướng, việc với cộng đồng, rủi ro nội dung lặp — bản skill của bộ não "Tăng trưởng" (growth) trong dammo, lưu việc cần làm vào bộ nhớ bộ não. Dùng khi người dùng hỏi "tăng trưởng", "làm gì để kênh lớn", "kế hoạch 2 tuần", "chiến lược kênh", "nên dừng kênh nào", "kéo chéo kênh", hoặc gõ "growth".
---

# Tăng trưởng (bộ não `growth`)

Đọc `.claude/skills/_shared/brain-skill-common.md` trước.

**Việc của skill:** biến mọi thứ mạng lưới đã biết thành một danh sách ngắn các **việc tăng trưởng** cho 2 tuần tới, nhất là những bước dùng nhiều kênh của mình cùng lúc.

## Lệnh
- `growth`: cả mạng lưới kênh.
- `growth <tên kênh>`: tập trung vào một kênh (vẫn xét kéo chéo với kênh khác).

## Quy trình
1. `npm run -s brain -- prompt growth`.
2. Đọc bộ nhớ:
   - `growth` (`action`): việc đã đề xuất lần trước. Dùng lại key cũ và nói số liệu đã nhúc nhích chưa.
   - `studio` (`metric`, `insight`, `video`), `ideas` (`idea`), `script` (`brief`), `publish` (`schedule`);
   - `competitors` (`channel`, `pattern`) và `audience` (`insight`).
   
   Sau đó `call growth my_channel_setup` và `call growth list_my_channels` để biết các kênh và mỗi kênh còn cách mức kiếm tiền bao xa. Chạy thêm `npm run -s brain -- productions` để soi rủi ro lặp: các kênh có dùng cùng một khuôn title hay cùng một kiểu chữ thumbnail ở mọi video không.
3. Tìm các loại việc sau:
   - **Nhân đôi**: chủ đề hay format đã thắng ở một kênh của mình, làm thành series, hoặc làm lại cho kênh chị em với góc khác.
   - **Kéo chéo giữa các kênh**: khán giả kênh nào hợp kênh nào, nên liên kết gì (màn hình kết, bình luận ghim, mô tả, playlist), mà không làm các kênh trông như bản sao của nhau.
   - **Kênh nên dừng, gộp hoặc đổi hướng** vì liên tục dưới mức nền.
   - **Khoảng trống**: ngách nhỏ có nhu cầu cao (heat của trends, insight của khán giả) mà cả mình lẫn đối thủ mạnh đều chưa có video gần đây. Xác nhận bằng `call growth youtube_search '{"query":"…","upload_date":"month"}'`.
   - **Cộng đồng**: cách trả lời bình luận, câu hỏi ghim, khảo sát, playlist để xem liền nhiều video.
   - **Rủi ro**: dấu hiệu nội dung tái sử dụng hay lặp lại giữa các kênh của mình (cùng khung kịch bản, cùng khuôn title ở mọi video), phụ thuộc vào một chủ đề.
4. Lưu (`save growth`) 6–12 nơ-ron **action**:
   - `key` slug; `label` = việc cần làm, một câu mệnh lệnh tiếng Việt;
   - `detail` gồm:
     - kênh nào;
     - các bước cụ thể;
     - bằng chứng dựa vào;
     - tác động dự kiến;
     - cách biết sau 2 tuần là có hiệu quả (số công khai nào phải nhúc nhích);
     - công sức (thấp / vừa / cao);
   - `heat` = tác động × độ tin / công sức;
   - `links` tới `metric:<key>`, `idea:<key>`, `brief:<key>`, `pattern:<key>`, `video:<id>` làm nền.
5. Báo cáo `docs/brains/growth/YYYY-MM-DD.md`, gồm:
   - bảng việc xếp theo heat (Việc | Kênh | Công sức | Số cần theo dõi | Heat);
   - mỗi việc một mục chi tiết;
   - "Việc lần trước: đã nhúc nhích chưa".

## Luật riêng
- Không đề xuất mua view hay sub, sub chéo, bot bình luận, tiêu đề gây hiểu lầm, hay bất cứ gì trái chính sách YouTube.
- Chỉ đề xuất: không đổi cấu hình kênh, không đăng, không xoá.
- Đây là bộ não cuối chuỗi. Gợi ý người dùng quay lại `jp-psy-trends` ở lượt sau.
