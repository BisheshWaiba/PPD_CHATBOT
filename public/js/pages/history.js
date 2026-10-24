import { plainText, formatWhen, countLabel } from '/js/history-format.js';

// The History page: the list of saved chats, and one saved chat at a time (?c=<id>).
// Everything is written with textContent, so nothing a person or the assistant said is ever
// treated as markup.

const $ = id => document.getElementById(id);
const request = (method, path) => window.MOMAuth.apiFetch(path, { method });

const selected = new URLSearchParams(window.location.search).get('c');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A button that asks for a second click before doing something that cannot be undone
function confirmable(button, { idle, armedText, question, status, run }) {
  let timer = null;

  const reset = () => {
    clearTimeout(timer);
    timer = null;
    button.textContent = idle;
    button.classList.remove('is-armed');
  };

  button.addEventListener('blur', () => { if (timer) { reset(); status.textContent = ''; } });
  button.addEventListener('click', async () => {
    if (!timer) {
      button.textContent = armedText;
      button.classList.add('is-armed');
      status.textContent = question;
      timer = setTimeout(() => { reset(); status.textContent = ''; }, 6000);
      return;
    }
    reset();
    button.disabled = true;
    try {
      await run();
    } finally {
      button.disabled = false;
    }
  });
}

// ---------- The list ----------

async function showList(note) {
  $('list-view').hidden = false;
  $('chat-view').hidden = true;
  const status = $('status');
  const list = $('chat-list');
  status.textContent = note || 'Loading your chats…';
  list.textContent = '';
  $('list-actions').hidden = true;
  $('empty-actions').hidden = true;

  let chats;
  try {
    const response = await request('GET', '/api/v1/conversations');
    if (response.status === 401) return; // the shared script is already sending the person to sign in
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    chats = (await response.json()).data;
  } catch (error) {
    status.textContent = '';
    const retry = el('button', 'pill', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', () => showList());
    status.append("We couldn't load your chats. ", retry);
    return;
  }

  if (chats.length === 0) {
    status.textContent = note || 'No saved chats yet. Chats you have while signed in are saved here automatically.';
    $('empty-actions').hidden = false;
    return;
  }

  status.textContent = note || '';
  for (const chat of chats) {
    const link = el('a', 'chat-card');
    link.href = `/history.html?c=${encodeURIComponent(chat.id)}`;
    link.append(
      el('span', 'chat-card-when', formatWhen(chat.updatedAt)),
      el('span', 'chat-card-preview', chat.preview || 'Chat with no messages from you'),
      el('span', 'chat-card-count', countLabel(chat.messageCount))
    );
    const item = el('li');
    item.append(link);
    list.append(item);
  }
  $('list-actions').hidden = false;
}

// ---------- One chat ----------

function renderMessage(message) {
  const row = el('div', `msg msg-${message.role === 'user' ? 'user' : 'bot'}`);

  if (message.role !== 'user') {
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mark.setAttribute('class', 'msg-mark');
    mark.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#mom-mark');
    mark.append(use);
    row.append(mark);
  }

  const body = el('div', 'msg-body');
  const time = el('time', 'msg-time', formatWhen(message.at));
  time.dateTime = message.at;
  body.append(el('p', 'msg-text', plainText(message.text, message.role)), time);
  row.append(body);
  return row;
}

async function showChat(id) {
  $('list-view').hidden = true;
  $('chat-view').hidden = false;
  const status = $('chat-status');
  status.textContent = 'Loading this chat…';

  let chat;
  try {
    const response = await request('GET', `/api/v1/conversations/${encodeURIComponent(id)}`);
    if (response.status === 401) return;
    if (response.status === 404) {
      $('chat-title').textContent = 'Chat not found';
      status.textContent = 'This chat could not be found. It may have been deleted.';
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    chat = (await response.json()).data;
  } catch (error) {
    status.textContent = '';
    const retry = el('button', 'pill', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', () => showChat(id));
    status.append("We couldn't load this chat. ", retry);
    return;
  }

  status.textContent = '';
  $('chat-title').textContent = formatWhen(chat.startedAt);
  $('chat-meta').textContent = `${countLabel(chat.messageCount)}. Last message ${formatWhen(chat.updatedAt)}.`;
  document.title = `Sutkeri — Chat from ${formatWhen(chat.startedAt)}`;

  const transcript = $('transcript');
  transcript.textContent = '';
  chat.messages.forEach(message => transcript.append(renderMessage(message)));
  if (chat.messages.length === 0) status.textContent = 'This chat has no messages.';
  $('chat-actions').hidden = false;

  confirmable($('delete-chat'), {
    idle: 'Delete this chat',
    armedText: 'Click again to delete',
    question: 'Delete this chat? This cannot be undone. Click the button again to confirm.',
    status,
    async run() {
      const response = await request('DELETE', `/api/v1/conversations/${encodeURIComponent(id)}`);
      if (response.ok || response.status === 404) {
        window.history.replaceState(null, '', '/history.html');
        await showList('Chat deleted.');
      } else {
        status.textContent = "We couldn't delete this chat. Please try again.";
      }
    }
  });
}

// ---------- Start ----------

confirmable($('delete-all'), {
  idle: 'Delete all chats',
  armedText: 'Click again to delete all',
  question: 'Delete all of your saved chats? This cannot be undone. Click the button again to confirm.',
  status: $('status'),
  async run() {
    const response = await request('DELETE', '/api/v1/conversations');
    if (response.ok) await showList('All chats deleted.');
    else $('status').textContent = "We couldn't delete your chats. Please try again.";
  }
});

// Without a session there is nothing to ask for: the shared script is already sending the
// person to sign in
if (window.MOMAuth.isAuthenticated()) {
  if (selected) showChat(selected);
  else showList();
}
