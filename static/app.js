const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fa = n => String(n).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
let DAY = null;           // current plan
let SHEET = [];           // worksheet questions being edited

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2600); }

// answered in the browser by core/planner.js (Windows: data from server.py; phone: data stored on the phone)
async function api(url, body) {
  try { return await Store.api(url, body); }
  catch (e) { toast(e.message || "خطا"); throw e; }
}
const pageLink = (href, text) => Store.HAS_PAGES ? `<a href="${href}" target="_blank">${text}</a>` : "";

// ------------------------------------------------------------ tabs & date nav
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tabs button, .tab").forEach(x => x.classList.remove("on"));
  b.classList.add("on"); $("#tab-" + b.dataset.tab).classList.add("on");
  if (b.dataset.tab === "settings") renderSettings();
});
$("#prev").onclick = () => load(`/api/day?date=${DAY.date}&step=prev`);
$("#next").onclick = () => load(`/api/day?date=${DAY.date}&step=next`);
$("#tomorrow").onclick = () => load("/api/tomorrow");
$("#datePick").onchange = e => load(`/api/day?date=${e.target.value.replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))}`);

async function load(url) {
  DAY = await api(url);
  $("#dateLabel").textContent = `${DAY.weekday} ${fa(DAY.day)} ${DAY.month} — ${fa(DAY.date)}`;
  renderPlan(); renderCard(); renderSheetPicker(); renderDone(); renderHomework();
}

// ------------------------------------------------------------ teacher plan
function renderPlan() {
  const el = $("#tab-plan");
  if (DAY.closed) {  // a day the teacher closed can be reopened from here
    el.innerHTML = (Store.planner.dayChange(DAY.date) ? dayChangeBar() : "") + `<div class="closed">🌙 ${esc(DAY.closed)} — کلاس تعطیل است</div>`;
    bindDayChange(); return;
  }
  el.innerHTML = dayChangeBar() + integHint() + DAY.periods.map(p => `
    <div class="period">
      <div class="period-head">
        <span class="no">زنگ ${fa(p.no)}</span><span class="subj">${esc(p.subject)}</span>
        <span class="badge">${fa(p.time)}</span>
        <span class="badge ${p.conference ? "conf" : p.joint ? "joint" : ""}">${esc(p.mode)}</span>
      </div>
      <ul class="timing">${p.timing.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      <div class="grades">${p.grades.map(g => gradeBlock(p, g)).join("")}</div>
    </div>`).join("");
  bindDayChange(); bindIntegHint();
}

function extraBlock(x) {
  if (!x) return "";
  return `<div class="extra"><b>➕ ${esc(x.subject)}:</b> ${esc(x.title)} — ص ${fa(x.pages)}
    <div class="kv">${esc(x.lesson_plan)}</div>
    ${pageLink(x.page_img, "📖 صفحه کتاب")}</div>`;
}

