/**
 * The 11 content clusters (K1–K11) of the Japanese psychology niche, and the rules for tagging a video with one.
 * Single source for the jp-psy-trends brain prompt, the `npm run trends -- clusters` command used by the
 * jp-psy-trends Claude Code skill, and validation of saved findings. Cluster details (audience, sub-niches):
 * .claude/skills/jp-psy-cluster/references/clusters/k{n}.md
 */
export const PSY_CLUSTERS = [
  { id: 'K1', name: 'Hạnh phúc tuổi già' },
  { id: 'K2', name: 'Não tuổi già' },
  { id: 'K3', name: 'Tiền tuổi già' },
  { id: 'K4', name: 'Người thông minh' },
  { id: 'K5', name: 'Tài năng bị ẩn' },
  { id: 'K6', name: 'Tâm lý người giàu' },
  { id: 'K7', name: 'Dọn dẹp và buông bỏ' },
  { id: 'K8', name: 'Ranh giới quan hệ' },
  { id: 'K9', name: 'Gia đình' },
  { id: 'K10', name: 'Một mình, hướng nội' },
  { id: 'K11', name: 'Lời dạy chữa lành' },
] as const;

export type PsyClusterId = (typeof PSY_CLUSTERS)[number]['id'];

/** Marks a video outside the niche (still worth listing as a market signal). */
export const OFF_NICHE = 'off';

export interface ClusterTag {
  id: PsyClusterId | typeof OFF_NICHE;
  unsure: boolean;
}

/** "K2", "k2", "K2?" (unsure) → { id: 'K2', unsure }; "off" / "—" / "-" → OFF_NICHE. Anything else → null. */
export function parseClusterTag(raw: string | undefined): ClusterTag | null {
  const text = raw?.trim();
  if (!text) return null;
  if (/^(off|—|-|ngoài ngách)$/i.test(text)) return { id: OFF_NICHE, unsure: false };
  const match = /^k(\d{1,2})(\?)?$/i.exec(text);
  if (!match) return null;
  const id = `K${Number(match[1])}`;
  const cluster = PSY_CLUSTERS.find(c => c.id === id);
  return cluster ? { id: cluster.id, unsure: Boolean(match[2]) } : null;
}

export function clusterName(id: string): string {
  return PSY_CLUSTERS.find(c => c.id === id)?.name ?? id;
}

export const CLUSTER_RULES = `# Xếp video vào cụm K1–K11

Mỗi video được gán **1 cụm chính** và có thể thêm **1 cụm phụ** khi video rõ ràng chạm sang cụm khác. Xếp theo **chủ đề của nội dung**, không theo format. Format (寝ながら聴く, 実は〇〇です, 漫画, 名言朗読, 脳トレ…) ghi ở một trường riêng.

## Dấu hiệu nhận ra từng cụm
| Cụm | Tên | Dấu hiệu trong tiêu đề / chủ đề |
|---|---|---|
| K1 | Hạnh phúc tuổi già | 60代/70代 + 幸せ・品がある・格が違う・口癖・習慣・精神年齢・年を重ねる・人生後半の生き方・定年後の暮らし; 60代女性 + 運・習慣; người già "sống đẹp" |
| K2 | Não tuổi già | 脳・脳科学 + tuổi già, 物忘れ・記憶力・認知症予防・ボケ防止・脳トレ・間違い探し; giấc ngủ và cơ thể ban đêm (夜中に目が覚める・眠りが浅い・夜中のトイレ), スマホと脳 |
| K3 | Tiền tuổi già | 年金・老後資金・退職金・貯金・隠れ貧困・年金いくら・生活費・引退か働くか (góc tiền) |
| K4 | Người thông minh | IQ・頭がいい人・地頭・賢い人の考え方・知性・思考のクセ・認知バイアス; hành vi đời thường lộ trí tuệ |
| K5 | Tài năng bị ẩn | 才能・隠れた才能・天才・過小評価・本当は優秀・内向型の強み (nhấn vào năng lực) |
| K6 | Tâm lý người giàu | お金持ち・資産・物欲がない人・お金に愛される・お金の使い方 (góc người giàu / tâm lý chi tiêu, không phải lo lương hưu) |
| K7 | Dọn dẹp và buông bỏ | 片付け・捨てる・物を減らす・生前整理・散らかった部屋・ミニマリスト (đồ vật cụ thể) |
| K8 | Ranh giới quan hệ | 縁を切る・離れる・距離を置く・関わらない・嫌な人・マウント・危険な人・連絡を断つ・いい人をやめる |
| K9 | Gia đình | 子ども・孫・親・嫁姑・帰省・夫婦・定年後の夫/妻・同居・実家 |
| K10 | Một mình, hướng nội | 一人・ひとり時間・孤独・友達が少ない・群れない・内向型・HSP・おひとりさま・一人旅・一人外食 |
| K11 | Lời dạy chữa lành | ブッダ・仏教・禅・お釈迦様・執着を手放す・諸行無常・名言・偉人の言葉 (五木寛之, 瀬戸内寂聴, 斎藤一人, 中村天風, 佐藤愛子…) + mục đích làm lòng nhẹ; 寝ながら聴く kiểu xoa dịu lo âu, tự trách |

## Luật khi có nhiều cụm cùng khớp
1. Chủ thể "賢い人" + hành động quan hệ (rời đi, cắt đứt, giữ khoảng cách) → K8, phụ K4. Chỉ xếp K4 khi chủ đề là trí tuệ hay cách nghĩ.
2. Người xấu / khó chịu trong gia đình (親 độc hại, 嫁姑 căng thẳng, giữ khoảng cách với con) → K8, phụ K9. Mong được con cháu quý → K9.
3. Một mình: nhấn sự bình yên, ổn khi một mình → K10; nhấn tài năng, sức mạnh ẩn của người một mình → K5, phụ K10.
4. Tiền: lo đủ sống, lương hưu → K3; tò mò người giàu sống thế nào → K6.
5. Buông bỏ: đồ vật → K7; chấp niệm tinh thần qua lời Phật, danh ngôn → K11; buông bỏ để sống vui tuổi già, không dựa vào lời dạy → K1.
6. Danh ngôn/偉人 + 老後の幸せ: chủ đề là sống hạnh phúc khi già → K1, phụ K11; chủ đề là an ủi, gỡ lo âu → K11.
7. Giấc ngủ: chuyện cơ thể, não ban đêm (thức giấc lúc 3 giờ, đi vệ sinh đêm) → K2. Format 寝ながら聴く để xoa dịu cảm xúc thì xếp theo cảm xúc chính: lo già → K1, mệt vì người khác → K8 hoặc K10, tự trách và lo âu → K11.
8. Nghỉ hưu 60 hay 65: góc tiền → K3; góc tâm lý buông chấp niệm, sống sau nghỉ hưu → K1.
9. Hành vi đời thường "実は〇〇です": xếp theo hành vi. Một mình → K10; lộ trí tuệ → K4; tuổi già → K1; giấc ngủ → K2.
10. Vẫn phân vân thì chọn cụm có khán giả và động lực bấm xem khớp nhất, và thêm "?" sau mã cụm (ví dụ "K1?").

## Ngoài ngách
Gán cụm "off" khi video là: tình cảm nam nữ hay tán tỉnh (恋愛, dark psychology), khoa học hay tiến hoá cho khán giả chung, tin tức thuần không có góc tâm lý, mẹo sức khoẻ hay ăn uống không có góc tâm lý hoặc não bộ, giải trí. Vẫn lưu nếu view/giờ cao, vì đó là tín hiệu thị trường.`;
