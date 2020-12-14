/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { initDriveAuth } from './Drive/DriveAdapter'
import { failDrive, failRead } from './ErrorFunctions'
import * as sourcesJSON from '../Config/sources.json'
import * as dotenv from 'dotenv'
import { DriveMap } from './Drive/scanDataInterface'
import { DriveSync } from './Drive/DriveSync'
import { log } from './UtilFunctions'
import { ChartsDownloader } from './Download/ChartDownloader'
import { scanNewDownloads } from './Scanner/LibraryScanner'
import { saveAllErrors, scanErrors, getErrorText } from './Scanner/ScanErrors'
dotenv.config()

export const g = { sources: sourcesJSON } // global constant

void main()

async function main() {
  try {
    await initDriveAuth()
  } catch (err) { failDrive(err); return }

  let versionsToScan: DriveMap

  try {
    versionsToScan = await new DriveSync().scanSources()

    const downloader = new ChartsDownloader()
    await downloader.downloadCharts(versionsToScan)
    downloader.saveVersionsToScanJson(versionsToScan)

  } catch (err) { failRead('ScanData/', err); return }

  try {
    await scanNewDownloads(versionsToScan)
  } catch (err) { log.error(`Scan process was unable to properly finish.\n`, err) }

  try {
    await saveAllErrors()
  } catch (err) { log.error(`Failed to save errors to a file:\n`, scanErrors.map(error => getErrorText(error)).join('\n\n')) }
}