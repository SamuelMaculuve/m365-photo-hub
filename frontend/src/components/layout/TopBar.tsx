import { SearchBox } from '@/components/search/SearchBox'
import { Brand } from './Brand'
import { UserMenu } from './UserMenu'
import { UploadButton } from './UploadButton'

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/90 px-3 backdrop-blur md:px-6">
      <span className="md:hidden"><Brand compact /></span>
      <SearchBox className="hidden sm:block" />
      <div className="ml-auto flex items-center gap-2">
        <UploadButton />
        <UserMenu />
      </div>
    </header>
  )
}
