// 🗓️ Weekly timetable (view / print / edit from a date on) and ✏️ one-day changes of the plan.
// A period is either one subject for both grades, or a «محور» period: different subjects, ⭐ = the grade the teacher teaches.
const subjOptions = sel => Store.planner.SUBJECTS.map(s =>
  `<option value="${s.code}" ${s.code === sel ? "selected" : ""}>${esc(s.name)}</option>`).join("");

// what kind of period this is — shown as a tag under the cell and on the printed poster
function slotTag(raw) {
  const P = Store.planner, s = P.slotOf(raw);
  if (!s.lead) return P.isConf(s[5]) ? ["conf", "🎤 کنفرانس"] : P.isJoint(s[5]) ? ["joint", "🤝 همه با هم"] : ["rot", "🔄 نیم‌زنگ چرخشی"];
  const o = s.lead === 5 ? 6 : 5;
  return P.isConf(s[o]) ? ["prep", `🧩 پایه ${fa(o)}: آماده‌سازی کنفرانس`] : ["indep", `🧩 پایه ${fa(o)}: کار مستقل`];
}

// editor for one period: a subject per grade; when they differ, tap ⭐ beside the grade the teacher stays with
function slotEditor(raw) {
  const s = Store.planner.slotOf(raw), [cls, tag] = slotTag(raw);
  const row = g => `<div class="sl-row g${g}">
      <button type="button" class="star ${s.lead === g ? "on" : ""}" data-g="${g}" title="معلم کل زنگ با پایه ${fa(g)}">⭐</button>
      <span class="gl">${fa(g)}</span><select class="s${g}">${subjOptions(s[g])}</select></div>`;
  return `<div class="slot ${s.lead ? "split" : ""}" data-lead="${s.lead || ""}">${row(5)}${row(6)}
    <div class="sl-tag ${cls}">${tag}</div></div>`;
}
const HEAVY = ["Olom", "Farsi", "Riazi"];
function readSlot(div) {
  const a = $(".s5", div).value, b = $(".s6", div).value;
  return a === b ? a : { 5: a, 6: b, lead: Number(div.dataset.lead) || 5 };
}
function bindSlots(root, onChange = () => {}) {
  root.querySelectorAll(".slot").forEach(div => {
    const refresh = () => {
      const raw = readSlot(div), [cls, tag] = slotTag(raw), split = typeof raw !== "string";
      div.classList.toggle("split", split);
      div.querySelectorAll(".star").forEach(b => b.classList.toggle("on", split && Number(div.dataset.lead) === Number(b.dataset.g)));
      const t = $(".sl-tag", div); t.className = "sl-tag " + cls; t.textContent = tag;
      onChange();
    };
    div.querySelectorAll("select").forEach(sel => sel.onchange = () => {
      const a = $(".s5", div).value, b = $(".s6", div).value;
      if (a !== b && !div.dataset.lead)  // newly split: guess who needs the teacher
        div.dataset.lead = HEAVY.includes(b) && !HEAVY.includes(a) ? 6 : 5;
      if (a === b) div.dataset.lead = "";
      refresh();
    });
    div.querySelectorAll(".star").forEach(b => b.onclick = () => { div.dataset.lead = b.dataset.g; refresh(); });
  });
}

