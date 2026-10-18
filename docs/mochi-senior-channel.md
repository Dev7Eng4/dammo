# Kênh mock "ひだまり心理学" (Mochi Senior Psych)

Kênh mock `mock-08` trong dammo: tâm lý học cho người Nhật 60+ (60代・定年後), dùng dàn mascot mochi cố định.

## 1. Cái gì đã được thêm

| Thành phần | Vị trí | Ghi chú |
|---|---|---|
| Niche | `server/data/niches.json` | key `618665f9-bb6d-4b91-afa8-f3663ca6af17` |
| Visual style | `server/data/visual-styles.json` | "Mochi Senior Psych" |
| Flow ảnh có tham chiếu (2 step) | `server/data/prompts/all/mochi_senior_scenes/step-1.js, step-2.js` | Step 1 chọn cast + địa điểm cố định và chép nguyên văn prompt; step 2 viết prompt từng cảnh |
| Metadata 2 step | `server/data/prompts/ja/metadata_mochi_senior_psych/step-1.js, step-2.js` | Title theo 5 công thức + thumbnail 3 lớp |
| Kênh mock | `server/data/youtube-channels.json` (`mock-08`) + `youtube-channels/mock-08/videos.json` | Loại `reup_audio`, `ai`, `useReferenceImage: true` |

Kênh `mock-08` đã gắn đúng niche và visual style, nên khi tạo video AI dammo sẽ tự chọn flow ở bảng trên.

## 2. Mascot bible (dàn nhân vật dùng chung)

Giống loài chung: đầu tròn trắng liền thân như bánh mochi, 2 mắt chấm đen, miệng cong nhỏ, má hồng, tay chân tròn không có ngón. Phân biệt nhân vật bằng **màu áo và phụ kiện**, không bằng khuôn mặt. Chữ ký riêng của kênh: **chồi lá xanh trên đầu** của hai nhân vật chính (Haru và Gen). Đây là điểm khác biệt có chủ đích so với kênh tham khảo.

| id | Vai | Nhận diện cố định |
|---|---|---|
| `haru` | Bà (68), nhân vật chính nữ | Chồi lá, búi tóc xám nhỏ, cardigan vàng mù tạt, váy nâu |
| `gen` | Ông (68), nhân vật chính nam | Chồi lá, kính tròn nâu, áo len xanh navy, quần xám |
| `yuki` | Con gái (35) | Đuôi ngựa đen, áo hồng, quần jeans xanh nhạt |
| `mika` | Con dâu (35) | Tóc bob đen, áo xanh sage, váy be |
| `ken` | Con trai (40) | Tóc đen ngắn, sơ mi trắng, gile xám |
| `sato` | Hàng xóm / bạn (65) | Mũ lưỡi trai be, áo khoác lót bông nâu nhạt |

Prompt tham chiếu đầy đủ của từng nhân vật và địa điểm nằm trong `mochi_senior_scenes/step-1.js`. Pipeline chép nguyên văn từ đó, nên đó là nguồn duy nhất cần sửa nếu muốn đổi ngoại hình.

### Prompt tạo mascot tham chiếu (dán thẳng vào Flow/Meta để làm ảnh gốc)

Dùng khi bạn muốn tự tạo và duyệt ảnh gốc một lần rồi tải lên bằng nút đổi ảnh nhân vật trong màn hình Video Production.

Haru:
```
A cute original mochi-like character named Haru, an elderly grandmother: one big perfectly round soft white head that blends into a small round white body like a rice cake, two small black oval dot eyes set wide apart, a tiny short curved smile, soft round pink blush circles on both cheeks, tiny rounded stub arms and feet with no fingers and no toes, a tiny green leaf sprout on top of her head, a small round light-grey hair bun at the back of her head, wearing a mustard-yellow knit cardigan over a cream blouse and a long brown skirt, gentle motherly expression. Smooth thin warm-brown outline, flat colors with very soft shading, warm cozy Japanese illustration style. Exactly one character, full body, front view, standing naturally with arms relaxed, looking at the camera, centered, entire body visible, plain white seamless background, soft even lighting. No text, no letters, no logo, no watermark, no border, no props, no scenery, no extra characters, no character sheet, no multiple poses, no cropped body.
```

Gen: thay phần nhân vật bằng `Gen, an elderly grandfather ... a tiny green leaf sprout on top of his head, small round dark-brown glasses, wearing a navy-blue knit sweater over a white collared shirt and grey trousers, calm dependable expression`. Các nhân vật còn lại lấy từ `step-1.js`.

### Avatar kênh

```
A cute original mochi-like character named Haru, close-up of the head and shoulders, one big perfectly round soft white head, two small black oval dot eyes, a tiny curved smile, soft round pink blush circles, a tiny green leaf sprout on top of her head, a small grey hair bun, a mustard-yellow cardigan collar, centered on a flat warm sunny-yellow circular background. Flat colors with very soft shading, thick clean shapes, readable at 98 pixels. No text, no logo, no watermark.
```

## 3. Công thức title

Luôn bắt đầu bằng 【心理学】, gọi đúng đối tượng ngay đầu câu, giấu điều quan trọng sau 「これ」, có số lượng cụ thể sau dấu ｜. Tổng 36 đến 52 ký tự, ý hook nằm trong 28 ký tự đầu.

