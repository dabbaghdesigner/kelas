// 📝 Exam builder: pick grade, subject, chapters/lessons and how many questions of each type or difficulty;
// the paper is built from the question bank, editable, and saved as PDF (A4/A5, via print) or a picture.
const EX_TYPES = ["جای خالی", "تستی", "جواب کوتاه", "جواب بلند"];
const EX_LEVELS = ["ساده", "متوسط", "دشوار"];
const EX_HELP = { "جای خالی": "جاهای خالی را با کلمه‌ی مناسب کامل کنید.", "تستی": "گزینه‌ی درست را علامت بزنید.",
                  "جواب کوتاه": "به پرسش‌های زیر کوتاه پاسخ دهید.", "جواب بلند": "به پرسش‌های زیر کامل پاسخ دهید." };
const EX_WEIGHT = { "جای خالی": 1, "تستی": 1, "جواب کوتاه": 1.5, "جواب بلند": 2.5 };
const EX_SUBJECTS = ["Riazi", "Farsi", "Olom", "Ejtemaee", "Hedye", "Quran", "Negaresh", "Tafakor"];
// until questions carry their own level, it is estimated from the question type
const levelOf = q => q.level || (q.type === "جواب کوتاه" ? "متوسط" : q.type === "جواب بلند" ? "دشوار" : "ساده");
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
let EX = { pool: [], items: [], spare: [] };

document.querySelector('[data-tab="exam"]').addEventListener("click", () => { if (!$("#exGrade")) renderExamForm(); });

function renderExamForm() {
  const P = Store.planner;
  $("#tab-exam").innerHTML = `
    <div class="ex-form no-print">
      <div class="ex-step"><b>۱. درس</b>
        <select id="exGrade"><option value="5">پایه پنجم</option><option value="6">پایه ششم</option></select>
        <select id="exSubj">${EX_SUBJECTS.map(c => `<option value="${c}">${esc(P.faName(c))}</option>`).join("")}</select></div>
      <div class="ex-step"><b>۲. فصل‌ها و درس‌ها</b> <span class="hint">(روی نام فصل بزنید تا همه‌ی درس‌هایش انتخاب شود)</span>
        <div id="exLessons"></div></div>
      <div class="ex-step"><b>۳. تعداد سؤال</b>
        <div class="ex-counts"><span class="ex-lab">بر اساس نوع:</span>${EX_TYPES.map(t =>
          `<label>${t} <input type="number" min="0" value="0" data-type="${t}"><small data-av="${t}"></small></label>`).join("")}</div>
        <div class="ex-counts"><span class="ex-lab">بر اساس سختی:</span>${EX_LEVELS.map(l =>
          `<label>${l} <input type="number" min="0" value="0" data-level="${l}"><small data-av="${l}"></small></label>`).join("")}</div>
        <p class="hint">می‌توانید هر دو را با هم پر کنید (مثلاً ۲ تستی + ۲ دشوار). سختی فعلاً از نوع سؤال تخمین زده می‌شود:
          جای خالی و تستی ساده، جواب کوتاه متوسط، جواب بلند دشوار.</p></div>
      <div class="ex-step"><b>۴. برگه</b>
        <label>عنوان <input id="exTitle" size="26"></label>
        <label>نمره‌ی کل <input id="exTotal" type="number" min="1" value="20" style="width:60px"></label>
        <label>زمان <input id="exTime" value="۴۵ دقیقه" size="8"></label>
        <label><input type="radio" name="exSize" value="a4" checked> A4</label>
        <label><input type="radio" name="exSize" value="a5"> A5</label>
        <label><input type="checkbox" id="exKey" checked> پاسخ‌نامه (صفحه‌ی جدا، برای معلم)</label></div>
      <div class="toolbar"><button id="exMake">✨ ساخت آزمون</button>
        <button id="exAgain" class="ghost">🔀 سؤال‌های دیگر</button>
        <button id="exAdd" class="ghost">➕ سؤال دستی</button>
        <button id="exPdf">🖨️ PDF / چاپ</button><button id="exPng" class="ghost">⬇️ عکس</button>
        <span id="exMsg" class="hint"></span></div>
    </div>
    <div class="exam-wrap"><div id="exPaper"></div></div>`;
  $("#exGrade").onchange = $("#exSubj").onchange = loadExamPool;
  $("#tab-exam").querySelectorAll(".ex-counts input").forEach(i => i.oninput = availability);
  $("#exMake").onclick = $("#exAgain").onclick = makeExam;
  $("#exAdd").onclick = () => {
    const type = prompt("نوع سؤال: جای خالی / تستی / جواب کوتاه / جواب بلند", "جواب کوتاه");
    if (!type) return;
    EX.items.push({ type: EX_TYPES.includes(type) ? type : "جواب کوتاه", q: "متن سؤال را اینجا بنویسید",
                    options: type === "تستی" ? ["", "", "", ""] : [], answer: "" });
    drawExam();
  };
  $("#tab-exam").querySelectorAll('input[name="exSize"], #exKey, #exTotal, #exTime, #exTitle').forEach(i => i.oninput = i.onchange = drawExam);
  $("#exPdf").onclick = () => { if (!EX.items.length) return toast("اول «ساخت آزمون» را بزنید");
    toast("در پنجره چاپ، «Save as PDF» را انتخاب کنید"); printTab("exam"); };
  $("#exPng").onclick = async () => { if (!EX.items.length) return;
    const p = $("#exPaper .ex-page"); p.classList.add("exporting"); await savePng(p, `${$("#exTitle").value}.png`); p.classList.remove("exporting"); };
  loadExamPool();
}