function gradeBlock(p, g) {
  const logged = g.logged ? `<span class="logged">${g.logged === "بله" ? "✅ انجام شد" : "⏳ انجام نشد"}</span>` : "";
  if (!g.has_content) return `<div class="grade g${g.grade}">${logged}<h4>پایه ${fa(g.grade)}</h4>
      <div class="title">${esc(g.title)}</div><div class="empty">محتوای این درس هنوز در بانک وارد نشده است.</div>${extraBlock(g.extra)}</div>`;
  const row = (k, v, cls = "") => v ? `<div class="kv ${cls}"><b>${k}:</b> ${esc(v)}</div>` : "";
  if (g.role === "independent")  // the teacher is with the other grade: just the task, ready to read out
    return `<div class="grade g${g.grade} indep">${logged}
      <h4>پایه ${fa(g.grade)} — 🧩 کار مستقل: ${esc(g.subject)}</h4>
      <div class="title">${esc(g.title)}</div>
      ${row("صفحات", fa(g.pages))}
      <div class="kv task"><b>دستور کار:</b> ${esc(fa(g.task || ""))}</div>
      ${row("نکات معلم", g.teacher_notes, "note")}
      ${extraBlock(g.extra)}</div>`;
  const conf = g.role === "conference", star = g.role === "lead" ? " ⭐ محور" : "";
  return `<div class="grade g${g.grade}">${logged}
    <h4>پایه ${fa(g.grade)}${star} — ${esc(g.subject)} · فصل ${fa(g.chapter)}: ${esc(g.chapter_title)}</h4>
    <div class="title">${esc(g.title)}</div>
    ${row("صفحات", fa(g.pages) + (conf && g.count > 1 ? "  (کل درس در یک کنفرانس)" : `  (جلسه ${fa(g.part)} از ${fa(g.parts)})`))}
    ${row(conf ? "پرسش از درس قبل" : "پرسش کوتاه از", g.previous && `${g.previous} (ص ${fa(g.previous_pages)})`)}
    ${row("هدف", g.objectives)}
    ${row("روش تدریس", conf ? "کنفرانس دانش‌آموزان + جمع‌بندی معلم" : g.method)}
    ${row(conf ? "نکات جمع‌بندی معلم" : "درسنامه", conf ? (g.key_notes || g.concepts) : g.lesson_plan)}
    ${row("کار مستقل (وقتی با پایه دیگر هستید)", g.role === "rotation" ? g.independent : "")}
    ${row("کاربرد / کاربرگ", g.worksheet_idea)}
    ${row("نکات معلم", g.teacher_notes, "note")}
    ${row("شرح بیشتر", g.teacher_detail, "note")}
    <div class="kv">${pageLink(g.page_img, "📖 مشاهده صفحه کتاب")}
      ${g.questions.length ? ` · 📝 ${fa(g.questions.length)} سؤال در بانک` : ""}</div>
    ${extraBlock(g.extra)}
  </div>`;
}

// ------------------------------------------------------------ shad card
// 👩‍🏫 = what the teacher teaches · 📖/🎤/❓ = what the student must do or prepare
const EMOJI = { "قرآن": "📗", "ریاضی": "🧮", "فارسی": "📖", "نگارش": "✏️", "املا": "✍️", "انشا": "📝",
  "علوم": "🔬", "مطالعات اجتماعی": "🌍", "هدیه‌های آسمان": "🕌", "تفکر و پژوهش": "💡", "هنر": "🎨", "ورزش": "⚽",
  "خط تحریری": "🖋️", "کار و فناوری": "🛠️" };
const GRADE_NAME = g => g === 5 ? "پنجم" : "ششم";

// one structured list per grade, shared by the picture card and the copied text
function cardRows(g) {
  return DAY.periods.map(p => {
    const x = p.grades.find(e => e.grade === g);
    const rows = [];
    if (x.role === "conference" && x.has_content) {
      rows.push(["🎤", "کنفرانس بچه‌ها", `${x.title} (ص ${fa(x.pages)})`]);
      if (x.previous) rows.push(["❓", "پرسش از", x.previous]);
    } else if (x.prep && x.has_content) {
      rows.push(["🧩", "آماده‌سازی کنفرانس", `${x.title} (ص ${fa(x.pages)}) + کاربرگ درس قبل`]);
    } else if (x.role === "independent" && x.has_content) {
      rows.push(["🧩", "کار مستقل", `${x.title} (ص ${fa(x.pages)})`]);
    } else if (x.has_content) {
      rows.push(["👩‍🏫", "درس امروز", `${x.title} (ص ${fa(x.pages)})`]);
      if (x.previous) rows.push(["❓", "آماده‌ی پرسش از", x.previous]);
    } else if (p.joint) {
      rows.push(["🤝", "", "فعالیت گروهی با هم"]);
    }
    if (x.extra) rows.push(["➕", x.extra.subject, `${x.extra.title} (ص ${fa(x.extra.pages)})`]);
    if (x.role === "conference" && x.next_session) rows.push(["📌", "کنفرانس جلسه‌ی بعد", x.next_session.title]);
    return { p, subject: x.subject, emoji: EMOJI[x.subject] || "📌", rows };
  });
}

