'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface Profile { id: string; name: string; avatar_url: string | null }

const AVATARS = ['/avatars/alien.png','/avatars/chicken.png','/avatars/dark_grey_smile.png','/avatars/dog.png','/avatars/dusty_chilleez.png','/avatars/eyepatch.png','/avatars/green_smile.png','/avatars/helmet.png','/avatars/moustache.png','/avatars/mummy.png','/avatars/pink_giggle.png','/avatars/pink_smile.png','/avatars/purple_penguin.png','/avatars/purple_smile.png','/avatars/purple_superhero.png','/avatars/red_smile.png','/avatars/red_superhero.png','/avatars/robin_chilleez.png','/avatars/robot.png','/avatars/scarlet_chilleez.png','/avatars/sunny_chilleez.png','/avatars/yellow_smile.png']

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'select' | 'manage' | 'edit' | 'add'>('select')
  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [formName, setFormName] = useState('')
  const [formAvatar, setFormAvatar] = useState<string>('/avatars/red_smile.png')

  useEffect(() => {
    fetch('/api/profiles').then(r => r.json()).then(d => setProfiles(d.profiles || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const selectProfile = (p: Profile) => {
    if (mode === 'manage') { setEditProfile(p); setFormName(p.name); setFormAvatar(p.avatar_url || '/avatars/red_smile.png'); setMode('edit'); return }
    localStorage.setItem('streamcorn_profile_id', p.id)
    localStorage.setItem('streamcorn_profile_name', p.name)
    window.location.href = '/'
  }

  const handleSave = async () => {
    if (!formName.trim()) return
    if (mode === 'add') {
      const res = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, avatar: formAvatar, isKids: false }) })
      const d = await res.json()
      if (d.profile) setProfiles(prev => [...prev, d.profile])
    } else if (mode === 'edit' && editProfile) {
      await fetch('/api/profiles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editProfile.id, name: formName, avatar: formAvatar }) })
      setProfiles(prev => prev.map(p => p.id === editProfile.id ? { ...p, name: formName, avatar_url: formAvatar } : p))
    }
    setMode('select'); setEditProfile(null); setFormName(''); setFormAvatar('/avatars/red_smile.png')
  }

  const handleDelete = async () => {
    if (!editProfile || profiles.length <= 1) return
    await fetch(`/api/profiles?id=${editProfile.id}`, { method: 'DELETE' })
    setProfiles(prev => prev.filter(p => p.id !== editProfile.id))
    setMode('select'); setEditProfile(null)
  }

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" /></div>

  // Edit / Add form
  if (mode === 'edit' || mode === 'add') {
    return (
      <div className="min-h-screen bg-black px-6 pt-6">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => setMode('manage')} className="text-white/40"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg></button>
          <h1 className="text-white text-lg font-bold">{mode === 'edit' ? 'Edit Profile' : 'Add Profile'}</h1>
        </div>

        {/* Avatar preview */}
        <div className="flex justify-center mb-6">
          <div className="w-24 h-24 rounded-2xl overflow-hidden bg-[#1a1a1a]">
            <Image src={formAvatar} alt="" width={96} height={96} className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Name */}
        <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Profile name" maxLength={20} className="w-full bg-[#141414] text-white text-base px-4 py-3.5 rounded-xl border border-white/[0.08] outline-none mb-5 placeholder:text-white/20 focus:border-white/20" autoFocus />

        {/* Avatar picker */}
        <p className="text-white/40 text-xs mb-2">Choose Avatar</p>
        <div className="grid grid-cols-6 gap-2 mb-8 max-h-[200px] overflow-y-auto">
          {AVATARS.map(a => (
            <button key={a} onClick={() => setFormAvatar(a)} className={`aspect-square rounded-xl overflow-hidden ${formAvatar === a ? 'ring-2 ring-[#e50914] ring-offset-1 ring-offset-black' : ''}`}>
              <Image src={a} alt="" width={60} height={60} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        <button onClick={handleSave} disabled={!formName.trim()} className="w-full py-3.5 bg-[#e50914] text-white font-bold rounded-xl active:bg-[#b20710] disabled:opacity-30 mb-3">Save</button>
        {mode === 'edit' && profiles.length > 1 && (
          <button onClick={handleDelete} className="w-full py-3 text-red-400 text-sm font-medium active:text-red-300">Delete Profile</button>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <h1 className="text-white text-2xl font-bold mb-8">{mode === 'manage' ? 'Manage Profiles' : 'Who\'s watching?'}</h1>
      <div className="flex flex-wrap justify-center gap-5 mb-8">
        {profiles.map(p => {
          const isImage = p.avatar_url?.startsWith('/avatars/')
          return (
            <button key={p.id} onClick={() => selectProfile(p)} className="flex flex-col items-center gap-2 active:scale-95 transition-transform relative">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-[#1a1a1a]">
                {isImage ? <Image src={p.avatar_url!} alt={p.name} width={80} height={80} className="w-full h-full object-cover" /> : (
                  <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: p.avatar_url?.startsWith('#') ? p.avatar_url : '#e50914' }}>{p.name.charAt(0).toUpperCase()}</div>
                )}
                {mode === 'manage' && <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center m-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                </div>}
              </div>
              <span className="text-white/70 text-sm">{p.name}</span>
            </button>
          )
        })}
        {/* Add profile button */}
        {mode === 'manage' && profiles.length < 5 && (
          <button onClick={() => { setFormName(''); setFormAvatar('/avatars/red_smile.png'); setMode('add') }} className="flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} opacity={0.4}><path d="M12 4v16m8-8H4"/></svg>
            </div>
            <span className="text-white/40 text-sm">Add</span>
          </button>
        )}
      </div>
      <button onClick={() => setMode(mode === 'manage' ? 'select' : 'manage')} className={`px-6 py-2.5 rounded-xl text-sm font-medium ${mode === 'manage' ? 'bg-white text-black' : 'border border-white/20 text-white/60 active:bg-white/[0.06]'}`}>
        {mode === 'manage' ? 'Done' : 'Manage Profiles'}
      </button>
    </div>
  )
}
