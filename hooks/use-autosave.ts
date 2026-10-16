"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error"

interface Options<T> {
  /** the value to keep saved; a change schedules a save */
  value: T
  /** false while read-only: nothing is ever saved */
  enabled: boolean
  /** returns { error } (or throws) on failure */
  save: (value: T) => Promise<{ error?: string } | void>
  /** quiet period after the last change before saving */
  delay?: number
}

/**
 * Debounced, ordered autosave.
 *
 *  - Rapid changes collapse into one request after `delay` ms.
 *  - Only one request is in flight at a time. If the value changes while a save
 *    runs, the newest value is saved right after, so an older response can never
 *    overwrite a newer value.
 *  - Pending changes are flushed when the page is hidden or the component
 *    unmounts (e.g. switching to another tab of the counter page).
 *  - Leaving or refreshing with unsaved changes asks for confirmation.
 */
export function useAutosave<T> ( {
  value,
  enabled,
  save,
  delay = 700,
}: Options<T> )
{
  const [ status, setStatus ] = useState<SaveStatus>( "idle" )
  const [ errorMessage, setErrorMessage ] = useState( "" )

  const latest = useRef( value )
  latest.current = value
  const saveRef = useRef( save )
  saveRef.current = save
  const enabledRef = useRef( enabled )
  enabledRef.current = enabled

  const lastSavedKey = useRef( JSON.stringify( value ) )
  const inFlight = useRef<Promise<void> | null>( null )
  const timer = useRef<ReturnType<typeof setTimeout> | null>( null )

  const hasUnsaved = () => JSON.stringify( latest.current ) !== lastSavedKey.current

  const run = useCallback( (): Promise<void> =>
  {
    if ( inFlight.current ) return inFlight.current

    const p = ( async () =>
    {
      setStatus( "saving" )
      try
      {
        // keep going until what is on screen is what is saved
        while ( enabledRef.current && hasUnsaved() )
        {
          const snapshot = latest.current
          const key = JSON.stringify( snapshot )
          const res = await saveRef.current( snapshot )
          if ( res && res.error ) throw new Error( res.error )
          lastSavedKey.current = key
        }
        setErrorMessage( "" )
        setStatus( "saved" )
      } catch ( e )
      {
        setErrorMessage( e instanceof Error ? e.message : "Could not save" )
        setStatus( "error" )
      } finally
      {
        inFlight.current = null
      }
    } )()

    inFlight.current = p
    return p
  }, [] )

  /** Save immediately and wait until everything on screen is stored. */
  const flush = useCallback( async (): Promise<boolean> =>
  {
    if ( timer.current )
    {
      clearTimeout( timer.current )
      timer.current = null
    }
    if ( enabledRef.current && hasUnsaved() ) await run()
    else if ( inFlight.current ) await inFlight.current
    return !hasUnsaved()
  }, [ run ] )

  // schedule a save whenever the value changes
  useEffect( () =>
  {
    if ( !enabled ) return
    if ( !hasUnsaved() ) return

    setStatus( "unsaved" )
    if ( timer.current ) clearTimeout( timer.current )
    timer.current = setTimeout( () =>
    {
      timer.current = null
      run()
    }, delay )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ JSON.stringify( value ), enabled, delay, run ] )

  // flush on tab hide / unmount, warn on leaving with unsaved changes
  useEffect( () =>
  {
    const onHide = () =>
    {
      if ( document.visibilityState === "hidden" && enabledRef.current && hasUnsaved() )
        flush()
    }
    const onBeforeUnload = ( e: BeforeUnloadEvent ) =>
    {
      if ( enabledRef.current && ( hasUnsaved() || inFlight.current ) )
      {
        flush()
        e.preventDefault()
        e.returnValue = ""
      }
    }
    document.addEventListener( "visibilitychange", onHide )
    window.addEventListener( "beforeunload", onBeforeUnload )

    return () =>
    {
      document.removeEventListener( "visibilitychange", onHide )
      window.removeEventListener( "beforeunload", onBeforeUnload )
      if ( timer.current ) clearTimeout( timer.current )
      // component is going away: still send the latest values
      if ( enabledRef.current && hasUnsaved() ) run()
    }
  }, [ flush, run ] )

  return { status, errorMessage, flush, retry: run }
}
