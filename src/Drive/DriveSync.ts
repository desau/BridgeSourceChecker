import { DriveScanner } from './DriveScanner'
import { DriveFile, DriveMap, ChartMap, DRIVE_SCAN_DATA_PATH, VERSIONS_TO_REMOVE_PATH } from './scanDataInterface'
import { writeFileSync, readFileSync } from 'jsonfile'
import { log } from '../UtilFunctions'
import * as clipboardy from 'clipboardy'
import { keyInPause } from 'readline-sync'
import { scanSettings } from '../../config/scanConfig'
import { g } from '../main'

export class DriveSync {

  private chartsToScan: DriveMap = {}
  private chartsToRemove: DriveMap = {}

  /** The old drive scan data but without newly removed versions */
  private reducedOldDriveScanData: DriveMap = {}

  /**
   * Scans `sources.json` for charts and compares them against the current `driveScanData.json` file.
   * Removes deleted versions from `driveScanData.json`, but doesn't add `chartsToScan`.
   * Saves `driveScanData.json` and `versionsToRemove.json` to file.
   * @returns `chartsToScan` (downloadPath properties will all be `null`)
   * @throws an exception if the results failed to save to `./scanData/`
   */
  async scanSources() {
    if (scanSettings.clipboardLinksMode) {
      g.sources = this.getSourcesFromClipboard()
    }
    this.compareSources(readFileSync(DRIVE_SCAN_DATA_PATH), await new DriveScanner(g.sources).scanDrive())
    this.saveRemovedVersions()
    return this.simplifyDriveMap(this.chartsToScan)
  }

  /**
   * Reads text containing drive links from the clipboard.
   * @returns a list of the drive IDs in those links.
   */
  private getSourcesFromClipboard() {
      while (true) {
        keyInPause('Copy text containing one or more drive links to the clipboard, then press any key...', { guide: false })
        const input = clipboardy.readSync()
        const resultsWithSlash = input.match(/\/[01][a-zA-Z0-9_-]{10,}/ug) ?? []
        const sourceDriveIDs = resultsWithSlash.map(result => result.substr(1))
        const sources = sourceDriveIDs.map(driveID => { return { sourceDriveID: driveID, sourceName: driveID } })
        if (sources.length == 0) {
          log.error('Input did not contain any drive IDs.')
        } else {
          log.info(`${sources.length} source link${sources.length == 1 ? '' : 's'} detected.`)

          // Code specific to #to-review to try to auto-detect source names
          const contextFragments = input.split('/1')
          for (const source of sources) {
            for (const fragment of contextFragments) {
              if (fragment.startsWith(source.sourceDriveID.substr(1))) {
                const result = fragment.match(/anything else convenient\.\s+([^\n]*)\s+/u)
                if (result != null && result[1].trim() != '') {
                  source.sourceName = result[1].trim()
                }
              }
            }
          }

          return sources
        }
      }
  }

  /**
   * Compares the sources of `oldDriveScanData` and `newDriveScanData`, and adds to
   * `this.chartsToScan` and `this.chartsToRemove` when they don't match.
   */
  private compareSources(oldDriveScanData: DriveMap, newDriveScanData: DriveMap) {
    const driveUnion = new Set<string>()
    Object.keys(oldDriveScanData).forEach(key => driveUnion.add(key))
    Object.keys(newDriveScanData).forEach(key => driveUnion.add(key))

    for (const driveID of driveUnion) {
      if (oldDriveScanData[driveID] == undefined) { // If old scan doesn't have this source...
        this.chartsToScan[driveID] = Object.assign(this.chartsToScan[driveID] ?? {}, newDriveScanData[driveID])
      } else if (newDriveScanData[driveID] == undefined) { // If new scan doesn't have this source...
        if (scanSettings.onlyScanLastXSources && scanSettings.onlyScanLastXSources > 0) { // If they were intentionally skipped...
          // Previous source probably still exists, so assume it hasn't changed
          this.reducedOldDriveScanData[driveID] = oldDriveScanData[driveID]
        } else {
          this.chartsToRemove[driveID] = Object.assign(this.chartsToRemove[driveID] ?? {}, oldDriveScanData[driveID])
        }
      } else { // If both scans had this source...
        this.reducedOldDriveScanData[driveID] = {}
        this.compareSourceGroups(driveID, oldDriveScanData[driveID], newDriveScanData[driveID])
      }
    }
  }

