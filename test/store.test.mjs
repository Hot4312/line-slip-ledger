import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

test('LINE signature formula uses HMAC-SHA256 base64', () => {
  const raw = Buffer.from('{"events":[]}');
  const signature = createHmac('sha256', 'secret').update(raw).digest('base64');
  assert.equal(signature, 'pkK1lVPJPiJ+wPLziRD79xIxohl8AImYM8AEeM7IbzQ=');
});
