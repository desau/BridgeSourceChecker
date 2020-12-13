/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs'
import{ join, basename } from 'path'
import { parse, $Errors, IIniObject } from './js_ini'
import { isNumber, isBoolean, lower, getEncoding, removeStyleTags, hasChartExtension, hasIniExtension, hasChartName, hasIniName } from '../../UtilFunctions'
import { failOpen } from '../../ErrorFunctions'
import { DriveChart } from '../../Drive/scanDataInterface'
import { scanErrors } from '../ScanErrors'
import { RegularErrorTypes, defaultMetadata, SeriousErrorTypes } from '../chartDataInterface'

/**
 * Constructs a `SongMetadata` object.
 */
export class MetadataFactory {

  iniFile: IIniObject | null = null             // The js_ini object with parsed data from the song.ini file
  chartFile: IIniObject | null = null           // The js_ini object with parsed data from the notes.chart file
  metadata = Object.assign({}, defaultMetadata) // Contains the metadata from the song.ini file

  /**
   * @param filepath The path to this version's folder.
   * @param files The list of files inside the folder, as `fs.Dirent[]` objects.
   * @returns a `SongMetadata` object for the metadata inside `filepath` (or `null` if the operation failed).
   */
  static construct(filepath: string, files: fs.Dirent[], driveChart: DriveChart) {
    const metadataFactory = new MetadataFactory(filepath, files, driveChart)

    try {
      metadataFactory.setSongMetadata()
    } catch (err) {
      return null
    }

    return metadataFactory.metadata
  }

  private constructor(private filepath: string, private files: fs.Dirent[], private driveChart: DriveChart) { }

  /**
   * Sets `this.metadata` to the metadata provided in `this.filepath` (either from song.ini or notes.chart).
   */
  private setSongMetadata() {
    this.setIniFiles()

    if (this.iniFile.song == undefined) {
      scanErrors.push({
        type: SeriousErrorTypes.invalidMetadata,
        chart: this.driveChart,
        description: `No [Song] section in song.ini`
      })
      throw new Error()
    }

    this.extractIniMetadata()
    this.extractIniMetadata('ignored_') // Any ignored_ fields will be used for md5 calculation (CH ignores them, not this code)
    this.iniFile = null // Not needed any more; save the memory
  }

  /**
   * Sets `this.iniFile` to a js_ini object that represents the metadata for this version.
   */
  private setIniFiles() {
    const iniPath = this.getIniFile()
    const chartPath = this.getChartFile()

    if (chartPath != null) {
      this.chartFile = this.getIniAtFilepath(chartPath, true)
      this.iniFile = this.chartFile // Use chart file if iniPath is null
    }

    if (iniPath != null) {
      this.iniFile = this.getIniAtFilepath(iniPath, false)
    }


    if (iniPath == null && chartPath == null) {
      scanErrors.push({
        type: SeriousErrorTypes.noMetadata,
        chart: this.driveChart,
        description: `Files: [${this.files.map(file => file.name).join()}]`
      })
      throw new Error()
    }
  }

  /**
   * @returns the path to the .ini file in this chart, or `null` if it isn't found.
   */
  private getIniFile() {
    let iniCount = 0
    let bestIniPath: string = null
    let lastIniPath: string = null

    for (const file of this.files) {
      if (hasIniExtension(file.name)) {
        iniCount++
        lastIniPath = join(this.filepath, file.name)
        if (!hasIniName(file.name)) {
          scanErrors.push({
            type: SeriousErrorTypes.invalidIni,
            chart: this.driveChart,
            description: `File: [${file.name}]`
          })
        } else {
          bestIniPath = join(this.filepath, file.name)
        }
      }
    }

    if (iniCount == 0) {
      return null
    }

    if (iniCount > 1) {
      scanErrors.push({
        type: SeriousErrorTypes.multipleIniFiles,
        chart: this.driveChart,
        description: `Files: [${this.files.map(file => file.name).filter(file => hasIniExtension(file)).join()}]`
      })
    }

    if (bestIniPath != null) {
      return bestIniPath
    } else {
      return lastIniPath
    }
  }

