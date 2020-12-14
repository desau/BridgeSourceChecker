import { getSettings, LogLevel } from '../src/ScanSettings'

export const scanSettings = getSettings({

  /** How much text should be printed in the console. Options are `LogLevel.INFO`, `LogLevel.ERROR`, and `LogLevel.SILENT` */
  logLevel: LogLevel.INFO,

  /** The folder where downloaded charts should be saved */
  downloadsFilepath: './ChartDownloads',

  /** If the program should pull drive links from the clipboard instead of sources.json */
  clipboardLinksMode: false,

  /** Scan all charts detected in sources, even if they have already been scanned before (may add duplicate lines to ScanErrors) */
  rescanAllVersions: true,

  /** Instead of scanning all of sources.json, only scan the last X added sources (use 0 to scan all sources) */
  onlyScanLastXSources: 0,

  /** Files larger than this number of megabytes will not be downloaded from Google Drive (anything too large will crash when unzipping) */
  maxDownloadSizeMB: 3000,

  /** The minimum number of charts that each source should have. If there are fewer than this, an error is added to ScanErrors */
  minimumChartCount: 5,

  /** If the number of errors in a source is greater than or equal to this, it is put in the "ManyErrors" folder instead of the "FewErrors" folder */
  seriousErrorThreshold: 3,

  /** Maximum number of charts to download per drive, or -1 for no limit */
  maxDownloadsPerDrive: -1
})