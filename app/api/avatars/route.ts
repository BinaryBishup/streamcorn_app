import { NextResponse } from 'next/server'

// Static list of avatars in public/avatars/
// Update this list when adding or removing avatar images
const AVATARS = [
  '/avatars/alien.png',
  '/avatars/chicken.png',
  '/avatars/dark_grey_smile.png',
  '/avatars/dog.png',
  '/avatars/dusty_chilleez.png',
  '/avatars/eyepatch.png',
  '/avatars/green_smile.png',
  '/avatars/helmet.png',
  '/avatars/moustache.png',
  '/avatars/mummy.png',
  '/avatars/pink_giggle.png',
  '/avatars/pink_smile.png',
  '/avatars/purple_penguin.png',
  '/avatars/purple_smile.png',
  '/avatars/purple_superhero.png',
  '/avatars/red_smile.png',
  '/avatars/red_superhero.png',
  '/avatars/robin_chilleez.png',
  '/avatars/robot.png',
  '/avatars/scarlet_chilleez.png',
  '/avatars/sunny_chilleez.png',
  '/avatars/yellow_smile.png',
]

export async function GET() {
  return NextResponse.json({ avatars: AVATARS })
}
