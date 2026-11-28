---
name: jp-psy-trends
description: Săn xu hướng video YouTube Nhật ngách tâm lý học / khoa học não bộ cho người 50–70 tuổi (人生後半, 脳科学, 人間関係, お金と心理, ひとり時間, ブッダ・禅, 老後の幸せ) — bản skill của bộ não jp-psy-trends trong dammo. Kết quả chính là danh sách video đang nóng, mỗi video được gán cụm K1–K11 và lưu vào bộ nhớ bộ não để hiện trên màn hình Radar video nổ. Dùng khi người dùng hỏi "trend", "xu hướng", "video đang nổ / đang lên", "chủ đề nóng tuần này", "săn trend tâm lý", "tìm video hot", "từ khoá đang lên" cho kênh tâm lý Nhật, hoặc gõ "trends" / "trends K3" / "trends today", kể cả khi không nói rõ là YouTube Nhật.
---

# Săn xu hướng tâm lý Nhật

Skill này và bộ não `jp-psy-trends` của dammo (`server/src/modules/brains/brain-agents.ts`) làm **cùng một việc** và **ghi vào cùng một bộ nhớ**: tìm **video đang nổ** và **chủ đề đang lên** trên YouTube Nhật trong ngách tâm lý cho người 50–70 tuổi, gán mỗi video vào một cụm K1–K11. Khác biệt duy nhất là người chạy: bộ não chạy trong app và cần ANTHROPIC_API_KEY, còn skill do Claude Code chạy.

Kết quả của mỗi lượt được lưu vào bộ nhớ của bộ não (`server/data/brains.json`) bằng lệnh `save`. Từ đó, video hiện ở **màn hình Radar video nổ → tab "Săn xu hướng (K1–K11)"** (`/radar`) và trên bản đồ bộ não (`/brains`), và các bộ não sau (Đối thủ, Ý tưởng…) đọc được. Báo cáo markdown trong `docs/trends/` là bản đọc thêm cho người dùng.

**Đầu ra chính là danh sách video.** Mỗi video phải ghi rõ thuộc cụm nào trong 11 cụm K1–K11 (cụm chính, thêm cụm phụ nếu có). Luật xếp cụm dùng chung với bộ não, xem bằng `npm run -s trends -- clusters` (nguồn: `server/src/modules/brains/psy-clusters.ts`). Chạy lệnh đó trước khi gán cụm.

## Lệnh
- `trends`: quét cả ngách, video trong tuần.
- `trends K1…K11`: tập trung vào một cụm. Đọc `.claude/skills/jp-psy-cluster/references/common.md` và `references/clusters/k{n}.md` để lấy ngách nhỏ và từ khoá của cụm (khoảng 70% số lượt tìm cho cụm đó, phần còn lại cho cả ngách). Danh sách video chỉ giữ video có cụm chính hoặc cụm phụ là K{n}; video của cụm khác gom vào một bảng ngắn "Cụm khác đáng chú ý".
- `trends today` / `trends month`: đổi khung thời gian (mặc định `week`).
- Người dùng đưa từ khoá cụ thể thì xoay quanh từ khoá đó.

## Công cụ dữ liệu
Chạy trong `server/`. Script dùng lại đúng hàm YouTube của bộ não (session Innertube, ngôn ngữ ja, vị trí JP), và cho phép truyền nhiều truy vấn trong một lệnh:

```bash
cd server && npm run -s trends -- search --date week --sort popularity --limit 15 "人生後半 心理学" "脳科学 老後" "人間関係 疲れる 60代"
```
```bash
cd server && npm run -s trends -- suggest "老後 孤独" "定年後 夫婦"
```
```bash
cd server && npm run -s trends -- channel --limit 20 UCxxxxxxxx UCyyyyyyyy
```

