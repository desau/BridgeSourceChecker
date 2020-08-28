/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { initDriveAuth } from './Drive/DriveAdapter'
import { failDrive, failRead } from './ErrorFunctions'
import * as dotenv from 'dotenv'
import { DriveMap } from './Drive/scanDataInterface'
import { DriveSync } from './Drive/DriveSync'
import { log } from './UtilFunctions'
dotenv.config()

void main()

async function main() {
  try {
    await initDriveAuth()
  } catch (err) { failDrive(err); return }

  let versionsToScan: DriveMap

  try {
    versionsToScan = await new DriveSync().scanSources()
    console.log(versionsToScan)

    // const downloader = new ChartsDownloader()
    // await downloader.downloadCharts(versionsToScan)
    // downloader.saveVersionsToScanJson(versionsToScan)
  } catch (err) { failRead('./scanData/', err); return }

  try {
    // TODO: scan downloaded charts
  } catch (err) { log.error(`Scan process was unable to properly finish.\n`, err) }
}