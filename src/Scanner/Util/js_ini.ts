/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint @typescript-eslint/no-explicit-any: 0 */ // Using any is required because that type is required in catch statements
export interface IParseConfig {
  comment?: string
  delimiter?: string
  nothrow?: boolean
  autoTyping?: boolean
  dataSections?: string[]
  removeQuotes?: boolean
}

export interface IStringifyConfig {
  delimiter?: string
  blankLine?: boolean
  spaceBefore?: boolean
  spaceAfter?: boolean
  keyOrder?: string[]
}

export const $Errors: unique symbol = Symbol('Errors of parsing')
const createErrorOfParse = (line: string) => new Error(`Unsupported type of line: "${line}"`)
const sectionNameRegex = /\[(.*)]$/

export type IniValue = string | number | boolean | IIniObjectSection | IIniObjectDataSection

export interface IIniObjectSection {
  [index: string]: IniValue
}

export function isSection(value: IniValue): value is IIniObjectSection {
  return typeof value == 'object' && !Array.isArray(value)
}

export type IIniObjectDataSection = string[]

export interface IIniObject extends IIniObjectSection {
  [$Errors]?: Error[]
}

const autoType = (val: string): boolean | number | string => {
  if ((val === 'true') || (val === 'false')) {
    return val === 'true'
  }
  if (val === '') {
    return true
  }
  if (!isNaN(parseFloat(val))) {
    return parseFloat(val)
  }
  return val
}

export function parse(data: string, params?: IParseConfig): IIniObject {
  const {
    delimiter = '=',
    comment = ';',
    nothrow = false,
    autoTyping = true,
    dataSections = [],
    removeQuotes = false,
  } = { ...params }

  const lines: string[] = data.split(/\r?\n/g)
  let currentSection = ''
  let isDataSection = false
  const result: IIniObject = {}

  for (const rawLine of lines) {
    const line: string = rawLine.trim()
    if ((line.length === 0) || (line.startsWith(comment))) {
      continue
    } else if (line[0].startsWith('[')) {
      const match = sectionNameRegex.exec(line)
      if (match !== null) {
        currentSection = match[1].trim().toLowerCase()
        isDataSection = dataSections.includes(currentSection)
        if (!(currentSection in result)) {
          result[currentSection] = (isDataSection) ? [] : {}
        }
        continue
      }
    } else if (isDataSection) {
      (result[currentSection] as IniValue[]).push(rawLine)
      continue
    } else if (line.includes(delimiter)) {
      const posOfDelimiter: number = line.indexOf(delimiter)
      const name = line.slice(0, posOfDelimiter).trim().toLowerCase()
      const rawVal = line.slice(posOfDelimiter + 1).trim()
      let val = (autoTyping) ? autoType(rawVal) : rawVal
      val = (removeQuotes) ? val.toString().replace(/^"(.*)"$/, '$1') : val
      if (currentSection !== '') {
        (result[currentSection] as IIniObjectSection)[name] = val
      } else {
        result[name] = val
      }
      continue
    } else if ((line.startsWith('{')) || (line.startsWith('}'))) {
      continue
    }

    const error = createErrorOfParse(line)
    if (!nothrow) {
      throw error
    } else {
      if ($Errors in result) {
        result[$Errors].push(error)
      } else {
        result[$Errors] = [error]
      }
    }
  }

  return result
}

export function stringify(data: IIniObject, params?: IStringifyConfig): string {
  const {
    delimiter = '=',
    blankLine = true,
    spaceBefore = false,
    spaceAfter = false,
    keyOrder = [],
  } = { ...params }
  const chunks: string[] = []
  const formatPare = (key: string, val: string): string => {
    let res: string = key
    if (spaceBefore) {
      res += ' '
    }
    res += delimiter
    if (spaceAfter) {
      res += ' '
    }
    res += val
    return res
  }
  const sectionKeys: string[] = []
  keyOrder.reverse()
  for (const key of Object.keys(data)) {
    let keyIsAdded = false
    while ((sectionKeys.length > 0) || !keyIsAdded) {
      const curKey = (keyIsAdded) ? sectionKeys.pop() : key
      const val = (keyIsAdded) ? data[key][curKey] : data[curKey]
      keyIsAdded = true
      const valType: string = typeof val
      if (['boolean', 'string', 'number'].includes(valType)) {
        chunks.push(formatPare(curKey, val.toString()))
      } else if (typeof val === 'object') {
        if (sectionKeys.length > 0) {
          throw new Error('too much nesting')
        }
        if (blankLine) {
          chunks.push('')
        }
        chunks.push(`[${key}]`)
        if (Array.isArray(val)) {
          // is datasection
          chunks.push(...val)
        } else {
          sectionKeys.push(...Object.keys(val).sort((a, b) => { return (keyOrder.indexOf(b) - keyOrder.indexOf(a)) * -1 }))
        }
      }
    }
  }
  return chunks.join('\n')
}

export const decode = parse
export const encode = stringify