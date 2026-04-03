'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 text-center">
      <div>
        <p className="text-white text-lg font-bold mb-2">Something went wrong</p>
        <p className="text-white/40 text-sm mb-6">Please try again</p>
        <button onClick={reset} className="px-6 py-2.5 bg-[#e50914] text-white text-sm font-semibold rounded-lg">
          Try Again
        </button>
      </div>
    </div>
  )
}
