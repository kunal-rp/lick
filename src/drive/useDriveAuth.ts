import { useCallback, useEffect, useState } from 'react'
import {
  currentToken,
  hasPriorGrant,
  restore as driveRestore,
  signIn as driveSignIn,
  signOut as driveSignOut,
} from './auth'

export type DriveAuthStatus = 'restoring' | 'signed-out' | 'signed-in'

export interface DriveAuth {
  status: DriveAuthStatus
  token: string | null
  signIn: () => Promise<void>
  signOut: () => void
}

/** React binding over the Drive auth module. */
export function useDriveAuth(): DriveAuth {
  // A valid cached token (rehydrated from sessionStorage on reload) lets us go
  // straight to signed-in with no popup and no 'restoring' flash.
  const [token, setToken] = useState<string | null>(() => currentToken())
  const [status, setStatus] = useState<DriveAuthStatus>(() => {
    if (currentToken() !== null) return 'signed-in'
    return hasPriorGrant() ? 'restoring' : 'signed-out'
  })

  useEffect(() => {
    if (status !== 'restoring') return
    let active = true
    driveRestore().then((next) => {
      if (!active) return
      setToken(next)
      setStatus(next !== null ? 'signed-in' : 'signed-out')
    })
    return () => {
      active = false
    }
    // Mount-only: `status` is read once to gate the initial restore attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = useCallback(async () => {
    const next = await driveSignIn()
    setToken(next)
    setStatus(next !== null ? 'signed-in' : 'signed-out')
    if (next !== null) {
      // Sanity check — folder/file work comes later.
      console.log('[drive] access token acquired:', next)
    }
  }, [])

  const signOut = useCallback(() => {
    driveSignOut()
    setToken(null)
    setStatus('signed-out')
  }, [])

  return { status, token, signIn, signOut }
}
