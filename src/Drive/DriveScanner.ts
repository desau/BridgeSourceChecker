import { readDriveFolder, readDriveFile, DriveFileResponse } from './DriveAdapter'
import { createHash } from 'crypto'
import { yellow } from 'cli-color'
import { log, lower } from '../UtilFunctions'
import { DriveMap, DriveSource } from './scanDataInterface'
import { scanSettings } from '../../config/scanConfig'
import * as cli from 'cli-color'


export class DriveScanner {
  private results: DriveMap = {}
  private currentSource: DriveSource
  private visitedDriveIDs: string[] = []
  private sourceDriveIDs: string[] = []

  constructor(private sources: DriveSource[]) { }

  /**
   * Scans all google drive folders in `this.sources`
   * @returns all the potential chart files found in the sources.
   */
  async scanDrive() {
    // Do this before checking `onlyScanLastSource` to prevent scanning nested sources, even if they weren't scanned this time.
    this.sourceDriveIDs = this.sources.map(source => source.sourceDriveID)
    if (scanSettings.onlyScanLastXSources && scanSettings.onlyScanLastXSources > 0) { // Only scan the last source
      this.visitedDriveIDs = this.sources.slice(0, this.sources.length - scanSettings.onlyScanLastXSources).map(source => source.sourceDriveID)
      this.sources = this.sources.slice(this.sources.length - scanSettings.onlyScanLastXSources, this.sources.length)
    }
    for (const source of this.sources) {
      log.info(cli.green(`Scanning [${source.sourceName}]...`))
      this.currentSource = source
      this.results[this.currentSource.sourceDriveID] = {}
      if (source.isDriveFileSource) {
        await this.scanDriveItem(source.sourceDriveID, source.sourceName, await readDriveFile(source.sourceDriveID), true)
      } else {
        await this.walkDriveDirectory(source.sourceDriveID, source.sourceName)
      }
    }

    return this.results
  }

  /**
   * Scans the google drive folder with `folderID` and all its subfolders, and adds any archives or chart folders to `this.results`.
   */
  private async walkDriveDirectory(folderID: string, folderName: string) {
    this.visitedDriveIDs.push(folderID)
    const items = await readDriveFolder(folderID)
    if (items.length == 0) {
      // Don't save these to file, since they appear on every rescan
      log.info(cli.yellow(`[emptyFolder] "${folderName}" at https://drive.google.com/drive/folders/${folderID}`))
    }
    const files: DriveFileResponse[] = []
    for (const item of items) {
      const isChartFile = await this.scanDriveItem(folderID, folderName, item, false)
      if (isChartFile) {
        files.push(item)
      }
    }

    if (this.appearsToBeChartFolder(files.map(file => file.fullFileExtension))) {
      log.info(`[${this.currentSource.sourceName}] Chart folder [${cli.green(folderName)}]: [${files.map(file => cli.cyan(file.name)).join(', ')}]`)
      const filesHash = this.getFilesHash(files)
      this.results[this.currentSource.sourceDriveID][filesHash] = {
        source: this.currentSource,
        isArchive: false,
        downloadPath: null,
        folderName: folderName,
        folderID: folderID,
        filesHash: filesHash,
        files: files
      }
    }
  }

  /**
   * Scans a single Google Drive item, which could be a shortcut, folder, file, or something google-specific.
   * @returns `true` if this item could be a file that belongs inside a single chart folder.
   */
  private async scanDriveItem(parentFolderID: string, folderName: string, item: DriveFileResponse, isSource: boolean) {
    // Handle Google Drive shortcuts
    if (item.mimeType == 'application/vnd.google-apps.shortcut') {
      if (this.visitedDriveIDs.includes(item.shortcutDetails.targetId)) { return false } // Avoid scanning IDs multiple times
      if (item.shortcutDetails.targetMimeType == 'application/vnd.google-apps.folder') {
        await this.walkDriveDirectory(item.shortcutDetails.targetId, item.name)
        return false
      } else {
        try {
          item = await readDriveFile(item.shortcutDetails.targetId)
        } catch (e) { return false }
      }
    }

    // Handle regular drive items
    this.visitedDriveIDs.push(item.id)
    if (this.sourceDriveIDs.includes(item.id) && !isSource) { return false } // Nested sources
    if (item.mimeType == 'application/vnd.google-apps.folder') {
      await this.walkDriveDirectory(item.id, item.name)
    } else if (item.mimeType == 'application/vnd.google-apps.drive-sdk') {
      log.warn(`Unsupported MIME Type: application/vnd.google-apps.drive-sdk`)
      log.warn(`"${item.name}" in folder: [${parentFolderID}]`, 'source:', this.currentSource)
    } else if (['zip', 'rar', '7z'].includes(item.fullFileExtension)) {
      if (Number(item.size) > scanSettings.maxDownloadSizeMB * 5e6) { // item.size is the number of bytes
        log.warn(`${yellow('WARNING:')} [${item.name}] in [${this.currentSource.sourceName}] is too large to download`)
        return false
      } else {
        log.info(`[${this.currentSource.sourceName}] Archive: ${item.name}`)
      }
      this.results[this.currentSource.sourceDriveID][item.md5Checksum] = {
        source: this.currentSource,
        isArchive: true,
        downloadPath: null,
        folderName: folderName,
        folderID: parentFolderID,
        filesHash: item.md5Checksum,
        files: [item]
      }
    } else if (item.fullFileExtension != undefined) {
      // Don't include files without extensions, since they are not chart files
      return true
    }

    return false
  }

  /**
   * @returns `true` if the list of filename `extensions` appears to be intended as a chart folder.
   */
  private appearsToBeChartFolder(extensions: string[]) {
    const ext = extensions.map(extension => lower(extension))
    const containsNotes = (ext.includes('chart') || ext.includes('mid'))
    const containsAudio = (ext.includes('ogg') || ext.includes('mp3') || ext.includes('wav'))
    return (containsNotes && containsAudio)
  }

  /**
   * @returns an MD5 hash of all the files in `files`.
   */
  private getFilesHash(files: DriveFileResponse[]) {
    const md5s = files.map(file => file.md5Checksum)
    return createHash('md5').update(md5s.sort().join()).digest('hex')
  }
}