| Format | Công thức | Dùng khi |
|---|---|---|
| prohibit | 【心理学】{対象}は、「これ」を…てはいけません｜{N}つの習慣 | Các điều không nên làm |
| obey | 【心理学】{対象}は、「これ」だけは守りなさい｜{N}つの距離感 | Quy tắc nên giữ |
| revisit | 【心理学】{対象}は、「これ」を見直しなさい｜自分では気づけない{N}つの振る舞い | Thói quen nên nhìn lại |
| compare | 【心理学】{A}した人と{B}した人｜{N}年後に分かった「本当の正解」 | Hai lựa chọn đối lập (tiền, nghỉ hưu) |
| story | 【心理学】{tình huống}、{母/妻}は「これ」だけ先に言いなさい｜{N}つのこと | Tình huống đời thường |

Thứ tự thử đề xuất cho kênh mới: compare (trần view cao nhất ở nhóm tiền và nghỉ hưu), prohibit, obey. Giữ revisit và story để đa dạng nhịp đăng.

## 4. Thumbnail tối ưu CTR (bố cục 3 lớp)

```
┌────────────────────────────────────┐
│ ▓▓ dải đen, 1 dòng vàng #FFE600 ▓▓ │  24%  gọi đối tượng: 定年後の60代は
├────────────────────────────────────┤
│  nền phẳng bão hòa (cam / xanh ngọc │
│  / vàng nắng) + mascot lớn +        │  52%
│  đạo cụ lớn + mũi tên đỏ            │
├────────────────────────────────────┤
│ ▓ dải đen, trắng + 「これ」đỏ ▓ [  ] │  24%  ※「これ」は削るな
└────────────────────────────────────┘
                                  ↑ chừa trống 14% bên phải (đồng hồ thời lượng)
```

Lý do mỗi lựa chọn:
- **Gọi đối tượng ở dải trên:** người xem nhận ra "nói về mình" trước cả khi đọc title.
- **「これ」 ở dải dưới, tô đỏ:** tạo khoảng trống tò mò; title giữ phần còn lại nên hai phần không lặp nhau.
- **Một mascot + một đạo cụ + một mũi tên:** đọc được ở 20% kích thước (điện thoại).
- **Màu nền theo tâm trạng:** warning cam `#FF8A00`, family xanh ngọc `#17C3B2`, calm vàng nắng `#FFB938`, compare chia đôi cam và xanh ngọc. Mascot trắng nổi bật trên cả ba màu.
- **Chừa trống góc dưới phải:** tránh bị che bởi nhãn thời lượng video.

Metadata step 2 cũng xuất `ab_test_variants` (2 cặp chữ thay thế) để dùng với YouTube Test & Compare. Đây là cách duy nhất để biết bố cục này có thực sự thắng, vì thiết kế dựa trên các mẫu quan sát được chứ không phải số liệu CTR đã đo của kênh bạn.

## 5. Quy trình chạy thử

1. Mở kênh `[MOCK] ひだまり心理学` trong màn hình YouTube Channels.
2. Tạo video với transcript tiếng Nhật 5 phút (dùng flow AI, bật reference image).
3. Sau phase 1, vào Video Production → Characters: kiểm tra ảnh Haru/Gen. Nếu lệch, tải lên ảnh gốc đã duyệt (mục 2) bằng nút đổi ảnh.
4. Chạy tiếp tạo cảnh; xem log có dòng `Character reference image not found for id` không (nếu có là sai id).
5. Kiểm tra thumbnail: thu nhỏ còn 20% và đọc thử; kiểm tra chữ Nhật có đúng từng ký tự không.

## 6. Giới hạn đã biết

- Flow/Meta không cố định seed, nên mascot có thể lệch nhẹ giữa các cảnh. Ảnh tham chiếu và prompt cố định giảm nhưng không loại bỏ hoàn toàn.
- Kho mascot cấp kênh chỉ chạy với kênh có thư mục `mascots/` (xem mục 7). Kênh không có thư mục này vẫn tạo lại nhân vật theo từng video như cũ.
- Thumbnail do AI vẽ cả chữ Nhật, nên có rủi ro sai nét chữ. Cách an toàn hơn là AI vẽ nền + mascot và ghép chữ bằng code.

## 7. Kho mascot cấp kênh

Mục đích: mọi video của kênh dùng **đúng cùng một file ảnh** cho mỗi nhân vật.

- Vị trí: `server/data/youtube-channels/<channelId>/mascots/<id>.jpg|png|webp` (ví dụ `mock-08/mascots/haru.jpg`).
- **Bật/tắt:** kho bật khi thư mục `mascots/` tồn tại. Đã tạo sẵn cho `mock-08`.
- **Trước khi sinh ảnh nhân vật** của mỗi video (flow tham chiếu), ảnh trong kho được copy vào `image-references` của video, nên Flow/Meta bỏ qua các nhân vật đã có.
- **Sau khi sinh ảnh**, nhân vật chưa có trong kho sẽ được lưu vào kho. Video đầu tiên của kênh vì vậy "chốt" ảnh gốc cho các video sau.
- **Đổi ảnh nhân vật** trong màn hình Video Production (nút tải ảnh lên) cũng ghi đè ảnh trong kho khi kho đang bật, nên ảnh bạn duyệt trở thành ảnh chuẩn của kênh.
- **Chọn ảnh gốc thủ công:** đặt sẵn `haru.jpg`, `gen.jpg`... vào `mascots/` (tạo từ prompt ở mục 2) trước khi chạy video đầu tiên.
- **Làm lại một nhân vật:** xóa file của nhân vật đó trong `mascots/`; video kế tiếp sẽ sinh và lưu ảnh mới.
- Ảnh nào đã có sẵn trong video (ví dụ bạn sửa tay cho riêng video đó) không bị ghi đè bởi kho.
- Địa điểm (`loc_*`) cũng đi qua kho theo cùng cơ chế, nên phòng khách Showa giống nhau giữa các video.
