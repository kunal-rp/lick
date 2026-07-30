// Ambient types for the Google scripts loaded in index.html (GIS + gapi/Picker).
// No official typed SDK is used, so the surface we touch is declared here.
export {}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
}

interface GoogleOAuth {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    // Fired for non-interactive failures (e.g. a silent request that needs
    // consent, or a blocked popup) — the main callback is NOT called then.
    error_callback?: (error: { type?: string; message?: string }) => void
  }) => TokenClient
  revoke: (token: string, done?: () => void) => void
}

declare global {
  interface Window {
    gapi?: {
      load: (library: string, callback: () => void) => void
    }
    google?: {
      accounts?: { oauth2?: GoogleOAuth }
      // The Picker API is large and untyped; keep it loose.
      picker?: any
    }
  }
}
