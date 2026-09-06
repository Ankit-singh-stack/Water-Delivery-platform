export interface LatLng {
  latitude: number
  longitude: number
}

// Keyless Google Maps URLs — no maps SDK / API key is used anywhere in the app.

// Embeddable map centered on a point.
export function pointEmbed(q: string | LatLng, zoom = 15): string {
  const query = typeof q === 'string' ? encodeURIComponent(q) : `${q.latitude},${q.longitude}`
  return `https://www.google.com/maps?q=${query}&z=${zoom}&output=embed`
}

// Embeddable map showing a route between an origin (address or point) and a destination.
export function routeEmbed(from: string | LatLng | null, to: string | LatLng): string {
  const s = from == null
    ? encodeURIComponent(typeof to === 'string' ? to : `${to.latitude},${to.longitude}`)
    : (typeof from === 'string' ? encodeURIComponent(from) : `${from.latitude},${from.longitude}`)
  const d = typeof to === 'string' ? encodeURIComponent(to) : `${to.latitude},${to.longitude}`
  return `https://www.google.com/maps?saddr=${s}&daddr=${d}&output=embed`
}

// Open the marker in the full Google Maps app/website.
export function openInMaps(q: string | LatLng): string {
  const query = typeof q === 'string' ? encodeURIComponent(q) : `${q.latitude},${q.longitude}`
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

// Turn-by-turn directions from an optional origin to a destination.
export function directions(from: string | LatLng | null, to: string | LatLng): string {
  const params = new URLSearchParams({ api: '1' })
  if (from != null) {
    params.set('origin', typeof from === 'string' ? from : `${from.latitude},${from.longitude}`)
  }
  const d = typeof to === 'string' ? to : `${to.latitude},${to.longitude}`
  params.set('destination', d)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

// Build a human-readable "full address" from the order's address parts.
export function addressText(parts: {
  doorNo?: string | null
  plotNo?: string | null
  buildingName?: string | null
  streetName?: string | null
  areaName?: string | null
  city?: string | null
  state?: string | null
}): string {
  return [parts.doorNo, parts.plotNo, parts.buildingName, parts.streetName, parts.areaName, parts.city, parts.state]
    .filter(Boolean)
    .join(', ')
}

export function formatDistanceKm(km: number | null): string {
  if (km == null) return ''
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}