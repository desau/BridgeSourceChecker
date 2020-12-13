import { DriveChart } from '../Drive/scanDataInterface'

export enum RegularErrorTypes {
  /** Song folder contains an .ini file with an incorrectly formatted line */
  invalidIniLine,

  /** Song is an exact duplicate of another song */
  duplicate,

  /** A metadata field is incorrect */
  metadataFix,

  /** The album art is not 500x500 or 512x512 */
  albumSize,

  /** delay property in song.ini is not zero */
  nonzeroDelay,

  /** offset property in notes.chart is not zero */
  nonzeroOffset
}

export const ERROR_TYPE_BORDER = 6 // Number of elements in RegularErrorTypes

export enum SeriousErrorTypes {

  /** The source has fewer than scanSettings.minimumChartCount */
  notEnoughCharts = 6, // different value from RegularErrorTypes

  /** The chart contains broken notes */
  brokenNotes,

  /** The chart has no sections */
  noSections,

  /** The chart has no starpower */
  noStarpower,

  /** The chart is the default 120bpm */
  defaultBPM,

  /** Filesystem refused to provide access to chart files */
  accessFailure,

  /** Song folder contains a file that CH does not interpret */
  extraFile,

  /** Song folder contains no metadata */
  noMetadata,

  /** Song folder contains metadata without a [song] section */
  invalidMetadata,

  /** Song folder contains more than one chart file */
  multipleCharts,

  /** Song folder contains more than one ini file */
  multipleIniFiles,

  /** Song folder contains more than one album image file */
  multipleAlbums,

  /** Song folder contains an incorrectly named ini file */
  invalidIni,

  /** Song metadata file has incompatible text encoding */
  badEncoding,

  /** Song folder contains an incorrectly named image file */
  invalidImage,

  /** Song folder contains no audio file */
  noAudio,

  /** Song folder contains an incorrectly named audio file */
  invalidAudio,

  /** Song folder contains no chart file */
  noChart,

  /** Song folder contains an incorrectly named chart file */
  invalidChart,

  /** Song folder contains a chart file that could not be scanned correctly */
  badChart,

  /** Folder in library contains no files or folders */
  emptyFolder,

  /** Folder in library contains both files and folders */
  filesFolders
}

export interface ChartError {
  /** The type of issue that occured */
  type: RegularErrorTypes | SeriousErrorTypes

  /** The `DriveChart` context of the chart with this issue */
  chart: DriveChart

  /** Text describing the name of the chart, but only defined if it is accessible */
  chartText?: string

  /** Text describing the details of the issue */
  description: string
}

export interface SongMetadata {
  name: string
  artist: string
  album: string
  genre: string
  year: string
  charter: string
  song_length: number
  diff_band: number
  diff_guitar: number
  diff_rhythm: number
  diff_bass: number
  diff_drums: number
  diff_keys: number
  diff_guitarghl: number
  diff_bassghl: number
  preview_start_time: number
  icon: string
  loading_phrase: string
  album_track: number
  playlist_track: number
  modchart: boolean
  delay: number
  hopo_frequency: number
  eighthnote_hopo: boolean
  multiplier_note: number
  video_start_time: number
  chartOffset: number // pulled from the .chart file, if it exists
}

export const defaultMetadata: SongMetadata = {
  'name': 'Unknown Name',
  'artist': 'Unknown Artist',
  'album': 'Unknown Album',
  'genre': 'Unknown Genre',
  'year': 'Unknown Year',
  'charter': 'Unknown Charter',
  'song_length': 0,
  'diff_band': -1,
  'diff_guitar': -1,
  'diff_rhythm': -1,
  'diff_bass': -1,
  'diff_drums': -1,
  'diff_keys': -1,
  'diff_guitarghl': -1,
  'diff_bassghl': -1,
  'preview_start_time': -1,
  'icon': '',
  'loading_phrase': '',
  'album_track': 16000,
  'playlist_track': 16000,
  'modchart': false,
  'delay': 0,
  'hopo_frequency': 0,
  'eighthnote_hopo': false,
  'multiplier_note': 0,
  'video_start_time': 0,
  'chartOffset': 0
}

export interface ChartData {
  hasSections: boolean
  hasStarPower: boolean
  hasForced: boolean
  hasTap: boolean
  hasOpen: {
    [instrument: string]: boolean
  }
  hasSoloSections: boolean
  hasLyrics: boolean
  is120: boolean
  hasBrokenNotes: boolean
  noteCounts: {
    [instrument: string]: {
      [difficulty: string]: number
    }
  }
  /** number of seconds */
  length: number
  /** number of seconds */
  effectiveLength: number
}