function renderCard() {
  const el = $("#shadCard");
  if (DAY.closed) { el.innerHTML = `<div class="sc-head"><div class="t1">${esc(DAY.closed)}</div></div>`; return; }
  const col = g => `<div class="sc-col g${g}"><h3>👧👦 پایه ${GRADE_NAME(g)}</h3>${cardRows(g).map(c => `
      <div class="sc-item"><div class="s">${c.emoji} ${esc(c.subject)} <span>زنگ ${fa(c.p.no)}</span></div>
        ${c.rows.map(([e, k, v]) => `<div class="${e === "👩‍🏫" ? "l" : "x"}${e === "🎤" || e === "📌" ? " conf" : ""}">${e} ${k ? esc(k) + ": " : ""}${esc(v)}</div>`).join("")}
      </div>`).join("")}</div>`;
  el.innerHTML = `
    <div class="sc-head"><div class="t1">📅 برنامه‌ی کلاس ما ✨</div>
      <div class="t2">${esc(DAY.weekday)} ${fa(DAY.day)} ${esc(DAY.month)}</div></div>
    <div class="sc-legend">👩‍🏫 درسی که خانم معلم می‌دهد · ❓ آماده‌ی پرسش باش · 🎤 کنفرانس بچه‌ها · 📌 برای جلسه‌ی بعد آماده کن</div>
    <div class="sc-body">${col(5)}${col(6)}</div>
    <div class="sc-foot">🌟 با همکاری هم، برنامه‌ی امروز را کامل پیش می‌بریم 💪</div>`;
}

$("#cardPng").onclick = () => savePng($("#shadCard"), `برنامه-${DAY.date.replaceAll("/", "-")}.png`);
$("#cardCopy").onclick = () => {
  if (DAY.closed) return;
  const lines = [`📅 برنامه‌ی کلاس ما — ${DAY.weekday} ${fa(DAY.day)} ${DAY.month} ✨`,
                 "👩‍🏫 درس خانم معلم · ❓ آماده‌ی پرسش · 🎤 کنفرانس · 📌 جلسه‌ی بعد"];
  for (const g of [5, 6]) {
    lines.push("", "━━━━━━━━━━━━", `👧👦 پایه ${GRADE_NAME(g)}`, "━━━━━━━━━━━━");
    for (const c of cardRows(g)) {
      lines.push(`${c.emoji} ${c.subject} (زنگ ${fa(c.p.no)})`);
      c.rows.forEach(([e, k, v]) => lines.push(`   ${e} ${k ? k + ": " : ""}${v}`));
    }
  }
  lines.push("", "🌟 با همکاری هم، برنامه‌ی امروز را کامل پیش می‌بریم 💪");
  navigator.clipboard.writeText(lines.join("\n")).then(() => toast("متن کپی شد — در شاد بچسبانید"));
};

// ------------------------------------------------------------ tonight's homework
let HW = null;
const HW_KIND = { today: "تمرین درس امروز", tomorrow: "آمادگی برای فردا", weekend: "📚 مرور آخر هفته" };
async function renderHomework() {
  const el = $("#hwCard");
  if (DAY.closed) { el.innerHTML = ""; HW = null; return; }
  el.innerHTML = `<div class="sc-foot">⏳ در حال ساخت تکلیف…</div>`;
  const forDate = DAY.date;
  const hw = await api(`/api/homework?date=${forDate}`);
  if (DAY.date !== forDate) return;  // the user moved to another day meanwhile
  HW = hw;
  if (HW.weekend) renderSheetPicker();  // adds the weekly review worksheets
  drawHomework();
}

// draws the card from HW, so the teacher's edits and deletions are kept
function drawHomework() {
  const el = $("#hwCard");
  const col = gr => `<div class="sc-col g${gr.grade}"><h3>👧👦 پایه ${GRADE_NAME(gr.grade)}</h3>
      ${gr.items.map((it, i) => `<div class="sc-item"><div class="s">${it.emoji} ${esc(it.subject)}
        <span>${HW_KIND[it.kind]}</span>
        <button class="del no-print hw-del" data-g="${gr.grade}" data-i="${i}" title="حذف این بند">✖</button></div>
        <div class="l hw" contenteditable data-g="${gr.grade}" data-i="${i}">${fa(esc(it.text)).replace(/\n/g, "<br>")}</div></div>`).join("")}
    </div>`;
  el.innerHTML = `
    <div class="sc-head hw-head"><div class="t1">🏠 تکلیف امشب</div>
      <div class="t2">برای ${esc(HW.next.weekday)} ${fa(HW.next.day)} ${esc(HW.next.month)} آماده شویم 🎒</div></div>
    <div class="sc-body">${HW.grades.map(col).join("")}</div>
    <div class="sc-foot">✅ تکلیف را کامل انجام بده تا فردا با آمادگی بیایی 🌈</div>`;
  // the teacher edits the text in place; the copy button uses the edited text
  const item = el => HW.grades.find(g => g.grade == el.dataset.g).items[el.dataset.i];
  el.querySelectorAll(".hw[contenteditable]").forEach(d => d.oninput = () => { item(d).text = d.innerText; });
  el.querySelectorAll(".hw-del").forEach(b => b.onclick = () => {
    const gr = HW.grades.find(g => g.grade == b.dataset.g);
    gr.items.splice(b.dataset.i, 1); drawHomework();
  });
}

