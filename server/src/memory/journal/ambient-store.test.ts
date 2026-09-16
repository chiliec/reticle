import { removeTempDir } from '../../machine/temp-dir.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeFileSystem, type FileSystemPort } from '../project/fs/fs-port.js';
import { AmbientStore } from './ambient-store.js';

describe('AmbientStore', () => {
  let root: string;
  let fs: FileSystemPort;

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'reticle-ambient-'));
    root = join(dir, '.reticle');
    fs = createNodeFileSystem();
  });
  afterEach(async () => {
    await removeTempDir(join(root, '..'));
  });

  it('returns an empty map when nothing is persisted', async () => {
    expect(await new AmbientStore(fs, root).load()).toEqual({});
  });

  it('round-trips the ambient counts', async () => {
    const store = new AmbientStore(fs, root);
    await store.save({ ticker: 42, chat: 100 });
    expect(await store.load()).toEqual({ ticker: 42, chat: 100 });
  });

  it('degrades to empty on a malformed or wrong-version file', async () => {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'ambient.json'), '{ nope', 'utf8');
    expect(await new AmbientStore(fs, root).load()).toEqual({});
    await writeFile(
      join(root, 'ambient.json'),
      JSON.stringify({ version: 9, regions: {} }),
      'utf8',
    );
    expect(await new AmbientStore(fs, root).load()).toEqual({});
  });

  /**
   * The file is the only place the map crosses a session, and a ref does not survive the crossing.
   *
   * MEASURED on bench-app: the persisted map was mostly ref-keyed (`e404: 39`, `e405: 43`), a fresh
   * page seeded from it, and real action-caused DOM events were filtered out of the window before
   * anything could see them — a crawl then reported `state-vs-render` on a control that plainly
   * worked. Deleting the file and repeating the identical click took `domChanged` from 0 to 7.
   */
  it('persists only the keys that mean something in the next session', async () => {
    const store = new AmbientStore(fs, root);
    await store.save({ e404: 39, 'activity-feed': 25, e1: 2 });
    expect(await store.load()).toEqual({ 'activity-feed': 25 });
  });

  // A file written before that rule existed is full of ref keys, and seeding from it is the defect.
  it('ignores ref-keyed entries in a file written by an older build', async () => {
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, 'ambient.json'),
      JSON.stringify({ version: 1, regions: { e404: 39, e405: 43, ticker: 30 } }),
    );
    expect(await new AmbientStore(fs, root).load()).toEqual({ ticker: 30 });
  });
});
