'use client'

export default function MyListPage() {
  return (
    <div className="min-h-screen bg-black pt-4 px-4">
      <h1 className="text-xl font-bold text-white mb-6">My List</h1>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="text-white/15 mb-4">
          <path d="M5 2a2 2 0 00-2 2v16.131a1 1 0 001.555.832L12 16.2l7.445 4.763A1 1 0 0021 20.131V4a2 2 0 00-2-2H5z"/>
        </svg>
        <p className="text-white/40 text-sm">Your list is empty</p>
        <p className="text-white/25 text-xs mt-1">Save movies and shows to watch later</p>
      </div>
    </div>
  )
}
