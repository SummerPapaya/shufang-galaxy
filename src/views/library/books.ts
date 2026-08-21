import { useEffect, useState } from 'react'

/**
 * 星空图书馆数据层：读取 /assets/books.json（15 册星光藏书）。
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
  author: string
  reader: string
  starColor: string
  /** 归一化为 '/assets/audio/{id}.mp3' */
  audio: string
  /** 单集列表（R3）：播放器内可切换同一本书的不同单集 */
  episodes: BookEpisode[]
}

interface RawBook {
  id: string
  title: string
  author: string
  reader: string
  starColor: string
  audio: string
  episodes?: { title: string; audio: string }[]
}

let cache: Book[] | null = null
let inflight: Promise<Book[]> | null = null

export function fetchBooks(): Promise<Book[]> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = fetch('/assets/books.json')
      .then((res) => {
        if (!res.ok) throw new Error(`books.json 加载失败：${res.status}`)
        return res.json() as Promise<RawBook[]>
      })
      .then((raw) => {
        const norm = (p: string) => (p.startsWith('/') ? p : `/${p}`)
        cache = raw.map((b) => ({
          ...b,
          audio: norm(b.audio),
          episodes: (b.episodes && b.episodes.length > 0
            ? b.episodes
            : [{ title: '第 1 集 · 试音样片', audio: b.audio }]
          ).map((ep) => ({ ...ep, audio: norm(ep.audio) })),
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
