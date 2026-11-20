// Content panel: browse, filter, edit and review every lesson (Windows: saved to Book_Bank.xlsx; phone: kept on the phone)
let LESSONS = [], SORT = { key: null, dir: 1 }, EDITING = null;
const STATUS = { done: "✅ تدریس شده", current: "▶️ در حال تدریس", todo: "⏳ مانده" };
const READONLY = ["شناسه", "پایه", "درس", "تصاویر", "صفحه کتاب", "بازنگری شد"];
const LONG = ["مفاهیم کلیدی", "اهداف یادگیری", "نکات مهم", "درسنامه (مراحل زنگ)", "فعالیت مستقل",
              "ایده کاربرگ", "نکات معلم", "شرح بیشتر", "نمونه سؤال معلم", "ارتباط با پایه دیگر"];
const TABLE_COLS = [["_status", "وضعیت"], ["پایه", "پایه"], ["درس", "درس"], ["فصل", "فصل"], ["عنوان درس", "عنوان"],
                    ["از صفحه", "صفحات"], ["تعداد زنگ", "زنگ"], ["روش تدریس", "روش تدریس"], ["_questions", "سؤال"],
                    ["بازنگری شد", "بازنگری"]];

document.querySelector('[data-tab="content"]').addEventListener("click", loadLessons);
["fSearch", "fGrade", "fSubject", "fChapter", "fStatus", "fReview"].forEach(id =>
  $("#" + id).addEventListener("input", () => { if (id === "fSubject" || id === "fGrade") fillChapters(); drawTable(); }));

async function loadLessons() {
  const data = await api("/api/lessons");
  LESSONS = data.lessons;
  const subs = [...new Set(LESSONS.map(l => l["درس"]))];
  const cur = $("#fSubject").value;
  $("#fSubject").innerHTML = `<option value="">همه درس‌ها</option>` + subs.map(s => `<option ${s === cur ? "selected" : ""}>${esc(s)}</option>`).join("");
  fillChapters(); drawTable();
}

