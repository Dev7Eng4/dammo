# Kênh mock "静かなお財布の心理" (Money Psych White Figure)

Kênh mock `mock-09`: tâm lý học tiền bạc và lối sống tiết kiệm cho người Nhật 40–65 tuổi. Nhân vật là một người trắng tối giản trên nền tranh ấm giàu chi tiết.

## Thành phần đã thêm

| Thành phần | Vị trí |
|---|---|
| Niche `734a1790-b5e8-45cc-9fce-296a74d64b67` | `server/data/niches.json` |
| Visual style "Money Psych White Figure" | `server/data/visual-styles.json` |
| Flow ảnh **1 bước** (không dùng ảnh tham chiếu) | `server/data/prompts/all/money_psych_scenes/step-1.js` |
| Metadata 2 bước | `server/data/prompts/ja/metadata_money_psych/step-1.js, step-2.js` |
| Kênh mock | `mock-09` trong `youtube-channels.json` + `youtube-channels/mock-09/videos.json` |

## Cấu hình kênh khi tạo mới

- Type **Reup Audio**, language **ja**, video type **Animate Images (AI)**.
- Niche: **Tâm lý học tiền bạc & lối sống tiết kiệm**; Video style: **Money Psych White Figure**.
- **Use reference image: TẮT.** Flow này là 1 bước, nhân vật được giữ nhất quán bằng khối CHARACTER BLOCK chép nguyên văn trong mỗi prompt. Bật reference thì dammo sẽ rơi về flow `all` chung.
- Không cần thư mục `mascots/`.
- Cần ít nhất 1 source channel và 1 mail account (bắt buộc với kênh reup).

## Nhân vật

Một người trắng tối giản kiểu chibi **thấp và mập** (đầu to chiếm gần nửa chiều cao, thân tròn hình quả lê, tay chân ngắn, không má hồng), hai biến thể do LLM chọn một lần cho cả video theo nội dung:
- **female:** đầu tròn trắng, mắt chấm, búi tóc nhỏ, váy dài kem, khăn đỏ cam.
- **male:** không tóc, cardigan kem, khăn đỏ cam.

Chữ ký riêng của kênh là **khăn đỏ cam**, khác với kênh tham khảo. Nhân vật phụ là cùng hình dạng nhưng tô xám ấm, không khăn.

## Title

Công thức chính là **phủ định hiểu lầm** trong ngoặc:
- misconception: `{nhóm người}、実はこんな人です（{ではありません}）`
- series_women: `年を重ねるほど賢い女性が{…}{N}つの{場所/もの/習慣}`
- trait_list: `{nhóm người}の{N}つの共通点（{điều bất ngờ}）`
- habit_psychology: `{thói quen}する人の{N}つの特徴（{lý do}）`

Không dùng nhãn 【】 ở đầu. Title 38–60 ký tự, hook trong 30 ký tự đầu.

## Thumbnail

Toàn khung là một cảnh vàng ấm, nhân vật nhỏ ở trên, một đạo cụ lớn, lớp tối chuyển dần ở 40% dưới, đúng 2 dòng chữ: dòng 1 trắng, dòng 2 vàng `#FFE600`, viền đen dày. Chữ nằm trong 86% chiều rộng bên trái để chừa góc dưới phải (đồng hồ thời lượng). Metadata step 2 xuất thêm 2 cặp chữ thay thế để A/B test.

## Lưu ý

- Chữ Nhật trên thumbnail do AI vẽ nên có thể sai nét; kiểm tra từng ký tự.
- Mẫu title và thumbnail được suy ra từ ảnh chụp một kênh khác. Chưa có số liệu CTR trên kênh của bạn.
- Chưa chạy sinh video thật. Nên thử một transcript ngắn khoảng 5 phút trước.
