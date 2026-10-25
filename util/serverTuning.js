// Timeouts for the http server, chosen to suit a proxy in front of it.
//
// Node closes a connection that has been idle for 5 seconds. A load balancer or proxy keeps its
// connections to us open for much longer (often 60 seconds) and reuses them, so now and then it
// sends a request down a connection Node has just closed. The visitor sees a 502 or a reset for
// no reason that can be found afterwards. The advice is to keep ours open longer than the
// proxy's, so the proxy is always the one to close it. headersTimeout has to be longer than
// keepAliveTimeout.
export const KEEP_ALIVE_MS = 65 * 1000;
export const HEADERS_MS = 66 * 1000;

export function tuneServer(server) {
  server.keepAliveTimeout = KEEP_ALIVE_MS;
  server.headersTimeout = HEADERS_MS;
  return server;
}