// ------------------------------------------------------------ printable poster (child-friendly themes → PDF / picture)
const POSTER_THEMES = { rainbow: "🌈 رنگین‌کمان", space: "🚀 فضایی", garden: "🌻 باغچه" };
// who: "teacher" (both grades, ⭐/🧩 roles) or 5 / 6 (that grade's own subjects only; only conference days are marked)
function posterHTML(days, from, theme, who = "teacher") {
  const P = Store.planner, em = c => EMOJI[P.faName(c)] || "📌";
  const student = who !== "teacher", gName = who == 5 ? "پنجم" : "ششم";
  const cell = raw => {
    const s = P.slotOf(raw), [cls, tag] = slotTag(raw);
    if (student) {
      const c = s[who], conf = !s.lead && P.isConf(c);  // a prep period is just the subject for the children
      return `<td class="pc ${conf ? "conf" : ""}"><div class="pe">${em(c)}</div><div class="pn">${esc(P.faName(c))}</div>
        ${conf ? `<div class="pt">🎤 کنفرانس ${esc(P.faName(c).replace("مطالعات ", ""))}</div>` : ""}</td>`;
    }
    if (!s.lead) return `<td class="pc ${cls}"><div class="pe">${em(s[5])}</div><div class="pn">${esc(P.faName(s[5]))}</div>
      ${cls === "rot" ? "" : `<div class="pt">${tag}</div>`}</td>`;
    const line = g => `<div class="ps g${g} ${s.lead === g ? "lead" : ""}"><b>${fa(g)}</b> ${em(s[g])} ${esc(P.faName(s[g]))}
      ${s.lead === g ? "⭐" : P.isConf(s[g]) ? "🧩🎤" : "🧩"}</div>`;
    return `<td class="pc split">${line(5)}${line(6)}</td>`;
  };
  const deco = { rainbow: "🌈 ☀️ 🎈", space: "🚀 🪐 ⭐", garden: "🌻 🦋 🌿" }[theme];
  return `<div class="poster t-${theme} ${student ? "student" : ""}">
    <div class="p-head"><div class="p-deco">${deco}</div>
      <div class="p-title">🗓️ ${student ? `برنامه‌ی هفتگی کلاس ${gName}` : "برنامه‌ی هفتگی کلاس ما"}</div>
      <div class="p-sub">${esc(SCHOOL.school || "")}${SCHOOL.teacher ? " · آموزگار: " + esc(SCHOOL.teacher) : ""} · ${student ? `پایه‌ی ${gName}` : "پایه‌ی پنجم و ششم"}</div></div>
    <table class="p-grid"><tr><th></th>${P.PERIODS.map(p => `<th>زنگ ${fa(p.no)}<small>${fa(p.start)}–${fa(p.end)}</small></th>`).join("")}</tr>
      ${P.DAYS.map((d, i) => `<tr class="d${i}"><th class="p-day">${esc(d)}</th>${days[d].map(cell).join("")}</tr>`).join("")}</table>
    <div class="p-legend">${student ? "🎤 روز کنفرانس: درس را آماده کن و با دوستانت ارائه بده" : "⭐ معلم با این پایه · 🧩 کار مستقل · 🎤 کنفرانس بچه‌ها · 🤝 همه با هم"}</div>
    <div class="p-foot">✨ هر روز یک قدم جلوتر! ✨ <small>از ${fa(from)}</small></div></div>`;
}

// ------------------------------------------------------------ weekly timetable tab
document.querySelector('[data-tab="week"]').addEventListener("click", () => renderWeek());

