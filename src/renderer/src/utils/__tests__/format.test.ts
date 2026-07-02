import { describe, it, expect } from 'vitest'
import { formatBytes, filenameFromPath } from '../format'

describe('formatBytes', () => {
  it('shows bytes under 1 KiB', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })
  it('shows KB from 1 KiB up to 1 MiB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })
  it('shows MB at 1 MiB and above', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('filenameFromPath', () => {
  it('returns the last segment of a posix path', () => {
    expect(filenameFromPath('/a/b/c/readme.txt')).toBe('readme.txt')
  })
  it('normalizes Windows backslashes', () => {
    expect(filenameFromPath('C:\\Games\\Dark Ages\\1.mus')).toBe('1.mus')
    expect(filenameFromPath('a\\b/c\\file.png')).toBe('file.png')
  })
  it('returns the input when there is no separator', () => {
    expect(filenameFromPath('bare.json')).toBe('bare.json')
  })
})
