---
name: jp-psy-ideas
description: Gộp chủ đề nóng, video vượt chuẩn của đối thủ và insight khán giả thành ý tưởng video cụ thể cho từng kênh tâm lý học tiếng Nhật của mình (tiêu đề Nhật tạm, góc khác biệt, lời hứa, vì sao là bây giờ, mức bão hoà) — bản skill của bộ não "Ý tưởng video" (ideas) trong dammo, lưu ý tưởng vào bộ nhớ bộ não. Dùng khi người dùng hỏi "ý tưởng video", "nên làm video gì", "chủ đề tiếp theo", "idea cho kênh X", "lên danh sách video", hoặc gõ "ideas" / "ideas K5" / "ideas <tên kênh>". Khác jp-psy-cluster "K videos": skill này dựa trên dữ liệu thật của các bộ não.
---

# Ý tưởng video (bộ não `ideas`)

Đọc `.claude/skills/_shared/brain-skill-common.md` trước.

**Việc của skill:** biến những gì các bộ não khác đã học thành ý tưởng video cụ thể mà người dùng duyệt được ngay hôm nay.

## Lệnh
- `ideas`: cho mọi kênh của mình.
- `ideas K{n}` hoặc `ideas <tên kênh>`: chỉ cho cụm hoặc kênh đó. Đọc thêm `jp-psy-cluster/references/clusters/k{n}.md` (khán giả, ngách nhỏ, format).

## Quy trình
1. `npm run -s brain -- prompt ideas`.
2. Đọc bộ nhớ:
   - `ideas` (kind `idea`): ý tưởng cũ, để dùng lại key và không trùng ý;
   - `jp-psy-trends` (`topic`, `keyword`);
   - `competitors` (`pattern`, `video`);
   - `audience` (`insight`).
   
   Sau đó `call ideas list_my_channels` để biết kênh đích, niche, ngôn ngữ, trạng thái.
3. Với mỗi cơ hội mạnh:
   - Kiểm tra độ bão hoà bằng `youtube_search` (`"upload_date":"month"`). Nhiều video gần đây đã nói đúng điều đó thì tìm góc sắc hơn hoặc bỏ.
   - `youtube_suggest` để xem khán giả gõ cụm nào.
4. Viết 8–15 ý tưởng, mỗi ý tưởng gắn một kênh đích và cụm K của kênh đó (theo `niche` của kênh, ví dụ `ja-psy-k1` → K1).
5. Lưu (`save ideas`), kind **idea**:
   - `key`: slug; `label`: ý tưởng một dòng tiếng Việt; `labelJa`: tiêu đề tiếng Nhật tạm;
   - `detail` (tiếng Việt, mỗi ý một dòng):
     - Kênh: …
     - Lời hứa: …
     - Góc khác biệt so với các video top hiện có: …
     - Insight trả lời: …
     - Vì sao là bây giờ: heat chủ đề, video vượt chuẩn, số liệu
     - Bão hoà: thấp / vừa / cao, kèm điều đã thấy
     - Độ dài gợi ý: …
   - `cluster`: K của kênh đích;
   - `heat` = nhu cầu × thời điểm × độ khác biệt, trừ đi mức bão hoà;
   - `links`: tới `topic:<key>`, `insight:<key>`, `pattern:<key>`, `video:<id>` mà ý tưởng dựa vào.
6. Báo cáo `docs/brains/ideas/YYYY-MM-DD.md`.

## Mẫu báo cáo
```markdown
# Ý tưởng video — YYYY-MM-DD (phạm vi: …)
## Tóm tắt (3–6 dòng)
## Ý tưởng (xếp theo heat)
| # | Heat | Kênh | Cụm | Tiêu đề tạm (JA) | Ý tưởng (VI) | Góc khác biệt | Vì sao bây giờ | Bão hoà |
## Đã bỏ
| Ý tưởng | Lý do (bão hoà, ngoài ngách…) |
## Bước tiếp
- Chạy `jp-psy-ctr` để tạo gói title + bìa, `jp-psy-script-niche` để viết kịch bản theo cụm; hoặc `jp-psy-cluster` `K{n} video <title>` để viết kịch bản ngay khi đã chốt title.
```

## Luật riêng
- Không đề xuất ý tưởng trùng góc với video kênh đã làm gần đây. Nếu cần biết kênh đã làm gì, `npm run -s script -- list` và `npm run -s brain -- productions` liệt kê.
- Không hứa điều tâm lý học hay y học không hỗ trợ (chữa khỏi, làm giàu, "khoa học chứng minh").