function fillChapters() {
  const g = $("#fGrade").value, s = $("#fSubject").value, cur = $("#fChapter").value;
  const chs = [...new Map(LESSONS.filter(l => (!g || l["پایه"] == g) && (!s || l["درس"] === s))
    .map(l => [String(l["فصل"]), `فصل ${fa(l["فصل"])}: ${l["عنوان فصل"]}`])).entries()];
  $("#fChapter").innerHTML = `<option value="">همه فصل‌ها</option>` +
    chs.map(([v, t]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`).join("");
}

function filtered() {
  const q = $("#fSearch").value.trim(), g = $("#fGrade").value, s = $("#fSubject").value,
        c = $("#fChapter").value, st = $("#fStatus").value, rv = $("#fReview").value;
  let rows = LESSONS.filter(l =>
    (!g || l["پایه"] == g) && (!s || l["درس"] === s) && (!c || String(l["فصل"]) === c) &&
    (!st || l._status === st) && (!rv || (rv === "yes") === !!l["بازنگری شد"]) &&
    (!q || Object.values(l).some(v => String(v ?? "").includes(q))));
  if (SORT.key) rows = [...rows].sort((a, b) => {
    const x = a[SORT.key] ?? "", y = b[SORT.key] ?? "";
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fa")) * SORT.dir;
  });
  return rows;
}

function drawTable() {
  const rows = filtered();
  const reviewed = rows.filter(r => r["بازنگری شد"]).length;
  $("#fCount").textContent = `${fa(rows.length)} درس · ${fa(reviewed)} بازنگری‌شده`;
  $("#cTable").innerHTML = `<tr>${TABLE_COLS.map(([k, t]) => `<th data-k="${k}" class="sortable">${t}${SORT.key === k ? (SORT.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}<th>عملیات</th></tr>` +
    rows.map(l => `<tr class="st-${l._status}">
      <td>${STATUS[l._status]}</td><td>${fa(l["پایه"])}</td><td>${esc(l["درس"])}</td>
      <td title="${esc(l["عنوان فصل"])}">${fa(l["فصل"])}</td><td><b>${esc(l["عنوان درس"])}</b></td>
      <td>${fa(l["از صفحه"])}–${fa(l["تا صفحه"])}</td><td>${fa(l["تعداد زنگ"])}</td>
      <td class="small">${esc(l["روش تدریس"])}</td><td>${l._questions ? fa(l._questions) : "—"}</td>
      <td><input type="checkbox" class="rv" data-id="${l["شناسه"]}" ${l["بازنگری شد"] ? "checked" : ""}></td>
      <td class="actions"><button class="ghost ed" data-id="${l["شناسه"]}">✏️ ویرایش</button>
        <button class="ghost tu" data-id="${l["شناسه"]}" title="این درس و درس‌های قبلش تدریس شده">📍 تا اینجا درس دادم</button></td>
    </tr>`).join("");
  $("#cTable").querySelectorAll("th.sortable").forEach(th => th.onclick = () => {
    SORT = { key: th.dataset.k, dir: SORT.key === th.dataset.k ? -SORT.dir : 1 }; drawTable(); });
  $("#cTable").querySelectorAll(".ed").forEach(b => b.onclick = () => openEditor(b.dataset.id));
  $("#cTable").querySelectorAll(".rv").forEach(b => b.onchange = () => saveLesson(b.dataset.id, { "بازنگری شد": b.checked ? "بله" : null }));
  $("#cTable").querySelectorAll(".tu").forEach(b => b.onclick = () => taughtUntil(b.dataset.id));
}

function openEditor(id) {
  EDITING = LESSONS.find(l => l["شناسه"] === id);
  $("#dTitle").textContent = `پایه ${fa(EDITING["پایه"])} · ${EDITING["درس"]} · ${EDITING["عنوان درس"]}`;
  $("#dReviewed").checked = !!EDITING["بازنگری شد"];
  const keys = Object.keys(EDITING).filter(k => !k.startsWith("_") && !READONLY.includes(k));
  $("#dBody").innerHTML = `<div class="kv">${pageLink(EDITING._page_img, "📖 مشاهده صفحه اول درس")}</div>` +
    keys.map(k => `<label class="field"><span>${esc(k)}</span>${LONG.includes(k)
      ? `<textarea data-k="${esc(k)}" rows="3">${esc(EDITING[k])}</textarea>`
      : `<input data-k="${esc(k)}" value="${esc(EDITING[k])}">`}</label>`).join("");
  $("#drawer").classList.add("on");
  // size textareas after the drawer is visible (hidden elements report scrollHeight 0)
  const fit = t => { t.style.height = "auto"; t.style.height = Math.min(320, t.scrollHeight + 6) + "px"; };
  $("#dBody").querySelectorAll("textarea").forEach(t => { fit(t); t.oninput = () => fit(t); });
}

$("#dClose").onclick = () => $("#drawer").classList.remove("on");
$("#dSave").onclick = async () => {
  const fields = {};
  $("#dBody").querySelectorAll("[data-k]").forEach(el => {
    const k = el.dataset.k, v = el.value;
    if (String(EDITING[k] ?? "") !== v) fields[k] = /^(از صفحه|تا صفحه|تعداد زنگ|فصل)$/.test(k) ? Number(v) : v;
  });
  fields["بازنگری شد"] = $("#dReviewed").checked ? "بله" : null;
  await saveLesson(EDITING["شناسه"], fields);
  $("#drawer").classList.remove("on");
};

async function saveLesson(id, fields) {
  await api("/api/lesson", { id, fields });
  Object.assign(LESSONS.find(l => l["شناسه"] === id), fields);
  toast("ذخیره شد ✅"); drawTable();
}

async function taughtUntil(id) {
  const l = LESSONS.find(x => x["شناسه"] === id);
  if (!confirm(`پایه ${l["پایه"]} — ${l["درس"]}:\n«${l["عنوان درس"]}» و همه درس‌های قبل از آن تدریس شده ثبت شود؟\nبرنامه از درس بعدی ادامه می‌دهد.`)) return;
  await api("/api/taught_until", { id, include: true });
  toast("ثبت شد ✅ برنامه از درس بعد ادامه می‌دهد");
  await loadLessons(); if (DAY) load(`/api/day?date=${DAY.date}`);
}