async function loadExamPool() {
  const g = $("#exGrade").value, code = $("#exSubj").value;
  EX.pool = await api(`/api/exam_pool?grade=${g}&code=${code}`);
  $("#exTitle").value = `آزمون ${Store.planner.faName(code)} پایه‌ی ${g === "5" ? "پنجم" : "ششم"}`;
  const chapters = [...new Map(EX.pool.map(l => [l.chapter, l.chapter_title])).entries()];
  $("#exLessons").innerHTML = chapters.map(([ch, ct]) => `<div class="ex-ch">
      <button type="button" class="ghost ex-chb" data-ch="${ch}">فصل ${fa(ch)}: ${esc(ct)}</button>
      ${EX.pool.filter(l => l.chapter === ch).map(l => `<label class="ex-les ${l.questions.length ? "" : "noq"}">
        <input type="checkbox" value="${l.lesson_id}" data-ch="${ch}"> ${esc(l.title)}
        <small>${l.questions.length ? fa(l.questions.length) + " سؤال" : "بدون سؤال"}</small></label>`).join("")}</div>`).join("");
  $("#exLessons").querySelectorAll(".ex-chb").forEach(b => b.onclick = () => {
    const boxes = [...$("#exLessons").querySelectorAll(`input[data-ch="${b.dataset.ch}"]`)];
    const on = !boxes.every(x => x.checked); boxes.forEach(x => x.checked = on); availability();
  });
  $("#exLessons").querySelectorAll("input").forEach(i => i.onchange = availability);
  availability();
}

function chosenQuestions() {
  const ids = new Set([...$("#exLessons").querySelectorAll("input:checked")].map(i => i.value));
  return EX.pool.filter(l => ids.has(l.lesson_id)).flatMap(l => l.questions.map(q => mixOptions({ ...q, options: [...(q.options || [])], lesson: l.title })));
}

