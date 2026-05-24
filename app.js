(() => {
  const KEY = "domino_v4";
  const $ = id => document.getElementById(id);
  const toInt = v => { const n = parseInt(String(v).trim(), 10); return Number.isFinite(n) ? n : NaN; };
  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  const state = {
    config: { homeName: "", visName: "", target: 200 },
    hands: [],
    started: false,
    finished: false,
    winner: null
  };

  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && s.config && typeof s.started === "boolean" && Array.isArray(s.hands)) {
        Object.assign(state, s);
      }
    } catch { localStorage.removeItem(KEY); }
  }

  function totals() {
    let home = 0, vis = 0;
    for (const h of state.hands) {
      if (h.side === "HOME") home += h.pts; else vis += h.pts;
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
    if (!state.started || state.finished) return;
    const p = toInt(pts);
    if (!Number.isFinite(p) || p <= 0) return;
    state.hands.push({ id: uid(), side, pts: p });
    save();
    render();
    const { home, vis } = totals();
    if (home >= state.config.target || vis >= state.config.target) finish();
  }

  function undo() {
    if (!state.hands.length) return;
    state.hands.pop();
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
    save();
    render();
  }

  // ── Numpad ──
  let npSide = null;
  let npVal  = "";

  function openNumpad(side) {
    if (!state.started || state.finished) return;
    npSide = side;
    npVal  = "";
    const N = names();
    const isHome = side === "HOME";
    $("npWho").textContent      = isHome ? N.home : N.vis;
    $("npDisp").textContent     = "—";
    $("npOk").style.background  = isHome ? "#F59E0B" : "#60A5FA";
    $("npOk").style.color       = "#000";
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
    $("npDisp").textContent = npVal;
  }

  function npBackspace() {
    npVal = npVal.slice(0, -1);
    $("npDisp").textContent = npVal || "—";
  }

  function npConfirm() {
    const p = toInt(npVal);
    if (!Number.isFinite(p) || p <= 0) return;
    addHand(npSide, p);
    closeNumpad();
  }

  function render() {
    const { home, vis } = totals();
    const N = names();

    // Screens first
    $("setup").style.display  = state.started                      ? "none" : "flex";
    $("game").style.display   = (state.started && !state.finished) ? "flex" : "none";
    $("winner").style.display = state.finished                     ? "flex" : "none";

    // Labels
    $("homeLabel").textContent = N.home;
    $("visLabel").textContent  = N.vis;
    $("homeTotal").textContent = home;
    $("visTotal").textContent  = vis;
    $("thHome").textContent    = N.home;
    $("thVis").textContent     = N.vis;
    $("handCount").textContent = `${state.hands.length} mano${state.hands.length !== 1 ? "s" : ""}`;

    // Leading
    const tapHome = $("tapHome");
    const tapVis  = $("tapVis");
    tapHome.classList.remove("leading", "winning");
    tapVis.classList.remove("leading", "winning");

    const leadBar = $("leadBar");
    if (state.started && !state.finished) {
      if (home > vis) {
        leadBar.textContent = `${N.home} arriba por ${home - vis} pts`;
        tapHome.classList.add("leading");
      } else if (vis > home) {
        leadBar.textContent = `${N.vis} arriba por ${vis - home} pts`;
        tapVis.classList.add("leading");
      } else {
        leadBar.textContent = home === 0 ? `Meta: ${state.config.target} puntos` : "Empate";
      }
      leadBar.style.display = "block";
    } else {
      leadBar.style.display = "none";
    }

    // Winner
    if (state.finished) {
      if (state.winner === "HOME") tapHome.classList.add("winning");
      else if (state.winner === "VISITORS") tapVis.classList.add("winning");
      const winName = state.winner === "HOME" ? N.home
                    : state.winner === "VISITORS" ? N.vis : null;
      $("wTrophy").textContent = state.winner === "TIE" ? "🤝" : "🏆";
      $("wWho").textContent    = state.winner === "TIE" ? "Empate" : `¡Ganó ${winName}!`;
      $("wPts").textContent    = `${home} — ${vis}`;
      $("wWho").style.color    = state.winner === "HOME"     ? "var(--home)"
                               : state.winner === "VISITORS" ? "var(--vis)" : "var(--muted)";
    }

    // History
    $("hist").style.display = state.hands.length > 0 ? "block" : "none";
    let runH = 0, runV = 0;
    const rows = state.hands.map((h, i) => {
      if (h.side === "HOME") runH += h.pts; else runV += h.pts;
      return { id: h.id, n: i + 1, side: h.side, pts: h.pts, rH: runH, rV: runV };
    });
    const tbody = $("hands");
    tbody.innerHTML = "";
    rows.slice().reverse().forEach(r => {
      const isHome = r.side === "HOME";
      tbody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${r.n}</td>
          <td><span class="dot ${isHome ? "home" : "vis"}"></span>${isHome ? N.home : N.vis}</td>
          <td><b>${r.pts}</b></td>
          <td>${r.rH}</td>
          <td>${r.rV}</td>
          <td class="td-acts">
            <button class="btn-row btn-row-edit" data-act="edit" data-id="${r.id}">✏</button>
            <button class="btn-row btn-row-del"  data-act="del"  data-id="${r.id}">✕</button>
          </td>
        </tr>
      `);
    });

    $("undo").disabled = state.hands.length === 0;
  }

  // Setup
  $("target").addEventListener("input", e => {
    e.target.value = e.target.value.replace(/[^\d]/g, "");
  });

  $("startGame").onclick = () => {
    state.config.homeName = $("homeName").value.trim();
    state.config.visName  = $("visName").value.trim();
    state.config.target   = Math.max(1, toInt($("target").value) || 200);
    state.started = true;
    save();
    render();
  };

  // Tapping the score card opens the numpad
  $("tapHome").onclick = () => openNumpad("HOME");
  $("tapVis").onclick  = () => openNumpad("VISITORS");

  // Numpad
  $("npOverlay").addEventListener("click", e => {
    if (e.target === $("npOverlay")) closeNumpad();
  });
  document.querySelectorAll(".nk[data-n]").forEach(btn => {
    btn.addEventListener("click", () => npInput(btn.dataset.n));
  });
  $("npBack").onclick = npBackspace;
  $("npOk").onclick   = npConfirm;

  // History
  $("hands").addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "edit") editHand(btn.dataset.id);
    if (btn.dataset.act === "del")  deleteHand(btn.dataset.id);
  });

  $("undo").onclick      = undo;
  $("finishNow").onclick = () => { if (state.started && !state.finished) finish(); };

  const resetGame = () => {
    if (confirm("¿Nueva partida? Se borra el marcador actual.")) {
      localStorage.removeItem(KEY);
      location.reload();
    }
  };
  $("reset").onclick   = resetGame;
  $("newGame").onclick = resetGame;

  load();
  render();
})();
