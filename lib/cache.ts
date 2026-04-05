'use client'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface CacheEntry<T> {
  data: T
  timestamp: number
}

export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`sc_cache_${key}`)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(`sc_cache_${key}`)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

export function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() }
    localStorage.setItem(`sc_cache_${key}`, JSON.stringify(entry))
  } catch {}
}

export function clearCache(key?: string): void {
  if (key) {
    localStorage.removeItem(`sc_cache_${key}`)
  } else {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('sc_cache_'))
    keys.forEach(k => localStorage.removeItem(k))
  }
}
