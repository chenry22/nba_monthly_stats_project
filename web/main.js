const API = 'http://127.0.0.1:5000/api';
let allPlayers = [];
let activePlayerId = null;
let chartInstances = {};

var months = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


// ── Utilities ────────────────────────────────────────────────────────────────

async function apiFetch(path) {
  try {
    const r = await fetch(API + path);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    return { error: e.message };
  }
}

function loading() {
  return `<div class="loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
}

function errBanner(msg) {
  return `<div class="err-banner">⚠ ${msg}<br><small>Make sure Flask is running: <code>python app.py</code></small></div>`;
}

function avg(arr, key) {
  const vals = arr.map(r => r[key]).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function fmt(v, dec = 1) {
  return v != null ? (+v).toFixed(dec) : '—';
}

function pct(v, dec = 1) {
  return v != null ? (v * 100).toFixed(dec) + '%' : '—';
}

// ── Players sidebar ──────────────────────────────────────────────────────────

async function loadPlayers() {
  const data = await apiFetch('/players');
  if (data.error) {
    document.getElementById('player-list').innerHTML = errBanner(data.error);
    return;
  }
  allPlayers = data;
  renderPlayerList(allPlayers);

  document.getElementById('search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderPlayerList(allPlayers.filter(p => p.full_name.toLowerCase().includes(q)));
  });
}

function renderPlayerList(players) {
  const el = document.getElementById('player-list');
  if (!players.length) {
    el.innerHTML = '<div class="empty">No players found.</div>';
    return;
  }
  el.innerHTML = players.map(p => `
    <div class="player-item ${p.player_id === activePlayerId ? 'active' : ''}"
         onclick="selectPlayer(${p.player_id}, '${p.full_name.replace(/'/g, "\\'")}')">
      <div class="pname">${p.full_name}</div>
      <div class="pmeta">${p.position || '—'} · ${p.team_name || '—'}</div>
    </div>`).join('');
}

// ── Select player ────────────────────────────────────────────────────────────

async function selectPlayer(id, name) {
  activePlayerId = id;
  renderPlayerList(allPlayers);

  ['overview', 'charts', 'split'].forEach(t => {
    document.getElementById(`tab-${t}`).innerHTML = loading();
  });


  const [career, summary] = await Promise.all([
    apiFetch(`/player/${id}/career`),
    apiFetch(`/player/${id}/summary`),
  ]);

  if (career.error) {
    ['overview', 'charts', 'split'].forEach(t => {
      document.getElementById(`tab-${t}`).innerHTML = errBanner(career.error);
    });
    return;
  }

  renderOverview(name, career, summary);
  renderCharts(career);
  renderSplit(summary);
}

// ── Overview ─────────────────────────────────────────────────────────────────

function renderOverview(name, career, summary) {
  const totalGames = career.reduce((s, r) => s + (r.games_played || 0), 0);
  const ca = {
    pts:    avg(career, 'pts_pg'),
    ast:    avg(career, 'ast_pg'),
    reb:    avg(career, 'reb_pg'),
    stl:    avg(career, 'stl_pg'),
    blk:    avg(career, 'blk_pg'),
    tov:    avg(career, 'tov_pg'),
    min:    avg(career, 'min_pg'),
    fga:    avg(career, 'fga_pg'),
    fg3a:    avg(career, 'fg3a_pg'),
    fta:    avg(career, 'fta_pg'),
    fg_pct:    avg(career, 'fg_pct'),
    fg3_pct:    avg(career, 'fg3_pct'),
    ft_pct:    avg(career, 'ft_pct'),

    ts:     avg(career, 'ts_pct'),
    efg:    avg(career, 'efg_pct'),
    atr:    avg(career, 'ast_to_ratio'),
    usg:    avg(career, 'usage_pct'),
    scorer: career[career.length - 1]['scorer_score'],
    play:   career[career.length - 1]['playmaker_score'],
    def:    career[career.length - 1]['defender_score'],
  };

  document.getElementById('tab-overview').innerHTML = `
    <div style='display: flex; gap: 20px; align-items: end;'>
      <img style='border-radius: 20%; height: 6rem;' src='https://cdn.nba.com/headshots/nba/latest/1040x760/${activePlayerId}.png'/>
      <div>
        <div style="font-family:'Syne',sans-serif;font-size:1.35rem;font-weight:800;letter-spacing:-0.02em">${name}</div>
        <div style="font-size:0.68rem;color:var(--muted);margin-top:4px">${career.length} months · ${totalGames} games tracked</div>
      </div>
    </div>

    <div>
      <div class="section-title" style="margin-bottom:0.75rem">Basic stats</div>
      <div class="cards" style="margin-bottom: 0.5rem">
        <div class="card" style="--c:var(--pts)"><div class="label">PTS/G</div><div class="value">${fmt(ca.pts)}</div><div class="sub">career avg</div></div>
        <div class="card" style="--c:var(--ast)"><div class="label">AST/G</div><div class="value">${fmt(ca.ast)}</div><div class="sub">career avg</div></div>
        <div class="card" style="--c:var(--reb)"><div class="label">REB/G</div><div class="value">${fmt(ca.reb)}</div><div class="sub">career avg</div></div>
      </div>
      <div class="cards">
        <div class="card" style="--c:var(--muted)"><div class="label">MIN/G</div><div class="value">${fmt(ca.min)}</div><div class="sub">career avg</div></div>
        <div class="card" style="--c:var(--stl)"><div class="label">STL/G</div><div class="value">${fmt(ca.stl)}</div><div class="sub">career avg</div></div>
        <div class="card" style="--c:var(--blk)"><div class="label">BLK/G</div><div class="value">${fmt(ca.blk)}</div><div class="sub">career avg</div></div>
        <div class="card" style="--c:var(--tov)"><div class="label">TOV/G</div><div class="value">${fmt(ca.tov)}</div><div class="sub">career avg</div></div>
      </div>
    </div>

    <div>
      <div class="section-title" style="margin-bottom:0.75rem">Efficiency & Shot Diet</div>
      <div class="cards">
        <div class="card" style="--c:var(--pts)"><div class="label">FGA/G</div><div class="value">${fmt(ca.fga)}</div><div class="sub">career avg</div></div>
        <div class="card" style="--c:var(--ast)"><div class="label">FG%</div><div class="value">${pct(ca.fg_pct)}</div><div class="sub">career avg</div></div>
        <div class="card" style="--c:var(--reb)"><div class="label">3PA/G</div><div class="value">${fmt(ca.fg3a)}</div><div class="sub">career avg</div></div>
        <div class="card" style="--c:var(--play)"><div class="label">3P%</div><div class="value">${pct(ca.fg3_pct)}</div><div class="sub">career avg</div></div>
        <div class="card" style="--c:var(--ts)"><div class="label">FTA/G</div><div class="value">${fmt(ca.fta)}</div><div class="sub">career avg</div></div>
        <div class="card" style="--c:var(--efg)"><div class="label">FT%</div><div class="value">${pct(ca.ft_pct)}</div><div class="sub">career avg</div></div>
      </div>
    </div>

    <div>
      <div class="section-title" style="margin-bottom:0.75rem">Advanced stats</div>
      <div class="cards">
        <div class="card" style="--c:var(--ts)"><div class="label">TS%</div><div class="value">${pct(ca.ts)}</div><div class="sub">true shooting</div></div>
        <div class="card" style="--c:var(--efg)"><div class="label">eFG%</div><div class="value">${pct(ca.efg)}</div><div class="sub">eff. field goal</div></div>
        <div class="card" style="--c:var(--play)"><div class="label">AST/TOV</div><div class="value">${fmt(ca.atr)}</div><div class="sub">ratio</div></div>
        <div class="card" style="--c:var(--accent)"><div class="label">USG%</div><div class="value">${pct(ca.usg)}</div><div class="sub">usage estimate</div></div>
      </div>
    </div>

    <div>
      <div class="section-title" style="margin-bottom:0.75rem">Most recent role scores (relative to peak)</div>
      <div class="role-bars">
        ${roleBar('Scorer',    ca.scorer, 'var(--scorer)')}
        ${roleBar('Playmaker', ca.play,   'var(--play)')}
        ${roleBar('Defender',  ca.def,    'var(--def)')}
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    document.querySelectorAll('.bar-fill').forEach(b => {
      b.style.width = b.dataset.w + '%';
    });
  });
}

