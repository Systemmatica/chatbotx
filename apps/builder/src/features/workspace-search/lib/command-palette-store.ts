import { create } from "zustand"

type CommandPaletteState = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

/** Shared open state so the sidebar button and ⌘K / Ctrl+K drive one palette. */
export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}))
