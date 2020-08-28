/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import * as fs from 'fs'
import { join, extname } from 'path'
import { promisify } from 'util'
import * as node7z from 'node-7z'
import * as zipBin from '7zip-bin'
import { failWrite, failDownload, failUnzip, failDelete } from '../ErrorFunctions'
import { extractRar } from './RarExtractor'
import { green } from 'cli-color'
import { DriveChart, DriveFile, DRIVE_SCAN_DATA_PATH, DriveMap, VERSIONS_TO_SCAN_PATH } from '../Drive/scanDataInterface'
import { getDownloadStream } from '../Drive/DriveAdapter'
import { SingleBar, MultiBar, Presets } from 'cli-progress'
import { red } from 'cli-color'
import * as readline from 'readline-sync'
import { log, sanitizeFilename } from '../UtilFunctions'
import * as mkdirp from 'mkdirp'
import { randomBytes } from 'crypto'
import { scanSettings } from '../../config/scanConfig'
import { readFileSync, writeFileSync } from 'jsonfile'

// Asyncification
const unlink = promisify(fs.unlink)

export class ChartsDownloader {
  /**
   * Downloads `chartsToScan` to `scanSettings.downloadsFilepath`.
   */
  async downloadCharts(chartsToScan: DriveMap) {
    let currentCount = 0
    let totalCount = 0
    Object.keys(chartsToScan).forEach(driveID => totalCount += Object.keys(chartsToScan[driveID]).length)

    for (const driveID of Object.keys(chartsToScan)) {
      for (const filesHash of Object.keys(chartsToScan[driveID])) {
        const chartToScan = chartsToScan[driveID][filesHash]
        currentCount++
        log.info(`Downloading chart ${green(`[${currentCount}/${totalCount}]`)}...`)

        if (chartToScan.downloadPath == null) {
          try {
            chartToScan.downloadPath = await new ChartDownloader(chartToScan).download()
          } catch (err) { continue } // Failed to download chart
        }
      }
    }
    log.info('FINISHED ALL DOWNLOADS')
  }

  /**
   * Adds all the newly created `downloadPath` properties to the
   * `versionsToScan.json` and `driveScanData.json` files.
   * (This is not done earlier because `downloadPath` was not known yet)
   * @throws an exception if it failed to save `chartsToScan` to `versionsToScan.json` and `driveScanData.json`.
   */
  saveVersionsToScanJson(chartsToScan: DriveMap) {
    writeFileSync(VERSIONS_TO_SCAN_PATH, chartsToScan, { spaces: 2 })

    // Important to read and not import because this is modified in a previous stage
    const oldDriveData = readFileSync(DRIVE_SCAN_DATA_PATH)

    // Copy `chartsToScan` into `oldDriveData`
    for (const driveID of Object.keys(chartsToScan)) {
      oldDriveData[driveID] = oldDriveData[driveID] ?? {}
      for (const filesHash of Object.keys(chartsToScan[driveID])) {
        oldDriveData[driveID][filesHash] = chartsToScan[driveID][filesHash]
      }
    }

    writeFileSync(DRIVE_SCAN_DATA_PATH, oldDriveData, { spaces: 2 })
  }
}

class ChartDownloader {
  private destinationFolder: string
  private progressBar: MultiBar

  constructor(private versionToScan: DriveChart) {
    try {
      this.createDownloadFolder(sanitizeFilename(versionToScan.source.sourceName))
    } catch (err) { failWrite('Failed to create download folder', err); throw new Error() }
    this.progressBar = new MultiBar({
      barsize: 60,
      format: `Download [{bar}] {percentage}% | {name}`,
      hideCursor: true
    }, Presets.legacy)
  }

  /**
   * Creates a download folder in `scanSettings.downloadsFilepath`/`groupFolderName`/chart_...
   * @throws an exception if this fails.
   */
  private createDownloadFolder(groupFolderName: string) {
    const groupPath = join(scanSettings.downloadsFilepath, groupFolderName)
    mkdirp.sync(groupPath)

    do {
      this.destinationFolder = join(groupPath, `chart_${randomBytes(6 / 2).toString('hex')}`)
    } while (fs.existsSync(this.destinationFolder))

    fs.mkdirSync(this.destinationFolder)
  }

  /**
   * Downloads all the files from `versionToScan.files` to `destinationFolder`.
   * @param versionToScan An object containing a set of download links and other metadata.
   * @returns the path to the folder that contains the downloaded files.
   * @throws an exception if the download fails.
   */
  async download() {

    for (const file of this.versionToScan.files) {
      const bar = this.progressBar.create(Number(file.size), 0, { name: file.name })
      await this.requestDownload(file, bar)
    }

    this.progressBar.stop()

    if (this.versionToScan.isArchive) {
      const filename = sanitizeFilename(this.versionToScan.files[0].name)
      try {
        await this.extractDownload(filename, extname(filename) == '.rar')
      } catch (e) {
        console.log(red('ERROR:'), `Failed to extract download at (${join(this.destinationFolder, filename)})`, e)

        readline.keyInPause(`Please manually extract it to (${this.destinationFolder}), then press any key to continue. (don't delete the archive)`)
      }

      try {
        await unlink(join(this.destinationFolder, filename))
      } catch (e) { failDelete(join(this.destinationFolder, filename), e, 'file'); throw new Error() }
    }

    return this.destinationFolder
  }

  /**
   * Sends a request to download the file at `url`. Throws an exception if the download failed.
   * @param file The `DriveFile` to download.
   * @param isArchive If the download is compressed.
   * @throws an exception if the download fails.
   */
  private async requestDownload(file: DriveFile, bar: SingleBar) {

    const downloadStream = await getDownloadStream(file.id)

    const filePath = join(this.destinationFolder, file.name)
    try {
      downloadStream.pipe(fs.createWriteStream(filePath))
    } catch (err) { failWrite(filePath, err); throw new Error() }

    downloadStream.on('data', (chunk: Buffer) => {
      bar.increment(chunk.length)
    })

    return new Promise<void>((resolve, reject) => {
      downloadStream.once('error', (err) => {
        failDownload(err)
        reject()
      })

      downloadStream.once('end', () => {
        resolve()
      })
    })
  }

  /**
   * Extracts the contents of `filename` from `tempFolder` and puts the extracted files in `tempFolder`.
   * @param fileName The name of the .zip file.
   * @throws an exception if it fails to extract.
   */
  private async extractDownload(fileName: string, useRarExtractor: boolean) {
    const source = join(this.destinationFolder, fileName)
    await new Promise<void>(resolve => setTimeout(() => resolve(), 200)) // Extraction can fail if started too soon after the file was created??
    if (useRarExtractor) {
      try {
        await extractRar(source, this.destinationFolder)
        return
      } catch (e) {
        failUnzip(source, e)
        readline.keyInPause('Extraction failed. Extract manually, then press any key to continue.')
        void this.extractDownload(fileName, extname(fileName) == '.rar')
      }
    } else {
      const stream = node7z.extractFull(source, this.destinationFolder, { $progress: true , $bin: zipBin.path7za })
      let error = false
      return new Promise<void>((resolve, reject) => {
        stream.on('end', () => {
          if (!error) {
            resolve()
          }
        })

        stream.on('error', () => {
          error = true
          void this.extractDownload(fileName, true).catch((e) => reject(e)).then(() => resolve())
        })
      })
    }
  }
}