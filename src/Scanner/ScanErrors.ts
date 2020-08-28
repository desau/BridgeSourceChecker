import { ChartError, ErrorType } from './chartDataInterface'
import { sanitizeFilename } from '../UtilFunctions'
import { promisify } from 'util'
import { ERRORS_PATH } from '../Drive/scanDataInterface'
import { join } from 'path'
import * as fs from 'fs'

const writeFile = promisify(fs.writeFile)

export const scanErrors: ChartError[] = []

/**
 * Prints the list of library issues that were generated as a result of the scan.
 */
export async function saveAllErrors() {
  if (scanErrors.length > 0) {
    for (const error of scanErrors) {
      if (error.chartText == undefined) {
        error.chartText = error.chart.isArchive ? error.chart.files[0].name : error.chart.folderName
      }
    }

    const sourceDriveIDs = [...new Set(scanErrors.map(error => error.chart.source.sourceDriveID))]

    for (const sourceDriveID of sourceDriveIDs) {
      const driveErrors = scanErrors.filter(error => error.chart.source.sourceDriveID == sourceDriveID)
      let driveErrorText = ''

      const folderIDs = [...new Set(driveErrors.map(error => error.chart.folderID))]

      for (const folderID of folderIDs) {
        const chartErrors = driveErrors.filter(error => error.chart.folderID == folderID)

        const headerText = `["${chartErrors[0].chart.folderName}" at https://drive.google.com/drive/folders/${folderID}]\n`
        const errorText = chartErrors.map(error => `[${ErrorType[error.type]}] for ${error.chartText}: ${error.description}`).join('\n')
        driveErrorText += headerText + errorText + '\n\n'
      }

      const errorPath = join(ERRORS_PATH, sanitizeFilename(driveErrors[0].chart.source.sourceName.replace(/\s/g, '')) + '.txt')

      await writeFile(errorPath, driveErrorText, { flag: 'a' })
    }
  }
}

/**
 * Only used when errors failed to save to a file.
 */
export function getErrorText(error: ChartError) {
  return `["${error.chart.folderName}" at https://drive.google.com/drive/folders/${error.chart.folderID}] (${error.chart.source.sourceName})\n` +
  `[${ErrorType[error.type]}] for ${error.chartText}: ${error.description}`
}