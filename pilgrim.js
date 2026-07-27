/* Pilgrim's Way — Holy Island crossing times.
   Reads the council data in data/tides.min.json and works out, for every safe
   window, the best time to set off on foot. No dependencies. */

(function () {
  "use strict";

  var MIN = 60000, DAY = 86400000, CYCLE = 745.2 * MIN;
  var WALK = 90; // minutes allowed for the walk
  var ESTIMATE_DAYS = 120; // how far past the council data the tidal-cycle estimate reaches
  var DAYNAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var DATA_FILES = ["data/tides.min.json", "data/tides.json"];

  var real = null;        // the loaded council data
  var allCrossings = [];  // every daylight crossing we can build

  var state = {
    dayTime: midnight(new Date()).getTime(),
    searchFrom: iso(midnight(new Date())),
    searchUntil: iso(new Date(midnight(new Date()).getTime() + 28 * DAY)),
    fromTime: "13:00",
    untilTime: "18:00",
    days: [true, false, false, false, false, false, true],
    results: null,
    copied: null
  };

  /* — small helpers — */

  function midnight(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function tmin(s) { var p = String(s).split(":"); return (parseInt(p[0], 10) || 0) * 60 + (parseFloat(p[1]) || 0); }
  function fmt(date) { return pad(date.getHours()) + ":" + pad(date.getMinutes()); }
  function mins(t) { var p = t.split(":"); return Number(p[0]) * 60 + Number(p[1]); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function longDate(d, withYear) {
    return DAYNAMES[d.getDay()] + " " + d.getDate() + " " + d.toLocaleString("en-GB", { month: "long" }) +
      (withYear ? " " + d.getFullYear() : "");
  }

  /* Rough sunrise/sunset for dates the council data does not cover. */
  function sun(date) {
    var doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / DAY);
    var len = 12.2 + 5.15 * Math.sin(2 * Math.PI * (doy - 81) / 365.25);
    var mo = date.getMonth();
    var noon = (mo >= 3 && mo <= 9) ? 13.2 : 12.2;
    return { rise: (noon - len / 2) * 60, set: (noon + len / 2) * 60 };
  }

  /* — building crossings — */

  /* Two council schemas: {sun:{…}, safe:[{start,end}]} (merged file) and
     [{start,end,photography}] (the older per-month files). */
  function windows(dayIso, entry) {
    if (!entry) return [];
    if (Array.isArray(entry)) {
      return entry.map(function (e) {
        var ph = e.photography || {};
        var s = Date.parse((e.startDate || dayIso) + "T" + e.start + ":00");
        var en = Date.parse((e.endDate || dayIso) + "T" + e.end + ":00");
        if (!isFinite(s) || !isFinite(en) || !ph.sunrise || !ph.sunset) return null;
        return { startMs: s, endMs: en, sun: ph };
      }).filter(Boolean);
    }
    var sn = entry.sun || {};
    if (!sn.sunrise || !sn.sunset) return [];
    return (entry.safe || []).map(function (w) {
      var s = Date.parse(dayIso + "T" + w.start + ":00");
      var en = Date.parse(dayIso + "T" + w.end + ":00");
      if (!isFinite(s) || !isFinite(en)) return null;
      if (en <= s) {
        // Window runs past midnight — reparse against the actual next calendar
        // date rather than adding a flat 24h, which is wrong by an hour on the
        // two UK clock-change nights.
        var next = new Date(dayIso + "T12:00:00");
        next.setDate(next.getDate() + 1);
        en = Date.parse(iso(next) + "T" + w.end + ":00");
        if (!isFinite(en)) return null;
      }
      return { startMs: s, endMs: en, sun: sn };
    }).filter(Boolean);
  }

  /* One crossing: the council publishes the safe window for the causeway;
     the walk starts 90–120 minutes before its midpoint. */
  function make(o) {
    var mid = (o.startMs + o.endMs) / 2;
    var depLate = new Date(Math.round((mid - 90 * MIN) / MIN) * MIN);
    var depEarly = new Date(depLate.getTime() - 30 * MIN);
    var walkEnd = new Date(depLate.getTime() + WALK * MIN);
    var day = midnight(depLate);
    var rel = function (d) { return (d.getTime() - day.getTime()) / MIN; };
    if (rel(depEarly) < o.riseM || rel(walkEnd) > o.setM) return null; // not in daylight

    var barA = o.riseM - 25, span = (o.setM + 25) - barA;
    var pct = function (d) { return Math.max(0, Math.min(100, (rel(d) - barA) / span * 100)); };
    var rise = new Date(day.getTime() + o.riseM * MIN);
    var set = new Date(day.getTime() + o.setM * MIN);
    var cFrom = new Date(o.startMs), cTo = new Date(o.endMs);
    var at = function (m) { return new Date(day.getTime() + Math.round(m) * MIN); };
    var phm = function (k) { return (o.ph && o.ph[k]) ? tmin(o.ph[k]) : null; };

    var dawnM = phm("dawn") != null ? phm("dawn") : o.riseM - 40;
    var duskM = phm("dusk") != null ? phm("dusk") : o.setM + 40;
    var noonM = phm("solar_noon") != null ? phm("solar_noon") : (o.riseM + o.setM) / 2;
    var lenM = Math.round(o.setM - o.riseM);
    var eveM = phm("goldenEveStart") != null ? phm("goldenEveStart") : o.setM - 60;
    var goldLen = Math.max(20, Math.min(240, o.setM - eveM));

    var dep = pct(depEarly), depb = pct(depLate), wb = pct(walkEnd);
    var cf = pct(cFrom), ct = pct(cTo);
    var h = Math.floor(WALK / 60), mm = WALK % 60;

    return {
      key: iso(day) + "T" + fmt(depLate),
      winStart: o.startMs,
      winEnd: o.endMs,
      dayTime: day.getTime(),
      dow: day.getDay(),
      startMins: Math.round(rel(depLate)),
      startTime: depLate.getTime(),
      startLabel: fmt(depLate),
      dateLong: longDate(day),
      safeLabel: fmt(depEarly) + " and " + fmt(depLate),
      causeLabel: fmt(cFrom) + "–" + fmt(cTo),
      causeOpens: fmt(cFrom),
      causeCloses: fmt(cTo),
      arriveLabel: fmt(walkEnd),
      lightLabel: fmt(rise) + "–" + fmt(set),
      dawnLabel: fmt(at(dawnM)),
      duskLabel: fmt(at(duskM)),
      noonLabel: fmt(at(noonM)),
      goldenAmLabel: fmt(at(o.riseM)) + "–" + fmt(at(o.riseM + goldLen)),
      goldenPmLabel: fmt(at(eveM)) + "–" + fmt(at(o.setM)),
      dayLenLabel: Math.floor(lenM / 60) + "h " + pad(lenM % 60) + "m",
      sunriseLabel: fmt(rise),
      sunsetLabel: fmt(set),
      walkLabel: (h ? h + "h" : "") + (mm ? (h ? " " : "") + mm + "m" : ""),
      partOfDay: rel(depLate) < 720 ? "Morning" : (rel(depLate) < 990 ? "Afternoon" : "Evening"),
      estimated: !!o.estimated,
      estLabel: o.estimated ? "Estimated" : "Council data",
      causeLeft: cf.toFixed(1) + "%", causeWidth: Math.max(1, ct - cf).toFixed(1) + "%",
      walkLeft: depb.toFixed(1) + "%", walkWidth: Math.max(2, wb - depb).toFixed(1) + "%"
    };
  }

  function buildCrossings() {
    var out = [], covered = {};
    try {
      var d = real && real.data;
      for (var dayIso in (d || {})) {
        covered[dayIso] = true;
        windows(dayIso, d[dayIso]).forEach(function (w) {
          var c = make({
            startMs: w.startMs, endMs: w.endMs,
            riseM: tmin(w.sun.sunrise), setM: tmin(w.sun.sunset), ph: w.sun
          });
          if (c) out.push(c);
        });
      }

      // Fill the next few months from the tidal cycle where there is no council data.
      var from = midnight(new Date()).getTime() - DAY;
      var until = from + ESTIMATE_DAYS * DAY;
      var seed = Date.parse("2026-07-25T04:05:00");
      var n0 = Math.ceil((from - seed) / CYCLE);
      for (var i = 0; i < 300; i++) {
        var lw = seed + (n0 + i) * CYCLE;
        if (!isFinite(lw) || lw >= until) break;
        var day = midnight(new Date(lw));
        if (covered[iso(day)]) continue;
        var s = sun(day);
        var c = make({ startMs: lw - 175 * MIN, endMs: lw + 175 * MIN, riseM: s.rise, setM: s.set, estimated: true });
        if (c) out.push(c);
      }
      out.sort(function (a, b) { return a.startTime - b.startTime; });
    } catch (e) {
      console.error("crossing build failed", e);
    }
    allCrossings = out;
  }

  /* The next causeway window later the same day — for anyone driving back after a walk. */
  function nextWindow(dayTime, afterMs) {
    var d = real && real.data;
    if (!d) return "";
    var dayIso = iso(new Date(dayTime));
    var later = windows(dayIso, d[dayIso]).filter(function (w) {
      return w.startMs > afterMs && w.startMs < dayTime + DAY;
    }).sort(function (a, b) { return a.startMs - b.startMs; });
    if (!later.length) return "";
    return fmt(new Date(later[0].startMs)) + "–" + fmt(new Date(later[0].endMs));
  }

  /* Safe windows that fall after dark: no walk, but the causeway is still driveable. */
  function darkWindows(dayTime, shown) {
    var d = real && real.data;
    if (!d) return [];
    var used = (shown || []).map(function (c) { return c.winStart; });
    var dayIso = iso(new Date(dayTime));
    var out = [];
    windows(dayIso, d[dayIso]).forEach(function (w) {
      // Only windows that OPEN today — a tail from last night belongs to yesterday.
      if (w.startMs < dayTime || w.startMs >= dayTime + DAY) return;
      if (used.indexOf(w.startMs) > -1) return;
      out.push({ startMs: w.startMs, causeLabel: fmt(new Date(w.startMs)) + "–" + fmt(new Date(w.endMs)) });
    });
    return out.sort(function (a, b) { return a.startMs - b.startMs; });
  }

  /* Is this date covered by either real council data or the tidal-cycle estimate? */
  function hasSourceData(dayTime) {
    var d = real && real.data;
    if (d && d[iso(new Date(dayTime))]) return true;
    var from = midnight(new Date()).getTime() - DAY;
    var until = from + ESTIMATE_DAYS * DAY;
    return dayTime >= from && dayTime < until;
  }

  /* — markup — */

  function barHtml(c) {
    return '<div class="bar">' +
      '<div class="bar-cause" style="left:' + c.causeLeft + ';width:' + c.causeWidth + '"></div>' +
      '<div class="bar-walk" style="left:' + c.walkLeft + ';width:' + c.walkWidth + '"></div>' +
      '</div>';
  }

  function lightHtml(c) {
    return '<details class="disc">' +
      '<summary>Daylight times — dawn to dusk</summary>' +
      '<div class="light-grid">' +
      '<span>Dawn <strong>' + c.dawnLabel + '</strong></span>' +
      '<span>Golden hour <strong>' + c.goldenAmLabel + '</strong></span>' +
      '<span>Sunrise <strong>' + c.sunriseLabel + '</strong></span>' +
      '<span>Solar noon <strong>' + c.noonLabel + '</strong></span>' +
      '<span>Sunset <strong>' + c.sunsetLabel + '</strong></span>' +
      '<span>Golden hour <strong>' + c.goldenPmLabel + '</strong></span>' +
      '<span>Dusk <strong>' + c.duskLabel + '</strong></span>' +
      '<span>Day length <strong>' + c.dayLenLabel + '</strong></span>' +
      '</div></details>';
  }

  function renderHero() {
    var now = Date.now();
    var hero = allCrossings.find(function (c) { return c.startTime > now; }) || allCrossings[0];
    var body = el("hero-body");
    if (!hero) {
      el("hero-countdown").textContent = "";
      el("hero-est").textContent = "";
      body.innerHTML = '<p class="day-sub">No crossing found — the tide data may not have loaded.</p>';
      return;
    }

    var toGo = Math.round((hero.startTime - now) / MIN);
    el("hero-countdown").textContent = toGo < 90 ? "in " + toGo + " minutes"
      : toGo < 1440 ? "in about " + Math.round(toGo / 60) + " hours"
      : "in " + Math.round(toGo / 1440) + " days";
    el("hero-est").textContent = hero.estLabel;

    var nw = nextWindow(hero.dayTime, hero.winStart);
    var shareLabel = state.copied === hero.key ? "Link copied" : "Copy a link to this crossing";

    body.innerHTML =
      '<div class="hero-main">' +
        '<div>' +
          '<div class="hero-date">' + hero.dateLong + '</div>' +
          '<div class="hero-time"><span class="hero-big">' + hero.startLabel + '</span>' +
          '<span class="hero-setoff">set off</span></div>' +
        '</div>' +
        '<div class="hero-facts">' +
          '<span>Set off between <strong>' + hero.safeLabel + '</strong></span>' +
          '<span>Allow about <strong>' + hero.walkLabel + '</strong> to cross</span>' +
          '<span>Daylight <strong>' + hero.lightLabel + '</strong></span>' +
          '<span>Causeway open <strong>' + hero.causeLabel + '</strong>' +
            (nw ? '<em> (next window ' + nw + ')</em>' : '') + '</span>' +
        '</div>' +
      '</div>' +
      '<div>' + barHtml(hero) +
        '<div class="bar-ends"><span>Sunrise ' + hero.sunriseLabel + '</span>' +
        '<span>Sunset ' + hero.sunsetLabel + '</span></div>' +
      '</div>' +
      '<div class="legend">' +
        '<span><span class="swatch" style="background:var(--bar-tarmac)"></span>Causeway open (by car)</span>' +
        '<span><span class="swatch" style="background:var(--color-accent)"></span>Your walk</span>' +
        '<span><span class="swatch" style="background:var(--color-neutral-200)"></span>Daylight</span>' +
      '</div>' +
      '<details class="disc"><summary>Walking one way, with two cars</summary>' +
        '<div class="shuttle">' +
          '<strong>' + hero.causeOpens + '</strong>' +
          '<span>Causeway opens. Drive both cars over, leave one on the island, drive the other back.</span>' +
          '<strong>' + hero.startLabel + '</strong>' +
          '<span>Set off on foot — you should be across by about ' + hero.arriveLabel + '.</span>' +
          '<strong>' + hero.causeCloses + '</strong>' +
          '<span>Causeway closes. Drive home in the car you left, any time before this.</span>' +
        '</div></details>' +
      lightHtml(hero) +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-primary" data-action="share" data-key="' + hero.key + '">' + shareLabel + '</button>' +
        '<button type="button" class="btn btn-outline" data-action="hero-day" data-day="' + hero.dayTime + '">See the whole day</button>' +
      '</div>';
  }

  function renderDay() {
    var dayCrossings = allCrossings.filter(function (c) { return c.dayTime === state.dayTime; });
    var dark = darkWindows(state.dayTime, dayCrossings);
    var day = new Date(state.dayTime);
    var todayTime = midnight(new Date()).getTime();
    var isToday = state.dayTime === todayTime;
    var isPast = state.dayTime < todayTime;

    el("day-heading").textContent = longDate(day, true) +
      (isToday ? " (Today)" : isPast ? " (Historical Data)" : "");
    el("day-summary").textContent = dayCrossings.length === 1
      ? "One daylight crossing"
      : dayCrossings.length + " daylight crossings";
    el("day-input").value = iso(day);

    var vehicleLines = dark.map(function (w) {
      return '<span>Causeway is open for vehicles <strong>' + w.causeLabel + '</strong>.</span>';
    }).join("");

    var html = dayCrossings.map(function (c) {
      var shareLabel = state.copied === c.key ? "Link copied" : "Copy link";
      return '<div class="card">' +
        '<div class="card-head">' +
          '<div class="card-time"><span class="big">' + c.startLabel + '</span><span class="set">set off</span></div>' +
          '<div class="tags"><span class="tag tag-part">' + c.partOfDay + '</span>' +
          '<span class="tag">' + c.estLabel + '</span></div>' +
        '</div>' +
        barHtml(c) +
        '<div class="card-facts">' +
          '<div>Set off between <strong>' + c.safeLabel + '</strong></div>' +
          '<div>Causeway open <strong>' + c.causeLabel + '</strong></div>' +
          '<div>Daylight <strong>' + c.lightLabel + '</strong></div>' +
        '</div>' +
        lightHtml(c) +
        '<button type="button" class="btn-link" data-action="share" data-key="' + c.key + '">' + shareLabel + '</button>' +
        '</div>';
    }).join("");

    if (dayCrossings.length === 1) {
      html += '<div class="placeholder"><span class="dash">—</span>' +
        '<div class="placeholder-body">' +
        "<span>The Pilgrim's Way only has one safe crossing time today.</span>" +
        (vehicleLines ? '<div class="vehicle-lines">' + vehicleLines + '</div>' : '') +
        '</div></div>';
    }

    el("day-cards").innerHTML = html;
    el("day-empty").innerHTML = dayCrossings.length === 0
      ? (hasSourceData(state.dayTime)
          ? '<div class="empty"><span>No daylight crossing on this date — the safe windows fall after dark. ' +
            'Try the day before or after.</span>' +
            (vehicleLines ? '<div class="vehicle-lines">' + vehicleLines + '</div>' : '') + '</div>'
          : '<div class="empty"><span>No tide information available for the selected date.' +
            (real && real.range ? ' Data available from ' + real.range + '.' : '') + '</span></div>')
      : "";
  }

  function renderDayChips() {
    var order = [1, 2, 3, 4, 5, 6, 0];
    el("daychips").innerHTML = order.map(function (i) {
      return '<button type="button" class="daychip" data-action="toggle-day" data-index="' + i + '" ' +
        'aria-pressed="' + (state.days[i] ? "true" : "false") + '">' + DAYNAMES[i].slice(0, 3) + '</button>';
    }).join("");
  }

  function renderSummary() {
    var order = [1, 2, 3, 4, 5, 6, 0];
    var chosen = order.filter(function (i) { return state.days[i]; }).map(function (i) { return DAYNAMES[i]; });
    var which = (chosen.length === 0 || chosen.length === 7) ? "any day"
      : chosen.length > 2 ? chosen.length + " chosen days"
      : chosen.join(" and ");
    el("plain-summary").textContent = "I'll look for " + which +
      ", setting off between " + state.fromTime + " and " + state.untilTime + ".";
  }

  function renderResults() {
    var wrap = el("results-wrap");
    var results = state.results;
    if (!results) { wrap.innerHTML = ""; return; }

    if (!results.length) {
      wrap.innerHTML = '<div class="empty" style="margin-top:30px">Nothing fits those days and times. ' +
        'Widen the time range, add a day, or search further ahead — the tides shift about 50 minutes ' +
        'later each day, so a fortnight usually provides several options.</div>';
      return;
    }

    var shown = results.slice(0, 12);
    var heading = results.length + (results.length === 1 ? " crossing fits" : " crossings fit") +
      (results.length > 12 ? " — showing the first 12" : "");

    wrap.innerHTML = '<div class="results-wrap">' +
      '<div class="results-head"><h4>' + heading + '</h4>' +
      '<button type="button" class="btn-link" data-action="clear-results">Clear</button></div>' +
      '<div class="results">' + shown.map(function (r) {
        var shareLabel = state.copied === r.key ? "Link copied" : "Copy link";
        return '<div class="result">' +
          '<div class="result-left"><span class="result-time">' + r.startLabel + '</span>' +
          '<div class="result-text"><span class="result-date">' + r.dateLong + '</span>' +
          '<span class="result-sub">Set off between ' + r.safeLabel + ' · causeway is open ' +
          r.causeOpens + ' until ' + r.causeCloses + '</span></div></div>' +
          '<div class="result-actions">' +
          '<button type="button" class="pill-btn" data-action="view-day" data-day="' + r.dayTime + '">View day</button>' +
          '<button type="button" class="btn-soft" data-action="share" data-key="' + r.key + '">' + shareLabel + '</button>' +
          '</div></div>';
      }).join("") + '</div></div>';
  }

  function renderDataNote() {
    if (!real) {
      el("data-note").textContent = "Every time shown is estimated from the tidal cycle — " +
        "add the council data file and they become the real figures.";
      return;
    }
    el("data-note").textContent = "Tide times are available from " + real.range + ".";
  }

  function render() {
    renderHero();
    renderDay();
    renderResults();
  }

  /* — actions — */

  function runSearch() {
    var a = midnight(new Date(state.searchFrom + "T12:00:00")).getTime();
    var b = midnight(new Date(state.searchUntil + "T12:00:00")).getTime();
    var lo = mins(state.fromTime), hi = mins(state.untilTime);
    var any = state.days.some(Boolean);
    state.results = allCrossings.filter(function (c) {
      return c.dayTime >= a && c.dayTime <= b &&
        c.startMins >= lo && c.startMins <= hi &&
        (!any || state.days[c.dow]);
    });
    renderResults();
    jumpTo("results-anchor");
  }

  function jumpTo(id) {
    requestAnimationFrame(function () {
      var node = el(id);
      if (!node) return;
      var top = node.getBoundingClientRect().top + (window.pageYOffset || 0) - 24;
      window.scrollTo({ top: top, behavior: "smooth" });
    });
  }

  var copyTimer = null;
  function share(key) {
    var c = allCrossings.find(function (x) { return x.key === key; });
    if (!c) return;
    var url = location.origin + location.pathname + "#c=" + iso(new Date(c.dayTime)) + "&t=" + c.startLabel;
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
    state.copied = key;
    render();
    clearTimeout(copyTimer);
    copyTimer = setTimeout(function () { state.copied = null; render(); }, 2200);
  }

  var PRESETS = [
    { label: "Weekend afternoons, next four weeks", days: [true, false, false, false, false, false, true], from: "12:00", until: "18:00", span: 28 },
    { label: "Any day this week", days: [true, true, true, true, true, true, true], from: "06:00", until: "20:00", span: 7 },
    { label: "Early mornings, next fortnight", days: [true, true, true, true, true, true, true], from: "05:00", until: "10:00", span: 14 }
  ];

  function applyPreset(i) {
    var p = PRESETS[i];
    var todayM = midnight(new Date());
    state.days = p.days.slice();
    state.fromTime = p.from;
    state.untilTime = p.until;
    state.searchFrom = iso(todayM);
    state.searchUntil = iso(new Date(todayM.getTime() + p.span * DAY));
    el("from-time").value = state.fromTime;
    el("until-time").value = state.untilTime;
    el("search-from").value = state.searchFrom;
    el("search-until").value = state.searchUntil;
    renderDayChips();
    renderSummary();
    runSearch();
  }

  /* — wiring — */

  function bind() {
    el("presets").innerHTML = PRESETS.map(function (p, i) {
      return '<button type="button" class="chip" data-action="preset" data-index="' + i + '">' + esc(p.label) + '</button>';
    }).join("");

    el("search-from").value = state.searchFrom;
    el("search-until").value = state.searchUntil;
    renderDayChips();
    renderSummary();

    document.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-action]");
      if (!t) return;
      var a = t.getAttribute("data-action");

      if (a === "prev-day") { state.dayTime -= DAY; renderDay(); }
      else if (a === "next-day") { state.dayTime += DAY; renderDay(); }
      else if (a === "today") { state.dayTime = midnight(new Date()).getTime(); renderDay(); }
      else if (a === "share") { share(t.getAttribute("data-key")); }
      else if (a === "hero-day" || a === "view-day") {
        state.dayTime = Number(t.getAttribute("data-day"));
        renderDay();
        jumpTo("day-section");
      }
      else if (a === "toggle-day") {
        var i = Number(t.getAttribute("data-index"));
        state.days[i] = !state.days[i];
        t.setAttribute("aria-pressed", state.days[i] ? "true" : "false");
        renderSummary();
      }
      else if (a === "search") { runSearch(); }
      else if (a === "clear-results") { state.results = null; renderResults(); }
      else if (a === "preset") { applyPreset(Number(t.getAttribute("data-index"))); }
    });

    el("day-input").addEventListener("change", function (e) {
      var t = midnight(new Date(e.target.value + "T12:00:00")).getTime();
      if (!isNaN(t)) { state.dayTime = t; renderDay(); }
    });
    el("search-from").addEventListener("change", function (e) { state.searchFrom = e.target.value; });
    el("search-until").addEventListener("change", function (e) { state.searchUntil = e.target.value; });
    el("from-time").addEventListener("change", function (e) { state.fromTime = e.target.value; renderSummary(); });
    el("until-time").addEventListener("change", function (e) { state.untilTime = e.target.value; renderSummary(); });
  }

  function spanLabel(a, b) {
    var f = function (s) {
      return new Date(s + "T12:00:00").toLocaleString("en-GB", { month: "long", year: "numeric" });
    };
    return f(a) === f(b) ? f(a) : f(a) + " to " + f(b);
  }

  function loadData(i) {
    i = i || 0;
    if (i >= DATA_FILES.length) { buildCrossings(); render(); renderDataNote(); return; }
    fetch(DATA_FILES[i])
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (f) {
        if (!f || !f.data) return loadData(i + 1);
        var days = Object.keys(f.data).sort();
        f.range = days.length ? spanLabel(days[0], days[days.length - 1]) : "";
        real = f;
        buildCrossings();
        render();
        renderDataNote();
      });
  }

  function start() {
    var m = /[?#&]c=(\d{4}-\d{2}-\d{2})/.exec(location.hash + location.search);
    if (m) {
      var t = midnight(new Date(m[1] + "T12:00:00")).getTime();
      if (!isNaN(t)) state.dayTime = t;
    }
    bind();
    buildCrossings();
    render();
    loadData(0);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
