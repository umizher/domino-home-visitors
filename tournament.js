(() => {
  'use strict';

  const TKEY = 'domino_tourn_v2';
  const $ = id => document.getElementById(id);
  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  // ── State ──────────────────────────────────────────────────────────────
  const ts = {
    type: null,          // 'individual' | 'pairs'
    participants: [],
    rounds: [],
    numRounds: 4,
    status: 'idle'       // 'idle' | 'setup' | 'active' | 'finished'
  };

  // ── Persistence ────────────────────────────────────────────────────────
  function tSave() { localStorage.setItem(TKEY, JSON.stringify(ts)); }

  function tLoad() {
    try {
      const raw = localStorage.getItem(TKEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && typeof s.status === 'string' && Array.isArray(s.participants) && Array.isArray(s.rounds)) {
        Object.assign(ts, s);
      }
    } catch { localStorage.removeItem(TKEY); }
  }

  // ── Utilities ──────────────────────────────────────────────────────────
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fp(id) { return ts.participants.find(p => p.id === id); }
  const sideNames = ids => ids.map(id => { const p = fp(id); return p ? p.name : '?'; }).join(' + ');

  function newParticipant() {
    return {
      id: uid(), name: '', pts: 0, buchholz: 0,
      wins: 0, draws: 0, losses: 0,
      opponents: [], partners: [], byeCount: 0
    };
  }

  // Encounter checks (constraints of the Swiss pairing)
  const metAsOpp     = (a, b) => a.opponents.includes(b.id);
  const metAsPartner = (a, b) => a.partners.includes(b.id);
  const metAnyhow    = (a, b) => metAsOpp(a, b) || metAsPartner(a, b);

  // ── Algorithm: Buchholz ───────────────────────────────────────────────
  function computeBuchholz() {
    for (const p of ts.participants) {
      p.buchholz = p.opponents
        .reduce((s, oid) => { const o = fp(oid); return s + (o ? o.pts : 0); }, 0);
    }
  }

  const played = p => p.wins + p.draws + p.losses;
  const groupSize = () => ts.type === 'individual' ? 4 : 2;

  // Participants short of numRounds games, counting an unplayed seat in the
  // current round as a scheduled game.
  function deficits() {
    const cur = ts.rounds[ts.rounds.length - 1];
    return ts.participants.filter(p => {
      const pending = cur && cur.matches.some(m =>
        m.result === null && (m.s1.includes(p.id) || m.s2.includes(p.id))) ? 1 : 0;
      return played(p) + pending < ts.numRounds;
    });
  }

  // ── Algorithm: Sort ───────────────────────────────────────────────────
  function sortedStandings() {
    return [...ts.participants].sort((a, b) =>
      b.pts - a.pts || b.buchholz - a.buchholz || a.name.localeCompare(b.name)
    );
  }

  // ── Algorithm: pairs mode — 1 pair-unit vs 1 pair-unit (backtracking) ──
  // Phase A: exhaustive search for a globally clean matching (no repeats),
  // bounded by a node budget. Phase B: clean-first with least-conflicting
  // fallback per slot, guaranteed to terminate.
  function pairUnits(rem) {
    const pairs = [];
    const used = new Set();
    let budget = 0;

    function bt(idx, allowRep) {
      if (!allowRep && ++budget > 200000) return false;
      while (idx < rem.length && used.has(rem[idx].id)) idx++;
      if (idx >= rem.length) return true;
      const p1 = rem[idx];
      used.add(p1.id);
      // Clean candidates: avoid repeated opponents
      for (let j = idx + 1; j < rem.length; j++) {
        const p2 = rem[j];
        if (used.has(p2.id) || metAsOpp(p1, p2)) continue;
        used.add(p2.id);
        pairs.push({ a: p1.id, b: p2.id, rep: false });
        if (bt(idx + 1, allowRep)) return true;
        used.delete(p2.id); pairs.pop();
      }
      if (allowRep) {
        // Last resort: fewest prior meetings first
        const cands = [];
        for (let j = idx + 1; j < rem.length; j++) {
          const p2 = rem[j];
          if (used.has(p2.id)) continue;
          cands.push({ p2, n: p1.opponents.filter(o => o === p2.id).length });
        }
        cands.sort((x, y) => x.n - y.n);
        for (const c of cands) {
          used.add(c.p2.id);
          pairs.push({ a: p1.id, b: c.p2.id, rep: true });
          if (bt(idx + 1, true)) return true;
          used.delete(c.p2.id); pairs.pop();
        }
      }
      used.delete(p1.id);
      return false;
    }

    if (!bt(0, false)) {
      pairs.length = 0; used.clear();
      bt(0, true);
    }

    return pairs.map((pr, i) => ({
      table: i + 1, s1: [pr.a], s2: [pr.b], result: null, repeated: pr.rep
    }));
  }

  // ── Algorithm: individual mode — tables of 4, two teams of 2 ──────────
  // For a table [a,b,c,d] sorted by standing, the 3 possible team splits.
  // Repeat rival as rival weighs heaviest; former partners reseated as
  // rivals (or vice versa) weigh less; repeat partner as partner is worst.
  function tableSplits(t) {
    const [a, b, c, d] = t;
    return [
      [[a, d], [b, c]],
      [[a, c], [b, d]],
      [[a, b], [c, d]]
    ];
  }

  function splitScore(s1, s2) {
    let sc = 0;
    if (metAsPartner(s1[0], s1[1])) sc += 10;
    if (metAsPartner(s2[0], s2[1])) sc += 10;
    for (const x of s1) for (const y of s2) {
      if (metAsOpp(x, y)) sc += 4;
      if (metAsPartner(x, y)) sc += 1;
    }
    return sc;
  }

  // Lowest achievable conflict for seating these 4 together (0 = clean)
  function tablePenalty(t) {
    let best = Infinity;
    for (const [s1, s2] of tableSplits(t)) best = Math.min(best, splitScore(s1, s2));
    return best;
  }

  // Constraint: nobody at the table has previously been partner OR opponent
  // of anyone else seated there. Phase A searches exhaustively for a fully
  // clean grouping (node-budgeted); Phase B falls back per slot to the
  // least-conflicting tables (sorted by penalty) and flags them.
  function tablesOf4(rem) {
    const tables = [];
    const used = new Set();
    let budget = 0;

    function bt(idx, allowRep) {
      if (!allowRep && ++budget > 200000) return false;
      while (idx < rem.length && used.has(rem[idx].id)) idx++;
      if (idx >= rem.length) return true;
      const a = rem[idx];
      used.add(a.id);
      const avail = [];
      for (let j = idx + 1; j < rem.length; j++) {
        if (!used.has(rem[j].id)) avail.push(rem[j]);
      }

      const tryTable = (t, rep) => {
        t.slice(1).forEach(p => used.add(p.id));
        tables.push({ members: t, rep });
        if (bt(idx + 1, allowRep)) return true;
        tables.pop();
        t.slice(1).forEach(p => used.delete(p.id));
        return false;
      };

      // Clean tables, closest in standings first
      for (let i = 0; i < avail.length; i++)
        for (let j = i + 1; j < avail.length; j++)
          for (let l = j + 1; l < avail.length; l++) {
            const t = [a, avail[i], avail[j], avail[l]];
            if (tablePenalty(t) > 0) continue;
            if (tryTable(t, false)) return true;
          }

      if (allowRep) {
        // Least-conflicting tables first (last resort)
        const cands = [];
        for (let i = 0; i < avail.length; i++)
          for (let j = i + 1; j < avail.length; j++)
            for (let l = j + 1; l < avail.length; l++) {
              const t = [a, avail[i], avail[j], avail[l]];
              const pen = tablePenalty(t);
              if (pen > 0) cands.push({ t, pen });
            }
        cands.sort((x, y) => x.pen - y.pen);
        for (const c of cands) {
          if (tryTable(c.t, true)) return true;
        }
      }

      used.delete(a.id);
      return false;
    }

    if (!bt(0, false)) {
      tables.length = 0; used.clear();
      bt(0, true);
    }

    return tables.map((tb, i) => {
      let best = null, bestScore = Infinity;
      for (const [s1, s2] of tableSplits(tb.members)) {
        const sc = splitScore(s1, s2);
        if (sc < bestScore) { bestScore = sc; best = [s1, s2]; }
      }
      return {
        table: i + 1,
        s1: best[0].map(p => p.id),
        s2: best[1].map(p => p.id),
        result: null,
        repeated: tb.rep || bestScore > 0
      };
    });
  }

  // ── Algorithm: round generation ────────────────────────────────────────
  // pool: participants playing this round (all of them for normal rounds,
  // only the rested ones for the make-up round). Resters earn nothing —
  // they recover their game in the extra round at the end.
  function generateRound(pool, extra) {
    computeBuchholz();
    const ranking = sortedStandings();
    const sorted = ranking.filter(p => pool.includes(p));
    const gs = groupSize();
    const k = sorted.length % gs;

    const byes = [];
    if (k > 0) {
      // Resters will meet in the make-up round: prefer candidates with no
      // prior table-mates among those already rested (including the ones
      // picked this same round), so that round can be paired cleanly too.
      const rested = ts.participants.filter(p => p.byeCount > 0);
      for (let i = 0; i < k; i++) {
        const pool = [...rested, ...byes];
        const conf = p => pool.reduce((s, q) => s + (q !== p && metAnyhow(p, q) ? 1 : 0), 0);
        const cand = sorted
          .filter(p => !byes.includes(p))
          .map((p, rank) => ({ p, rank, conf: conf(p) }))
          .sort((x, y) => x.p.byeCount - y.p.byeCount || x.conf - y.conf || y.rank - x.rank);
        byes.push(cand[0].p);
      }
      for (const p of byes) p.byeCount++;
    }

    const rem = sorted.filter(p => !byes.includes(p));
    const matches = ts.type === 'individual' ? tablesOf4(rem) : pairUnits(rem);

    return { number: ts.rounds.length + 1, matches, byes: byes.map(p => p.id), extra: !!extra };
  }

  // ── Result management ──────────────────────────────────────────────────
  function undoResult(ri, mi) {
    const m = ts.rounds[ri].matches[mi];
    if (!m || m.result === null) return;
    const S1 = m.s1.map(fp), S2 = m.s2.map(fp);
    if (m.result === 's1')      { S1.forEach(p => { p.pts -= 1; p.wins--; }); S2.forEach(p => { p.losses--; }); }
    else if (m.result === 's2') { S2.forEach(p => { p.pts -= 1; p.wins--; }); S1.forEach(p => { p.losses--; }); }
    else { [...S1, ...S2].forEach(p => { p.pts -= 0.5; p.draws--; }); }
    const unlink = (team, foes) => team.forEach(p => {
      team.filter(q => q !== p).forEach(q => {
        const i = p.partners.lastIndexOf(q.id); if (i >= 0) p.partners.splice(i, 1);
      });
      foes.forEach(q => {
        const i = p.opponents.lastIndexOf(q.id); if (i >= 0) p.opponents.splice(i, 1);
      });
    });
    unlink(S1, S2); unlink(S2, S1);
    m.result = null;
  }

  function recordResult(ri, mi, result) {
    const m = ts.rounds[ri].matches[mi];
    if (!m) return;
    if (m.result !== null) undoResult(ri, mi);
    const S1 = m.s1.map(fp), S2 = m.s2.map(fp);
    m.result = result;
    if (result === 's1')      { S1.forEach(p => { p.pts += 1; p.wins++; }); S2.forEach(p => { p.losses++; }); }
    else if (result === 's2') { S2.forEach(p => { p.pts += 1; p.wins++; }); S1.forEach(p => { p.losses++; }); }
    else { [...S1, ...S2].forEach(p => { p.pts += 0.5; p.draws++; }); }
    const link = (team, foes) => team.forEach(p => {
      team.filter(q => q !== p).forEach(q => p.partners.push(q.id));
      foes.forEach(q => p.opponents.push(q.id));
    });
    link(S1, S2); link(S2, S1);
    computeBuchholz();
    tSave();
  }

  function roundComplete(r) { return r.matches.every(m => m.result !== null); }

  // ── Tournament flow ────────────────────────────────────────────────────
  function startTournament() {
    const names = ts.participants.map(p => p.name.trim());
    if (names.some(n => !n)) { alert('Todos los participantes deben tener nombre.'); return false; }
    if (new Set(names).size !== names.length) { alert('Hay nombres duplicados.'); return false; }
    ts.participants.forEach(p => { p.name = p.name.trim(); });

    const nr = parseInt($('tNumRounds').value, 10);
    if (!nr || nr < 1) { alert('Número de rondas inválido.'); return false; }
    ts.numRounds = nr;
    ts.status = 'active';
    ts.rounds.push(generateRound(ts.participants, false));
    tSave();
    return true;
  }

  function mainRoundsDone() { return ts.rounds.filter(r => !r.extra).length; }

  function advanceRound() {
    const cur = ts.rounds[ts.rounds.length - 1];
    if (!roundComplete(cur)) return;

    if (mainRoundsDone() < ts.numRounds) {
      ts.rounds.push(generateRound(ts.participants, false));
      tSave();
      renderRound();
      showScreen('tScreenRound');
      return;
    }

    // Main rounds done: make-up round(s) so everyone reaches numRounds games
    const D = deficits();
    if (D.length >= groupSize()) {
      ts.rounds.push(generateRound(D, true));
      tSave();
      renderRound();
      showScreen('tScreenRound');
      return;
    }

    ts.status = 'finished';
    computeBuchholz();
    tSave();
    renderStandings();
    showScreen('tScreenStandings');
  }

  function clearTournament() {
    ts.type = null; ts.participants = []; ts.rounds = [];
    ts.numRounds = 4; ts.status = 'idle';
    tSave();
  }

  // ── View switching ─────────────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.t-screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
    const showTabla = (ts.status === 'active' || ts.status === 'finished') && id !== 'tScreenStandings';
    $('tStandingsBtn').style.visibility = showTabla ? 'visible' : 'hidden';
  }

  function switchToTournView() {
    $('game').hidden = true;
    $('tourn').hidden = false;
    renderCurrentScreen();
  }

  function switchToGameView() {
    $('game').hidden = false;
    $('tourn').hidden = true;
    updateTournBtn();
  }

  function updateTournBtn() {
    const btn = $('openTournBtn');
    if (!btn) return;
    btn.textContent = (ts.status === 'active' || ts.status === 'setup') ? 'Torneo ●' : 'Torneo';
  }

  function renderCurrentScreen() {
    switch (ts.status) {
      case 'setup':    renderSetup();     showScreen('tScreenSetup');     break;
      case 'active':   renderRound();     showScreen('tScreenRound');     break;
      case 'finished': renderStandings(); showScreen('tScreenStandings'); break;
      default:         renderSelector();  showScreen('tScreenSelector');  break;
    }
  }

  // ── Render: Selector ───────────────────────────────────────────────────
  function renderSelector() {
    const has = ts.status !== 'idle';
    $('tContinueBtn').hidden = !has;
    if (has) {
      const tipo = ts.type === 'individual' ? 'Individual' : 'Parejas';
      const stat = ts.status === 'finished' ? 'finalizado'
                 : ts.status === 'setup'    ? 'configurando'
                 : `ronda ${ts.rounds.length}/${ts.numRounds}`;
      $('tContinueBtn').textContent = `Continuar torneo ${tipo} (${stat})`;
    }
  }

  // ── Render: Setup ──────────────────────────────────────────────────────
  function setupHint() {
    const n = ts.participants.length;
    if (n < 4) return `Mínimo 4 participantes (${n}/4)`;
    const unit = ts.type === 'individual' ? 'jugador' : 'pareja';
    const rest = n % (ts.type === 'individual' ? 4 : 2);
    let txt = `${n} ${unit}${n !== 1 ? 's' : ''}`;
    if (rest > 0) txt += ` · descansa${rest !== 1 ? 'n' : ''} ${rest} por ronda y juegan ronda extra al final`;
    return txt;
  }

  function renderSetup() {
    $('tSetupTitle').textContent = ts.type === 'individual' ? 'Torneo Individual' : 'Torneo en Parejas';
    const ph = ts.type === 'individual' ? 'Nombre del jugador' : 'Nombre de la pareja';
    const list = $('tParticipantList');
    list.innerHTML = '';
    ts.participants.forEach((p, i) => {
      list.insertAdjacentHTML('beforeend',
        `<div class="t-part-row">` +
        `<span class="t-part-num">${i + 1}</span>` +
        `<input class="t-part-input" type="text" placeholder="${ph}" value="${esc(p.name)}" data-idx="${i}" autocomplete="off" spellcheck="false"/>` +
        `<button class="t-part-del" data-idx="${i}" aria-label="Eliminar">✕</button>` +
        `</div>`
      );
    });
    const n = ts.participants.length;
    $('tNumRounds').value = ts.numRounds;
    $('tStartBtn').disabled = n < 4;
    $('tAddParticipant').disabled = n >= 40;
    $('tSetupHint').textContent = setupHint();
  }

  // ── Render: Round ──────────────────────────────────────────────────────
  function renderRound() {
    const round = ts.rounds[ts.rounds.length - 1];
    const ri = ts.rounds.length - 1;
    const done = round.matches.filter(m => m.result !== null).length;

    $('tRoundLabel').textContent = round.extra
      ? 'Ronda extra · recuperación'
      : `Ronda ${round.number} / ${ts.numRounds}`;
    $('tRoundProgress').textContent = `${done} / ${round.matches.length} resultados`;

    const sideLbl = ts.type === 'individual' ? 'Equipo' : 'Pareja';
    $('tThS1').textContent = `${sideLbl} 1`;
    $('tThS2').textContent = `${sideLbl} 2`;

    $('tNextRoundBtn').disabled = !roundComplete(round);
    let nextTxt;
    if (mainRoundsDone() < ts.numRounds) nextTxt = 'Siguiente ronda →';
    else nextTxt = deficits().length >= groupSize() ? 'Ronda extra →' : 'Ver Clasificación Final';
    $('tNextRoundBtn').textContent = nextTxt;

    const tbody = $('tMatchRows');
    tbody.innerHTML = '';
    round.matches.forEach((m, mi) => {
      const n1 = sideNames(m.s1);
      const n2 = sideNames(m.s2);

      let res = '';
      if (m.result === null) {
        res = `<span class="t-res-pend">— tocar —</span>`;
      } else {
        const txt = m.result === 's1' ? `✓ ${esc(n1)}`
                  : m.result === 'draw' ? '½ Empate'
                  : `✓ ${esc(n2)}`;
        res = `<span class="t-res-done">${txt}</span>`;
      }

      const warnHtml = m.repeated ? ` <span class="t-rep-warn" title="Cruce o compañero repetido">⚠</span>` : '';
      const cls = [
        m.result !== null ? 'match-done' : '',
        m.repeated       ? 'match-rep'  : ''
      ].filter(Boolean).join(' ');

      tbody.insertAdjacentHTML('beforeend',
        `<tr class="${cls}" data-ri="${ri}" data-mi="${mi}" style="cursor:pointer">` +
        `<td class="t-td-mesa">${m.table}</td>` +
        `<td class="t-td-p1">${esc(n1)}</td>` +
        `<td class="t-td-vs">vs</td>` +
        `<td class="t-td-p2">${esc(n2)}</td>` +
        `<td class="t-td-res">${res}${warnHtml}</td>` +
        `</tr>`
      );
    });

    if (round.byes && round.byes.length) {
      tbody.insertAdjacentHTML('beforeend',
        `<tr class="match-bye">` +
        `<td class="t-td-mesa">—</td>` +
        `<td colspan="4"><span class="t-bye-lbl">💤 Descansa${round.byes.length !== 1 ? 'n' : ''}: ` +
        `${esc(sideNames(round.byes))} (juegan ronda extra al final)</span></td>` +
        `</tr>`
      );
    }
  }

  // ── Render: Standings ──────────────────────────────────────────────────
  function renderStandings() {
    const fin = ts.status === 'finished';
    $('tWinnerCard').hidden = !fin;
    $('tStandingsBackBtn').hidden = fin;
    $('tNewTournBtn').hidden = !fin;

    if (fin) {
      computeBuchholz();
      const top = sortedStandings()[0];
      $('tWinnerName').textContent = top ? top.name : '—';
      $('tWinnerStats').textContent = top
        ? `${top.pts} pts · ${top.wins}V ${top.draws}E ${top.losses}D`
        : '';
      $('tStandingsRound').textContent = 'Clasificación final';
    } else {
      const done = ts.rounds.filter(r => roundComplete(r)).length;
      $('tStandingsRound').textContent = done > 0 ? `Tras ronda ${done}` : 'Sin resultados aún';
    }

    const sorted = sortedStandings();
    const tbody = $('tStandingsRows');
    tbody.innerHTML = '';
    sorted.forEach((p, i) => {
      const pos = i + 1;
      const pj = p.wins + p.draws + p.losses;
      const ptsS = p.pts % 1 === 0 ? String(p.pts) : p.pts.toFixed(1);
      const bchS = p.buchholz % 1 === 0 ? String(p.buchholz) : p.buchholz.toFixed(1);
      const cls = pos === 1 ? 't-pos-1' : pos === 2 ? 't-pos-2' : pos === 3 ? 't-pos-3' : '';
      tbody.insertAdjacentHTML('beforeend',
        `<tr class="${cls}">` +
        `<td>${pos}</td>` +
        `<td>${esc(p.name)}</td>` +
        `<td>${pj}</td>` +
        `<td>${p.wins}</td>` +
        `<td>${p.draws}</td>` +
        `<td>${p.losses}</td>` +
        `<td><b>${ptsS}</b></td>` +
        `<td class="t-buch">${bchS}</td>` +
        `</tr>`
      );
    });
  }

  // ── Result modal ───────────────────────────────────────────────────────
  let mRi = null, mMi = null;

  function openModal(ri, mi) {
    const m = ts.rounds[ri].matches[mi];
    if (!m) return;
    mRi = ri; mMi = mi;
    $('tResultTitle').textContent = `Mesa ${m.table}`;
    $('tResP1').textContent = sideNames(m.s1);
    $('tResP2').textContent = sideNames(m.s2);
    $('tResultOverlay').classList.add('open');
  }

  function closeModal() {
    $('tResultOverlay').classList.remove('open');
    mRi = null; mMi = null;
  }

  // ── Events ─────────────────────────────────────────────────────────────
  function initEvents() {
    $('openTournBtn').onclick = switchToTournView;

    $('tBackBtn').onclick = () => {
      if (ts.status === 'setup') {
        if (!confirm('¿Abandonar la configuración del torneo?')) return;
        clearTournament();
      }
      switchToGameView();
    };
    $('tStandingsBtn').onclick = () => { renderStandings(); showScreen('tScreenStandings'); };

    $('tSelIndividual').onclick = () => {
      ts.type = 'individual'; ts.status = 'setup'; ts.participants = []; ts.rounds = []; ts.numRounds = 4;
      tSave(); renderSetup(); showScreen('tScreenSetup');
    };
    $('tSelPairs').onclick = () => {
      ts.type = 'pairs'; ts.status = 'setup'; ts.participants = []; ts.rounds = []; ts.numRounds = 4;
      tSave(); renderSetup(); showScreen('tScreenSetup');
    };
    $('tContinueBtn').onclick = renderCurrentScreen;

    $('tAddParticipant').onclick = () => {
      if (ts.participants.length >= 40) return;
      ts.participants.push(newParticipant());
      tSave(); renderSetup();
      const inputs = $('tParticipantList').querySelectorAll('.t-part-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    };

    $('tParticipantList').addEventListener('input', e => {
      const inp = e.target.closest('.t-part-input');
      if (!inp) return;
      ts.participants[+inp.dataset.idx].name = inp.value;
      $('tStartBtn').disabled = ts.participants.length < 4;
      $('tSetupHint').textContent = setupHint();
      tSave();
    });

    $('tParticipantList').addEventListener('click', e => {
      const btn = e.target.closest('.t-part-del');
      if (!btn) return;
      ts.participants.splice(+btn.dataset.idx, 1);
      tSave(); renderSetup();
    });

    $('tNumRounds').addEventListener('change', () => {
      const v = parseInt($('tNumRounds').value, 10);
      if (v >= 1 && v <= 12) { ts.numRounds = v; tSave(); }
    });

    $('tStartBtn').onclick = () => {
      if (startTournament()) { renderRound(); showScreen('tScreenRound'); }
    };

    $('tMatchRows').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-ri]');
      if (!tr) return;
      openModal(+tr.dataset.ri, +tr.dataset.mi);
    });
    $('tNextRoundBtn').onclick = advanceRound;

    $('tStandingsBackBtn').onclick = () => { renderRound(); showScreen('tScreenRound'); };
    $('tNewTournBtn').onclick = () => {
      if (confirm('¿Comenzar un nuevo torneo? Se perderán todos los datos del torneo actual.')) {
        clearTournament(); renderSelector(); showScreen('tScreenSelector');
      }
    };

    const applyResult = result => {
      if (mRi === null) return;
      recordResult(mRi, mMi, result);
      closeModal(); renderRound();
    };
    $('tResP1').onclick = () => applyResult('s1');
    $('tResDraw').onclick = () => applyResult('draw');
    $('tResP2').onclick = () => applyResult('s2');
    $('tResCancel').onclick = closeModal;
    $('tResultOverlay').addEventListener('click', e => {
      if (e.target === $('tResultOverlay')) closeModal();
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  localStorage.removeItem('domino_tourn_v1');
  tLoad();
  initEvents();
  updateTournBtn();
})();
