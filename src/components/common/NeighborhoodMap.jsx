import { useEffect, useRef, useState } from 'react'
import { getNearbyAllowedInsects } from '../../api/inaturalist.js'
import { loadGoogleMaps } from '../../api/googleMaps.js'
import { MAP_INSECT_COUNT } from '../../data/mapSpecies.js'
import { NaturePanel } from './NatureUI.jsx'
import { Leaf } from 'lucide-react'

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }

function distanceInMeters(a, b) {
  const earthRadius = 6371000
  const lat1 = (a.latitude * Math.PI) / 180
  const lat2 = (b.latitude * Math.PI) / 180
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function groupNearbyObservations(observations) {
  const groups = []
  observations.forEach((observation) => {
    const group = groups.find((candidate) => distanceInMeters(candidate, observation) <= 100)
    if (group) {
      group.observations.push(observation)
      return
    }
    groups.push({ latitude: observation.latitude, longitude: observation.longitude, observations: [observation] })
  })
  return groups
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))
}

function createHoverContent(observations) {
  const cards = observations.map((observation) => `
    <div style="display:flex;align-items:center;gap:8px;margin:6px 0">
      ${observation.photo ? `<img src="${escapeHtml(observation.photo)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px" />` : '<div style="width:48px;height:48px;border-radius:8px;background:#f1eadb"></div>'}
      <div><strong>${escapeHtml(observation.name)}</strong><br><small>${escapeHtml(observation.date || '관찰일 미상')}</small></div>
    </div>
  `).join('')
  return `<div style="max-width:280px;color:#29402b;font-family:system-ui,sans-serif"><strong>반경 100m 관찰 ${observations.length}개</strong>${cards}</div>`
}

function createHoverOverlay(maps, position, content) {
  class HoverOverlay extends maps.OverlayView {
    onAdd() {
      this.element = document.createElement('div')
      this.element.innerHTML = content
      Object.assign(this.element.style, {
        position: 'absolute',
        transform: 'translate(-50%, calc(-100% - 14px))',
        padding: '10px 12px',
        border: '2px solid #78a968',
        borderRadius: '14px',
        background: '#e8f4df',
        boxShadow: '0 5px 16px rgba(44, 76, 42, 0.2)',
        pointerEvents: 'none',
        zIndex: '10',
      })
      this.getPanes().floatPane.appendChild(this.element)
    }

    draw() {
      const projection = this.getProjection()
      if (!projection || !this.element) return
      const point = projection.fromLatLngToDivPixel(this.position)
      this.element.style.left = `${point.x}px`
      this.element.style.top = `${point.y}px`
    }

    onRemove() {
      this.element?.remove()
      this.element = null
    }
  }

  const overlay = new HoverOverlay()
  overlay.position = new maps.LatLng(position.lat, position.lng)
  return overlay
}

export default function NeighborhoodMap() {
  const mapElement = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const userMarkerRef = useRef(null)
  const [state, setState] = useState({ status: 'locating', message: '현재 위치를 확인하고 있어요.' })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function initialize(position) {
      try {
        const center = position ? { lat: position.coords.latitude, lng: position.coords.longitude } : DEFAULT_CENTER
        const maps = await loadGoogleMaps()
        if (cancelled) return
        mapRef.current = new maps.Map(mapElement.current, { center, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false })
        if (position) {
          userMarkerRef.current = new maps.Marker({
            map: mapRef.current,
            position: center,
            title: '내 위치',
            zIndex: 1000,
            icon: {
              url: '/ui/my-location-marker.png',
              scaledSize: new maps.Size(52, 52),
              anchor: new maps.Point(26, 48),
            },
          })
        }
        const observations = await getNearbyAllowedInsects({
          latitude: center.lat,
          longitude: center.lng,
          signal: controller.signal,
        })
        if (cancelled) return
        markersRef.current.forEach((marker) => marker.setMap(null))
        const groups = groupNearbyObservations(observations)
        markersRef.current = groups.map((group) => {
          const marker = new maps.Marker({
            map: mapRef.current,
            position: { lat: group.latitude, lng: group.longitude },
            title: `관찰 ${group.observations.length}개`,
          })
          const hoverCard = createHoverOverlay(maps, { lat: group.latitude, lng: group.longitude }, createHoverContent(group.observations))
          marker.addListener('mouseover', () => hoverCard.setMap(mapRef.current))
          marker.addListener('mouseout', () => hoverCard.setMap(null))
          return marker
        })
        setState({ status: 'ready', count: observations.length, markerCount: groups.length })
      } catch (error) {
        if (!cancelled && error.name !== 'AbortError') setState({ status: 'error', message: error.message })
      }
    }

    if (!navigator.geolocation) initialize(null)
    else navigator.geolocation.getCurrentPosition(initialize, () => initialize(null), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 })
    return () => {
      cancelled = true
      controller.abort()
      markersRef.current.forEach((marker) => marker.setMap(null))
      userMarkerRef.current?.setMap(null)
      userMarkerRef.current = null
    }
  }, [])

  return (
    <NaturePanel className="p-4 sm:p-5" aria-label="동네 생태 지도">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[var(--nature-ink)]">동네 생태 지도</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--nature-muted)]">최근 1년 · 검색 반경 3km · 핀 그룹 100m · 지정 곤충 {MAP_INSECT_COUNT}종</p>
        </div>
        {state.status === 'ready' && (
          <span className="nature-title-aside">
            <Leaf size={16} aria-hidden="true" />
            핀 {state.markerCount}개 · 관찰 {state.count}개
          </span>
        )}
      </div>
      <div className="nature-map-frame">
        <div ref={mapElement} className="h-[min(62vh,680px)] min-h-[380px] w-full bg-ivory-100" />
      </div>
      {state.status !== 'ready' && <p className="mt-2 text-xs text-ink-700/70">{state.message}</p>}
    </NaturePanel>
  )
}
