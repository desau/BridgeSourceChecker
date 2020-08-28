/* eslint @typescript-eslint/no-explicit-any: 0 */ // Using any is required because that type is required in catch statements
import { red } from 'cli-color'
import { log } from './UtilFunctions'

/**
 * Displays an error message for reading files.
 */
export function failRead(filepath: string, error: any) {
  log.error(`${red('ERROR:')} Failed to read files at (${filepath}):\n`, error)
}

/**
 * Displays an error message for writing files.
 */
export function failWrite(filepath: string, error: any) {
  log.error(`${red('ERROR:')} Failed to write to file (${filepath}):\n`, error)
}

/**
 * Displays an error message for opening files.
 */
export function failOpen(filepath: string, error: any) {
  log.error(`${red('ERROR:')} Failed to open file (${filepath}):\n`, error)
}

/**
 * Displays an error message for deleting folders.
 */
export function failDelete(filepath: string, error: any, type: 'directory' | 'file') {
  log.error(`${red('ERROR:')} Failed to delete ${type} (${filepath}):\n`, error)
}

/**
 * Displays an error message for failing to parse an .ini file.
 */
export function failParse(filepath: string, error: any) {
  log.error(`${red('ERROR:')} Failed to parse ini file (${filepath}):\n`, error)
}

/**
 * Displays an error message for processing a query.
 */
export function failQuery(query: string, error: any, rolledBack: boolean) {
  log.error(`${red('ERROR:')} Failed to execute query:\n${query}\nWith error:\n`, error)
  log.error(rolledBack ? '(successfully rolled back transaction)' : '(failed to roll back transaction)')
}

/**
 * Displays an error message for connecting to the database.
 */
export function failDatabase(error: any) {
  log.error(`${red('ERROR:')} Failed to connect to database:\n`, error)
}

/**
 * Displays an error message for processing audio files.
 */
export function failFFMPEG(audioFile: string, error: any) {
  log.error(`${red('ERROR:')} Failed to process audio file (${audioFile}):\n`, error)
}

/**
 * Displays an error message for downloading charts.
 */
export function failDownload(error: any) {
  log.error(`${red('ERROR:')} Failed to download chart:\n`, error)
}

/**
 * Displays an error message for reading files.
 */
export function failScan(filepath: string) {
  log.error(`${red('ERROR:')} The specified library folder contains no files (${filepath})`)
}

/**
 * Displays an error message for failing to unzip an archived file.
 */
export function failUnzip(filepath: string, error: any) {
  log.error(`${red('ERROR:')} Failed to extract archive at (${filepath}):\n`, error)
}

/**
 * Displays an error message for not providing a necessary scan setting.
 */
export function failSetting(settingName: string) {
  log.error(`${red('ERROR:')} ${settingName} setting is not defined`)
}

/**
 * Displays an error message for failing to connect to the Google Drive API.
 */
export function failDrive(error: any) {
  log.error(`${red('ERROR:')} failed to authenticate with the Google Drive API:\n`, error)
}

/**
 * Displays an error message for Google Drive returning no filename.
 */
export function failDriveName() {
  log.error(`${red('ERROR:')} Google Drive returned a file with no name`)
}