  /**
   * @returns the path to the .chart file in this chart, or `null` if it isn't found.
   */
  private getChartFile() {
    let bestChartPath: string = null
    let lastChartPath: string = null

    for (const file of this.files) {
      if (hasChartExtension(file.name)) {
        lastChartPath = join(this.filepath, file.name)
        if (hasChartName(file.name)) {
          bestChartPath = join(this.filepath, file.name)
        }
      }
    }

    if (bestChartPath != null) {
      return bestChartPath
    } else {
      return lastChartPath
    }
  }

  /**
   * Sets `this.iniFile` to the js_ini object that can be derived from `fullPath`.
   * @param removeQuotes If quotes appear around .ini values (true for .chart, false for .ini).
   */
  private getIniAtFilepath(fullPath: string, removeQuotes: boolean) {
    let buffer: Buffer
    try {
      buffer = fs.readFileSync(fullPath)
    } catch (e) {
      failOpen(fullPath, e)
      scanErrors.push({
        type: SeriousErrorTypes.accessFailure,
        chart: this.driveChart,
        description: `File: [${basename(fullPath)}]`
      })
      throw new Error()
    }

    let encoding: 'utf8' | 'latin1' | 'utf16le'
    try {
      encoding = getEncoding(fullPath, buffer)
    } catch (e) {
      scanErrors.push({
        type: SeriousErrorTypes.badEncoding,
        chart: this.driveChart,
        description: `The detected encoding of [${basename(fullPath)}] was [${e.message}]`
      })
      throw new Error()
    }

    const iniFile = parse(buffer.toString(encoding), { autoTyping: false, removeQuotes: removeQuotes, nothrow: true })

    if (iniFile[$Errors] != undefined) {
      for (const err of iniFile[$Errors]) {
        scanErrors.push({
          type: RegularErrorTypes.invalidIniLine,
          chart: this.driveChart,
          description: err.message.substr(0, 1000)
        })
      }
    }

    return iniFile
  }

  /**
   * Stores all the metadata found in `this.iniFile` (which is a [song] section) into `this.metadata` (leaves previous values if not found).
   * @param prefix a prefix to attach to each ini key.
   */
  private extractIniMetadata(prefix = '') {
    // Charter may be stored in `this.iniFile.frets`
    const strings = ['artist', 'album', 'genre', 'year', ['frets', 'charter'], 'charter', 'loading_phrase']
    this.extractMetadataField(this.extractMetadataString.bind(this), prefix, strings)

    // album_track may be stored in `this.iniFile.track`
    const integers = ['song_length', 'diff_band', 'diff_guitar', 'diff_rhythm', 'diff_bass',
      'diff_drums', 'diff_keys', 'diff_guitarghl', 'diff_bassghl', 'preview_start_time',
      ['track', 'album_track'], 'album_track', 'playlist_track', 'hopo_frequency',
      'multiplier_note', 'video_start_time']
    this.extractMetadataField(this.extractMetadataInteger.bind(this), prefix, integers)

    this.extractMetadataDecimal(prefix, 'delay')
    if (this.chartFile != null) { // If a .chart file exists, get the "Offset" property
      this.metadata.chartOffset = Number(this.chartFile.song['offset'] + '') * 1000
    }
    if (this.metadata.delay == 0) {
      // delay may be stored in .chart's "Offset" property in seconds, equivalent to .ini "delay" in milliseconds
      // Unlike most properties, CH reads the value from the .chart file when it's set to default in the .ini file
      this.metadata.delay = this.metadata.chartOffset
    }

    // Note: changing 'hopo_frequency', 'eighthnote_hopo', 'multiplier_note' will cause the score to be reset
    const booleans = ['modchart', 'eighthnote_hopo']
    this.extractMetadataField(this.extractMetadataBoolean.bind(this), prefix, booleans)

    this.extractMetadataString(prefix, 'name')

    if (this.metadata.year.startsWith(', ')) { this.metadata.year = this.metadata.year.substr(2) } // .chart years have dumb formatting

    this.extractMetadataString(prefix, 'icon')
    this.metadata.icon = lower(this.metadata.icon) // Icons are interpreted as lowercase in CH
    if (this.metadata.icon === lower(this.metadata.charter)) { this.metadata.icon = '' } // Setting icon= can be redundant
  }