function roleBar(label, val, color) {
  const w = val != null ? (+val).toFixed(1) : 0;
  return `
    <div class="role-row">
      <div class="role-label">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="--c:${color}" data-w="${w}"></div></div>
      <div class="role-val">${w}</div>
    </div>`;
}

// ── Charts ───────────────────────────────────────────────────────────────────

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function buildLineChart(id, labels, datasets) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  chartInstances[id] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color: '#6b6f7e',
            font: { family: "'DM Mono', monospace", size: 10 },
            boxWidth: 10,
            padding: 14,
          },
        },
        tooltip: {
          backgroundColor: '#1c1f27',
          borderColor: '#2a2d38',
          borderWidth: 1,
          titleColor: '#e8e9ed',
          bodyColor: '#6b6f7e',
          titleFont: { family: "'DM Mono', monospace", size: 10 },
          bodyFont:  { family: "'DM Mono', monospace", size: 10 },
        },
      },
      scales: {
        x: {
          grid: { color: '#1c1f27' },
          ticks: {
            color: '#6b6f7e',
            font: { family: "'DM Mono', monospace", size: 9 },
            maxTicksLimit: 14,
            maxRotation: 45,
          },
        },
        y: {
          grid: { color: '#1c1f27' },
          ticks: {
            color: '#6b6f7e',
            font: { family: "'DM Mono', monospace", size: 9 },
          },
        },
      },
      elements: {
        point: { radius: 0, hoverRadius: 4 },
        line:  { tension: 0.35, borderWidth: 1.8 },
      },
    },
  });
}

