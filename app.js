(() => {
  const KEY = "domino_v4";
  const $ = id => document.getElementById(id);
  const toInt = v => { const n = parseInt(String(v).trim(), 10); return Number.isFinite(n) ? n : NaN; };
  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  const state = {
    config: { homeName: "", visName: "", target: 200 },
    hands: [],
    finished: false,
    winner: null
  };

  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && s.config && Array.isArray(s.hands)) Object.assign(state, s);
    } catch { localStorage.removeItem(KEY); }
  }

  function totals() {
    let home = 0, vis = 0;
    for (const h of state.hands) {
      if (h.side === "HOME") home += h.pts;
      else if (h.side === "VISITORS") vis += h.pts;
    }
    return { home, vis };
  }

  function names() {
    return {
      home: state.config.homeName || "HOME",
      vis:  state.config.visName  || "VISITORS"
    };
  }

  function finish() {
    if (state.finished) return;
    state.finished = true;
    const { home, vis } = totals();
    state.winner = home > vis ? "HOME" : vis > home ? "VISITORS" : "TIE";
    save();
    render();
    try { if (navigator.vibrate) navigator.vibrate([300, 120, 500]); } catch {}
  }

  function addHand(side, pts) {
    if (state.finished) return;
    const p = toInt(pts);
    if (!Number.isFinite(p) || p <= 0) return;
    state.hands.push({ id: uid(), side, pts: p });
    save();
    render();
    const { home, vis } = totals();
    if (home >= state.config.target || vis >= state.config.target) finish();
  }

  function addTiedHand() {
    if (state.finished) return;
    state.hands.push({ id: uid(), side: "TIE", pts: 0 });
    save();
    render();
  }

  function changeTarget() {
    const val = prompt(`Meta de puntos (actual: ${state.config.target}):`, String(state.config.target));
    if (val === null) return;
    const t = toInt(val);
    if (!Number.isFinite(t) || t < 1) { alert("Meta inválida (debe ser mayor a 0)."); return; }
    state.config.target = t;
    save(); render();
  }

  function undo() {
    if (!state.hands.length) return;
    state.hands.pop();
    if (state.finished) {
      state.finished = false;
      state.winner = null;
    }
    save();
    render();
  }

  function editHand(id) {
    const h = state.hands.find(h => h.id === id);
    if (!h) return;
    const n = state.hands.indexOf(h) + 1;
    const val = prompt(`Mano #${n} — nuevo valor de puntos:`, String(h.pts));
    if (val === null) return;
    const p = toInt(val);
    if (!Number.isFinite(p) || p <= 0) { alert("Puntos inválidos (> 0)."); return; }
    h.pts = p;
    save();
    render();
    const { home, vis } = totals();
    if (!state.finished && (home >= state.config.target || vis >= state.config.target)) finish();
  }

  function deleteHand(id) {
    const idx = state.hands.findIndex(h => h.id === id);
    if (idx < 0) return;
    if (!confirm("¿Eliminar este puntaje?")) return;
    state.hands.splice(idx, 1);
    if (state.finished) {
      const { home, vis } = totals();
      if (home < state.config.target && vis < state.config.target) {
        state.finished = false;
        state.winner = null;
      }
    }
    save();
    render();
  }

  // ── Numpad ──
  let npSide = null;
  let npVal  = "";

  function openNumpad(side) {
    if (state.finished) return;
    npSide = side;
    npVal  = "";
    const N = names();
    $("npWho").textContent     = side === "HOME" ? N.home : N.vis;
    $("npDisp").textContent    = "—";
    $("npDisp").classList.remove("shake");
    $("npOk").style.background = side === "HOME" ? "#F59E0B" : "#60A5FA";
    $("npOk").style.color      = "#000";
    $("npOverlay").classList.add("open");
  }

  function closeNumpad() {
    $("npOverlay").classList.remove("open");
    npSide = null;
    npVal  = "";
  }

  function npInput(digit) {
    if (npVal.length >= 4) return;
    npVal += digit;
    $("npDisp").classList.remove("shake");
    $("npDisp").textContent = npVal;
  }

  function npBackspace() {
    npVal = npVal.slice(0, -1);
    $("npDisp").textContent = npVal || "—";
  }

  function npConfirm() {
    const p = toInt(npVal);
    if (!Number.isFinite(p) || p <= 0) {
      const d = $("npDisp");
      d.classList.remove("shake");
      void d.offsetWidth;
      d.classList.add("shake");
      setTimeout(() => d.classList.remove("shake"), 400);
      return;
    }
    addHand(npSide, p);
    closeNumpad();
  }

  function render() {
    const { home, vis } = totals();
    const N = names();

    $("game").classList.toggle("finished", state.finished);

    $("homeLabel").textContent = N.home;
    $("visLabel").textContent  = N.vis;
    $("homeTotal").textContent = home;
    $("visTotal").textContent  = vis;
    $("thHome").textContent    = N.home;
    $("thVis").textContent     = N.vis;
    $("handCount").textContent = `${state.hands.length} mano${state.hands.length !== 1 ? "s" : ""}`;

    const cardHome = $("cardHome");
    const cardVis  = $("cardVis");
    cardHome.classList.remove("leading", "winning");
    cardVis.classList.remove("leading", "winning");

    if (state.finished) {
      if (state.winner === "HOME") cardHome.classList.add("winning");
      else if (state.winner === "VISITORS") cardVis.classList.add("winning");
    } else {
      if (home > vis) cardHome.classList.add("leading");
      else if (vis > home) cardVis.classList.add("leading");
    }

    // Info bar
    const bar = $("infoBar");
    bar.onclick = null;
    bar.style.cursor = "";
    if (state.finished) {
      const winName = state.winner === "HOME" ? N.home
                    : state.winner === "VISITORS" ? N.vis : null;
      bar.textContent = state.winner === "TIE"
        ? `🤝 Empate — ${home} pts`
        : `🏆 ¡Ganó ${winName}! · ${home} – ${vis}`;
      bar.className = "info-bar winner";
    } else {
      bar.className = "info-bar";
      if (home > vis)      bar.textContent = `${N.home} arriba por ${home - vis} pts`;
      else if (vis > home) bar.textContent = `${N.vis} arriba por ${vis - home} pts`;
      else if (home === 0) {
        bar.innerHTML = `Meta: ${state.config.target} pts &nbsp;<span class="lbl-edit">✎</span>`;
        bar.onclick = changeTarget;
        bar.style.cursor = "pointer";
      } else {
        bar.textContent = "Empate";
      }
    }

    $("finishNow").style.display = state.finished ? "none" : "";
    $("addTie").style.display    = state.finished ? "none" : "";
    $("undo").disabled = state.hands.length === 0;

    $("hist").style.display = state.hands.length > 0 ? "block" : "none";
    let runH = 0, runV = 0;
    const rows = state.hands.map((h, i) => {
      if (h.side === "HOME") runH += h.pts;
      else if (h.side === "VISITORS") runV += h.pts;
      return { id: h.id, n: i + 1, side: h.side, pts: h.pts, rH: runH, rV: runV };
    });
    const tbody = $("hands");
    tbody.innerHTML = "";
    rows.slice().reverse().forEach(r => {
      const isTie  = r.side === "TIE";
      const isHome = r.side === "HOME";
      tbody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${r.n}</td>
          <td>${isTie
            ? '🤝 Empate de mano'
            : `<span class="dot ${isHome ? "home" : "vis"}"></span>${isHome ? N.home : N.vis}`
          }</td>
          <td>${isTie ? '<span style="color:var(--dim)">—</span>' : `<b>${r.pts}</b>`}</td>
          <td>${r.rH}</td>
          <td>${r.rV}</td>
          <td class="td-acts">
            ${isTie ? '' : `<button class="btn-row btn-row-edit" data-act="edit" data-id="${r.id}">✏</button>`}
            <button class="btn-row btn-row-del" data-act="del" data-id="${r.id}">✕</button>
          </td>
        </tr>
      `);
    });
  }

  // Score taps → numpad
  $("tapHome").onclick = () => openNumpad("HOME");
  $("tapVis").onclick  = () => openNumpad("VISITORS");

  // Team label → rename
  $("tapHomeLabel").onclick = () => {
    const val = prompt("Nombre del equipo local:", state.config.homeName || "HOME");
    if (val === null) return;
    const trimmed = val.trim();
    if (!trimmed) return;
    state.config.homeName = trimmed;
    save(); render();
  };
  $("tapVisLabel").onclick = () => {
    const val = prompt("Nombre del equipo visitante:", state.config.visName || "VISITORS");
    if (val === null) return;
    const trimmed = val.trim();
    if (!trimmed) return;
    state.config.visName = trimmed;
    save(); render();
  };

  // Numpad
  $("npOverlay").addEventListener("click", e => {
    if (e.target === $("npOverlay")) closeNumpad();
  });
  document.querySelectorAll(".nk[data-n]").forEach(btn => {
    btn.addEventListener("click", () => npInput(btn.dataset.n));
  });
  $("npBack").onclick   = npBackspace;
  $("npOk").onclick     = npConfirm;
  $("npCancel").onclick = closeNumpad;

  // History actions
  $("hands").addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "edit") editHand(btn.dataset.id);
    if (btn.dataset.act === "del")  deleteHand(btn.dataset.id);
  });

  $("undo").onclick      = undo;
  $("addTie").onclick    = addTiedHand;
  $("finishNow").onclick = () => { if (!state.finished) finish(); };

  // Nueva partida — doble toque en el MISMO botón
  let resetPending = false;
  let resetTimer   = null;

  $("reset").onclick = () => {
    if (!resetPending) {
      resetPending = true;
      $("reset").classList.add("confirming");
      $("reset").textContent = "Toca de nuevo";
      resetTimer = setTimeout(() => {
        resetPending = false;
        $("reset").classList.remove("confirming");
        $("reset").textContent = "Nueva partida";
      }, 3000);
    } else {
      clearTimeout(resetTimer);
      resetPending = false;
      $("reset").classList.remove("confirming");
      $("reset").textContent = "Nueva partida";
      state.hands    = [];
      state.finished = false;
      state.winner   = null;
      save();
      render();
    }
  };

  load();
  render();
})();
