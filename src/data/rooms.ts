import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'

/**
 * 书房数据层：fetch + 缓存 /assets/rooms.json。
 * 数据字段见 design.md §2 / §10。素材路径统一归一化为以 "/" 开头的绝对路径。
 */

export interface RoomHotspot {
  /** 0–1，相对插画宽度的归一化坐标 */
  x: number
  /** 0–1，相对插画高度的归一化坐标 */
  y: number
  label: string
}

/** 朗读书目·单集 */
export interface RoomEpisode {
  title: string
  /** 音频 URL，normalize 后为 '/assets/...' */
  audio: string
}

/** 朗读书目·一本书（一位朗读者可能有多本，并排陈列） */
export interface RoomBookItem {
  title: string
  author: string
  episodes: RoomEpisode[]
}

export interface Room {
  id: string
  /** 朗读者名 */
  reader: string
  /** 房间标题 */
  title: string
  /** 朗读者身份（创始人 / 朗读者…） */
  role: string
  /** 房间风格短句 */
  style: string
  /** 书房星专属色（辉光 / 详情页主题色） */
  starColor: string
  quote: string
  book: string
  /** 朗读书目（R3）：1-N 本书，每本书若干单集；缺失时由 book/audio 兜底生成 */
  books?: RoomBookItem[]
  /** 插画 URL，已归一化为 `/assets/rooms/{id}.jpg` */
  img: string
  /** 朗读 sample URL，已归一化为 `/assets/audio/{id}.mp3` */
  audio: string
  hotspots: RoomHotspot[]
}

/** rooms.json 中的相对路径（"assets/..."）→ 站点绝对路径（"/assets/..."） */
export function assetUrl(p: string): string {
  return p.startsWith('/') ? p : `/${p}`
}

function normalize(raw: Room): Room {
  const books = (raw.books ?? []).map((b) => ({
    ...b,
    episodes: (b.episodes ?? []).map((ep) => ({ ...ep, audio: assetUrl(ep.audio) })),
  }))
  return { ...raw, books, img: assetUrl(raw.img), audio: assetUrl(raw.audio) }
}

let cache: Promise<Room[]> | null = null
let resolved: Room[] | null = null

/** 加载（并缓存）10 间书房数据；成功后把 id 顺序写入 store.roomOrder */
export function fetchRooms(): Promise<Room[]> {
  if (!cache) {
    cache = fetch('/assets/rooms.json')
      .then((res) => {
        if (!res.ok) throw new Error(`rooms.json 加载失败: ${res.status}`)
        return res.json() as Promise<Room[]>
      })
      .then((rooms) => {
        const normalized = rooms.map(normalize)
        resolved = normalized
        useAppStore.getState().setRoomOrder(normalized.map((r) => r.id))
        return normalized
      })
  }
  return cache
}

/** 同步获取缓存数据（仅在 fetchRooms 已 resolve 后非空） */
export function getRoomsSync(): Room[] | null {
  return resolved
}

export interface UseRoomsResult {
  rooms: Room[]
  loading: boolean
  error: Error | null
}

/** React hook：加载书房列表（自动写入 store.roomOrder） */
export function useRooms(): UseRoomsResult {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchRooms()
      .then((data) => {
        if (!cancelled) {
          setRooms(data)
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { rooms, loading, error }
}

/** 按 id 查找单个书房 */
export function useRoom(id: string | null): Room | null {
  const { rooms } = useRooms()
  return rooms.find((r) => r.id === id) ?? null
}

/** 预取书房插画（悬停星星时调用，进入详情前预热） */
export function preloadRoomImage(room: Room): void {
  const img = new Image()
  img.src = room.img
}
