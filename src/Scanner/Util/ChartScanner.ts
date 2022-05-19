/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as crypto from 'crypto'
import * as fs from 'fs'
import { promisify } from 'util'
import { ChartData } from '../chartDataInterface'
import { getEncoding } from '../../UtilFunctions'

const readFile = promisify(fs.readFile)

const getMD5 = txt => {
  const hash = crypto.createHash('md5')
  hash.update(txt)
  return hash.digest('hex')
}

const diffMap = {
  '[ExpertSingle]': 'guitar.x',
  '[HardSingle]': 'guitar.h',
  '[MediumSingle]': 'guitar.m',
  '[EasySingle]': 'guitar.e',

  '[ExpertDoubleBass]': 'bass.x',
  '[HardDoubleBass]': 'bass.h',
  '[MediumDoubleBass]': 'bass.m',
  '[EasyDoubleBass]': 'bass.e',

  '[ExpertDoubleRhythm]': 'rhythm.x',
  '[HardDoubleRhythm]': 'rhythm.h',
  '[MediumDoubleRhythm]': 'rhythm.m',
  '[EasyDoubleRhythm]': 'rhythm.e',

  '[ExpertKeyboard]': 'keys.x',
  '[HardKeyboard]': 'keys.h',
  '[MediumKeyboard]': 'keys.m',
  '[EasyKeyboard]': 'keys.e',

  '[ExpertDrums]': 'drums.x',
  '[HardDrums]': 'drums.h',
  '[MediumDrums]': 'drums.m',
  '[EasyDrums]': 'drums.e',

  '[ExpertGHLGuitar]': 'guitarghl.x',
  '[HardGHLGuitar]': 'guitarghl.h',
  '[MediumGHLGuitar]': 'guitarghl.m',
  '[EasyGHLGuitar]': 'guitarghl.e',

  '[ExpertGHLBass]': 'bassghl.x',
  '[HardGHLBass]': 'bassghl.h',
  '[MediumGHLBass]': 'bassghl.m',
  '[EasyGHLBass]': 'bassghl.e',
}

// For normalizing the note numbers for the hashes,
// goes from 1 to 5 for regular frets,
// 6 for the 6th fret of GHL
// and 7 for open notes
const notesMap = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 8: 6, 7: 7 }

/**
 * Scans the .chart file at `filepath`.
 * @returns a `ChartData` object for that .chart file.
 * @throws an exception if the scan failed.
 */
