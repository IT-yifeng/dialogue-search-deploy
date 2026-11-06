import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalDriver } from '../src/storage/localDriver.js';

function withDriver(fn: (driver: LocalDriver, root: string, scratch: string) => Promise<void>): Promise<void> {
  const scratch = mkdtempSync(path.join(tmpdir(), 'local-driver-'));
  const root = path.join(scratch, 'mp4');
  return fn(new LocalDriver(root), root, scratch).finally(() => rmSync(scratch, { recursive: true, force: true }));
}

test('put 之后 exists 为 true，内容一致', () =>
  withDriver(async (driver, root, scratch) => {
    const src = path.join(scratch, 'src.bin');
    writeFileSync(src, 'hello');
    assert.equal(await driver.exists('tbbt/S01E01.mp4'), false);
    await driver.put('tbbt/S01E01.mp4', src, 'video/mp4');
    assert.equal(await driver.exists('tbbt/S01E01.mp4'), true);
    // key 的目录前缀被去掉，文件直接落在根目录
    assert.equal(readFileSync(path.join(root, 'S01E01.mp4'), 'utf8'), 'hello');
  }));

test('getPlayUrl：返回 /media/<key>，并对特殊字符编码', () =>
  withDriver(async (driver) => {
    assert.equal(await driver.getPlayUrl('tbbt/S01E01.mp4', 3600), '/media/tbbt/S01E01.mp4');
    assert.equal(await driver.getPlayUrl('tbbt/a b.mp4', 3600), '/media/tbbt/a%20b.mp4');
  }));

test('路径穿越：含 .. 、绝对路径、反斜杠的 key 被拒绝', () =>
  withDriver(async (driver, _root, scratch) => {
    const src = path.join(scratch, 'src.bin');
    writeFileSync(src, 'x');
    for (const bad of ['../secret.mp4', 'tbbt/../../secret.mp4', '/etc/passwd', 'a\\b.mp4', '', 'tbbt/']) {
      await assert.rejects(() => driver.exists(bad), /非法的存储 key/, `exists(${bad})`);
      await assert.rejects(() => driver.put(bad, src, 'video/mp4'), /非法的存储 key/, `put(${bad})`);
      await assert.rejects(() => driver.getPlayUrl(bad, 60), /非法的存储 key/, `getPlayUrl(${bad})`);
    }
  }));
