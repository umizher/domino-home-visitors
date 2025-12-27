(() => {
  const KEY = "domino_home_visitors_pro_simple_v1";

  const $ = (id)=>document.getElementById(id);
  const toInt = (v)=>{
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  };

  const state = {
    config: {
      h1:"", h2:"", v1:"", v2:"",
      mode: "target",     // "target" | "timer"
      target: 200,
      minutes: 30
    },
    timer: {
      running: false,
      startedAt: null,
      endsAt: null,
      paused: false,
      pausedAt: null,
      pausedMs: 0
    },
    hands: [],          // {id, n, side, pts, ts}
    finished: false,
    finishedReason: "",
    winner: null        // "HOME" | "VISITORS" | "TIE"
  };

  let tick = null;

  function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
  function load(){
    try{
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if(s && s.config && s.timer && Array.isArray(s.hands)){
        Object.assign(state, s);
      }
    }catch{}
  }

  function showMsg(t){
    const box = $("msg");
    box.style.display = "block";
    box.textContent = t;
    setTimeout(()=> box.style.display="none", 1600);
  }

  function setStatus(t){ $("status").textContent = "Estado: " + t; }

  function uid(){ return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16); }

  function totals(){
    let home = 0, vis = 0;
    for(const h of state.hands){
      if(h.side === "HOME") home += h.pts;
      else vis += h.pts;
    }
    return {home, vis};
  }

  function computeWinner(){
    const {home, vis} = totals();
    if(home > vis) return "HOME";
    if(vis > home) return "VISITORS";
    return "TIE";
  }

  function formatMMSS(ms){
    const total = Math.max(0, Math.floor(ms/1000));
    const m = Math.floor(total/60);
    const s = total%60;
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  // BEEP fuerte
  function loudBeep(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 880;
      g.gain.value = 0.6;
      o.connect(g); g.connect(ctx.destination);
      o.start();

      const t0 = ctx.currentTime;
      const beep = (start, end) => {
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.7, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, end);
      };
      beep(t0, t0 + 0.25);
      beep(t0 + 0.35, t0 + 0.60);
      beep(t0 + 0.70, t0 + 0.95);

      o.stop(t0 + 1.05);
      o.onended = () => ctx.close();
    }catch{}
  }
  function vibrate(){
    try{ if(navigator.vibrate) navigator.vibrate([300,120,300,120,500]); }catch{}
  }

  function finish(reason){
    if(state.finished) return;
    state.finished = true;
    state.finishedReason = reason;
    state.winner = computeWinner();
    stopTick();
    save();
    render();
    loudBeep(); vibrate();
    alert(`PARTIDA FINALIZADA ✅\nMotivo: ${reason}\nGanador: ${state.winner}`);
  }

  function reopenForCorrection(){
    state.finished = false;
    state.finishedReason = "";
    state.winner = null;
    // No reiniciamos timer automáticamente; si era modo tiempo, el árbitro decide START de nuevo.
    save();
    render();
    showMsg("Reabierta para corrección 🟡");
  }

  function stopTick(){
    if(tick) clearInterval(tick);
    tick = null;
  }

  function startTick(){
    stopTick();
    tick = setInterval(()=>{
      if(state.config.mode !== "timer") return;
      if(!state.timer.running) return;
      if(state.timer.paused) return;
      if(state.finished) return;

      const now = Date.now();
      const left = (state.timer.endsAt || now) - now;
      $("timerValue").textContent = formatMMSS(left);

      if(left <= 0){
        finish("Se terminó el tiempo");
      }
    }, 500);
  }

  function initTimerFromNow(){
    const mins = Math.max(1, toInt(state.config.minutes) || 30);
    const now = Date.now();
    state.timer.running = true;
    state.timer.paused = false;
    state.timer.pausedAt = null;
    state.timer.pausedMs = 0;
    state.timer.startedAt = now;
    state.timer.endsAt = now + mins*60*1000;
  }

  function pauseTimer(){
    if(!state.timer.running || state.timer.paused) return;
    state.timer.paused = true;
    state.timer.pausedAt = Date.now();
    save();
    render();
  }

  function resumeTimer(){
    if(!state.timer.running || !state.timer.paused) return;
    const now = Date.now();
    const pausedFor = now - (state.timer.pausedAt || now);
    state.timer.pausedMs += pausedFor;
    state.timer.endsAt += pausedFor;
    state.timer.paused = false;
    state.timer.pausedAt = null;
    save();
    render();
  }

  function canAddHands(){
    return !state.finished && started();
  }

  function started(){
    // "Partida iniciada" = se presionó START al menos una vez
    // Para modo meta, START también se usa (para estandarizar)
    return state._started === true;
  }

  function setStarted(v){
    state._started = v;
  }

  function setInputsLocked(locked){
    // Config fields
    ["h1","h2","v1","v2","target","minutes","modeTarget","modeTimer","saveConfig"].forEach(id=>{
      const el = $(id);
      if(!el) return;
      el.disabled = locked;
    });
  }

  function setGameButtons(){
    const startedFlag = started();
    const mode = state.config.mode;

    $("startGame").disabled = startedFlag && !state.finished; // ya empezó
    $("pauseGame").disabled = !(mode==="timer" && startedFlag && state.timer.running && !state.timer.paused && !state.finished);
    $("resumeGame").disabled = !(mode==="timer" && startedFlag && state.timer.running && state.timer.paused && !state.finished);

    $("reopen").style.display = state.finished ? "inline-flex" : "none";

    // timerBox visible solo si modo timer
    $("timerBox").style.display = (mode==="timer") ? "inline-flex" : "none";
  }

  function updateWinnerHint(){
    const {home, vis} = totals();

    let t = "";
    if(state.finished){
      const w = state.winner;
      const who = (w==="HOME") ? "🏠 GANÓ HOME" : (w==="VISITORS") ? "🚗 GANÓ VISITORS" : "🤝 EMPATE";
      t = `${who} • ${home} - ${vis} • ${state.finishedReason}`;
    } else {
      if(state.config.mode === "target"){
        const target = state.config.target || 200;
        t = `Meta ${target}. `;
      } else {
        t = `Modo tiempo (${state.config.minutes} min). `;
      }
      if(home>vis) t += `🏠 HOME arriba por ${home-vis}.`;
      else if(vis>home) t += `🚗 VISITORS arriba por ${vis-home}.`;
      else t += `Van empate.`;
      if(!started()) t += " (Pulsa START para comenzar)";
    }
    $("winnerHint").textContent = t;
  }

  function render(){
    // Fill config
    $("h1").value = state.config.h1;
    $("h2").value = state.config.h2;
    $("v1").value = state.config.v1;
    $("v2").value = state.config.v2;

    $("modeTarget").checked = (state.config.mode === "target");
    $("modeTimer").checked  = (state.config.mode === "timer");

    $("target").value = String(state.config.target ?? 200);
    $("minutes").value = String(state.config.minutes ?? 30);

    // Totals
    const {home, vis} = totals();
    $("homeTotal").textContent = String(home);
    $("visTotal").textContent = String(vis);
    $("handNo").textContent = String(state.hands.length);

    // Timer label
    if(state.config.mode === "timer"){
      const now = Date.now();
      const left = state.timer.running ? ((state.timer.endsAt || now) - now) : (state.config.minutes*60*1000);
      $("timerValue").textContent = formatMMSS(left);
    }

    // Inputs lock
    if(started() && !state.finished){
      // una vez iniciada la partida, bloquea config
      setInputsLocked(true);
    } else {
      setInputsLocked(false);
    }
    if(state.finished){
      // al finalizar, bloquea también sumar
      // pero el historial sigue visible (editar/borrar requiere reabrir)
      setInputsLocked(true);
    }

    setGameButtons();

    // Add buttons
    const addDisabled = !canAddHands();
    ["homePts","visPts","addHome","addVis","finishNow"].forEach(id=>{
      const el = $(id);
      if(el) el.disabled = addDisabled && id !== "finishNow"; // finishNow se permite si empezó
    });
    document.querySelectorAll("button.q").forEach(b=>b.disabled = addDisabled);

    // finishNow habilitado solo si empezó y no está finalizada
    $("finishNow").disabled = (!started() || state.finished);

    // History
    const tbody = $("hands");
    tbody.innerHTML = "";

    const {home:curH, vis:curV} = totals();

    // reconstruir totales progresivos para mostrar
    let runH = 0, runV = 0;
    const rows = state.hands.map((h, idx)=>{
      if(h.side==="HOME") runH += h.pts; else runV += h.pts;
      return {
        id: h.id,
        n: idx+1,
        side: h.side,
        pts: h.pts,
        homeTotal: runH,
        visTotal: runV,
        ts: h.ts
      };
    });

    // mostrar último arriba
    rows.slice().reverse().forEach(r=>{
      const badge = (r.side==="HOME")
        ? `<span class="badge home">HOME</span>`
        : `<span class="badge vis">VISITORS</span>`;

      const disabled = state.finished ? "disabled" : ""; // si terminó, deben reabrir para corregir
      tbody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${r.n}</td>
          <td>${badge}</td>
          <td><b>${r.pts}</b></td>
          <td>${r.homeTotal}</td>
          <td>${r.visTotal}</td>
          <td>${new Date(r.ts).toLocaleTimeString()}</td>
          <td style="white-space:nowrap;">
            <button class="secondary smallBtn" data-act="edit" data-id="${r.id}" ${disabled}>✏️</button>
            <button class="danger smallBtn" data-act="del" data-id="${r.id}" ${disabled}>🗑️</button>
          </td>
        </tr>
      `);
    });

    // status
    if(state.finished) setStatus("finalizada ✅");
    else if(!started()) setStatus("configura y pulsa START");
    else setStatus("en juego");

    updateWinnerHint();

    // tick
    if(state.config.mode === "timer" && state.timer.running && !state.timer.paused && !state.finished){
      startTick();
    } else {
      stopTick();
    }
  }

  function validateConfig(){
    state.config.h1 = $("h1").value.trim();
    state.config.h2 = $("h2").value.trim();
    state.config.v1 = $("v1").value.trim();
    state.config.v2 = $("v2").value.trim();

    state.config.mode = $("modeTimer").checked ? "timer" : "target";
    state.config.target = Math.max(1, toInt($("target").value) || 200);
    state.config.minutes = Math.max(1, toInt($("minutes").value) || 30);

    // sanitize input values
    $("target").value = String(state.config.target);
    $("minutes").value = String(state.config.minutes);
  }

  function addHand(side, pts){
    if(!canAddHands()) return;
    const p = toInt(pts);
    if(!Number.isFinite(p) || p<=0) return alert("Pon puntos válidos (>0).");

    state.hands.push({
      id: uid(),
      n: state.hands.length + 1,
      side,
      pts: p,
      ts: Date.now()
    });

    save();
    render();

    // condición de meta
    if(state.config.mode === "target"){
      const {home, vis} = totals();
      const target = state.config.target || 200;
      if(home >= target || vis >= target){
        finish(`Llegaron a ${target}+`);
      }
    }
  }

  function editHand(id){
    const idx = state.hands.findIndex(h=>h.id===id);
    if(idx < 0) return;

    const h = state.hands[idx];

    const side = prompt('Equipo (HOME o VISITORS):', h.side);
    if(side === null) return;
    const newSide = String(side).trim().toUpperCase();
    if(newSide !== "HOME" && newSide !== "VISITORS"){
      alert("Escribe HOME o VISITORS.");
      return;
    }

    const pts = prompt("Puntos:", String(h.pts));
    if(pts === null) return;
    const newPts = toInt(pts);
    if(!Number.isFinite(newPts) || newPts<=0){
      alert("Puntos inválidos.");
      return;
    }

    h.side = newSide;
    h.pts = newPts;
    save();
    render();

    // Si modo meta y ya pasó meta, puede finalizar; si no, se mantiene en juego.
    if(state.config.mode === "target" && !state.finished){
      const {home, vis} = totals();
      const target = state.config.target || 200;
      if(home >= target || vis >= target){
        finish(`Llegaron a ${target}+ (por corrección)`);
      }
    }
  }

  function deleteHand(id){
    const idx = state.hands.findIndex(h=>h.id===id);
    if(idx < 0) return;
    if(!confirm("¿Borrar esta mano?")) return;
    state.hands.splice(idx, 1);
    save();
    render();
  }

  // ====== UI events ======
  $("saveConfig").onclick = ()=>{
    if(started() && !state.finished){
      alert("Ya empezó la partida. (Si quieres cambiar config, resetea).");
      return;
    }
    validateConfig();
    save();
    showMsg("Configuración guardada ✅");
    render();
  };

  $("modeTarget").addEventListener("change", ()=>{
    if(started() && !state.finished) return;
    state.config.mode = "target";
    save(); render();
  });
  $("modeTimer").addEventListener("change", ()=>{
    if(started() && !state.finished) return;
    state.config.mode = "timer";
    save(); render();
  });

  // sanitize target/minutes input
  ["target","minutes"].forEach(id=>{
    $(id).addEventListener("input", (e)=>{
      e.target.value = e.target.value.replace(/[^\d]/g,"");
    });
  });

  $("startGame").onclick = ()=>{
    if(state.finished) return;
    validateConfig();
    setStarted(true);

    if(state.config.mode === "timer"){
      initTimerFromNow();
      startTick();
    }
    save();
    showMsg("Partida iniciada ▶️");
    render();
  };

  $("pauseGame").onclick = ()=>{ pauseTimer(); showMsg("Pausa ⏸️"); render(); };
  $("resumeGame").onclick = ()=>{ resumeTimer(); showMsg("Reanudado ▶️"); render(); };

  $("reopen").onclick = ()=>{
    if(!state.finished) return;
    reopenForCorrection();
  };

  $("addHome").onclick = ()=>{
    const v = $("homePts").value;
    $("homePts").value = "";
    addHand("HOME", v);
  };
  $("addVis").onclick = ()=>{
    const v = $("visPts").value;
    $("visPts").value = "";
    addHand("VISITORS", v);
  };

  // Quick buttons
  document.addEventListener("click", (e)=>{
    const qb = e.target.closest("button.q");
    if(qb){
      addHand(qb.dataset.side, qb.dataset.add);
      return;
    }

    const act = e.target.closest("button[data-act]");
    if(act){
      const id = act.dataset.id;
      const action = act.dataset.act;

      // si terminó, obligamos reabrir
      if(state.finished){
        alert("La partida está finalizada. Pulsa “Reabrir para corregir”.");
        return;
      }

      if(action === "edit") editHand(id);
      if(action === "del") deleteHand(id);
    }
  });

  $("finishNow").onclick = ()=>{
    if(!started() || state.finished) return;
    finish("Finalizado manualmente");
  };

  $("exportCsv").onclick = ()=>{
    const {home, vis} = totals();
    const lines = [];
    lines.push("Domino Home vs Visitors");
    lines.push(`Home,${state.config.h1} + ${state.config.h2}`);
    lines.push(`Visitors,${state.config.v1} + ${state.config.v2}`);
    lines.push(`Mode,${state.config.mode}`);
    lines.push(`Target,${state.config.target}`);
    lines.push(`Minutes,${state.config.minutes}`);
    lines.push(`Finished,${state.finished ? "yes" : "no"}`);
    lines.push(`Winner,${state.winner || ""}`);
    lines.push(`FinalScore,${home}-${vis}`);
    lines.push("");

    lines.push("hand,side,points,time");
    state.hands.forEach((h, i)=>{
      lines.push([i+1,h.side,h.pts,new Date(h.ts).toISOString()].join(","));
    });

    const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "domino-home-visitors.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  $("reset").onclick = ()=>{
    if(!confirm("¿Reset total? (borra todo)")) return;
    localStorage.removeItem(KEY);
    location.reload();
  };

  // ====== Init ======
  load();
  if(state._started !== true) state._started = false;
  render();
})();
