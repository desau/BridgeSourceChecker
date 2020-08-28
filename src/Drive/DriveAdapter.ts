/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { google } from 'googleapis'
import Bottleneck from 'bottleneck'
import { Readable } from 'stream'
import { log, sanitizeFilename } from '../UtilFunctions'
import { parse } from 'path'
const drive = google.drive('v3')
const limiter = new Bottleneck({
  minTime: 200 // Wait 200 ms between requests
})

const fieldList = 'id,mimeType,webContentLink,modifiedTime,name,originalFilename,fullFileExtension,md5Checksum,size,capabilities,shortcutDetails'

/**
 * Initializes the Drive API by authenticating using process.env.GOOGLE_APPLICATION_CREDENTIALS
 */
export async function initDriveAuth() {
  const auth = new google.auth.GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/drive'
  })

  google.options({
    auth: await auth.getClient()
  })
}

export interface DriveFileResponse {
  id: string
  /**
   * File: application/x-zip-compressed, application/octet-stream, application/ogg, image/jpeg, etc...
   * Folder: application/vnd.google-apps.folder
   * Shortcut: application/vnd.google-apps.shortcut
   * Third-party file?: application/vnd.google-apps.drive-sdk
   */
  mimeType: string
  webContentLink: string
  modifiedTime: string
  name: string
  fullFileExtension: string
  md5Checksum: string
  size: string // In bytes
  capabilities: { canDownload: boolean }
  shortcutDetails?: {
    targetId: string
    targetMimeType: string
  }
}

/**
 * @param folderID https://drive.google.com/open?id=<folderID>
 * @returns the list of `DriveFileResponse` objects inside the google drive folder with `folderID` (or `[]` if it failed to read the folder).
 */
export async function readDriveFolder(folderID: string): Promise<DriveFileResponse[]> {
  /* eslint-disable-next-line @typescript-eslint/no-use-before-define */ // _readDriveFolder is a function
  return await _readDriveFolder(folderID, undefined)
}

const _readDriveFolder = limiter.wrap(async (folderID: string, nextPageToken: string, retryCount = 0) => {
  try {
    const listResult = await drive.files.list({
      q: `'${folderID}' in parents`,
      fields: `nextPageToken, files(${fieldList})`,
      pageSize: 1000,
      pageToken: nextPageToken
    })
    const responseData = listResult.data.files
    if (listResult.data.nextPageToken != undefined) {
      responseData.push(...await _readDriveFolder(folderID, listResult.data.nextPageToken))
    }
    responseData.forEach(file => file.name = getRealFilename(file.originalFilename, file.name))
    return responseData
  } catch (err) {
    log.error(`Failed to get subfolders; code: ${err.code}`)
    if (retryCount >= 5) {
      log.error(`Unable to list files for folder with ID [${folderID}]: `, err)
      return []
    } else {
      log.warn(`Retry n°${retryCount + 1}...`)
      return await _readDriveFolder(folderID, nextPageToken, retryCount + 1)
    }
  }
})

/**
 * @param fileID https://drive.google.com/open?id=<fileID>
 * @returns the `DriveFileResponse` object with `fileID`.
 * @throws an exception if it failed to read the file.
 */
export async function readDriveFile(fileID: string): Promise<DriveFileResponse> {
  /* eslint-disable-next-line @typescript-eslint/no-use-before-define */ // _readDriveFile is a function
  return await _readDriveFile(fileID)
}

const _readDriveFile = limiter.wrap(async (fileID: string, retryCount = 0) => {
  try {
    const fileResult = await drive.files.get({
      fileId: fileID,
      fields: fieldList
    })

    fileResult.data.name = getRealFilename(fileResult.data.originalFilename, fileResult.data.name)
    return fileResult.data
  } catch (err) {
    log.error(`Failed to get file; code: ${err.code}`)
    if (retryCount >= 5) {
      log.error(`Unable to get file with ID [${fileID}]: `, err)
      throw new Error()
    } else {
      log.warn(`Retry n°${retryCount + 1}...`)
      return await _readDriveFile(fileID, retryCount + 1)
    }
  }
})

/**
 * @param fileID https://drive.google.com/open?id=<fileID>
 * @returns a `PassThrough` stream for a download of the object with `fileID`.
 * @throws an exception if it failed to create the stream.
 */
export async function getDownloadStream(fileID: string) {
  /* eslint-disable-next-line @typescript-eslint/no-use-before-define */ // _getDownloadStream is a function
  return await _getDownloadStream(fileID) as Readable
}

const _getDownloadStream = limiter.wrap(async (fileID: string, retryCount = 0) => {
  try {
    const streamResult = await drive.files.get({
      fileId: fileID,
      alt: 'media'
    }, {
      responseType: 'stream'
    })

    return streamResult.data
  } catch (err) {
    log.error(`Failed to download file; code: ${err.code}`)
    if (retryCount >= 10) {
      log.error(`Unable to download file with ID [${fileID}]: `, err)
      throw new Error()
    } else {
      const delay = Math.pow(4, retryCount + 1)
      log.warn(`Retry n°${retryCount + 1}... (${delay}s)`)
      await new Promise<void>(resolve => setTimeout(() => resolve(), 1000 * delay))
      return await _getDownloadStream(fileID, retryCount + 1)
    }
  }
})

function getRealFilename(originalFilename: string | undefined, name: string | undefined) {
  if (originalFilename == undefined && name == undefined) {
    console.log('ERROR: drive returned an unnamed file')
    return 'NAME_UNDEFINED'
  }

  if (originalFilename == undefined) { return sanitizeFilename(name) }
  if (name == undefined) { return sanitizeFilename(originalFilename) }

  const ext = parse(name).ext
  const originalExt = parse(originalFilename).ext
  if (originalExt == '' || ext == originalExt) {
    return sanitizeFilename(name)
  } else {
    return sanitizeFilename(name + originalExt)
  }
}