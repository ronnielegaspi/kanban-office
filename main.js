/* Kanban Office — Electron main process.
   Runs Claude Code *in itself*: when a request is filed at reception, this spawns the
   `claude` CLI headless in the workspace, streams its events back to the floor (so each
   character lights up as their subagent runs) and into the embedded terminal, and watches
   office-state.json for the plan. */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
try { app.setName('Kanban Office'); app.setAppUserModelId('com.kanbanoffice.app'); } catch (e) {}   // shows as "Kanban Office" (not Electron) in Task Manager / taskbar
const https = require('https'); const os = require('os');
const UPDATE_REPO = 'ronnielegaspi/kanban-office';   // GitHub repo "owner/name" that hosts the Releases
function _httpsJson(url) { return new Promise((res, rej) => { https.get(url, { headers: { 'User-Agent': 'KanbanOffice' } }, r => { if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(_httpsJson(r.headers.location)); let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej); }); }
function _download(url, dest) { return new Promise((res, rej) => { https.get(url, { headers: { 'User-Agent': 'KanbanOffice' } }, r => { if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(_download(r.headers.location, dest)); const f = fs.createWriteStream(dest); r.pipe(f); f.on('finish', () => f.close(() => res(dest))); }).on('error', e => { try { fs.unlinkSync(dest); } catch (_) {} rej(e); }); }); }
function _semverGt(a, b) { const pa = ('' + a).replace(/^v/, '').split('.').map(Number), pb = ('' + b).replace(/^v/, '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return true; if ((pa[i] || 0) < (pb[i] || 0)) return false; } return false; }
const fs = require('fs');
const path = require('path');

// In dev the workspace is the project dir; packaged, it's a writable copy under userData
// (Claude needs CLAUDE.md, .claude/agents, skills, and write access to plan there).
const TEMPLATE_DIR = __dirname;
// packaged: keep the workspace (incl. .claude/agents, agent-memory, office-state.json) right
// next to the app in the install folder for easy access; dev: the project dir.
const WORKSPACE = app.isPackaged ? path.join(path.dirname(process.execPath), 'workspace') : __dirname;
const STATE_FILE = path.join(WORKSPACE, 'office-state.json');

let win = null;
let busy = false;

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (path.basename(src) === 'node_modules' || path.basename(src) === 'dist') return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) copyRecursive(path.join(src, entry), path.join(dest, entry));
  } else {
    fs.copyFileSync(src, dest);
  }
}
function ensureWorkspace() {
  if (!app.isPackaged) return;
  if (fs.existsSync(path.join(WORKSPACE, 'CLAUDE.md'))) return; // already seeded
  fs.mkdirSync(WORKSPACE, { recursive: true });
  for (const item of ['CLAUDE.md', '.claude', 'docs']) {
    const src = path.join(TEMPLATE_DIR, item);
    if (fs.existsSync(src)) copyRecursive(src, path.join(WORKSPACE, item));
  }
  // fresh install must start empty — write a blank plan, never copy the dev demo office-state.json
  try { fs.writeFileSync(path.join(WORKSPACE, 'office-state.json'), JSON.stringify({ project: '', request: { title: 'Waiting for a request…', why: '', priority: 'P1' }, docPath: '', capacityHoursPerDay: 6, tasks: [], days: [], distributor: 'architect' }, null, 2)); } catch (e) {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 1000, backgroundColor: '#10131c',
    title: 'Kanban Office',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'office-floor.html'));
}

/* ---- read + watch the plan ---- */
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return null; }
}
function watchState() {
  let timer = null;
  try {
    fs.watch(WORKSPACE, (evt, file) => {
      if (file !== 'office-state.json') return;
      clearTimeout(timer);
      timer = setTimeout(() => { const s = readState(); if (s && win) win.webContents.send('state-update', s); }, 200);
    });
  } catch (e) { /* fs.watch can throw on some fs; polling fallback below */ }
  let last = '';
  setInterval(() => {
    try {
      const txt = fs.readFileSync(STATE_FILE, 'utf8');
      if (txt !== last) { last = txt; if (win) win.webContents.send('state-update', JSON.parse(txt)); }
    } catch (e) {}
  }, 1500);
}

