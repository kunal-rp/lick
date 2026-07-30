import { getValidToken } from './auth'

// The Google Picker, configured to let the user choose a Drive FOLDER as the
// app's working directory. The Picker API is loaded lazily via gapi and is
// untyped, so `picker` is treated loosely.

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY

export interface DriveFolder {
  id: string
  name: string
}

let pickerReady = false

function loadPicker(): Promise<void> {
  if (pickerReady) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const gapi = window.gapi
    if (!gapi) {
      reject(new Error('gapi (apis.google.com/js/api.js) not loaded yet.'))
      return
    }
    gapi.load('picker', () => {
      pickerReady = true
      resolve()
    })
  })
}

/**
 * Open the Google Picker for folder selection and resolve with the chosen
 * folder, or null if the user cancels. Requires a valid OAuth token.
 */
export async function pickFolder(): Promise<DriveFolder | null> {
  const token = await getValidToken()
  if (token === null) return null

  await loadPicker()
  const picker = window.google?.picker
  if (!picker) return null

  return new Promise<DriveFolder | null>((resolve) => {
    // ViewId.FOLDERS shows folders; setSelectFolderEnabled(true) is the current
    // way to let the user pick a folder itself rather than only navigate into
    // it. Restricting mime types keeps the list to folders.
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder')

    const instance = new picker.PickerBuilder()
      .setTitle('Select a working folder')
      .setDeveloperKey(API_KEY)
      .setOAuthToken(token)
      .addView(view)
      .setCallback((data: Record<string, unknown>) => {
        const action = data[picker.Response.ACTION]
        if (action === picker.Action.PICKED) {
          const docs = data[picker.Response.DOCUMENTS] as Record<string, string>[]
          const doc = docs[0]
          resolve({
            id: doc[picker.Document.ID],
            name: doc[picker.Document.NAME],
          })
        } else if (action === picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()

    instance.setVisible(true)
  })
}
