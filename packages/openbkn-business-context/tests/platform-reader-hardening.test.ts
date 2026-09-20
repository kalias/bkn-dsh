import assert from 'node:assert/strict'
import test from 'node:test'

import { OpenBknPlatformReader, PlatformReaderError, type PlatformFetch } from '../src/platform-reader.ts'

const config = {
  baseUrl: 'http://localhost:8081',
  requestTimeoutMs: 1_000,
  maxResultBytes: 1024,
  allowInsecureTls: false,
  resolveToken: async () => 'token',
}

test('caps a header-less streamed body at the byte limit', async () => {
  const huge = 'x'.repeat(9 * 1024 * 1024)
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(huge))
    },
    cancel() { cancelled = true },
  })
  const reader = new OpenBknPlatformReader(config, (async () => new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/plain' }, // no content-length on purpose
  })) as unknown as PlatformFetch)
  await assert.rejects(
    reader.getInteractionOperations('int-1', AbortSignal.timeout(5_000)),
    (error: unknown) => error instanceof PlatformReaderError && error.code === 'OUTPUT_OVERFLOW',
  )
  assert.equal(cancelled, true, 'the oversized stream must be cancelled, not drained')
})

test('does not follow redirects on fixed control-plane routes', async () => {
  const reader = new OpenBknPlatformReader(config, (async () => new Response(null, {
    status: 302,
    headers: { location: 'https://elsewhere.example/' },
  })) as unknown as PlatformFetch)
  await assert.rejects(
    reader.listKnowledgeNetworks(AbortSignal.timeout(1_000)),
    (error: unknown) => error instanceof PlatformReaderError && error.code === 'PLATFORM_UNAVAILABLE',
  )
})

test('rejects a malformed businessDomain before it reaches undici', async () => {
  const reader = new OpenBknPlatformReader({ ...config, businessDomain: 'bad domain\nvalue' }, (async () => {
    throw new Error('fetcher must not be called')
  }) as unknown as PlatformFetch)
  await assert.rejects(
    reader.listKnowledgeNetworks(AbortSignal.timeout(1_000)),
    (error: unknown) => error instanceof PlatformReaderError,
  )
})
