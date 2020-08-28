/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs'
import { parse } from 'path'
import * as cli from 'cli-color'
import { randomBytes } from 'crypto'
import DefaultLogger from 'loglevelnext'
import { scanSettings } from '../config/scanConfig'
const sanitize = require('sanitize-filename')
const detect = require('charset-detector')

export const log = DefaultLogger.create({ name: 'logger', level: scanSettings.logLevel })

/**
 * @returns `filename` with all invalid filename characters replaced.
 */
export function sanitizeFilename(filename: string): string {
  const newFilename = sanitize(filename, {
    replacement: ((invalidChar: string) => {
      switch (invalidChar) {
        case '<': return '❮'
        case '>': return '❯'
        case ':': return '꞉'
        case '"': return "'"
        case '/': return '／'
        case '\\': return '⧵'
        case '|': return '⏐'
        case '?': return '？'
        case '*': return '⁎'
        default: return '_'
      }
    })
  })
  return (newFilename == '' ? randomBytes(5).toString('hex') : newFilename)
}

/**
 * @returns the most likely text encoding for text in `buffer`.
 * @throws an exception if it can't be parsed.
 */
export function getEncoding(filepath: string, buffer: Buffer) {
  const matchingCharset = detect(buffer)[0]
  switch (matchingCharset.charsetName) {
    case 'UTF-8': return 'utf8'
    case 'ISO-8859-1': return 'latin1'
    case 'ISO-8859-2': return 'latin1'
    case 'ISO-8859-9': return 'utf8'
    case 'windows-1252': return 'utf8'
    case 'UTF-16LE': return 'utf16le'
    default: {
      return 'utf8'
    }
  }
}

/**
 * @returns `true` if `value` can be parsed as a number.
 */
export function isNumber(value: string | number): value is number {
  return ((value != null) && !isNaN(Number(value.toString())))
}

/**
 * @returns `true` if `value` can be parsed as a boolean.
 */
export function isBoolean(value: string) {
  return (value != null && (lower(value) === 'false' || lower(value) === 'true'))
}

/**
 * @returns `true` if `name` has a valid chart audio file extension.
 */
export function hasAudioExtension(name: string) {
  const file = parse(lower(name))
  return (['.ogg', '.mp3', '.wav'].includes(file.ext) && file.name != 'preview')
}

/**
 * @returns `true` if `name` has a valid chart audio filename.
 */
export function hasAudioName(name: string) {
  return (['song', 'guitar', 'bass', 'rhythm', 'keys', 'vocals', 'vocals_1', 'vocals_2',
    'drums', 'drums_1', 'drums_2', 'drums_3', 'drums_4', 'crowd'].includes(parse(lower(name)).name))
}

/**
 * @returns `true` if `name` has a valid chart file extension.
 */
export function hasChartExtension(name: string) {
  return (['.chart', '.mid'].includes(parse(lower(name)).ext))
}

/**
 * @returns `true` if `name` is a valid chart filename.
 */
export function hasChartName(name: string) {
  return (parse(lower(name)).name) == 'notes'
}

/**
 * @returns the file that will be used by CH as the chart file, or `null` if no chart was found.
 */
export function getMainChart(files: fs.Dirent[]) {
  let mainChart: fs.Dirent | null = null
  let mainIsMid = false
  let mainIsNamedCorrectly = false

  for (const file of files) {
    // Note: If there are multiple charts, CH prioritizes charts named correctly, then prioritizes .mid over .chart
    const isNamedCorrectly = hasChartName(file.name)
    const isMid = parse(lower(file.name)).ext == '.mid'
    const isChart = parse(lower(file.name)).ext == '.chart'

    if (isChart && !mainIsMid && !isNamedCorrectly && !mainIsNamedCorrectly) {
      mainChart = file // "Song Title.chart"
    } else if (isMid && !isNamedCorrectly && !mainIsNamedCorrectly) {
      mainChart = file // "Song Title.mid"
      mainIsMid = true
    } else if (isChart && isNamedCorrectly && !mainIsMid) {
      mainChart = file // "notes.chart"
      mainIsNamedCorrectly = true
    } else if (isMid && isNamedCorrectly) {
      mainChart = file // "notes.mid"
      mainIsMid = true
      mainIsNamedCorrectly = true
    }
  }

  return mainChart
}

/**
 * @returns `true` if `name` has a valid ini file extension.
 */
export function hasIniExtension(name: string) {
  return ('.ini' == parse(lower(name)).ext)
}

/**
 * @returns `true` if `name` is a valid ini filename.
 */
export function hasIniName(name: string) {
  return (parse(lower(name)).name) == 'song'
}

/**
 * @returns `true` if `name` has a valid image file extension.
 */
export function hasImageExtension(name: string) {
  return (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg'].includes(parse(lower(name)).ext))
}

/**
 * @returns `true` if `name` is a valid album filename.
 */
export function hasAlbumName(name: string) {
  return (parse(lower(name)).name) == 'album'
}

/**
 * @returns `true` if `name` is a valid background filename.
 */
export function hasBackgroundName(name: string) {
  return (parse(lower(name)).name).startsWith('background')
}

/**
 * @returns `true` if `name` has a valid video file extension.
 */
export function hasVideoExtension(name: string) {
  return (['.mp4', '.avi', '.webm', '.ogv', '.mpeg'].includes(parse(lower(name)).ext))
}

/**
 * @returns `text` converted to locale lower case.
 */
export function lower(text: string) {
  return text.toLowerCase()
}

/**
 * @returns `text` with all style tags removed. (e.g. "<color=#AEFFFF>Aren Eternal</color> & Geo" -> "Aren Eternal & Geo")
 */
export function removeStyleTags(text: string) {
  let oldText = text
  let newText = text
  do {
    oldText = newText
    newText = newText.replace(/<\s*[^>]+>(.*)<\s*\/\s*[^>]+>/g, '$1')
  } while (newText != oldText)
  return newText
}

/**
 * @returns `input`, but as a magenta-colored string.
 */
export function mg(input: string | string[] | number | boolean) {
  return cli.magentaBright(input || 'null')
}