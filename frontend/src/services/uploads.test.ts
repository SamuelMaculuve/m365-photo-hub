import { describe, expect, it } from 'vitest'
import { chunkRanges } from './uploads'

describe('chunkRanges', () => {
  it('splits a file into inclusive byte ranges', () => {
    expect(chunkRanges(10, 4)).toEqual([[0, 3], [4, 7], [8, 9]])
    expect(chunkRanges(8, 4)).toEqual([[0, 3], [4, 7]])
    expect(chunkRanges(0, 4)).toEqual([])
  })
})
