import { useEffect, useRef, useState } from 'react'
import type { Candidate } from '../types'
import { candidatePhotoFallback, candidatePhotoSources, hasOfficialCandidateIdentity } from '../data/candidatePhotos'
import './candidate-avatar.css'

const failedImages = new Set<string>()
const loadedImages = new Set<string>()
type Props = { candidate: Candidate; year: number; size?: 'sm' | 'lg' }
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(word => !/^(da|de|do|das|dos)$/i.test(word))
  return (words[0]?.[0] ?? '?') + (words.length > 1 ? words[words.length - 1][0] : '')
}
export function CandidateAvatar({ candidate, year, size = 'sm' }: Props) {
  const host = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [photo, setPhoto] = useState<{ identity: string; sources: string[]; index: number; loaded: boolean; pending: boolean }>({ identity: '', sources: [], index: 0, loaded: false, pending: false })
  const identity = year + ':' + candidate.id
  const official = hasOfficialCandidateIdentity(candidate)
  useEffect(() => {
    if (!official || !host.current) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '120px' })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [identity, official])
  useEffect(() => {
    if (!visible || !official) return
    let active = true
    setPhoto({ identity, sources: [], index: 0, loaded: false, pending: true })
    candidatePhotoSources(candidate, year).then(sources => {
      if (!active) return
      const available = sources.filter(source => !failedImages.has(source))
      setPhoto({ identity, sources: available, index: 0, loaded: !!available[0] && loadedImages.has(available[0]), pending: false })
    })
    return () => { active = false }
  }, [identity, visible, official, candidate.photoUrl, candidate.sourceUrl, candidate.office, candidate.state, candidate.round, year])
  const source = photo.identity === identity ? photo.sources[photo.index] : undefined
  const pending = official && (!visible || photo.identity !== identity || photo.pending || !!source && !photo.loaded)
  const label = source ? 'Foto de ' + candidate.name : pending ? 'Carregando foto de ' + candidate.name : 'Foto não disponível de ' + candidate.name
  async function fail() {
    if (!source) return
    failedImages.add(source)
    const next = photo.index + 1
    if (next < photo.sources.length) {
      setPhoto(current => ({ ...current, index: next, loaded: loadedImages.has(current.sources[next]) }))
      return
    }
    const expectedIdentity = identity
    const fallback = await candidatePhotoFallback(candidate, year)
    setPhoto(current => {
      if (current.identity !== expectedIdentity) return current
      if (!fallback || failedImages.has(fallback) || current.sources.includes(fallback)) return { ...current, index: current.sources.length, loaded: false }
      return { ...current, sources: [...current.sources, fallback], index: current.sources.length, loaded: loadedImages.has(fallback) }
    })
  }
  return <span ref={host} className={'candidate-avatar candidate-photo candidate-avatar--' + size + (pending ? ' candidate-avatar--loading' : '')} role="img" aria-label={label} title={pending ? 'Buscando foto oficial no TSE' : source ? 'Foto oficial do TSE' : 'Foto indisponível no TSE'}>
    <span className="candidate-avatar__initials" aria-hidden="true">{initials(candidate.name)}</span>
    {source && <img key={source} src={source} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={photo.loaded ? 'is-loaded' : ''} onLoad={() => { loadedImages.add(source); setPhoto(current => current.identity === identity && current.sources[current.index] === source ? { ...current, loaded: true } : current) }} onError={() => { void fail() }} />}
  </span>
}

export default CandidateAvatar
