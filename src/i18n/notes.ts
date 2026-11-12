export const noteLabels = {
  zh: {
    types: {
      note: '笔记',
      snippet: '片段',
      draft: '草稿',
      idea: '想法',
      research: '研究',
      reference: '参考'
    } as Record<string, string>,
    statuses: {
      'in-progress': '进行中',
      incomplete: '待补充',
      ready: '已整理',
      archived: '已归档'
    } as Record<string, string>
  },
  en: {
    types: {
      note: 'Note',
      snippet: 'Snippet',
      draft: 'Draft',
      idea: 'Idea',
      research: 'Research',
      reference: 'Reference'
    } as Record<string, string>,
    statuses: {
      'in-progress': 'In progress',
      incomplete: 'Needs more',
      ready: 'Settled',
      archived: 'Archived'
    } as Record<string, string>
  }
}
