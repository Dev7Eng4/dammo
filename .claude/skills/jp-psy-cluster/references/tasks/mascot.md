# {K} mascot — 3 prompt tạo mascot

Mục tiêu: 3 prompt tiếng Anh, mỗi prompt tạo **một ảnh tham chiếu nhân vật** (reference sheet) trên Google Flow, theo đúng bố cục mascot đang dùng trong dammo:
- nền trắng trơn;
- 4 góc nhìn;
- 6 đầu biểu cảm;
- 5 tư thế.

Ảnh này được tải lên làm mascot kênh. Hệ thống đọc nó để viết hồ sơ mascot và vẽ thumbnail, nên nó phải là ảnh tham chiếu sạch, không phải một cảnh minh hoạ.

## Bước 0: Đọc dữ liệu thắng mới nhất
Đọc các công thức hình mà bộ não `images` đã học từ video đang nổ:

```bash
cd server && npm run -s brain -- call images read_memory '{"brainId":"images","kind":"pattern","days":60}'
```

Báo cáo gốc nằm ở `docs/brains/images/` (file mới nhất), kèm ảnh ghép bìa và khung hình theo cụm.

Pattern trong bộ não mới hơn mục "Luật thắng" bên dưới. Nếu hai bên khác nhau thì theo bộ não, và nói cho người dùng biết điều gì đã đổi. Nếu bộ não trống thì dùng luật bên dưới.

## Luật thắng của ngách
Nguồn: 41 video nóng K1–K11 được xem bìa và khung hình ngày 25/11/2026 (`docs/brains/images/2026-11-25-visual-mascot-theo-cum.md`).

Format mascot thắng nhất ngách là **mascot "đầu tròn trắng"**. Nó xuất hiện ở 16/41 video, trung vị khoảng 1.100 view/giờ, và ít nhất 9 kênh đối thủ đang dùng. Mascot mới phải **giữ những gì làm nó thắng** nhưng **không được giống nó**.

**Giữ (vì sao thắng):**
1. **Mặt cực giản, đọc được ở cỡ bìa nhỏ:** mắt chấm hoặc vạch cong, miệng nhỏ, không mũi hoặc mũi rất nhỏ, má hồng nhẹ. Biểu cảm phải rõ khi bìa chỉ rộng 160 px.
2. **Không có tuổi cụ thể, gần như không có giới:** người xem 50–70 tự soi mình vào được. Tuổi được gợi bằng **trang phục và phụ kiện** (cardigan len, yukata, khăn choàng, kính tròn), không bằng nếp nhăn.
3. **Thân tỉ lệ người lớn thon, khoảng 3,5–4 đầu**, tay có ngón đơn giản. Nhờ vậy mascot làm được việc đời thường trong cảnh: rót trà, ngủ trong futon, lái xe, ngồi hiên. Mascot chibi 2 đầu tay tròn không cầm nắm được và trông như đồ chơi trẻ con.
4. **Nét vẽ hợp cảnh màu nước:** viền mảnh nâu đậm, tô mềm, có chút sắc độ. Cảnh thắng là tranh màu nước phòng Nhật, ánh vàng chiều hoặc trăng đêm. Mascot tô phẳng kiểu vector trên nền trơn là dạng thua (v8mE1P-3ERs: 9 view/giờ).
5. **Đổi vai bằng quần áo:** thiết kế gốc phải đơn giản để sau này vẽ thêm vợ hoặc chồng, cháu, bạn bằng cách đổi áo, tóc, phụ kiện mà vẫn nhận ra cùng một "loài" nhân vật.
6. **Biểu cảm đủ hai đầu:** dịu (nhắm mắt thư thái, mỉm cười) cho cảnh trong video, và **mạnh** (há miệng cười, đổ mồ hôi, ngạc nhiên tròn mắt) cho bìa. Bìa thắng có mascot chiếm 1/3–1/2 khung với biểu cảm phóng đại.
7. **Phải nằm ngủ được:** format 寝ながら聴く 1–2 giờ dùng một ảnh tĩnh mascot ngủ trong futon cả video mà vẫn 1.000–2.000 view/giờ. Ở các cụm hợp format này (K2, K5, K6, K10, K11), **một trong 5 tư thế phải là nằm ngủ nghiêng, mắt nhắm** (`lying asleep on the side, eyes closed, peaceful`).

