import type { Media } from '../db/schema'

const SIZES: Record<string, number> = { small: 96, medium: 320, large: 800, xlarge: 2048 }
const PALETTES = [
  ['#0f6cbd', '#62abf5'], ['#107c41', '#7ec384'], ['#c4314b', '#f1959f'], ['#8764b8', '#c5b4e3'],
  ['#ca5010', '#f4b183'], ['#038387', '#7fd1d3'], ['#4f6bed', '#a5b4fc'], ['#986f0b', '#e8c873'],
]

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Imagem de demonstração (SVG) para fotografias do drive "demo": não há ficheiro no Microsoft 365.
 * Gradiente estável por fotografia, com o nome, o local e a data.
 */
export function demoImage(m: Pick<Media, 'id' | 'name' | 'placeName' | 'takenAt' | 'width' | 'height'>, size = 'large'): string {
  const max = SIZES[size] ?? 800
  const ratio = (m.width ?? 4) / (m.height ?? 3)
  const w = Math.round(ratio >= 1 ? max : max * ratio)
  const h = Math.round(ratio >= 1 ? max / ratio : max)
  const [a, b] = PALETTES[m.id % PALETTES.length]
  const angle = (m.id * 47) % 360
  const font = Math.max(10, Math.round(Math.min(w, h) / 14))
  const label = size === 'small' ? '' : `
  <text x="50%" y="${h - font * 2.6}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${font}" fill="#fff" font-weight="600">${esc(m.name.replace(/\.[^.]+$/, ''))}</text>
  <text x="50%" y="${h - font * 1.2}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.round(font * 0.8)}" fill="#ffffffcc">${esc([m.placeName, m.takenAt?.toISOString().slice(0, 10)].filter(Boolean).join(' · '))}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${Math.round(w * 0.72)}" cy="${Math.round(h * 0.32)}" r="${Math.round(Math.min(w, h) * 0.14)}" fill="#ffffff33"/>
  <path d="M0 ${Math.round(h * 0.78)} L${Math.round(w * 0.3)} ${Math.round(h * 0.5)} L${Math.round(w * 0.55)} ${Math.round(h * 0.7)} L${Math.round(w * 0.78)} ${Math.round(h * 0.46)} L${w} ${Math.round(h * 0.74)} L${w} ${h} L0 ${h} Z" fill="#00000026"/>${label}
</svg>`
}