async function renderWeek(from) {
  const P = Store.planner;
  from = from || (DAY ? DAY.date : Jalali.key(Jalali.today()));
  const wt = await api(`/api/timetable?date=${from}`);
  const el = $("#tab-week");
  el.innerHTML = `
    <div class="toolbar no-print">
      <label>برنامه‌ی معتبر در تاریخ: <input id="wFrom" value="${fa(from)}" size="10"></label>
      <button id="wShow" class="ghost">نمایش</button>
      <a href="#wPosterBox" class="ghost-link">🖨️ رفتن به چاپ / عکس ⬇️</a>
    </div>
    <p class="hint no-print">${wt.from ? `این برنامه از ${fa(wt.from)} به کار می‌رود (ویرایش شما).` : "برنامه‌ی اصلی سال."}
      در هر زنگ درس پایه ۵ و پایه ۶ را انتخاب کنید. اگر یکی باشد، هر دو پایه با هم‌اند (گروهی، چرخشی یا کنفرانس).
      اگر فرق کند، روی <b>⭐ کنار پایه‌ای</b> بزنید که معلم کل زنگ با آن است؛ پایه‌ی دیگر <b>🧩 کار مستقل</b> دارد.
      زیر هر خانه نوع زنگ نوشته می‌شود (🎤 کنفرانس، 🤝 همه با هم، 🔄 چرخشی، 🧩 کار مستقل).
      تغییر از تاریخ بالا به بعد اعمال می‌شود. برای تغییرِ فقط یک روز از تب «برنامه معلم» دکمه «✏️ تغییر برنامه همین روز» را بزنید.</p>
    <div class="table-wrap no-print"><table class="grid week-grid"><tr><th>روز</th>${P.PERIODS.map(p =>
      `<th>زنگ ${fa(p.no)}<br><small>${fa(p.start)}–${fa(p.end)}</small></th>`).join("")}</tr>
    ${P.DAYS.map(d => `<tr><th>${esc(d)}</th>${wt.days[d].map(slot => `<td data-d="${esc(d)}">${slotEditor(slot)}</td>`).join("")}</tr>`).join("")}</table></div>
    <div id="wBudget" class="hint no-print"></div>
    <div class="save-row no-print">
      <button id="wSave">💾 ذخیره از تاریخ ${fa(from)} به بعد</button>
      <button id="wReset" class="ghost">↩️ برگرداندن به برنامه اصلی سال</button></div>
    <h3 id="wPosterBox" class="no-print" style="margin-top:28px">🖨️ پوستر برنامه برای چاپ یا فرستادن</h3>
    <div class="toolbar no-print"><b>برای:</b>
      <label class="theme-pick"><input type="radio" name="wWho" value="teacher" checked> 👩‍🏫 معلم (هر دو پایه)</label>
      <label class="theme-pick"><input type="radio" name="wWho" value="5"> 👧 پایه پنجم</label>
      <label class="theme-pick"><input type="radio" name="wWho" value="6"> 👦 پایه ششم</label></div>
    <div class="toolbar no-print"><b>قالب:</b>
      ${Object.entries(POSTER_THEMES).map(([k, t], i) => `<label class="theme-pick"><input type="radio" name="wTheme" value="${k}" ${i ? "" : "checked"}> ${t}</label>`).join("")}
      <button id="wPng">⬇️ دانلود عکس</button>
      <button id="wPdf">🖨️ چاپ / PDF</button>
    </div>
    <p class="hint no-print">پوستر از روی همین جدول بالا ساخته می‌شود (حتی قبل از ذخیره). برای PDF در پنجره چاپ «Save as PDF» را انتخاب کنید؛ جهت صفحه افقی است.</p>
    <div class="poster-wrap"><div id="wPoster"></div></div>`;
  const read = () => Object.fromEntries(P.DAYS.map(d => [d, [...el.querySelectorAll(`td[data-d="${d}"] .slot`)].map(readSlot)]));
  const budget = () => {  // weekly hours of each subject per grade against the approved budget
    const n = { 5: {}, 6: {} };
    Object.values(read()).flat().forEach(raw => { const s = P.slotOf(raw); [5, 6].forEach(g => n[g][s[g]] = (n[g][s[g]] || 0) + 1); });
    $("#wBudget").innerHTML = [5, 6].map(g => `<div><b>ساعت هفتگی پایه ${fa(g)}:</b> ` + P.SUBJECTS.map(s => {
      const k = n[g][s.code] || 0, b = P.budgetFor(g, s.code);
      if (!k && !b) return "";  // e.g. Kar-o-Fanavari in grade 5
      return `<span class="${k === b ? "" : "warnc"}">${esc(s.name)} ${fa(k)}${k === b ? "" : ` (مصوب ${fa(b)})`}</span>`;
    }).filter(Boolean).join(" · ") + "</div>").join("");
  };
  const theme = () => el.querySelector('input[name="wTheme"]:checked').value;
  const who = () => el.querySelector('input[name="wWho"]:checked').value;
  const poster = () => { $("#wPoster").innerHTML = posterHTML(read(), wt.from || from, theme(), who()); };
  const changed = () => { budget(); poster(); };
  bindSlots(el, changed); changed();
  el.querySelectorAll('input[name="wTheme"], input[name="wWho"]').forEach(r => r.onchange = poster);
  $("#wShow").onclick = () => renderWeek(Jalali.key(Jalali.parse($("#wFrom").value)));
  $("#wPng").onclick = () => savePng($("#wPoster .poster"),
    `برنامه-هفتگی-${who() === "teacher" ? "معلم" : "پایه-" + who()}-${POSTER_THEMES[theme()].split(" ")[1]}.png`);
  $("#wPdf").onclick = () => { toast("در پنجره چاپ، «Save as PDF» را انتخاب کنید"); printTab("week"); };
  $("#wSave").onclick = async () => {
    if (!confirm(`برنامه‌ی هفتگی از ${fa(from)} به بعد عوض شود؟\nبرنامه‌ی روزها، کارت شاد و تکلیف‌ها از همان تاریخ با برنامه‌ی جدید ساخته می‌شوند.`)) return;
    await api("/api/timetable", { from, days: read() });
    toast("ذخیره شد ✅"); load(`/api/day?date=${DAY.date}`); renderWeek(from);
  };
  $("#wReset").onclick = () => {
    const base = P.weekTable("0000/00/00").days;
    el.querySelectorAll("td[data-d]").forEach(td => {
      const i = [...td.parentNode.querySelectorAll("td[data-d]")].indexOf(td);
      td.innerHTML = slotEditor(base[td.dataset.d][i]);
    });
    bindSlots(el, changed); changed(); toast("برنامه اصلی در جدول آمد؛ برای اعمال «ذخیره» بزنید");
  };
}

