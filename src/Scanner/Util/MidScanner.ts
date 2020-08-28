/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as MIDIFile from 'midifile'
import { promisify } from 'util'
import { ChartData } from '../chartDataInterface'

const readFile = promisify(fs.readFile)
// 3/4ths of this is inspired by MoonScraper's MidReader
// https://github.com/FireFox2000000/Moonscraper-Chart-Editor/blob/master/Moonscraper%20Chart%20Editor/Assets/Scripts/Charts/IO/Midi/MidReader.cs

// The rest is pure, unadulterated reverse engineering (I mean who has time to check the specs anyway Kappa)

const getMD5 = txt => {
  const hash = crypto.createHash('md5')
  hash.update(txt)
  return hash.digest('hex')
}

const partMap = {
  'PART GUITAR': 'guitar',
  'PART BASS': 'bass',
  'PART RHYTHM': 'rhythm',
  'PART KEYS': 'keys',
  'PART DRUMS': 'drums',
  'PART VOCALS': 'vocals',
  'PART GUITAR GHL': 'guitarghl',
  'PART BASS GHL': 'bassghl'
}
const diffOffsets = { e: 59, m: 71, h: 83, x: 95 }

export async function parseMidiFile(filepath: string): Promise<ChartData> {
  const midiText = await readFile(filepath)

  const midi = new MIDIFile(midiText)
  let hasSections = false,
    hasSoloSections = false,
    hasStarPower = false,
    hasForced = false,
    hasTap = false,
    hasLyrics = false,
    hasOpen = {},
    notes = {}

  const brokenNotes = []

  // Detect 120 BPM charts
  const bpmEvents = midi.getTrackEvents(0).filter(({ tempoBPM }) => tempoBPM)
  const is120 = bpmEvents.length == 1 && bpmEvents[0].tempoBPM == 120

  const dataMeta = parseData(midi)
  hasSections = dataMeta.hasSections
  hasLyrics = dataMeta.hasLyrics
  hasTap = dataMeta.hasTap
  hasOpen = dataMeta.hasOpen
  hasForced = dataMeta.hasForced
  hasStarPower = dataMeta.hasStarPower
  brokenNotes.push(...dataMeta.brokenNotes)
  hasSoloSections = dataMeta.hasSoloSections
  notes = dataMeta.notes
  const firstNoteTime = dataMeta.firstNoteTime
  const lastNoteTime = dataMeta.lastNoteTime || 0
  const noteCounts = getNoteCounts(midiText, notes)

  return {
    hasSections, hasStarPower, hasForced, hasSoloSections,
    hasTap, hasOpen, noteCounts, is120, hasLyrics,
    hasBrokenNotes: !!brokenNotes.length,
    length: lastNoteTime / 1000 >> 0,
    effectiveLength: (lastNoteTime - firstNoteTime) / 1000 >> 0
  }
}


