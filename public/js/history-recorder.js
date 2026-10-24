// Saves the chat to the signed-in account in the background, so it can be looked at later
// from the History page. Saving never gets in the way of chatting: it runs on its own, nothing
// waits for it, and a failure just means the messages are tried again together with the next ones.
//
// `api(method, path, body)` is whatever sends a request and returns a fetch Response.

const MAX_TEXT = 4000;    // what the server accepts for one message
const BATCH = 20;         // and for one request
const MAX_PENDING = 200;  // how many unsaved messages to hold on to while saving keeps failing

export function createRecorder(api) {
  let chatId = null;
  // Waiting to be saved: { role, text }, or { startNew: true } where a new chat begins
  let queue = [];
  let running = null;
  let again = false;
  let stopped = false;

  async function create() {
    const response = await api('POST', '/api/v1/conversations');
    if (response.status === 401) { stopped = true; throw new Error('signed out'); }
    if (!response.ok) throw new Error(`could not start a saved chat (${response.status})`);
    return (await response.json()).data.id;
  }

  // 'ok', or 'again' when the chat is full or gone and the rest belongs in a new one
  async function append(id, messages) {
    const response = await api('POST', `/api/v1/conversations/${id}/messages`, { messages });
    if (response.status === 401) { stopped = true; throw new Error('signed out'); }
    if (response.status === 409 || response.status === 404) return 'again';
    if (!response.ok) throw new Error(`could not save messages (${response.status})`);
    return 'ok';
  }

  async function drain() {
    while (queue.length && !stopped) {
      const marker = queue.findIndex(item => item.startNew);
      const closed = marker !== -1;
      const segment = closed ? queue.slice(0, marker) : queue;

      if (segment.length === 0) { // a new chat begins here
        queue.shift();
        chatId = null;
        continue;
      }
      if (!chatId && !segment.some(item => item.role === 'user')) {
        // No chat yet and nothing said, so there is nothing to keep. Wait for the person to speak,
        // or drop it if they started over without saying anything. (Once a chat exists, anything
        // that is shown in it is saved, including the assistant's reply on its own.)
        if (!closed) return;
        queue.splice(0, segment.length);
        continue;
      }

      if (!chatId) chatId = await create();
      const batch = segment.slice(0, BATCH);
      if ((await append(chatId, batch)) === 'again') {
        chatId = null; // the next round starts a new chat for the same messages
        continue;
      }
      queue.splice(0, batch.length);
    }
  }

  function schedule() {
    if (running) {
      again = true;
      return running;
    }
    running = drain()
      .catch(() => { /* kept in the queue and tried again with the next message */ })
      .finally(() => {
        running = null;
        if (again) { again = false; schedule(); }
      });
    return running;
  }

  return {
    // One message that was shown in the chat. role is 'user' or 'bot'.
    record(role, text) {
      const clean = String(text ?? '').trim().slice(0, MAX_TEXT);
      if (!clean || stopped) return;
      queue.push({ role, text: clean });
      if (queue.length > MAX_PENDING) queue = queue.slice(-MAX_PENDING);
      schedule();
    },

    // The person started over: what follows is a new saved chat
    startNew() {
      if (stopped) return;
      queue.push({ startNew: true });
      schedule();
    },

    // Resolves when everything that can be saved has been tried, including anything that was
    // queued while saving was under way (used by tests)
    async idle() {
      while (running) await running;
    },

    pending() {
      return queue.filter(item => !item.startNew).length;
    }
  };
}
