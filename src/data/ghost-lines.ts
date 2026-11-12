export const ghostLines = {
  zh: {
    welcome: 'boo! 欢迎来玩',
    back: '我回来啦',
    quiet: '好，我就在角落陪你',
    returning: '你又来啦，欢迎回来',
    late: '这么晚还在逛，注意休息哦',
    click: [
      '我是 Boo，这个博客的看门幽灵',
      '想看什么？顶部有分类哦',
      '点我也不会掉金币的',
      '随便逛，我不吓人',
      '看到喜欢的文章可以分享给朋友'
    ],
    escape: '别戳了，要飘走了',
    finished: '读完啦，谢谢你看到最后～',
    long: '这篇有点长，可以先收藏慢慢看',
    awake: '没睡！我没睡！',
    projects: '这些都是博主在做的东西，点进去看看',
    contact: '有想法就发封邮件吧',
    missing: '这里什么都没有…除了我'
  },
  en: {
    welcome: 'boo! Welcome!',
    back: 'I am back!',
    quiet: 'I will keep you company from my corner',
    returning: 'You are back! Welcome back',
    late: 'Still browsing this late? Get some rest',
    click: [
      "I'm Boo, the ghost who guards this blog",
      'Looking for something? Try the categories at the top',
      'Poking me will not drop coins',
      'Take a look around. I do not bite',
      'Found a post you like? Share it with a friend'
    ],
    escape: 'Stop poking! I am floating away',
    finished: 'All done! Thanks for reading to the end~',
    long: 'This is a long one. Bookmark it and take your time',
    awake: 'Not sleeping! I was not sleeping!',
    projects: 'Here is what the author is working on. Take a look',
    contact: 'Have an idea? Send an email',
    missing: 'Nothing here… except me'
  }
} as const

export const ghostCameoLines = {
  zh: {
    title: ['偷偷看一眼…你读得好认真', '这篇我也看过，后面更精彩'],
    top: ['要回去吗？我帮你按', '坐这儿看风景，不收费'],
    code: ['代码可以一键复制哦', '看不懂没关系，我也看不懂'],
    image: ['点一下能看大图'],
    end: ['读完啦，谢谢你看到最后～', '喜欢的话，RSS 订阅一下？'],
    tags: ['按标签找找，说不定有你想看的']
  },
  en: {
    title: [
      'Just peeking… you are really into this',
      'I have read this one. The best is still ahead'
    ],
    top: ['Heading back up? I can help', 'The view from here is free'],
    code: [
      'You can copy this code with one click',
      'It is okay if you do not get it. Neither do I'
    ],
    image: ['Click the image for a closer look'],
    end: ['Thanks for reading to the end~', 'Enjoyed it? Subscribe via RSS'],
    tags: ['Try a tag. You might find something you like']
  }
} as const

export type GhostCameo = keyof typeof ghostCameoLines.zh
export type HeroLine = { text: string; href?: string }

export function makeGhostHeroLines(
  lang: 'zh' | 'en',
  data: {
    latest?: { title: string; href: string }
    posts: number
    notes: number
    projects: number
  }
): HeroLine[] {
  const en = lang === 'en'
  return [
    { text: en ? 'boo! Welcome! I am Boo' : 'boo! 欢迎来玩，我是 Boo' },
    ...(data.latest
      ? [
          {
            text: en ? `Latest save: ${data.latest.title}` : `最新存档：《${data.latest.title}》`,
            href: data.latest.href
          }
        ]
      : []),
    {
      text: en
        ? `${data.posts} blog posts, ${data.notes} notes, and ${data.projects} projects to explore`
        : `这里有 ${data.posts} 篇博客、${data.notes} 条笔记、${data.projects} 个项目`
    },
    { text: en ? 'Use ↑↓ to choose, then Enter to explore' : '用 ↑↓ 选菜单，回车进入' },
    {
      text: en ? 'Want to meet the author? Visit About' : '想认识博主？去『关于』看看',
      href: en ? '/en/about' : '/about'
    }
  ]
}

export const ghostQuietLabel = { zh: '让 Boo 安静点', en: 'Quiet, Boo' } as const
