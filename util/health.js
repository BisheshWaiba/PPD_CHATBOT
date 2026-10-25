import mongoose from 'mongoose';
import { getUserStore } from './userStore.js';

// Is the app able to do its job right now? Used by GET /healthz, which a host or an uptime monitor
// calls every few seconds. True when there is a user store and, if that is MongoDB, the connection
// is up. It says nothing more than yes or no: no details about the setup leave the server.
export function isReady() {
  const store = getUserStore();
  if (!store) return false;
  if (store.kind === 'mongo' && mongoose.connection.readyState !== 1) return false;
  return true;
}
