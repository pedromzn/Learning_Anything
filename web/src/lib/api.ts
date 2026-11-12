/**
 * The local API client. Every response comes as `{ data }`; an error becomes an `ApiError` with the message in the
 * interface language (from the error code when the app knows it; otherwise the server's). The types are in
 * `shared/api.ts`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CourseEvent } from '@shared/api'
import { t } from '@/i18n'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
  }
}

/** The known error codes come translated; "not found" and validation keep the server's more specific message. */
function translate(code: string | undefined): string | null {
  if (!code || code === 'not_found' || code === 'invalid') return null
  return t().errors[code] ?? null
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let answer: Response
  try {
    answer = await fetch(url, {
      method: method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(t().general.noServer, 0, 'no_server')
  }
  const json = (await answer.json().catch(() => null)) as { data?: T; error?: string; code?: string } | null
  if (!answer.ok) {
    throw new ApiError(
      translate(json?.code) ?? json?.error ?? t().general.serverResponded(answer.status),
      answer.status,
      json?.code,
    )
  }
  return json?.data as T
}

export const api = {
  get: <T>(url: string) => call<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => call<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => call<T>('PUT', url, body),
  del: <T>(url: string) => call<T>('DELETE', url),
}

export interface Data<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => Promise<void>
}

/** Fetches and keeps. `reload` does not flash the screen: it keeps the old data until the new data arrives. */
export function useData<T>(url: string | null): Data<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(Boolean(url))
  const current = useRef(url)
  current.current = url

  const reload = useCallback(async () => {
    if (!url) return
    try {
      const fresh = await api.get<T>(url)
      if (current.current === url) {
        setData(fresh)
        setError(null)
      }
    } catch (e) {
      if (current.current === url) setError(e instanceof ApiError ? e : new ApiError(String(e), 0))
    } finally {
      if (current.current === url) setLoading(false)
    }
  }, [url])

  useEffect(() => {
    setLoading(Boolean(url))
    setData(null)
    setError(null)
    void reload()
  }, [reload, url])

  return { data, error, loading, reload }
}

/**
 * The files the AI writes, in real time (SSE from `/api/events`). A single connection for the whole app, shared
 * among listeners; the browser reconnects on its own if the server restarts.
 */
const listeners = new Set<(e: CourseEvent) => void>()
let source: EventSource | null = null

function connect() {
  if (source || typeof EventSource === 'undefined') return
  source = new EventSource('/api/events')
  source.addEventListener('course', (m) => {
    try {
      const event = JSON.parse((m as MessageEvent).data) as CourseEvent
      for (const listen of listeners) listen(event)
    } catch {
      /* malformed event: ignore it, the next one will come */
    }
  })
}

export function useCourseEvents(onReceive: (e: CourseEvent) => void) {
  const ref = useRef(onReceive)
  ref.current = onReceive
  useEffect(() => {
    const listen = (e: CourseEvent) => ref.current(e)
    listeners.add(listen)
    connect()
    return () => {
      listeners.delete(listen)
      if (listeners.size === 0 && source) {
        source.close()
        source = null
      }
    }
  }, [])
}
