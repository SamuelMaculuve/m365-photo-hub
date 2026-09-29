import { Album, Heart, Image, MapPin, Settings, Share2, Shield, Trash2, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  labelKey: string
  icon: LucideIcon
  end?: boolean
  adminOnly?: boolean
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.photos', icon: Image, end: true },
  { to: '/albums', labelKey: 'nav.albums', icon: Album },
  { to: '/favourites', labelKey: 'nav.favourites', icon: Heart },
  { to: '/people', labelKey: 'nav.people', icon: Users },
  { to: '/places', labelKey: 'nav.places', icon: MapPin },
  { to: '/shared', labelKey: 'nav.shared', icon: Share2 },
  { to: '/trash', labelKey: 'nav.trash', icon: Trash2 },
]

export const SECONDARY_NAV: NavItem[] = [
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
  { to: '/admin', labelKey: 'nav.admin', icon: Shield, adminOnly: true },
]
