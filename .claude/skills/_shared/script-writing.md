# Viết kịch bản: phần chung của `jp-psy-script-remake`, `jp-psy-script-niche` và `jp-psy-cluster` `K{n} video <title>`

Ba lối vào chỉ khác cách **tìm ra chủ đề và chất liệu** (link video nguồn, mã cụm, hay title có sẵn). Từ lúc có chủ đề, cả ba làm theo file này. Đầu ra là **kịch bản lời đọc tiếng Nhật hoàn chỉnh**, không phải brief.

## CLI (chạy trong `server/`)

```bash
npm run -s script -- source <link | videoId>...          # thông tin + transcript sạch, giữ lại để đối chiếu
npm run -s script -- list --cluster K3                   # kịch bản đã viết (docs/scripts và trong các kênh)
npm run -s script -- check <script.txt> --minutes 18 --source <videoId> --source <videoId>
npm run -s script -- check <script.txt> --part --source <videoId>      # khi mới viết được vài chương
npm run -s script -- check <script.txt> --source <videoId> --save      # ghi check.json (app chỉ dùng kịch bản viết sẵn có check ĐẠT)
npm run -s script -- queue --json --limit 3                            # video nguồn sắp làm của kênh Remake + trạng thái kịch bản viết sẵn
npm run -s script -- readings <script.txt>                             # số, tên riêng, chữ Latin, chữ hai cách đọc + VOICEVOX đọc ra sao
npm run -s script -- dict add <chữ> <カタカナ> --note "…"              # từ điển cách đọc của giọng (dùng chung mọi video); dict / dict rm <chữ>
```

`check` dùng đúng bộ luật của luồng remake trong app: độ dài, lỗi từng chương, độ giống nguồn (8-gram ≤ 5%, 15-gram ≤ 0,5%), cộng thêm ký hiệu khó đọc, title chép nguồn, và trùng với kịch bản mình đã có. Kịch bản **phải "ĐẠT"** mới giao.

Các công cụ nghiên cứu dùng lại của skill khác: `npm run -s trends -- search|suggest|channel`, `npm run -s brain -- call audience video_comments '{"videoId":"…","limit":60}'`, `npm run -s brain -- call script read_memory '{"brainId":"…"}'`, `npm run -s brain -- productions`, và WebSearch của Claude Code.

## 1. Chuẩn phải theo
- **Luật viết:** `server/data/prompts/ja/remake_script/step-1.js` (dàn ý) và `step-2.js` (từng chương). Riêng K11 dùng `remake_k11/`. Đọc cả hai file trước khi lập dàn ý; đây là chuẩn app đang dùng, khi khác file này thì theo prompt.
- **Cụm:** `.claude/skills/jp-psy-cluster/references/clusters/k{n}.md` (khán giả, ngách nhỏ, mục Tránh, câu hỏi kéo bình luận) và `server/data/prompts/ja/metadata_tlnb_k{n}/step-1.js` (format, luật title). Khi hai nơi khác nhau, theo prompt meta.

## 2. Chất liệu thật
- Nghiên cứu: chỉ dùng khi đã **xác minh bằng WebSearch** (tên nhà nghiên cứu, nơi, năm, cách làm, kết quả), có ít nhất một nguồn đáng tin (bài báo, trường, sách, báo lớn). Ghi URL vào `research.md`. Không xác minh được thì dùng tình huống đời thường, không viết 「ある大学の研究」.
- Không nói quá kết quả: tương quan không viết thành nhân quả; không 「証明された」「劇的に」. Không chẩn đoán, không hứa chữa khỏi hay làm giàu.
- Điều một video nguồn nói về nghiên cứu **không phải là nguồn**. Phải kiểm tra lại.
- Nhân vật là hư cấu, tên thường gặp (田中さん, 佐藤さん), không 〇〇さん. Không gán câu nói cho người thật.

## 3. Dàn ý
Ghi vào `research.md`:
- **Điều mọi video đều nói** và **điều mình nói khác hay sâu hơn** (một câu mỗi bên). Không nêu được vế sau thì chưa viết.
- Title tạm, góc, hook 30 giây, nhân vật xuyên suốt (tên, tuổi, vấn đề đầu video → thử gì → đổi gì ở cuối).
- 5–9 chương. Mỗi chương: tiêu đề, **một** điều rút ra (không chương nào trùng), cảnh cụ thể, kỹ thuật kèm câu nói mẫu hoặc nghiên cứu, câu nối sang chương sau.
- Số phút 12–30, tính từ chất liệu: khoảng 300 ký tự/phút (đo trên giọng VOICEVOX của app), mỗi chương 1,5–4,5 phút. Chất liệu mỏng thì ngắn lại, không kéo.

Tự soát: không hai chương cùng kết luận hay cùng kỹ thuật; title có con số thì số chương mang mục đúng bằng số đó; chương nào cũng phục vụ lời hứa của title; câu nối đúng với chương sau.

## 4. Viết
Ghi vào `script.txt`, đúng định dạng ô Kịch bản của app:
```
# title

## 1. tiêu đề chương
Mỗi dòng một câu.

## 2. …
```
- です・ます, gọi 「あなた」, câu khoảng 40 ký tự, tối đa 70. Viết để **đọc thành tiếng**: không ngoặc đơn, ký hiệu, chữ Latin; tên nước ngoài viết katakana; năm viết 二〇一〇年.
- Câu đầu là một cảnh người xem nhận ra mình, không chào hỏi. Trong 30 giây hứa người xem sẽ biết gì. Tiêu đề chương không được đọc lên.
- Mỗi chương vào theo một kiểu khác (cảnh, lời thoại, con số, câu hỏi, sự thật). Không khuôn 「それではここから」「次の章では」.
- Viết **từng chương một**, sau mỗi 2 chương chạy `check --part` và sửa ngay. Không viết hết rồi mới kiểm.
- Không dịch từ tiếng Việt; nghĩ và viết thẳng bằng tiếng Nhật.

