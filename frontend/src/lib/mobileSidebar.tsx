import { createContext, useContext, useState, type ReactNode } from 'react'

interface MobileSidebarCtx {
  isOpen: boolean
  open: () => void
  close: () => void
}

const MobileSidebarContext = createContext<MobileSidebarCtx>({
  isOpen: false,
  open: () => {},
  close: () => {},
})

export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <MobileSidebarContext.Provider value={{
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }}>
      {children}
    </MobileSidebarContext.Provider>
  )
}

export function useMobileSidebar() {
  return useContext(MobileSidebarContext)
}
