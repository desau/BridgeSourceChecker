import { join } from 'path'

export interface DriveMap {
  [driveID: string]: ChartMap
}

export interface ChartMap {
  [filesHash: string]: DriveChart
}

export interface DriveSource {
  /** True if the sourceDriveID links to a file, not a folder */
  isDriveFileSource?: boolean

  /** The icon that should be on each chart in this source */
  setlistIcon?: string

  /** A name for this source */
  sourceName: string

  /** The ID of the source; found at the end of a Google Drive URL */
  sourceDriveID: string
}

export interface DriveChart {
  source: DriveSource
  isArchive: boolean
  downloadPath: string
  filesHash: string
  folderName: string
  folderID: string
  files: DriveFile[]
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  webContentLink: string
  modifiedTime: string
  md5Checksum: string
  size: string
}

export const ERRORS_PATH = join('.', 'ScanErrors')
export const DRIVE_SCAN_DATA_PATH = join('.', 'ScanData', 'driveScanData.json')
export const VERSIONS_TO_SCAN_PATH = join('.', 'ScanData', 'versionsToScan.json')
export const VERSIONS_TO_REMOVE_PATH = join('.', 'ScanData', 'versionsToRemove.json')