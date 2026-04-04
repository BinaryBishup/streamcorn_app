import { NextResponse } from 'next/server'

const HLS_KEY_HEX = process.env.NEXT_PUBLIC_HLS_KEY || ''

function hexToBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    b[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return b
}

export async function GET() {
  if (!HLS_KEY_HEX) {
    return NextResponse.json({ error: 'Key not configured' }, { status: 500 })
  }

  const keyBytes = hexToBytes(HLS_KEY_HEX)

  return new NextResponse(keyBytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(keyBytes.length),
      'Cache-Control': 'private, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