**Tránh:**
- **Bất kỳ biến thể "quả cầu trắng má hồng"** (đầu trắng trơn, mắt chấm, má hồng): đã bão hoà, người xem tưởng là kênh khác.
- Các kiểu đã phổ biến khác: đầu tròn màu cam, người que trắng, người 3D đen không mặt (đã có kênh K8 dùng), nhân vật có bản quyền.
- Tô phẳng vector không sắc độ.
- Đường viền đen dày kiểu sticker trẻ em.
- Dấu hiệu tuổi chế giễu: lưng còng quá mức, gậy, răng giả.

**Cách tạo khác biệt mà vẫn giữ luật:** đổi **hình đầu và chất liệu**, giữ mặt giản. Ví dụ:
- đầu hình giọt nước, hạt gạo, viên đá cuội, bánh mochi dẹt, hoặc mặt trăng khuyết;
- da màu (xám đá, be giấy washi, xanh khói, lam chàm nhạt) thay vì trắng trơn;
- một **dấu hình nhận diện** trên đầu, nhìn thấy ngay ở cỡ nhỏ: một sợi tóc xoăn, vệt màu như vân gỗ, chiếc mũ len gắn liền.

Silhouette phải nhận ra được khi tô đen toàn bộ.

**Theo cụm** (chi tiết trong file cụm, mục "Dạng thắng"):
- **K3, K9, phần chuyện đời của K1:** format thắng là 漫画 bán tả thực, không phải mascot. Mascot ở đây chỉ làm người dẫn chuyện hoặc bìa.
- **K4, K8:** tông tối, lạnh. Mascot sáng có viền sáng ("trí thức" đeo kính, mặc vest) nổi trên nền navy hoặc tím.
- **K7:** thắng bằng người thật là chuyên gia; dữ liệu về mascot còn ít.
- **K11:** giữ nhân vật trang nghiêm cho video lời dạy. Riêng format 寝ながら thì được dùng nhân vật dịu, ngủ.

## Thiết kế 3 nhân vật
Đọc phần "Mascot" trong file cụm, rồi thiết kế 3 nhân vật:
- **Theo đủ "Luật thắng" ở trên**, cộng "Dạng thắng" và "Phong cách vẽ" của file cụm.
- **Khác 3 thiết kế đã có** trong file cụm (người dùng cần mascot mới cho kênh mới). Chỉ dùng lại khi người dùng nói rõ muốn bản gốc.
- **Khác nhau rõ** về hình đầu, màu chính và vai (một nhân vật trung tính, một gợi nữ, một gợi nam, hoặc một cặp), để mỗi kênh cùng cụm có mascot riêng.
- **Màu chính tương phản** với "Giao diện thumbnail của cụm" (nền ấm thì mascot màu lạnh và ngược lại). Ghi mã màu kèm tên màu. Màu da hoặc đầu và màu áo phải khác nhau để không thành một khối.
- **Đúng 1 món đồ đặc trưng** gắn với chủ đề cụm (ví dụ kính đẩy lên trán cho cụm não tuổi già). Món đồ phải cầm được trong cảnh đời thường.
- Người xem là người Nhật lớn tuổi: dấu hiệu tuổi tinh tế, không chế giễu tuổi già.
- K11 (video lời dạy): nhân vật trang nghiêm, tỉ lệ người thật, không dễ thương (xem file k11).

**Tự chấm trước khi trả lời.** Mỗi thiết kế phải qua đủ 6 câu; câu nào "không" thì sửa:
1. Nhìn bóng đen có nhận ra không, và có khác quả cầu trắng má hồng không?
2. Mặt có đủ giản để biểu cảm đọc được ở 160 px không?
3. Có rót trà, lái xe, nằm ngủ được với tỉ lệ thân này không?
4. Có đổi áo để thành vợ hoặc chồng, cháu mà vẫn nhận ra không?
5. Màu có nổi trên nền bìa của cụm không?
6. Nét vẽ có hợp với cảnh màu nước hoặc cảnh của cụm không?

