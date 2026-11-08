'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { loadStudio } from '@/lib/loadStudio'

function StudioChunkLoading() {
  return <div className="fixed inset-0 bg-black" />
}

const Studio = dynamic(loadStudio, { ssr: false, loading: StudioChunkLoading })

export default function Page() {
  const router = useRouter()
  // A new tab (from rafeyOS) or a direct visit has nothing to go back to, so it lands on the terminal
  const exit = () => (window.history.length > 1 ? router.back() : router.push('/'))
  return <Studio onExit={exit} />
}
