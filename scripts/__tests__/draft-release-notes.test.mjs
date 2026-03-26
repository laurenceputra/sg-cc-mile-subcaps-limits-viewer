import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyCommit,
  groupCommitsBySection,
  parseCliArgs,
  parseCommitHeader,
  renderReleaseNotes,
  summarizeFiles
} from '../draft-release-notes.mjs';

function createCommit(overrides = {}) {
  return {
    sha: 'abcdef1234567890',
    shortSha: 'abcdef1',
    subject: 'chore: default subject',
    body: '',
    files: ['scripts/draft-release-notes.mjs'],
    ...overrides
  };
}

describe('draft release notes helpers', () => {
  it('parses conventional commit headers with scope and breaking marker', () => {
    assert.deepEqual(parseCommitHeader('feat(cli)!: add release note drafter'), {
      type: 'feat',
      scope: 'cli',
      breaking: true,
      description: 'add release note drafter'
    });
  });

  it('classifies conventional commits into release-note sections', () => {
    const classified = classifyCommit(createCommit({ subject: 'docs(readme): explain local drafting' }));
    assert.equal(classified.sectionKey, 'documentation');
    assert.equal(classified.sectionTitle, 'Documentation');
    assert.equal(classified.title, 'explain local drafting');
    assert.deepEqual(classified.metadata, ['readme']);
  });

  it('falls back to other changes for non-conventional subjects', () => {
    const classified = classifyCommit(createCommit({ subject: 'Merge branch main into release-notes' }));
    assert.equal(classified.sectionKey, 'other');
    assert.equal(classified.title, 'Merge branch main into release-notes');
  });

  it('groups sections in a deterministic display order', () => {
    const sections = groupCommitsBySection([
      createCommit({ subject: 'fix: handle empty range', shortSha: '1111111' }),
      createCommit({ subject: 'feat: add release note script', shortSha: '2222222' }),
      createCommit({ subject: 'docs: update readme', shortSha: '3333333' }),
      createCommit({ subject: 'chore: add package script', shortSha: '4444444' })
    ]);

    assert.deepEqual(
      sections.map((section) => ({ title: section.title, count: section.items.length })),
      [
        { title: 'Features', count: 1 },
        { title: 'Fixes', count: 1 },
        { title: 'Documentation', count: 1 },
        { title: 'Maintenance', count: 1 }
      ]
    );
  });

  it('renders an empty range with a helpful message', () => {
    const markdown = renderReleaseNotes({ fromRef: 'v1.0.0', toRef: 'HEAD', commits: [] });
    assert.match(markdown, /Range: `v1\.0\.0\.\.HEAD`/);
    assert.match(markdown, /0 commits across 0 files/);
    assert.match(markdown, /_No commits found in this range\._/);
  });

  it('renders grouped markdown with commit metadata and files', () => {
    const markdown = renderReleaseNotes({
      fromRef: 'origin/main',
      toRef: 'HEAD',
      commits: [
        createCommit({
          subject: 'feat(cli)!: add release note drafter',
          shortSha: '1234567',
          files: ['scripts/draft-release-notes.mjs', 'package.json', 'README.md', 'docs/notes.md']
        }),
        createCommit({
          subject: 'fix: handle empty ranges',
          shortSha: '7654321',
          files: ['scripts/draft-release-notes.mjs']
        }),
        createCommit({
          subject: 'Ship release note drafts to the README',
          shortSha: 'bbbbbbb',
          files: ['README.md']
        })
      ]
    });

    assert.match(markdown, /Summary:\n- 3 commits across 4 files\n- Features: 1\n- Fixes: 1\n- Other Changes: 1/);
    assert.match(markdown, /## Features/);
    assert.match(markdown, /- add release note drafter \(`1234567`\) _cli, breaking_/);
    assert.match(markdown, /Files: `scripts\/draft-release-notes\.mjs`, `package\.json`, `README\.md` \+1 more/);
    assert.match(markdown, /## Other Changes/);
  });

  it('summarizes files without extra suffix when below the limit', () => {
    assert.equal(summarizeFiles(['README.md', 'package.json']), '`README.md`, `package.json`');
  });

  it('requires a from ref when parsing CLI args', () => {
    assert.throws(() => parseCliArgs(['--to', 'HEAD']), /--from is required/);
    assert.deepEqual(parseCliArgs(['--from', 'origin/main']), { from: 'origin/main', to: 'HEAD' });
  });
});
