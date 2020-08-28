import { getSettings, LogLevel } from '../src/Models/ScanSettings.model'

export const scanSettings = getSettings({

  /** How much text should be printed in the console. Options are `LogLevel.INFO`, `LogLevel.ERROR`, and `LogLevel.SILENT` */
  logLevel: LogLevel.INFO,

  /** The folder where downloaded charts should be saved */
  downloadsFilepath: './ChartDownloads',

  /** Scan all charts detected in sources, even if they have already been scanned before (may add duplicate lines to ScanErrors) */
  rescanAllVersions: false,

  /** Instead of scanning all of sources.json, only scan the last X added sources (use 0 to scan all sources) */
  onlyScanLastXSources: 0,

  /** Files larger than this number of megabytes will not be downloaded from Google Drive (anything too large will crash when unzipping) */
  maxDownloadSizeMB: 3000

})