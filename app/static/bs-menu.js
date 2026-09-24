// Bulletproof menu router — first script loaded, defines window.bsGo before anything else.
window.bsGo = function (name) {
  console.log("[bsGo]", name);
  var m = document.getElementById("avatarMenu");
  if (m) m.classList.remove("open");
  if (name === "logout") {
    if (confirm("Cancellare tutti i dati locali?")) { localStorage.clear(); location.reload(); }
    return;
  }
  var opener = window.openPage;
  if (typeof opener === "function") {
    try { opener(name); return; } catch (e) { console.error("openPage failed:", e); }
  }
  // Always-visible fallback overlay
  var titles = {
    profile: "Il mio profilo",
    settings: "Impostazioni",
    history: "Storico analisi",
    privacy: "Privacy e dati"
  };
  var back = document.createElement("div");
  back.style.cssText = "position:fixed;inset:0;background:rgba(10,0,30,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,sans-serif;";
  var card = document.createElement("div");
  card.style.cssText = "background:#fff;border-radius:20px;padding:40px;max-width:520px;width:100%;box-shadow:0 30px 80px rgba(0,0,0,0.4);";
  var h = document.createElement("h2");
  h.textContent = titles[name] || name;
  h.style.cssText = "margin:0 0 16px;font-family:Fraunces,serif;font-size:26px;color:#0a0022;";
  var p = document.createElement("p");
  p.textContent = "Questa è la pagina '" + name + "'. In modalità demo mostra un placeholder — la versione ricca si attiva se pages-shim.js viene caricato correttamente.";
  p.style.cssText = "color:#6b7280;line-height:1.6;margin:0 0 24px;font-size:15px;";
  var btn = document.createElement("button");
  btn.textContent = "Chiudi";
  btn.style.cssText = "padding:10px 22px;background:linear-gradient(135deg,#A100FF,#F472B6);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:500;";
  btn.onclick = function () { back.remove(); };
  card.appendChild(h);
  card.appendChild(p);
  card.appendChild(btn);
  back.appendChild(card);
  back.addEventListener("click", function (e) { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
};

window.bsToggleMenu = function () {
  var m = document.getElementById("avatarMenu");
  if (m) m.classList.toggle("open");
};

document.addEventListener("click", function (e) {
  var m = document.getElementById("avatarMenu");
  var w = document.getElementById("userMenuWrap");
  if (m && w && !w.contains(e.target)) m.classList.remove("open");
});

console.log("[bs-menu] ready — window.bsGo defined");