- `search`: mỗi dòng có dạng `view/giờ | views | đăng khi nào | thời lượng | videoId | tiêu đề | ch: kênh (channelId)`, đã xếp theo view/giờ. `--date` nhận `today|week|month|year|all`, `--sort` nhận `popularity|relevance`.
- `suggest`: gợi ý tự động của YouTube Nhật, tức là những gì người xem đang gõ.
- `channel`: các video mới của một kênh, kèm **median view/giờ** của kênh và hệ số `xN` so với median. Video có `x5` trở lên là vượt chuẩn của chính kênh đó.
- Video ghi `他 N チャンネル` (video hợp tác) không có channelId, nên bỏ qua khi xét kênh.
- Tín hiệu từ bên ngoài YouTube (tin tức, sách, TV, mạng xã hội Nhật trong tuần): dùng WebSearch với truy vấn tiếng Nhật.
- `search` và `channel` tự nhớ mọi video đã in ra (cache 72 giờ ở `server/data/trend-scan-cache.json`), kể cả hệ số `x` của lệnh `channel`. Lệnh `save` chỉ nhận video có trong cache này, giống như bộ não chỉ lưu video nó đã thật sự lấy về. Vì vậy video phải được `search`/`channel` trước khi lưu, và số liệu lưu đi luôn là số thật.

### Lưu kết quả (bắt buộc ở cuối mỗi lượt)
Ghi file JSON vào scratchpad, rồi chạy:
```bash
cd server && npm run -s trends -- save <đường-dẫn-tuyệt-đối>/findings.json
```
Lệnh gửi vào server đang chạy (`POST /api/v1/brains/jp-psy-trends/import`); nếu server tắt thì ghi thẳng vào `data/brains.json`. Kết quả hiện lên Radar ngay khi tải lại trang. Lệnh in ra số mục đã lưu và mục nào bị bỏ, kèm lý do. Gặp mục bị bỏ thì sửa file rồi chạy `save` lại (lưu trùng chỉ cập nhật, không nhân đôi).

Định dạng file (cùng các trường với công cụ `save_findings` của bộ não):
```json
{
  "summary": "3-6 dòng tóm tắt tiếng Việt, kèm số video theo cụm",
  "items": [
    { "kind": "video", "videoId": "AZvQGM0aTf8", "label": "-", "cluster": "K2", "subCluster": "K11", "format": "寝ながら聴く 1h", "sourceType": "narrated", "heat": 98, "detail": "4.583 view/giờ, x39 kênh; thức giấc giữa đêm → K2" },
    { "kind": "video", "videoId": "a7-rgjpgikE", "label": "-", "cluster": "off", "heat": 40, "detail": "tình cảm nam nữ, ngoài ngách" },
    { "kind": "topic", "key": "sleep-night-waking", "label": "Thức giấc ban đêm", "labelJa": "夜中に目が覚める", "cluster": "K2", "heat": 95, "detail": "bằng chứng…", "links": ["video:AZvQGM0aTf8"] },
    { "kind": "keyword", "label": "Nghe 1 tiếng khi nằm ngủ", "labelJa": "寝ながら聴く1時間", "cluster": "K11", "heat": 90, "detail": "tiêu đề lặp ở 10+ kênh" }
  ]
}
```
- `kind` là `video`, `topic` hoặc `keyword`. Với video, tiêu đề, kênh và số liệu lấy từ cache, nên `label` để gì cũng được.
- `cluster` bắt buộc với video: `K1`…`K11`, thêm `?` khi phân vân (`K4?`), hoặc `off` cho video ngoài ngách. `subCluster` và `format` là tuỳ chọn.
- `sourceType` nên có với mọi video: `narrated`, `manga`, `real-host`, `real-vlog` hoặc `persona` (luật in ở cuối `trends -- clusters`). Nó cho Radar và remake biết kênh mình làm lại được tới đâu: `real-vlog` (người thật quay đời sống thật) và `persona` (nói ngôi thứ nhất như một người nổi tiếng có thật, kiểu 【斎藤一人】) chỉ được mượn chủ đề, Radar gắn nhãn vàng "chỉ lấy chủ đề".
- `heat` từ 0 đến 100. `detail` viết tiếng Việt: vì sao nóng và vì sao xếp cụm này. Đây là dòng lý do hiện trên Radar.
- Topic dùng lại đúng `key` cũ khi cùng chủ đề (xem tab Săn xu hướng hoặc `/brains`), để bộ nhớ cộng dồn thay vì tạo bản mới.