export async function parseChartFile(filepath: string): Promise<ChartData> {
  const chartBuffer = await readFile(filepath)
  const encoding = getEncoding(filepath, chartBuffer)
  const chartText = chartBuffer.toString(encoding)
  // Trim each line because of Windows \r\n shenanigans
  const lines = chartText.split('\n').map(line => line.trim())
  if (!isValidChartFile(lines)) throw new Error()

  const resolution = getResolution(lines)
  const eventsMeta = scanEvents(lines)

  const firstNotesSectionIndex = getFirstNotesSectionIndex(lines)
  if (firstNotesSectionIndex == -1) throw new Error()

  const notesMeta = scanNotes(firstNotesSectionIndex, lines)
  const hasOpen = getHasOpenNotes(firstNotesSectionIndex, lines)
  const noteIndexes = getNoteIndexes(firstNotesSectionIndex, lines)

  const firstNoteIndex = noteIndexes.firstNoteIndex
  const lastNoteIndex = noteIndexes.lastNoteIndex
  const brokenNotes = getBrokenNotes(firstNotesSectionIndex, lines, eventsMeta.sections)
  const notes = getAllNotes(firstNotesSectionIndex, lines)
  const sustainsWithNoGaps = getSustainsWithNoGaps(firstNotesSectionIndex, lines)

  const tempoMap = getTempoMap(lines)

  const mapData = getNoteTimestamps(tempoMap, resolution, firstNoteIndex, lastNoteIndex)
  let time = mapData.time
  const timeToFirstNote = mapData.timeToFirstNote
  let timeToLastNote = mapData.timeToLastNote
  const currentIndex = mapData.currentIndex
  const currentBpm = mapData.currentBpm

  const is120 = checkIf120(currentIndex, currentBpm)

  // do it one last time against the last note if the last note is after
  // the last BPM change
  if (currentIndex < lastNoteIndex) {
    time += (((lastNoteIndex - currentIndex) * 60) / (currentBpm * resolution))
    timeToLastNote += (((lastNoteIndex - currentIndex) * 60) / (currentBpm * resolution))
  }

  brokenNotes.forEach(note => {
    delete note.found
  })

  // Compute the hash of the .chart itself first
  const hashes = { file: getMD5(chartBuffer) }

  const noteCounts = getNoteCounts(notes, hashes)

  return {
    hasSections: eventsMeta.hasSections,
    hasStarPower: notesMeta.hasStarPower,
    hasForced: notesMeta.hasForced,
    hasTap: notesMeta.hasTap,
    sustainsWithNoGaps: sustainsWithNoGaps,
    hasOpen,
    hasSoloSections: notesMeta.hasSoloSections,
    hasLyrics: eventsMeta.hasLyrics,
    noteCounts, is120,
    hasBrokenNotes: !!brokenNotes.length,
    length: time >> 0,
    effectiveLength:  (timeToLastNote - timeToFirstNote) >> 0
  }

  /**
   * Verifies that the chart file defined in `lines` contains a `[Song]` section.
   */
  function isValidChartFile(lines: string[]) {
    return lines.find(line => line.includes('[Song]')) != undefined
  }

  /**
   * @returns the chart's resolution as defined in the first section of the chart (which should be `[Song]`)
   */
  function getResolution(lines: string[]) {
    for (let i = 1; i < lines.length && !lines[i].includes('}'); i++) {
      const [param, value] = lines[i].split(' = ').map(line => line.trim())
      if (param == 'Resolution') {
        return Number(value.startsWith('"') ? value.slice(1, -1) : value)
      }
    }
  }

  /**
   * Scans the `[Events]` section to check for sections and lyrics.
   */
  function scanEvents(lines: string[]) {
    const eventsMeta = {
      hasSections: false,
      sections: [] as { index: number; section: string }[],
      hasLyrics: false
    }

    const eventsIndex = lines.indexOf('[Events]')
    for (let i = eventsIndex; i < lines.length && !lines[i].includes('}'); i++) {
      if (isLineLyric(lines[i])) {
        eventsMeta.hasLyrics = true
      } else if (isLineSection(lines[i])) {
        const splitLine = lines[i].split(' = ')
        if (splitLine.length == 2) {
          eventsMeta.hasSections = true
          eventsMeta.sections.push({
            index: Number(splitLine[0].trim()),
            section: splitLine[1]
          })
        }
      }
    }

    return eventsMeta
  }

  function isLineSection(line: string) {
    return line.includes('"section ')
  }

  function isLineLyric(line: string) {
    return line.includes('"lyric ')
  }

  function getFirstNotesSectionIndex(lines: string[]) {
    return lines.findIndex(line => diffMap[line])
  }

  /**
   * Scans all the sections that contain notes to check for forcing, taps, solo sections, and star power.
   */
  function scanNotes(firstNotesSectionIndex: number, lines: string[]) {
    const notesMeta = {
      hasForced: false,
      hasTap: false,
      hasSoloSections: false,
      hasStarPower: false
    }

    for(let i = firstNotesSectionIndex; i < lines.length; i++) {
      if (isLineForced(lines[i])) {
        notesMeta.hasForced = true
      }

      if (isLineTap(lines[i])) {
        notesMeta.hasTap = true
      } else if (isLineSolo(lines[i])) {
        notesMeta.hasSoloSections = true
      } else if (isLineStarPower(lines[i])) {
        notesMeta.hasStarPower = true
      }
    }

    return notesMeta
  }

  function isLineForced(line: string) {
    return line.includes('N 5 ')
  }

  function isLineTap(line: string) {
    return line.includes('N 6 ')
  }

  function isLineSolo(line: string) {
    return line.includes(' solo')
  }

  function isLineStarPower(line: string) {
    return line.includes('S 2')
  }

  function getAllNotes(notesIndex: number, lines: string[]) {
    const notes = {}
    let currentDifficulty: string
    for (let i = notesIndex; i < lines.length; i++) {
      const line = lines[i]
      if (/N 7 /.exec(line) && currentDifficulty) {
        hasOpen[currentDifficulty.slice(0, currentDifficulty.indexOf('.'))] = true
      }
      // Detect new difficulty
      if (diffMap[line]) {
        currentDifficulty = diffMap[line]
        notes[currentDifficulty] = {}
      }
      // Detect new notes
      const [, index, note] = /(\d+) = N ([0-4]|7|8) /.exec(line) || []
      if (note && currentDifficulty) {
        notes[currentDifficulty][index] = `${(notes[currentDifficulty][index] || '')}${notesMap[note]}`
      }

    }
    return notes

  }

  function getSustainsWithNoGaps(notesIndex: number, lines: string[]) {
    const noteSustains = {}
    const sustainsWithNoGaps = []
    let currentDifficulty: string

    for (let i = notesIndex; i < lines.length; i++) {
      const line = lines[i]

      // Detect new difficulty
      if (diffMap[line]) {
        currentDifficulty = diffMap[line]
        noteSustains[currentDifficulty] = {}
      }
      // Detect new notes and record any sustains. Note that we track sustains separately for each note
      // to support extended sustains.
      const [, index, note, sustain] = /(\d+) = N ([0-4]|7|8) (\d+)/.exec(line) || []
      if (note && currentDifficulty) {
        (noteSustains[currentDifficulty][notesMap[note]] ??= []).push({offset:index, sustain:sustain})
      }
    }

    for (const noteLane in noteSustains[currentDifficulty]) {
      const laneNotes = noteSustains[currentDifficulty][noteLane]
      let previousSustainEnd = 0
      for (let i = 0; i < laneNotes.length; i++) {
        if (previousSustainEnd > 0) {
          if (Number(laneNotes[i].offset == previousSustainEnd)) {
            sustainsWithNoGaps.push(previousSustainEnd)
          }
        }
        if (laneNotes[i].sustain) {
          previousSustainEnd = Number(laneNotes[i].offset) + Number(laneNotes[i].sustain)
        } else {
          previousSustainEnd = 0
        }
      }
    }

    return sustainsWithNoGaps
  }

  function getHasOpenNotes(notesIndex: number, lines: string[]) {
    const hasOpen = {}
    const notes = {}
    let currentDifficulty: string

    for (let i = notesIndex; i < lines.length; i++) {
      const line = lines[i]
      if (/N 7 /.exec(line) && currentDifficulty) {
        hasOpen[currentDifficulty.slice(0, currentDifficulty.indexOf('.'))] = true
      }
      // Detect new difficulty
      if (diffMap[line]) {
        currentDifficulty = diffMap[line]
        notes[currentDifficulty] = {}
      }
      // Detect new notes
      const [, index, note] = /(\d+) = N ([0-4]|7|8) /.exec(line) || []
      if (note && currentDifficulty) {
        notes[currentDifficulty][index] = `${(notes[currentDifficulty][index] || '')}${notesMap[note]}`
      }

    }
    return hasOpen

  }

  function getNoteIndexes(notesIndex: number, lines: string[]) {
    const notes = {}
    let currentDifficulty: string
    let firstNoteIndex = 0
    let lastNoteIndex = 0
    let previous

    for (let i = notesIndex; i < lines.length; i++) {
      const line = lines[i]

      // Detect new difficulty
      if (diffMap[line]) {
        currentDifficulty = diffMap[line]
        notes[currentDifficulty] = {}
      }
      // Detect new notes
      const [, index, note] = /(\d+) = N ([0-4]|7|8) /.exec(line) || []
      if (note && currentDifficulty) {
        if (!firstNoteIndex) firstNoteIndex = +index
        if (+index > lastNoteIndex) lastNoteIndex = +index
        notes[currentDifficulty][index] = `${(notes[currentDifficulty][index] || '')}${notesMap[note]}`
      }
      if (+index && (!previous || previous.index != index)) previous = { index, note }
    }
    return {firstNoteIndex, lastNoteIndex}
  }

  function getBrokenNotes(notesIndex: number, lines: string[], sections: {index: number; section: string}[]) {
    const notes = {}
    const brokenNotes = []
    let currentDifficulty: string
    let previous

    for (let i = notesIndex; i < lines.length; i++) {
      const line = lines[i]

      // Detect new difficulty
      if (diffMap[line]) {
        currentDifficulty = diffMap[line]
        notes[currentDifficulty] = {}
      }
      // Detect new notes
      const [, index, note] = /(\d+) = N ([0-4]|7|8) /.exec(line) || []
      // Detect broken notes (i.e. very small distance between notes)
      // Abysmal @ 64000 and 64768 (1:10'ish) has broken GR chords (distance = 4)
      // Down Here @ 116638 (1:24) has a double orange (distance = 2)
      // I'm in the Band very first note is a doubled yellow (distance = 1)
      // There's likely gonna be some false positives, but this is likely to help setlist makers
      // for proofchecking stuff.
      if (previous) {
        const distance = Number(index) - Number(previous.index)
        if (distance > 0 && distance < 5) brokenNotes.push({
          index: +previous.index,
          section: sections[sections.findIndex(section => +section.index > +previous.index) - 1],
          time: 0
        })
      }
      if (+index && (!previous || previous.index != index)) previous = { index, note }
    }
    return brokenNotes
  }

  function getTempoMap(lines: string[]) {
    // Get Tempo map [SyncTrack] to get effective song length
    const syncTrackIndexStart = lines.indexOf('[SyncTrack]')
    const syncTrackIndexEnd = lines.indexOf('}', syncTrackIndexStart)
    const tempoMap = lines.slice(syncTrackIndexStart, syncTrackIndexEnd)
      .reduce((arr, line) => {
        const [, index, bpm] = /\s*(\d+) = B (\d+)/.exec(line) || []
        if (index) arr.push([+index, +bpm / 1000])
        return arr
      }, [])
    return tempoMap
  }

  function getNoteTimestamps(tempoMap: any, resolution: number, firstNoteIndex: any, lastNoteIndex: any) {
    let time = 0
    let timeToFirstNote = 0
    let timeToLastNote = 0
    let isFirstNoteFound
    let isLastNoteFound
    let currentIndex
    let currentBpm
    tempoMap.forEach(([index, bpm]) => {
      if (currentIndex != null) {
        // does it look like I pulled this formula from my ass? because I kinda did tbh
        // (the "Resolution" parameter defines how many "units" there are in a beat)
        time += (((index - currentIndex) * 60) / (currentBpm * resolution))
        // Calculate the timestamp of the first note
        if (index <= firstNoteIndex) {
          timeToFirstNote += (((index - currentIndex) * 60) / (currentBpm * resolution))
        } else if (!isFirstNoteFound) {
          isFirstNoteFound = true
          timeToFirstNote += (((firstNoteIndex - currentIndex) * 60) / (currentBpm * resolution))
        }
        // Calculate the timestamp of the last note
        if (index <= lastNoteIndex) {
          timeToLastNote += (((index - currentIndex) * 60) / (currentBpm * resolution))
        } else if (!isLastNoteFound) {
          isLastNoteFound = true
          timeToLastNote += (((lastNoteIndex - currentIndex) * 60) / (currentBpm * resolution))
        }
        // Compute timestamp of broken notes
        brokenNotes.forEach(note => {
          if (index <= note.index) {
            note.time += (((index - currentIndex) * 60) / (currentBpm * resolution))
          } else if (!note.found) {
            note.found = true
            note.time += (((note.index - currentIndex) * 60) / (currentBpm * resolution))
          }
        })
      }
      currentIndex = index
      currentBpm = bpm
    })
    return {time, timeToFirstNote, timeToLastNote, currentIndex, currentBpm}
  }

  function checkIf120(currentIndex: number, currentBpm: number) {
    // If the current index is 0 (beginning of chart) and the BPM is 120 ("B 120000"),
    // it's most likely not beat mapped and needs to be fixed
    return (currentIndex == 0 && currentBpm == 120)
  }

  function getNoteCounts(notes: any, hashes: any) {
    const noteCounts: {
      [instrument: string]: {
        [difficulty: string]: number
      }
    } = {}
    for (const part in notes) {
      const [instrument, difficulty] = part.split('.')
      // We have to reorder the values by ascending index (Object.values gets by "alphabetical" order of index)
      const notesArray = Object.keys(notes[part]).sort((a, b) => +a < +b ? -1 : 1).map(index => {
        return notes[part][+index]
      })
      // Ignore tracks with less than 10 notes
      if (notesArray.length < 10) continue
      if (!hashes[instrument]) {
        hashes[instrument] = {}
        noteCounts[instrument] = {}
      }
      // Compute the hashes and note counts of individual difficulties/instruments
      noteCounts[instrument][difficulty] = notesArray.length
      hashes[instrument][difficulty] = getMD5(notesArray.join(' '))
    }
    return noteCounts
  }
}