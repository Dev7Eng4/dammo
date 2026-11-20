import type { BrainDefinition } from './brains.types.js';

export const TREND_BRAIN_ID = 'jp-psy-trends';

/**
 * Every brain on the map. Only `active` brains can run; a brain with `active: false` is a planned
 * department, shown dimmed until its agent is built.
 * `feeds` lists the brains whose memory this brain reads (drawn as links on the map).
 */
export const BRAIN_DEFINITIONS: BrainDefinition[] = [
  {
    id: TREND_BRAIN_ID,
    name: 'Săn xu hướng tâm lý Nhật',
    department: 'Chọn content',
    color: '#f59e0b',
    description:
      'Quét YouTube Nhật + web để tìm chủ đề đang lên và video đang nổ về tâm lý học / khoa học não bộ (人生後半, 人間関係, 脳科学, ブッダの教え…). Mỗi lần chạy tạo nơ-ron chủ đề, video và từ khoá kèm điểm nóng.',
    active: true,
    feeds: [],
  },
  {
    id: 'competitors',
    name: 'Đối thủ',
    department: 'Phân tích',
    color: '#c084fc',
    description:
      'Theo dõi các kênh cùng ngách (kênh nguồn tiếng Nhật + kênh đứng sau video nóng). So từng video với mức view/giờ trung vị của chính kênh đó để bắt video "vượt chuẩn", kênh đang tăng tốc và công thức họ đang lặp lại.',
    active: true,
    feeds: [TREND_BRAIN_ID],
  },
  {
    id: 'audience',
    name: 'Tiếng nói khán giả',
    department: 'Phân tích',
    color: '#38bdf8',
    description:
      'Đọc bình luận của các video đang nổ để tìm nỗi đau, câu hỏi chưa được trả lời, tranh cãi và đúng những từ người xem 50-70 tuổi dùng. Đây là nguyên liệu cho góc nhìn và lời mở đầu video.',
    active: true,
    feeds: [TREND_BRAIN_ID, 'competitors'],
  },
  {
    id: 'ideas',
    name: 'Ý tưởng video',
    department: 'Chọn content',
    color: '#facc15',
    description:
      'Gộp chủ đề nóng, video vượt chuẩn của đối thủ và nỗi đau khán giả thành ý tưởng video cụ thể cho từng kênh của mình: tiêu đề Nhật, góc khác biệt, lời hứa, vì sao là bây giờ, mức độ bão hoà.',
    active: true,
    feeds: [TREND_BRAIN_ID, 'competitors', 'audience'],
  },
  {
    id: 'title-seo',
    name: 'Tiêu đề / SEO',
    department: 'Sản xuất',
    color: '#ec4899',
    description:
      'Bóc công thức tiêu đề của video đang thắng (độ dài, 【】, con số, đối tượng, lời hứa), kiểm tra từ khoá bằng gợi ý YouTube, rồi viết 3 phương án tiêu đề + tag cho các ý tưởng nóng nhất.',
    active: true,
    feeds: [TREND_BRAIN_ID, 'ideas'],
  },
  {
    id: 'thumbnail',
    name: 'Bìa',
    department: 'Sản xuất',
    color: '#14b8a6',
    description:
      'Nhìn thumbnail của video nóng và video vượt chuẩn (thị giác máy), tìm mẫu đang thắng: bố cục, màu, chữ, nhân vật/mascot, biểu cảm — và chỉ ra điều video ít view làm khác.',
    active: true,
    feeds: [TREND_BRAIN_ID, 'competitors'],
  },
  {
    id: 'script',
    name: 'Kịch bản',
    department: 'Sản xuất',
    color: '#22c55e',
    description:
      'Biến ý tưởng nóng nhất thành brief kịch bản làm được ngay: câu hỏi trung tâm, lời mở đầu tiếng Nhật, sợi dây xuyên suốt, dàn chương, điểm khác biệt và link video nguồn để đưa cho Agent tạo video. Đối chiếu video kênh đã làm để không lặp góc nhìn.',
    active: true,
    feeds: ['ideas', 'audience', 'title-seo'],
  },
  {
    id: 'voice',
    name: 'Giọng đọc',
    department: 'Sản xuất',
    color: '#eab308',
    description:
      'Chọn giọng VOICEVOX và tốc độ đọc cho từng kênh từ số đo thật của các video đã làm (ký tự/phút, lệch so với thời lượng mục tiêu) và từ điều người xem lớn tuổi nói về giọng đọc trong bình luận.',
    active: true,
    feeds: ['script', 'audience'],
  },
  {
    id: 'images',
    name: 'Ảnh / clip',
    department: 'Sản xuất',
    color: '#3b82f6',
    description:
      'Nhìn vào bên trong video đang thắng (3 khung hình giữa video): minh hoạ hay ảnh thật, nhân vật, bảng màu, chữ trên màn hình — rồi chỉ hướng phong cách hình và prompt cảnh mẫu cho từng kênh.',
    active: true,
    feeds: [TREND_BRAIN_ID, 'competitors', 'script'],
  },
  {
    id: 'editing',
    name: 'Dựng video',
    department: 'Sản xuất',
    color: '#a855f7',
    description:
      'So thời lượng, nhịp cảnh, kiểu phụ đề và lớp phủ của video đang thắng với cấu hình dựng của mình, rồi đề xuất độ dài mục tiêu, số giây mỗi cảnh, kiểu phụ đề và lớp phủ nên bật/tắt cho từng kênh.',
    active: true,
    feeds: ['voice', 'images', 'competitors'],
  },
  {
    id: 'publish',
    name: 'Đăng video',
    department: 'Phát hành',
    color: '#f97316',
    description:
      'Lập lịch đăng 7 ngày tới: video nào xong thì lên khung giờ nào, video trúng chủ đề nóng được chen lên trước, kênh nào sắp hết video. Học nhịp đăng của đối thủ. Chỉ lập lịch — việc tải lên vẫn do bạn hoặc mô-đun upload làm.',
    active: true,
    feeds: ['editing', 'title-seo', 'thumbnail'],
  },
  {
    id: 'studio',
    name: 'Chỉ số kênh',
    department: 'Phân tích',
    color: '#d946ef',
    description:
      'Đo kênh và video của chính mình bằng số công khai (view, view/giờ, like, bình luận, sub): mức nền, xu hướng, video thắng/thua và lý do. CTR, retention, doanh thu chỉ có trong YouTube Studio nên não này không đọc được — nó chỉ ra số nào cần bạn vào Studio xem.',
    active: true,
    feeds: ['publish', TREND_BRAIN_ID, 'competitors'],
  },
  {
    id: 'growth',
    name: 'Tăng trưởng',
    department: 'Phân tích',
    color: '#fb7185',
    description:
      'Gộp mọi thứ cả mạng lưới biết thành 6-12 việc nên làm trong 2 tuần tới: nhân đôi thứ đang thắng, kéo chéo giữa các kênh, lấp khoảng trống ngách, kênh nên dừng hay đổi hướng, rủi ro nội dung lặp.',
    active: true,
    feeds: ['studio', 'ideas', 'publish'],
  },
];

/** Order the "run the whole chain" button follows: each brain reads the ones before it. */
export const PIPELINE_ORDER = [
  TREND_BRAIN_ID,
  'competitors',
  'audience',
  'ideas',
  'title-seo',
  'thumbnail',
  'script',
  'voice',
  'images',
  'editing',
  'publish',
  'studio',
  'growth',
];

export function findBrainDefinition(id: string): BrainDefinition | undefined {
  return BRAIN_DEFINITIONS.find(brain => brain.id === id);
}