// multiple choice: shuffle the options so the right one is not always first; the answer key follows
function mixOptions(q) {
  const m = String(q.answer || "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).match(/گزینه\s*(\d)/);
  if (q.type !== "تستی" || !q.options.length || !m) return q;
  const right = q.options[Number(m[1]) - 1], opts = shuffle([...q.options]);
  return { ...q, options: opts, answer: `گزینه ${fa(opts.indexOf(right) + 1)} (${right})` };
}

function availability() {
  const qs = chosenQuestions();
  EX_TYPES.forEach(t => $(`[data-av="${t}"]`).textContent = `از ${fa(qs.filter(q => q.type === t).length)}`);
  EX_LEVELS.forEach(l => $(`[data-av="${l}"]`).textContent = `از ${fa(qs.filter(q => levelOf(q) === l).length)}`);
  const chosen = $("#exLessons").querySelectorAll("input:checked").length;
  $("#exMsg").textContent = chosen ? `${fa(chosen)} درس انتخاب شده · ${fa(qs.length)} سؤال در بانک` : "یک یا چند درس انتخاب کنید";
}

// round-robin over lessons so every chosen lesson gets its share
function pick(cands, n) {
  const by = new Map();
  shuffle(cands).forEach(q => { if (!by.has(q.lesson)) by.set(q.lesson, []); by.get(q.lesson).push(q); });
  const lists = shuffle([...by.values()]), out = [];
  while (out.length < n && lists.some(l => l.length)) for (const l of lists) if (l.length && out.length < n) out.push(l.shift());
  return out;
}

function makeExam() {
  let rest = chosenQuestions();
  if (!rest.length) return toast("درس‌های انتخاب‌شده هنوز سؤال ندارند");
  const want = [], short = [];
  $("#tab-exam").querySelectorAll(".ex-counts input").forEach(i => { const n = Number(i.value) || 0; if (n) want.push([i.dataset.type, i.dataset.level, n]); });
  if (!want.length) return toast("تعداد سؤال‌ها را مشخص کنید");
  const items = [];
  for (const [type, level, n] of want) {  // types first, then levels from what is left
    const got = pick(rest.filter(q => type ? q.type === type : levelOf(q) === level), n);
    if (got.length < n) short.push(`${type || level}: ${fa(got.length)} از ${fa(n)}`);
    items.push(...got); rest = rest.filter(q => !got.includes(q));
  }
  EX.items = items.sort((a, b) => EX_TYPES.indexOf(a.type) - EX_TYPES.indexOf(b.type));
  EX.spare = rest;
  $("#exMsg").textContent = short.length ? `⚠️ سؤال کافی در بانک نبود — ${short.join("، ")}` : `✅ ${fa(items.length)} سؤال`;
  drawExam();
}

function scores() {  // share the total by question weight, rounded to quarter points
  const total = Number($("#exTotal").value) || 20, w = EX.items.reduce((s, q) => s + (EX_WEIGHT[q.type] || 1), 0);
  const sc = EX.items.map(q => Math.max(0.25, Math.round((EX_WEIGHT[q.type] || 1) / w * total * 4) / 4));
  sc[sc.length - 1] += Math.round((total - sc.reduce((a, b) => a + b, 0)) * 4) / 4;  // exact total
  return sc;
}

function drawExam() {
  const el = $("#exPaper");
  if (!EX.items.length) { el.innerHTML = ""; return; }
  const size = $('input[name="exSize"]:checked').value, sc = scores(), g = $("#exGrade").value;
  const lessons = [...new Set(EX.items.map(q => q.lesson).filter(Boolean))];
  let n = 0, last = null;
  const body = EX.items.map((q, i) => {
    const head = q.type !== last ? `<div class="ex-sec">${esc(q.type)}: ${EX_HELP[q.type] || ""}</div>` : "";
    last = q.type; n++;
    const opts = q.options && q.options.length ? `<div class="ex-opts">${q.options.map((o, j) =>
      `<div><span class="ex-box"></span> ${"الف ب ج د".split(" ")[j] || j + 1}) <span contenteditable data-i="${i}" data-j="${j}">${esc(o)}</span></div>`).join("")}</div>` : "";
    const lines = q.type === "جواب بلند" ? '<div class="ex-line"></div>'.repeat(3) : q.type === "جواب کوتاه" ? '<div class="ex-line"></div>' : "";
    return `${head}<div class="ex-q"><span class="ex-n">${fa(n)}</span>
      <div class="ex-body"><div class="ex-text" contenteditable data-i="${i}">${esc(q.q)}</div>${opts}${lines}</div>
      <span class="ex-sc">${fa(String(sc[i]).replace(".", "/"))} نمره</span>
      <span class="ex-tools no-print"><button class="ghost ex-re" data-i="${i}" title="سؤال دیگر از همین نوع">🔄</button><button class="ghost ex-del" data-i="${i}" title="حذف">✖</button></span></div>`;
  }).join("");
  const key = $("#exKey").checked ? `<div class="ex-page ex-key ${size}"><div class="ex-title">🔑 پاسخ‌نامه — ${esc($("#exTitle").value)}</div>
      <ol>${EX.items.map(q => `<li>${esc(q.answer || "—")}</li>`).join("")}</ol></div>` : "";
  el.innerHTML = `<div class="ex-page ${size}">
      <div class="ex-head"><div>🏫 ${esc(SCHOOL.school || "نام مدرسه")}<br>👩‍🏫 آموزگار: ${esc(SCHOOL.teacher || "")}</div>
        <div class="ex-title" contenteditable>${esc($("#exTitle").value)}</div>
        <div>تاریخ: ${fa(DAY ? DAY.date : "")}<br>زمان: ${esc(fa($("#exTime").value))}</div></div>
      <div class="ex-info"><span>نام و نام خانوادگی: ............................</span><span>پایه‌ی ${g === "5" ? "پنجم" : "ششم"}</span>
        <span class="ex-score">نمره: ........ از ${fa($("#exTotal").value)}</span></div>
      <div class="ex-topics" contenteditable>مباحث: ${esc(lessons.join("، "))}</div>
      ${body}
      <div class="ex-foot">🌟 موفق باشید 🌟</div></div>${key}`;
  el.querySelectorAll(".ex-text").forEach(d => d.oninput = () => EX.items[d.dataset.i].q = d.textContent);
  el.querySelectorAll("[data-j]").forEach(d => d.oninput = () => EX.items[d.dataset.i].options[d.dataset.j] = d.textContent);
  el.querySelectorAll(".ex-del").forEach(b => b.onclick = () => { EX.items.splice(b.dataset.i, 1); drawExam(); });
  el.querySelectorAll(".ex-re").forEach(b => b.onclick = () => {
    const cur = EX.items[b.dataset.i], k = EX.spare.findIndex(q => q.type === cur.type);
    if (k < 0) return toast("سؤال دیگری از این نوع در درس‌های انتخاب‌شده نیست");
    EX.items[b.dataset.i] = EX.spare.splice(k, 1)[0]; EX.spare.push(cur); drawExam();
  });
}
