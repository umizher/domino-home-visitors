(() => {
  'use strict';

  const TKEY = 'domino_tourn_v1';
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

  function newParticipant() {
    return { id: uid(), name: '', pts: 0, buchholz: 0, wins: 0, draws: 0, losses: 0, opponents: [], byeCount: 0 };
  }

  // ── Algorithm: Buchholz ───────────────────────────────────────────────
  function computeBuchholz() {
    for (const p of ts.participants) {
      p.buchholz = p.opponents
        .filter(o => o !== 'BYE')
        .reduce((s, oid) => { const o = fp(oid); return s + (o ? o.pts : 0); }, 0);
    }
  }

  // ── Algorithm: Sort ───────────────────────────────────────────────────
  function sortedStandings() {
    return [...ts.participants].sort((a, b) =>
      b.pts - a.pts || b.buchholz - a.buchholz || a.name.localeCompare(b.name)
    );
  }

  // ── Algorithm: Swiss Pairing (backtracking) ───────────────────────────
  function generatePairings() {
    computeBuchholz();
    const sorted = sortedStandings();
    const rem = [...sorted];

    // Bye for odd count: lowest ranked with minimum byeCount
    let byeP = null;
    if (rem.length % 2 === 1) {
      const minBye = Math.min(...rem.map(p => p.byeCount));
      for (let i = rem.length - 1; i >= 0; i--) {
        if (rem[i].byeCount === minBye) { byeP = rem[i]; rem.splice(i, 1); break; }
      }
    }

    const pairs = [];
    const used = new Set();

    // Backtrack from highest-ranked downward
    function bt(idx) {
      while (idx < rem.length && used.has(rem[idx].id)) idx++;
      if (idx >= rem.length) return true;

      const p1 = rem[idx];
      used.add(p1.id);

      // Pass 1: avoid repeated opponents
      for (let j = idx + 1; j < rem.length; j++) {
        const p2 = rem[j];
        if (used.has(p2.id) || p1.opponents.includes(p2.id)) continue;
        used.add(p2.id);
        pairs.push({ a: p1.id, b: p2.id, rep: false });
        if (bt(idx + 1)) return true;
        used.delete(p2.id); pairs.pop();
      }

      // Pass 2: allow repeated pairings (last resort)
      for (let j = idx + 1; j < rem.length; j++) {
        const p2 = rem[j];
        if (used.has(p2.id)) continue;
        used.add(p2.id);
        pairs.push({ a: p1.id, b: p2.id, rep: true });
        if (bt(idx + 1)) return true;
        used.delete(p2.id); pairs.pop();
      }

      used.delete(p1.id);
      return false;
    }
    bt(0);

    const matches = pairs.map((pr, i) => ({
      table: i + 1, p1: pr.a, p2: pr.b, result: null, repeated: pr.rep
    }));

    // Apply bye immediately (automatic win, tracked separately from regular wins)
    if (byeP) {
      byeP.byeCount++;
      byeP.pts += 1;
      byeP.opponents.push('BYE');
      matches.push({ table: matches.length + 1, p1: byeP.id, p2: 'BYE', result: 'p1', repeated: false });
    }

    return { number: ts.rounds.length + 1, matches, bye: byeP ? byeP.id : null };
  }

  // ── Result management ──────────────────────────────────────────────────
  function undoResult(ri, mi) {
    const m = ts.rounds[ri].matches[mi];
    if (!m || m.result === null || m.p2 === 'BYE') return;
    const a = fp(m.p1), b = fp(m.p2);
    if (m.result === 'p1')   { a.pts -= 1; a.wins--;  b.losses--; }
    else if (m.result === 'draw') { a.pts -= 0.5; b.pts -= 0.5; a.draws--; b.draws--; }
    else                     { b.pts -= 1; b.wins--;  a.losses--; }
    const ia = a.opponents.lastIndexOf(m.p2); if (ia >= 0) a.opponents.splice(ia, 1);
    const ib = b.opponents.lastIndexOf(m.p1); if (ib >= 0) b.opponents.splice(ib, 1);
    m.result = null;
  }

  function recordResult(ri, mi, result) {
    const m = ts.rounds[ri].matches[mi];
    if (!m || m.p2 === 'BYE') return;
    if (m.result !== null) undoResult(ri, mi);
    const a = fp(m.p1), b = fp(m.p2);
    m.result = result;
    if (result === 'p1')        { a.pts += 1; a.wins++;  b.losses++; }
    else if (result === 'draw') { a.pts += 0.5; b.pts += 0.5; a.draws++; b.draws++; }
    else                        { b.pts += 1; b.wins++;  a.losses++; }
    a.opponents.push(m.p2);
    b.opponents.push(m.p1);
    computeBuchholz();
    tSave();
  }

  function roundComplete(r) { return r.matches.every(m => m.result !== null); }

  // ── Tournament flow ────────────────────────────────────────────────────
  function startTournament() {
    // Validate names
    const names = ts.participants.map(p => p.name.trim());
    if (names.some(n => !n)) { alert('Todos los participantes deben tener nombre.'); return false; }
    if (new Set(names).size !== names.length) { alert('Hay nombres duplicados.'); return false; }

    // Apply trimmed names
    ts.participants.forEach(p => { p.name = p.name.trim(); });

    const nr = parseInt($('tNumRounds').value, 10);
    if (!nr || nr < 1) { alert('Número de rondas inválido.'); return false; }
    ts.numRounds = nr;
    ts.status = 'active';
    ts.rounds.push(generatePairings());
    tSave();
    return true;
  }

  function advanceRound() {
    const cur = ts.rounds[ts.rounds.length - 1];
    if (!roundComplete(cur)) return;

    if (ts.rounds.length >= ts.numRounds) {
      ts.status = 'finished';
      computeBuchholz();
      tSave();
      renderStandings();
      showScreen('tScreenStandings');
      return;
    }
    ts.rounds.push(generatePairings());
    tSave();
    renderRound();
    showScreen('tScreenRound');
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
    $('tSetupHint').textContent = n < 4
      ? `Mínimo 4 participantes (${n}/4)`
      : `${n} participante${n !== 1 ? 's' : ''}`;
  }

  // ── Render: Round ──────────────────────────────────────────────────────
  function renderRound() {
    const round = ts.rounds[ts.rounds.length - 1];
    const ri = ts.rounds.length - 1;
    const playable = round.matches.filter(m => m.p2 !== 'BYE');
    const done = playable.filter(m => m.result !== null).length;

    $('tRoundLabel').textContent = `Ronda ${round.number} / ${ts.numRounds}`;
    $('tRoundProgress').textContent = `${done} / ${playable.length} resultados`;

    const isLast = ts.rounds.length >= ts.numRounds;
    $('tNextRoundBtn').disabled = !roundComplete(round);
    $('tNextRoundBtn').textContent = isLast ? 'Ver Clasificación Final' : 'Siguiente ronda →';

    const tbody = $('tMatchRows');
    tbody.innerHTML = '';
    round.matches.forEach((m, mi) => {
      const isBye = m.p2 === 'BYE';
      const a = fp(m.p1);
      const b = isBye ? null : fp(m.p2);
      const aName = a ? a.name : '?';
      const bName = isBye ? 'BYE' : (b ? b.name : '?');

      let res = '';
      if (isBye) {
        res = `<span class="t-bye-lbl">Victoria automática</span>`;
      } else if (m.result === null) {
        res = `<span class="t-res-pend">— tocar —</span>`;
      } else {
        const txt = m.result === 'p1' ? `✓ ${esc(aName)}`
                  : m.result === 'draw' ? '½ Empate'
                  : `✓ ${esc(bName)}`;
        res = `<span class="t-res-done">${txt}</span>`;
      }

      const warnHtml = m.repeated ? ` <span class="t-rep-warn" title="Ya jugaron antes">⚠</span>` : '';
      const cls = [
        m.result !== null ? 'match-done' : '',
        m.repeated       ? 'match-rep'  : '',
        isBye            ? 'match-bye'  : ''
      ].filter(Boolean).join(' ');
      const clickAttrs = isBye ? '' : ` data-ri="${ri}" data-mi="${mi}" style="cursor:pointer"`;

      tbody.insertAdjacentHTML('beforeend',
        `<tr class="${cls}"${clickAttrs}>` +
        `<td class="t-td-mesa">${m.table}</td>` +
        `<td class="t-td-p1">${esc(aName)}</td>` +
        `<td class="t-td-vs">vs</td>` +
        `<td class="t-td-p2">${esc(bName)}</td>` +
        `<td class="t-td-res">${res}${warnHtml}</td>` +
        `</tr>`
      );
    });
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
      const byeTag = p.byeCount > 0 ? `<span class="t-bye-tag">+${p.byeCount}b</span>` : '';
      tbody.insertAdjacentHTML('beforeend',
        `<tr class="${cls}">` +
        `<td>${pos}</td>` +
        `<td>${esc(p.name)}</td>` +
        `<td>${pj}</td>` +
        `<td>${p.wins}${byeTag}</td>` +
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
    if (!m || m.p2 === 'BYE') return;
    const a = fp(m.p1), b = fp(m.p2);
    mRi = ri; mMi = mi;
    $('tResultTitle').textContent = `Mesa ${m.table}`;
    $('tResP1').textContent = a ? a.name : '?';
    $('tResP2').textContent = b ? b.name : '?';
    $('tResultOverlay').classList.add('open');
  }

  function closeModal() {
    $('tResultOverlay').classList.remove('open');
    mRi = null; mMi = null;
  }

  // ── Events ─────────────────────────────────────────────────────────────
  function initEvents() {
    // Game view → tournament
    $('openTournBtn').onclick = switchToTournView;

    // Tournament topbar
    $('tBackBtn').onclick = () => {
      if (ts.status === 'setup') {
        if (!confirm('¿Abandonar la configuración del torneo?')) return;
        clearTournament();
      }
      switchToGameView();
    };
    $('tStandingsBtn').onclick = () => { renderStandings(); showScreen('tScreenStandings'); };

    // Selector
    $('tSelIndividual').onclick = () => {
      ts.type = 'individual'; ts.status = 'setup'; ts.participants = []; ts.rounds = []; ts.numRounds = 4;
      tSave(); renderSetup(); showScreen('tScreenSetup');
    };
    $('tSelPairs').onclick = () => {
      ts.type = 'pairs'; ts.status = 'setup'; ts.participants = []; ts.rounds = []; ts.numRounds = 4;
      tSave(); renderSetup(); showScreen('tScreenSetup');
    };
    $('tContinueBtn').onclick = renderCurrentScreen;

    // Setup
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
      const n = ts.participants.length;
      $('tStartBtn').disabled = n < 4;
      $('tSetupHint').textContent = n < 4
        ? `Mínimo 4 participantes (${n}/4)`
        : `${n} participante${n !== 1 ? 's' : ''}`;
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

    // Round
    $('tMatchRows').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-ri]');
      if (!tr) return;
      openModal(+tr.dataset.ri, +tr.dataset.mi);
    });
    $('tNextRoundBtn').onclick = advanceRound;

    // Standings
    $('tStandingsBackBtn').onclick = () => { renderRound(); showScreen('tScreenRound'); };
    $('tNewTournBtn').onclick = () => {
      if (confirm('¿Comenzar un nuevo torneo? Se perderán todos los datos del torneo actual.')) {
        clearTournament(); renderSelector(); showScreen('tScreenSelector');
      }
    };

    // Result modal
    const applyResult = result => {
      if (mRi === null) return;
      recordResult(mRi, mMi, result);
      closeModal(); renderRound();
    };
    $('tResP1').onclick = () => applyResult('p1');
    $('tResDraw').onclick = () => applyResult('draw');
    $('tResP2').onclick = () => applyResult('p2');
    $('tResCancel').onclick = closeModal;
    $('tResultOverlay').addEventListener('click', e => {
      if (e.target === $('tResultOverlay')) closeModal();
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  tLoad();
  initEvents();
  updateTournBtn();
})();
