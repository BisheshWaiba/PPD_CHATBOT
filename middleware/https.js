import { isProduction } from '../util/paths.js';
import { appUrl } from '../util/mailer.js';

// Sends a visitor who arrived over plain HTTP to the HTTPS address of the site.
//
// Nearly every host ends HTTPS at a proxy in front of this server and says how the visitor came in
// with the X-Forwarded-Proto header. Only when that header says "http" do we redirect. Never by
// guessing from the connection: a server behind a proxy always sees plain HTTP, so guessing would
// redirect every request, for ever. Where the redirect goes comes from APP_URL and never from the
// Host header, so a forged header cannot send anyone to another site.
//
// The health check never gets here: it is answered before this runs (see app.js), so a monitor can
// call it over plain HTTP.
export function redirectToHttps(req, res, next) {
  if (!isProduction()) return next();

  const site = appUrl();
  if (!site || !site.startsWith('https://')) return next();

  const arrivedBy = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (arrivedBy !== 'http') return next();

  // 301 for pages. 308 for anything else, so a POST is not turned into a GET on the way
  const status = req.method === 'GET' || req.method === 'HEAD' ? 301 : 308;
  res.redirect(status, new URL(site).origin + req.originalUrl);
}
