/* 오늘별 — 관측지 지도: 광해 + 3D 지형 */
(function () {
  "use strict";

  var LS_KEY = "todaystar_loc";
  var DEFAULT_LOC = { lat: 37.5665, lon: 126.978 };
  var VWORLD_KEY = "B72D35C8-CB61-3A5C-87CC-56F58968D168"; // 브이월드 인증키 (WMTS). 비어 있으면 OSM 지도 사용
  var LP_YEAR = 2025;
  var LP_IMG = "https://djlorenz.github.io/astronomy/image_tiles/tiles" + LP_YEAR + "/tile_{z}_{x}_{y}.png";
  var LP_BIN = "https://djlorenz.github.io/astronomy/binary_tiles/" + LP_YEAR + "/binary_tile_";

  var map = null, marker = null, meMarker = null, terrainOn = false;
  var tileCache = {}; // "x_y" -> Float32Array(600*600) 밝기비

  var $ = function (id) { return document.getElementById(id); };

  function getLoc() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && typeof s.lat === "number") return s;
    } catch (e) {}
    return DEFAULT_LOC;
  }

  /* ---------- 광해 데이터 (Lorenz Atlas 2025, 1/120°) ---------- */

  function mod(n, m) { return ((n % m) + m) % m; }

  // gzip 해제 + 델타 압축 해제 → 600x600 밝기비 배열
  function loadTile(tx, ty) {
    var key = tx + "_" + ty;
    if (tileCache[key]) return Promise.resolve(tileCache[key]);
    var url = LP_BIN + tx + "_" + ty + ".dat.gz";
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("tile " + r.status);
        var ds = new DecompressionStream("gzip");
        return new Response(r.body.pipeThrough(ds)).arrayBuffer();
      })
      .then(function (buf) {
        var d = new Int8Array(buf);
        var vals = new Float32Array(600 * 600);
        var rowStart = 128 * d[0] + d[1]; // 좌하단만 2바이트 실제값
        for (var iy = 1; iy <= 600; iy++) {
          if (iy > 1) rowStart += d[600 * (iy - 1) + 1];
          var v = rowStart;
          for (var ix = 1; ix <= 600; ix++) {
            if (ix > 1) v += d[600 * (iy - 1) + 1 + (ix - 1)];
            vals[(iy - 1) * 600 + (ix - 1)] = (5.0 / 195.0) * (Math.exp(0.0195 * v) - 1.0);
          }
        }
        tileCache[key] = vals;
        return vals;
      });
  }

  function lpAt(lat, lon) {
    if (lat < -65 || lat > 75) return Promise.resolve(null);
    var lonFDL = mod(lon + 180.0, 360.0);
    var latFS = lat + 65.0;
    var tx = Math.floor(lonFDL / 5.0) + 1;
    var ty = Math.floor(latFS / 5.0) + 1;
    var ix = Math.round(120 * (lonFDL - 5.0 * (tx - 1) + 1.0 / 240.0));
    var iy = Math.round(120 * (latFS - 5.0 * (ty - 1) + 1.0 / 240.0));
    ix = Math.min(Math.max(ix, 1), 600);
    iy = Math.min(Math.max(iy, 1), 600);
    return loadTile(tx, ty).then(function (vals) {
      return vals[(iy - 1) * 600 + (ix - 1)];
    }).catch(function () { return null; });
  }

  var ZONES = [
    [0.01, "0",  "완벽한 밤하늘 — 대기광까지 보임"],
    [0.06, "1a", "은하수가 그림자를 만들 만큼 어두움"],
    [0.11, "1b", "최상급 관측지 — 은하수 구조 선명"],
    [0.19, "2a", "훌륭한 시골 하늘"],
    [0.33, "2b", "시골 하늘 — 은하수 잘 보임"],
    [0.58, "3a", "시골·교외 경계 — 은하수 보임"],
    [1.00, "3b", "교외 어두운 곳 — 은하수 흐릿"],
    [1.73, "4a", "교외 — 은하수 겨우 보임"],
    [3.00, "4b", "밝은 교외 — 은하수 거의 안 보임"],
    [5.20, "5a", "교외·도시 경계"],
    [9.00, "5b", "밝은 하늘 — 밝은 별만 보임"],
    [15.59, "6a", "도시 하늘"],
    [27.00, "6b", "밝은 도시 하늘"],
    [46.77, "7a", "도심 — 별 관측 어려움"],
    [Infinity, "7b", "밝은 도심"]
  ];

  function lpInfo(ratio) {
    var mpsas = 22.0 - 5.0 * Math.log(1.0 + ratio) / Math.log(100.0);
    var zone = ZONES[ZONES.length - 1];
    for (var i = 0; i < ZONES.length; i++) {
      if (ratio < ZONES[i][0]) { zone = ZONES[i]; break; }
    }
    var bortle;
    if (mpsas >= 21.99) bortle = 1;
    else if (mpsas >= 21.89) bortle = 2;
    else if (mpsas >= 21.69) bortle = 3;
    else if (mpsas >= 20.49) bortle = 4;
    else if (mpsas >= 19.50) bortle = 5;
    else if (mpsas >= 18.94) bortle = 6;
    else if (mpsas >= 18.38) bortle = 7;
    else if (mpsas >= 17.80) bortle = 8;
    else bortle = 9;
    return { ratio: ratio, mpsas: mpsas, zone: zone[1], desc: zone[2], bortle: bortle };
  }

  /* ---------- 지도 ---------- */

  function initMap() {
    if (map) return;
    var loc = getLoc();
    var baseSource = VWORLD_KEY
      ? {
          type: "raster",
          tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + VWORLD_KEY + "/Satellite/{z}/{y}/{x}.jpeg"],
          tileSize: 256,
          maxzoom: 18,
          attribution: "© VWorld | 광해: djlorenz.github.io (VIIRS " + LP_YEAR + ")"
        }
      : {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          maxzoom: 19,
          attribution: "© OpenStreetMap | 광해: djlorenz.github.io (VIIRS " + LP_YEAR + ")"
        };
    map = new maplibregl.Map({
      container: "map",
      center: [loc.lon, loc.lat],
      zoom: 9,
      maxPitch: 70,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: (function () {
          var s = {};
          if (VWORLD_KEY) {
            s.vlabel = {
              type: "raster",
              tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + VWORLD_KEY + "/Hybrid/{z}/{y}/{x}.png"],
              tileSize: 256,
              maxzoom: 18
            };
          }
          return Object.assign(s, {
          osm: baseSource,
          lp: {
            type: "raster",
            tiles: [LP_IMG],
            tileSize: 256,
            minzoom: 2,
            maxzoom: 8
          },
          dem: {
            type: "raster-dem",
            encoding: "terrarium",
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 15
          }
          });
        })(),
        layers: (function () {
          var ls = [{ id: "base", type: "raster", source: "osm" }];
          if (VWORLD_KEY) ls.push({ id: "labels", type: "raster", source: "vlabel" });
          ls.push({ id: "lp-overlay", type: "raster", source: "lp", paint: { "raster-opacity": 0.55 } });
          ls.push({ id: "hills", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.3 } });
          return ls;
        })()
      }
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    window._map = map; // debug
    map.on("error", function (e) { console.log("[MAP-ERR]", e.error ? e.error.message : e); });

    // 내 위치 마커
    meMarker = new maplibregl.Marker({ color: "#4a9eff" })
      .setLngLat([loc.lon, loc.lat]).addTo(map);

    map.on("click", function (e) {
      pick(e.lngLat.lat, e.lngLat.lng);
    });
  }

  function fmtDist(km) {
    return km < 1 ? Math.round(km * 1000) + "m" : km.toFixed(km < 10 ? 1 : 0) + "km";
  }
  function distKm(a, b, c, d) {
    var R = 6371, dl = (c - a) * Math.PI / 180, dn = (d - b) * Math.PI / 180;
    var x = Math.sin(dl / 2) * Math.sin(dl / 2) +
      Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dn / 2) * Math.sin(dn / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function pick(lat, lon) {
    if (marker) marker.remove();
    marker = new maplibregl.Marker({ color: "#ffd76a" }).setLngLat([lon, lat]).addTo(map);
    var card = $("spot-card");
    card.classList.remove("hidden");
    card.innerHTML = '<div class="detail">광해값 읽는 중…</div>';
    lpAt(lat, lon).then(function (ratio) {
      if (ratio == null) {
        card.innerHTML = '<div class="detail">광해 데이터를 불러오지 못했습니다 (인터넷 연결 확인)</div>';
        return;
      }
      var info = lpInfo(ratio);
      var loc = getLoc();
      var d = distKm(loc.lat, loc.lon, lat, lon);
      var stars = "★★★★★".slice(0, Math.max(1, 6 - Math.ceil(info.bortle / 2))) ;
      card.innerHTML =
        '<div class="spot-head"><b>보틀 ' + info.bortle + '등급<span class="spot-approx">(근사)</span></b>' +
        '<span class="spot-stars">' + stars + "</span>" +
        '<button id="spot-close" class="btn-back">✕</button></div>' +
        '<div class="detail">' + info.desc + "</div>" +
        '<div class="spot-meta">하늘 밝기 ' + info.mpsas.toFixed(2) + " mag/arcsec² · LP존 " + info.zone +
        " · 내 위치에서 " + fmtDist(d) + "</div>" +
        '<div class="spot-actions">' +
        '<button id="spot-toilet-kakao">🚻 주변 화장실 (카카오맵)</button>' +
        '<button id="spot-toilet-google">구글지도</button>' +
        "</div>";
      $("spot-close").addEventListener("click", function () {
        card.classList.add("hidden");
        if (marker) marker.remove();
      });
      $("spot-toilet-kakao").addEventListener("click", function () {
        // 폰: 카카오맵 앱 검색, 앱이 없으면 무반응이라 웹 지도로도 안내
        location.href = "kakaomap://search?q=" + encodeURIComponent("공중화장실") + "&p=" + lat + "," + lon;
        setTimeout(function () {
          if (!document.hidden) window.open("https://map.kakao.com/?q=" + encodeURIComponent("공중화장실"), "_blank");
        }, 1200);
      });
      $("spot-toilet-google").addEventListener("click", function () {
        window.open("https://www.google.com/maps/search/" + encodeURIComponent("공중화장실") +
          "/@" + lat.toFixed(5) + "," + lon.toFixed(5) + ",14z", "_blank");
      });
    });
  }

  /* ---------- 버튼 ---------- */

  $("btn-3d").addEventListener("click", function () {
    terrainOn = !terrainOn;
    if (terrainOn) {
      map.setTerrain({ source: "dem", exaggeration: 1.3 });
      map.easeTo({ pitch: 60, duration: 800 });
      this.classList.add("on");
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, duration: 800 });
      this.classList.remove("on");
    }
  });

  $("btn-me").addEventListener("click", function () {
    var loc = getLoc();
    meMarker.setLngLat([loc.lon, loc.lat]);
    map.flyTo({ center: [loc.lon, loc.lat], zoom: 11 });
  });

  var lpVisible = true;
  $("btn-lp").addEventListener("click", function () {
    lpVisible = !lpVisible;
    map.setLayoutProperty("lp-overlay", "visibility", lpVisible ? "visible" : "none");
    this.classList.toggle("on", lpVisible);
  });

  /* ---------- 탭 연동 ---------- */
  document.querySelectorAll(".tabbar button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.view === "spots") {
        initMap();
        setTimeout(function () { map.resize(); }, 50);
      }
    });
  });

  document.addEventListener("todaystar:loc", function () {
    if (map && meMarker) {
      var loc = getLoc();
      meMarker.setLngLat([loc.lon, loc.lat]);
    }
  });
})();
