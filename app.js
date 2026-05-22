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
      if (s && s.config && Array.isArray(s.hands)) Object.assign(state, s);
    } catch {}
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
      vis: state.config.visName || "VISITORS"
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
    if (!Number.isFinite(p) || p <= 0) { alert("Pon puntos válidos (> 0)."); return; }
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

  function render() {
    const { home, vis } = totals();
    const N = names();
    const target = state.config.target;

    $("homeLabel").textContent = N.home;
    $("visLabel").textContent = N.vis;
    $("homeTotal").textContent = home;
    $("visTotal").textContent = vis;
    $("handCount").textContent = `#${state.hands.length}`;
    $("homeBadge").textContent = N.home;
    $("visBadge").textContent = N.vis;
    $("thHome").textContent = N.home;
    $("thVis").textContent = N.vis;

    const cardHome = $("cardHome");
    const cardVis = $("cardVis");
    cardHome.classList.remove("leading", "winning");
    cardVis.classList.remove("leading", "winning");

    if (state.finished) {
      if (state.winner === "HOME") cardHome.classList.add("winning");
      else if (state.winner === "VISITORS") cardVis.classList.add("winning");
    } else if (state.started) {
      if (home > vis) cardHome.classList.add("leading");
      else if (vis > home) cardVis.classList.add("leading");
    }

    const bar = $("winnerBar");
    if (state.started && !state.finished) {
      if (home > vis) bar.textContent = `${N.home} arriba por ${home - vis} pts`;
      else if (vis > home) bar.textContent = `${N.vis} arriba por ${vis - home} pts`;
      else if (home === 0) bar.textContent = `Meta: ${target} puntos`;
      else bar.textContent = "Empate";
      bar.style.display = "block";
    } else {
      bar.style.display = "none";
    }

    $("configSection").style.display = state.started ? "none" : "block";
    $("gameSection").style.display = (state.started && !state.finished) ? "block" : "none";
    $("winnerSection").style.display = state.finished ? "block" : "none";
    $("histSection").style.display = state.hands.length > 0 ? "block" : "none";

    if (state.finished) {
      const winName = state.winner === "HOME" ? N.home : state.winner === "VISITORS" ? N.vis : null;
      $("winnerEmoji").textContent = state.winner === "TIE" ? "🤝" : "🏆";
      $("winnerText").textContent = state.winner === "TIE"
        ? `Empate ${home} - ${vis}`
        : `¡Ganó ${winName}! ${home} - ${vis}`;
    }

    let runH = 0, runV = 0;
    const rows = state.hands.map((h, i) => {
      if (h.side === "HOME") runH += h.pts; else runV += h.pts;
      return { n: i + 1, side: h.side, pts: h.pts, homeTotal: runH, visTotal: runV };
    });
    const tbody = $("hands");
    tbody.innerHTML = "";
    rows.slice().reverse().forEach(r => {
      const cls = r.side === "HOME" ? "badge home" : "badge vis";
      const name = r.side === "HOME" ? N.home : N.vis;
      tbody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${r.n}</td>
          <td><span class="${cls}">${name}</span></td>
          <td><b>${r.pts}</b></td>
          <td>${r.homeTotal}</td>
          <td>${r.visTotal}</td>
        </tr>
      `);
    });

    $("undo").disabled = state.hands.length === 0;
  }

  $("target").addEventListener("input", e => {
    e.target.value = e.target.value.replace(/[^\d]/g, "");
  });

  $("startGame").onclick = () => {
    state.config.homeName = $("homeName").value.trim();
    state.config.visName = $("visName").value.trim();
    state.config.target = Math.max(1, toInt($("target").value) || 200);
    state.started = true;
    save();
    render();
  };

  $("addHome").onclick = () => {
    const v = $("homePts").value;
    $("homePts").value = "";
    addHand("HOME", v);
    $("homePts").focus();
  };

  $("addVis").onclick = () => {
    const v = $("visPts").value;
    $("visPts").value = "";
    addHand("VISITORS", v);
    $("visPts").focus();
  };

  $("homePts").addEventListener("keydown", e => { if (e.key === "Enter") $("addHome").click(); });
  $("visPts").addEventListener("keydown", e => { if (e.key === "Enter") $("addVis").click(); });

  $("undo").onclick = undo;

  $("finishNow").onclick = () => {
    if (state.started && !state.finished) finish();
  };

  const resetGame = () => {
    if (confirm("¿Nueva partida? Se borra el marcador actual.")) {
      localStorage.removeItem(KEY);
      location.reload();
    }
  };
  $("newGame").onclick = resetGame;
  $("reset").onclick = resetGame;

  load();
  render();
})();
