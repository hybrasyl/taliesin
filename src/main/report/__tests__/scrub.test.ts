import { describe, it, expect } from 'vitest'
import { scrubText, escapeRegExp } from '../scrub'

describe('scrubText', () => {
  it('redacts emails and IPv4 addresses', () => {
    expect(scrubText('contact me@example.com from 192.168.0.1')).toBe('contact <email> from <ip>')
  })

  it('collapses deep Windows paths to their basename, dropping the account name', () => {
    expect(scrubText('at C:\\Users\\alice\\world\\items\\Foo.xml')).toBe('at …\\Foo.xml')
  })

  it('collapses deep POSIX paths to their basename', () => {
    expect(scrubText('read /home/alice/world/items/Foo.xml')).toBe('read …/Foo.xml')
  })

  it('does not mangle URLs', () => {
    const url = 'see https://github.com/hybrasyl/taliesin'
    expect(scrubText(url)).toBe(url)
  })

  it('redacts the name in short account paths the collapse missed', () => {
    expect(scrubText('C:\\Users\\alice')).toBe('C:\\Users\\<user>')
    expect(scrubText('/home/alice')).toBe('/home/<user>')
  })

  it('redacts the explicit homeDir', () => {
    expect(scrubText('cache at D:\\weird\\home', { homeDir: 'D:\\weird\\home' })).toBe(
      'cache at <HOME>'
    )
  })

  it('redacts a bare username token only when >= 3 chars', () => {
    expect(scrubText('user bethany logged in', { userName: 'bethany' })).toBe(
      'user <user> logged in'
    )
  })

  it('does not over-scrub a short username inside innocent words', () => {
    expect(scrubText('also always', { userName: 'al' })).toBe('also always')
  })

  it('leaves clean text unchanged and passes through empty input', () => {
    expect(scrubText('a plain error message')).toBe('a plain error message')
    expect(scrubText('')).toBe('')
  })
})

describe('escapeRegExp', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c')
  })
})
