---
name: jp-psy-images
description: Nhìn vào bên trong các video tâm lý học tiếng Nhật đang thắng (3 khung hình giữa video) để biết cảnh trông thế nào — minh hoạ hay ảnh thật, nét vẽ, nhân vật / mascot, bảng màu, chữ và phụ đề trên màn hình — rồi chỉ hướng phong cách hình và prompt cảnh mẫu cho từng kênh của mình — bản skill của bộ não "Ảnh / clip" (images) trong dammo, lưu vào bộ nhớ bộ não. Dùng khi người dùng hỏi "phong cách hình", "ảnh cảnh", "visual style", "hình trong video đối thủ", "prompt ảnh cảnh", "nên vẽ kiểu gì", hoặc gõ "images" / "images <tên kênh>".
---

# Ảnh / clip (bộ não `images`)

Đọc `.claude/skills/_shared/brain-skill-common.md` trước.

**Việc của skill:** tìm hiểu bên trong các video đang thắng trông như thế nào, rồi biến điều đó thành hướng dẫn cho bộ tạo ảnh cảnh của mình.

## Lệnh
- `images`: mọi kênh.
- `images <tên kênh>` hoặc `images K{n}`: một kênh, hoặc video thuộc một cụm.

## Quy trình
1. `npm run -s brain -- prompt images`.
2. Đọc bộ nhớ:
   - `images` (`pattern`, `recipe`): kết luận cũ, key `visual-<channel id>`;
   - `jp-psy-trends` và `competitors` (`video`);
   - `script` (`brief`): video sắp làm cần hình gì.
3. Chọn 10–15 video nóng hoặc vượt chuẩn ở nhiều kênh khác nhau, cộng 3–4 video bình thường để đối chứng.
4. Xem khung hình theo lô tối đa 6 video:
   ```bash
   cd server && npm run -s brain -- call images view_video_frames '{"videoIds":["id1","id2"]}' --out <scratchpad>/frames
   ```
   Rồi mở từng ảnh `IMAGE` bằng Read (mỗi video 3 khung hình, ở khoảng 25%, 50%, 75% thời lượng). Với mỗi video, ghi nhận:
   - minh hoạ, ảnh thật, footage stock hay slideshow;
   - nét vẽ (phẳng, màu nước, anime, tả thực, mực);
   - nhân vật lặp lại hoặc mascot, tuổi và biểu cảm;
   - bảng màu, độ sáng;
   - chữ trên màn hình, cỡ, vị trí và màu phụ đề;
   - ba khung khác nhau đến đâu (hình đổi suốt video hay đứng một cảnh).
5. Đọc dữ liệu của mình:
   - `call images list_visual_styles`;
   - `call images my_channel_setup`: style và mật độ cảnh mỗi kênh đang dùng;
   - `call images list_my_productions` và `npm run -s brain -- productions`: số cảnh, số giây mỗi cảnh. Muốn xem cảnh thật của kênh mình thì mở vài ảnh trong `videos/<videoId>/images/` bằng Read.
   
   Kênh có `mascot-profile.json` (`server/data/youtube-channels/<id>/`) thì đọc thêm để prompt mẫu giữ đúng nhận diện mascot.
6. Lưu (`save images`):
   - **pattern** (5–8):
     - `key` slug; `label` = công thức hình trong một dòng tiếng Việt;
     - `detail` = cụ thể là gì, video nào thể hiện (kèm view/giờ), video yếu làm khác ở đâu;
     - `links` tới `video:<id>`; `heat` = độ mạnh của bằng chứng.
   - **recipe**, mỗi kênh một nơ-ron:
     - `key` = `visual-<channel id>`; `label` = "Hình cho <tên kênh>";
     - `detail` = giữ hay đổi style (nêu id style có sẵn, hoặc mô tả luật style cần thêm), hướng nhân vật hay mascot, bảng màu, độ dễ đọc của phụ đề với mắt người lớn tuổi, ảnh tĩnh hay clip, và 3 prompt cảnh mẫu bằng tiếng Anh hợp với kênh;
     - `heat` = mức thay đổi sẽ giúp được bao nhiêu.
7. Báo cáo `docs/brains/images/YYYY-MM-DD.md`, gồm:
   - bảng video đã xem (loại hình, nét vẽ, nhân vật, màu, phụ đề, đổi cảnh);
   - các công thức hình;
   - mỗi kênh một mục: style hiện tại → đề xuất, và 3 prompt mẫu.

## Luật riêng
- Khung hình chỉ là mẫu nhỏ ở giữa video. Kết luận nào chỉ dựa trên 3 khung thì ghi rõ "từ 3 khung hình".
- Chỉ đề xuất: không sửa style hay cấu hình kênh, không tạo ảnh.
- Tiếp theo trong chuỗi: `jp-psy-editing`.
