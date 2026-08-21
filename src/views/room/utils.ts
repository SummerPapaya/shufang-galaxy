/**
 * room 视图小工具：诗意扩写、时间格式化、稳定的伪随机序列。
 */

/** 根据热点 label（如「吊灯 · 点亮整夜阅读」）扩写一句诗意描述（room.md §3.2 点击态） */
export function poeticLine(label: string): string {
  const [name = '', desc = ''] = label.split('·').map((s) => s.trim())
  const rules: [RegExp, string][] = [
    [/灯|烛|光/, '光落在摊开的书页上，像一泓温水，把夜色烫出一个柔软的洞。'],
    [/书架|藏书|书墙/, '书脊挨着书脊，像一堵安静的年轮墙，替主人记得每一次翻页。'],
    [/桌|稿|日记/, '木纹里沉着未写完的句子，等你坐下来，它们便继续生长。'],
    [/吉他|琴|键/, '琴弦记得每一段哼唱，指尖一碰，旧时光就轻轻和声。'],
    [/窗|舷|星/, '窗外是无边的夜，窗内是一小片被擦亮的宇宙。'],
    [/猫/, '它把呼噜声调成最轻的电台，专治深夜的失眠。'],
    [/熊猫/, '它抱着竹子守在书旁，像一枚圆滚滚的书签。'],
    [/绿植|多肉|植物|春天/, '叶子朝着光慢慢转身，把一整个春天养在角落里。'],
    [/水母|鱼|海/, '蓝色的光在水里慢慢呼吸，仿佛整片深海都安静下来听书。'],
    [/云|梯|天空/, '踩上去，离天空近一点，离故事也近一点。'],
    [/钟|沙漏|时间/, '时间在这里走得很轻，怕吵醒正在朗读的声音。'],
  ]
  for (const [re, line] of rules) {
    if (re.test(name) || re.test(desc)) return `${desc} —— ${line}`
  }
  return desc ? `${desc} —— 它在房间的这一角，安静地发着光。` : '它在房间的这一角，安静地发着光。'
}

/** 秒 → mm:ss */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 由字符串种子生成稳定的 0–1 伪随机序列（波形基准振幅等用） */
export function seededRandoms(seed: string, count: number): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const out: number[] = []
  let state = h >>> 0
  for (let i = 0; i < count; i++) {
    // xorshift32
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    out.push((state >>> 0) / 4294967295)
  }
  return out
}

/** hex → rgba 字符串 */
export function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const n = parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
