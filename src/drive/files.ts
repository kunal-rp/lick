import { getValidToken } from './auth'

// Minimal Drive v3 REST access (authenticated via the OAuth token — no API key
// needed for these calls). Enough to list a folder's files and read one.

export interface DriveFile {
  id: string
  name: string
  mimeType: string
}

const API = 'https://www.googleapis.com/drive/v3'

async function authHeaders(): Promise<HeadersInit> {
  const token = await getValidToken()
  if (token === null) throw new Error('Not authenticated with Google Drive.')
  return { Authorization: `Bearer ${token}` }
}

/** List the non-folder, non-trashed files directly inside a folder. */
export async function listFiles(folderId: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id,name,mimeType)',
    orderBy: 'name',
    pageSize: '1000',
  })
  const res = await fetch(`${API}/files?${params.toString()}`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`)
  const data = (await res.json()) as { files?: DriveFile[] }
  return data.files ?? []
}

/** Read a file's contents as text (Google Docs are exported to plain text). */
export async function readFile(file: DriveFile): Promise<string> {
  const isGoogleDoc = file.mimeType === 'application/vnd.google-apps.document'
  const url = isGoogleDoc
    ? `${API}/files/${file.id}/export?mimeType=text/plain`
    : `${API}/files/${file.id}?alt=media`
  const res = await fetch(url, { headers: await authHeaders() })
  if (!res.ok) throw new Error(`Drive read failed (${res.status})`)
  return res.text()
}
