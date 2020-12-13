/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs'
import { join } from 'path'
import * as sharp from 'sharp'
import { SongMetadata, ChartData, RegularErrorTypes, SeriousErrorTypes } from './chartDataInterface'
import { DriveChart } from '../Drive/scanDataInterface'
import { scanErrors } from './ScanErrors'
import { failOpen } from '../ErrorFunctions'
import { hasAlbumName, hasImageExtension } from '../UtilFunctions'

/**
 * Represents a single version of a chart.
 */
export class Version {

  chartName: string

  // These fields are initialized for all Versions
  constructor(
    /** The path to the folder where this version is stored */
    public filepath: string,

    /** Contains the metadata from the song.ini file (or notes.chart if song.ini doesn't exist) */
    public metadata: SongMetadata,

    /** Contains useful information derived from notes.chart or notes.mid */
    public chartData: ChartData,

    /** An array of filenames that are included in `filepath` */
    public files: fs.Dirent[]
  ) {
    this.chartName = `"${this.metadata.artist}" - "${this.metadata.name}" (${this.metadata.charter})`
  }

  // Initialized during downloadCharts()
  /** The object that holds the version's download links and Google Drive data */
  driveData: DriveChart & { inChartPack: boolean }

  async checkAlbumArt() {
    let albumPath = ''
    for (const file of this.files) {
      if (file.isFile() && hasAlbumName(file.name) && hasImageExtension(file.name)) {
        try {
          albumPath = join(this.filepath, file.name)
          const metadata = await sharp(albumPath).metadata()
          if (metadata.height == 500 && metadata.width == 500) { continue }
          if (metadata.height == 512 && metadata.width == 512) { continue }

          scanErrors.push({
            type: RegularErrorTypes.albumSize,
            chart: this.driveData,
            chartText: this.chartName,
            description: 'The album art is not 500x500 or 512x512'
          })
        } catch (e) { failOpen(albumPath, e) }
      }
    }
  }

  addAdditionalErrors() {
    const cd = this.chartData
    const m = this.metadata

    if (cd.hasBrokenNotes) {
      scanErrors.push({
        type: SeriousErrorTypes.brokenNotes,
        chart: this.driveData,
        chartText: this.chartName,
        description: 'This chart contains broken notes.'
      })
    }

    if (!cd.hasSections) {
      scanErrors.push({
        type: SeriousErrorTypes.noSections,
        chart: this.driveData,
        chartText: this.chartName,
        description: 'This chart doesn\'t have any sections.'
      })
    }

    if (!cd.hasStarPower) {
      scanErrors.push({
        type: SeriousErrorTypes.noStarpower,
        chart: this.driveData,
        chartText: this.chartName,
        description: 'This chart doesn\'t have any star power.'
      })
    }

    if (cd.is120) {
      scanErrors.push({
        type: SeriousErrorTypes.defaultBPM,
        chart: this.driveData,
        chartText: this.chartName,
        description: 'If this song is not 120bpm, it wasn\'t tempo-mapped correctly.'
      })
    }

    if (this.driveData.source.setlistIcon != undefined && this.metadata.icon != this.driveData.source.setlistIcon) {
      scanErrors.push({
        type: RegularErrorTypes.metadataFix,
        chart: this.driveData,
        chartText: this.chartName,
        description: `icon [${m.icon}] should be [${this.driveData.source.setlistIcon}]`
      })
    }

    if (m.delay != 0) {
      const ofs = m.__debugDelayIsOffset
      scanErrors.push({
        type: ofs ? RegularErrorTypes.nonzeroOffset : RegularErrorTypes.nonzeroDelay,
        chart: this.driveData,
        chartText: this.chartName,
        description: `The ${ofs ? 'offset' : 'delay'} property in the ${ofs ? 'notes.chart' : 'song.ini'} file is not zero.`
      })
    }
  }
}