/* 오늘별 — 관측지 지도: 광해 + 3D 지형 */
(function () {
  "use strict";

  var LS_KEY = "todaystar_loc";
  var DEFAULT_LOC = { lat: 37.5665, lon: 126.978 };
  var VWORLD_KEY = "B72D35C8-CB61-3A5C-87CC-56F58968D168"; // 브이월드 인증키 (WMTS). 비어 있으면 OSM 지도 사용
  var LP_YEAR = 2025;
  var LP_IMG = "https://djlorenz.github.io/astronomy/image_tiles/tiles" + LP_YEAR + "/tile_{z}_{x}_{y}.png";
  var LP_BIN = "https://djlorenz.github.io/astronomy/binary_tiles/" + LP_YEAR + "/binary_tile_";

  // 전국 별 관측 명소 (좌표는 브이월드 장소검색·주소 지오코딩·OSM으로 검증)
  var ASTRO_SPOTS = [
    ["연천 당포성", 38.0235, 126.98542],
    ["연천 은대리성", 38.0243, 127.05969],
    ["강릉 안반데기", 37.62259, 128.73966],
    ["화천 조경철천문대", 38.11858, 127.43403],
    ["양평 벗고개", 37.57232, 127.39138],
    ["평창 청옥산 육백마지기", 37.3968, 128.50716],
    ["정선·영월 만항재", 37.14858, 128.89904],
    ["영양 반딧불이천문대", 36.83049, 129.26952],
    ["무주 반디랜드", 36.01282, 127.75804],
    ["태안 몽산포해수욕장", 36.66836, 126.28347],
    ["제주 1100고지", 33.35778, 126.46243],
    ["단양 소백산천문대", 36.93442, 128.45695],
    ["영월 별마로천문대", 37.19836, 128.48672],
    ["가평·화천 화악산", 37.99799, 127.5557],
    ["횡성 태기산", 37.58851, 128.2189],
    ["고흥 국립청소년우주센터", 34.53298, 127.46826]
  ];

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

    // 관측 명소 별 마커
    ASTRO_SPOTS.forEach(function (s) {
      var el = document.createElement("div");
      el.className = "star-marker";
      el.textContent = "⭐";
      el.title = s[0];
      new maplibregl.Marker({ element: el }).setLngLat([s[2], s[1]]).addTo(map);
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        map.flyTo({ center: [s[2], s[1]], zoom: 12 });
        pick(s[1], s[2]);
      });
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
        '<button id="spot-setloc">📍 여기를 기준 위치로</button>' +
        "</div>" +
        '<div class="spot-actions toilet-row">' +
        '<span class="toilet-label">🚻 주변 화장실</span>' +
        '<button id="spot-toilet-kakao">카카오맵</button>' +
        '<button id="spot-toilet-google">구글지도</button>' +
        "</div>";
      $("spot-close").addEventListener("click", function () {
        card.classList.add("hidden");
        if (marker) marker.remove();
      });
      $("spot-setloc").addEventListener("click", function () {
        if (window.TodayStarSetLoc) window.TodayStarSetLoc(lat, lon);
        this.textContent = "✓ 기준 위치로 설정됨";
        this.disabled = true;
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

  /* ---------- 구름 위성영상 (히마와리, 10분 간격, 최근 6시간) ---------- */
  var HIMA = "https://www.jma.go.jp/bosai/himawari/data/satimg/";
  var cloudFrames = null, cloudOn = false, cloudTimer = null;

  function himaTiles(bt) {
    return [HIMA + bt + "/fd/" + bt + "/B13/TBB/{z}/{x}/{y}.jpg"];
  }
  function frameLabel(bt) {
    var d = new Date(Date.UTC(+bt.slice(0, 4), +bt.slice(4, 6) - 1, +bt.slice(6, 8), +bt.slice(8, 10), +bt.slice(10, 12)));
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function setCloudFrame(i) {
    var bt = cloudFrames[i];
    map.getSource("clouds").setTiles(himaTiles(bt));
    $("cloud-time").textContent = frameLabel(bt);
    $("cloud-slider").value = i;
  }

  $("btn-cloud").addEventListener("click", function () {
    var btn = this;
    cloudOn = !cloudOn;
    btn.classList.toggle("on", cloudOn);
    if (cloudOn && fcOn) $("btn-fc").click(); // 예보 모드 끄기
    $("cloud-bar").classList.toggle("hidden", !cloudOn && !fcOn);
    if (cloudTimer) { clearInterval(cloudTimer); cloudTimer = null; $("cloud-play").textContent = "▶"; }
    if (!cloudOn) {
      if (map.getLayer("clouds")) map.setLayoutProperty("clouds", "visibility", "none");
      return;
    }
    if (map.getLayer("clouds")) {
      map.setLayoutProperty("clouds", "visibility", "visible");
      $("cloud-slider").max = cloudFrames.length - 1;
      setCloudFrame(cloudFrames.length - 1);
      return;
    }
    $("cloud-time").textContent = "불러오는 중…";
    fetch(HIMA + "targetTimes_fd.json")
      .then(function (r) { return r.json(); })
      .then(function (times) {
        // 최근 6시간 = 37프레임 (10분 간격)
        var all = times.map(function (t) { return t.basetime; });
        cloudFrames = all.slice(-37);
        $("cloud-slider").max = cloudFrames.length - 1;
        map.addSource("clouds", {
          type: "raster",
          tiles: himaTiles(cloudFrames[cloudFrames.length - 1]),
          tileSize: 256,
          maxzoom: 5,
          attribution: "구름: 히마와리 위성(JMA)"
        });
        map.addLayer(
          {
            id: "clouds", type: "raster", source: "clouds",
            paint: {
              "raster-opacity": 0.8,
              "raster-contrast": 0.5,
              "raster-brightness-min": 0.05
            }
          },
          map.getLayer("hills") ? "hills" : undefined
        );
        setCloudFrame(cloudFrames.length - 1);
      })
      .catch(function () {
        $("cloud-time").textContent = "위성영상 불러오기 실패";
      });
  });

  /* ---------- 구름 예보 (Open-Meteo 격자, +48시간) ---------- */
  var fcOn = false, fcData = null, fcStart = 0;

  function buildFcGrid() {
    var lats = [], lons = [];
    for (var la = 33.0; la <= 38.81; la += 0.4) {
      for (var lo = 124.6; lo <= 131.01; lo += 0.4) {
        lats.push(la.toFixed(1)); lons.push(lo.toFixed(1));
      }
    }
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lats.join(",") +
      "&longitude=" + lons.join(",") + "&hourly=cloud_cover&forecast_days=3&timezone=Asia%2FSeoul";
    return fetch(url).then(function (r) { return r.json(); }).then(function (arr) {
      if (!Array.isArray(arr)) arr = [arr];
      var times = arr[0].hourly.time;
      var now = new Date();
      var start = 0;
      for (var i = 0; i < times.length; i++) {
        if (new Date(times[i]) >= now) { start = Math.max(0, i - 1); break; }
      }
      var feats = arr.map(function (p, idx) {
        var la = p.latitude, lo = p.longitude, h = 0.2;
        return {
          type: "Feature", id: idx,
          geometry: {
            type: "Polygon",
            coordinates: [[[lo - h, la - h], [lo + h, la - h], [lo + h, la + h], [lo - h, la + h], [lo - h, la - h]]]
          },
          properties: {}
        };
      });
      return {
        geojson: { type: "FeatureCollection", features: feats },
        clouds: arr.map(function (p) { return p.hourly.cloud_cover; }),
        times: times, start: start
      };
    });
  }

  function setFcHour(i) {
    var hi = fcStart + i;
    for (var f = 0; f < fcData.clouds.length; f++) {
      map.setFeatureState({ source: "fc", id: f }, { c: fcData.clouds[f][hi] || 0 });
    }
    var t = new Date(fcData.times[hi]);
    $("cloud-time").textContent = (t.getMonth() + 1) + "/" + t.getDate() + " " + String(t.getHours()).padStart(2, "0") + "시";
    $("cloud-slider").value = i;
  }

  function stopPlay() {
    if (cloudTimer) { clearInterval(cloudTimer); cloudTimer = null; $("cloud-play").textContent = "▶"; }
  }

  $("btn-fc").addEventListener("click", function () {
    var btn = this;
    fcOn = !fcOn;
    btn.classList.toggle("on", fcOn);
    if (fcOn && cloudOn) $("btn-cloud").click(); // 위성 모드 끄기
    $("cloud-bar").classList.toggle("hidden", !fcOn && !cloudOn);
    stopPlay();
    if (!fcOn) {
      if (map.getLayer("fc")) map.setLayoutProperty("fc", "visibility", "none");
      return;
    }
    if (map.getLayer("fc")) {
      map.setLayoutProperty("fc", "visibility", "visible");
      $("cloud-slider").max = 48;
      setFcHour(+$("cloud-slider").value);
      return;
    }
    $("cloud-time").textContent = "예보 불러오는 중…";
    buildFcGrid().then(function (d) {
      fcData = d; fcStart = d.start;
      map.addSource("fc", { type: "geojson", data: d.geojson });
      map.addLayer({
        id: "fc", type: "fill", source: "fc",
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": ["interpolate", ["linear"], ["coalesce", ["feature-state", "c"], 0],
            0, 0, 25, 0.08, 50, 0.35, 75, 0.6, 100, 0.85],
          "fill-outline-color": "rgba(0,0,0,0)"
        }
      }, map.getLayer("hills") ? "hills" : undefined);
      $("cloud-slider").max = 48;
      setFcHour(0);
    }).catch(function () {
      $("cloud-time").textContent = "예보 불러오기 실패";
    });
  });

  $("cloud-slider").addEventListener("input", function () {
    if (fcOn && fcData) setFcHour(+this.value);
    else if (cloudFrames) setCloudFrame(+this.value);
  });

  $("cloud-play").addEventListener("click", function () {
    if (cloudTimer) { stopPlay(); return; }
    this.textContent = "⏸";
    var max = +$("cloud-slider").max;
    var i = +$("cloud-slider").value;
    cloudTimer = setInterval(function () {
      i = (i + 1) % (max + 1);
      if (fcOn && fcData) setFcHour(i);
      else if (cloudFrames) setCloudFrame(i);
    }, fcOn ? 500 : 350);
  });

  /* ---------- 지역·장소 검색 (브이월드 + Nominatim 동시) ---------- */
  function vworldSearch(q) {
    return new Promise(function (resolve) {
      var cb = "_vwcb" + Math.floor(Math.random() * 1e6);
      var done = false;
      var s = document.createElement("script");
      function finish(items) {
        if (done) return;
        done = true;
        delete window[cb];
        s.remove();
        resolve(items);
      }
      window[cb] = function (d) {
        var items = [];
        try {
          (d.response.result.items || []).forEach(function (it) {
            var addr = (it.address && (it.address.parcel || it.address.road)) || "";
            items.push({ name: it.title, addr: addr, lat: +it.point.y, lon: +it.point.x });
          });
        } catch (e) {}
        finish(items);
      };
      s.src = "https://api.vworld.kr/req/search?service=search&request=search&version=2.0&type=place&size=5&format=json" +
        "&key=" + VWORLD_KEY + "&query=" + encodeURIComponent(q) + "&callback=" + cb;
      s.onerror = function () { finish([]); };
      document.head.appendChild(s);
      setTimeout(function () { finish([]); }, 6000);
    });
  }

  function nominatimSearch(q) {
    return fetch("https://nominatim.openstreetmap.org/search?format=json&limit=4&countrycodes=kr&accept-language=ko&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        return res.map(function (x) {
          var parts = x.display_name.split(",");
          return { name: parts[0].trim(), addr: parts.slice(1, 3).join(",").trim(), lat: +x.lat, lon: +x.lon };
        });
      })
      .catch(function () { return []; });
  }

  function goToResult(r) {
    $("spot-results").classList.add("hidden");
    $("spot-search").blur();
    map.flyTo({ center: [r.lon, r.lat], zoom: 12 });
    map.once("moveend", function () { pick(r.lat, r.lon); });
  }

  $("spot-search").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var q = this.value.trim();
    if (!q) return;
    var box = $("spot-results");
    box.classList.remove("hidden");
    box.innerHTML = '<div class="sr-empty">검색 중…</div>';
    var nq = q.toLowerCase().replace(/\s/g, "");
    var local = ASTRO_SPOTS.filter(function (s) {
      return s[0].toLowerCase().replace(/\s|·/g, "").indexOf(nq) >= 0;
    }).map(function (s) {
      return { name: "⭐ " + s[0], addr: "별 관측 명소", lat: s[1], lon: s[2] };
    });
    Promise.all([vworldSearch(q), nominatimSearch(q)]).then(function (rs) {
      var merged = local.concat(rs[0], rs[1]).slice(0, 7);
      if (!merged.length) {
        box.innerHTML = '<div class="sr-empty">"' + q + '" 결과 없음 — 근처 큰 지명(면·읍·산 이름)으로 검색한 뒤 지도에서 직접 눌러보세요</div>';
        return;
      }
      box.innerHTML = merged.map(function (r, i) {
        return '<div class="sr-item" data-i="' + i + '"><b>' + r.name + "</b><span>" + (r.addr || "") + "</span></div>";
      }).join("");
      box.querySelectorAll(".sr-item").forEach(function (el) {
        el.addEventListener("click", function () { goToResult(merged[+el.dataset.i]); });
      });
      if (merged.length === 1) goToResult(merged[0]);
    });
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
