/* 오늘별 — 행성 · 유성우 · 밤 대기 · ISS 카드 (오늘 탭) */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var RAD = Math.PI / 180;
  var DIRS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  function dirName(az) { return DIRS[Math.floor(((az + 22.5) % 360) / 45)]; }
  function fmtTime(d) {
    if (!(d instanceof Date) || isNaN(d)) return "—";
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function rev(x) { return ((x % 360) + 360) % 360; }

  /* ============ 행성 위치 (Schlyter 근사, 계획용 정확도 ~0.1°) ============ */

  function dayNum(date) { return date.getTime() / 86400000 - 10957.5 + 0.5; } // days since 2000-01-00 UTC

  var PLANETS = [
    ["수성", function (d) { return { N: 48.3313 + 3.24587e-5 * d, i: 7.0047, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635, M: 168.6562 + 4.0923344368 * d }; }],
    ["금성", function (d) { return { N: 76.6799 + 2.4659e-5 * d, i: 3.3946, w: 54.8910 + 1.38374e-5 * d, a: 0.723330, e: 0.006773, M: 48.0052 + 1.6021302244 * d }; }],
    ["화성", function (d) { return { N: 49.5574 + 2.11081e-5 * d, i: 1.8497, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405, M: 18.6021 + 0.5240207766 * d }; }],
    ["목성", function (d) { return { N: 100.4542 + 2.76854e-5 * d, i: 1.3030, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498, M: 19.8950 + 0.0830853001 * d }; }],
    ["토성", function (d) { return { N: 113.6634 + 2.38980e-5 * d, i: 2.4886, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546, M: 316.9670 + 0.0334442282 * d }; }]
  ];

  function heliXYZ(el) {
    var M = rev(el.M) * RAD, e = el.e;
    var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (var k = 0; k < 8; k++) {
      E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }
    var xv = el.a * (Math.cos(E) - e);
    var yv = el.a * Math.sqrt(1 - e * e) * Math.sin(E);
    var v = Math.atan2(yv, xv), r = Math.sqrt(xv * xv + yv * yv);
    var N = rev(el.N) * RAD, i = el.i * RAD, w = rev(el.w) * RAD;
    return {
      x: r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i)),
      y: r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i)),
      z: r * Math.sin(v + w) * Math.sin(i)
    };
  }

  function sunXYZ(d) {
    var w = rev(282.9404 + 4.70935e-5 * d) * RAD;
    var e = 0.016709 - 1.151e-9 * d;
    var M = rev(356.0470 + 0.9856002585 * d) * RAD;
    var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    var xv = Math.cos(E) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E);
    var v = Math.atan2(yv, xv), r = Math.sqrt(xv * xv + yv * yv);
    var lon = v + w;
    return { x: r * Math.cos(lon), y: r * Math.sin(lon), z: 0 };
  }

  // 행성의 지구 중심 적경·적위
  function planetRaDec(pi, date) {
    var d = dayNum(date);
    var p = heliXYZ(PLANETS[pi][1](d));
    var s = sunXYZ(d);
    var x = p.x + s.x, y = p.y + s.y, z = p.z + s.z;
    var ecl = (23.4393 - 3.563e-7 * d) * RAD;
    var xe = x, ye = y * Math.cos(ecl) - z * Math.sin(ecl), ze = y * Math.sin(ecl) + z * Math.cos(ecl);
    return {
      ra: rev(Math.atan2(ye, xe) / RAD),
      dec: Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) / RAD,
      dist: Math.sqrt(x * x + y * y + z * z)
    };
  }

  function lstDeg(date, lon) {
    var d = (date.getTime() - 946728000000) / 86400000;
    return rev(280.46061837 + 360.98564736629 * d + lon);
  }
  function altAzOf(ra, dec, date, lat, lon) {
    var ha = (lstDeg(date, lon) - ra) * RAD;
    var dr = dec * RAD, la = lat * RAD;
    var sa = Math.sin(dr) * Math.sin(la) + Math.cos(dr) * Math.cos(la) * Math.cos(ha);
    var alt = Math.asin(Math.max(-1, Math.min(1, sa))) / RAD;
    var az = Math.atan2(-Math.cos(dr) * Math.sin(ha),
      Math.sin(dr) * Math.cos(la) - Math.cos(dr) * Math.sin(la) * Math.cos(ha)) / RAD;
    return { alt: alt, az: rev(az) };
  }

  function nightSpan(date, lat, lon) {
    var noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    var noonN = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12);
    var t = SunCalc.getTimes(noon, lat, lon);
    var tn = SunCalc.getTimes(noonN, lat, lon);
    return { s: t.sunset, e: tn.sunrise, ds: isNaN(t.night) ? t.nauticalDusk : t.night, de: isNaN(tn.nightEnd) ? tn.nauticalDawn : tn.nightEnd };
  }

  var PLANET_COLORS = ["#9aa3cf", "#ffe08a", "#ff7a5c", "#ffb46b", "#7fd6c2"];

  function renderPlanets(date, lat, lon) {
    var canvas = $("planet-chart");
    var legend = $("planet-legend");
    if (!canvas || !legend) return;
    var w = nightSpan(date, lat, lon);
    var mid = new Date((w.s.getTime() + w.e.getTime()) / 2);

    var dpr = window.devicePixelRatio || 1;
    var W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    var padL = 26, padB = 18, padT = 6;
    var t0 = w.s.getTime(), t1 = w.e.getTime();
    var X = function (t) { return padL + (t - t0) / (t1 - t0) * (W - padL - 4); };
    var Y = function (a) { return padT + (1 - a / 90) * (H - padT - padB); };

    // 배경: 박명 / 완전한 어둠
    g.fillStyle = "#1e2650";
    g.fillRect(padL, padT, W - padL - 4, H - padT - padB);
    g.fillStyle = "#0b1026";
    g.fillRect(X(w.ds.getTime()), padT, X(w.de.getTime()) - X(w.ds.getTime()), H - padT - padB);

    // 눈금
    g.fillStyle = "#9aa3cf";
    g.font = "10px sans-serif";
    g.textAlign = "right";
    [0, 30, 60, 90].forEach(function (a) { g.fillText(a + "°", padL - 4, Y(a) + 3); });
    g.textAlign = "center";
    var d0 = new Date(t0); d0.setMinutes(0, 0, 0);
    for (var t = d0.getTime(); t <= t1; t += 3600000) {
      var hh = new Date(t).getHours();
      if (hh % 2 === 0 && t >= t0) g.fillText(hh + "시", X(t), H - 5);
    }

    var legendHTML = "";
    PLANETS.forEach(function (pl, pi) {
      var rd = planetRaDec(pi, mid);
      var maxAlt = -90, maxT = null, maxAz = 0, started = false;
      g.strokeStyle = PLANET_COLORS[pi];
      g.lineWidth = 2;
      g.beginPath();
      for (var t = t0; t <= t1; t += 10 * 60000) {
        var p = altAzOf(rd.ra, rd.dec, new Date(t), lat, lon);
        if (p.alt > maxAlt) { maxAlt = p.alt; maxT = new Date(t); maxAz = p.az; }
        if (p.alt < 0) { started = false; continue; }
        if (!started) { g.moveTo(X(t), Y(p.alt)); started = true; }
        else g.lineTo(X(t), Y(p.alt));
      }
      g.stroke();
      var status = maxAlt < 5
        ? '<span class="pl-no">안 보임</span>'
        : "<b>" + fmtTime(maxT) + "</b> " + Math.round(maxAlt) + "° " + dirName(maxAz);
      legendHTML += '<span class="pl-leg"><i style="background:' + PLANET_COLORS[pi] + '"></i>' +
        pl[0] + " " + status + "</span>";
    });
    g.lineWidth = 1;
    legend.innerHTML = legendHTML;
  }

  /* ============ 유성우 ============ */

  var SHOWERS = [
    ["사분의자리", 1, 4, 110, "북동"],
    ["거문고자리", 4, 22, 18, "북동"],
    ["물병자리 에타", 5, 6, 50, "동"],
    ["물병자리 델타", 7, 30, 25, "남"],
    ["페르세우스자리", 8, 13, 100, "북동"],
    ["오리온자리", 10, 21, 20, "남동"],
    ["사자자리", 11, 17, 15, "동"],
    ["쌍둥이자리", 12, 14, 150, "동"],
    ["작은곰자리", 12, 22, 10, "북"]
  ];

  function renderMeteors(date, lat, lon) {
    var box = $("meteor-list");
    if (!box) return;
    var base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var rows = [];
    SHOWERS.forEach(function (s) {
      var peak = new Date(base.getFullYear(), s[1] - 1, s[2]);
      if (peak < base) peak = new Date(base.getFullYear() + 1, s[1] - 1, s[2]);
      var dd = Math.round((peak - base) / 86400000);
      var mf = SunCalc.getMoonIllumination(new Date(peak.getFullYear(), peak.getMonth(), peak.getDate(), 23)).fraction;
      var moon = mf < 0.3 ? ["good", "달빛 없음 — 최적"] : mf < 0.6 ? ["ok", "달빛 약간"] : ["bad", "달빛 방해 " + Math.round(mf * 100) + "%"];
      rows.push({ dd: dd, html: '<div class="mt-row' + (dd <= 1 ? " now" : "") + '">' +
        "<b>" + s[0] + "</b>" +
        "<span>" + (s[1]) + "/" + s[2] + " " + (dd === 0 ? "오늘 밤 극대!" : dd === 1 ? "내일 극대" : "D-" + dd) + "</span>" +
        '<span class="mt-zhr">시간당 ~' + s[3] + "개</span>" +
        '<span class="mt-moon ' + moon[0] + '">' + moon[1] + "</span></div>" });
    });
    rows.sort(function (a, b) { return a.dd - b.dd; });
    box.innerHTML = rows.map(function (r) { return r.html; }).join("") +
      '<div class="detail" style="margin-top:6px">앞으로 1년치 주요 유성우 · 극대일 밤~새벽이 절정 · 달빛 판정은 그해 극대일 기준</div>';
  }

  /* ============ 밤 대기 (7Timer, 프록시 경유) ============ */

  var atmosCache = {};
  function renderAtmos(date, lat, lon) {
    var box = $("atmos-line");
    if (!box) return;
    var key = lat.toFixed(1) + "," + lon.toFixed(1);
    var w = nightSpan(date, lat, lon);
    var mid = new Date((w.ds.getTime() + w.de.getTime()) / 2);
    // 예보는 72시간까지만
    if (mid - Date.now() > 66 * 3600000 || mid < Date.now() - 12 * 3600000) {
      box.textContent = "시상·투명도 예보는 3일 이내 밤만 제공됩니다";
      return;
    }
    var p = atmosCache[key] || (atmosCache[key] = fetch("api/seeing?lat=" + lat.toFixed(3) + "&lon=" + lon.toFixed(3))
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () { return null; }));
    p.then(function (j) {
      if (!j || !j.dataseries) { box.textContent = "대기 예보를 불러오지 못했습니다"; return; }
      var init = j.init; // "2026081206"
      var initMs = Date.UTC(+init.slice(0, 4), +init.slice(4, 6) - 1, +init.slice(6, 8), +init.slice(8, 10));
      var best = null, bestDiff = 1e15;
      j.dataseries.forEach(function (e) {
        var t = initMs + e.timepoint * 3600000;
        var diff = Math.abs(t - mid.getTime());
        if (diff < bestDiff) { bestDiff = diff; best = e; }
      });
      if (!best) { box.textContent = "—"; return; }
      function grade(v) { return v <= 2 ? ["매우 좋음", "good"] : v <= 4 ? ["좋음", "good"] : v <= 6 ? ["보통", "ok"] : ["나쁨", "bad"]; }
      var se = grade(best.seeing), tr = grade(best.transparency);
      box.innerHTML =
        '<div class="row"><span>시상 (별상 흔들림)</span><b class="at-' + se[1] + '">' + se[0] + " (" + best.seeing + "/8)</b></div>" +
        '<div class="row"><span>투명도 (하늘 맑기)</span><b class="at-' + tr[1] + '">' + tr[0] + " (" + best.transparency + "/8)</b></div>" +
        '<div class="detail">행성·달 고배율은 시상, 딥스카이는 투명도가 중요</div>';
    });
  }

  /* ============ ISS 통과 (satellite.js + TLE 프록시) ============ */

  var issDone = false;
  function renderISS(lat, lon) {
    var box = $("iss-list");
    if (!box || issDone) return;
    issDone = true;
    if (typeof satellite === "undefined") { box.textContent = "—"; return; }
    fetch("api/tle")
      .then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (txt) {
        var lines = txt.trim().split("\n").map(function (s) { return s.trim(); });
        var l1 = lines.find(function (s) { return s[0] === "1"; });
        var l2 = lines.find(function (s) { return s[0] === "2"; });
        if (!l1 || !l2) throw 0;
        var rec = satellite.twoline2satrec(l1, l2);
        var obs = { latitude: lat * RAD, longitude: lon * RAD, height: 0.1 };
        var passes = [], cur = null;
        var now = Date.now();
        var DAY = 86400000;

        function evalAt(t) {
          var d = new Date(t);
          var pv = satellite.propagate(rec, d);
          if (!pv.position) return;
          var gmst = satellite.gstime(d);
          var ecf = satellite.eciToEcf(pv.position, gmst);
          var la = satellite.ecfToLookAngles(obs, ecf);
          var el = la.elevation / RAD;
          if (el > 10) {
            // 보이는 조건: 관측자는 어둡고(태양 -6° 이하) ISS는 햇빛을 받아야 함
            var sunAlt = SunCalc.getPosition(d, lat, lon).altitude * 57.29578;
            var dn = dayNum(d);
            var s = sunXYZ(dn);
            var ecl = (23.4393 - 3.563e-7 * dn) * RAD;
            var sx = s.x, sy = s.y * Math.cos(ecl), sz = s.y * Math.sin(ecl);
            var sm = Math.sqrt(sx * sx + sy * sy + sz * sz);
            var r = pv.position;
            var dot = (r.x * sx + r.y * sy + r.z * sz) / sm;
            var rlen2 = r.x * r.x + r.y * r.y + r.z * r.z;
            var sunlit = dot > 0 || Math.sqrt(Math.max(rlen2 - dot * dot, 0)) > 6371;
            var visible = sunAlt < -6 && sunlit;
            if (!cur) cur = { start: d, maxEl: el, maxT: d, maxAz: la.azimuth / RAD, vis: visible, visStart: visible ? d : null };
            else {
              if (el > cur.maxEl) { cur.maxEl = el; cur.maxT = d; cur.maxAz = la.azimuth / RAD; }
              if (visible) { cur.vis = true; if (!cur.visStart) cur.visStart = d; }
            }
            cur.end = d;
          } else if (cur) {
            if (cur.vis) passes.push(cur);
            cur = null;
          }
        }

        // 30일치를 하루 단위로 나눠 계산 (UI 멈춤 방지)
        var dayIdx = 0;
        function crunchDay() {
          var from = now + dayIdx * DAY, to = Math.min(from + DAY, now + 30 * DAY);
          for (var t = from; t < to; t += 30000) evalAt(t);
          dayIdx++;
          if (dayIdx < 30) {
            box.innerHTML = '<div class="detail">통과 계산 중… ' + dayIdx + "/30일</div>";
            setTimeout(crunchDay, 0);
          } else {
            if (cur && cur.vis) passes.push(cur);
            done();
          }
        }
        crunchDay();

        function done() {
          var tf = '<div class="detail" style="margin-top:6px">' +
            "밝은 별처럼 움직이는 점 — 맨눈으로 보입니다 · 먼 날짜일수록 시각 오차(±분)가 커집니다</div>";
          var listHTML;
          if (!passes.length) {
            listHTML = '<div class="detail">앞으로 30일 안엔 밝게 보이는 통과가 없어요</div>' + tf;
          } else {
            var W = ["일", "월", "화", "수", "목", "금", "토"];
            listHTML = passes.slice(0, 12).map(function (p) {
              var d0 = p.visStart || p.start;
              return '<div class="pl-row"><span class="pl-name">' +
                (d0.getMonth() + 1) + "/" + d0.getDate() + " (" + W[d0.getDay()] + ")</span>" +
                "<span><b>" + fmtTime(d0) + "</b> · 최고 " + Math.round(p.maxEl) + "° " + dirName(rev(p.maxAz)) +
                " · " + Math.round((p.end - p.start) / 60000) + "분간</span></div>";
            }).join("") + tf;
          }
          box.innerHTML = listHTML +
            '<div class="t-head" style="margin-top:14px">🌗 달·태양 면 통과 (5일 이내, 내 위치 기준)</div>' +
            '<div id="transit-list" class="detail">계산 중…</div>';
          scanTransits(rec, lat, lon);
        }
      })
      .catch(function () {
        box.innerHTML = '<div class="detail">ISS 정보를 불러오지 못했습니다 (배포 환경에서 작동)</div>';
      });
  }

  /* ============ ISS 달·태양 면 통과 (astronomy-engine 정밀 천체력) ============ */

  function scanTransits(rec, lat, lon) {
    var out = $("transit-list");
    if (!out) return;
    if (typeof Astronomy === "undefined") { out.textContent = "정밀 천체력 로드 실패"; return; }
    var obs = new Astronomy.Observer(lat, lon, 100);
    var obsGd = { latitude: lat * RAD, longitude: lon * RAD, height: 0.1 };

    function issAltAz(t) {
      var d = new Date(t);
      var pv = satellite.propagate(rec, d);
      if (!pv.position) return null;
      var la = satellite.ecfToLookAngles(obsGd, satellite.eciToEcf(pv.position, satellite.gstime(d)));
      return { alt: la.elevation / RAD, az: la.azimuth / RAD };
    }
    function bodyAltAz(body, t) {
      var d = new Date(t);
      var eq = Astronomy.Equator(body, d, obs, true, true);
      var hz = Astronomy.Horizon(d, obs, eq.ra, eq.dec, "");
      return { alt: hz.altitude, az: hz.azimuth };
    }
    function sep(a, b) {
      var a1 = a.alt * RAD, a2 = b.alt * RAD, dz = (a.az - b.az) * RAD;
      var s = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dz);
      return Math.acos(Math.max(-1, Math.min(1, s))) / RAD;
    }
    // 달·해 위치는 30초마다 계산하고 사이는 직선 보간
    function interpBody(body, t, cache) {
      var k = Math.floor(t / 30000) * 30000;
      var p0 = cache[k] || (cache[k] = bodyAltAz(body, k));
      var p1 = cache[k + 30000] || (cache[k + 30000] = bodyAltAz(body, k + 30000));
      var f = (t - k) / 30000;
      var daz = p1.az - p0.az;
      if (daz > 180) daz -= 360;
      if (daz < -180) daz += 360;
      return { alt: p0.alt + (p1.alt - p0.alt) * f, az: rev(p0.az + daz * f) };
    }

    var moonCache = {}, sunCache = {};
    var events = [];
    var now = Date.now();
    var DAY = 86400000;
    var dayIdx = 0;

    function crunch() {
      var from = now + dayIdx * DAY, to = from + DAY;
      for (var t = from; t < to; t += 30000) {
        var iss = issAltAz(t);
        if (!iss || iss.alt < 5) continue;
        // ISS가 5° 이상 떠 있는 시간대만 1초 간격 정밀 스캔
        for (var tt = t; tt < t + 30000; tt += 1000) {
          var i2 = issAltAz(tt);
          if (!i2 || i2.alt < 5) continue;
          [["달", "Moon", moonCache], ["태양", "Sun", sunCache]].forEach(function (B) {
            var b = interpBody(B[1], tt, B[2]);
            if (b.alt < 3) return;
            var s = sep(i2, b);
            if (s < 1.2) {
              // 0.1초 간격 정밀화
              var best = s, bestT = tt;
              for (var ft = tt - 1000; ft <= tt + 1000; ft += 100) {
                var fi = issAltAz(ft);
                if (!fi) continue;
                var fs = sep(fi, interpBody(B[1], ft, B[2]));
                if (fs < best) { best = fs; bestT = ft; }
              }
              var last = events[events.length - 1];
              if (last && last.body === B[0] && Math.abs(last.t - bestT) < 120000) {
                if (best < last.sep) { last.sep = best; last.t = bestT; last.alt = i2.alt; }
              } else {
                events.push({ body: B[0], t: bestT, sep: best, alt: i2.alt });
              }
            }
          });
        }
      }
      dayIdx++;
      if (dayIdx < 5) {
        out.textContent = "계산 중… " + dayIdx + "/5일";
        setTimeout(crunch, 0);
      } else {
        report();
      }
    }

    function report() {
      var hits = events.filter(function (e) { return e.sep < 0.6; });
      if (!hits.length) {
        out.innerHTML = "5일 안엔 내 위치에서 달·태양 면 통과가 없어요. " +
          '통과 경로가 폭 5~10km라 <a href="https://transit-finder.com/" target="_blank" style="color:var(--accent)">Transit Finder</a>에서 근처 경로도 확인해보세요.';
        return;
      }
      var W = ["일", "월", "화", "수", "목", "금", "토"];
      out.innerHTML = hits.map(function (e) {
        var d = new Date(e.t);
        var kind = e.sep <= 0.28 ? "🎯 면 통과!" : "근접 통과 (이격 " + e.sep.toFixed(2) + "°)";
        return '<div class="pl-row"><span class="pl-name">' + (d.getMonth() + 1) + "/" + d.getDate() +
          " (" + W[d.getDay()] + ")</span><span><b>" +
          fmtTime(d) + ":" + String(d.getSeconds()).padStart(2, "0") + "</b> · " + e.body + " · " + kind +
          " · 고도 " + Math.round(e.alt) + "°</span></div>";
      }).join("") +
        '<div class="detail" style="margin-top:6px">경로 폭이 좁아 몇 km만 이동해도 결과가 달라집니다 — 출발 전 ' +
        '<a href="https://transit-finder.com/" target="_blank" style="color:var(--accent)">Transit Finder</a>로 재확인 · ' +
        "⚠️ 태양 통과는 태양필터 필수</div>";
    }

    crunch();
  }

  /* ============ 혜성 (MPC 궤도요소, 매일 갱신) ============ */

  var cometsPromise = null;

  function cometGeo(c, date) {
    var dMs = Date.UTC(c.T[0], c.T[1] - 1, 1) + (c.T[2] - 1) * 86400000;
    var dt = (date.getTime() - dMs) / 86400000; // 근일점 이후 일수
    var d = dayNum(date);
    var xyz;
    if (c.e < 0.98) {
      // 타원 궤도
      var a = c.q / (1 - c.e);
      var M = 0.9856076686 / Math.pow(a, 1.5) * dt;
      xyz = heliXYZ({ N: c.node, i: c.incl, w: c.peri, a: a, e: c.e, M: M });
    } else {
      // 포물선 근사 (Barker 방정식)
      var W = 0.01720209895 * dt / Math.sqrt(2 * c.q * c.q * c.q);
      var u = Math.cbrt(1.5 * W + Math.sqrt(1 + 2.25 * W * W));
      var D = u - 1 / u;
      var v = 2 * Math.atan(D);
      var r = c.q * (1 + D * D);
      var N = rev(c.node) * RAD, i = c.incl * RAD, w = rev(c.peri) * RAD;
      xyz = {
        x: r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i)),
        y: r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i)),
        z: r * Math.sin(v + w) * Math.sin(i)
      };
    }
    var rSun = Math.sqrt(xyz.x * xyz.x + xyz.y * xyz.y + xyz.z * xyz.z);
    var s = sunXYZ(d);
    var x = xyz.x + s.x, y = xyz.y + s.y, z = xyz.z + s.z;
    var delta = Math.sqrt(x * x + y * y + z * z);
    var ecl = (23.4393 - 3.563e-7 * d) * RAD;
    var xe = x, ye = y * Math.cos(ecl) - z * Math.sin(ecl), ze = y * Math.sin(ecl) + z * Math.cos(ecl);
    return {
      ra: rev(Math.atan2(ye, xe) / RAD),
      dec: Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) / RAD,
      mag: c.g + 5 * Math.log10(delta) + 2.5 * c.k * Math.log10(rSun)
    };
  }

  window.renderComets = function () {
    var box = $("comet-list");
    if (!box) return;
    if (!cometsPromise) {
      cometsPromise = fetch("api/comets")
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .catch(function () { return null; });
    }
    box.innerHTML = '<div class="detail">혜성 궤도 불러오는 중…</div>';
    var loc;
    try { loc = JSON.parse(localStorage.getItem("todaystar_loc")) || {}; } catch (e) { loc = {}; }
    var lat = loc.lat || 37.5665, lon = loc.lon || 126.978;
    cometsPromise.then(function (list) {
      if (!list) {
        box.innerHTML = '<div class="detail">혜성 데이터를 불러오지 못했습니다 (배포 환경에서 작동)</div>';
        return;
      }
      var w = nightSpan(new Date(), lat, lon);
      var mid = new Date((w.ds.getTime() + w.de.getTime()) / 2);
      var rows = [];
      list.forEach(function (c) {
        var geo;
        try { geo = cometGeo(c, mid); } catch (e) { return; }
        if (!isFinite(geo.mag) || geo.mag > 12) return;
        var maxAlt = -90, maxT = null, maxAz = 0, winS = null, winE = null;
        for (var t = w.ds.getTime(); t <= w.de.getTime(); t += 10 * 60000) {
          var p = altAzOf(geo.ra, geo.dec, new Date(t), lat, lon);
          if (p.alt > maxAlt) { maxAlt = p.alt; maxT = new Date(t); maxAz = p.az; }
          if (p.alt >= 10) { if (!winS) winS = new Date(t); winE = new Date(t); }
        }
        rows.push({
          mag: geo.mag, c: c, geo: geo,
          maxAlt: maxAlt, maxAz: maxAz, winS: winS, winE: winE,
          html: '<div class="mt-row"><b>' + c.name + "</b>" +
            "<span>예상 " + geo.mag.toFixed(1) + "등급</span>" +
            '<span class="mt-zhr">' + (winS
              ? fmtTime(winS) + "~" + fmtTime(winE) + " · 최고 " + Math.round(maxAlt) + "° " + dirName(maxAz)
              : "오늘 밤 지평선 아래") + "</span></div>"
        });
      });
      rows.sort(function (a, b) { return a.mag - b.mag; });
      box.innerHTML = rows.length
        ? rows.slice(0, 8).map(function (r, i) {
            return r.html.replace('class="mt-row"', 'class="mt-row comet-row" data-ci="' + i + '"');
          }).join("") +
          '<div class="detail" style="margin-top:6px">줄을 누르면 그래프·촬영 판정 · 밝기는 추정치</div>'
        : '<div class="detail">지금 12등급보다 밝게 예측되는 혜성이 없어요</div>';
      var shown = rows.slice(0, 8);
      box.querySelectorAll(".comet-row").forEach(function (el) {
        el.style.cursor = "pointer";
        el.addEventListener("click", function () {
          renderCometDetail(shown[+el.dataset.ci], lat, lon, w);
        });
      });
    });
  };

  function renderCometDetail(row, lat, lon, w) {
    var box = $("comet-list");
    var c = row.c, geo = row.geo;
    // 밝기 추이: 오늘 vs +10일
    var magNow = geo.mag;
    var magLater = cometGeo(c, new Date(Date.now() + 10 * 86400000)).mag;
    var trend = magLater < magNow - 0.15 ? "밝아지는 중 ↑" : magLater > magNow + 0.15 ? "어두워지는 중 ↓" : "비슷하게 유지";

    // 촬영 판정
    var verdict, vcls;
    if (row.maxAlt < 10) { verdict = "오늘 밤 부적합 — 지평선 근처"; vcls = "warn"; }
    else if (magNow <= 8 && row.maxAlt >= 25) { verdict = "★ 촬영 강추 — 밝고 높이 뜸"; vcls = ""; }
    else if (magNow <= 10 && row.maxAlt >= 15) { verdict = "도전할 만함 — 드워프·망원렌즈 장노출"; vcls = ""; }
    else { verdict = "어려움 — 어둡거나 낮음, 큰 장비 필요"; vcls = "warn"; }

    var mid = new Date((w.ds.getTime() + w.de.getTime()) / 2);
    var mf = SunCalc.getMoonIllumination(mid).fraction;
    var mAlt = SunCalc.getMoonPosition(mid, lat, lon).altitude;
    var moonNote = mAlt > 0 ? "달 떠 있음 · 밝기 " + Math.round(mf * 100) + "%" : "한밤에 달 없음";

    box.innerHTML =
      '<button class="btn-back" id="comet-back">← 혜성 목록</button>' +
      '<div class="big" style="margin-top:8px">☄️ ' + c.name + "</div>" +
      '<div class="badge' + (vcls ? " warn" : "") + '" style="margin-top:8px">' + verdict + "</div>" +
      '<canvas id="comet-chart" style="width:100%;height:170px;margin-top:12px"></canvas>' +
      '<div class="chart-legend"><span class="lg-obj">━ 혜성</span> <span class="lg-moon">┄ 달</span> · 진한 배경 = 완전한 어둠</div>' +
      '<div class="row"><span>예상 밝기</span><b>' + magNow.toFixed(1) + "등급 · " + trend + "</b></div>" +
      (row.winS ? '<div class="row"><span>오늘 밤 적기</span><b>' + fmtTime(row.winS) + " ~ " + fmtTime(row.winE) +
        " · 최고 " + Math.round(row.maxAlt) + "° " + dirName(row.maxAz) + "</b></div>" : "") +
      '<div class="row"><span>오늘 달</span><b>' + moonNote + "</b></div>" +
      '<div class="detail" style="margin-top:6px">혜성 밝기는 예측 오차가 큽니다. 꼬리가 활발하면 등급보다 잘 보여요.</div>';
    $("comet-back").addEventListener("click", function () { window.renderComets(); });

    // 고도 그래프
    var canvas = $("comet-chart");
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    var padL = 26, padB = 18, padT = 6;
    var t0 = w.s.getTime(), t1 = w.e.getTime();
    var X = function (t) { return padL + (t - t0) / (t1 - t0) * (W - padL - 4); };
    var Y = function (a) { return padT + (1 - a / 90) * (H - padT - padB); };
    g.fillStyle = "#1e2650";
    g.fillRect(padL, padT, W - padL - 4, H - padT - padB);
    g.fillStyle = "#0b1026";
    g.fillRect(X(w.ds.getTime()), padT, X(w.de.getTime()) - X(w.ds.getTime()), H - padT - padB);
    g.strokeStyle = "rgba(154,163,207,0.5)";
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(padL, Y(30)); g.lineTo(W - 4, Y(30)); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#9aa3cf";
    g.font = "10px sans-serif";
    g.textAlign = "right";
    [0, 30, 60, 90].forEach(function (a) { g.fillText(a + "°", padL - 4, Y(a) + 3); });
    g.textAlign = "center";
    var dd0 = new Date(t0); dd0.setMinutes(0, 0, 0);
    for (var t = dd0.getTime(); t <= t1; t += 3600000) {
      var hh = new Date(t).getHours();
      if (hh % 2 === 0 && t >= t0) g.fillText(hh + "시", X(t), H - 5);
    }
    // 달
    g.strokeStyle = "rgba(154,163,207,0.8)";
    g.setLineDash([2, 4]);
    g.beginPath();
    var started = false;
    for (t = t0; t <= t1; t += 10 * 60000) {
      var ma = SunCalc.getMoonPosition(new Date(t), lat, lon).altitude * 57.29578;
      if (ma < 0) { started = false; continue; }
      if (!started) { g.moveTo(X(t), Y(ma)); started = true; } else g.lineTo(X(t), Y(ma));
    }
    g.stroke();
    g.setLineDash([]);
    // 혜성 (시각마다 위치 재계산 — 혜성은 하룻밤에도 움직임)
    g.strokeStyle = "#7fd6c2";
    g.lineWidth = 2.5;
    g.beginPath();
    started = false;
    for (t = t0; t <= t1; t += 10 * 60000) {
      var cg = cometGeo(c, new Date(t));
      var p = altAzOf(cg.ra, cg.dec, new Date(t), lat, lon);
      if (p.alt < 0) { started = false; continue; }
      if (!started) { g.moveTo(X(t), Y(p.alt)); started = true; } else g.lineTo(X(t), Y(p.alt));
    }
    g.stroke();
    g.lineWidth = 1;
  }

  window.TodayStarExtras = {
    render: function (date, lat, lon) {
      renderPlanets(date, lat, lon);
      renderMeteors(date, lat, lon);
      renderAtmos(date, lat, lon);
      renderISS(lat, lon);
    }
  };
})();
