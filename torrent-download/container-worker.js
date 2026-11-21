import { DurableObject } from 'cloudflare:workers';
import worker from './worker.js';

export default worker;

export class UdpDiscovery extends DurableObject {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !['/tracker', '/dht'].includes(path)) {
      return new Response('Unknown UDP operation', { status: 404 });
    }
    const port = await this.port();
    return port.fetch(request);
  }

  async port() {
    this.startup ??= this.waitForPort().finally(() => { this.startup = undefined; });
    return this.startup;
  }

  async waitForPort() {
    const container = this.ctx.container;
    if (!container) throw new Error('UDP Container binding is missing');
    if (!container.running) container.start({ enableInternet: true });
    await container.setInactivityTimeout(20000);
    const port = container.getTcpPort(8080);
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const response = await port.fetch('http://udp/health', { signal: AbortSignal.timeout(900) });
        await response.body?.cancel();
        if (response.ok) return port;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 900));
    }
    throw new Error('UDP Container did not become ready');
  }
}
