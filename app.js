(() => {
  const KEY = "domino_home_visitors_final";

  const $ = id => document.getElementById(id);
  const toInt = v => {
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  };

  const state = {
    config: {
      h1: "", h2: "",
      v1: "", v2: "",
      target: 200,
      useTimer: false,
      minutes: 30
    },
    timer: {
      running: false,
      endsAt: null
    },
    started: false,
    finished: false,
    hands: [] // {side, pts, ts}
  };

  let tick = null;

  /* ---------- Utils ---------- */
  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s) Object.assign(state, s);
    } catch {}
  }

  function totals() {
    let home = 0, vis = 0;
    state.hands.forEach(h => {
      if (h.side === "HOME") home += h.pts;
      else vis += h.pts;
    });
    return { home, vis };
  }

  function formatMMSS(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.type = "square";
      g.gain.value = 0.6;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 900);
    } catch {}
  }

  /* ---------- Game Flow ---------- */
  function finish(reason) {
    if (state.finished) return;
    state.finished = true;
    stopTimer();
    save();
    render();
    beep();
    alert(`PARTIDA FINALIZADA\n${reason}`);
  }

  function startTimerIfNeeded() {
    if (!state.config.useTimer) return;
    const mins = Math.max(1, toInt(state.config.minutes) || 30);
    state.timer.running = true;
    state.timer.endsAt = Date.now() + mins * 60000;

    stopTimer();
    tick = setInterval(() => {
      if (state.finished) return;
      if (Date.now() >= state.timer.endsAt) {
        finish("Tiempo terminado");
      } else {
        renderTimer();
      }
    }, 500);
  }

  function stopTimer() {
    if (tick) clearInterval(tick);
    tick = null;
  }

  function renderTimer() {
    if (!state.config.useTimer) {
      $("timerBox").style.display = "none";
      return;
    }
    $("timerBox").style.display = "inline-block";
    $("timerValue").textContent =
      formatMMSS(state.timer.endsAt - Date.now());
  }

  function addHand(side, pts) {
    if (!state.started || state.finished) return;
    const p = toInt(pts);
    if (!Number.isFinite(p) || p <= 0) return alert("Puntos inválidos");

    state.hands.push({ side, pts: p, ts: Date.now() });
    save();
    render();

    const { home, vis } = totals();
    if (home >= state.config.target || vis >= state.config.target) {
      finish("Meta alcanzada (200+)");
    }
  }

  /* ---------- Render ---------- */
  function render() {
    const { home, vis } = totals();

    $("homeTotal").textContent = home;
    $("visTotal").textContent = vis;
    $("handNo").textContent = state.hands.length;

    renderTimer();

    $("winnerHint").textContent =
      state.finished
        ? "PARTIDA FINALIZADA"
        : state.started
        ? home > vis
          ? `HOME arriba por ${home - vis}`
          : vis > home
          ? `VISITORS arriba por ${vis - home}`
          : "Empate"
        : "Configura y presiona START";

    const tbody = $("hands");
    tbody.innerHTML = "";
    state.hands.slice().reverse().forEach((h, i) => {
      tbody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${state.hands.length - i}</td>
          <td>${h.side}</td>
          <td>${h.pts}</td>
          <td>${home}</td>
          <td>${vis}</td>
          <td>${new Date(h.ts).toLocaleTimeString()}</td>
        </tr>
      `);
    });
  }

  /* ---------- Events ---------- */
  $("startGame").onclick = () => {
    if (state.started) return;
    state.started = true;
    state.config.useTimer = $("useTimer").checked;
    state.config.minutes = toInt($("minutes").value) || 30;
    state.config.target = toInt($("target").value) || 200;
    save();
    startTimerIfNeeded();
    render();
  };

  $("addHome").onclick = () => {
    addHand("HOME", $("homePts").value);
    $("homePts").value = "";
  };

  $("addVis").onclick = () => {
    addHand("VISITORS", $("visPts").value);
    $("visPts").value = "";
  };

  $("reset").onclick = () => {
    if (!confirm("¿Borrar todo?")) return;
    localStorage.removeItem(KEY);
    location.reload();
  };

  /* ---------- Init ---------- */
  load();
  render();
})();
