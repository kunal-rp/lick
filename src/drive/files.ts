import { getValidToken } from './auth'

// Drive v3 REST access (authenticated via the OAuth token). Supports the app's
// model: the working folder holds script *folders*, each containing version
// *files*.

export interface DriveFile {
  id: string
  name: string
  mimeType: string
}

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const TEXT_MIME = 'text/plain'

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidToken()
  if (token === null) throw new Error('Not authenticated with Google Drive.')
  return { Authorization: `Bearer ${token}` }
}

async function listChildren(
  parentId: string,
  foldersOnly: boolean,
): Promise<DriveFile[]> {
  const mimeClause = foldersOnly
    ? `mimeType = '${FOLDER_MIME}'`
    : `mimeType != '${FOLDER_MIME}'`
  const params = new URLSearchParams({
    q: `'${parentId}' in parents and trashed = false and ${mimeClause}`,
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

/** Script folders directly inside the working folder. */
export function listFolders(parentId: string): Promise<DriveFile[]> {
  return listChildren(parentId, true)
}

/** Version files directly inside a script folder. */
export function listFiles(parentId: string): Promise<DriveFile[]> {
  return listChildren(parentId, false)
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

/** Create a subfolder (a new script) and return it. */
export async function createFolder(
  parentId: string,
  name: string,
): Promise<DriveFile> {
  const res = await fetch(`${API}/files?fields=id,name,mimeType`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  })
  if (!res.ok) throw new Error(`Drive create folder failed (${res.status})`)
  return (await res.json()) as DriveFile
}

/** Create a text file (a version) with the given content, and return it. */
export async function createFile(
  parentId: string,
  name: string,
  content: string,
): Promise<DriveFile> {
  const boundary = `lick${Math.random().toString(36).slice(2)}`
  const metadata = { name, parents: [parentId], mimeType: TEXT_MIME }
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    `${content}\r\n` +
    `--${boundary}--`
  const res = await fetch(
    `${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType`,
    {
      method: 'POST',
      headers: {
        ...(await authHeaders()),
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  if (!res.ok) throw new Error(`Drive create file failed (${res.status})`)
  return (await res.json()) as DriveFile
}

/** Overwrite a file's contents. */
export async function updateFileContent(
  fileId: string,
  content: string,
): Promise<void> {
  const res = await fetch(`${UPLOAD}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      ...(await authHeaders()),
      'Content-Type': 'text/plain; charset=UTF-8',
    },
    body: content,
  })
  if (!res.ok) throw new Error(`Drive save failed (${res.status})`)
}