### Lời mời đăng ký và bình luận: không dồn hết vào cuối
Người xem kênh mình thường rời ở khoảng 30% video, nên lời mời chỉ đặt ở cuối thì hầu như không ai nghe. Video vượt chuẩn của ngách (phân tích 23 video, 2026-11-24) đặt lời mời như sau; prompt `step-2.js` của app cũng theo đúng cách này (từ 3 chương trở lên):
- **Cuối chương 1**, sau điều đáng giá đầu tiên, ngay trước câu nối sang chương 2 (khoảng 10–25% video): **một** câu mời đăng ký nhẹ. Câu này nói đăng ký giúp gì cho người xem, gắn với nội dung video, ví dụ 「ここまでで思い当たることがあった方は、よければチャンネル登録をして、また続きを聞きに来てください」. Viết bằng lời của mình, đừng chép câu mẫu. Không đặt trong 30 giây đầu.
- **Nửa đầu chương giữa** (chương `floor(n/2)+1`, khoảng 40–65% video): **một** câu hỏi bình luận trả lời được bằng một từ hoặc một con số, bám nội dung chương, kèm câu giảm áp lực 「読むだけでも大丈夫です」. Chương này không mời đăng ký.
- **Cuối video:** hỏi bình luận bằng một câu **khác** câu ở giữa, kèm lời mời đăng ký ngắn.
- Không xin bấm thích hay bật chuông ở đâu cả. Không mời quá ba lần trong cả video.

## 5. Soát lần cuối
1. `check` đầy đủ với mọi nguồn đã dùng tới khi **ĐẠT**. Đừng lách luật (thêm câu thừa cho đủ ký tự, đổi vài chữ để qua độ giống).
2. Đọc lại từ đầu như người xem 60 tuổi: chỗ nào muốn tắt, chỗ nào chung chung, chỗ nào hứa mà chưa trả.
3. Đối chiếu từng con số, tên, năm với `research.md`.
4. `script readings <script.txt>` (cần VOICEVOX đang mở; chưa mở thì ghi "chưa kiểm cách đọc" vào `research.md`). Đọc dòng `→ カタカナ` của từng từ:
   - Chữ hai cách đọc (行った là いった hay おこなった): sửa **kịch bản** cho rõ, ví dụ viết おこなった bằng hiragana.
   - Tên nhân vật đọc sai (誠 → せい thay vì まこと): đổi sang tên VOICEVOX đọc đúng, đừng thêm vào từ điển (tên nhân vật đổi theo từng video).
   - Danh từ riêng chỉ có một cách đọc (ねぶた祭 → ネブタマツリ, tên nhà nghiên cứu, địa danh): `dict add`. Từ điển chỉ đổi tiếng đọc, kịch bản và phụ đề giữ nguyên chữ.
   - Sửa kịch bản thì chạy lại `check`.
5. Đếm lại số mục trong title. Kết bài không đưa kết luận mới, có câu hỏi mời bình luận của cụm và lời mời đăng ký ngắn. Có đủ lời mời giữa video theo mục 4 (`check` in `⚠ lời mời` khi thiếu hoặc đặt sai chỗ).

## 6. Lưu
Thư mục `docs/scripts/<k>/<YYYY-MM-DD>-<slug>/` (riêng `remake auto` lưu vào `remake-ready/` của kênh, xem skill remake) (k viết thường; nội dung ngoài cụm thì `off`):
- `script.txt`: kịch bản.
- `research.md`: bằng chứng chọn chủ đề, điều mọi người nói và điều mình nói khác, nguồn có URL, dàn ý, kết quả `check`.
- `meta.json`: `{"title","cluster","topic","topicKey","mode":"remake|niche|title","sources":["videoId"],"minutes","date","channelId"}`. `topicKey` là slug ngắn ổn định; `list` dùng nó để tránh làm trùng.

Rồi lưu vào bộ nhớ bộ não `script`: `npm run -s brain -- save script <file>` với một nơ-ron `brief`: `key` = `<topicKey>-brief`, `label` (VI), `labelJa` = title, `detail` (400 ký tự đầu quan trọng nhất): `Kịch bản: <đường dẫn> · Kênh: … · Móc: … · Khác biệt: … · Độ dài: … phút`, `cluster`, `heat` = điểm chọn chủ đề, `links` tới `topic:`, `insight:`, `idea:` đã dùng. Chỉ `links` tới `video:<id>` đã có trong bộ nhớ.

## 7. Trả lời
Ngắn: title, cụm, vì sao chủ đề này (số liệu), góc khác biệt, số chương, số phút, kết quả kiểm tra, link `script.txt` và `research.md`. Không dán lại cả kịch bản.

Nói cách dùng: dán `script.txt` vào ô Kịch bản của video kênh Remake hoặc dự án thủ công. Bước sau: `jp-psy-ctr` (`ctr idea <topicKey>` cho cặp title và bìa), `jp-psy-voice`, `jp-psy-images`. Không tự đưa vào kênh hay tạo video khi người dùng chưa yêu cầu.
