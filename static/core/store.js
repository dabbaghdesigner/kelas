// Data layer shared by both versions. The planning itself happens in planner.js, in the browser.
//   Windows ("server" mode): bank and state come from app/server.py, which keeps them in the Excel files.
//   Phone   ("pwa" mode):    bank comes from data/bank.json (built by scripts/build_pwa.py), state lives on the phone.
//
// STATE (also the content of a 📤 transfer file) — every entry carries `ts` (ms) so 📥 import can merge by "newest wins":
//   starts:            {"5|Riazi": {v: sessions done before using the app, ts}}
//   log:               {"1405/09/01": {ts, on_track, items: [{period, grade, subject, lesson_id, title, session, done, note}]}}
//   school:            {school, teacher, ts}
//   lesson_edits:      {lesson_id: {column: {v, ts}}}   (content panel edits)
//   teacher_questions: [{lesson_id, type, q, options, answer, source, ts}]
const Store = (() => {
  const MODE = window.APP_MODE || "server";
  const KEY = "classroom-state-v1";
  let DATA = null, STATE = null, P = null;

  const emptyState = () => ({ starts: {}, log: {}, school: { school: "", teacher: "", ts: 0 }, lesson_edits: {}, teacher_questions: [] });
  const normalize = s => Object.assign(emptyState(), s || {});

  async function http(url, body) {
    const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "خطا");
    return j;
  }

  async function init() {
    if (MODE === "server") {
      const raw = await http("api/raw");
      DATA = raw.bank; STATE = normalize(raw.state);
    } else {
      DATA = await (await fetch("data/bank.json")).json();
      try { STATE = normalize(JSON.parse(localStorage.getItem(KEY))); } catch { STATE = emptyState(); }
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    }
    P = makePlanner(DATA, STATE);
  }

  async function persist() {
    if (MODE === "server") {
      await http("api/state", STATE);
      const raw = await http("api/raw");  // bank may have changed (content edits)
      DATA = raw.bank; STATE = normalize(raw.state);
    } else {
      try { localStorage.setItem(KEY, JSON.stringify(STATE)); }
      catch { throw new Error("ذخیره در حافظه گوشی ممکن نشد (حافظه پر است؟)"); }
    }
    P = makePlanner(DATA, STATE);
  }

  // every change: re-read the latest state (another tab may have saved), apply, save
  async function mutate(fn) {
    if (MODE === "server") { STATE = normalize(await http("api/state")); P = makePlanner(DATA, STATE); }
    const out = fn(STATE, Date.now());
    await persist();
    return out;
  }

  // ------------------------------------------------------------ merge (📥 import)
  const newer = (a, b) => (!a || (b && (b.ts || 0) > (a.ts || 0))) ? b : a;
  function merge(a, b) {
    const out = normalize(JSON.parse(JSON.stringify(a)));
    b = normalize(b);
    const n = { days: 0, starts: 0, edits: 0, questions: 0, school: false };
    for (const [k, e] of Object.entries(b.starts)) if (newer(out.starts[k], e) !== out.starts[k]) { out.starts[k] = e; n.starts++; }
    for (const [d, e] of Object.entries(b.log)) if (newer(out.log[d], e) !== out.log[d]) { out.log[d] = e; n.days++; }
    if (newer(out.school, b.school) !== out.school) { out.school = b.school; n.school = true; }
    for (const [id, fields] of Object.entries(b.lesson_edits)) for (const [k, e] of Object.entries(fields)) {
      const cur = (out.lesson_edits[id] || {})[k];
      if (newer(cur, e) !== cur) { (out.lesson_edits[id] = out.lesson_edits[id] || {})[k] = e; n.edits++; }
    }
    for (const q of b.teacher_questions)
      if (!out.teacher_questions.some(x => x.lesson_id === q.lesson_id && x.q === q.q)) { out.teacher_questions.push(q); n.questions++; }
    return { state: out, n };
  }

  function exportFile() {
    // teacher-written questions already in the Windows bank travel too
    const tq = [...STATE.teacher_questions];
    for (const [lid, qs] of Object.entries(DATA.questions)) for (const q of qs)
      if (q.source && q.source !== "کتاب" && !tq.some(x => x.lesson_id === lid && x.q === q.q))
        tq.push({ lesson_id: lid, type: q.type, q: q.q, options: q.options, answer: q.answer, source: q.source, ts: 0 });
    const body = { app: "classroom-multigrade", version: 1, exported_at: new Date().toISOString(),
                   from: MODE === "server" ? "ویندوز" : "گوشی", state: { ...STATE, teacher_questions: tq } };
    const today = Jalali.key(Jalali.today(), "-");
    return { name: `کلاس-${MODE === "server" ? "ویندوز" : "گوشی"}-${today}.json`, text: JSON.stringify(body) };
  }

  async function importText(text) {
    let body;
    try { body = JSON.parse(text); } catch { throw new Error("این فایل، فایل انتقال برنامه نیست."); }
    if (!body || body.app !== "classroom-multigrade" || !body.state) throw new Error("این فایل، فایل انتقال برنامه نیست.");
    if (MODE === "server") STATE = normalize(await http("api/state"));
    const { state, n } = merge(STATE, body.state);
    STATE = state;
    await persist();
    return { ...n, from: body.from, at: body.exported_at };
  }

  // ------------------------------------------------------------ the app's API, answered locally
  function dayFrom(params) {
    const today = Jalali.today();
    let day = params.get("date") ? Jalali.parse(params.get("date")) : (P.closed(today) ? P.nextSchoolDay(today) : today);
    if (params.get("step") === "next") day = P.nextSchoolDay(day);
    if (params.get("step") === "prev") day = P.prevSchoolDay(day);
    return day;
  }

  async function api(url, body) {
    const u = new URL(url, location.href), path = u.pathname.replace(/^.*\/api\//, ""), q = u.searchParams;
    if (!body) switch (path) {
      case "day": return P.planFor(dayFrom(q));
      case "tomorrow": return P.planFor(P.nextSchoolDay(Jalali.today()));
      case "homework": return P.homework(Jalali.parse(q.get("date")));
      case "school": return { school: STATE.school.school || "", teacher: STATE.school.teacher || "" };
      case "settings": return P.settings();
      case "lessons": return { lessons: P.lessons() };
    }
    else switch (path) {
      case "complete": return mutate((s, ts) => {
        s.log[body.date] = { ts, on_track: !!body.on_track, items: body.items.map(it => ({ ...it, done: !!it.done })) };
        return { ok: true };
      });
      case "settings": return mutate((s, ts) => {
        for (const x of body) {
          const k = `${x.grade}|${x.code}`, v = Number(x.done) || 0;
          if (((s.starts[k] || {}).v || 0) !== v) s.starts[k] = { v, ts };
        }
        return { ok: true };
      });
      case "school": return mutate((s, ts) => {
        s.school = { school: (body.school || "").trim(), teacher: (body.teacher || "").trim(), ts };
        return { ok: true };
      });
      case "lesson": return mutate((s, ts) => {
        const ed = s.lesson_edits[body.id] = s.lesson_edits[body.id] || {};
        for (const [k, v] of Object.entries(body.fields)) ed[k] = { v, ts };
        return { ok: true };
      });
      case "taught_until": return mutate((s, ts) => {
        const r = P.startForTaughtUntil(body.id, body.include !== false);
        s.starts[r.key] = { v: r.value, ts };
        return { ok: true, sessions: r.sessions };
      });
    }
    throw new Error("نامعلوم: " + path);
  }

  return { init, api, exportFile, importText, merge, get MODE() { return MODE; }, get HAS_PAGES() { return !!DATA.has_pages; },
           get STATE() { return STATE; }, get planner() { return P; } };
})();
