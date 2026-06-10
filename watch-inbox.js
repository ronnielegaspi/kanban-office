#!/usr/bin/env node
/* Inbox watcher — blocks until a pending request appears in request-inbox.json, then
   prints it and exits so the Architect (Claude) is notified and can run the pipeline. */
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, 'request-inbox.json');

function check() {
  let d = { queue: [] };
  try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  const pending = (d.queue || []).find(i => i.status === 'pending');
  if (pending) {
    console.log('PENDING_REQUEST ' + JSON.stringify(pending));
    process.exit(0);
  }
  setTimeout(check, 2000);
}
console.log('Architect is watching request-inbox.json…');
check();