/* ---- map Claude subagent types to our desk ids ---- */
const AGENT_MAP = {
  client: 'client', scoper: 'scoper', 'game-designer': 'gamedesign', 'unreal-engine': 'unreal',
  simulation: 'simulation', 'task-writer': 'taskwriter', estimator: 'estimator', scheduler: 'scheduler'
};

function send(obj) { if (win) win.webContents.send('claude-event', obj); }
function termW(who, text, cls) { send({ kind: 'term', text, cls, who: who || null }); }
function term(text, cls) { termW(null, text, cls); }

function handleStreamLine(line, who) {
  if (!win) return;
  let ev;
  try { ev = JSON.parse(line); } catch (e) { if (line.length < 600) termW(who, line, 'dim'); return; }
  if (ev.type === 'system' && ev.subtype === 'init') {
    termW(who, '● session started · ' + (ev.model || 'claude') + ' · ' + ((ev.tools || []).length) + ' tools', 'sys'); return;
  }
  if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
    for (const b of ev.message.content) {
      if (b.type === 'text' && b.text && b.text.trim()) {
        b.text.trim().split('\n').forEach(l => { if (l.trim()) termW(who, l.replace(/\s+$/, '').slice(0, 600)); });
      }
      if (b.type === 'tool_use') {
        if (b.name === 'Task' || b.name === 'Agent') {
          const sub = b.input && b.input.subagent_type;
          const id = AGENT_MAP[sub] || (sub || '').toLowerCase();
          if (id) send({ kind: 'agent-start', agent: id });
          termW(who, '➤ delegating to ' + (sub || 'agent'), 'agent');
          if (b.input && b.input.prompt) String(b.input.prompt).split('\n').slice(0, 6).forEach(l => { if (l.trim()) termW(who, '    ' + l.trim().slice(0, 300), 'dim'); });
        } else {
          const inp = b.input || {}; let det = '';
          if (inp.command) det = ' $ ' + String(inp.command);
          else if (inp.file_path) det = ' ' + String(inp.file_path);
          else if (inp.path) det = ' ' + String(inp.path);
          else if (inp.pattern) det = ' /' + String(inp.pattern) + '/';
          else if (inp.description) det = ' — ' + String(inp.description);
          termW(who, '⚙ ' + b.name + det.slice(0, 400), 'tool');
        }
      }
    }
    if (!who) send({ kind: 'architect-busy' });
  }
  if (ev.type === 'user' && ev.message && Array.isArray(ev.message.content)) {
    for (const b of ev.message.content) {
      if (b.type !== 'tool_result') continue;
      let txt = ''; if (typeof b.content === 'string') txt = b.content; else if (Array.isArray(b.content)) txt = b.content.map(x => x && x.text ? x.text : '').join('\n');
      const lines = (txt || '').split('\n').filter(l => l.trim());
      if (lines.length) { lines.slice(0, 14).forEach(l => termW(who, '  ↳ ' + l.trim().slice(0, 300), 'dim')); if (lines.length > 14) termW(who, '  ↳ … (+' + (lines.length - 14) + ' more lines)', 'dim'); }
      else termW(who, '  ↳ (result)', 'dim');
    }
  }
  if (ev.type === 'result') {
    const dur = ev.duration_ms ? (' · ' + Math.round(ev.duration_ms / 1000) + 's') : '';
    termW(who, '■ run complete' + dur, ev.subtype === 'success' ? 'ok' : 'err');
  }
}

/* ---- run Claude Code headless (shared by requests, changes, terminal prompts) ----
   env is inherited, so Claude Code runs on the user's own logged-in account (~/.claude). */
