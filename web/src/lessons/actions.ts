/** The two calls of a lesson item (attempt and hint), with the hint count and the XP toast already wired in. */

import { useMemo, useRef } from 'react'
import type { HintResponse, AttemptResponse } from '@shared/api'
import type { AttemptResult } from '@shared/course'
import { api } from '@/lib/api'
import { announce } from '@/lib/rewards'
import type { ItemActions } from './Item'

export function useLessonActions(courseId: string, lessonId: string): (itemId: string) => ItemActions {
  const hints = useRef<Record<string, number>>({})
  return useMemo(() => {
    hints.current = {}
    return (itemId: string): ItemActions => {
      const base = `/api/courses/${courseId}/lessons/${lessonId}/items/${itemId}`
      return {
        respond: async (answer): Promise<AttemptResult> => {
          const r = await api.post<AttemptResponse>(`${base}/attempt`, {
            answer,
            hintsUsed: hints.current[itemId] ?? 0,
          })
          announce(r.reward)
          return r
        },
        askHint: async (index) => {
          const r = await api.post<HintResponse>(`${base}/hint`, { index })
          hints.current[itemId] = Math.max(hints.current[itemId] ?? 0, index + 1)
          return r.hint
        },
      }
    }
  }, [courseId, lessonId])
}
