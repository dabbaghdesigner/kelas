// Planning logic shared by the Windows app and the offline phone app (no server needed).
// Progress for a date = starting point (تنظیمات) + periods marked «انجام شد» on earlier dates,
// so a period that is not marked done is simply offered again next time.
//
// DATA  (from the book bank, read-only): {tt, cal, lessons: [bank rows], questions: {lesson_id: [...]}, img: {lesson_id: {g, folder, offset}}, has_pages}
// STATE (teacher's, synced between devices): see store.js
function makePlanner(DATA, STATE) {
  const TT = DATA.tt, CAL = DATA.cal, GRADES = [5, 6];
  const DAYS = Object.keys(TT.days);  // شنبه..چهارشنبه = weekday 0..4
  const FA = { Quran: "قرآن", Hedye: "هدیه‌های آسمان", Farsi: "فارسی", Negaresh: "نگارش", Imla: "املا", Insha: "انشا",
               Riazi: "ریاضی", Olom: "علوم", Ejtemaee: "مطالعات اجتماعی", Honar: "هنر", Varzesh: "ورزش", Tafakor: "تفکر و پژوهش" };
  const EXTRA_FA = { Khat: "خط تحریری", KarFanavari: "کار و فناوری" };
  const faName = code => FA[code] || EXTRA_FA[code] || code;
  const CODE_OF = Object.fromEntries([...Object.entries(FA), ...Object.entries(EXTRA_FA)].map(([c, f]) => [f, c]));
  const codeOf = fa => CODE_OF[fa] || fa;
  const ALL_CODES = [...new Set([...Object.keys(TT.weekly_hours), ...Object.values(TT.attached || {})])];
  const attached = TT.attached || {};
  const K = (g, code) => `${g}|${code}`;

  // ------------------------------------------------------------ bank (with the teacher's edits laid over it)
  const LESSONS = DATA.lessons.map(row => {
    const ed = (STATE.lesson_edits || {})[row["شناسه"]];
    if (!ed) return row;
    const r = { ...row };
    for (const [k, e] of Object.entries(ed)) r[k] = e.v;
    return r;
  });
  // STATE.question_edits: {key: {v, ts}} — the teacher's question bank changes (🗃️ tab)
  //   key "<lesson_id>|<original text>" → v = edited question | null (deleted) | "reset" (back to the original)
  //   key "new|<id>"                    → v = a question the teacher added (with lesson_id) | null (deleted)
  const QEDITS = STATE.question_edits || {};
  const QUESTIONS = {};
  for (const [lid, qs] of Object.entries(DATA.questions)) QUESTIONS[lid] = qs.flatMap(q => {
    const key = `${lid}|${q.q}`, ed = (QEDITS[key] || {}).v;
    if (ed === null) return [];
    return [ed && ed !== "reset" ? { ...q, ...ed, key, edited: true, original: q } : { ...q, key }];
  });
  for (const q of STATE.teacher_questions || []) {
    const qs = QUESTIONS[q.lesson_id] = QUESTIONS[q.lesson_id] || [];
    if (!qs.some(x => x.q === q.q)) qs.push({ type: q.type, q: q.q, answer: q.answer || "", source: q.source, level: q.level || "", options: q.options || [], key: `${q.lesson_id}|${q.q}` });
  }
  for (const [key, e] of Object.entries(QEDITS))
    if (key.startsWith("new|") && e.v && e.v.lesson_id)
      (QUESTIONS[e.v.lesson_id] = QUESTIONS[e.v.lesson_id] || []).push({ ...e.v, key, source: "معلم" });

  function pageImg(lid, page) {
    const [g, code] = lid.split("-");
    const im = DATA.img[lid] || { g, folder: code, offset: 0 };
    return `pages/${im.g}/${im.folder}/p${String(page + im.offset).padStart(3, "0")}.jpg`;
  }
  const pdfLink = img => { const [, g, folder, name] = img.split("/"); return `books/${g}/${g}-${folder}.pdf#page=${Number(name.slice(1, 4))}`; };

  const QUEUES = {};
  for (const les of LESSONS) {
    const code = codeOf(les["درس"]);
    const n = Number(les["تعداد زنگ"] || 1), p1 = Number(les["از صفحه"]), p2 = Number(les["تا صفحه"]);
    const span = p2 - p1 + 1;
    for (let k = 0; k < n; k++) {
      const a = p1 + Math.floor(span * k / n), b = Math.max(a, p1 + Math.floor(span * (k + 1) / n) - 1);
      (QUEUES[K(les["پایه"], code)] = QUEUES[K(les["پایه"], code)] || []).push({
        lesson_id: les["شناسه"], chapter: les["فصل"], chapter_title: les["عنوان فصل"], title: les["عنوان درس"],
        part: k + 1, parts: n, pages: a !== b ? `${a}–${b}` : String(a), objectives: les["اهداف یادگیری"],
        concepts: les["مفاهیم کلیدی"], key_notes: les["نکات مهم"], method: les["روش تدریس"],
        lesson_plan: les["درسنامه (مراحل زنگ)"], independent: les["فعالیت مستقل"], worksheet_idea: les["ایده کاربرگ"],
        teacher_notes: les["نکات معلم"], teacher_detail: les["شرح بیشتر"], page_img: pageImg(les["شناسه"], a) });
    }
  }

  // ------------------------------------------------------------ progress
  const starts = () => Object.fromEntries(Object.entries(STATE.starts || {}).map(([k, e]) => [k, Number(e.v) || 0]));
  const logEntries = () => Object.entries(STATE.log || {}).sort(([a], [b]) => a < b ? -1 : 1);

  function progressBefore(dateKey) {
    const prog = starts();
    for (const [date, day] of logEntries())
      if (date < dateKey) for (const it of day.items) if (it.done) {
        // count: sessions covered (a conference covers its whole lesson; conference prep covers none)
        const k = K(it.grade, codeOf(it.subject)); prog[k] = (prog[k] || 0) + (it.count ?? 1);
      }
    return prog;
  }

  // ------------------------------------------------------------ timetable (teacher's weekly versions + one-day changes)
  // STATE.timetables: {"1405/09/01": {v: {شنبه: [codes×5], …}, ts}} — a weekly timetable used from that date on
  // STATE.day_changes: {"1405/09/03": {v: {subjects: [codes×5]} | {closed: "reason"} | null, ts}} — only that day
  function weekTable(dateKey) {
    const from = Object.keys(STATE.timetables || {}).filter(k => k <= dateKey && STATE.timetables[k].v).sort().pop();
    return { from: from || null, days: from ? STATE.timetables[from].v : TT.days };
  }
  const dayChange = key => ((STATE.day_changes || {})[key] || {}).v || null;
  function daySubjects(day) {
    const key = Jalali.key(day), ch = dayChange(key);
    return ch && ch.subjects ? ch.subjects : weekTable(key).days[DAYS[Jalali.weekday(day)]];
  }

  // ------------------------------------------------------------ calendar
  function closed(day) {
    if (Jalali.weekday(day) > 4) return "پنجشنبه/جمعه";
    const ch = dayChange(Jalali.key(day));
    if (ch && ch.closed) return ch.closed;
    const key = Jalali.key(day, "-");
    if (CAL.holidays[key]) return CAL.holidays[key];
    for (const b of CAL.breaks) if (Jalali.parse(b.from) <= day && day <= Jalali.parse(b.to)) return b.name;
    return null;
  }
  const nextSchoolDay = day => { day++; while (closed(day)) day++; return day; };
  const prevSchoolDay = day => { day--; while (closed(day)) day--; return day; };

  // ------------------------------------------------------------ planning
  // A timetable slot is either a subject code (both grades, same subject: group / rotation / conference)
  // or {"5": code, "6": code, lead: 5|6} — the teacher teaches the lead grade the whole period («محور»)
  // while the other grade works on its own (نگارش، املای تمرینی، آماده‌سازی کنفرانس، …).
  const isConf = code => (TT.conference_subjects || []).includes(code);
  const slotOf = s => typeof s === "string" ? { 5: s, 6: s, lead: null }
                                            : { 5: s["5"], 6: s["6"], lead: s["5"] === s["6"] ? null : Number(s.lead) || 5 };
  const faNum = n => String(n).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);

  // assumeDone: {"grade|code": n} extra sessions treated as done (for planning tomorrow before today is logged)
  function planFor(day, assumeDone = {}) {
    const key = Jalali.key(day), wd = Jalali.weekday(day), jp = Jalali.parts(day);
    const info = { date: key, weekday: wd <= 4 ? DAYS[wd] : "", month: Jalali.MONTHS[jp.m - 1], day: jp.d,
                   closed: closed(day), periods: [] };
    if (info.closed) return info;
    const prog = progressBefore(key);
    for (const [k, n] of Object.entries(assumeDone)) prog[k] = (prog[k] || 0) + n;
    const logged = {};
    for (const it of (STATE.log[key] || {}).items || [])
      logged[`${it.period}|${it.grade}|${codeOf(it.subject)}`] = it.done ? "بله" : "خیر";
    const used = {};
    const at = k => (prog[k] || 0) + (used[k] || 0);
    const take = (k, n = 1) => { const i = at(k); used[k] = (used[k] || 0) + n; return i; };
    info.changed = !!(dayChange(key) && dayChange(key).subjects);
    daySubjects(day).forEach((raw, i) => {
      const p = i + 1, per = TT.periods[i], slot = slotOf(raw);
      const shared = !slot.lead, code = shared ? slot[5] : slot[slot.lead];
      const conference = shared && isConf(code), joint = shared && TT.joint_subjects.includes(code);
      const first = shared ? (joint || conference ? "" : (wd + p) % 2 ? "۶" : "۵") : faNum(slot.lead);
      const other = slot.lead === 5 ? 6 : 5;
      const item = { no: p, time: `${per.start}–${per.end}`, code, split: !shared, lead: slot.lead, first, conference, joint,
                     subject: shared ? faName(code) : `${faName(slot[slot.lead])} پایه ${faNum(slot.lead)} ⭐ | ${faName(slot[other])} پایه ${faNum(other)}`,
                     mode: conference ? "کنفرانس دانش‌آموزان" : joint ? "گروهی (هر دو پایه با هم)"
                         : shared ? "درس مشترک، نیم‌زنگ چرخشی" : `محور: پایه ${faNum(slot.lead)} — پایه ${faNum(other)} کار مستقل`,
                     grades: [] };
      for (const g of GRADES) {
        const gc = slot[g], q = QUEUES[K(g, gc)];
        const role = conference ? "conference" : joint ? "joint" : shared ? "rotation" : g === slot.lead ? "lead" : "independent";
        const prep = role === "independent" && isConf(gc);  // getting ready for the next conference: nothing is used up
        let idx, count = 1;
        if (prep) { idx = at(K(g, gc)); count = 0; }
        else if (role === "conference" && q && at(K(g, gc)) < q.length) {  // a conference covers the whole lesson
          const s = q[at(K(g, gc))]; count = s.parts - s.part + 1; idx = take(K(g, gc), count);
        } else idx = take(K(g, gc));
        const entry = { grade: g, code: gc, subject: faName(gc), role, prep, count, session_no: idx + 1,
                        logged: logged[`${p}|${g}|${gc}`] || null };
        const code = gc;
        // a book without its own period rides along (Khat in Imla, KarFanavari in Honar)
        const xc = attached[code];
        if (xc && QUEUES[K(g, xc)]) {
          const xq = QUEUES[K(g, xc)], xi = take(K(g, xc));
          if (xi < xq.length) entry.extra = { ...xq[xi], code: xc, subject: EXTRA_FA[xc], logged: logged[`${p}|${g}|${xc}`] || null };
        }
        if (role === "independent" && q && idx < q.length) entry.task = independentTask(gc, q[idx], prep);
        if (!q) Object.assign(entry, { has_content: false, title: `جلسه ${idx + 1}` });
        else if (idx >= q.length) Object.assign(entry, { has_content: false, title: "کتاب تمام شد — مرور و جبرانی" });
        else {
          const s = q[idx];
          Object.assign(entry, { has_content: true, ...s, questions: QUESTIONS[s.lesson_id] || [],
            previous: idx ? q[idx - 1].title : null, previous_pages: idx ? q[idx - 1].pages : null,
            next_session: idx + Math.max(count, 1) < q.length ? q[idx + Math.max(count, 1)] : null });
        }
        item.grades.push(entry);
      }
      item.timing = timing(item);
      info.periods.push(item);
    });
    return info;
  }

  // what the grade that is not the teacher's «محور» does on its own
  function independentTask(code, s, prep) {
    const t = `«${s.title}» (ص ${s.pages})`;
    if (prep) return `آماده‌سازی کنفرانس درس ${t}: درس را بخوانید، خلاصه و ۳ پرسش بنویسید و بین خودتان تقسیم کنید چه کسی کدام بخش را ارائه دهد؛ بعد کاربرگ درس قبل را کامل کنید.`;
    if (code === "Negaresh") return `تمرین‌های نگارش ${t} را در کتاب حل کنید؛ بعد دو نفری کار هم را بخوانید.`;
    if (code === "Imla") return `املای تمرینی ${t}: یک دانش‌آموز متن را آرام می‌خواند و بقیه می‌نویسند؛ بعد با کتاب، کار هم را تصحیح کنید و غلط‌ها را سه بار بنویسید.`;
    return s.independent || `تمرین‌های درس ${t} را حل کنید.`;
  }

  function timing(item) {
    if (item.split) {
      const a = faNum(item.lead), b = faNum(item.lead === 5 ? 6 : 5);
      return [`۰–۵': دستور کار مستقل پایه ${b}`, `۵–۴۰': تدریس کامل پایه ${a} (پایه ${b} کار مستقل)`,
              `۴۰–۴۵': جمع‌بندی پایه ${a} و بازبینی کار پایه ${b}`];
    }
    if (item.conference) return ["۰–۱۰': پرسش از درس قبل (هر دو پایه)",
      "۱۰–۳۰': کنفرانس دانش‌آموزان درس جدید (پایه‌ها به نوبت؛ پایه دیگر یادداشت‌برداری)",
      "۳۰–۴۰': جمع‌بندی، نکات ویژه و کاربرد توسط معلم", "۴۰–۴۵': معرفی کاربرگ و تعیین کنفرانس‌دهنده جلسه بعد"];
    if (item.joint) return ["۰–۴۰': فعالیت گروهی مشترک هر دو پایه", "۴۰–۴۵': جمع‌بندی و تکلیف"];
    const a = item.first, b = a === "۶" ? "۵" : "۶";
    return ["۰–۵': پرسش کوتاه از درس قبل", `۵–۲۲': تدریس مستقیم پایه ${a} | کار مستقل پایه ${b}`,
            `۲۲–۴۰': تدریس مستقیم پایه ${b} | کار مستقل پایه ${a}`, "۴۰–۴۵': جمع‌بندی و تکلیف"];
  }

  // ------------------------------------------------------------ tonight's homework
  const SUBJECT_EMOJI = { Riazi: "🧮", Farsi: "📖", Negaresh: "✏️", Imla: "✍️", Insha: "📝", Quran: "📗", Hedye: "🕌",
    Ejtemaee: "🌍", Olom: "🔬", Tafakor: "💡", Honar: "🎨", Varzesh: "⚽", Khat: "🖋️", KarFanavari: "🛠️" };

  // practice of what was taught today (Farsi and math always) + preparation for tomorrow's subjects
  function homework(day) {
    const today = planFor(day);
    if (today.closed) return { closed: today.closed };
    // if today is not logged yet, treat today's lessons as done when planning tomorrow
    const loggedToday = today.periods.some(p => p.grades.some(g => g.logged));
    const done = {};
    if (!loggedToday) for (const p of today.periods) for (const g of p.grades)
      if (g.has_content) done[K(g.grade, g.code)] = (done[K(g.grade, g.code)] || 0) + g.count;
    const mine = (periods, g) => periods.map(p => [p, p.grades.find(x => x.grade === g)]);  // [period, this grade's entry]
    const nxt = nextSchoolDay(day), tomorrow = planFor(nxt, done);
    const weekend = nxt - day > 1;  // e.g. Wednesday → Saturday
    const weekLessons = weekend ? taughtThisWeek(day) : {};
    const prog = progressBefore(Jalali.key(nxt));
    for (const [k, n] of Object.entries(done)) prog[k] = (prog[k] || 0) + n;

    const lastTaught = (g, code) => {  // today's lesson of this subject, or the most recently finished one
      for (const [, e] of mine(today.periods, g)) if (e.code === code && e.has_content && !e.prep) return e;
      const q = QUEUES[K(g, code)], i = (prog[K(g, code)] || 0) - 1;
      return q && i >= 0 && i < q.length ? q[i] : null;
    };

    const out = GRADES.map(g => {
      const items = [];
      const add = (code, kind, text) => items.push({ emoji: SUBJECT_EMOJI[code] || "📌", subject: faName(code), kind, text });
      const m = lastTaught(g, "Riazi");
      if (m) add("Riazi", "today", `تمرین‌های درس «${m.title}» (ص ${m.pages}) را در دفتر حل کن.`);
      const f = lastTaught(g, "Farsi");
      if (f) add("Farsi", "today", `درس «${f.title}» (ص ${f.pages}) را دو بار با صدای بلند روخوانی کن و ۵ کلمه‌ی دشوارش را سه بار بنویس.`);
      // conference held today → that grade's own 10-question worksheet goes into the subject notebook
      for (const [, e] of mine(today.periods, g))
        if (e.role === "conference" && e.has_content)
          add(e.code, "today", `کاربرگ ۱۰ سؤالی درس «${e.title}» را در دفتر ${faName(e.code)} بنویس و حل کن. ` +
                               "جلسه‌ی بعد از همین سؤال‌ها پرسیده می‌شود؛ آنها را خوب بخوان.");
      const seen = new Set(["Riazi", "Farsi"]);
      for (const [, e] of mine(tomorrow.periods || [], g)) {
        const code = e.code, p = { conference: e.role === "conference" || e.prep };
        if (seen.has(code) || !e.has_content) continue;
        seen.add(code);
        const t = e.title, pg = e.pages;
        if (code === "Quran")
          add(code, "tomorrow", `درس «${t}» (ص ${pg}):\n   ۱) یک یا دو آیه‌ی اول را در دفتر قرآن بخش‌خوانی کن.\n` +
                                "   ۲) از صفحه‌هایی که معنی کلمات دارند، ۵ کلمه پیدا کن و معنی‌اش را بنویس.\n" +
                                "   ۳) آیات را سه بار روان‌خوانی کن و یک آیه‌ی کوتاه را حفظ کن.");
        else if (p.conference)
          add(code, "tomorrow", `کنفرانس درس «${t}» (ص ${pg}) را آماده کن${e.previous ? ` و درس قبل «${e.previous}» را برای پرسش بخوان` : ""}.`);
        else if (code === "Imla") add(code, "tomorrow", `کلمات دشوار درس «${t.replace("املای ", "")}» را تمرین کن؛ فردا املا داریم.`);
        else if (code === "Insha") add(code, "tomorrow", `درباره‌ی موضوع «${t.replace("انشای ", "")}» یک انشا بنویس (مقدمه، بدنه، نتیجه).`);
        else if (code === "Olom") add(code, "tomorrow", `درس «${t}» (ص ${pg}) را یک بار بخوان و یک پرسش درباره‌اش بنویس.`);
        else if (code === "Negaresh") add(code, "tomorrow", "کتاب نگارش را همراه بیاور.");
        else if (code === "Tafakor") add(code, "tomorrow", `درباره‌ی «${t.replace("همراه با پایه ۶: ", "")}» فکر کن و نظرت را با یک دلیل بنویس.`);
      }
      const sheets = mine(today.periods, g).filter(([, e]) => e.questions && e.questions.length && !e.prep)
                                           .map(([, e]) => `${e.subject}: ${e.title}`);
      let week = [];
      if (weekend) {  // review everything taught this week, one line per subject
        for (const [code, ls] of Object.entries(weekLessons[g]))
          add(code, "weekend", "مرور درس‌های این هفته: " + ls.map(l => `«${l.title}» (ص ${l.pages})`).join("، "));
        week = Object.values(weekLessons[g]).flat().filter(l => l.questions.length);
        if (week.length) sheets.push("کاربرگ جمع‌بندی هفته");
      }
      return { grade: g, items, worksheets: sheets, week };
    });
    return { date: today.date, weekday: today.weekday, day: today.day, month: today.month,
             next: { weekday: tomorrow.weekday, day: tomorrow.day, month: tomorrow.month }, weekend, grades: out };
  }

  // {grade: {code: [lesson, ...]}} for every school day from this week's Saturday up to `day`
  function taughtThisWeek(day) {
    const found = Object.fromEntries(GRADES.map(g => [g, {}]));
    for (let d = day - Jalali.weekday(day); d <= day; d++) {
      if (closed(d)) continue;
      for (const p of planFor(d).periods) for (const e of p.grades) {
        if (["Varzesh", "Honar", "Tafakor", "Negaresh", "Insha"].includes(e.code) || e.prep) continue;
        if (e.has_content && e.logged !== "خیر") {
          const ls = found[e.grade][e.code] = found[e.grade][e.code] || [];
          if (ls.every(x => x.lesson_id !== e.lesson_id))
            ls.push({ lesson_id: e.lesson_id, title: e.title, pages: e.pages, subject: e.subject, questions: e.questions });
        }
      }
    }
    return found;
  }

  // ------------------------------------------------------------ settings & content panel
  function settings() {
    const st = starts(), out = [];
    for (const g of GRADES) for (const code of ALL_CODES) {
      const q = QUEUES[K(g, code)];
      if (EXTRA_FA[code] && !q) continue;  // e.g. no Kar-o-Fanavari book for grade 5
      const lessons = [], startsAt = {};
      (q || []).forEach((s, i) => {
        startsAt[s.lesson_id] = startsAt[s.lesson_id] || s.page_img;
        if (s.part === s.parts)  // end of a lesson → choosable checkpoint
          lessons.push({ after: i + 1, pdf: pdfLink(startsAt[s.lesson_id]),
                         label: `فصل ${s.chapter}: ${s.title} (تا ص ${s.pages.split("–").pop()})` });
      });
      out.push({ grade: g, code, subject: faName(code), done: st[K(g, code)] || 0, total: q ? q.length : null, lessons,
                 pdf: q ? pdfLink(q[0].page_img) : null });
    }
    return out;
  }

  function lessons() {
    const prog = progressBefore("9999/99/99"), cum = {};
    return LESSONS.map(row => {
      const les = { ...row }, k = K(les["پایه"], codeOf(les["درس"]));
      const start = cum[k] || 0;
      cum[k] = start + Number(les["تعداد زنگ"] || 1);
      const done = prog[k] || 0;
      les._status = done >= cum[k] ? "done" : done > start ? "current" : "todo";
      les._questions = (QUESTIONS[les["شناسه"]] || []).length;
      les._page_img = pageImg(les["شناسه"], Number(les["از صفحه"]));
      return les;
    });
  }

  // «تا اینجا درس دادم»: the starting point that puts this grade/subject right after (or at) the given lesson
  function startForTaughtUntil(lid, include = true) {
    const [g, code] = lid.split("-"), q = QUEUES[K(g, code)];
    const idx = q.map((s, i) => s.lesson_id === lid ? i : -1).filter(i => i >= 0);
    const target = include ? idx[idx.length - 1] + 1 : idx[0];
    let logged = 0;
    for (const [, day] of logEntries()) for (const it of day.items)
      if (it.done && Number(it.grade) === Number(g) && codeOf(it.subject) === code) logged++;
    return { key: K(Number(g), code), value: target - logged, sessions: target };
  }

  // ------------------------------------------------------------ 🔗 integrated teaching (suggestions only)
  // DATA.integration: [{a, b, kind, theme, hook, joint}] — a lesson of one grade taught together with a related
  // lesson of the other grade. "near" = each lesson is within NEAR lessons of where that grade/subject is now.
  const NEAR = 3;
  const lessonNo = lid => Number(lid.split("-")[2]);
  function whereNow(g, code, prog) {  // number of the lesson this grade/subject is at (book length + 1 when finished)
    const q = QUEUES[K(g, code)] || [], i = prog[K(g, code)] || 0;
    return i < q.length ? lessonNo(q[i].lesson_id) : (q.length ? lessonNo(q[q.length - 1].lesson_id) + 1 : 1);
  }
  function side(lid, prog) {
    const [g, code] = lid.split("-"), row = LESSONS.find(l => l["شناسه"] === lid) || {};
    const now = whereNow(Number(g), code, prog), n = lessonNo(lid);
    return { lesson_id: lid, grade: Number(g), code, subject: faName(code), title: row["عنوان درس"] || lid,
             pages: `${row["از صفحه"]}–${row["تا صفحه"]}`, chapter_title: row["عنوان فصل"] || "",
             distance: n - now, status: n < now ? "done" : n === now ? "current" : "todo" };
  }
  function steps(a, b) {
    const ga = faNum(a.grade), gb = faNum(b.grade);
    return [`۵': شروع مشترک هر دو پایه (پیش‌زمینه مشترک)`,
            `۱۵': تدریس پایه ${ga} — «${a.title}»؛ پایه ${gb} گوش می‌دهد و ۲ نکته مشترک یادداشت می‌کند`,
            `۱۵': پایه ${ga} فعالیت/تمرین درس خودش | تدریس پایه ${gb} — «${b.title}» با یادآوری همان نکته‌ها`,
            `۱۰': پایان مشترک (فعالیت یا مسابقه گروه‌های مختلط ۵ و ۶)`];
  }
  function integration(dateKey = Jalali.key(Jalali.today())) {
    const prog = progressBefore(dateKey);
    return (DATA.integration || []).map((p, i) => {
      const a = side(p.a, prog), b = side(p.b, prog);
      return { ...p, id: i, a, b, steps: steps(a, b), near: Math.abs(a.distance) <= NEAR && Math.abs(b.distance) <= NEAR };
    });
  }
  // pairs whose lesson is in this day's plan (for its grade) and whose partner lesson is near for the other grade
  function integrationFor(plan) {
    if (plan.closed) return [];
    const today = new Set(plan.periods.flatMap(p => p.grades.filter(e => e.has_content).map(e => e.lesson_id)));
    return integration(plan.date).filter(p => (today.has(p.a.lesson_id) && Math.abs(p.b.distance) <= NEAR) ||
                                              (today.has(p.b.lesson_id) && Math.abs(p.a.distance) <= NEAR));
  }

  // weekly hours per grade: weekly_hours, overridden per grade by grade_hours (e.g. Kar-o-Fanavari only in grade 6)
  const budgetFor = (g, code) => ((TT.grade_hours || {})[g] || {})[code] ?? TT.weekly_hours[code];
  const SUBJECTS = Object.keys(TT.weekly_hours).map(code => ({ code, name: faName(code), budget: TT.weekly_hours[code] }));
  const isJoint = code => TT.joint_subjects.includes(code);

  // 📝 exam builder: every lesson of a book with its chapter and bank questions
  function examPool(grade, code) {
    return LESSONS.filter(l => Number(l["پایه"]) === Number(grade) && codeOf(l["درس"]) === code).map(l => ({
      lesson_id: l["شناسه"], chapter: l["فصل"], chapter_title: l["عنوان فصل"], title: l["عنوان درس"],
      pages: `${l["از صفحه"]}–${l["تا صفحه"]}`, questions: QUESTIONS[l["شناسه"]] || [] }));
  }
  return { budgetFor, examPool, integration, integrationFor, slotOf, isConf, isJoint, weekTable, dayChange, daySubjects, SUBJECTS, DAYS, PERIODS: TT.periods, planFor, homework, taughtThisWeek, settings, lessons, startForTaughtUntil, closed, nextSchoolDay, prevSchoolDay,
           progressBefore, faName, codeOf, ALL_CODES, GRADES };
}
