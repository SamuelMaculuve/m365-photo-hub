import type { MediaMetadata } from '../../db/schema'
import { guessMime, type MediaType } from '../media-type'
import { resolvePlace } from '../places'

/** Datas EXIF inválidas (ex.: 1970, 0000) são descartadas. */
function date(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.getUTCFullYear() < 1900 || d.getTime() > Date.now() + 86_400_000 ? null : d
}

const num = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v))
const round1 = (v: unknown) => (num(v) === null ? null : Math.round(Number(v) * 10) / 10)

/** Converte um driveItem do Graph nos atributos que a aplicação realmente usa (não duplica tudo). */
export function toMediaAttributes(item: Record<string, any>, type: MediaType) {
  const photo = item.photo ?? {}
  const image = item.image ?? {}
  const video = item.video ?? {}
  const location = item.location ?? {}

  const takenAt = date(photo.takenDateTime)
  const createdAt = date(item.fileSystemInfo?.createdDateTime ?? item.createdDateTime) ?? new Date()
  const modifiedAt = date(item.fileSystemInfo?.lastModifiedDateTime ?? item.lastModifiedDateTime)
  const lat = num(location.latitude)
  const lng = num(location.longitude)
  const place = lat !== null && lng !== null ? resolvePlace(lat, lng) : null

  const metadata: MediaMetadata & Record<string, unknown> = Object.fromEntries(Object.entries({
    camera_make: photo.cameraMake ?? null,
    camera_model: photo.cameraModel ?? null,
    f_number: round1(photo.fNumber),
    exposure_time: photo.exposureNumerator != null && photo.exposureDenominator ? `${photo.exposureNumerator}/${photo.exposureDenominator}` : null,
    focal_length: round1(photo.focalLength),
    iso: photo.iso ?? null,
    orientation: photo.orientation ?? null,
    video_bitrate: video.bitrate ?? null,
    video_frame_rate: video.frameRate ?? null,
  }).filter(([, v]) => v !== null))

  return {
    itemId: String(item.id),
    parentItemId: (item.parentReference?.id as string | undefined) ?? null,
    name: String(item.name).slice(0, 400),
    mediaType: type,
    mimeType: (item.file?.mimeType as string | undefined) ?? guessMime(String(item.name)),
    size: Number(item.size ?? 0),
    width: num(image.width ?? video.width),
    height: num(image.height ?? video.height),
    durationMs: num(video.duration),
    takenAt,
    sourceCreatedAt: createdAt,
    sourceModifiedAt: modifiedAt,
    sortAt: takenAt ?? createdAt,
    latitude: lat,
    longitude: lng,
    placeName: place?.name ?? null,
    placeRegion: place?.region ?? null,
    placeCountry: place?.country ?? null,
    placeDistanceKm: place?.distanceKm ?? null,
    locationSource: lat !== null && lng !== null ? 'graph' : null,
    checksum: (item.file?.hashes?.quickXorHash ?? item.file?.hashes?.sha256Hash ?? null) as string | null,
    etag: (item.eTag as string | undefined) ?? null,
    ctag: (item.cTag as string | undefined) ?? null,
    webUrl: (item.webUrl as string | undefined) ?? null,
    metadata: Object.keys(metadata).length ? metadata : null,
  }
}