function runClaude(promptText, label, opts) {
  opts = opts || {};
  const who = opts.who || null;                 // null = the Architect (main terminal); else an agent with its own terminal
  let runDone = false;                           // per-run, so agents run concurrently (each its own terminal)
  const finish = (ok) => { if (runDone) return; runDone = true; send({ kind: 'done', ok, who }); };
  send({ kind: 'started', feature: label, who });
  return new Promise((resolve) => {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', '--add-dir', WORKSPACE];
    if (opts.model) args.push('--model', opts.model);
    (opts.dirs || []).forEach(d => { try { if (d && fs.existsSync(d)) args.push('--add-dir', d); } catch (e) {} });
    for (const ref of (readLinks().refs || [])) { if (ref && ref.path) { try { if (fs.existsSync(ref.path)) args.push('--add-dir', ref.path); } catch (e) {} } }
    let child;
    try { child = spawn('claude', args, { cwd: WORKSPACE, env: process.env, shell: true }); }
    catch (err) { termW(who, 'Could not launch Claude Code: ' + err.message, 'err'); finish(false); return resolve({ ok: false, error: err.message }); }
    child.stdin.write(promptText); child.stdin.end();
    let buf = '';
    child.stdout.on('data', (d) => { buf += d.toString(); let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.trim()) handleStreamLine(line.trim(), who); } });
    child.stderr.on('data', (d) => { send({ kind: 'stderr', text: d.toString().slice(0, 600), who }); });
    child.on('error', (err) => { termW(who, 'process error: ' + err.message, 'err'); finish(false); resolve({ ok: false, error: err.message }); });
    child.on('close', (code) => { if (!who) { const s = readState(); if (s && win) win.webContents.send('state-update', s); } if (code !== 0) termW(who, '— process exited (code ' + code + ')', 'err'); finish(code === 0); resolve({ ok: code === 0, code }); });  // only planning runs write office-state.json; agent runs are read-only, don't clobber the board with the stale file
  });
}

ipcMain.handle('file-request', async (_e, payload) => {
  const feature = (payload && payload.feature || '').trim();
  if (!feature) return { ok: false, error: 'Type a feature first.' };
  const priority = (payload && payload.priority) || 'P1';
  const capacity = Number(payload && payload.capacity) || 6;
  let prompt;
  if (payload && payload.mode === 'change') {
    prompt = 'A change was requested to the current plan in office-state.json. As the Architect, apply it and rewrite office-state.json (and the spec doc if affected), keeping the schema in CLAUDE.md exactly and re-validating deps, days, capacity and priorities. Change request: "' + feature + '". Keep narration tight.';
    term('$ change request — ' + feature.slice(0, 70), 'sys');
  } else {
    prompt = 'A new feature request was just filed at reception. As the Architect, run the full /request intake-to-plan pipeline: Client intake, scope, the domain specialists that fit, task cards, estimates, priorities, schedule, then write docs/<feature-slug>.md and an updated office-state.json (match the schema in CLAUDE.md exactly). Feature: "' + feature + '". Requested priority: ' + priority + '. Daily capacity: ' + capacity + ' focused hours per day. Keep narration tight; the deliverables are the spec doc and office-state.json.';
    term('$ claude -p — ' + feature.slice(0, 60) + '  (' + priority + ', ' + capacity + 'h/day)', 'sys');
  }
  if (payload && payload.team) prompt += payload.team;
  return runClaude(prompt, feature, { model: payload && payload.model });
});

ipcMain.handle('run-prompt', async (_e, payload) => {
  const p = (payload && payload.prompt || '').trim();
  if (!p) return { ok: false, error: 'empty prompt' };
  return runClaude(p, p.slice(0, 60), { model: payload && payload.model });
});