  /**
   * Compares the charts of `oldDriveCharts` and `newDriveCharts`, and adds to
   * `this.chartsToScan` and `this.chartsToRemove` when they don't match.
   * (assumes `oldDriveCharts` and `newDriveCharts` are all from the same source)
   */
  private compareSourceGroups(driveID: string, oldDriveCharts: ChartMap, newDriveCharts: ChartMap) {
    const chartUnion = new Set<string>()
    Object.keys(oldDriveCharts).forEach(key => chartUnion.add(key))
    Object.keys(newDriveCharts).forEach(key => chartUnion.add(key))

    for (const filesHash of chartUnion) {
      if (oldDriveCharts[filesHash] == undefined) { // If old scan doesn't have this chart...
        this.chartsToScan[driveID] = this.chartsToScan[driveID] ?? {}
        this.chartsToScan[driveID][filesHash] = newDriveCharts[filesHash]
      } else if (newDriveCharts[filesHash] == undefined) { // If new scan doesn't have this chart...
        this.chartsToRemove[driveID] = this.chartsToRemove[driveID] ?? {}
        this.chartsToRemove[driveID][filesHash] = oldDriveCharts[filesHash]
      } else { // If both scans had this chart...
        if (scanSettings.rescanAllVersions) { // Add this to `chartsToScan`.
          this.chartsToScan[driveID] = this.chartsToScan[driveID] ?? {}
          this.chartsToScan[driveID][filesHash] = newDriveCharts[filesHash]
          this.chartsToScan[driveID][filesHash].downloadPath = oldDriveCharts[filesHash].downloadPath
        }
        // Preserve old download path but keep other new metadata that was just scanned (i.e. reflect any updates to DriveSource)
        this.reducedOldDriveScanData[driveID][filesHash] = newDriveCharts[filesHash]
        this.reducedOldDriveScanData[driveID][filesHash].downloadPath = oldDriveCharts[filesHash].downloadPath
      }
    }
  }

  /**
   * Saves `versionsToRemove.json` and `driveScanData.json`.
   * `driveScanData.json` is only modified to remove charts that should have been removed.
   * @throws an exception if the write fails.
   */
  private saveRemovedVersions() {
    writeFileSync(VERSIONS_TO_REMOVE_PATH, this.simplifyDriveMap(this.chartsToRemove), { spaces: 2 })
    writeFileSync(DRIVE_SCAN_DATA_PATH, this.simplifyDriveMap(this.reducedOldDriveScanData), { spaces: 2 })
  }

  /**
   * @returns the same `driveMap` map, but only with the properties in `DriveMap`.
   */
  private simplifyDriveMap(driveMap: DriveMap) {
    for (const driveID of Object.keys(driveMap)) {
      for (const filesHash of Object.keys(driveMap[driveID])) {
        driveMap[driveID][filesHash].files = this.simplifyDriveFiles(driveMap[driveID][filesHash].files)
      }
    }

    return driveMap
  }

  /**
   * @returns the same `files` array, but only with the properties in `DriveFile`.
   */
  private simplifyDriveFiles(files: DriveFile[]) {
    const results: DriveFile[] = []
    for (const file of files) {
      results.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webContentLink: file.webContentLink,
        modifiedTime: file.modifiedTime,
        md5Checksum: file.md5Checksum,
        size: file.size
      })
    }

    return results
  }
}