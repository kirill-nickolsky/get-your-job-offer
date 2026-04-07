import { Router } from 'express';

const router = Router();

router.get('/miniapp', function(_req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>get-your-offer Mini App</title>
    <style>
      body { font-family: Georgia, serif; margin: 0; background: #f4efe4; color: #1b1b1b; }
      .wrap { max-width: 980px; margin: 0 auto; padding: 24px; }
      .toolbar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
      button { background: #0d3b66; color: #fff; border: 0; border-radius: 8px; padding: 10px 14px; cursor: pointer; }
      input { padding: 10px 12px; border-radius: 8px; border: 1px solid #b4a78b; }
      .grid { display: grid; gap: 16px; }
      .card { background: #fffaf0; border: 1px solid #d5c7aa; border-radius: 14px; padding: 16px; }
      .meta { color: #6b5f4b; margin-bottom: 8px; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      pre { white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>get-your-offer Mini App</h1>
      <div class="toolbar">
        <input id="userId" placeholder="Fake Telegram user id" value="local-user-1" />
        <button id="loginBtn">Start Session</button>
        <button id="statsBtn">Load Today Stats</button>
      </div>
      <div id="stats" class="card" style="display:none;"></div>
      <div id="jobs" class="grid"></div>
    </div>
    <script>
      let sessionToken = '';
      async function api(path, method, body) {
        const response = await fetch(path, {
          method: method || 'GET',
          headers: Object.assign({ 'Content-Type': 'application/json' }, sessionToken ? { 'Authorization': 'Bearer ' + sessionToken } : {}),
          body: body ? JSON.stringify(body) : undefined
        });
        const payload = await response.json();
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || ('HTTP ' + response.status));
        }
        return payload;
      }
      async function startSession() {
        const userId = document.getElementById('userId').value.trim();
        const session = await api('/session/telegram', 'POST', { mode: 'fake', user_id: userId, first_name: 'Local' });
        sessionToken = session.session_token;
        await loadJobs();
      }
      async function loadJobs() {
        const payload = await api('/bot/jobs?min_rate=4&limit=20');
        const jobsRoot = document.getElementById('jobs');
        jobsRoot.innerHTML = '';
        payload.items.forEach(function(job) {
          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = '<div class="meta">Rate ' + job.rate_num + ' / ' + job.status + '</div>' +
            '<h3>' + job.title + '</h3>' +
            '<div>' + job.company + ' / ' + job.location + '</div>' +
            '<pre>' + job.rate_reason + '</pre>' +
            '<div class="actions">' +
            '<button data-action="apply">Applied</button>' +
            '<button data-action="later">Later</button>' +
            '<button data-action="delete">2Delete</button>' +
            '<a href="' + job.apply_url + '" target="_blank"><button>Open</button></a>' +
            '</div>';
          card.querySelectorAll('button[data-action]').forEach(function(button) {
            button.addEventListener('click', async function() {
              await api('/bot/apply-action', 'POST', { job_id: job.job_id, action: button.getAttribute('data-action') });
              await loadJobs();
            });
          });
          jobsRoot.appendChild(card);
        });
      }
      async function loadStats() {
        const payload = await api('/stats/today');
        const root = document.getElementById('stats');
        root.style.display = 'block';
        root.innerHTML = '<pre>' + JSON.stringify(payload.stats, null, 2) + '</pre>';
      }
      document.getElementById('loginBtn').addEventListener('click', startSession);
      document.getElementById('statsBtn').addEventListener('click', loadStats);
    </script>
  </body>
</html>`);
});

export default router;
