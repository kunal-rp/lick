// Google Drive OAuth via Google Identity Services (loaded in index.html).
//
// Access tokens are short-lived and browser-side OAuth has no refresh token.
// To keep the user signed in across reloads WITHOUT a popup on every load, we
// cache the current token + expiry in sessionStorage (per-tab, cleared when the
// tab closes — not long-term, and not localStorage). On reload a still-valid
// cached token is reused directly with no GIS round-trip and no popup; only
// when it has actually expired do we fall back to a silent re-acquire
// (requestAccessToken with prompt: ''), which briefly flashes a popup because
// GIS has no invisible refresh. A separate non-sensitive "granted" flag records
// that consent was given, so we know a silent restore is worth attempting.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPE = 'https://www.googleapis.com/auth/drive'
// Renew a bit before the real expiry to avoid using a token that dies mid-flight.
const EXPIRY_SKEW_MS = 60_000
const GRANTED_KEY = 'lick.drive-granted' // localStorage — consent-given flag
const TOKEN_KEY = 'lick.drive-token' // sessionStorage — token + expiry cache

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
}

let tokenClient: TokenClient | null = null
let accessToken: string | null = null
let expiresAt = 0 // epoch ms
// Resolver for the request currently awaiting the GIS callback.
let pending: ((token: string | null) => void) | null = null

function saveStoredToken(): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, expiresAt }))
  } catch {
    // Storage unavailable — reloads will just re-acquire silently.
  }
}

function clearStoredToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

function loadStoredToken(): void {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (raw === null) return
    const parsed = JSON.parse(raw) as { accessToken?: unknown; expiresAt?: unknown }
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.expiresAt === 'number'
    ) {
      accessToken = parsed.accessToken
      expiresAt = parsed.expiresAt
    }
  } catch {
    // Corrupt cache — ignore.
  }
}

// Rehydrate any cached token when the module loads (i.e. on page reload).
loadStoredToken()

function markGranted(): void {
  try {
    localStorage.setItem(GRANTED_KEY, '1')
  } catch {
    // Storage unavailable — silent restore just won't be attempted next load.
  }
}

function clearGranted(): void {
  try {
    localStorage.removeItem(GRANTED_KEY)
  } catch {
    // ignore
  }
}

/** Whether the user has previously granted access (persisted across reloads). */
export function hasPriorGrant(): boolean {
  try {
    return localStorage.getItem(GRANTED_KEY) === '1'
  } catch {
    return false
  }
}

function oauth() {
  const api = window.google?.accounts?.oauth2
  if (!api) {
    throw new Error('Google Identity Services not loaded yet.')
  }
  return api
}

/** Resolve once the GIS script is available (it loads async), or false on timeout. */
function whenReady(): Promise<boolean> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(true)
  return new Promise((resolve) => {
    let tries = 0
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer)
        resolve(true)
      } else if (++tries > 100) {
        clearInterval(timer)
        resolve(false)
      }
    }, 50)
  })
}

/** Resolve the in-flight request (if any) exactly once. */
function settle(token: string | null): void {
  const resolve = pending
  pending = null
  resolve?.(token)
}

function ensureClient(): TokenClient {
  if (tokenClient !== null) return tokenClient
  tokenClient = oauth().initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      if (response.error || !response.access_token) {
        settle(null)
        return
      }
      accessToken = response.access_token
      expiresAt = Date.now() + (response.expires_in ?? 0) * 1000
      markGranted()
      saveStoredToken()
      settle(accessToken)
    },
    // A silent request that needs interaction fires this, not `callback`.
    error_callback: () => settle(null),
  })
  return tokenClient
}

/**
 * Request a token (optionally with a prompt), resolving via the GIS callback.
 * `timeoutMs` guards against GIS never calling back (which would otherwise hang
 * a silent restore) — used only for non-interactive requests.
 */
function request(prompt?: string, timeoutMs?: number): Promise<string | null> {
  return new Promise((resolve) => {
    let client: TokenClient
    try {
      client = ensureClient()
    } catch {
      resolve(null)
      return
    }

    let done = false
    const finish = (token: string | null) => {
      if (done) return
      done = true
      resolve(token)
    }
    // `pending` is what the GIS callbacks invoke; the timeout shares it.
    pending = finish
    if (timeoutMs !== undefined) {
      setTimeout(() => {
        if (pending === finish) pending = null
        finish(null)
      }, timeoutMs)
    }

    try {
      client.requestAccessToken(prompt === undefined ? {} : { prompt })
    } catch {
      if (pending === finish) pending = null
      finish(null)
    }
  })
}

function isValid(): boolean {
  return accessToken !== null && Date.now() < expiresAt - EXPIRY_SKEW_MS
}

/** The current in-memory token if still valid, else null (no network/popup). */
export function currentToken(): string | null {
  return isValid() ? accessToken : null
}

/** Trigger the interactive sign-in flow; resolves with a token (or null). */
export function signIn(): Promise<string | null> {
  return request()
}

/**
 * Return the current token if still valid, otherwise attempt a silent renew
 * (no popup) before giving up with null.
 */
export async function getValidToken(): Promise<string | null> {
  if (isValid()) return accessToken
  return request('', 8000)
}

/**
 * Attempt to restore a session on page load without any popup. Only tried if
 * the user granted access before; resolves with a token or null.
 */
export async function restore(): Promise<string | null> {
  if (!hasPriorGrant()) return null
  // Reuse a still-valid cached token immediately — no GIS call, no popup.
  if (isValid()) return accessToken
  const ready = await whenReady()
  if (!ready) return null
  return getValidToken()
}

/** Revoke the current token and clear in-memory + persisted state. */
export function signOut(): void {
  const token = accessToken
  accessToken = null
  expiresAt = 0
  clearGranted()
  clearStoredToken()
  if (token !== null) {
    try {
      oauth().revoke(token)
    } catch {
      // GIS not available; in-memory state is already cleared.
    }
  }
}