function ds(label, data, color, fill = false) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: fill ? color + '18' : 'transparent',
    fill,
  };
}

function renderCharts(career) {
  const labels = career.map(r => `${months[r.month - 1]} ${r.season}`);

  document.getElementById('tab-charts').innerHTML = `
    <div class="chart-col">

      <div class="chart-box">
        <div class="section-title">Scoring</div>
        <canvas id="ch-scoring" style="height:220px"></canvas>
      </div>

      <div class="chart-box">
        <div class="section-title">Shooting efficiency</div>
        <canvas id="ch-efficiency" style="height:220px"></canvas>
      </div>

      <div class="chart-box">
        <div class="section-title">Playmaking</div>
        <canvas id="ch-playmaking" style="height:220px"></canvas>
      </div>

      <div class="chart-box">
        <div class="section-title">Rebounding &amp; defense</div>
        <canvas id="ch-defense" style="height:220px"></canvas>
      </div>

      <div class="chart-box">
        <div class="section-title">Usage</div>
        <canvas id="ch-advanced" style="height:220px"></canvas>
      </div>

      <div class="chart-box">
        <div class="section-title">Role peaks</div>
        <canvas id="ch-roles" style="height:220px"></canvas>
      </div>

      <div class="chart-box">
        <div class="section-title">Role value</div>
        <canvas id="ch-role-value" style="height:220px"></canvas>
      </div>
    </div>
  `;

  buildLineChart('ch-scoring', labels, [
    ds('PTS/G', career.map(r => r.pts_pg.toFixed(2)), '#c084fc', true),
    ds('FGA/G', career.map(r => r.fga_pg.toFixed(1)), '#a855f7'),
    ds('3PA/G', career.map(r => r.fg3a_pg.toFixed(1)), '#7c3aed'),
    ds('FTA/G', career.map(r => r.fta_pg.toFixed(1)), 'rgb(226, 121, 219)'),
  ]);

  buildLineChart('ch-efficiency', labels, [
    ds('TS%',  career.map(r => r.ts_pct  != null ? +(r.ts_pct  * 100).toFixed(2) : null), '#f5a623', true),
    ds('FG%', career.map(r => (r.fg_pct * 100).toFixed(2)), '#80d5ff'),
    ds('FT%',  career.map(r => (r.fg3_pct * 100).toFixed(2)), '#ffb77c'),
    ds('3P%',  career.map(r => (r.ft_pct * 100).toFixed(2)), '#5dec8d'),
  ]);

  buildLineChart('ch-playmaking', labels, [
    ds('AST/G',    career.map(r => r.ast_pg.toFixed(2)),       '#4a9eff', true),
    ds('TOV/G',    career.map(r => r.tov_pg.toFixed(2)),       '#f87171'),
  ]);

  buildLineChart('ch-defense', labels, [
    ds('REB/G', career.map(r => r.reb_pg.toFixed(2)), '#a23edc', true),
    ds('STL/G', career.map(r => r.stl_pg.toFixed(2)), '#da0d81'),
    ds('BLK/G', career.map(r => r.blk_pg.toFixed(2)), '#fb7c3c'),
  ]);

  buildLineChart('ch-advanced', labels, [
    ds('USG% x 100', career.map(r => r.usage_pct != null ? +(r.usage_pct * 100).toFixed(2) : null), '#f5a623'),
    ds('MIN/G',     career.map(r => r.min_pg),   '#5c7efa'),
  ]);

  buildLineChart('ch-roles', labels, [
    ds('Scorer',    career.map(r => r.scorer_score),    '#1e6cda', true),
    ds('Playmaker', career.map(r => r.playmaker_score), '#fcff4a'),
    ds('Defender',  career.map(r => r.defender_score),  '#d63d3d'),
  ]);

  buildLineChart('ch-role-value', labels, [
    ds('Scorer',    career.map(r => r.scorer_raw),    '#1e6cda', true),
    ds('Playmaker', career.map(r => r.playmaker_raw * 6), '#fcff4a'),
    ds('Defender',  career.map(r => r.defender_raw * 16),  '#d63d3d'),
  ]);
}

