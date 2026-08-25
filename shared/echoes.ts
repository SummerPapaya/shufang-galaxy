/**
 * 宇宙回声 · 前后端共用的协议与校验
 * （浏览器与 Vercel /api/echoes 都引用这份定义）
 */

export interface Echo {
  id: string
  /** 昵称（必填，公开） */
  name: string
  /** 留言正文（公开） */
  message: string
  /** 提交时间戳（ms） */
  at: number
  /** 示例回声（仅前端氛围，不入公共库） */
  seed?: boolean
}

export interface EchoDraft {
  name: string
  email: string
  message: string
}

export type EchoFieldError = Partial<Record<'name' | 'email' | 'message', string>>

export const NAME_MAX = 24
export const MESSAGE_MAX = 200
/** 公共墙上最多保留的最新回声数 */
export const ECHO_STORE_MAX = 300
export const ECHO_REDIS_KEY = 'shufang-galaxy:echoes:v1'

export const SEED_ECHOES: Echo[] = [
  {
    id: 'seed-1',
    name: '拾光者',
    message: '在通勤的地铁里听完一集，抬头发现窗外的灯火也温柔了。',
    at: Date.UTC(2026, 6, 14, 12, 20),
    seed: true,
  },
  {
    id: 'seed-2',
    name: '南山雀',
    message: '愿每个深夜赶稿的人，都有一间自己的书房可以躲一躲。',
    at: Date.UTC(2026, 7, 2, 15, 45),
    seed: true,
  },
  {
    id: 'seed-3',
    name: '海边的卡夫卡',
    message: '声音真的可以带人走很远。谢谢你们把书读成了星星。',
    at: Date.UTC(2026, 7, 19, 3, 10),
    seed: true,
  },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEcho(draft: EchoDraft): EchoFieldError {
  const errors: EchoFieldError = {}
  const name = draft.name.trim()
  const message = draft.message.trim()
  const email = draft.email.trim()

  if (!name) errors.name = '留个称呼吧，星海需要知道是谁在说话'
  else if (name.length > NAME_MAX) errors.name = `昵称请不超过 ${NAME_MAX} 字`

  if (!message) errors.message = '还没有内容，写一句想说的话'
  else if (message.length > MESSAGE_MAX) errors.message = `留言请不超过 ${MESSAGE_MAX} 字`

  if (email && !EMAIL_RE.test(email)) errors.email = '邮箱格式看起来不太对'

  return errors
}

export function isPublicEcho(value: unknown): value is Echo {
  if (!value || typeof value !== 'object') return false
  const e = value as Echo
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    typeof e.message === 'string' &&
    typeof e.at === 'number' &&
    !e.seed
  )
}

/** 合并公共回声 + 示例星；新的在前，示例垫底 */
export function composeEchoes(remote: Echo[]): Echo[] {
  const cleaned = remote.filter(isPublicEcho).sort((a, b) => b.at - a.at)
  return [...cleaned, ...SEED_ECHOES]
}
