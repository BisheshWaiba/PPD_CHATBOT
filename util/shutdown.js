// What to do when the host stops the app (a new version is being deployed, the machine restarts):
// stop taking new connections, let the requests in progress finish, close the database, and exit.
// Without this the host cuts the process off, and a person in the middle of saving a chat or
// resetting a password gets an error.
//
// server: the http.Server. closeDatabase: an async function. exit: process.exit (replaced in tests).
export function createShutdown({ server, closeDatabase, log = console.log, exit = process.exit, timeoutMs = 10000 }) {
  let started = false;

  return async function shutdown(signal) {
    if (started) return; // a second signal while this runs changes nothing
    started = true;
    log(`${signal} received: finishing the requests in progress, then shutting down.`);

    // If something never finishes, leave anyway: the host would kill us soon after
    const timer = setTimeout(() => {
      log(`Shutdown is taking longer than ${timeoutMs / 1000} seconds: leaving now.`);
      exit(1);
    }, timeoutMs);
    timer.unref?.();

    try {
      // close() stops new connections and, on Node 19 and later (this app needs 22), also drops the
      // ones that are only waiting for a next request, so they cannot hold the stop up
      await new Promise(resolve => server.close(resolve));
      await closeDatabase();
      clearTimeout(timer);
      log('Shut down cleanly.');
      exit(0);
    } catch (error) {
      clearTimeout(timer);
      log(`Shutdown failed: ${error.message}`);
      exit(1);
    }
  };
}
