import * as fs from 'fs'
import { join } from 'path'
import * as unrarjs from 'node-unrar-js'
import { promisify } from 'util'

const mkdir = promisify(fs.mkdir)
const open = promisify(fs.open)
const futimes = promisify(fs.futimes)
const close = promisify(fs.close)

/**
 * Extracts a .rar archive found at `sourceFile` and puts the extracted results in `destinationFolder`.
 */
export async function extractRar(sourceFile: string, destinationFolder: string) {
  const extractor = await unrarjs.createExtractorFromFile({ filepath: sourceFile, targetPath: destinationFolder })

  const fileList = extractor.getFileList()

  // Iterate through headers and save them to another array (because unrarjs didn't feel like allowing an iterator to iterate twice)
  const headers = fileList.fileHeaders
  const savedHeaders = []
  for (const header of headers) {
    savedHeaders.push(header)
  }

  // Create directories for nested archives (because unrarjs didn't feel like handling that automatically)
  for (const header of savedHeaders) {
    if (header.flags.directory) {
      try {
        await mkdir(join(destinationFolder, header.name), { recursive: true })
      } catch (e) {
        throw new Error(`Failed to extract directory: ${e}`)
      }
    }
  }

  // Extract archive
  const test = extractor.extract()
  for (const file of test.files) {
    // Iterate through files and do nothing (because unrarjs didn't feel like extracting when .extract() was called)
  }

  // Set file modification times (because unrarjs didn't feel like handling that automatically)
  for (const header of savedHeaders) {
    if (!header.flags.directory) {
      try {
        const fd = await open(join(destinationFolder, header.name), 'r+')
        const time = new Date(header.time)
        await futimes(fd, time, time)
        await close(fd)
      } catch (e) {
        throw new Error(`Failed to update the last modified times:\n${e}`)
      }
    }
  }
}