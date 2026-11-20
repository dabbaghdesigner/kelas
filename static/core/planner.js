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
  const ALL_CODES = [...Object.keys(TT.weekly_hours), ...Object.values(TT.attached || {})];
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
  const QUESTIONS = {};
  for (const [lid, qs] of Object.entries(DATA.questions)) QUESTIONS[lid] = [...qs];
  for (const q of STATE.teacher_questions || []) {
    const qs = QUESTIONS[q.lesson_id] = QUESTIONS[q.lesson_id] || [];
    if (!qs.some(x => x.q === q.q)) qs.push({ type: q.type, q: q.q, answer: q.answer || "", source: q.source, options: q.options || [] });
  }

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
        const k = K(it.grade, codeOf(it.subject)); prog[k] = (prog[k] || 0) + 1;
      }
    return prog;
  }

  // ------------------------------------------------------------ calendar
  function closed(day) {
    if (Jalali.weekday(day) > 4) return "پنجشنبه/جمعه";
    const key = Jalali.key(day, "-");
    if (CAL.holidays[key]) return CAL.holidays[key];
    for (const b of CAL.breaks) if (Jalali.parse(b.from) <= day && day <= Jalali.parse(b.to)) return b.name;
    return null;
  }
  const nextSchoolDay = day => { day++; while (closed(day)) day++; return day; };
  const prevSchoolDay = day => { day--; while (closed(day)) day--; return day; };

  // ------------------------------------------------------------ planning
  function mode(code, dayIdx, period) {
    if (TT.joint_subjects.includes(code)) return ["گروهی (هر دو پایه با هم)", ""];
    return ["درس مشترک، نیم‌زنگ چرخشی", (dayIdx + period) % 2 ? "۶" : "۵"];
  }

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
    const take = k => { const i = (prog[k] || 0) + (used[k] || 0); used[k] = (used[k] || 0) + 1; return i; };
    TT.days[info.weekday].forEach((code, i) => {
      const p = i + 1, per = TT.periods[i];
      const [m, first] = mode(code, wd, p);
      const conference = (TT.conference_subjects || []).includes(code);
      const item = { no: p, time: `${per.start}–${per.end}`, code, subject: FA[code],
                     mode: conference ? "کنفرانس دانش‌آموزان" : m, first, conference, joint: !first, grades: [] };
      for (const g of GRADES) {
        const idx = take(K(g, code)), q = QUEUES[K(g, code)];
        const entry = { grade: g, session_no: idx + 1, logged: logged[`${p}|${g}|${code}`] || null };
        // a book without its own period rides along (Khat in Imla, KarFanavari in Honar)
        const xc = attached[code];
        if (xc && QUEUES[K(g, xc)]) {
          const xq = QUEUES[K(g, xc)], xi = take(K(g, xc));
          if (xi < xq.length) entry.extra = { ...xq[xi], code: xc, subject: EXTRA_FA[xc], logged: logged[`${p}|${g}|${xc}`] || null };
        }
        if (!q) Object.assign(entry, { has_content: false, title: `جلسه ${idx + 1}` });
        else if (idx >= q.length) Object.assign(entry, { has_content: false, title: "کتاب تمام شد — مرور و جبرانی" });
        else {
          const s = q[idx];
          Object.assign(entry, { has_content: true, ...s, questions: QUESTIONS[s.lesson_id] || [],
            previous: idx ? q[idx - 1].title : null, previous_pages: idx ? q[idx - 1].pages : null,
            next_session: idx + 1 < q.length ? q[idx + 1] : null });
        }
        item.grades.push(entry);
      }
      item.timing = timing(item);
      info.periods.push(item);
    });
    return info;
  }

  function timing(item) {
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
      if (g.has_content) done[K(g.grade, p.code)] = (done[K(g.grade, p.code)] || 0) + 1;
    const nxt = nextSchoolDay(day), tomorrow = planFor(nxt, done);
    const weekend = nxt - day > 1;  // e.g. Wednesday → Saturday
    const weekLessons = weekend ? taughtThisWeek(day) : {};
    const prog = progressBefore(Jalali.key(nxt));
    for (const [k, n] of Object.entries(done)) prog[k] = (prog[k] || 0) + n;

    const lastTaught = (g, code) => {  // today's lesson of this subject, or the most recently finished one
      for (const p of today.periods) if (p.code === code) {
        const e = p.grades.find(x => x.grade === g);
        if (e.has_content) return e;
      }
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
      for (const p of today.periods) {
        const e = p.grades.find(x => x.grade === g);
        if (p.conference && e.has_content)
          add(p.code, "today", `کاربرگ ۱۰ سؤالی درس «${e.title}» را در دفتر ${faName(p.code)} بنویس و حل کن. ` +
                               "جلسه‌ی بعد از همین سؤال‌ها پرسیده می‌شود؛ آنها را خوب بخوان.");
      }
      const seen = new Set(["Riazi", "Farsi"]);
      for (const p of tomorrow.periods || []) {
        const code = p.code, e = p.grades.find(x => x.grade === g);
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
      const sheets = today.periods.flatMap(p => p.grades.filter(e => e.grade === g && e.questions && e.questions.length)
                                                         .map(e => `${p.subject}: ${e.title}`));
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
      for (const p of planFor(d).periods) {
        if (["Varzesh", "Honar", "Tafakor", "Negaresh", "Insha"].includes(p.code)) continue;
        for (const e of p.grades) if (e.has_content && e.logged !== "خیر") {
          const ls = found[e.grade][p.code] = found[e.grade][p.code] || [];
          if (ls.every(x => x.lesson_id !== e.lesson_id))
            ls.push({ lesson_id: e.lesson_id, title: e.title, pages: e.pages, subject: p.subject, questions: e.questions });
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

  return { planFor, homework, taughtThisWeek, settings, lessons, startForTaughtUntil, closed, nextSchoolDay, prevSchoolDay,
           progressBefore, faName, codeOf, ALL_CODES, GRADES };
}