ipcMain.handle('get-state', async () => readState());
ipcMain.handle('save-state', async (_e, p) => { try { fs.writeFileSync(STATE_FILE, JSON.stringify((p && p.state) || {}, null, 2)); if (win) win.webContents.send('state-update', (p && p.state) || {}); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });

/* ---- run a single agent on its own model (its own terminal) ---- */
ipcMain.handle('run-agent', async (_e, p) => {
  const id = p && p.agentId; const prompt = (p && p.prompt || '').trim();
  if (!id || !prompt) return { ok: false, error: 'agent + prompt required' };
  const pre = 'You are "' + (p.name || id) + '" (' + (p.role || 'specialist') + ') on a planning team. Stay in that role.' + (p.rules ? '\nYour rules:\n' + p.rules : '');
  return runClaude(pre + '\n\nTask: ' + prompt, (p.name || id) + ': ' + prompt.slice(0, 40), { who: id, model: p.model, dirs: p.dirs || [] });
});
ipcMain.handle('build-agent-md', async (_e, p) => {
  const id = p && p.agentId; if (!id) return { ok: false, error: 'agentId required' };
  const prompt = 'Read the linked reference folders' + ((p.dirs && p.dirs.length) ? ' (' + p.dirs.join(' ; ') + ')' : '') +
    ' and (re)write the agent definition file .claude/agents/' + id + '.md for "' + (p.name || id) + '" (' + (p.role || 'specialist') + '), model ' + (p.model || 'sonnet') +
    '. Keep standard frontmatter (name, description, tools, model) and write a concise role + ruleset body using any conventions found' + (p.rules ? ' and these rules: ' + p.rules : '') + '. Write the file; keep it tight.';
  return runClaude(prompt, 'build .md: ' + id, { who: id, model: p.model, dirs: p.dirs || [] });
});

/* ---- per-agent memory persisted under the workspace ---- */
const MEM_DIR = path.join(WORKSPACE, 'agent-memory');
function memPath(id) { return path.join(MEM_DIR, id.replace(/[^a-z0-9_-]/gi, '_') + '.json'); }
function readMem(id) { try { return JSON.parse(fs.readFileSync(memPath(id), 'utf8')); } catch (e) { return []; } }
ipcMain.handle('get-agent-memory', async (_e, p) => readMem(p && p.agentId));
ipcMain.handle('append-agent-memory', async (_e, p) => {
  const id = p && p.agentId; if (!id) return { ok: false };
  try { fs.mkdirSync(MEM_DIR, { recursive: true }); const arr = readMem(id); arr.push(p.entry || {}); while (arr.length > 200) arr.shift(); fs.writeFileSync(memPath(id), JSON.stringify(arr, null, 2)); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
});

/* ---- agent roster: add / remove / edit + model (writes .claude/agents/*.md) ---- */
const AGENTS_CFG = path.join(WORKSPACE, 'agents-config.json');
const AGENTS_DIR = path.join(WORKSPACE, '.claude', 'agents');
function readAgentsCfg() { try { return JSON.parse(fs.readFileSync(AGENTS_CFG, 'utf8')); } catch (e) { return null; } }
function setFrontmatterModel(mdPath, model) {
  try { let s = fs.readFileSync(mdPath, 'utf8'); if (/^model:\s*.*$/m.test(s)) { s = s.replace(/^model:\s*.*$/m, 'model: ' + model); fs.writeFileSync(mdPath, s); } } catch (e) {}
}
function writeNewAgentMd(a) {
  const p = path.join(AGENTS_DIR, a.id + '.md');
  const tools = (a.tools && String(a.tools).trim()) || 'Read, Grep, Glob'; // read-only by default = safer
  const desc = ((a.description || a.role || a.name || a.id) + '').replace(/\r?\n/g, ' ').slice(0, 300);
  const body = '---\nname: ' + a.id + '\ndescription: ' + desc + '\ntools: ' + tools + '\nmodel: ' + (a.model || 'sonnet') + '\n---\n\n' +
    'You are **' + (a.name || a.id) + '** — ' + (a.role || 'a specialist') + '.\n' +
    (a.description ? ('\n' + a.description + '\n') : '') +
    (a.rules ? ('\n## Rules (follow these exactly)\n' + a.rules + '\n') : '') +
    '\nStay strictly within your role and apply the rules above to everything you produce. Give specific, actionable detail for YOUR specialty (e.g. a designer details features & parameters; an engineer details the technical approach, Blueprints → C++ and how it is built). Return concise analysis and concrete work items to the Manager. Never write files; lead with decisions.\n';
  try { fs.mkdirSync(AGENTS_DIR, { recursive: true }); fs.writeFileSync(p, body); } catch (e) {}
}
ipcMain.handle('get-agents', async () => readAgentsCfg());

/* ---- linked reference folders (rules + project/git), passed to Claude via --add-dir ---- */
const LINKS_CFG = path.join(WORKSPACE, 'links-config.json');
function readLinks() { try { return JSON.parse(fs.readFileSync(LINKS_CFG, 'utf8')); } catch (e) { return { refs: [] }; } }
ipcMain.handle('get-links', async () => readLinks());
ipcMain.handle('save-links', async (_e, p) => { try { fs.writeFileSync(LINKS_CFG, JSON.stringify({ refs: (p && p.refs) || [] }, null, 2)); term('🔗 linked folders updated (' + (((p && p.refs) || []).length) + ')', 'ok'); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('pick-folder', async () => { try { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] }); if (r.canceled || !r.filePaths.length) return { ok: false }; return { ok: true, path: r.filePaths[0] }; } catch (e) { return { ok: false, error: e.message }; } });

/* ---- projects (separate tasks + agents per project) ---- */
const PROJECTS_CFG = path.join(WORKSPACE, 'projects.json');
ipcMain.handle('open-external', async (_e, url) => { try { if (/^https?:\/\//i.test(url || '')) await shell.openExternal(url); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('get-version', () => { try { return app.getVersion(); } catch (e) { return ''; } });
ipcMain.handle('check-update', async () => {
  try {
    if (/^YOUR_GH_USER\//.test(UPDATE_REPO)) return { ok: false, error: 'repo not configured' };
    const rel = await _httpsJson('https://api.github.com/repos/' + UPDATE_REPO + '/releases/latest');
    if (!rel || !rel.tag_name) return { ok: false, error: 'no release' };
    const latest = ('' + rel.tag_name).replace(/^v/, ''); const cur = app.getVersion();
    const want = process.arch === 'x64' ? 'x64' : 'arm64'; const assets = rel.assets || [];
    const asset = assets.find(a => /setup/i.test(a.name) && (want === 'x64' ? /x64/i.test(a.name) : !/x64/i.test(a.name))) || assets.find(a => /setup/i.test(a.name));
    return { ok: true, current: cur, latest, newer: _semverGt(latest, cur), url: asset && asset.browser_download_url, page: rel.html_url, notes: rel.body || '' };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('download-update', async (_e, url) => {
  try { if (!url) return { ok: false, error: 'no url' }; const dest = path.join(os.tmpdir(), 'KanbanOffice-Update.exe'); await _download(url, dest); const ch = spawn(dest, [], { detached: true, stdio: 'ignore' }); ch.unref(); setTimeout(() => { try { app.quit(); } catch (e) {} }, 1500); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('get-projects', async () => { try { return JSON.parse(fs.readFileSync(PROJECTS_CFG, 'utf8')); } catch (e) { return null; } });
ipcMain.handle('save-projects', async (_e, p) => { try { fs.writeFileSync(PROJECTS_CFG, JSON.stringify(p || {}, null, 2)); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('save-agents', async (_e, payload) => {
  const agents = (payload && payload.agents) || [];
  try {
    fs.writeFileSync(AGENTS_CFG, JSON.stringify({ agents }, null, 2));
    // custom agents (created in-app) are fully (re)written from their fields incl. description +
    // ruleset; built-in specialists only get their model updated so their .md isn't clobbered.
    const BUILTIN = { architect: 1, client: 1, scoper: 1, taskwriter: 1, estimator: 1, scheduler: 1, unreal: 1, gamedesign: 1, simulation: 1 };
    agents.forEach(a => { const p = path.join(AGENTS_DIR, a.id + '.md'); const custom = !BUILTIN[a.id]; if (custom) writeNewAgentMd(a); else setFrontmatterModel(p, a.model || 'sonnet'); });
    ((payload && payload.removed) || []).forEach(id => { const p = path.join(AGENTS_DIR, id + '.md'); try { if (fs.existsSync(p)) fs.renameSync(p, p + '.disabled'); } catch (e) {} });
    term('✎ agent roster saved (' + agents.length + ' agents)', 'ok');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

app.whenReady().then(() => {
  ensureWorkspace();
  createWindow();
  watchState();
  // push initial state once the window is ready
  if (win) win.webContents.on('did-finish-load', () => { const s = readState(); if (s) win.webContents.send('state-update', s); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
