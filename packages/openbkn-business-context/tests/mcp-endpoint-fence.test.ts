import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveMcpUrl } from '../src/openbkn-mcp-manager.ts'

test('derives the default MCP route from the platform URL', () => {
  assert.equal(
    resolveMcpUrl({ baseUrl: 'https://platform.example' }),
    'https://platform.example/api/agent-retrieval/v1/mcp/',
  )
})

test('accepts an explicit mcpUrl on the same origin over https', () => {
  assert.equal(
    resolveMcpUrl({ baseUrl: 'https://platform.example', mcpUrl: 'https://platform.example/alt/mcp/' }),
    'https://platform.example/alt/mcp/',
  )
})

test('accepts loopback http only when both endpoints are loopback', () => {
  assert.equal(
    resolveMcpUrl({ baseUrl: 'http://localhost:8081', mcpUrl: 'http://127.0.0.1:8081/mcp/' }),
    'http://127.0.0.1:8081/mcp/',
  )
  assert.throws(
    () => resolveMcpUrl({ baseUrl: 'https://platform.example', mcpUrl: 'http://localhost:9/mcp/' }),
    /must stay on the configured platform|HTTPS/,
  )
})

test('rejects a plaintext non-loopback mcpUrl even on the same host', () => {
  assert.throws(
    () => resolveMcpUrl({ baseUrl: 'https://platform.example', mcpUrl: 'http://platform.example/mcp/' }),
    /HTTPS/,
  )
})

test('rejects a cross-origin mcpUrl regardless of scheme', () => {
  assert.throws(
    () => resolveMcpUrl({ baseUrl: 'https://platform.example', mcpUrl: 'https://evil.example/mcp/' }),
    /must stay on the configured platform/,
  )
})

test('allows plaintext non-loopback only through the explicit insecure switch', () => {
  assert.equal(
    resolveMcpUrl({ baseUrl: 'http://192.168.50.28', mcpUrl: 'http://192.168.50.28/mcp/', allowInsecureTls: true }),
    'http://192.168.50.28/mcp/',
  )
  assert.throws(
    () => resolveMcpUrl({ baseUrl: 'http://192.168.50.28', mcpUrl: 'http://192.168.50.28/mcp/' }),
    /HTTPS/,
  )
})