// ── Career split ─────────────────────────────────────────────────────────────

function renderSplit(summary) {
  if (!summary || summary.error) {
    document.getElementById('tab-split').innerHTML = errBanner(summary?.error || 'No data');
    return;
  }
  const { early, late } = summary;

  function row(label, key, fmtFn) {
    const ev = early[key], lv = late[key];
    const diff = (ev != null && lv != null) ? (lv - ev) : null;
    const cls  = diff == null ? 'neutral' : diff > 0.05 ? 'pos' : diff < -0.05 ? 'neg' : 'neutral';
    const sign = diff == null ? '—' : (diff >= 0 ? '+' : '') + (fmtFn ? fmtFn(diff) : diff.toFixed(1));
    return `<tr>
      <td>${label}</td>
      <td>${fmtFn ? fmtFn(ev) : fmt(ev)}</td>
      <td>${fmtFn ? fmtFn(lv) : fmt(lv)}</td>
      <td class="${cls}">${sign}</td>
    </tr>`;
  }

  function cat(label) {
    return `<tr><td colspan="4" class="cat">${label}</td></tr>`;
  }

  document.getElementById('tab-split').innerHTML = `
    <div style="font-size:0.68rem;color:var(--muted)">
      Compares first half vs second half of all career months on record. Δ highlights meaningful shifts.
    </div>
    <div class="split-table">
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Early career</th>
            <th>Late career</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          ${cat('Counting stats')}
          ${row('PTS/G',   'pts_pg')}
          ${row('AST/G',   'ast_pg')}
          ${row('REB/G',   'reb_pg')}
          ${row('STL/G',   'stl_pg')}
          ${row('BLK/G',   'blk_pg')}
          ${row('TOV/G',   'tov_pg')}
          ${row('MIN/G',   'min_pg')}
          ${cat('Advanced stats')}
          ${row('TS%',     'ts_pct',   v => v != null ? (v*100).toFixed(1)+'%' : '—')}
          ${row('eFG%',    'efg_pct',  v => v != null ? (v*100).toFixed(1)+'%' : '—')}
          ${row('AST/TOV', 'ast_to_ratio')}
          ${row('USG%',    'usage_pct', v => v != null ? (v*100).toFixed(1)+'%' : '—')}
          ${cat('Role scores')}
          ${row('Scorer',    'scorer_raw')}
          ${row('Playmaker', 'playmaker_raw')}
          ${row('Defender',  'defender_raw')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

let activeRole = 'scorer';
let leaderboardMinGames = 0;

document.getElementById('min-games').addEventListener('change', (e) => {
  leaderboardMinGames = parseInt(e.target.value) ?? 0;
  loadLeaderboard(activeRole);
});

async function loadLeaderboard(role) {
  activeRole = role;
  document.getElementById('lb-content').innerHTML = loading();

  const data = await apiFetch(`/leaderboard?role=${role}&min_games=${leaderboardMinGames}`);
  if (data.error) {
    document.getElementById('lb-content').innerHTML = errBanner(data.error);
    return;
  }

  if (!data.length) {
    document.getElementById('lb-content').innerHTML =
      '<div class="empty">No results — run the pipeline with more players first.</div>';
    return;
  }

  const statMap = {
    scorer:    [
      { col: 'pts_pg',  label: 'PTS/G' }, { col: 'ts_pct',  label: 'TS%', pct: true }, { col: 'usage_pct',  label: 'USG%', pct: true }
    ],
    playmaker: [
      { col: 'ast_pg',  label: 'AST/G' }, { col: 'ast_to_ratio',  label: 'AST/TOV' }, { col: 'tov_pg',  label: 'TOV/G' }
    ],
    defender:  [
      { col: 'blk_pg',  label: 'BLK/G' }, { col: 'stl_pg',  label: 'STL/G' }, { col: 'reb_pg',  label: 'REB/G' }
    ],
  };
  const cols = statMap[role];

  document.getElementById('lb-content').innerHTML = `
    <div class="lb-header">
      <span>#</span>
      <span>Player</span>
      <span>Period</span>
      <span>${cols[0].label}</span>
      <span>${cols[1].label}</span>
      <span>${cols[2].label}</span>
      <span>Score ▾</span>
    </div>
    <div class="lb-list">
      ${data.map((r, i) => `
        <div class="lb-row" style="animation-delay:${i * 25}ms">
          <div class="lb-rank">${i + 1}</div>
          <div>
            <div class="lb-player">${r.full_name}</div>
            <div class="lb-period">${r.games_played} games played</div>
          </div>
          <div class="lb-period">${r.season} ${months[r.month - 1]}</div>
          <div class="lb-stat">${cols[0].pct ? pct(r[cols[0].col]) : fmt(r[cols[0].col])}</div>
          <div class="lb-stat">${cols[1].pct ? pct(r[cols[1].col]) : fmt(r[cols[1].col])}</div>
          <div class="lb-stat">${cols[2].pct ? pct(r[cols[2].col]) : fmt(r[cols[2].col])}</div>
          <div class="lb-score">${r.raw_score?.toFixed(2) ?? '—'}</div>
        </div>`).join('')}
    </div>
  `;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${target}`);
    });
    if (target === 'leaderboard') loadLeaderboard(activeRole);
  });
});

document.querySelectorAll('.lb-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lb-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadLeaderboard(btn.dataset.role);
  });
});

// ── Init ─────────────────────────────────────────────────────────────────────
loadPlayers();