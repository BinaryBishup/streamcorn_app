'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface Profile {
  id: string; name: string; avatar_url: string | null
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/profiles')
      .then(r => r.json())
      .then(d => setProfiles(d.profiles || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const selectProfile = (profile: Profile) => {
    localStorage.setItem('streamcorn_profile_id', profile.id)
    localStorage.setItem('streamcorn_profile_name', profile.name)
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <h1 className="text-white text-2xl font-bold mb-8">Who's watching?</h1>
      <div className="flex flex-wrap justify-center gap-5">
        {profiles.map(profile => {
          const isImage = profile.avatar_url?.startsWith('/avatars/')
          return (
            <button key={profile.id} onClick={() => selectProfile(profile)} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-[#1a1a1a]">
                {isImage ? (
                  <Image src={profile.avatar_url!} alt={profile.name} width={80} height={80} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: profile.avatar_url?.startsWith('#') ? profile.avatar_url : '#e50914' }}>
                    {profile.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-white/70 text-sm">{profile.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