$("#hwPng").onclick = async () => {
  if (!HW) return;
  const btns = [...document.querySelectorAll("#hwCard .hw-del")]; btns.forEach(b => b.style.display = "none");
  await savePng($("#hwCard"), `تکلیف-${DAY.date.replaceAll("/", "-")}.png`);
  btns.forEach(b => b.style.display = "");
};
$("#hwCopy").onclick = () => {
  if (!HW) return;
  const lines = [`🏠 تکلیف امشب — برای ${HW.next.weekday} ${fa(HW.next.day)} ${HW.next.month} 🎒`];
  for (const gr of HW.grades) {
    lines.push("", "━━━━━━━━━━━━", `👧👦 پایه ${GRADE_NAME(gr.grade)}`, "━━━━━━━━━━━━");
    gr.items.forEach(it => lines.push(`${it.emoji} ${it.subject} (${HW_KIND[it.kind]}):`, `   ${fa(it.text)}`));
  }
  lines.push("", "✅ تکلیف را کامل انجام بده تا فردا با آمادگی بیایی 🌈");
  navigator.clipboard.writeText(lines.join("\n")).then(() => toast("متن تکلیف کپی شد — در شاد بچسبانید"));
};

async function savePng(node, name) {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const a = document.createElement("a");
  a.download = name; a.href = canvas.toDataURL("image/png"); a.click();
}

// ------------------------------------------------------------ worksheet
// one worksheet per grade: questions of every lesson taught today (periods marked «انجام نشد» are left out)
function todayLessons(grade) {
  if (DAY.closed) return [];
  return DAY.periods.flatMap(p => {
    const e = p.grades.find(x => x.grade === grade);
    return e.has_content && !e.prep && e.logged !== "خیر" && e.questions.length
      ? [{ subject: e.subject, emoji: EMOJI[e.subject] || "📌", title: e.title, pages: e.pages, questions: e.questions }] : [];
  }).filter((l, i, a) => a.findIndex(x => x.title === l.title) === i);  // same lesson twice a day → once
}

function renderSheetPicker() {
  const opts = [];
  for (const g of [5, 6]) {
    const ls = todayLessons(g);
    if (ls.length) opts.push({ v: `t-${g}`, t: `پایه ${fa(g)} — کاربرگ درس‌های امروز (${ls.map(l => l.subject).join("، ")})` });
  }
  // end of the week: a review worksheet per grade from the whole week's lessons
  if (HW && HW.date === DAY.date && HW.weekend) HW.grades.forEach(gr => {
    if (gr.week.length) opts.push({ v: `w-${gr.grade}`, t: `📚 پایه ${fa(gr.grade)} — کاربرگ جمع‌بندی هفته (${fa(gr.week.length)} درس)` });
  });
  $("#sheetPick").innerHTML = opts.length ? opts.map(o => `<option value="${o.v}">${esc(o.t)}</option>`).join("")
                                          : `<option value="">برای این روز درسی با سؤال نیست</option>`;
  $("#sheetPick").onchange = buildSheet; buildSheet();
}

function current() {
  const [kind, g] = ($("#sheetPick").value || "").split("-");
  if (!kind) return null;
  const grade = Number(g);
  return kind === "w"
    ? { grade, title: "کاربرگ جمع‌بندی هفته", lessons: HW.grades.find(x => x.grade === grade).week, week: true }
    : { grade, title: "کاربرگ درس‌های امروز", lessons: todayLessons(grade) };
}

