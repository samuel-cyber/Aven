import { useEffect, useState } from 'react'

export type View = 'overview' | 'customers' | 'calls' | 'actions'

export interface Route {
  view: View
  param: string | null
}

const VIEWS: View[] = ['overview', 'customers', 'calls', 'actions']

function parse(hash: string): Route {
  const [, view = '', param = ''] = hash.replace(/^#/, '').split('/')
  const v = (VIEWS as string[]).includes(view) ? (view as View) : 'overview'
  return { view: v, param: param ? decodeURIComponent(param) : null }
}

export function href(view: View, param?: string): string {
  return `#/${view}${param ? `/${encodeURIComponent(param)}` : ''}`
}

export function navigate(view: View, param?: string) {
  window.location.hash = href(view, param)
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}