function parseData(midi: MIDIFile) {

  let dataMeta: any = {}
  dataMeta.hasSections = false
  dataMeta.hasLyrics = false
  dataMeta.hasTap = false
  dataMeta.hasOpen = {}
  dataMeta.hasSoloSections = false
  dataMeta.hasForced = false
  dataMeta.isOpen = false
  dataMeta.hasStarPower = false
  dataMeta.hasBrokenNotes = false
  dataMeta.brokenNotes = []
  dataMeta.firstNoteTime = 0
  dataMeta.lastNoteTime = 0
  dataMeta.tracks = {}
  dataMeta.notes = {}


  midi.getEvents().forEach(event => {

    // data is a string attached to the MIDI event.
    // It generally denotes chart events (sections, lighting...)
    const data = event.data ? event.data.map(d => String.fromCharCode(d)).join('') : null

    // Let's hope I'm not wrong
    if (event.param1 == 103) {
      dataMeta.hasSoloSections = true

    } else if (data && data.match(/^\[(section|prc)/)) dataMeta.hasSections = true // prc? different standards for .mids smh, that's most likely from RB though

    else if (data && partMap[data]) {
      if (data.trim() == 'PART VOCALS') { dataMeta.hasLyrics = true } // CH lyrics take from the vocals part
      dataMeta.tracks[event.track] = partMap[data]
    } else if (data == "PS\u0000\u0000ÿ\u0004\u0001÷") dataMeta.hasTap = true // If that ain't black magic, I don't know what it is. But it works.

    else if (data == "PS\u0000\u0000\u0003\u0001\u0001÷") {
      dataMeta.hasOpen[dataMeta.tracks[event.track]] = true
      dataMeta.isOpen = true
    } else if (data == "PS\u0000\u0000\u0003\u0001\u0000÷") dataMeta.isOpen = false

    // param1 is the note being played.
    // The interesting things happen here...
    if (event.param1 && event.param1 != 103) {
      if (event.param1 == 116) dataMeta.hasStarPower = true
      else if ([65, 66, 77, 78, 89, 90, 101, 102].includes(event.param1)) dataMeta.hasForced = true
      else if (dataMeta.tracks[event.track] != 'guitarghl' && dataMeta.tracks[event.track] != 'bassghl') {
        // Detect which difficulty the note is on
        const diff = detectDiffNonGHL(event)
        dataMeta = parseNonGHLEvent(diff, event, dataMeta)
      } else {
        // Detect which difficulty the note is on
        const diff = detectGHLDiff(event)
        dataMeta = parseGHLEvent(diff, event, dataMeta)

      }
    }
  })

  return dataMeta
}

function detectDiffNonGHL(event: any) {
  let diff
  if (event.param1 >= 60 && event.param1 <= 64) diff = 'e'
  else if (event.param1 >= 72 && event.param1 <= 76) diff = 'm'
  else if (event.param1 >= 84 && event.param1 <= 88) diff = 'h'
  else if (event.param1 >= 96 && event.param1 <= 100) diff = 'x'
  return diff
}

function detectGHLDiff(event: any) {
  let diff
  if (event.param1 >= 94) diff = 'x'
  else if (event.param1 >= 82) diff = 'h'
  else if (event.param1 >= 70) diff = 'm'
  else if (event.param1) diff = 'e'
  return diff
}

function parseNonGHLEvent(diff: any, event: any, dataMeta: any) {

  let previous

  if (diff && event.subtype == 9) {

    // Broken note logic
    // Check chart.js for the logic behind broken notes,
    // I can't be bothered to copy/paste/adapt
    if (previous) {
      const distance = event.playTime - previous.time
      if (distance > 0 && distance < 5) {
        dataMeta.brokenNotes.push({ time: previous.time, nextTime: event.playTime })
      }
    }
    if (!previous || previous.time != event.playTime) previous = { time: event.playTime }
    if (!dataMeta.firstNoteTime) dataMeta.firstNoteTime = event.playTime
    if (event.playTime > dataMeta.lastNoteTime) dataMeta.lastNoteTime = event.playTime
    if (!dataMeta.notes[`${dataMeta.tracks[event.track]}.${diff}`]) dataMeta.notes[`${dataMeta.tracks[event.track]}.${diff}`] = {}
    dataMeta.notes[`${dataMeta.tracks[event.track]}.${diff}`][event.playTime] = `${dataMeta.notes[`${dataMeta.tracks[event.track]}.${diff}`][event.playTime] || ''}${dataMeta.isOpen ? 7 : event.param1 - diffOffsets[diff]}`
  }
  return dataMeta
}

function parseGHLEvent(diff: any, event: any, dataMeta: any) {
  let previous

  if (diff && event.subtype == 9) {
    if (previous) {
      const distance = event.playTime - previous.time
      if (distance > 0 && distance < 5) {
        dataMeta.brokenNotes.push({ time: previous.time })
      }
    }
    if (!previous || previous.time != event.playTime) previous = { time: event.playTime }
    if (!dataMeta.firstNoteTime) dataMeta.firstNoteTime = event.playTime
    if (event.playTime > dataMeta.lastNoteTime) dataMeta.lastNoteTime = event.playTime
    if (!dataMeta.notes[`${dataMeta.tracks[event.track]}.${diff}`]) dataMeta.notes[`${dataMeta.tracks[event.track]}.${diff}`] = {}
    // GHL notes are offset by 2. If the ensuing result equals 0, it's an open note.
    dataMeta.notes[`${dataMeta.tracks[event.track]}.${diff}`][event.playTime] = `${dataMeta.notes[`${dataMeta.tracks[event.track]}.${diff}`][event.playTime] || ''}${+(event.param1 - diffOffsets[diff] + 1) || 7}`
  }

  return dataMeta

}

function getNoteCounts(midiText: any, notes: any) {

  // Compute the hash of the .mid itself first
  const hashes = { file: getMD5(midiText) }
  const noteCounts = {}
  let earliestNote = +Infinity, latestNote = 0

  for (const part in notes) {
    const [instrument, difficulty] = part.split('.')
    // We have to reorder the values by ascending index (Object.values gets by "alphabetical" order of index)
    const notesArray = Object.keys(notes[part]).sort((a, b) => +a < +b ? -1 : 1).map(index => {
      if (+index < earliestNote) earliestNote = +index
      if (+index > latestNote) latestNote = +index
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
  }

  return noteCounts
}