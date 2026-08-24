import type { Room } from './rooms'

/**
 * 书房索引排序：段静固定置顶，其余按普通话读音（拼音 + 声调 1–4，轻声 5）排序。
 * 音节串成可比较的 ASCII 键，例如 晓棠 → xiao3tang2。
 */

const FOUNDER_ID = 'duanjing'

/** 朗读者名 → 拼音调号键（按 rooms.json 现有名单维护） */
const READER_PINYIN: Record<string, string> = {
  安德烈司机: 'an1de2lie4si1ji1',
  蔡杉: 'cai4shan1',
  大夏: 'da4xia4',
  段静: 'duan4jing4',
  海璐: 'hai3lu4',
  花儿: 'hua1er5',
  麦子: 'mai4zi5',
  蜜思珂: 'mi4si1ke1',
  淼淼: 'miao3miao3',
  牧风: 'mu4feng1',
  闻达: 'wen2da2',
  西子: 'xi1zi3',
  夏利: 'xia4li4',
  夏小麦: 'xia4xiao3mai4',
  肖图玛: 'xiao1tu2ma3',
  小光: 'xiao3guang1',
  晓棠: 'xiao3tang2',
  小旭: 'xiao3xu4',
  小雨: 'xiao3yu3',
  一条大河: 'yi1tiao2da4he2',
  一苇: 'yi1wei3',
  优迈: 'you1mai4',
  张很香: 'zhang1hen3xiang1',
  紫晓: 'zi3xiao3',
  子欣: 'zi3xin1',
}

function pinyinKey(reader: string): string {
  return READER_PINYIN[reader] ?? reader.normalize('NFD')
}

export function sortRoomsForIndex(rooms: Room[]): Room[] {
  const founder = rooms.filter((r) => r.id === FOUNDER_ID)
  const rest = rooms.filter((r) => r.id !== FOUNDER_ID)
  rest.sort((a, b) => {
    const cmp = pinyinKey(a.reader).localeCompare(pinyinKey(b.reader), 'en')
    if (cmp !== 0) return cmp
    return a.reader.localeCompare(b.reader, 'zh-CN')
  })
  return founder.concat(rest)
}
