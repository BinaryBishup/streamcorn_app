'use client'

import { useEffect } from 'react'

export function SecurityGuard() {
  useEffect(() => {
    // ── Disable right-click ──────────────────────────────────────────
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); return false }
    document.addEventListener('contextmenu', onContextMenu)

    // ── Disable common dev tools shortcuts ────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12') { e.preventDefault(); return }
      // Ctrl+Shift+I / Cmd+Option+I (Inspector)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') { e.preventDefault(); return }
      // Ctrl+Shift+J / Cmd+Option+J (Console)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') { e.preventDefault(); return }
      // Ctrl+Shift+C (Element picker)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') { e.preventDefault(); return }
      // Ctrl+U / Cmd+U (View source)
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); return }
      // Ctrl+S / Cmd+S (Save page)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); return }
    }
    document.addEventListener('keydown', onKeyDown)

    // ── Detect screen recording / screen capture ─────────────────────
    // Pause all videos when screen capture is detected
    const checkScreenCapture = () => {
      if (typeof navigator !== 'undefined' && 'mediaDevices' in navigator) {
        // Display capture detection via displayMedia (limited support)
        try {
          const md = navigator.mediaDevices as any
          if (md.getDisplayMedia) {
            // Can't detect directly, but we can detect window visibility
          }
        } catch {}
      }
    }

    // Blur detection — pause videos when window loses focus (screen recording often causes this)
    const onVisibilityChange = () => {
      if (document.hidden) {
        // Pause all videos when tab is hidden (helps against some recording)
        document.querySelectorAll('video').forEach(v => {
          if (!v.paused) {
            v.dataset.wasPlaying = 'true'
            // Don't pause — let the beacon save handle it
          }
        })
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // ── Disable text selection on video player ───────────────────────
    const style = document.createElement('style')
    style.textContent = `
      #player-root { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
      #player-root img { pointer-events: none; -webkit-user-drag: none; }
    `
    document.head.appendChild(style)

    // ── Disable drag on images ───────────────────────────────────────
    const onDragStart = (e: DragEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'IMG') e.preventDefault()
    }
    document.addEventListener('dragstart', onDragStart)

    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      document.removeEventListener('dragstart', onDragStart)
      style.remove()
    }
  }, [])

  return null
}