// a header row per lesson, then its questions; weekly review takes one quick + one written question per lesson
function buildSheet() {
  const c = current();
  const quick = ["جای خالی", "تستی"], written = ["جواب کوتاه", "جواب بلند"];
  SHEET = !c ? [] : c.lessons.flatMap(l => {
    const qs = c.week ? [l.questions.find(q => quick.includes(q.type)), l.questions.find(q => written.includes(q.type))].filter(Boolean)
                      : l.questions;
    return [{ header: true, on: true, q: `${l.emoji || EMOJI[l.subject] || "📌"} ${l.subject} — ${l.title} (ص ${fa(l.pages)})` },
            ...qs.map(q => ({ ...q, options: [...(q.options || [])], on: true }))];
  });
  drawSheet();
}

function drawSheet() {
  const c = current(), el = $("#sheet");
  if (!c) { el.innerHTML = ""; return; }
  let n = 0;
  el.innerHTML = `
    <div class="ws-school" contenteditable>
      <span>🏫 ${esc(SCHOOL.school || "نام مدرسه (در تنظیمات وارد کنید)")}</span>
      <span>👩‍🏫 آموزگار: ${esc(SCHOOL.teacher || "نام معلم (در تنظیمات وارد کنید)")}</span></div>
    <div class="ws-head"><div><div class="t" contenteditable>${esc(c.title)}</div>
      <div class="m" contenteditable>پایه ${c.grade === 5 ? "پنجم" : "ششم"}</div></div>
      <div class="m" contenteditable>${esc(DAY.weekday)} ${fa(DAY.day)} ${esc(DAY.month)} · ${fa(DAY.date)}</div></div>
    <div class="ws-name" contenteditable>نام و نام خانوادگی: ............................</div>
    ${SHEET.map((q, i) => {
      if (q.header) return `<div class="ws-sec ${q.on ? "" : "off"}">
        <input type="checkbox" class="chk" data-i="${i}" ${q.on ? "checked" : ""}>
        <div class="text" contenteditable data-i="${i}">${esc(q.q)}</div>
        <button class="del no-print" data-i="${i}" title="حذف">✖</button></div>`;
      if (q.on) n++;
      const opts = q.options?.length ? `<div class="opts">${q.options.map((o, j) =>
        `<div class="opt" contenteditable data-i="${i}" data-j="${j}">${"الف ب ج د".split(" ")[j] || j + 1}) ${esc(o)}</div>`).join("")}</div>` : "";
      const lines = q.type === "جواب بلند" ? '<div class="lines"></div><div class="lines"></div><div class="lines"></div>'
                  : q.type === "جواب کوتاه" ? '<div class="lines"></div>' : "";
      return `<div class="q ${q.on ? "" : "off"}">
        <input type="checkbox" class="chk" data-i="${i}" ${q.on ? "checked" : ""}>
        <div class="num">${q.on ? fa(n) + "." : ""}</div>
        <div class="body"><div class="type">${esc(q.type)}</div>
          <div class="text" contenteditable data-i="${i}">${esc(q.q)}</div>${opts}${lines}
          <div class="ans">پاسخ: ${esc(q.answer)}</div></div>
        <button class="del no-print" data-i="${i}" title="حذف">✖</button></div>`;
    }).join("")}`;
  el.querySelectorAll(".chk").forEach(x => x.onchange = () => { SHEET[x.dataset.i].on = x.checked; drawSheet(); });
  el.querySelectorAll(".text").forEach(x => x.oninput = () => SHEET[x.dataset.i].q = x.textContent);
  el.querySelectorAll(".opt").forEach(x => x.oninput = () => SHEET[x.dataset.i].options[x.dataset.j] = x.textContent.replace(/^\S+\)\s*/, ""));
  el.querySelectorAll(".del").forEach(x => x.onclick = () => { SHEET.splice(x.dataset.i, 1); drawSheet(); });
}

$("#showAns").onchange = e => $("#sheet").classList.toggle("show-ans", e.target.checked);
$("#addQ").onclick = () => {
  const type = prompt("نوع سؤال: جای خالی / تستی / جواب کوتاه / جواب بلند", "جواب کوتاه");
  if (!type) return;
  SHEET.push({ type, q: "متن سؤال را اینجا بنویسید", options: type === "تستی" ? ["", "", "", ""] : [], answer: "", on: true });
  drawSheet();
};
$("#sheetPng").onclick = async () => {
  const s = $("#sheet"); s.classList.add("exporting");
  const hidden = [...s.querySelectorAll(".q.off, .ws-sec.off, .chk, .del, .ans")]; hidden.forEach(h => h.style.display = "none");
  await savePng(s, `کاربرگ-${DAY.date.replaceAll("/", "-")}.png`);
  hidden.forEach(h => h.style.display = "");
};
$("#sheetPdf").onclick = () => { toast("در پنجره چاپ، «Save as PDF» را انتخاب کنید"); setTimeout(() => window.print(), 400); };

