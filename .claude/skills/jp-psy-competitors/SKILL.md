---
name: jp-psy-competitors
description: Theo dõi kênh đối thủ cùng ngách tâm lý học / khoa học não bộ tiếng Nhật (人生後半, 脳科学, 人間関係…) — bản skill của bộ não "Đối thủ" (competitors) trong dammo. Tìm video vượt chuẩn (outlier, view/giờ gấp nhiều lần median của chính kênh), kênh đang tăng tốc và công thức họ lặp lại, rồi lưu vào bộ nhớ bộ não. Dùng khi người dùng hỏi về "đối thủ", "kênh đối thủ", "kênh cùng ngách", "video vượt chuẩn / outlier", "kênh nào đang lên", "họ đang làm gì", "soi kênh UC…", hoặc gõ "competitors" / "đối thủ K3".
---

# Đối thủ (bộ não `competitors`)

Đọc `.claude/skills/_shared/brain-skill-common.md` trước: CLI, cách lưu, luật chung.

**Việc của skill:** theo dõi các kênh cùng ngách để tìm:
- (a) **video vượt chuẩn**: khoảng x3 trở lên so với median view/giờ của chính kênh đó;
- (b) **kênh đang tăng tốc**: video mới vượt video cũ, hoặc kênh mới lớn nhanh;
- (c) **công thức họ lặp lại**: series, format, độ dài, khuôn tiêu đề, nhịp đăng.

## Lệnh
- `competitors`: cả danh sách theo dõi.
- `competitors K{n}`: ưu tiên kênh có video thuộc cụm K{n}. Đọc `jp-psy-cluster/references/clusters/k{n}.md` để biết ngách nhỏ.
- `competitors UCxxxx …`: soi đúng các kênh người dùng đưa.

## Quy trình
1. `npm run -s brain -- prompt competitors`.
2. Đọc bộ nhớ:
   - `call competitors read_memory '{"brainId":"competitors","limit":60}'`: kết luận lần trước, kênh đã theo dõi.
   - `read_memory` của `jp-psy-trends` (kind `video`, `topic`): video và chủ đề đang nóng.
3. `call competitors list_watchlist`: kênh nguồn tiếng Nhật người dùng theo dõi, cộng các kênh đứng sau video nóng. Danh sách mỏng thì `youtube_search` vài truy vấn trong ngách để tìm thêm kênh (channelId có trong kết quả).
4. `call competitors channel_snapshot '{"channelId":"UC…","limit":20}'` cho 6–12 kênh liên quan nhất. Mỗi lệnh trả median view/giờ và hệ số `x` của từng video; hệ số tự lưu kèm video.
5. Với mỗi kênh, ghi nhận:
   - cỡ kênh và nhịp đăng;
   - video vượt chuẩn và vì sao vượt (chủ đề, khuôn tiêu đề, độ dài, format);
   - 3–5 video mới nhất có cùng vượt median không (dấu hiệu tăng tốc);
   - công thức nào lặp lại ở nhiều kênh.
6. Lưu (`save competitors`):
   - **channel**: `channelId`, `label` = tên kênh, `detail` = cỡ kênh, nhịp đăng, điều đang hiệu quả, `heat` = mức nên theo dõi.
   - **video** cho video vượt chuẩn thật: `detail` bắt đầu bằng "xN so với median" rồi lý do; `links` tới `channel:<id>` và `topic:<key>` nếu trùng chủ đề nóng.
   - **pattern** cho công thức nên học hoặc nên tránh: `key` slug, `detail` có video bằng chứng, `links` tới các `video:<id>`.
7. Báo cáo `docs/brains/competitors/YYYY-MM-DD.md`.

## Mẫu báo cáo
```markdown
# Đối thủ — YYYY-MM-DD (phạm vi: …)
## Tóm tắt (3–6 dòng)
## Kênh (xếp theo heat)
| Kênh | Sub | Median view/giờ | Nhịp đăng | Đang tăng tốc? | Điều đang hiệu quả | Heat |
## Video vượt chuẩn
| x median | View/giờ | Video | Kênh | Cụm | Vì sao vượt |
## Công thức lặp lại
- <pattern>: mô tả — bằng chứng (videoId, kênh) — nên học / nên tránh
## Gợi ý cho kênh mình (2–4 dòng, ghi cụm K)
```

## Lưu ý
- Hệ số `x` chỉ có ý nghĩa khi kênh có đủ video mới. Kênh có dưới 5 video thì nói rõ.
- Video hợp tác (`他 N チャンネル`) không có channelId, nên bỏ qua khi xét kênh.
- Tiếp theo trong chuỗi: `jp-psy-audience` (đọc bình luận của video nóng và video vượt chuẩn), `jp-psy-ctr`.
