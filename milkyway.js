/* 오늘별 — 은하수 탭: 중심부 골든타임 + 30일 캘린더 */
(function () {
  "use strict";

  var LS_KEY = "todaystar_loc";
  var DEFAULT_LOC = { lat: 37.5665, lon: 126.978 };
  var GC_RA = 266.417, GC_DEC = -29.008; // 은하 중심 (궁수자리 Sgr A*)
  var MIN_ALT = 15;      // 중심부 촬영 최소 고도 (서울 위도에선 최고 23°라 15° 기준)
  var MOON_OK = 0.25;    // 달 밝기 25% 미만이면 떠 있어도 허용

  var $ = function (id) { return document.getElementById(id); };
  var rendered = false;

  function getLoc() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && typeof s.lat === "number") return s;
    } catch (e) {}
    return DEFAULT_LOC;
  }

  function lstDeg(date, lon) {
    var d = (date.getTime() - 946728000000) / 86400000;
    var gmst = (280.46061837 + 360.98564736629 * d) % 360;
    return ((gmst + lon) % 360 + 360) % 360;
  }
  function altAz(ra, dec, date, lat, lon) {
    var ha = (lstDeg(date, lon) - ra) * Math.PI / 180;
    var dr = dec * Math.PI / 180, la = lat * Math.PI / 180;
    var sa = Math.sin(dr) * Math.sin(la) + Math.cos(dr) * Math.cos(la) * Math.cos(ha);
    var alt = Math.asin(Math.max(-1, Math.min(1, sa))) * 180 / Math.PI;
    var az = Math.atan2(-Math.cos(dr) * Math.sin(ha),
      Math.sin(dr) * Math.cos(la) - Math.cos(dr) * Math.sin(la) * Math.cos(ha)) * 180 / Math.PI;
    return { alt: alt, az: (az % 360 + 360) % 360 };
  }
  function gcAlt(date, lat, lon) { return altAz(GC_RA, GC_DEC, date, lat, lon).alt; }
  var DIRS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  function dirName(az) { return DIRS[Math.floor(((az + 22.5) % 360) / 45)]; }

  // 은하수 띠를 따라가는 이정표 (은경 순서, 순환)
  var WAY = [
    ["중심부(궁수)", 266.417, -29.008],
    ["방패(M11)", 282.8, -6.3],
    ["독수리(알타이르)", 297.7, 8.87],
    ["백조(데네브)", 310.36, 45.28],
    ["카시오페이아", 14.18, 60.72],
    ["페르세우스", 35.5, 57.15],
    ["마차부(카펠라)", 79.17, 46.0],
    ["큰개(시리우스 옆)", 105.4, -15.0]
  ];

  // 특정 시각 은하수 띠의 흐름 설명: 보이는 이정표의 시작→최고점→끝
  function bandDesc(date, lat, lon) {
    var pos = WAY.map(function (w) {
      var p = altAz(w[1], w[2], date, lat, lon);
      return { name: w[0], alt: p.alt, az: p.az };
    });
    var vis = pos.map(function (p) { return p.alt > 8; });
    if (vis.every(function (v) { return !v; })) return { text: "띠가 지평선 아래", maxAlt: -90 };
    // 순환 배열에서 가장 긴 연속 가시 구간 찾기
    var n = WAY.length, start = -1;
    for (var i = 0; i < n; i++) {
      if (!vis[i] && vis[(i + 1) % n]) start = (i + 1) % n;
    }
    if (start < 0) start = 0; // 전부 보이는 경우
    var run = [];
    for (i = 0; i < n; i++) {
      var idx = (start + i) % n;
      if (!vis[idx]) break;
      run.push(pos[idx]);
    }
    var top = run.reduce(function (a, b) { return b.alt > a.alt ? b : a; });
    function label(p) {
      return p.name + " " + (p.alt >= 78 ? "천정" : dirName(p.az) + " " + Math.round(p.alt) + "°");
    }
    var parts = [label(run[0])];
    if (top !== run[0] && top !== run[run.length - 1]) parts.push(label(top));
    if (run.length > 1) parts.push(label(run[run.length - 1]));
    return { text: parts.join(" → "), maxAlt: top.alt };
  }
  function fmtTime(d) {
    if (!(d instanceof Date) || isNaN(d)) return "—";
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function fmtDur(ms) {
    var m = Math.round(ms / 60000);
    return m >= 60 ? Math.floor(m / 60) + "시간 " + (m % 60) + "분" : m + "분";
  }
  var WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  function darkWindow(baseDate, lat, lon) {
    var noon = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12);
    var noonNext = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1, 12);
    var t = SunCalc.getTimes(noon, lat, lon);
    var tn = SunCalc.getTimes(noonNext, lat, lon);
    return {
      sunset: t.sunset, sunrise: tn.sunrise,
      darkStart: isNaN(t.night) ? t.nauticalDusk : t.night,
      darkEnd: isNaN(tn.nightEnd) ? tn.nauticalDawn : tn.nightEnd
    };
  }

  // 하룻밤의 은하수 골든타임: 어둠 ∩ 중심부 15°↑ ∩ 달 OK
  function goldenTime(baseDate, lat, lon) {
    var w = darkWindow(baseDate, lat, lon);
    var step = 5 * 60000;
    var best = null, cur = null, total = 0;
    var maxAlt = -90, maxT = null, moonFrac = 0;
    for (var t = w.darkStart.getTime(); t <= w.darkEnd.getTime(); t += step) {
      var d = new Date(t);
      var alt = gcAlt(d, lat, lon);
      if (alt > maxAlt) { maxAlt = alt; maxT = d; }
      var mpos = SunCalc.getMoonPosition(d, lat, lon);
      var mf = SunCalc.getMoonIllumination(d).fraction;
      var ok = alt >= MIN_ALT && (mpos.altitude < 0 || mf < MOON_OK);
      if (ok) {
        total += step;
        if (!cur) cur = [d, d];
        cur[1] = d;
        moonFrac = Math.max(moonFrac, mpos.altitude > 0 ? mf : 0);
      } else if (cur) {
        if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur;
        cur = null;
      }
    }
    if (cur && (!best || cur[1] - cur[0] > best[1] - best[0])) best = cur;
    return { window: best, total: total, maxAlt: maxAlt, maxT: maxT, dark: w };
  }

  function render() {
    rendered = true;
    var loc = getLoc();
    var today = new Date();
    var g = goldenTime(today, loc.lat, loc.lon);

    // 오늘 밤 히어로
    var hero = $("mw-hero");
    var moonNow = SunCalc.getMoonIllumination(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23));
    if (g.window) {
      hero.innerHTML =
        '<div class="card-title">오늘 밤 은하수 중심부 골든타임</div>' +
        '<div class="hero-time">' + fmtTime(g.window[0]) + " ~ " + fmtTime(g.window[1]) + "</div>" +
        '<div class="hero-sub">총 ' + fmtDur(g.total) + " · 최고 고도 " + Math.round(g.maxAlt) + "° 남쪽 (" + fmtTime(g.maxT) + ")</div>" +
        '<div class="badge">달 밝기 ' + Math.round(moonNow.fraction * 100) + "% — 촬영 가능</div>";
    } else if (g.maxAlt >= MIN_ALT) {
      hero.innerHTML =
        '<div class="card-title">오늘 밤 은하수 중심부</div>' +
        '<div class="hero-time">달빛 간섭</div>' +
        '<div class="hero-sub">중심부는 뜨지만(최고 ' + Math.round(g.maxAlt) + "°) 달이 밝아 부적합 · 달 " +
        Math.round(moonNow.fraction * 100) + "%</div>" +
        '<div class="badge warn">아래 달력에서 좋은 밤을 확인하세요</div>';
    } else {
      hero.innerHTML =
        '<div class="card-title">오늘 밤 은하수 중심부</div>' +
        '<div class="hero-time">시즌이 아니에요</div>' +
        '<div class="hero-sub">어두운 시간에 중심부가 ' + MIN_ALT + "° 위로 올라오지 않습니다 (최고 " +
        Math.round(Math.max(g.maxAlt, 0)) + "°)</div>" +
        '<div class="badge warn">중심부 시즌: 대략 3월(새벽)~10월(초저녁)</div>';
    }

    drawMwChart($("mw-chart"), g.dark, loc);

    // 시간대별 상황 (일몰 다음 정시 ~ 일출)
    var hoursBox = $("mw-hours");
    var rows = [];
    var t0 = new Date(g.dark.sunset); t0.setMinutes(0, 0, 0); t0 = t0.getTime() + 3600000;
    for (var t = t0; t < g.dark.sunrise.getTime(); t += 3600000) {
      var d = new Date(t);
      var inDark = t >= g.dark.darkStart.getTime() && t <= g.dark.darkEnd.getTime();
      var core = altAz(GC_RA, GC_DEC, d, loc.lat, loc.lon);
      var band = bandDesc(d, loc.lat, loc.lon);
      var mpos = SunCalc.getMoonPosition(d, loc.lat, loc.lon);
      var mf = SunCalc.getMoonIllumination(d).fraction;
      var moonUp = mpos.altitude > 0;
      var moonOK = !moonUp || mf < MOON_OK;
      var verdict, cls;
      if (!inDark) { verdict = "박명 (하늘 밝음)"; cls = "dim"; }
      else if (!moonOK) { verdict = "달빛 간섭 " + Math.round(mf * 100) + "%"; cls = "warn"; }
      else if (core.alt >= MIN_ALT) { verdict = "★ 중심부 촬영 최적"; cls = "best"; }
      else if (band.maxAlt >= 50) { verdict = "밴드 촬영 좋음"; cls = "good"; }
      else if (band.maxAlt >= 20) { verdict = "밴드 낮음"; cls = "dim"; }
      else { verdict = "은하수 낮음"; cls = "dim"; }
      rows.push(
        '<div class="mw-hour ' + cls + '">' +
        '<div class="mw-hour-top"><b>' + d.getHours() + "시</b>" +
        "<span>중심부 " + (core.alt > 0 ? dirName(core.az) + " " + Math.round(core.alt) + "°" : "지평선 아래") + "</span>" +
        '<span class="mw-verdict">' + verdict + "</span></div>" +
        '<div class="mw-band">' + band.text + (moonUp && moonOK && inDark ? " · 달 " + Math.round(mf * 100) + "%" : "") + "</div></div>"
      );
    }
    hoursBox.innerHTML = rows.join("");

    // 앞으로 30일 중 좋은 밤
    var list = $("mw-days");
    var rows = [];
    for (var i = 0; i < 30; i++) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      var gi = i === 0 ? g : goldenTime(d, loc.lat, loc.lon);
      if (gi.window && gi.total >= 30 * 60000) rows.push({ d: d, g: gi });
    }
    rows.sort(function (a, b) { return b.g.total - a.g.total; });
    var top = rows.slice(0, 8);
    top.sort(function (a, b) { return a.d - b.d; });
    if (!top.length) {
      list.innerHTML = '<div class="detail">앞으로 30일 안엔 좋은 밤이 없어요. 중심부 시즌(3~10월)에 다시 확인해주세요.</div>';
    } else {
      list.innerHTML = top.map(function (r) {
        var mid = new Date((r.g.window[0].getTime() + r.g.window[1].getTime()) / 2);
        var mf = SunCalc.getMoonIllumination(mid).fraction;
        var moonUp = SunCalc.getMoonPosition(mid, loc.lat, loc.lon).altitude > 0;
        var moonLabel = moonUp ? "🌙" + Math.round(mf * 100) + "%" : "달 없음";
        var dd = r.d;
        var label = (dd.getMonth() + 1) + "/" + dd.getDate() + " (" + WEEKDAYS[dd.getDay()] + ")";
        var isToday = dd.toDateString() === today.toDateString();
        return '<div class="mw-day' + (isToday ? " today" : "") + '">' +
          "<b>" + (isToday ? "오늘 · " : "") + label + "</b>" +
          "<span>" + fmtTime(r.g.window[0]) + "~" + fmtTime(r.g.window[1]) + "</span>" +
          '<span class="mw-dur">' + fmtDur(r.g.total) + "</span>" +
          '<span class="mw-moon">' + moonLabel + "</span></div>";
      }).join("");
    }

    $("mw-note").textContent =
      "은하수 중심부(궁수자리)는 이 위도에서 남쪽 하늘 최고 " + Math.round(23.5 + (37.5665 - loc.lat)) +
      "°까지만 올라옵니다. 남쪽이 트이고 어두운 관측지(관측지 탭 참고)에서 찍으세요.";
  }

  function drawMwChart(canvas, w, loc) {
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    var padL = 26, padB = 18, padT = 6;
    var t0 = w.sunset.getTime(), t1 = w.sunrise.getTime();
    var X = function (t) { return padL + (t - t0) / (t1 - t0) * (W - padL - 4); };
    var Y = function (a) { return padT + (1 - a / 45) * (H - padT - padB); }; // 최대 45°로 확대

    g.fillStyle = "#1e2650";
    g.fillRect(padL, padT, W - padL - 4, H - padT - padB);
    g.fillStyle = "#0b1026";
    g.fillRect(X(w.darkStart.getTime()), padT, X(w.darkEnd.getTime()) - X(w.darkStart.getTime()), H - padT - padB);

    g.strokeStyle = "rgba(154,163,207,0.5)";
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(padL, Y(MIN_ALT)); g.lineTo(W - 4, Y(MIN_ALT)); g.stroke();
    g.setLineDash([]);

    g.fillStyle = "#9aa3cf";
    g.font = "10px sans-serif";
    g.textAlign = "right";
    [0, 15, 30, 45].forEach(function (a) { g.fillText(a + "°", padL - 4, Y(a) + 3); });
    g.textAlign = "center";
    var d0 = new Date(t0); d0.setMinutes(0, 0, 0);
    for (var t = d0.getTime(); t <= t1; t += 3600000) {
      var hh = new Date(t).getHours();
      if (hh % 2 === 0 && t >= t0) g.fillText(hh + "시", X(t), H - 5);
    }

    // 달
    g.strokeStyle = "rgba(154,163,207,0.8)";
    g.setLineDash([2, 4]);
    g.beginPath();
    var started = false;
    for (t = t0; t <= t1; t += 10 * 60000) {
      var ma = SunCalc.getMoonPosition(new Date(t), loc.lat, loc.lon).altitude * 180 / Math.PI;
      if (ma < 0 || ma > 45) { started = false; continue; }
      if (!started) { g.moveTo(X(t), Y(ma)); started = true; } else g.lineTo(X(t), Y(ma));
    }
    g.stroke();
    g.setLineDash([]);

    // 은하수 중심부
    g.strokeStyle = "#ffd76a";
    g.lineWidth = 2.5;
    g.beginPath();
    started = false;
    for (t = t0; t <= t1; t += 5 * 60000) {
      var a = gcAlt(new Date(t), loc.lat, loc.lon);
      if (a < 0) { started = false; continue; }
      if (!started) { g.moveTo(X(t), Y(a)); started = true; } else g.lineTo(X(t), Y(a));
    }
    g.stroke();
    g.lineWidth = 1;
  }

  document.querySelectorAll(".tabbar button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.view === "milkyway" && !rendered) render();
    });
  });
  document.addEventListener("todaystar:loc", function () {
    if (rendered) render();
  });
})();
