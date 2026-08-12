import { redirect } from 'next/navigation'

export default async function TrackReferencePage({
  params,
}: {
  params: Promise<{ reference: string }>
}) {
  const { reference } = await params
  redirect(`/track?ref=${encodeURIComponent(reference)}`)
}
