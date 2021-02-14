import * as fs from 'fs'
import { join, basename } from 'path'
import * as util from 'util'
import { SeriousErrorTypes } from './chartDataInterface'
import { VersionFactory } from './VersionFactory'
import { Version } from './Version'
import { failScan, failRead } from '../ErrorFunctions'
import { log } from '../UtilFunctions'
import { DriveMap, DriveChart } from '../Drive/scanDataInterface'
import { cyan, red } from 'cli-color'
import { SingleBar, Presets } from 'cli-progress'
import { scanErrors } from './ScanErrors'
import { scanSettings } from '../../config/scanConfig'
import { g } from '../main'

export let errorBuffer: string[] = []

/**
 * Scans `versionsToScan`, where each `DriveChart` can contain any number of actual charts inside.
 * @returns an array of `Version` objects that should be synced with the database.
 */
export async function scanNewDownloads(chartsToScan: DriveMap) {
  const downloadedVersions: Version[] = []

  errorBuffer = []
  let lastScannedName = ''
  let totalCount = 0
  Object.keys(chartsToScan).forEach(driveID => totalCount += Object.keys(chartsToScan[driveID]).length)
  const progressBar = new SingleBar({
    barsize: 60,
    format: `Scanning charts [{bar}] {percentage}% | {value}/{total} | {name}`,
    hideCursor: true
  }, Presets.legacy)
  progressBar.start(totalCount, 0, { name: '' })

  for (const driveID of Object.keys(chartsToScan)) {
    let driveChartCount = 0

    for (const filesHash of Object.keys(chartsToScan[driveID])) {
      const chartToScan = chartsToScan[driveID][filesHash]
      const chartSize = chartToScan.files.map(file => +file.size).reduce((a, b) => a + b, 0)

      progressBar.increment(1, { name: chartSize > 1.3e8 && chartToScan.isArchive ? chartToScan.files[0].name : lastScannedName })

      if (chartToScan.downloadPath == null) { continue } // Failed to download for some reason
      const newVersions = await new LibraryScanner().scanLibrary(chartToScan)

      if (newVersions.length != 0) {
        driveChartCount += newVersions.length
        lastScannedName = newVersions.length > 1 ? chartToScan.files[0].name : newVersions[0].chartName
        for (const newVersion of newVersions) {
          newVersion.driveData = Object.assign({ inChartPack: newVersions.length > 1 }, chartToScan)
          // Commented out for testing
          // await newVersion.checkAlbumArt()
          newVersion.addAdditionalErrors()
          downloadedVersions.push(newVersion)
        }
      }
    }

    if (driveChartCount < scanSettings.minimumChartCount && (scanSettings.maxDownloadsPerDrive >= driveChartCount || scanSettings.maxDownloadsPerDrive == -1)) {
      const oslxs = scanSettings.onlyScanLastXSources
      const firstScannedSourceIndex = oslxs && oslxs > 0 ? g.sources.length - oslxs : 0
      const scannedSources = g.sources.slice(firstScannedSourceIndex, g.sources.length)
      const source = scannedSources.find(source => source.sourceDriveID == driveID)
      const placeholderChart: DriveChart = {
        source: source,
        folderID: source.sourceDriveID,
        folderName: source.sourceName,
        downloadPath: '...',
        files: [],
        filesHash: '...',
        isArchive: false
      }

      scanErrors.push({
        type: SeriousErrorTypes.notEnoughCharts,
        chart: chartsToScan[driveID][Object.keys(chartsToScan[driveID])[0]] ?? placeholderChart,
        description: `This source has fewer than ${scanSettings.minimumChartCount} charts.`,
      })
    }
  }

  progressBar.stop()

  log.error(errorBuffer.join('\n'))
  errorBuffer = []

  return downloadedVersions
}

class LibraryScanner {
  private readonly readdir = util.promisify(fs.readdir)

  private results: Version[] = []

  /**
   * Scans `songsFolderPath` and all subdirectories for songs.
   * `Library.libraryIssues` is populated with any scan issues in `songsFolderPath`.
   * @returns an array of all valid Versions found under `songsFolderPath`.
   */
  async scanLibrary(driveChart: DriveChart) {

    // Load folder contents
    let files: fs.Dirent[] = null
    try {
      files = await this.readdir(driveChart.downloadPath, { withFileTypes: true })
    } catch (e) { failRead(driveChart.downloadPath, e); return [] }

    // Check for empty folder
    if (files.length == 0) {
      failScan(driveChart.downloadPath)
      return []
    }

    // Scan folder
    await this.scanFolder(driveChart.downloadPath, driveChart)

    return this.results
  }

  /**
   * Scans `filepath` and all subdirectories for songs.
   * `Library.libraryIssues` is populated with any scan issues in `filepath`.
   * Appends new `Version` objects for all valid Versions found under `songsFolderPath` to `this.results`.
   */
  private async scanFolder(filepath: string, driveChart: DriveChart) {

    // Load folder contents
    let files: fs.Dirent[] | null = null
    try {
      files = await this.readdir(filepath, { withFileTypes: true })
    } catch (e) { failRead(filepath, e); return }

    // Check for empty folder
    if (files.length == 0) {
      this.handleEmptyFolder(filepath, driveChart)
      return
    }

    // Determine folder structure
    let hasFolders = false
    let hasFiles = false
    const promises: Promise<void>[] = []
    for (const file of files) {
      if (file.isDirectory()) {
        hasFolders = true
        // smh, Apple should follow the principle of least astonishment
        if (file.name != '__MACOSX') {
          promises.push(this.scanFolder(join(filepath, file.name), driveChart))
        }
      } else {
        hasFiles = true
      }
    }
    await Promise.all(promises)

    // Skip chart analysis if hasFolders
    if (hasFolders) {
      if (hasFiles) {
        scanErrors.push({
          type: SeriousErrorTypes.filesFolders,
          chart: driveChart,
          chartText: basename(filepath),
          description: `There are both files and folders in this directory: [${files.map(file => file.name).join()}]`
        })
      }
      return
    }

    try {
      // Add version to `results` if it is a valid chart
      const newVersion = await VersionFactory.construct(filepath, files, driveChart)
      this.results.push(newVersion)
    } catch (e) {
      errorBuffer.push(`[${cyan(driveChart.source.sourceName)}] ` + red('Failed to parse chart: ') + e)
      errorBuffer.push(`https://drive.google.com/drive/folders/${driveChart.folderID}\n`)
    }
  }

  /**
   * Attempts to delete `filepath`; adds an issue to `libraryIssues` if it was not deleted
   */
  private handleEmptyFolder(filepath: string, driveChart: DriveChart) {
    scanErrors.push({ // Add `emptyFolder` issue if the folder was not deleted
      type: SeriousErrorTypes.emptyFolder,
      chart: driveChart,
      chartText: basename(filepath),
      description: 'There are no files in this folder.'
    })
  }
}