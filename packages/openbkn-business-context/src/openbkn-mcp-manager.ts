import type { Context } from '@deepseek-ai/cordis'
import { assertHttpsEndpoint, isLoopbackHost } from './platform-reader.js'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import type { Config } from './config.js'

export const OPENBKN_MCP_TOKEN_REF = 'OPENBKN_MCP_TOKEN'
const REQUIRED_TOOL = 'mcp__openbkn__bkn_start_interaction'

/**
 * Mounts the standard DSH MCP client once the user has stored an OpenBKN
 * token. It resolves the credential immediately before mounting, and passes it
 * only to the in-memory standard MCP client configuration. An explicitly configured client with the same public tool
 * namespace is treated as the deployment-owned instance.
 */
export class OpenBknMcpManager {
  private starting: Promise<void> | undefined
  private fiber: { dispose(): Promise<void> } | undefined

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
    private readonly resolveToken: () => Promise<string | undefined>,
  ) {}

  private reloading: Promise<void> | undefined

  async ensure(): Promise<void> {
    // During a refresh the old fiber's tools may still be registered while the
    // client behind them is being disposed; wait for the remount instead of
    // returning early against a dying client.
    if (this.reloading !== undefined) await this.reloading.catch(() => undefined)
    await this.ensureMounted()
  }

  private async ensureMounted(): Promise<void> {
    if (this.ctx.tools.get(REQUIRED_TOOL) !== undefined) return
    if (this.starting === undefined) {
      this.starting = this.start().finally(() => { this.starting = undefined })
    }
    await this.starting
  }

  /** Reconnect the client after DSH rotates the managed credential. */
  async refresh(): Promise<void> {
    await this.starting
    if (this.reloading !== undefined) return this.reloading
    this.reloading = (async () => {
      const fiber = this.fiber
      this.fiber = undefined
      await fiber?.dispose()
      // ensureMounted, deliberately not ensure(): waiting on our own
      // reloading promise here would deadlock the remount against itself
      await this.ensureMounted()
    })().finally(() => { this.reloading = undefined })
    return this.reloading
  }

  private async start(): Promise<void> {
    // The mount config keeps a literal Authorization header resolved fresh at
    // connection time; the value never enters plugin profile configuration,
    // session state, browser state, or prompts. Token rotation stays at this
    // layer: refreshManagedMcpAtTurnStart re-mounts the client each turn and
    // refresh() re-mounts on demand, so the mounted secret never outlives the
    // credential it was resolved from.
    const token = await this.resolveToken()
    if (token === undefined || token.length === 0) {
      throw new Error('OpenBKN Context Loader MCP requires a configured token.')
    }
    const fiber = await this.ctx.plugin(McpClient, McpClient.Config({
      transport: 'streamable-http',
      serverName: 'openbkn',
      url: resolveMcpUrl(this.config),
      headers: { Authorization: `Bearer ${token}` },
      toolCallTimeoutMs: 20_000,
      failOnStartupError: true,
      reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
    }))
    this.fiber = fiber
    if (this.ctx.tools.get(REQUIRED_TOOL) === undefined) {
      this.fiber = undefined
      await fiber.dispose()
      throw new Error('OpenBKN Context Loader MCP did not publish its managed interaction tools.')
    }
  }
}

/**
 * Resolve the stable Context Loader endpoint from the deployment platform URL.
 * An explicitly configured mcpUrl gets the same scheme fence as the control
 * plane plus an origin fence: the Bearer token mounted on this client may
 * only ever be sent to the configured platform (or an explicitly allowed
 * plaintext loopback), never to an arbitrary host.
 */
export function resolveMcpUrl(config: Pick<Config, 'baseUrl' | 'mcpUrl' | 'allowInsecureTls'>): string {
  const base = new URL(config.baseUrl)
  let url: URL
  if (config.mcpUrl !== undefined && config.mcpUrl.trim().length > 0) {
    try {
      url = new URL(config.mcpUrl)
    } catch {
      throw new Error('OpenBKN mcpUrl is not a valid URL.')
    }
    assertHttpsEndpoint(url, config.allowInsecureTls)
    const sameOrigin = url.origin === base.origin
    const bothLoopback = isLoopbackHost(url.hostname) && isLoopbackHost(base.hostname)
    if (!sameOrigin && !bothLoopback) {
      throw new Error(`OpenBKN mcpUrl must stay on the configured platform (${base.origin}); refusing to send credentials to ${url.origin}.`)
    }
  } else {
    url = new URL('/api/agent-retrieval/v1/mcp/', base)
  }
  return url.toString()
}
