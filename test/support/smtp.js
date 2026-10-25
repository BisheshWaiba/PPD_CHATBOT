// A small real SMTP server for tests: it speaks enough of the protocol (greeting, EHLO, AUTH PLAIN
// and AUTH LOGIN, MAIL FROM, RCPT TO, DATA, RSET, NOOP, QUIT) for the mailer to log in and deliver
// a message over a real connection, and it keeps what it was given. No encryption, so it is for
// 127.0.0.1 only. Nothing is ever delivered anywhere.
import net from 'net';

export async function startSmtpServer({ user = 'mailer', pass = 'mail-password', requireAuth = true } = {}) {
  const messages = [];
  const attempts = [];

  const server = net.createServer(socket => {
    socket.setEncoding('utf8');
    let buffer = '';
    let mode = 'command'; // command | login-user | login-pass | data
    let loginUser = '';
    let authenticated = !requireAuth;
    let envelope = { from: null, to: [] };
    let data = '';

    const reply = text => socket.write(`${text}\r\n`);
    reply('220 test.local ESMTP ready');

    const checkLogin = (name, password) => {
      attempts.push({ user: name, ok: name === user && password === pass });
      if (name === user && password === pass) { authenticated = true; reply('235 2.7.0 Authentication successful'); }
      else reply('535 5.7.8 Authentication credentials invalid');
    };

    const handleLine = line => {
      if (mode === 'data') {
        if (line === '.') {
          messages.push({ ...envelope, raw: data });
          data = '';
          mode = 'command';
          envelope = { from: null, to: [] };
          return reply('250 2.0.0 Ok: queued');
        }
        data += `${line.startsWith('..') ? line.slice(1) : line}\r\n`;
        return undefined;
      }
      if (mode === 'login-user') { loginUser = Buffer.from(line, 'base64').toString(); mode = 'login-pass'; return reply('334 UGFzc3dvcmQ6'); }
      if (mode === 'login-pass') { mode = 'command'; return checkLogin(loginUser, Buffer.from(line, 'base64').toString()); }

      const [command, ...rest] = line.split(' ');
      switch (command.toUpperCase()) {
        case 'EHLO':
        case 'HELO':
          socket.write('250-test.local\r\n250-8BITMIME\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n');
          return undefined;
        case 'AUTH': {
          const [kind, initial] = rest;
          if (kind.toUpperCase() === 'PLAIN') {
            if (!initial) { reply('334 '); mode = 'command'; return undefined; }
            const [, name, password] = Buffer.from(initial, 'base64').toString().split('\0');
            return checkLogin(name, password);
          }
          if (kind.toUpperCase() === 'LOGIN') { mode = 'login-user'; return reply('334 VXNlcm5hbWU6'); }
          return reply('504 5.5.4 Unrecognized authentication type');
        }
        case 'MAIL':
          if (!authenticated) return reply('530 5.7.0 Authentication required');
          envelope.from = (line.match(/<([^>]*)>/) || [])[1];
          return reply('250 2.1.0 Ok');
        case 'RCPT':
          envelope.to.push((line.match(/<([^>]*)>/) || [])[1]);
          return reply('250 2.1.5 Ok');
        case 'DATA': mode = 'data'; return reply('354 End data with <CR><LF>.<CR><LF>');
        case 'RSET': envelope = { from: null, to: [] }; return reply('250 2.0.0 Ok');
        case 'NOOP': return reply('250 2.0.0 Ok');
        case 'QUIT': reply('221 2.0.0 Bye'); return socket.end();
        default: return reply('502 5.5.2 Command not recognized');
      }
    };

    socket.on('data', chunk => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        handleLine(line);
      }
    });
    socket.on('error', () => {});
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    messages,
    attempts,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); })
  };
}
