/**
 * The rewards the server returns (XP, level, streak, achievements) go into this queue, and the shell shows each one
 * as a toast that rises and fades. Whoever answers an exercise just calls `announce(reward)`.
 */
import { create } from 'zustand'
import type { Reward } from '@shared/gamification'

interface Warning {
  id: number
  reward: Reward
}

interface Queue {
  warnings: Warning[]
  announce: (r: Reward | null | undefined) => void
  dismiss: (id: number) => void
}

let next = 1

export const useRewards = create<Queue>((set) => ({
  warnings: [],
  announce: (r) => {
    if (!r || (r.xp <= 0 && r.achievements.length === 0 && !r.goalReachedNow && r.levelAfter === r.levelBefore)) return
    const id = next++
    set((s) => ({ warnings: [...s.warnings, { id, reward: r }] }))
    window.setTimeout(() => set((s) => ({ warnings: s.warnings.filter((a) => a.id !== id) })), 4200)
  },
  dismiss: (id) => set((s) => ({ warnings: s.warnings.filter((a) => a.id !== id) })),
}))

export const announce = (r: Reward | null | undefined) => useRewards.getState().announce(r)
