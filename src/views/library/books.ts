import { useEffect, useState } from 'react'

/**
 * 星空图书馆数据层：读取 /assets/books.json（星光藏书）。
 * audio 字段在 json 中为 'assets/audio/x.mp3'（无前导斜杠），此处归一化为 '/assets/...'。
 */

export interface BookEpisode {
  title: string
  /** 归一化为 '/assets/audio/...' */
  audio: string
}

export interface Book {
  id: string
  title: string
  /** 书脊竖排短名；缺省时回退到 title */
  spineTitle?: string
  author: string
  reader: string
  starColor: string
  /** 归一化为 '/assets/audio/{id}.mp3'；外链 https 保持原样 */
  audio: string
  /** 单集列表（R3）：播放器内可切换同一本书的不同单集 */
  episodes: BookEpisode[]
  /** 可选：跳转到官网文稿 / 外链页面 */
  externalUrl?: string
}

interface RawBook {
  id: string
  title: string
  spineTitle?: string
  author: string
  reader: string
  starColor: string
  audio: string
  episodes?: { title: string; audio: string }[]
  externalUrl?: string
}

let cache: Book[] | null = null
let inflight: Promise<Book[]> | null = null

function normAudio(p: string): string {
  if (/^https?:\/\//i.test(p) || p.startsWith('/')) return p
  return `/${p}`
}

export function fetchBooks(): Promise<Book[]> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = fetch('/assets/books.json')
      .then((res) => {
        if (!res.ok) throw new Error(`books.json 加载失败：${res.status}`)
        return res.json() as Promise<RawBook[]>
      })
      .then((raw) => {
        cache = raw.map((b) => ({
          id: b.id,
          title: b.title,
          spineTitle: b.spineTitle?.trim() || undefined,
          author: b.author,
          reader: b.reader,
          starColor: b.starColor,
          audio: normAudio(b.audio),
          externalUrl: b.externalUrl?.trim() || undefined,
          episodes: (b.episodes && b.episodes.length > 0
            ? b.episodes
            : [{ title: '第 1 集 · 试音样片', audio: b.audio }]
          ).map((ep) => ({ ...ep, audio: normAudio(ep.audio) })),
        }))
        return cache
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useBooks(): { books: Book[] | null; error: Error | null } {
  const [books, setBooks] = useState<Book[] | null>(cache)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchBooks()
      .then((list) => {
        if (!cancelled) setBooks(list)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { books, error }
}