function printTab(name) {
  document.body.classList.add("print-" + name);
  const done = () => { document.body.classList.remove("print-" + name); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 100);
}

// ------------------------------------------------------------ ✏️ change only this day
// shown above the teacher plan; changes the plan, Shad card, homework and worksheet of that day only
function dayChangeBar() {
  const ch = Store.planner.dayChange(DAY.date);
  const logged = !DAY.closed && DAY.periods.some(p => p.grades.some(g => g.logged));
  return `<div class="daybar no-print">
    ${ch ? `<span class="badge conf">✏️ برنامه‌ی این روز تغییر کرده است</span>` : ""}
    <button id="dcOpen" class="ghost">✏️ تغییر برنامه همین روز</button>
    ${ch ? `<button id="dcUndo" class="ghost">↩️ برگشت به برنامه عادی</button>` : ""}
    <div id="dcBox" hidden>
      ${logged ? `<p class="hint warnc">⚠️ این روز در «ثبت پایان روز» ثبت شده؛ بعد از تغییر، دوباره ثبتش کنید.</p>` : ""}
      <div class="dc-row">${Store.planner.daySubjects(Jalali.parse(DAY.date)).map((s, i) =>
        `<div class="dc-cell"><b>زنگ ${fa(i + 1)}</b>${slotEditor(s)}</div>`).join("")}</div>
      <label><input type="checkbox" id="dcClosed" ${ch && ch.closed ? "checked" : ""}> این روز کلاس تشکیل نمی‌شود (تعطیل)</label>
      <input id="dcReason" placeholder="دلیل، مثلاً برف یا اردو" value="${esc((ch && ch.closed) || "")}">
      <div class="save-row"><button id="dcSave">💾 ذخیره فقط برای ${esc(DAY.weekday || "")} ${fa(DAY.day)} ${esc(DAY.month)}</button></div>
    </div></div>`;
}

function bindDayChange() {
  if (!$("#dcOpen")) return;
  bindSlots($("#dcBox"));
  $("#dcOpen").onclick = () => { $("#dcBox").hidden = !$("#dcBox").hidden; };
  if ($("#dcUndo")) $("#dcUndo").onclick = () => saveDayChange(null);
  $("#dcSave").onclick = () => saveDayChange($("#dcClosed").checked
    ? { closed: $("#dcReason").value.trim() || "تعطیل (به تشخیص معلم)" }
    : { subjects: [...document.querySelectorAll("#dcBox .slot")].map(readSlot) });
}

async function saveDayChange(value) {
  await api("/api/day_change", { date: DAY.date, value });
  toast(value ? "برنامه‌ی این روز تغییر کرد ✅ کارت، تکلیف و کاربرگ به‌روز شد" : "به برنامه‌ی عادی برگشت ✅");
  load(`/api/day?date=${DAY.date}`);
}
