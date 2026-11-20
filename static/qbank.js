// 🗃️ Question bank: browse, edit, delete and add questions. Changes go to STATE.question_edits
// (see planner.js), so they appear in worksheets and exams and travel with 📤/📥.
const QB_SUBJECTS = ["Riazi", "Farsi", "Olom", "Ejtemaee", "Hedye", "Quran", "Negaresh", "Tafakor", "KarFanavari"];
let QB = { pool: [] };

document.querySelector('[data-tab="qbank"]').addEventListener("click", () => { if (!$("#qbGrade")) renderQbank(); else loadQbank(); });

function renderQbank() {
  const P = Store.planner;
  $("#tab-qbank").innerHTML = `
    <p class="hint">همه‌ی سؤال‌های کاربرگ و آزمون اینجاست. می‌توانید هر سؤال را ✏️ ویرایش یا 🗑 حذف کنید و ➕ سؤال خودتان را اضافه کنید.
      سؤال‌های ویرایش‌شده با «✏️ ویرایش معلم» و سؤال‌های شما با «👩‍🏫 معلم» مشخص می‌شوند؛ «↩️ نسخه‌ی اصلی» ویرایش را برمی‌گرداند.</p>
    <div class="filters">
      <select id="qbGrade"><option value="5">پایه پنجم</option><option value="6">پایه ششم</option></select>
      <select id="qbSubj">${QB_SUBJECTS.map(c => `<option value="${c}">${esc(P.faName(c))}</option>`).join("")}</select>
      <select id="qbLesson"></select>
      <select id="qbType"><option value="">همه‌ی نوع‌ها</option>${EX_TYPES.map(t => `<option>${t}</option>`).join("")}</select>
      <select id="qbLevel"><option value="">همه‌ی سطح‌ها</option>${EX_LEVELS.map(t => `<option>${t}</option>`).join("")}</select>
      <input id="qbSearch" type="search" placeholder="🔎 جستجو در متن سؤال">
      <button id="qbAdd">➕ سؤال جدید</button>
      <span id="qbCount" class="hint"></span>
    </div>
    <div id="qbForm"></div>
    <div id="qbList"></div>`;
  $("#qbGrade").onchange = $("#qbSubj").onchange = loadQbank;
  ["qbLesson", "qbType", "qbLevel", "qbSearch"].forEach(id => $("#" + id).addEventListener("input", drawQbank));
  $("#qbAdd").onclick = () => openQForm(null);
  loadQbank();
}

async function loadQbank() {
  const keep = $("#qbLesson").value;
  QB.pool = await api(`/api/qbank?grade=${$("#qbGrade").value}&code=${$("#qbSubj").value}`);
  $("#qbLesson").innerHTML = `<option value="">همه‌ی درس‌ها</option>` + QB.pool.map(l =>
    `<option value="${l.lesson_id}" ${l.lesson_id === keep ? "selected" : ""}>فصل ${fa(l.chapter)} · ${esc(l.title)} (${fa(l.questions.length)})</option>`).join("");
  drawQbank();
}

function drawQbank() {
  const lid = $("#qbLesson").value, t = $("#qbType").value, lv = $("#qbLevel").value, s = $("#qbSearch").value.trim();
  const rows = QB.pool.filter(l => !lid || l.lesson_id === lid).flatMap(l => l.questions.map(q => ({ ...q, lesson: l })))
    .filter(q => (!t || q.type === t) && (!lv || levelOf(q) === lv) && (!s || q.q.includes(s) || String(q.answer).includes(s)));
  $("#qbCount").textContent = `${fa(rows.length)} سؤال`;
  $("#qbList").innerHTML = rows.map((q, i) => `<div class="qb-item">
      <div class="qb-meta"><span class="badge">${esc(q.type)}</span>
        <span class="badge lv-${levelOf(q)}">${levelOf(q)}${q.level ? "" : " (تخمینی)"}</span>
        ${q.source === "معلم" ? `<span class="badge joint">👩‍🏫 معلم</span>` : q.edited ? `<span class="badge conf">✏️ ویرایش معلم</span>` : ""}
        <span class="hint">${esc(q.lesson.title)}</span></div>
      <div class="qb-q">${esc(q.q)}</div>
      ${q.options && q.options.length ? `<ol class="qb-opts">${q.options.map(o => `<li>${esc(o)}</li>`).join("")}</ol>` : ""}
      <div class="qb-ans">✅ ${esc(q.answer)}</div>
      <div class="qb-tools"><button class="ghost" data-ed="${i}">✏️ ویرایش</button>
        <button class="ghost" data-del="${i}">🗑 حذف</button>
        ${q.edited ? `<button class="ghost" data-reset="${i}">↩️ نسخه‌ی اصلی</button>` : ""}</div>
    </div>`).join("") || `<div class="closed">سؤالی پیدا نشد.</div>`;
  $("#qbList").querySelectorAll("[data-ed]").forEach(b => b.onclick = () => openQForm(rows[b.dataset.ed]));
  $("#qbList").querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    if (!confirm("این سؤال از بانک حذف شود؟")) return;
    await api("/api/question", { key: rows[b.dataset.del].key, value: null }); toast("حذف شد"); loadQbank();
  });
  $("#qbList").querySelectorAll("[data-reset]").forEach(b => b.onclick = async () => {
    await api("/api/question", { key: rows[b.dataset.reset].key, value: "reset" }); toast("نسخه‌ی اصلی برگشت ✅"); loadQbank();
  });
}