## Quy trình
1. **Đọc lại lần trước.** Đọc bộ nhớ của bộ não (`curl -s localhost:8099/api/v1/radar/trends?days=14` khi server chạy; nếu không thì đọc 1–2 báo cáo mới nhất trong `docs/trends/`) để biết chủ đề nào từng nóng, rồi dùng lại đúng `key` chủ đề cũ cho cùng một chủ đề. Chạy `npm run -s trends -- clusters` để nạp luật cụm.
2. **Dò YouTube.** Chạy 8–15 truy vấn tiếng Nhật, gộp thành 2–3 lệnh `search`. Chủ yếu dùng `week` (hoặc `today`) với `popularity`, và phủ các ngách nhỏ: 人生後半・老後の幸せ, 脳科学・認知症予防, 人間関係・距離感, 家族・夫婦・親子, お金と心理・老後資金, ひとり時間・孤独・内向型, 片付け・手放す, ブッダ・禅・名言, 頭がいい人の特徴, 睡眠・寝ながら聴く. Thấy cụm từ hoặc góc nào lặp lại ở nhiều video nóng (ví dụ format 「〜する人、実は〇〇です」) thì tìm thẳng cụm đó ở vòng sau.
3. **Gợi ý tìm kiếm.** Chạy `suggest` với 4–8 từ gốc hứa hẹn nhất để biết khán giả đang gõ gì.
4. **Tín hiệu ngoài.** Chạy 2–4 lượt WebSearch tiếng Nhật về chuyện người Nhật lớn tuổi đang bàn trong tuần (tin tức, sách bán chạy, TV, chính sách lương hưu…) có thể làm thành video tâm lý.
5. **Kiểm tra kênh nhỏ (không bắt buộc).** Với 2–4 kênh nhỏ có video view/giờ cao, chạy `channel` để biết video đó vượt chuẩn thật hay kênh vốn đã mạnh.
6. **Gán cụm cho từng video** theo luật trong `trends -- clusters`: cụm chính, cụm phụ (nếu có), format, **loại nguồn** (`sourceType`), và vài chữ lý do. Video lệch ngách gán `off` và đưa vào bảng "Ngoài ngách". Không bỏ qua video nào trong danh sách.
7. **Chấm độ nóng.** Chấm theo **view/giờ** và mức **lặp lại giữa nhiều kênh**, không theo tổng view của video cũ. Kênh nhỏ mà view/giờ cao (hoặc `x` lớn) là tín hiệu mạnh. Heat 0–100: khoảng 80+ là đang nổ rõ trên nhiều kênh, 50–79 là đang lên, dưới 50 là tín hiệu yếu hoặc đang nguội.
7b. **Cổng remake (nên làm / có thể làm / không nên làm).** App tự chấm lại mỗi video khi lưu, bằng đúng luật trong `server/src/modules/radar/remake-gates.ts`, và video "Không nên làm" **không vào hàng chờ remake tự động**. Vì vậy cũng chấm theo luật đó trong báo cáo:
   - **Không nên làm** khi có một trong các điều sau: dài ngoài **10–35 phút**; `off` (lạc ngách); view thật dưới sàn theo tuổi (15.000 × đường cong tuổi, ví dụ khoảng 3.400 view ở 22h, 5.700 ở 48h, 9.750 ở 7 ngày).
   - **Nên làm** khi qua hết cổng, nổ mạnh (`x kênh` ≥ 8, hoặc chưa đo `x` thì heat ≥ 80), đăng **≤ 72 giờ**, và không có điểm nghi ngờ.
   - **Có thể làm** cho các trường hợp còn lại: quá 72h, nổ yếu (x 3–8), cụm phân vân `?`, `real-vlog` / `persona` (chỉ mượn chủ đề), chưa rõ độ dài.
   Ưu tiên tìm video 10–35 phút. Video ngoài khuôn vẫn được lưu làm bằng chứng chủ đề, nhưng không đề xuất remake.
8. **Lưu vào bộ nhớ bộ não** bằng `save` (xem phần Lưu kết quả): 20–40 video, 5–12 topic, 5–15 keyword. Đọc kết quả lệnh; mục nào bị bỏ thì sửa rồi lưu lại.
9. **Viết báo cáo** theo mẫu dưới, lưu vào `docs/trends/YYYY-MM-DD[-k{n}].md`, rồi trả lời trong chat bằng bản tóm tắt, kèm số mục đã lưu và nhắc rằng kết quả đã có ở `/radar` (tab Săn xu hướng).

