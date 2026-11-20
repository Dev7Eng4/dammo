import type { NeuronKind } from '../../types/brains'

export const KIND_LABEL: Record<NeuronKind, string> = {
  topic: 'Chủ đề',
  video: 'Video',
  keyword: 'Từ khoá',
  channel: 'Kênh',
  insight: 'Thấu hiểu',
  idea: 'Ý tưởng',
  title: 'Tiêu đề',
  pattern: 'Công thức',
  brief: 'Brief kịch bản',
  recipe: 'Cấu hình đề xuất',
  schedule: 'Lịch đăng',
  metric: 'Chỉ số',
  action: 'Việc nên làm',
}

export const KIND_COLOR: Record<NeuronKind, string> = {
  topic: '#f59e0b',
  video: '#60a5fa',
  keyword: '#a3e635',
  channel: '#c084fc',
  insight: '#38bdf8',
  idea: '#facc15',
  title: '#ec4899',
  pattern: '#2dd4bf',
  brief: '#22c55e',
  recipe: '#818cf8',
  schedule: '#f97316',
  metric: '#d946ef',
  action: '#fb7185',
}

/** Section headings in a brain's detail panel, in display order. */
export const KIND_SECTION: [NeuronKind, string][] = [
  ['action', 'Việc nên làm'],
  ['schedule', 'Lịch đăng đề xuất'],
  ['brief', 'Brief kịch bản'],
  ['recipe', 'Cấu hình đề xuất'],
  ['metric', 'Chỉ số kênh mình'],
  ['idea', 'Ý tưởng video'],
  ['title', 'Tiêu đề đề xuất'],
  ['topic', 'Chủ đề đang lên'],
  ['insight', 'Thấu hiểu khán giả'],
  ['pattern', 'Công thức đang thắng'],
  ['channel', 'Kênh đáng theo dõi'],
  ['video', 'Video đang nổ'],
  ['keyword', 'Từ khoá đang lên'],
]

export function videoIdOf(key: string): string {
  return key.replace(/^video:/, '')
}