// add (q = null) or edit a question
function openQForm(q) {
  const lid = q ? q.lesson.lesson_id : ($("#qbLesson").value || (QB.pool[0] || {}).lesson_id);
  const type = q ? q.type : "تستی", opts = q && q.options && q.options.length ? q.options : ["", "", "", ""];
  const right = q && /گزینه\s*([۱۲۳۴1-4])/.test(q.answer) ? "۱۲۳۴1234".indexOf(q.answer.match(/گزینه\s*([۱۲۳۴1-4])/)[1]) % 4 : 0;
  $("#qbForm").innerHTML = `<div class="qb-form">
    <b>${q ? "✏️ ویرایش سؤال" : "➕ سؤال جدید"}</b>
    <div class="qb-row">
      <label>درس <select id="qfLesson" ${q ? "disabled" : ""}>${QB.pool.map(l => `<option value="${l.lesson_id}" ${l.lesson_id === lid ? "selected" : ""}>${esc(l.title)}</option>`).join("")}</select></label>
      <label>نوع <select id="qfType">${EX_TYPES.map(t => `<option ${t === type ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>سطح <select id="qfLevel">${EX_LEVELS.map(l => `<option ${l === (q ? levelOf(q) : "متوسط") ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <label class="field"><span>متن سؤال (برای جای خالی از ............ استفاده کنید)</span><textarea id="qfText" rows="2">${esc(q ? q.q : "")}</textarea></label>
    <div id="qfOpts" ${type === "تستی" ? "" : "hidden"}>${opts.map((o, j) => `<label class="qb-opt">
      <input type="radio" name="qfRight" value="${j}" ${j === right ? "checked" : ""} title="گزینه‌ی درست">
      ${"الف ب ج د".split(" ")[j]}) <input class="qfOpt" value="${esc(o)}"></label>`).join("")}<span class="hint">دایره‌ی کنار گزینه‌ی درست را انتخاب کنید.</span></div>
    <label class="field" id="qfAnsBox" ${type === "تستی" ? "hidden" : ""}><span>پاسخ (برای پاسخ‌نامه‌ی معلم)</span><textarea id="qfAns" rows="2">${esc(q && type !== "تستی" ? q.answer : "")}</textarea></label>
    <div class="save-row"><button id="qfSave">💾 ذخیره</button><button id="qfCancel" class="ghost">انصراف</button></div></div>`;
  $("#qfType").onchange = () => { const mc = $("#qfType").value === "تستی"; $("#qfOpts").hidden = !mc; $("#qfAnsBox").hidden = mc; };
  $("#qfCancel").onclick = () => $("#qbForm").innerHTML = "";
  $("#qfSave").onclick = async () => {
    const t = $("#qfType").value, text = $("#qfText").value.trim();
    if (!text) return toast("متن سؤال را بنویسید");
    const v = { type: t, level: $("#qfLevel").value, q: text, options: [], answer: $("#qfAns").value.trim() };
    if (t === "تستی") {
      v.options = [...document.querySelectorAll(".qfOpt")].map(i => i.value.trim()).filter(Boolean);
      if (v.options.length < 2) return toast("دست‌کم دو گزینه بنویسید");
      const r = Number(document.querySelector('input[name="qfRight"]:checked').value);
      v.answer = `گزینه ${fa(Math.min(r, v.options.length - 1) + 1)}`;
    }
    if (!q) v.lesson_id = $("#qfLesson").value;
    else if (q.source === "معلم") v.lesson_id = q.lesson.lesson_id;
    await api("/api/question", { key: q ? q.key : null, value: v });
    $("#qbForm").innerHTML = ""; toast("ذخیره شد ✅ در کاربرگ و آزمون هم به کار می‌رود"); loadQbank();
  };
  $("#qbForm").scrollIntoView({ behavior: "smooth" });
}