## Mẫu báo cáo
```markdown
# Xu hướng tâm lý Nhật — YYYY-MM-DD (phạm vi: cả ngách | K{n}, khung: week)

## Tóm tắt
3–6 dòng tiếng Việt: điều quan trọng nhất, cái gì mới, cái gì vẫn lên, cái gì nguội so với lần trước.

## Danh sách video (20–40, xếp theo heat)
| # | Nên làm? | Heat | View/giờ | x kênh | Phút | Video | Kênh | Cụm | Cụm phụ | Format | Nguồn | Vì sao xếp cụm này |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Nên làm | 95 | 2.433 | x20 | 18 | [tiêu đề](https://www.youtube.com/watch?v=ID) | tên kênh | K2 Não tuổi già | K11 | 解説 | narrated | lo âu ban đêm, không ngủ được |

- `Nên làm?`: Nên làm / Có thể làm / Không nên làm theo bước 7b; với "Không nên làm" ghi lý do ngắn trong cột cuối (ví dụ "dài 58 phút").
- `x kênh`: hệ số so với median view/giờ của kênh (từ lệnh `channel`). Kênh chưa kiểm tra thì ghi `?`.
- `Cụm`: mã cụm kèm tên ngắn. Phân vân thì thêm `?` (ví dụ `K1?`).
- `Nguồn`: `sourceType`. Video `real-vlog` / `persona` ghi thêm "(chỉ chủ đề)".
- Lấy cả video đứng đầu ở mỗi ngách nhỏ, không chỉ top toàn ngách, để cụm nào cũng có mặt nếu có dữ liệu.

### Theo cụm
| Cụm | Số video | View/giờ cao nhất | Video mạnh nhất (#) | Nhận xét một dòng |
|---|---|---|---|---|
| K1 Hạnh phúc tuổi già | … | … | #… | … |
(đủ 11 dòng K1–K11; cụm không có video ghi 0 và "chưa thấy tín hiệu")

### Ngoài ngách
| View/giờ | Video | Kênh | Vì sao loại |

## Chủ đề đang lên (5–12)
| key | Chủ đề (VI) | 日本語 | Cụm | Heat | Trạng thái | Vì sao đang lên (bằng chứng) |
|---|---|---|---|---|---|---|
| parking-far | Người cố đỗ xe xa | わざと遠くに停める人 | K1 | 85 | mới | 257 view/giờ trên kênh 94 sub (x51), … — video: GYfYmaR4qGc |

Trạng thái: mới / vẫn lên / nguội (so với báo cáo trước; lần đầu thì ghi "mới").

## Từ khoá đang lên (5–15)
| 日本語 | Nghĩa | Heat | Nguồn (suggest / tiêu đề lặp / web) |

## Công thức tiêu đề đang thắng
2–4 gạch đầu dòng: cấu trúc lặp lại (【】, 「〜な人、実は〇〇です」, con số, đối tượng 60代/70代…), mỗi cái kèm 1–2 ví dụ videoId.

## Gợi ý cho kênh mình
3–5 góc video nên làm ngay, ghi cụm K phù hợp. Chỉ lấy từ video "Nên làm" hoặc "Có thể làm" (dài 10–35 phút). Video `real-vlog` / `persona` chỉ là bằng chứng chủ đề đang nóng: không đề xuất làm theo dạng của nó (quay thật, nhập vai người nổi tiếng), vì kênh mình là thuyết minh + minh hoạ. Người dùng có thể chuyển tiếp sang skill `jp-psy-cluster` (`K{n} video <title>`).
```

## Luật
- **Không bịa** videoId, channelId, số view, view/giờ, trích dẫn hay nghiên cứu. Chỉ dùng số mà script hoặc WebSearch trả về. Thiếu số thì ghi `?`.
- Nhãn và giải thích viết bằng tiếng Việt. Giữ nguyên cụm từ tiếng Nhật ở cột 日本語 và trong tiêu đề video.
- Chỉ giữ chủ đề thuộc ngách (tâm lý, não bộ, quan hệ, tiền và tâm lý, sống một mình, lời dạy Phật giáo/Thiền, tuổi già). Bỏ video giải trí hoặc tin tức thuần không có góc tâm lý.
- Khi script lỗi (YouTube đổi giao diện, mạng), báo rõ truy vấn nào lỗi và vẫn làm tiếp với dữ liệu còn lại. Không đoán số để lấp chỗ trống.
- Báo cáo trong chat ngắn gọn: phần tóm tắt, top 10 video (có cột Cụm), bảng theo cụm rút gọn (chỉ các cụm có video), số mục đã lưu vào bộ não, đường dẫn file báo cáo đầy đủ.
- Khi đổi luật cụm hay cách làm của skill, sửa cả prompt bộ não (`brain-agents.ts`, mục `trend`) và `psy-clusters.ts` để hai bên vẫn giống nhau.
