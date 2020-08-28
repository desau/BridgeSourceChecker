import * as fs from 'fs'
import { join } from 'path'
import * as unrarjs from 'node-unrar-js'
import { promisify } from 'util'
import { log } from '../UtilFunctions'

const mkdir = promisify(fs.mkdir)

/**
 * Extracts a .rar archive found at `sourceFile` and puts the extracted results in `destinationFolder`.
 */
export async function extractRar(sourceFile: string, destinationFolder: string) {
  const extractor = unrarjs.createExtractorFromFile(sourceFile, destinationFolder)

  const fileList = extractor.getFileList()

  if (fileList[0].state != 'FAIL') {

    // Create directories for nested archives (because unrarjs didn't feel like handling that automatically)
    const headers = fileList[1].fileHeaders
    for (const header of headers) {
      if (header.flags.directory) {
        try {
          await mkdir(join(destinationFolder, header.name), { recursive: true })
        } catch (e) {
          throw new Error(`Failed to extract directory: ${e}`)
        }
      }
    }
  } else {
    log.warn('Warning: failed to read .rar files: ', fileList[0].reason, fileList[0].msg)
  }

  // Extract archive
  const extractResult = extractor.extractAll()

  if (extractResult[0].state == 'FAIL') {
    throw new Error(`${extractResult[0].reason}: ${extractResult[0].msg}`)
  }
}