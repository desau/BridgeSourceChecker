/* eslint-disable @typescript-eslint/indent */
import { ChartError, RegularErrorTypes, ERROR_TYPE_BORDER, SeriousErrorTypes } from './chartDataInterface'
import { sanitizeFilename, log } from '../UtilFunctions'
import { promisify } from 'util'
import { MANY_ERRORS_PATH, NO_ERRORS_PATH, FEW_ERRORS_PATH } from '../Drive/scanDataInterface'
import { join } from 'path'
import * as fs from 'fs'
import { scanSettings } from '../../config/scanConfig'
import { g } from '../main'
import { Version } from './Version'
import { cyan, green, red } from 'cli-color'

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
  const firstScannedSourceIndex = oslxs && oslxs > 0 ? g.sources.length - oslxs : 0
  const scannedSources = g.sources.slice(firstScannedSourceIndex, g.sources.length)
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
    const hasNotEnoughCharts = seriousErrors.some(error => error.type == SeriousErrorTypes.notEnoughCharts)

    if (driveErrors.length == 0) {
      errorFolder = NO_ERRORS_PATH
    } else if (seriousErrors.length >= scanSettings.seriousErrorThreshold || hasNotEnoughCharts) {
      errorFolder = MANY_ERRORS_PATH
    } else {
      errorFolder = FEW_ERRORS_PATH
    }

    const errorPath = join(errorFolder, sanitizeFilename(thisSource.sourceName) + '.txt')

    log.info(`Writing to [${errorPath}]`)
    await writeFile(errorPath, driveErrorText, { flag: 'w' })
  }
}

/**
 * Only used when errors failed to save to a file.
 */
export function getErrorText(error: ChartError) {
  return `["${error.chart.folderName}" at https://drive.google.com/drive/folders/${error.chart.folderID}] (${error.chart.source.sourceName})\n` +
  `[${RegularErrorTypes[error.type]}] for ${error.chartText}: ${error.description}`
}

export function printFolderRenames(versions: Version[]) {

  const sourceGroups: Version[][] = []
  for (const version of versions) {
    const matchingGroup = sourceGroups.find(sourceGroup => sourceGroup[0].driveData.source.sourceDriveID == version.driveData.source.sourceDriveID)
    if (matchingGroup != undefined) {
      matchingGroup.push(version)
    } else {
      sourceGroups.push([version])
    }
  }

  log.info(red(`SHORTCUT NAME${sourceGroups.length > 1 ? 'S' : ''}:`))
  let hasMultipleChartersInSource = false
  for (const sourceGroup of sourceGroups) {
    const charterNames = []
    for (const version of sourceGroup) {
      if (!charterNames.includes(version.metadata.charter)) {
        charterNames.push(version.metadata.charter)
      }
    }
    if (charterNames.length > 1) {
      hasMultipleChartersInSource = true
    }

    // CharterA's Charts (CharterB, CharterC)
    const name = `${charterNames[0]}'s Charts${charterNames.length > 1 ? ` (${charterNames.slice(1).join(', ')})` : ''}`
    log.info(`${cyan(sourceGroup[0].driveData.source.sourceName)} => ${green(name)}`)
  }
  if (hasMultipleChartersInSource) {
    log.info(red(`Text in parentheses after "<Charter>'s Charts" is the list of all other charters in this source.`))
    log.info(red(`Remember that this is not allowed, with only a couple exceptions. If the source is accepted, please`))
    log.info(red(`reformat the shortcut name to remove alternate spellings of a username and any charters who have`))
    log.info(red(`not given their permission for their charts to be hosted in this source.`))
  }
}