  /**
   * Extracts `fields` from `this.metadata` using `extractFunction`.
   */
  private extractMetadataField(
    extractFunction: (prefix: string, iniField: string, metadataField?: string) => void,
    prefix = '',
    fields: (string | string[])[]
  ) {
    fields.forEach(value => {
      if (Array.isArray(value)) {
        extractFunction(prefix, value[0], value[1])
      } else {
        extractFunction(prefix, value)
      }
    })
  }

  /**
   * Stores the `iniField` from `this.iniFile` into `metadataField` from `this.metadata` if that field has an actual string value.
   * @param prefix A prefix to attach to each ini key.
   * @param iniField The ini key for this metadata entry.
   * @param metadataField What property of <metadata> to store the value (if it is different from iniField).
   */
  private extractMetadataString(prefix: string, iniField: string, metadataField: string = iniField) {
    if (this.iniFile.song[prefix + iniField] == undefined) { return }
    const value = (this.iniFile.song[prefix + iniField] + '').trim()
    if (!['', '0', '-1'].includes(value)) {
      this.metadata[metadataField] = removeStyleTags(value)
    }
  }

  /**
   * Stores the `iniField` from `this.iniFile` into `metadataField` fom `this.metadata` if that field has an actual number value.
   * @param prefix A prefix to attach to each ini key.
   * @param iniField The ini key for this metadata entry.
   * @param metadataField What property of `metadata` to store the value (if it is different from iniField).
   */
  private extractMetadataInteger(prefix: string, iniField: string, metadataField: string = iniField) {
    if (this.iniFile.song[prefix + iniField] == undefined) { return }
    const value = (this.iniFile.song[prefix + iniField] + '').trim()
    if (!['', '0', '-1'].includes(value) && isNumber(value)) {
      const num = Number(value)
      const int = Math.round(num)
      if (int != num) {
        scanErrors.push({
          type: RegularErrorTypes.invalidIniLine,
          chart: this.driveChart,
          description: `song.ini value of [${prefix + iniField}] (${num}) is not an integer`
        })
      }
      this.metadata[metadataField] = int
    }
  }

  /**
   * Stores the `iniField` from `this.iniFile` into `metadataField` fom `this.metadata` if that field has an actual number value.
   * @param prefix A prefix to attach to each ini key.
   * @param iniField The ini key for this metadata entry.
   * @param metadataField What property of `metadata` to store the value (if it is different from iniField).
   */
  private extractMetadataDecimal(prefix: string, iniField: string, metadataField: string = iniField) {
    if (this.iniFile.song[prefix + iniField] == undefined) { return }
    const value = (this.iniFile.song[prefix + iniField] + '').trim()
    if (!['', '0', '-1'].includes(value) && isNumber(value)) {
      this.metadata[metadataField] = Number(value)
    }
  }

  /**
   * Stores the `iniField` from `this.iniFile` into `metadataField` fom `this.metadata` if that field has an actual boolean value.
   * @param prefix A prefix to attach to each ini key.
   * @param iniField The ini key for this metadata entry.
   */
  private extractMetadataBoolean(prefix: string, iniField: string) {
    if (this.iniFile == null) { return }
    if (this.iniFile.song[prefix + iniField] == undefined) { return }
    const value = (this.iniFile.song[prefix + iniField] + '').trim()
    if (!['', '-1'].includes(value) && isBoolean(value)) {
      this.metadata[iniField] = (lower(value) == 'true')
    }
  }
}