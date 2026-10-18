import assert from 'node:assert/strict'
import test from 'node:test'
import { jobLabel, jobRuns, sourceLink, sourceTags } from './imageSources.js'

test('source links require their exact provider and no credentials', () => {
  assert.equal(sourceLink({ platform: 'danbooru', source_url: 'https://danbooru.donmai.us/posts/1' }), 'https://danbooru.donmai.us/posts/1')
  for (const source_url of ['http://danbooru.donmai.us/posts/1', 'https://evil.test/1',
    'https://user:secret@danbooru.donmai.us/posts/1', 'https://danbooru.donmai.us:8443/posts/1']) {
    assert.equal(sourceLink({ platform: 'danbooru', source_url }), null)
  }
  assert.equal(sourceLink({ platform: 'unknown', source_url: 'https://danbooru.donmai.us/posts/1' }), null)
})

test('tag groups retain artists and deduplicate display tags', () => {
  assert.deepEqual(sourceTags({ tags: { general: ['blue', 'synthetic'], artist: ['synthetic', 'demo_artist'] } }), ['blue', 'synthetic', 'demo_artist'])
  assert.deepEqual(sourceTags({}), [])
})

test('restart recovery stays distinct from active work', () => {
  assert.equal(jobRuns({ state: 'interrupted' }), false)
  assert.equal(jobRuns({ state: 'queued' }), true)
  assert.equal(jobLabel({ phase: 'download', state: 'interrupted' }), 'Download: Interrupted')
})
