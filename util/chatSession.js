import { createHash } from 'crypto';

// A chat session belongs to the account that opened it. The Python chatbot keeps its state in
// files named after the id it is given, so that id is built from the signed-in user as well as
// the session id the browser sends. Another account sending the same session id gets its own,
// separate conversation instead of the first account's.
//
// The user id is hashed so the key only contains safe file-name characters, whatever the store
// uses for ids (a UUID for the user file, an ObjectId for MongoDB).
export function sessionKey(userId, sessionId) {
  const owner = createHash('sha256').update(String(userId)).digest('hex').slice(0, 16);
  return `${owner}_${sessionId}`;
}
