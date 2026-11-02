import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assessFrameFreshness,
  classifyObsFrameSource,
  fitAspectViewport,
  makeFrameReceipt,
  mapTargetRoiToSource,
} from './contract.mjs';

const fixtureText = await readFile(new URL('./fixtures.json', import.meta.url), 'utf8');
const fixtures = JSON.parse(fixtureText.replace(/^\uFEFF/, ''));

const expectedDotaSource = fixtures.sourceEligibility.accepted[0].descriptor;
const validFrame = { width: 1920, height: 1080 };

test('only a Dota game-capture source with a game-only scene is eligible', () => {
  for (const fixture of fixtures.sourceEligibility.accepted) {
    assert.deepEqual(classifyObsFrameSource(fixture.descriptor), {
      eligible: true,
      reason: 'game_only',
    }, fixture.id);
  }
});

test('desktop, webcam, unknown, mixed-scene, and non-Dota sources fail closed', () => {
  for (const fixture of fixtures.sourceEligibility.rejected) {
    assert.deepEqual(classifyObsFrameSource(fixture.descriptor), {
      eligible: false,
      reason: fixture.expectedReason,
    }, fixture.id);
  }
});

test('aspect fitting centers the image and preserves source aspect ratio', () => {
  for (const fixture of fixtures.geometry) {
    const viewport = fitAspectViewport(fixture.source, fixture.target);
    assert.ok(viewport, fixture.id);
    assert.deepEqual(
      {
        x: viewport.x,
        y: viewport.y,
        width: viewport.width,
        height: viewport.height,
      },
      fixture.expectedViewport,
      fixture.id,
    );
    assert.ok(
      Math.abs(viewport.width / viewport.height - fixture.source.width / fixture.source.height) < 1e-12,
      `${fixture.id} changed aspect ratio`,
    );
  }
});

test('target ROIs map to the exact source pixels for 1080p and non-16:9 fixtures', () => {
  for (const fixture of fixtures.geometry) {
    assert.deepEqual(
      mapTargetRoiToSource(fixture.targetRoi, fixture.source, fixture.target),
      fixture.expectedSourceRoi,
      fixture.id,
    );
  }
});

test('ROIs touching letterbox or pillarbox bars are rejected', () => {
  const letterboxed = fixtures.geometry.find((fixture) => fixture.id.includes('letterbox'));
  const pillarboxed = fixtures.geometry.find((fixture) => fixture.id.includes('pillarbox'));
  assert.equal(
    mapTargetRoiToSource({ x: 20, y: 100, width: 20, height: 60 }, letterboxed.source, letterboxed.target),
    null,
  );
  assert.equal(
    mapTargetRoiToSource({ x: 0, y: 20, width: 40, height: 40 }, pillarboxed.source, pillarboxed.target),
    null,
  );
});

test('invalid geometry and overflowing ROIs are rejected', () => {
  assert.equal(fitAspectViewport({ width: 0, height: 1080 }, { width: 1920, height: 1080 }), null);
  assert.equal(mapTargetRoiToSource({ x: 1900, y: 0, width: 30, height: 20 }, validFrame, validFrame), null);
});

test('host receipt time drives freshness while an unavailable source timestamp stays absent', () => {
  const receipt = makeFrameReceipt({ receivedAtMonotonicMs: 100, sourceTimestamp: null });
  assert.equal(receipt.sourceTimestamp, null);
  assert.deepEqual(
    assessFrameFreshness({
      source: expectedDotaSource,
      frame: validFrame,
      receipt,
      nowMonotonicMs: 130,
      maxAgeMs: 50,
    }),
    { status: 'ready', reason: null, ageMs: 30 },
  );
});

test('provider timestamps remain separate and never replace receipt-time freshness', () => {
  const receipt = makeFrameReceipt({
    receivedAtMonotonicMs: 100,
    sourceTimestamp: { value: 4, clockDomain: 'synthetic-unmapped-media-clock' },
  });
  assert.deepEqual(receipt.sourceTimestamp, {
    value: 4,
    clockDomain: 'synthetic-unmapped-media-clock',
  });
  assert.deepEqual(
    assessFrameFreshness({
      source: expectedDotaSource,
      frame: validFrame,
      receipt,
      nowMonotonicMs: 130,
      maxAgeMs: 50,
    }),
    { status: 'ready', reason: null, ageMs: 30 },
  );
});

test('lost and stale frames cannot be reported ready', () => {
  const receipt = makeFrameReceipt({ receivedAtMonotonicMs: 100, sourceTimestamp: null });
  assert.deepEqual(
    assessFrameFreshness({
      source: expectedDotaSource,
      frame: null,
      receipt,
      nowMonotonicMs: 110,
      maxAgeMs: 50,
    }),
    { status: 'unavailable', reason: 'frame_lost', ageMs: null },
  );
  assert.deepEqual(
    assessFrameFreshness({
      source: expectedDotaSource,
      frame: validFrame,
      receipt,
      nowMonotonicMs: 151,
      maxAgeMs: 50,
    }),
    { status: 'stale', reason: 'frame_stale', ageMs: 51 },
  );
});

test('unverified sources, missing receipt times, and future receipt times fail closed', () => {
  const receipt = makeFrameReceipt({ receivedAtMonotonicMs: 100, sourceTimestamp: null });
  assert.deepEqual(
    assessFrameFreshness({
      source: fixtures.sourceEligibility.rejected[0].descriptor,
      frame: validFrame,
      receipt,
      nowMonotonicMs: 110,
      maxAgeMs: 50,
    }),
    { status: 'unavailable', reason: 'source_not_eligible', ageMs: null },
  );
  assert.deepEqual(
    assessFrameFreshness({
      source: expectedDotaSource,
      frame: validFrame,
      receipt: null,
      nowMonotonicMs: 110,
      maxAgeMs: 50,
    }),
    { status: 'unavailable', reason: 'receipt_time_missing', ageMs: null },
  );
  assert.deepEqual(
    assessFrameFreshness({
      source: expectedDotaSource,
      frame: validFrame,
      receipt: makeFrameReceipt({ receivedAtMonotonicMs: 120, sourceTimestamp: null }),
      nowMonotonicMs: 110,
      maxAgeMs: 50,
    }),
    { status: 'unavailable', reason: 'receipt_time_from_future', ageMs: null },
  );
});
