// 🗓️ Weekly timetable (view / print / edit from a date on) and ✏️ one-day changes of the plan.
const subjOptions = (sel, extra = "") => Store.planner.SUBJECTS.map(s =>
  `<option value="${s.code}" ${s.code === sel ? "selected" : ""}>${esc(s.name)}</option>`).join("") + extra;

// ------------------------------------------------------------ weekly timetable tab
document.querySelector('[data-tab="week"]').addEventListener("click", () => renderWeek());

async function renderWeek(from) {
  const P = Store.planner;
  from = from || (DAY ? DAY.date : Jalali.key(Jalali.today()));
  const wt = await api(`/api/timetable?date=${from}`);
  const el = $("#tab-week");
  const grid = days => `<table class="grid week-grid"><tr><th>روز</th>${P.PERIODS.map(p =>
      `<th>زنگ ${fa(p.no)}<br><small>${fa(p.start)}–${fa(p.end)}</small></th>`).join("")}</tr>
    ${P.DAYS.map(d => `<tr><th>${esc(d)}</th>${days[d].map((c, i) => `<td>
      <select class="no-print" data-d="${esc(d)}" data-i="${i}">${subjOptions(c)}</select>
      <span class="print-only">${esc(P.faName(c))}</span></td>`).join("")}</tr>`).join("")}</table>`;
  el.innerHTML = `
    <div class="toolbar no-print">
      <label>برنامه‌ی معتبر در تاریخ: <input id="wFrom" value="${fa(from)}" size="10"></label>
      <button id="wShow" class="ghost">نمایش</button>
      <button id="wPrint">🖨️ چاپ</button>
    </div>
    <p class="hint no-print">${wt.from ? `این برنامه از ${fa(wt.from)} به کار می‌رود (ویرایش شما).` : "برنامه‌ی اصلی سال."}
      برای تغییر، درس هر زنگ را عوض کنید و «ذخیره» بزنید؛ تغییر از تاریخ بالا به بعد اعمال می‌شود و روزهای قبل دست نمی‌خورند.
      برای تغییرِ فقط یک روز، از تب «برنامه معلم» دکمه «✏️ تغییر برنامه همین روز» را بزنید.</p>
    <h3 class="print-only">🗓️ برنامه هفتگی کلاس ${esc(SCHOOL.school || "")} — از ${fa(wt.from || from)}</h3>
    <div id="wGrid">${grid(wt.days)}</div>
    <div id="wBudget" class="hint"></div>
    <div class="save-row no-print">
      <button id="wSave">💾 ذخیره از تاریخ ${fa(from)} به بعد</button>
      <button id="wReset" class="ghost">↩️ برگرداندن به برنامه اصلی سال</button></div>`;
  const read = () => Object.fromEntries(P.DAYS.map(d => [d, [...el.querySelectorAll(`select[data-d="${d}"]`)].map(s => s.value)]));
  const budget = () => {  // weekly hours of each subject against the approved budget
    const n = {};
    Object.values(read()).flat().forEach(c => n[c] = (n[c] || 0) + 1);
    $("#wBudget").innerHTML = "ساعت هفتگی: " + P.SUBJECTS.map(s => {
      const k = n[s.code] || 0;
      return `<span class="${k === s.budget ? "" : "warnc"}">${esc(s.name)} ${fa(k)}${k === s.budget ? "" : ` (مصوب ${fa(s.budget)})`}</span>`;
    }).join(" · ");
  };
  el.querySelectorAll("select").forEach(s => s.onchange = budget); budget();
  $("#wShow").onclick = () => renderWeek(Jalali.key(Jalali.parse($("#wFrom").value)));
  $("#wPrint").onclick = () => printTab("week");
  $("#wSave").onclick = async () => {
    if (!confirm(`برنامه‌ی هفتگی از ${fa(from)} به بعد عوض شود؟\nبرنامه‌ی روزها، کارت شاد و تکلیف‌ها از همان تاریخ با برنامه‌ی جدید ساخته می‌شوند.`)) return;
    await api("/api/timetable", { from, days: read() });
    toast("ذخیره شد ✅"); load(`/api/day?date=${DAY.date}`); renderWeek(from);
  };
  $("#wReset").onclick = () => {
    el.querySelectorAll("select").forEach(s => s.value = Store.planner.weekTable("0000/00/00").days[s.dataset.d][s.dataset.i]);
    budget(); toast("برنامه اصلی در جدول آمد؛ برای اعمال «ذخیره» بزنید");
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
      <div class="dc-row">${Store.planner.daySubjects(Jalali.parse(DAY.date)).map((c, i) =>
        `<label>زنگ ${fa(i + 1)} <select class="dc" data-i="${i}">${subjOptions(c)}</select></label>`).join("")}</div>
      <label><input type="checkbox" id="dcClosed" ${ch && ch.closed ? "checked" : ""}> این روز کلاس تشکیل نمی‌شود (تعطیل)</label>
      <input id="dcReason" placeholder="دلیل، مثلاً برف یا اردو" value="${esc((ch && ch.closed) || "")}">
      <div class="save-row"><button id="dcSave">💾 ذخیره فقط برای ${esc(DAY.weekday || "")} ${fa(DAY.day)} ${esc(DAY.month)}</button></div>
    </div></div>`;
}

function bindDayChange() {
  if (!$("#dcOpen")) return;
  $("#dcOpen").onclick = () => { $("#dcBox").hidden = !$("#dcBox").hidden; };
  if ($("#dcUndo")) $("#dcUndo").onclick = () => saveDayChange(null);
  $("#dcSave").onclick = () => saveDayChange($("#dcClosed").checked
    ? { closed: $("#dcReason").value.trim() || "تعطیل (به تشخیص معلم)" }
    : { subjects: [...document.querySelectorAll(".dc")].map(s => s.value) });
}

async function saveDayChange(value) {
  await api("/api/day_change", { date: DAY.date, value });
  toast(value ? "برنامه‌ی این روز تغییر کرد ✅ کارت، تکلیف و کاربرگ به‌روز شد" : "به برنامه‌ی عادی برگشت ✅");
  load(`/api/day?date=${DAY.date}`);
}
