/** SEO-only copy. Visible headings and article metadata remain owned by their pages. */
const sections: Record<string, [string, string, string, string]> = {
  '/': [
    '首页',
    'Jayluo blog：记录博客、笔记与项目。',
    'Home',
    'A personal site for blog posts, notes, and projects.'
  ],
  '/about': [
    '关于我',
    '了解站点的作者：个人介绍、关注的方向，以及这个站点是怎么组织的。',
    'About',
    'Meet the author: background, current interests, and how this site is organized.'
  ],
  '/contact': [
    '联系我',
    '通过邮件或社交平台联系站点作者。',
    'Contact',
    'Reach the author by email or social platforms.'
  ],
  '/projects': [
    '项目',
    '按状态浏览正在做、暂停和已归档的项目，查看技术栈与代码链接。',
    'Projects',
    'Browse active, paused, and archived projects, with stacks and code links.'
  ],
  '/tags': [
    '博客标签',
    '按主题浏览博客文章。',
    'Blog tags',
    'Browse blog posts by topic.'
  ],
  '/notes/tags': [
    '笔记标签',
    '按标签查找学习笔记、代码片段与研究记录。',
    'Note tags',
    'Find learning notes, code snippets, and research records by tag.'
  ]
}

export function sectionMetadata(pathname: string) {
  const en = /^\/en(?:\/|$)/.test(pathname)
  const bare = (en ? pathname.slice(3) : pathname).replace(/\/$/, '') || '/'
  const copy = sections[bare]
  return copy ? { title: copy[en ? 2 : 0], description: copy[en ? 3 : 1] } : undefined
}

export function listingMetadata(
  kind: 'blog' | 'notes' | 'lab',
  en: boolean,
  page: number,
  titles: string[],
  tag?: string | number
) {
  const name = en
    ? { blog: 'Blog', notes: 'Notes', lab: 'Lab' }[kind]
    : { blog: '博客', notes: '笔记', lab: '实验室' }[kind]
  const subject = tag ? (en ? `${name} tagged “${tag}”` : `${name} · ${tag} 标签`) : name
  const suffix = en ? `Page ${page}` : `第 ${page} 页`
  const examples = titles.slice(0, 3).join(en ? '; ' : '；')
  return {
    title: `${subject} · ${suffix}`,
    description: en
      ? `${subject}, page ${page}. ${examples ? `On this page: ${examples}.` : 'Browse published entries.'}`
      : `${subject}，第 ${page} 页。${examples ? `本页收录：${examples}。` : '浏览已发布的记录。'}`
  }
}