// ------------------------------------------------------------ end of day
function renderDone() {
  const el = $("#tab-done");
  if (DAY.closed) { el.innerHTML = `<div class="closed">روز تعطیل است.</div>`; return; }
  // one row per grade per period, plus a row for a ride-along book (Khat, Kar-o-Fanavari)
  const rows = DAY.periods.flatMap(p => p.grades.flatMap(g => {
    const main = { p, g, subject: g.subject, count: g.count, title: g.title, lesson_id: g.lesson_id || "",
                   session: g.prep ? "آماده‌سازی کنفرانس" : g.role === "conference" && g.count > 1 ? "کل درس (کنفرانس)"
                          : g.has_content ? `${g.part} از ${g.parts}` : g.session_no, logged: g.logged };
    const x = g.extra && { p, g, subject: g.extra.subject, title: g.extra.title, lesson_id: g.extra.lesson_id,
                           session: `${g.extra.part} از ${g.extra.parts}`, logged: g.extra.logged };
    return x ? [main, x] : [main];
  }));
  rows.forEach((r, i) => r.i = i);
  el.innerHTML = `<p class="hint">در پایان روز، زنگ‌هایی را که طبق برنامه انجام شد تیک بزنید. موارد بدون تیک، جلسه بعد دوباره پیشنهاد می‌شوند.</p>
    <table class="grid"><tr><th>زنگ</th><th>درس</th><th>پایه</th><th>عنوان</th><th>انجام شد</th><th>یادداشت</th></tr>
    ${rows.map(r => `<tr>
      <td>${fa(r.p.no)}</td><td>${esc(r.subject)}${r.count !== undefined && r.g.role === "independent" ? " 🧩" : ""}</td><td>${fa(r.g.grade)}</td>
      <td>${esc(r.title)} <small class="hint">${esc(fa(r.session))}</small></td>
      <td><input type="checkbox" class="dn" data-i="${r.i}" ${r.logged !== "خیر" ? "checked" : ""}></td>
      <td><input class="nt" data-i="${r.i}" placeholder="اختیاری"></td></tr>`).join("")}
    </table>
    <div class="save-row"><b>امروز طبق برنامه پیش رفتیم؟</b>
      <label><input type="radio" name="track" value="1" checked> بله 🎉</label>
      <label><input type="radio" name="track" value="0"> نه</label>
      <button id="saveDone">💾 ثبت در دفتر کلاس</button></div>`;
  $("#saveDone").onclick = async () => {
    const items = rows.map(r => ({
      period: r.p.no, grade: r.g.grade, subject: r.subject, lesson_id: r.lesson_id, title: r.title, session: r.session,
      count: r.count ?? 1,
      done: $(`.dn[data-i="${r.i}"]`).checked, note: $(`.nt[data-i="${r.i}"]`).value }));
    await api("/api/complete", { date: DAY.date, on_track: $('input[name="track"]:checked').value === "1", items });
    toast("ثبت شد ✅ برنامه روز بعد به‌روز شد");
    load(`/api/day?date=${DAY.date}`);
  };
}

// ------------------------------------------------------------ settings
function pdfFor(r, done) {
  const l = r.lessons.find(x => x.after === done);
  return l ? l.pdf : r.pdf;
}

