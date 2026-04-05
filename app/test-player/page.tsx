'use client'

import { useState, useEffect, useRef } from 'react'

export default function TestPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState('Loading...')
  const [src, setSrc] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [debugLog, setDebugLog] = useState<string[]>([])

  const log = (msg: string) => {
    console.log('[TestPlayer]', msg)
    setDebugLog(prev => [...prev.slice(-15), msg])
  }

  // Step 1: Unregister service workers
  useEffect(() => {
    (async () => {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        for (const reg of regs) await reg.unregister()
        if (regs.length > 0) log(`Unregistered ${regs.length} service worker(s)`)
      }
      const keys = await caches.keys()
      for (const key of keys) await caches.delete(key)
      if (keys.length > 0) log(`Cleared ${keys.length} cache(s)`)
    })()
  }, [])

  // Step 2: Fetch video source
  useEffect(() => {
    log('Fetching video source...')
    fetch('/api/video-source?tmdb_id=484133&type=movie')
      .then(r => r.json())
      .then(d => {
        if (d.url) {
          log(`Source: ${d.url}`)
          setSrc(d.url)
        } else {
          log('ERROR: No video URL returned')
          setStatus('No video source')
        }
      })
      .catch(e => { log(`ERROR fetching source: ${e.message}`); setStatus('Failed to load') })
  }, [])

  // Step 3: Once we have src, attach hls.js directly to video element
  useEffect(() => {
    if (!src || !videoRef.current) return
    const v = videoRef.current

    let hls: any = null
    let destroyed = false

    async function init() {
      const Hls = (await import('hls.js')).default

      if (destroyed) return

      if (!Hls.isSupported()) {
        // Fallback: native HLS (Safari)
        log('hls.js not supported, trying native HLS...')
        v.src = src!
        v.addEventListener('loadedmetadata', () => log(`Native HLS: duration=${Math.floor(v.duration)}s`))
        v.addEventListener('canplay', () => { log('Native HLS: can play'); setStatus('Ready') })
        v.addEventListener('error', () => log(`Native HLS ERROR: ${v.error?.message}`))
        return
      }

      log('hls.js supported, initializing...')

      // Verify key endpoint works
      try {
        const keyRes = await fetch('/api/hls-key')
        const keyData = await keyRes.arrayBuffer()
        log(`Key endpoint: ${keyRes.status}, ${keyData.byteLength} bytes`)
        if (keyData.byteLength !== 16) {
          log(`ERROR: Key should be 16 bytes, got ${keyData.byteLength}`)
        }
      } catch (e: any) {
        log(`ERROR fetching key: ${e.message}`)
      }

      // Verify manifest is rewritten
      try {
        const mRes = await fetch(src!, { cache: 'no-store' })
        const mText = await mRes.text()
        const hasKeyRewrite = mText.includes('/api/hls-key')
        const hasDataPlain = mText.includes('data:text/plain')
        log(`Manifest: keyRewrite=${hasKeyRewrite}, hasOldKey=${hasDataPlain}`)
        if (hasDataPlain) {
          log('WARNING: Manifest still has old data:text/plain key URI!')
        }
      } catch (e: any) {
        log(`ERROR fetching manifest: ${e.message}`)
      }

      // Initialize hls.js
      hls = new Hls({
        enableWorker: true,
        debug: false,
      })

      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        log(`Manifest parsed: ${data.levels?.length || 0} levels`)
        setStatus('Buffering...')
      })

      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (status !== 'Playing') log('Fragment loaded')
      })

      hls.on(Hls.Events.FRAG_DECRYPTED, () => {
        log('Fragment decrypted OK!')
      })

      hls.on(Hls.Events.ERROR, (_: any, data: any) => {
        log(`HLS ERROR: ${data.type} - ${data.details} ${data.fatal ? '(FATAL)' : ''}`)
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            log('Retrying network...')
            hls.startLoad()
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            log('Recovering media error...')
            hls.recoverMediaError()
          }
        }
      })

      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        if (v.buffered.length > 0) {
          const buffered = Math.floor(v.buffered.end(0))
          log(`Buffered: ${buffered}s`)
          if (!isPlaying) {
            v.play().then(() => {
              setIsPlaying(true)
              setStatus('Playing')
              log('Playback started!')
            }).catch(e => log(`Play blocked: ${e.message}`))
          }
        }
      })

      log(`Loading source: ${src}`)
      hls.loadSource(src!)
      hls.attachMedia(v)
    }

    init()

    return () => {
      destroyed = true
      if (hls) hls.destroy()
    }
  }, [src])

  // Landscape fullscreen on tap
  const goFullscreen = async () => {
    const el = videoRef.current?.parentElement
    if (!el) return
    try {
      if (el.requestFullscreen) await el.requestFullscreen()
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen()
    } catch {}
    try { await (screen.orientation as any)?.lock?.('landscape') } catch {}

    // Also try to play on user gesture
    const v = videoRef.current
    if (v && v.paused) {
      v.play().then(() => { setIsPlaying(true); setStatus('Playing'); log('Play on tap!') }).catch(() => {})
    }
  }

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column' }}
      onClick={goFullscreen}
    >
      {/* Video */}
      <div style={{ flex: 1, position: 'relative' }}>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
          controls
        />

        {/* Status overlay */}
        <div style={{
          position: 'absolute', top: 8, left: 8, right: 8,
          background: 'rgba(0,0,0,0.8)', borderRadius: 8, padding: '8px 12px',
          pointerEvents: 'none',
        }}>
          <p style={{ color: '#e50914', fontSize: 14, fontWeight: 'bold', margin: 0 }}>{status}</p>
        </div>
      </div>

      {/* Debug log */}
      <div style={{
        background: '#111', padding: '8px 12px', maxHeight: 160, overflowY: 'auto',
        fontFamily: 'monospace', fontSize: 10, lineHeight: 1.4,
      }}>
        {debugLog.map((msg, i) => (
          <div key={i} style={{ color: msg.includes('ERROR') ? '#e50914' : msg.includes('OK') || msg.includes('started') ? '#4ade80' : 'rgba(255,255,255,0.6)' }}>
            {msg}
          </div>
        ))}
        {debugLog.length === 0 && <div style={{ color: 'rgba(255,255,255,0.3)' }}>Waiting...</div>}
      </div>
    </div>
  )
}
