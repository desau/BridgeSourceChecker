/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs'
import { ChartData, SeriousErrorTypes } from './chartDataInterface'
import { Version } from './Version'
import { lower, hasChartExtension, hasChartName, hasAudioExtension, hasAudioName, hasAlbumName, hasBackgroundName, hasImageExtension, hasIniExtension, hasVideoExtension, getMainChart } from '../UtilFunctions'
import { MetadataFactory } from './Util/MetadataFactory'
import { join, parse } from 'path'
import { parseChartFile } from './Util/ChartScanner'
import { parseMidiFile } from './Util/MidScanner'
import { DriveChart } from '../Drive/scanDataInterface'
import { scanErrors } from './ScanErrors'

/**
 * Constructs a `Version` object.
 */
export class VersionFactory {

  private chartName: string

  /**
   * @param filepath The path to a version's folder.
   * @param files The list of files inside the folder, as `fs.Dirent[]` objects.
   * @returns a new `Version` object.
   * @throws a string error description if the chart was not able to be scanned.
   */
  static async construct(filepath: string, files: fs.Dirent[], driveChart: DriveChart) {
    const newFactory = new VersionFactory(filepath, files, driveChart)

    const metadata = MetadataFactory.construct(filepath, files, driveChart)
    if (metadata == null) {
      throw `"${driveChart.isArchive ? driveChart.files[0]?.name ?? driveChart.folderName : driveChart.folderName}" has missing metadata.`
    }
    newFactory.chartName = `"${metadata.artist}" - "${metadata.name}" (${metadata.charter})`

    newFactory.checkImages()
    newFactory.checkExtraFiles()
    newFactory.hasValidAudio()
    const hasValidChart = newFactory.hasValidChart()
    const chartData = await newFactory.getChartData()

    if (!hasValidChart) {
      throw newFactory.chartName + ' has a missing chart file.'
    } else if (chartData == null) {
      throw newFactory.chartName + ' has an invalid chart file.'
    } else {
      return new Version(filepath, metadata, chartData, files)
    }
  }

  private constructor(private filepath: string, private files: fs.Dirent[], private driveChart: DriveChart) { }

  /**
   * Checks all files under `this.filepath` for image files, and adds
   * library issues if there are more than one or they are not named correctly.
   */
  private checkImages() {
    let albumCount = 0

    for (const file of this.files) {
      if (hasImageExtension(file.name)) {
        if (hasAlbumName(file.name)) {
          albumCount++
        } else if (!hasBackgroundName(file.name)) {
          scanErrors.push({
            type: SeriousErrorTypes.invalidImage,
            chart: this.driveChart,
            chartText: this.chartName,
            description: `[${file.name}] is not an album or background image.`
          })
        }
      }
    }

    if (albumCount > 1) {
      scanErrors.push({
        type: SeriousErrorTypes.multipleAlbums,
        chart: this.driveChart,
        chartText: this.chartName,
        description: `There are multiple album art image files.`
      })
    }
  }

  /**
   * Checks all files under `this.filepath` for any valid chart file(s).
   * Adds an issue to `libraryIsues` if no valid chart files were found.
   * @returns `true` if there is a valid chart file in `this.filepath`.
   */
  private hasValidChart() {
    let chartCount = 0

    for (const file of this.files) {
      if (hasChartExtension(file.name)) {
        chartCount++
        if (!hasChartName(file.name)) {
          scanErrors.push({
            type: SeriousErrorTypes.invalidChart,
            chart: this.driveChart,
            chartText: this.chartName,
            description: `[${file.name}] is not named "notes".`
          })
        }
      }
    }

    if (chartCount == 0) {
      scanErrors.push({
        type: SeriousErrorTypes.noChart,
        chart: this.driveChart,
        chartText: this.chartName,
        description: 'There is no .chart/.mid file.'
      })
    }

    if (chartCount > 1) {
      scanErrors.push({
        type: SeriousErrorTypes.multipleCharts,
        chart: this.driveChart,
        chartText: this.chartName,
        description: 'There is more than one .chart/.mid file.'
      })
    }

    return (chartCount > 0)
  }

  /**
   * Checks if the chart has any errors related to audio files.
   */
  private hasValidAudio() {

    // Find a list of the lengths of all stems
    let audioCount = 0
    for (const file of this.files) {

      if (hasAudioExtension(file.name)) {
        audioCount++

        if (!hasAudioName(file.name)) {
          scanErrors.push({
            type: SeriousErrorTypes.invalidAudio,
            chart: this.driveChart,
            chartText: this.chartName,
            description: `[${file.name}] is not a valid audio stem name.`
          })
        }
      }
    }

    if (audioCount == 0) {
      scanErrors.push({
        type: SeriousErrorTypes.noAudio,
        chart: this.driveChart,
        chartText: this.chartName,
        description: 'There are no audio files.'
      })
    }
  }


  /**
   * Checks all files under `this.filepath` for any files that are not
   * interpreted by Clone Hero, and adds library issues for them.
   */
  private checkExtraFiles() {
    for (const file of this.files) {
      if (hasImageExtension(file.name)) { continue }
      if (hasChartExtension(file.name)) { continue }
      if (hasAudioExtension(file.name)) { continue }
      if (['preview.ogg', 'preview.mp3', 'preview.wav', 'preview.opus'].includes(lower(file.name))) { continue }
      if (hasIniExtension(file.name)) { continue }
      if (hasVideoExtension(file.name)) { continue }

      scanErrors.push({
        type: SeriousErrorTypes.extraFile,
        chart: this.driveChart,
        chartText: this.chartName,
        description: `[${file.name}] is not interpreted by Clone Hero.`
      })
    }

    const audioFileNames: string[] = []
    const otherFileNames: string[] = [] // Necessary because both song.ogg and song.ini are valid.
    for (const file of this.files) {
      const justName = parse(lower(file.name)).name
      if (hasAudioExtension(file.name)) {
        if (audioFileNames.includes(justName)) {
          scanErrors.push({
            type: SeriousErrorTypes.extraFile,
            chart: this.driveChart,
            chartText: this.chartName,
            description: `There is more than one [${justName}] audio file.`
          })
        } else {
          audioFileNames.push(justName)
        }
      } else if (!hasChartExtension(file.name)) {
        if (otherFileNames.includes(justName)) {
          scanErrors.push({
            type: SeriousErrorTypes.extraFile,
            chart: this.driveChart,
            chartText: this.chartName,
            description: `There is more than one [${justName}] file.`
          })
        } else {
          otherFileNames.push(justName)
        }
      }
    }
  }

  /**
   * Scans the `files` in `chartFolder` for a .chart/.mid file.
   * @returns a `ChartData` object for that .chart/.mid file, or `null` if the scan failed.
   */
  private async getChartData() {
    const mainChart = getMainChart(this.files)
    let mainChartData: ChartData = null
    for (const file of this.files) {
      try {
        let newChartData: ChartData
        if (parse(lower(file.name)).ext == '.chart') {
          newChartData = await parseChartFile(join(this.filepath, file.name))
        } else if (parse(lower(file.name)).ext == '.mid') {
          newChartData = await parseMidiFile(join(this.filepath, file.name))
        }
        mainChartData = (mainChart == file ? newChartData : mainChartData)
      } catch(err) {
        scanErrors.push({
          type: SeriousErrorTypes.badChart,
          chart: this.driveChart,
          chartText: this.chartName,
          description: `Failed to read ChartData from [${file.name}]; it may not be formatted correctly.`
        })
      }
    }

    return mainChartData
  }
}