async function renderSettings() {
  const rows = await api("/api/settings");
  $("#tab-settings").innerHTML = `
    <h3 style="margin-top:0">🏫 مشخصات مدرسه (برای سربرگ کاربرگ‌ها)</h3>
    <div class="save-row" style="margin:0 0 22px">
      <label>نام مدرسه: <input id="schoolName" value="${esc(SCHOOL.school)}" placeholder="مثلاً دبستان شهید ..." style="width:240px"></label>
      <label>نام معلم: <input id="teacherName" value="${esc(SCHOOL.teacher)}" placeholder="مثلاً خانم ..." style="width:200px"></label>
      <button id="saveSchool">💾 ذخیره</button></div>
    <h3>📍 نقطه شروع</h3>
    <p class="hint">نقطه شروع: برای هر پایه و درس مشخص کنید تا قبل از شروع استفاده از برنامه، تا کجا تدریس شده است.
      (از این به بعد با «ثبت پایان روز» خودکار جلو می‌رود.)</p>
    <table class="grid"><tr><th>پایه</th><th>درس</th><th>تا کجا تدریس شده؟</th><th>کتاب</th></tr>
    ${rows.map((r, i) => `<tr><td>${fa(r.grade)}</td><td>${esc(r.subject)}</td><td>${
      r.lessons.length
        ? `<select data-i="${i}"><option value="0">هنوز شروع نشده</option>${r.lessons.map(l =>
            `<option value="${l.after}" ${l.after === r.done ? "selected" : ""}>تمام شده تا: ${esc(l.label)}</option>`).join("")}</select>`
        : `<input type="number" min="0" data-i="${i}" value="${r.done}" style="width:80px"> جلسه <span class="hint">(بدون کتاب)</span>`
    }</td><td>${r.pdf && Store.HAS_PAGES ? `<a class="pdf" data-i="${i}" href="${pdfFor(r, r.done)}" target="_blank">📕 PDF کتاب</a>` : ""}</td></tr>`).join("")}</table>
    <div class="save-row"><button id="saveSet">💾 ذخیره نقطه شروع</button></div>`;
  // the PDF link opens the book at the selected lesson
  $("#tab-settings").querySelectorAll("select[data-i]").forEach(s => s.onchange = () => {
    const a = $(`#tab-settings a.pdf[data-i="${s.dataset.i}"]`);
    if (a) a.href = pdfFor(rows[s.dataset.i], Number(s.value));
  });
  $("#saveSet").onclick = async () => {
    const data = rows.map((r, i) => ({ grade: r.grade, code: r.code,
      done: Number($(`#tab-settings [data-i="${i}"]`).value) }));
    await api("/api/settings", data);
    toast("ذخیره شد ✅"); load(`/api/day?date=${DAY.date}`);
  };
  $("#saveSchool").onclick = async () => {
    SCHOOL = { school: $("#schoolName").value, teacher: $("#teacherName").value };
    await api("/api/school", SCHOOL);
    toast("ذخیره شد ✅ در سربرگ کاربرگ‌ها نمایش داده می‌شود"); drawSheet();
  };
}

// ------------------------------------------------------------ 📤 export / 📥 import (transfer file phone ⇄ Windows)
$("#exportBtn").onclick = async () => {
  const f = Store.exportFile();
  const file = new File([f.text], f.name, { type: "application/json" });
  // phone: open the share sheet (Shad, Bluetooth, …); otherwise save to Downloads
  if (Store.MODE === "pwa" && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: f.name }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = f.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`فایل «${f.name}» در پوشه دانلود ذخیره شد`);
};
$("#importBtn").onclick = () => $("#importFile").click();
$("#importFile").onchange = async e => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  try {
    const n = await Store.importText(await file.text());
    const parts = [n.days && `${fa(n.days)} روز دفتر کلاس`, n.starts && `${fa(n.starts)} نقطه شروع`,
                   n.edits && `${fa(n.edits)} ویرایش محتوا`, n.questions && `${fa(n.questions)} سؤال`, n.timetables && `${fa(n.timetables)} تغییر برنامه هفتگی/روز`, n.school && "نام مدرسه/معلم"].filter(Boolean);
    alert(parts.length ? `✅ ادغام شد (از ${n.from || "فایل"}):\n` + parts.join("\n") : "✅ فایل خوانده شد؛ چیز تازه‌ای نداشت (همه‌چیز از قبل یکی بود).");
    SCHOOL = await api("/api/school");
    load(`/api/day?date=${DAY ? DAY.date : ""}`);
  } catch (err) { alert("❌ " + err.message); }
};

let SCHOOL = { school: "", teacher: "" };
Store.init().then(async () => {
  document.body.classList.add("mode-" + Store.MODE);
  SCHOOL = await api("/api/school");
  load("/api/tomorrow");
}).catch(e => { $("#tab-plan").innerHTML = `<div class="closed">❌ ${esc(e.message)}</div>`; });
