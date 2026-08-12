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

  function renderPlanets(date, lat, lon) {
    var box = $("planet-list");
    if (!box) return;
    var w = nightSpan(date, lat, lon);
    var html = "";
    PLANETS.forEach(function (pl, pi) {
      var maxAlt = -90, maxT = null, maxAz = 0;
      // 행성 좌표는 밤 동안 거의 고정 → 자정 기준 1회 계산
      var mid = new Date((w.s.getTime() + w.e.getTime()) / 2);
      var rd = planetRaDec(pi, mid);
      for (var t = w.s.getTime(); t <= w.e.getTime(); t += 10 * 60000) {
        var p = altAzOf(rd.ra, rd.dec, new Date(t), lat, lon);
        if (p.alt > maxAlt) { maxAlt = p.alt; maxT = new Date(t); maxAz = p.az; }
      }
      var status;
      if (maxAlt < 5) status = '<span class="pl-no">이 밤엔 안 보임</span>';
      else status = "<b>" + fmtTime(maxT) + "</b> 최고 " + Math.round(maxAlt) + "° " + dirName(maxAz);
      html += '<div class="pl-row"><span class="pl-name">' + pl[0] + "</span><span>" + status + "</span></div>";
    });
    box.innerHTML = html;
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
        for (var t = now; t < now + 72 * 3600000; t += 20000) {
          var d = new Date(t);
          var pv = satellite.propagate(rec, d);
          if (!pv.position) continue;
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
            if (passes.length >= 3) break;
          }
        }
        if (!passes.length) {
          box.innerHTML = '<div class="detail">앞으로 3일 안엔 밝게 보이는 통과가 없어요</div>';
          return;
        }
        var W = ["일", "월", "화", "수", "목", "금", "토"];
        box.innerHTML = passes.map(function (p) {
          var d0 = p.visStart || p.start;
          return '<div class="pl-row"><span class="pl-name">' +
            (d0.getMonth() + 1) + "/" + d0.getDate() + " (" + W[d0.getDay()] + ")</span>" +
            "<span><b>" + fmtTime(d0) + "</b> · 최고 " + Math.round(p.maxEl) + "° " + dirName(rev(p.maxAz)) +
            " · " + Math.round((p.end - p.start) / 60000) + "분간</span></div>";
        }).join("") + '<div class="detail" style="margin-top:6px">밝은 별처럼 움직이는 점 — 맨눈으로 보입니다</div>';
      })
      .catch(function () {
        box.innerHTML = '<div class="detail">ISS 정보를 불러오지 못했습니다 (배포 환경에서 작동)</div>';
      });
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
