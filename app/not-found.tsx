import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-6xl font-black text-[#e50914] mb-3">404</h1>
        <p className="text-white/50 text-sm mb-6">Page not found</p>
        <Link href="/" className="px-6 py-2.5 bg-[#e50914] text-white text-sm font-semibold rounded-lg">Go Home</Link>
      </div>
    </div>
  )
}
