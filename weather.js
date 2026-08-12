/* 오늘별 — 구름 예보 (Open-Meteo, 키 불필요) */
(function () {
  "use strict";
  var cache = {}; // "lat,lon" -> Promise

  window.getClouds = function (lat, lon) {
    var key = lat.toFixed(2) + "," + lon.toFixed(2);
    if (cache[key]) return cache[key];
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat.toFixed(4) +
      "&longitude=" + lon.toFixed(4) +
      "&hourly=cloud_cover,temperature_2m,dew_point_2m,relative_humidity_2m&forecast_days=16&timezone=auto";
    cache[key] = fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var times = j.hourly.time.map(function (t) { return new Date(t).getTime(); });
        return {
          times: times,
          cloud: j.hourly.cloud_cover,
          temp: j.hourly.temperature_2m,
          dew: j.hourly.dew_point_2m,
          rh: j.hourly.relative_humidity_2m
        };
      })
      .catch(function () { return null; });
    return cache[key];
  };

  // 이슬 위험도: 밤 시간대 (기온-이슬점) 최소값과 습도 최대값으로 판정
  window.dewInfo = function (data, startMs, endMs) {
    if (!data || !data.temp) return null;
    var minSpread = null, maxRh = null;
    for (var t = startMs; t <= endMs; t += 3600000) {
      var i = Math.round((t - data.times[0]) / 3600000);
      if (i < 0 || i >= data.temp.length || data.temp[i] == null) continue;
      var sp = data.temp[i] - data.dew[i];
      if (minSpread == null || sp < minSpread) minSpread = sp;
      if (maxRh == null || data.rh[i] > maxRh) maxRh = data.rh[i];
    }
    if (minSpread == null) return null;
    if (minSpread <= 2 && maxRh >= 85) return { level: 2, text: "💧 이슬 많음 — 렌즈 열선·후드 필수" };
    if (minSpread <= 4) return { level: 1, text: "💧 이슬 주의 — 후드 권장" };
    return { level: 0, text: "이슬 걱정 적음" };
  };

  // 특정 시각의 구름량(%) — 예보 범위 밖이면 null
  window.cloudAt = function (data, dateMs) {
    if (!data) return null;
    var i = Math.round((dateMs - data.times[0]) / 3600000);
    if (i < 0 || i >= data.cloud.length) return null;
    return data.cloud[i];
  };

  // 구간 평균 구름량(%) — 범위 밖이면 null
  window.cloudAvg = function (data, startMs, endMs) {
    if (!data) return null;
    var sum = 0, n = 0;
    for (var t = startMs; t <= endMs; t += 3600000) {
      var c = window.cloudAt(data, t);
      if (c != null) { sum += c; n++; }
    }
    return n ? Math.round(sum / n) : null;
  };

  window.cloudLabel = function (pct) {
    if (pct == null) return "";
    var icon = pct < 25 ? "☀️" : pct < 60 ? "⛅" : "☁️";
    return icon + " 구름 " + pct + "%";
  };
})();
