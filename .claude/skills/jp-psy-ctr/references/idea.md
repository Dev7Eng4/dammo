# Gói cho ý tưởng chưa có video

1. Đã có kịch bản trong `docs/scripts/` (`npm run -s script -- list`) thì đó là nguồn chính: dùng `script.txt` làm file `--text`. Chưa có thì lấy ý tưởng: `npm run -s brain -- call title-seo read_memory '{"brainId":"ideas","kind":"idea"}'`, có brief thì thêm `'{"brainId":"script","kind":"brief"}'`. `read_memory` cắt `detail` ở 400 ký tự; thiếu thì đọc `docs/brains/ideas/`. Ghi mọi chi tiết ra một file text.
2. Đọc prompt meta của cụm kênh đích, pattern trong bộ nhớ `title-seo` và `thumbnail` (key `pair-…`), insight của `audience`, `docs/brains/ctr/ctr-log.csv`.
3. Tìm 5–8 móc trước, chọn 3, mỗi móc một gói: title, chữ bìa, từ nhấn, kiểu chia vai, cảnh (tiếng Anh), tag, dòng đầu mô tả. Qua bảy phép thử trong `pairing.md`.
4. Kiểm tra máy: `ctr-check.mts --cluster K7 --text <file> --pair "title || dòng 1|dòng 2"`.
5. Lưu gói nên dùng: `npm run -s brain -- save title-seo <file>`, kind `title`, `key` = `<idea key>-title`, `labelJa` = title, `detail` bắt đầu bằng `Bìa: … / … · nhấn … · Móc: … · Kiểu: …` (não khác chỉ đọc 400 ký tự đầu), rồi title thay thế, tag; `links` tới `idea:<key>`.
6. Báo cáo `docs/brains/ctr/YYYY-MM-DD-<idea key>.md`. Nói rõ gói dựa trên brief hay chỉ trên ý tưởng.
