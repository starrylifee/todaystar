/* 오늘별 — 오늘 밤하늘 관측 정보 */
(function () {
  "use strict";

  var DEFAULT_LOC = { lat: 37.5665, lon: 126.978, name: "서울 (기본값)" };
  var LS_KEY = "todaystar_loc";

  var state = {
    lat: DEFAULT_LOC.lat,
    lon: DEFAULT_LOC.lon,
    name: DEFAULT_LOC.name,
    date: startOfDay(new Date())
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 유틸 ---------- */

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }
  function isValid(d) { return d instanceof Date && !isNaN(d); }
  function fmtTime(d) {
    if (!isValid(d)) return "—";
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function fmtDur(ms) {
    var m = Math.round(ms / 60000);
    return Math.floor(m / 60) + "시간 " + (m % 60) + "분";
  }
  var WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  function fmtDate(d) {
    return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + WEEKDAYS[d.getDay()] + ")";
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /* ---------- 달 위상 ---------- */

  function moonPhaseName(p) {
    if (p < 0.02 || p > 0.98) return "삭 (신월)";
    if (p < 0.23) return "초승달";
    if (p < 0.27) return "상현달";
    if (p < 0.48) return "차오르는 달";
    if (p < 0.52) return "보름달";
    if (p < 0.73) return "기우는 달";
    if (p < 0.77) return "하현달";
    return "그믐달";
  }

  function drawMoon(canvas, phase) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width, h = canvas.height;
    var cx = w / 2, cy = h / 2, r = w / 2 - 6;
    var LIGHT = "#f5e9c8", SHADOW = "#2a3466";

    ctx.clearRect(0, 0, w, h);

    // 달 전체(그림자면)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = SHADOW;
    ctx.fill();

    var t = Math.cos(2 * Math.PI * phase);       // 터미네이터 타원 반지름 비율
    var waxing = phase < 0.5;                     // 차는 달 → 오른쪽이 밝음
    var gibbous = phase > 0.25 && phase < 0.75;   // 볼록달

    // 밝은 반원
    ctx.beginPath();
    if (waxing) ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
    else ctx.arc(cx, cy, r, Math.PI / 2, Math.PI * 1.5);
    ctx.fillStyle = LIGHT;
    ctx.fill();

    // 터미네이터 타원: 볼록달이면 밝게 확장, 초승/그믐이면 어둡게 침식
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(t) * r, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = gibbous ? LIGHT : SHADOW;
    ctx.fill();

    // 테두리
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /* ---------- 계산 + 렌더 ---------- */

  function render() {
    var d = state.date;
    var lat = state.lat, lon = state.lon;
    var today = startOfDay(new Date());

    // 날짜 표시
    $("date-label").textContent = (sameDay(d, today) ? "오늘 · " : "") + fmtDate(d);
    $("btn-today").classList.toggle("hidden", sameDay(d, today));

    // 해당 날짜의 태양 시각 (정오 기준으로 계산해야 그 날짜의 값이 나옴)
    var noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
    var tSun = SunCalc.getTimes(noon, lat, lon);
    var noonNext = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12);
    var tNext = SunCalc.getTimes(noonNext, lat, lon);

    $("sunrise").textContent = fmtTime(tSun.sunrise);
    $("sunset").textContent = fmtTime(tSun.sunset);
    $("dusk-civil").textContent = fmtTime(tSun.dusk);
    $("dusk-nautical").textContent = fmtTime(tSun.nauticalDusk);
    $("dusk-astro").textContent = fmtTime(tSun.night);
    $("dawn-astro").textContent = fmtTime(tNext.nightEnd);
    $("dawn-nautical").textContent = fmtTime(tNext.nauticalDawn);
    $("dawn-civil").textContent = fmtTime(tNext.dawn);

    // 이 밤의 완전한 어둠: 오늘 저녁 천문박명 끝 → 내일 새벽 천문박명 시작
    var darkStart = tSun.night, darkEnd = tNext.nightEnd;
    if (isValid(darkStart) && isValid(darkEnd)) {
      $("dark-window").textContent = fmtTime(darkStart) + " ~ " + fmtTime(darkEnd);
      $("dark-length").textContent = "완전히 어두운 시간 " + fmtDur(darkEnd - darkStart);
    } else {
      $("dark-window").textContent = "완전한 어둠 없음";
      $("dark-length").textContent = "이 날은 하늘이 완전히 어두워지지 않습니다";
    }

    // 구름 예보 (16일 이내)
    var cn = $("cloud-note");
    cn.textContent = "";
    if (window.getClouds && isValid(darkStart) && isValid(darkEnd)) {
      window.getClouds(lat, lon).then(function (cd) {
        var avg = window.cloudAvg(cd, darkStart.getTime(), darkEnd.getTime());
        if (avg != null && sameDay(d, state.date)) {
          cn.textContent = window.cloudLabel(avg) + " (밤 평균 예보)";
        }
      });
    }

    // 달 정보: 밤의 중간 시각 기준
    var midNight = (isValid(darkStart) && isValid(darkEnd))
      ? new Date((darkStart.getTime() + darkEnd.getTime()) / 2)
      : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23);
    var ill = SunCalc.getMoonIllumination(midNight);
    var age = ill.phase * 29.53;

    $("moon-phase-name").textContent = moonPhaseName(ill.phase);
    $("moon-detail").textContent = "월령 " + age.toFixed(1) + "일 · 밝기 " + Math.round(ill.fraction * 100) + "%";
    drawMoon($("moon-canvas"), ill.phase);

    var mt = SunCalc.getMoonTimes(d, lat, lon);
    var moonStr = [];
    moonStr.push("월출 " + (mt.rise ? fmtTime(mt.rise) : "없음"));
    moonStr.push("월몰 " + (mt.set ? fmtTime(mt.set) : "없음"));
    if (mt.alwaysUp) moonStr = ["달이 밤새 떠 있음"];
    if (mt.alwaysDown) moonStr = ["달이 뜨지 않음"];
    $("moon-times").textContent = moonStr.join(" · ");

    // 관측 배지: 어두운 시간대의 달 상황
    var badge = $("obs-badge");
    var moonAlt = SunCalc.getMoonPosition(midNight, lat, lon).altitude;
    badge.classList.remove("hidden", "warn");
    if (moonAlt < 0) {
      badge.textContent = "한밤에 달이 없는 하늘 — 딥스카이 촬영 좋음";
    } else if (ill.fraction < 0.25) {
      badge.textContent = "달빛 적음 — 딥스카이 촬영 무난";
    } else if (ill.fraction < 0.6) {
      badge.textContent = "달빛 있음 — 밝은 대상 위주 추천";
      badge.classList.add("warn");
    } else {
      badge.textContent = "달이 밝은 밤 — 달·행성 관측 추천";
      badge.classList.add("warn");
    }

    // 한 주 미리보기: 일몰 + 달 밝기
    var wk = $("week-list");
    wk.innerHTML = "";
    for (var i = 1; i <= 5; i++) {
      var dd = addDays(d, i);
      var tt = SunCalc.getTimes(new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), 12), lat, lon);
      var f = SunCalc.getMoonIllumination(new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), 23)).fraction;
      var row = document.createElement("div");
      row.className = "week-row";
      row.innerHTML =
        "<span>" + (dd.getMonth() + 1) + "/" + dd.getDate() + " (" + WEEKDAYS[dd.getDay()] + ")</span>" +
        "<b>일몰 " + fmtTime(tt.sunset) + "</b>" +
        "<b class='wk-moon'>🌙" + Math.round(f * 100) + "%</b>";
      wk.appendChild(row);
    }

    // 좌표 표시
    $("coords").textContent = state.name + " · " + lat.toFixed(4) + ", " + lon.toFixed(4);
  }

  /* ---------- 위치 ---------- */

  function setLocation(lat, lon, name) {
    state.lat = lat;
    state.lon = lon;
    state.name = name || (lat.toFixed(2) + ", " + lon.toFixed(2));
    $("loc-name").textContent = "📍 " + state.name;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ lat: lat, lon: lon, name: state.name })); } catch (e) {}
    render();
    document.dispatchEvent(new CustomEvent("todaystar:loc"));
  }

  function reverseGeocode(lat, lon) {
    return fetch("https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ko&zoom=10&lat=" + lat + "&lon=" + lon)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var a = j.address || {};
        var parts = [a.province || a.state || a.city, a.county || a.city_district || a.borough || a.district || a.town];
        var name = parts.filter(Boolean).join(" ");
        return name || null;
      })
      .catch(function () { return null; });
  }

  function locate() {
    $("loc-name").textContent = "위치 확인 중…";
    if (!navigator.geolocation) {
      setLocation(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        setLocation(lat, lon, null);
        reverseGeocode(lat, lon).then(function (name) {
          if (name) setLocation(lat, lon, name);
        });
      },
      function () {
        // 거부/실패 → 저장된 위치 또는 서울
        var saved = loadSaved();
        if (saved) setLocation(saved.lat, saved.lon, saved.name);
        else setLocation(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  }

  function loadSaved() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && typeof s.lat === "number") return s;
    } catch (e) {}
    return null;
  }

  /* ---------- 이벤트 ---------- */

  $("btn-prev").addEventListener("click", function () { state.date = addDays(state.date, -1); render(); });
  $("btn-next").addEventListener("click", function () { state.date = addDays(state.date, 1); render(); });
  $("btn-today").addEventListener("click", function () { state.date = startOfDay(new Date()); render(); });
  $("btn-locate").addEventListener("click", locate);

  /* ---------- 시작 ---------- */

  var saved = loadSaved();
  if (saved) {
    setLocation(saved.lat, saved.lon, saved.name);
  } else {
    render();
    locate();
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js");
  }
})();
