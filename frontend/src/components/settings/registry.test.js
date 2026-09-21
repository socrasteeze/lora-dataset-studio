import test from 'node:test';
import assert from 'node:assert/strict';

import { matchesQuery, SETTINGS_SECTIONS } from './registry.js';

test('core shared-service terms find the scraping section', () => {
  const scraping = SETTINGS_SECTIONS.find((section) => section.id === 'scraping');
  for (const query of ['civitai', 'api key', 'source', 'import']) {
    assert.equal(matchesQuery(scraping, query), true, query);
  }
});

test('plugin-owned scraper terms do not leak into core Settings', () => {
  const scraping = SETTINGS_SECTIONS.find((section) => section.id === 'scraping');
  for (const query of ['pexels', 'small image', 'rescue']) {
    assert.equal(matchesQuery(scraping, query), false, query);
  }
});

test('Training section search finds local training defaults', () => {
  const training = SETTINGS_SECTIONS.find((section) => section.id === 'training');
  for (const query of ['default', 'training', 'family', 'zimage']) {
    assert.equal(matchesQuery(training, query), true, query);
  }
  for (const query of ['verified', 'secure cloud', 'community cloud', 'offer filter', 'vast']) {
    assert.equal(matchesQuery(training, query), false, query);
  }
});
