// 🔗 Integrated teaching: suggested pairs of related lessons across grades 5 and 6 (data/integration.json).
// Suggestions only — the teacher decides when to use one. The teacher plan shows the ones that fit the day.
const INTEG_SUBJ = ["ریاضی", "فارسی", "علوم", "مطالعات اجتماعی", "هدیه‌های آسمان"];

function sideStatus(s) {
  if (s.status === "current") return "▶️ همین الان";
  if (s.status === "done") return `✅ ${fa(-s.distance)} درس قبل تدریس شد`;
  return `⏳ ${fa(s.distance)} درس بعد`;
}

function integCard(p, open = false) {
  const side = s => `<div class="ig-side g${s.grade}">
      <b>پایه ${fa(s.grade)} · ${esc(s.subject)}</b> <span class="hint">${esc(s.chapter_title)}</span>
      <div class="title">${esc(s.title)} <small>(ص ${fa(s.pages)})</small></div>
      <div class="hint">${sideStatus(s)}</div></div>`;
  return `<details class="ig-card ${p.near ? "near" : ""}" data-id="${p.id}" ${open ? "open" : ""}>
    <summary><span class="ig-theme">🔗 ${esc(p.theme)}</span>
      <span class="badge ${p.kind === "هم‌مفهوم" ? "joint" : "conf"}">${esc(p.kind)}</span>
      ${p.near ? `<span class="badge near">📍 نزدیک به جای فعلی کلاس</span>` : ""}
      <span class="ig-mini">${esc(p.a.subject)} ${fa(p.a.grade)} ↔ ${esc(p.b.subject)} ${fa(p.b.grade)}</span></summary>
    <div class="ig-sides">${side(p.a)}${side(p.b)}</div>
    <div class="kv"><b>🎬 شروع مشترک:</b> ${esc(p.hook)}</div>
    <ol class="timing">${p.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
    <div class="kv note"><b>🏆 پایان مشترک / مسابقه:</b> ${esc(p.joint)}</div>
    <p class="hint">💡 لازم نیست هر دو درس دقیقاً امروز باشند؛ یک درس را کمی جلوتر یا عقب‌تر بیاورید، یا درس قبلی را مرور کنید.
      برای اجرا می‌توانید از «✏️ تغییر برنامه همین روز» دو زنگ را کنار هم بگذارید.</p>
  </details>`;
}

// ------------------------------------------------------------ the tab
document.querySelector('[data-tab="integ"]').addEventListener("click", () => renderInteg());

function renderInteg(focusId) {
  const el = $("#tab-integ");
  if (!el.dataset.ready) {
    el.innerHTML = `
      <p class="hint">پیشنهادهای <b>تدریس تلفیقی</b>: درس‌هایی از پایه ۵ و ۶ (ریاضی، فارسی، علوم، اجتماعی، هدیه) که مفهوم یا موضوع مشترک دارند
        و می‌شود در یک زنگ با هم درس داد: یک پایه درس می‌گیرد و پایه دیگر گوش می‌دهد، بعد جابه‌جا، و در پایان یک فعالیت یا مسابقه مشترک.
        «📍 نزدیک» یعنی هر دو درس در چند درسِ اطراف جای فعلی کلاس‌اند.</p>
      <div class="filters no-print">
        <input id="igSearch" type="search" placeholder="🔎 جستجو (مثلاً دوستی، کسر، آب)">
        <select id="igSubj"><option value="">همه درس‌ها</option>${INTEG_SUBJ.map(s => `<option>${s}</option>`).join("")}</select>
        <select id="igKind"><option value="">هر دو نوع</option><option>هم‌مفهوم</option><option>هم‌موضوع</option></select>
        <label><input type="checkbox" id="igNear"> فقط نزدیک به جای فعلی</label>
        <button id="igPrint" class="ghost">🖨️ چاپ فهرست</button>
        <span id="igCount" class="hint"></span>
      </div>
      <div id="igList"></div>`;
    el.dataset.ready = 1;
    ["igSearch", "igSubj", "igKind", "igNear"].forEach(id => $("#" + id).addEventListener("input", () => drawInteg()));
    $("#igPrint").onclick = () => { el.querySelectorAll("details").forEach(d => d.open = true); printTab("integ"); };
  }
  drawInteg(focusId);
}

async function drawInteg(focusId) {
  const all = await api(`/api/integration?date=${DAY ? DAY.date : ""}`);
  const q = $("#igSearch").value.trim(), s = $("#igSubj").value, k = $("#igKind").value, near = $("#igNear").checked;
  const rows = all.filter(p => (!s || p.a.subject === s || p.b.subject === s) && (!k || p.kind === k) && (!near || p.near) &&
    (!q || [p.theme, p.hook, p.joint, p.a.title, p.b.title].some(x => String(x).includes(q))))
    .sort((x, y) => (y.near - x.near) || (Math.abs(x.a.distance) + Math.abs(x.b.distance)) - (Math.abs(y.a.distance) + Math.abs(y.b.distance)));
  $("#igCount").textContent = `${fa(rows.length)} پیشنهاد · ${fa(rows.filter(p => p.near).length)} نزدیک`;
  $("#igList").innerHTML = rows.map(p => integCard(p, p.id === focusId)).join("") || `<div class="closed">موردی پیدا نشد.</div>`;
  if (focusId !== undefined) { const c = $(`#igList [data-id="${focusId}"]`); if (c) c.scrollIntoView({ behavior: "smooth" }); }
}

// ------------------------------------------------------------ hint in the teacher plan
function integHint() {
  if (!DAY || DAY.closed) return "";
  const list = Store.planner.integrationFor(DAY);
  if (!list.length) return "";
  return `<div class="ig-hint no-print"><b>💡 پیشنهاد تدریس تلفیقی:</b> درس امروز به درسی از پایه دیگر نزدیک است.
    ${list.map(p => `<button class="ghost ig-go" data-id="${p.id}">🔗 ${esc(p.theme)}: ${esc(p.a.subject)} ${fa(p.a.grade)} ↔ ${esc(p.b.subject)} ${fa(p.b.grade)}</button>`).join("")}</div>`;
}
function bindIntegHint() {
  document.querySelectorAll(".ig-go").forEach(b => b.onclick = () => {
    document.querySelector('[data-tab="integ"]').click();
    $("#igNear").checked = false;
    renderInteg(Number(b.dataset.id));
  });
}
