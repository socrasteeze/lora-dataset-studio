import assert from 'node:assert/strict'
import test from 'node:test'
import { jobLabel, jobRuns, sourceLink, sourceName, sourceProvider, sourceTags } from './imageSources.js'

test('source links require their exact provider and no credentials', () => {
  assert.equal(sourceLink({ platform: 'danbooru', source_url: 'https://danbooru.donmai.us/posts/1' }), 'https://danbooru.donmai.us/posts/1')
  for (const source_url of ['http://danbooru.donmai.us/posts/1', 'https://evil.test/1',
    'https://user:secret@danbooru.donmai.us/posts/1', 'https://danbooru.donmai.us:8443/posts/1']) {
    assert.equal(sourceLink({ platform: 'danbooru', source_url }), null)
  }
  assert.equal(sourceLink({ platform: 'unknown', source_url: 'https://danbooru.donmai.us/posts/1' }), null)
})

test('acquisition links support every public host while legacy credits remain bounded', () => {
  assert.equal(sourceLink({ platform: 'pixiv', acquisition: true, source_url: 'https://www.pixiv.net/artworks/1' }), 'https://www.pixiv.net/artworks/1')
  assert.equal(sourceLink({ platform: 'generic', acquisition: true, source_url: 'http://images.example.test/post/1' }), 'http://images.example.test/post/1')
  for (const source_url of ['file:///private', 'javascript:alert(1)', 'https://localhost/post',
    'http://127.0.0.1/post', 'http://0x7f000001/post', 'https://10.0.0.1/post', 'https://[::1]/post',
    'https://internal.local/post', 'https://user:secret@images.example.test/post', 'http://images.example.test:8443/post']) {
    assert.equal(sourceLink({ platform: 'generic', acquisition: true, source_url }), null)
  }
  assert.equal(sourceLink({ platform: 'pixiv', source_url: 'https://www.pixiv.net/artworks/1' }), null)
})

test('URL-based credentials follow the actual source instead of the search preset', () => {
  assert.equal(sourceProvider('', 'danbooru'), 'danbooru')
  assert.equal(sourceProvider('https://www.pixiv.net/artworks/1', 'danbooru'), 'pixiv.net')
  assert.equal(sourceProvider('https://x.com/demo/status/1'), 'twitter')
  assert.equal(sourceProvider('https://youtu.be/synthetic'), 'youtube')
  assert.equal(sourceProvider('https://user:secret@images.example.test/'), '')
  assert.equal(sourceName('pixiv.net'), 'pixiv.net')
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