## Mẫu prompt (giữ nguyên thứ tự: loại ảnh trước, nhân vật sau)
Điền `{SUBJECT}`, `{EXPRESSIONS}`, `{POSES}`, `{CONCEPT}`, `{DESIGN}`, `{STYLE}`, `{BODY}`:
- `{SUBJECT}`: `ONE character`. Cặp đôi thì dùng `ONE elderly couple (husband and wife always together)`.
- `{EXPRESSIONS}` / `{POSES}` / `{STYLE}`: lấy từ phần Mascot của file cụm. Nếu cụm hợp format 寝ながら, đảm bảo trong 5 tư thế có `lying asleep on the side, eyes closed, peaceful`. Đảm bảo trong 6 biểu cảm có ít nhất một biểu cảm mạnh cho bìa (`big open-mouth laugh`, `wide-eyed surprise with a sweat drop`…).
- `{BODY}`:
  - Mặc định: `a simple distinctive head on a slim adult body about 3.5 to 4 heads tall, simple hands with soft fingers that can hold a teacup, minimal facial features (small eyes, tiny mouth, faint blush) that read clearly at thumbnail size`.
  - K11 (video lời dạy): `realistic adult proportions, dignified and respectful, never chibi or cartoonish`.
  - K3 / K9 khi người dùng muốn nhân vật kiểu 漫画: `semi-realistic Japanese anime proportions about 6 heads tall, gentle wrinkles, warm and dignified, manga-ready`.

```
Character reference sheet (model sheet) of {SUBJECT} for a YouTube mascot, on a PURE WHITE background. This is NOT a scene and NOT an illustration of a story. Layout like a sticker sheet: top-left, 4 full-body turnaround views in a row (front, three-quarter, side, back), standing neutral; top-right, a 3x2 grid of 6 head-only expression close-ups: {EXPRESSIONS}; bottom row, 5 full-body poses: {POSES}. Character: {CONCEPT} {DESIGN} Style: {STYLE} Clean character-sheet look, {BODY}. Same proportions, colors and outfit in every drawing. Only a soft gray oval shadow under the feet. No floor, no room, no furniture, no trees, no sky, no scenery, no props except the signature item, no text, no labels, no numbers, no logo, no watermark, no other characters.
```

- `{CONCEPT}` là một câu: nhân vật là ai, tính cách.
- `{DESIGN}` mô tả cố định: hình đầu và màu da (kèm mã), mắt, dấu hình nhận diện, tóc hoặc mũ, trang phục (kèm mã màu), món đồ đặc trưng, tỉ lệ đầu thân.
- Không viết "white round head" hay "rosy cheeks on a white face": đó là kiểu đã bão hoà.

## Định dạng trả lời
Tiêu đề `{K} mascot — {tên cụm}`, rồi một dòng: format nhân vật nào đang thắng ở cụm này (lấy từ "Dạng thắng" trong file cụm hoặc từ bộ não `images`).

Sau đó, với mỗi nhân vật:

### {số}. {tên nhân vật tiếng Việt}
- Ý tưởng: 1–2 câu tiếng Việt: vì sao hợp cụm, khác mascot đầu tròn trắng ở đâu, màu nổi trên nền nào.
- Tự chấm: 6/6, hoặc ghi câu nào còn yếu.
- Prompt (trong code block để copy):
```
...
```

Cuối cùng, 2–3 dòng nhắc cách dùng:
- Dùng chế độ tạo ảnh trên Flow, tỉ lệ 16:9. Bỏ bản nào có cảnh nền.
- Nếu Flow hay ra cảnh thì đính kèm mascot cũ làm mẫu bố cục và thêm câu đầu `Use the same sheet layout as the reference image, but draw this new character:`.
- Nếu mã màu bị vẽ thành chữ thì xoá mã, giữ tên màu.
- Ở cụm hợp format 寝ながら, gợi ý tạo thêm một ảnh cảnh mascot ngủ trong phòng tatami đêm để làm video 1 giờ.
