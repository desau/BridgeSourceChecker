/* eslint-disable @typescript-eslint/indent */
import { ChartError, RegularErrorTypes, ERROR_TYPE_BORDER, SeriousErrorTypes } from './chartDataInterface'
import { sanitizeFilename, log } from '../UtilFunctions'
import * as sources from '../../config/sources.json'
import { promisify } from 'util'
import { MANY_ERRORS_PATH, NO_ERRORS_PATH, FEW_ERRORS_PATH } from '../Drive/scanDataInterface'
import { join } from 'path'
import * as fs from 'fs'
import { scanSettings } from '../../config/scanConfig'

const writeFile = promisify(fs.writeFile)

export const scanErrors: ChartError[] = []

/**
 * Prints the list of library issues that were generated as a result of the scan.
 */
export async function saveAllErrors() {
  for (const error of scanErrors) {
    if (error.chartText == undefined) {
      error.chartText = error.chart.isArchive ? error.chart.files[0].name : error.chart.folderName
    }
  }

  const oslxs = scanSettings.onlyScanLastXSources
  const firstScannedSourceIndex = oslxs && oslxs > 0 ? sources.length - oslxs : 0
  const scannedSources = sources.slice(firstScannedSourceIndex, sources.length)
  const sourceDriveIDs = [...new Set(scannedSources.map(source => source.sourceDriveID))]

  for (const sourceDriveID of sourceDriveIDs) {
    const thisSource = scannedSources.find(source => source.sourceDriveID == sourceDriveID)
    const driveErrors = scanErrors.filter(error => error.chart.source.sourceDriveID == sourceDriveID)
    let driveErrorText = ''

    const folderIDs = [...new Set(driveErrors.map(error => error.chart.folderID))]

    for (const folderID of folderIDs) {
      const chartErrors = driveErrors.filter(error => error.chart.folderID == folderID)

      const headerText = `["${chartErrors[0].chart.folderName}" at https://drive.google.com/drive/folders/${folderID}]\n`
      const errorText = chartErrors.map(error => `[${RegularErrorTypes[error.type] ?? SeriousErrorTypes[error.type]
          }] for ${error.chartText}: ${error.description}`).join('\n')
      driveErrorText += headerText + errorText + '\n\n'
    }

    let errorFolder: string
    const seriousErrors = driveErrors.filter(error => error.type >= ERROR_TYPE_BORDER)

    if (driveErrors.length == 0) {
      errorFolder = NO_ERRORS_PATH
    } else if (seriousErrors.length >= scanSettings.seriousErrorThreshold) {
      errorFolder = MANY_ERRORS_PATH
    } else {
      errorFolder = FEW_ERRORS_PATH
    }

    const errorPath = join(errorFolder, sanitizeFilename(thisSource.sourceName) + '.txt')

    log.info(`Writing to [${errorPath}]`)
    await writeFile(errorPath, driveErrorText, { flag: 'a' })
  }
}

/**
 * Only used when errors failed to save to a file.
 */
export function getErrorText(error: ChartError) {
  return `["${error.chart.folderName}" at https://drive.google.com/drive/folders/${error.chart.folderID}] (${error.chart.source.sourceName})\n` +
  `[${RegularErrorTypes[error.type]}] for ${error.chartText}: ${error.description}`
}