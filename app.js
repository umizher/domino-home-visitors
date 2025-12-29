(() => {
  const KEY = "domino_home_visitors_simple_v3";

  const $ = (id)=>document.getElementById(id);
  const toInt = (v)=>{
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  };
  const uid = ()=> Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);

  const state = {
    config: {
      homeName: "",
      visName: "",
      target: 200,
      timerEnabled: false,
      minutes: 30
    },
    timer: {
      running: false,
      startedAt: null,
      endsAt: null,
      paused: false,
      pausedAt: null
    },
    hands: [],
    started: false,
    finished: false,
    finishedReason: "",
    winner: null
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

  function stopTick(){
    if(tick) clearInterval(tick);
    tick = null;
  }

  function startTick(){
    stopTick();
    tick = setInterval(()=>{
      if(!state.config.timerEnabled) return;
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
    state.timer.startedAt = now;
    state.timer.endsAt = now + mins*60*1000;
  }

  function pauseTimer(){
    if(!state.timer.running || state.timer.paused) return;
    state.timer.paused = true;
    state.timer.pausedAt = Date.now();
  }

  function resumeTimer(){
    if(!state.timer.running || !state.timer.paused) return;
    const now = Date.now();
    const pausedFor = now - (state.timer.pausedAt || now);
    state.timer.endsAt += pausedFor;
    state.timer.paused = false;
    state.timer.pausedAt = null;
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
    save();
    render();
    showMsg("Reabierta para corregir 🟡");
  }

  function validateConfig(){
    state.config.homeName = $("homeName").value.trim();
    state.config.visName  = $("visName").value.trim();

    state.config.target = Math.max(1, toInt($("target").value) || 200);

    state.config.timerEnabled = $("enableTimer").checked === true;

    // ✅ minutos SIEMPRE editables; si está vacío, vuelve a 30
    const m = toInt($("minutes").value);
    state.config.minutes = Math.max(1, Number.isFinite(m) ? m : (state.config.minutes || 30));

    $("target").value = String(state.config.target);
    $("minutes").value = String(state.config.minutes);
  }

  function labels(){
    const home = state.config.homeName ? `🏠 ${state.config.homeName}` : "🏠 HOME";
    const vis  = state.config.visName  ? `🚗 ${state.config.visName}`  : "🚗 VISITORS";
    return {home, vis};
  }

  function canEditConfig(){
    return !state.started || state.finished;
  }

  function canAddHands(){
    return state.started && !state.finished;
  }

  function addHand(side, pts){
    if(!canAddHands()) return;

    const p = toInt(pts);
    if(!Number.isFinite(p) || p <= 0) return alert("Pon puntos válidos (>0).");

    state.hands.push({ id: uid(), n: state.hands.length+1, side, pts:p, ts: Date.now() });
    save();
    render();

    const {home, vis} = totals();
    const target = state.config.target || 200;
    if(home >= target || vis >= target){
      finish(`Llegaron a ${target}+`);
      return;
    }
  }

  function editHand(id){
    const idx = state.hands.findIndex(h=>h.id===id);
    if(idx < 0) return;
    const h = state.hands[idx];

    const side = prompt("Equipo (HOME o VISITORS):", h.side);
    if(side === null) return;
    const s = String(side).trim().toUpperCase();
    if(s !== "HOME" && s !== "VISITORS") return alert("Escribe HOME o VISITORS.");

    const pts = prompt("Puntos:", String(h.pts));
    if(pts === null) return;
    const p = toInt(pts);
    if(!Number.isFinite(p) || p<=0) return alert("Puntos inválidos (>0).");

    h.side = s;
    h.pts = p;

    save();
    render();

    if(!state.finished){
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

  function setControls(){
    const cfgDisabled = !canEditConfig();
    ["homeName","visName","target","enableTimer","minutes","saveConfig"].forEach(id=>{
      $(id).disabled = cfgDisabled;
    });

    $("startGame").disabled = state.started && !state.finished;
    $("pauseGame").disabled = !(state.config.timerEnabled && state.timer.running && !state.timer.paused && state.started && !state.finished);
    $("resumeGame").disabled = !(state.config.timerEnabled && state.timer.running && state.timer.paused && state.started && !state.finished);

    $("timerBox").style.display = (state.config.timerEnabled) ? "inline-flex" : "none";

    const addDisabled = !canAddHands();
    ["homePts","visPts","addHome","addVis"].forEach(id=> $(id).disabled = addDisabled);

    $("finishNow").disabled = !(state.started && !state.finished);
    $("reopen").style.display = state.finished ? "inline-flex" : "none";
  }

  function updateWinnerHint(){
    const {home, vis} = totals();
    const target = state.config.target || 200;

    let t = "";
    if(state.finished){
      const w = state.winner;
      const who = (w==="HOME") ? "🏠 GANÓ HOME" : (w==="VISITORS") ? "🚗 GANÓ VISITORS" : "🤝 EMPATE";
      t = `${who} • ${home} - ${vis} • ${state.finishedReason}`;
    } else {
      t = `Meta ${target}+ siempre. `;
      if(state.config.timerEnabled) t += `Tiempo: ${state.config.minutes} min (lo que ocurra primero). `;
      else t += `Tiempo: apagado (pero puedes dejar minutos listos). `;
      if(!state.started) t += "(Pulsa START)";
      else {
        if(home>vis) t += `🏠 HOME arriba por ${home-vis}.`;
        else if(vis>home) t += `🚗 VISITORS arriba por ${vis-home}.`;
        else t += "Van empate.";
      }
    }
    $("winnerHint").textContent = t;
  }

  function render(){
    $("homeName").value = state.config.homeName;
    $("visName").value  = state.config.visName;
    $("target").value = String(state.config.target ?? 200);

    $("enableTimer").checked = state.config.timerEnabled === true;
    $("minutes").value = String(state.config.minutes ?? 30);

    const L = labels();
    $("homeLabel").textContent = L.home;
    $("visLabel").textContent  = L.vis;
    $("homeCardTitle").textContent = L.home;
    $("visCardTitle").textContent  = L.vis;

    const {home, vis} = totals();
    $("homeTotal").textContent = String(home);
    $("visTotal").textContent  = String(vis);
    $("handNo").textContent    = String(state.hands.length);

    if(state.config.timerEnabled){
      const now = Date.now();
      const left = state.timer.running ? ((state.timer.endsAt || now) - now) : (state.config.minutes*60*1000);
      $("timerValue").textContent = formatMMSS(left);
    }

    let runH = 0, runV = 0;
    const rows = state.hands.map((h, i)=>{
      if(h.side==="HOME") runH += h.pts; else runV += h.pts;
      return { id:h.id, n:i+1, side:h.side, pts:h.pts, homeTotal:runH, visTotal:runV, ts:h.ts };
    });

    const tbody = $("hands");
    tbody.innerHTML = "";
    rows.slice().reverse().forEach(r=>{
      const badge = (r.side==="HOME")
        ? `<span class="badge home">HOME</span>`
        : `<span class="badge vis">VISITORS</span>`;

      const disabled = state.finished ? "disabled" : "";

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

    if(state.finished) setStatus("finalizada ✅");
    else if(!state.started) setStatus("configura y pulsa START");
    else setStatus("en juego");

    setControls();
    updateWinnerHint();

    if(state.config.timerEnabled && state.timer.running && !state.timer.paused && state.started && !state.finished){
      startTick();
    } else {
      stopTick();
    }
  }

  // sanitize numeric fields (pero deja editar normal)
  ["target","minutes"].forEach(id=>{
    $(id).addEventListener("input", (e)=>{
      e.target.value = e.target.value.replace(/[^\d]/g,"");
    });
  });

  $("saveConfig").onclick = ()=>{
    if(!canEditConfig()) return;
    validateConfig();
    save();
    showMsg("Guardado ✅");
    render();
  };

  $("startGame").onclick = ()=>{
    if(state.finished) return;
    validateConfig();
    state.started = true;

    if(state.config.timerEnabled){
      initTimerFromNow();
      startTick();
    } else {
      state.timer.running = false;
      state.timer.paused = false;
      state.timer.startedAt = null;
      state.timer.endsAt = null;
    }

    save();
    showMsg("Partida iniciada ▶️");
    render();
  };

  $("pauseGame").onclick = ()=>{
    pauseTimer(); save();
    showMsg("Pausa ⏸️");
    render();
  };

  $("resumeGame").onclick = ()=>{
    resumeTimer(); save();
    showMsg("Reanudado ▶️");
    render();
  };

  $("reopen").onclick = ()=> reopenForCorrection();

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

  document.addEventListener("click", (e)=>{
    const btn = e.target.closest("button[data-act]");
    if(!btn) return;

    if(state.finished){
      alert("La partida terminó. Pulsa “Reabrir para corregir”.");
      return;
    }
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if(act === "edit") editHand(id);
    if(act === "del") deleteHand(id);
  });

  $("finishNow").onclick = ()=>{
    if(!state.started || state.finished) return;
    finish("Finalizado manualmente");
  };

  $("exportCsv").onclick = ()=>{
    const {home, vis} = totals();
    const L = labels();

    const lines = [];
    lines.push("Domino Home vs Visitors");
    lines.push(`HomeLabel,${L.home.replace("🏠 ","")}`);
    lines.push(`VisitorsLabel,${L.vis.replace("🚗 ","")}`);
    lines.push(`Target,${state.config.target}`);
    lines.push(`TimerEnabled,${state.config.timerEnabled ? "yes":"no"}`);
    lines.push(`Minutes,${state.config.minutes}`);
    lines.push(`Started,${state.started ? "yes":"no"}`);
    lines.push(`Finished,${state.finished ? "yes":"no"}`);
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

  // Init
  load();
  render();
})();
