/* 오늘별 — 대상 검색 & 오늘 밤 추천 */
(function () {
  "use strict";

  var LS_KEY = "todaystar_loc";
  var DEFAULT_LOC = { lat: 37.5665, lon: 126.978 };

  var TYPE_KO = {
    "G": "은하", "GPair": "은하쌍", "GTrpl": "은하 삼중주", "GGroup": "은하군",
    "OCl": "산개성단", "GCl": "구상성단", "Cl+N": "성단+성운",
    "PN": "행성상성운", "HII": "발광성운", "EmN": "발광성운", "Neb": "성운",
    "RfN": "반사성운", "SNR": "초신성잔해", "DrkN": "암흑성운",
    "*Ass": "성협", "**": "이중성"
  };
  var DIRS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  var CONST_KO = {
    And: "안드로메다", Ant: "공기펌프", Aps: "극락조", Aqr: "물병", Aql: "독수리", Ara: "제단",
    Ari: "양", Aur: "마차부", Boo: "목동", Cae: "조각칼", Cam: "기린", Cnc: "게",
    CVn: "사냥개", CMa: "큰개", CMi: "작은개", Cap: "염소", Car: "용골", Cas: "카시오페이아",
    Cen: "센타우루스", Cep: "세페우스", Cet: "고래", Cha: "카멜레온", Cir: "컴퍼스",
    Col: "비둘기", Com: "머리털", CrA: "남쪽왕관", CrB: "북쪽왕관", Crv: "까마귀",
    Crt: "컵", Cru: "남십자", Cyg: "백조", Del: "돌고래", Dor: "황새치", Dra: "용",
    Equ: "조랑말", Eri: "에리다누스", For: "화로", Gem: "쌍둥이", Gru: "두루미",
    Her: "헤르쿨레스", Hor: "시계", Hya: "바다뱀", Hyi: "물뱀", Ind: "인디언",
    Lac: "도마뱀", Leo: "사자", LMi: "작은사자", Lep: "토끼", Lib: "천칭", Lup: "이리",
    Lyn: "살쾡이", Lyr: "거문고", Men: "테이블산", Mic: "현미경", Mon: "외뿔소",
    Mus: "파리", Nor: "직각자", Oct: "팔분의", Oph: "뱀주인", Ori: "오리온",
    Pav: "공작", Peg: "페가수스", Per: "페르세우스", Phe: "불사조", Pic: "화가",
    Psc: "물고기", PsA: "남쪽물고기", Pup: "고물", Pyx: "나침반", Ret: "그물",
    Sge: "화살", Sgr: "궁수", Sco: "전갈", Scl: "조각가", Sct: "방패", Ser: "뱀",
    Sex: "육분의", Tau: "황소", Tel: "망원경", Tri: "삼각형", TrA: "남쪽삼각형",
    Tuc: "큰부리새", UMa: "큰곰", UMi: "작은곰", Vel: "돛", Vir: "처녀",
    Vol: "날치", Vul: "여우"
  };
  var GOOD_ALT = 30;     // 촬영 적기 기준 고도
  var SEASON_ALT = 35;   // 시즌 판정 기준 고도

  var $ = function (id) { return document.getElementById(id); };
  var CAT = null;        // [name, altName, ko, common, type, ra, dec, mag, size, const]
  var IDX = null;        // 검색 인덱스
  var current = null;    // 상세 화면에 떠 있는 객체 index

  /* ---------- 위치 ---------- */
  function getLoc() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && typeof s.lat === "number") return s;
    } catch (e) {}
    return DEFAULT_LOC;
  }

  /* ---------- 천문 계산 ---------- */
  function lstDeg(date, lon) {
    var d = (date.getTime() - 946728000000) / 86400000; // J2000.0 기준 경과일
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
  function dirName(az) { return DIRS[Math.floor(((az + 22.5) % 360) / 45)]; }
  function fmtTime(d) {
    if (!(d instanceof Date) || isNaN(d)) return "—";
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  // 사용자 촬영 시간 설정 (1시간 단위, ""=제한 없음)
  var HOURS_KEY = "todaystar_hours";
  function getHourPref() {
    try {
      var p = JSON.parse(localStorage.getItem(HOURS_KEY));
      if (p) return p;
    } catch (e) {}
    return { s: "", e: "" };
  }
  // 18~23시는 당일 저녁, 0~11시는 다음 날 새벽으로 해석
  function anchorHour(baseDate, h) {
    var day = h >= 12 ? 0 : 1;
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + day, h);
  }

  // 이 밤의 컨텍스트 (일몰~다음 일출, 천문박명 창 ∩ 사용자 설정 시간)
  function nightCtx(baseDate, lat, lon) {
    var noon = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12);
    var noonNext = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1, 12);
    var t = SunCalc.getTimes(noon, lat, lon);
    var tn = SunCalc.getTimes(noonNext, lat, lon);
    var darkStart = isNaN(t.night) ? t.nauticalDusk : t.night;
    var darkEnd = isNaN(tn.nightEnd) ? tn.nauticalDawn : tn.nightEnd;
    var p = getHourPref();
    var effStart = darkStart, effEnd = darkEnd;
    if (p.s !== "") {
      var us = anchorHour(baseDate, +p.s);
      if (us > effStart) effStart = us;
    }
    if (p.e !== "") {
      var ue = anchorHour(baseDate, +p.e);
      if (ue < effEnd) effEnd = ue;
    }
    return {
      sunset: t.sunset, sunrise: tn.sunrise,
      darkStart: darkStart, darkEnd: darkEnd,
      effStart: effStart, effEnd: effEnd,
      limited: p.s !== "" || p.e !== ""
    };
  }

  // 하룻밤 분석: 적기 구간(어둠 ∩ 고도 30°↑), 최고 고도
  function analyze(obj, ctx, lat, lon) {
    var ra = obj[5], dec = obj[6];
    var step = 5 * 60000;
    var maxAlt = -90, maxT = null, maxAz = 0;
    var segs = [], segStart = null;
    for (var t = ctx.sunset.getTime(); t <= ctx.sunrise.getTime(); t += step) {
      var d = new Date(t);
      var p = altAz(ra, dec, d, lat, lon);
      var inDark = t >= ctx.effStart.getTime() && t <= ctx.effEnd.getTime();
      if (inDark && p.alt > maxAlt) { maxAlt = p.alt; maxT = d; maxAz = p.az; }
      if (inDark && p.alt >= GOOD_ALT) {
        if (!segStart) segStart = d;
      } else if (segStart) {
        segs.push([segStart, new Date(t - step)]); segStart = null;
      }
    }
    if (segStart) segs.push([segStart, ctx.sunrise]);
    var best = null;
    for (var i = 0; i < segs.length; i++) {
      if (!best || segs[i][1] - segs[i][0] > best[1] - best[0]) best = segs[i];
    }
    return { maxAlt: maxAlt, maxT: maxT, maxAz: maxAz, window: best };
  }

  // 연중 촬영 시즌: 달마다 15일 밤의 어둠 속 최고 고도로 판정
  function season(obj, lat, lon) {
    var yr = new Date().getFullYear();
    var good = [];
    for (var m = 0; m < 12; m++) {
      var ctx = nightCtx(new Date(yr, m, 15), lat, lon);
      var maxAlt = -90;
      for (var t = ctx.darkStart.getTime(); t <= ctx.darkEnd.getTime(); t += 30 * 60000) {
        var a = altAz(obj[5], obj[6], new Date(t), lat, lon).alt;
        if (a > maxAlt) maxAlt = a;
      }
      good.push(maxAlt >= SEASON_ALT);
    }
    return good;
  }

  function fmtSeason(good) {
    if (good.every(Boolean)) return "일 년 내내";
    if (!good.some(Boolean)) return null;
    // 순환 배열에서 연속 구간 묶기: 나쁜 달에서 시작해 한 바퀴 돌면 중복이 없다
    var b = good.indexOf(false);
    var parts = [], start = null;
    for (var k = b; k < b + 12; k++) {
      var m = k % 12;
      if (good[m] && start === null) start = m;
      if (!good[m] && start !== null) {
        var end = (m + 11) % 12;
        parts.push(start === end ? (start + 1) + "월" : (start + 1) + "월~" + (end + 1) + "월");
        start = null;
      }
    }
    if (start !== null) {
      var last = (b + 11) % 12;
      parts.push(start === last ? (start + 1) + "월" : (start + 1) + "월~" + (last + 1) + "월");
    }
    return parts.join(" · ");
  }

  /* ---------- 검색 인덱스 ---------- */
  function norm(s) { return s.toLowerCase().replace(/[\s ]/g, ""); }

  function buildIndex() {
    IDX = CAT.map(function (o, i) {
      var ids = [norm(o[0])];
      if (o[1]) ids.push(norm(o[1]));
      return { i: i, ids: ids, ko: o[2], common: norm(o[3] || ""), mag: o[7] };
    });
  }

  function search(q) {
    q = norm(q);
    if (!q) return [];
    var exact = [], starts = [], incl = [];
    for (var k = 0; k < IDX.length; k++) {
      var e = IDX[k], hit = 0;
      for (var j = 0; j < e.ids.length; j++) {
        if (e.ids[j] === q) { hit = 3; break; }
        if (e.ids[j].indexOf(q) === 0) hit = Math.max(hit, 2);
      }
      if (!hit && e.ko && e.ko.indexOf(q) >= 0) hit = e.ko.indexOf(q) === 0 ? 2 : 1;
      if (!hit && q.length >= 3 && e.common.indexOf(q) >= 0) hit = 1;
      if (hit === 3) exact.push(e.i);
      else if (hit === 2) starts.push(e.i);
      else if (hit === 1) incl.push(e.i);
    }
    var byMag = function (a, b) {
      return (CAT[a][7] == null ? 99 : CAT[a][7]) - (CAT[b][7] == null ? 99 : CAT[b][7]);
    };
    starts.sort(byMag); incl.sort(byMag);
    return exact.concat(starts, incl).slice(0, 30);
  }

  /* ---------- 렌더 ---------- */
  // 실측 하늘 사진 (CDS hips2fits, DSS2 컬러 서베이) — 용량 0, 즉석 생성
  function thumbURL(o, px) {
    var fov = o[8] ? Math.min(Math.max((o[8] / 60) * 1.8, 0.15), 8) : 0.5;
    return "https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FDSS2%2Fcolor" +
      "&ra=" + o[5] + "&dec=" + o[6] + "&fov=" + fov.toFixed(3) +
      "&width=" + px + "&height=" + px + "&format=jpg";
  }

  // 천체사진식 자동 스트레칭: 배경(하위 20%)을 검은 점으로, 상위 0.2%를 흰 점으로
  function enhanceImg(img) {
    if (img.dataset.done) return;
    try {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return;
      var c = document.createElement("canvas");
      c.width = w; c.height = h;
      var g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      var im = g.getImageData(0, 0, w, h), px = im.data;
      var hist = new Uint32Array(256), i, n = px.length / 4;
      for (i = 0; i < px.length; i += 4) {
        hist[(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) | 0]++;
      }
      var cum = 0, lo = 0, hi = 255;
      for (i = 0; i < 256; i++) { cum += hist[i]; if (cum >= n * 0.20) { lo = i; break; } }
      cum = 0;
      for (i = 255; i >= 0; i--) { cum += hist[i]; if (cum >= n * 0.002) { hi = i; break; } }
      if (hi - lo < 12) hi = lo + 12;
      var lut = new Uint8Array(256);
      for (i = 0; i < 256; i++) {
        var v = (i - lo) / (hi - lo);
        v = Math.max(0, Math.min(1, v));
        lut[i] = Math.pow(v, 0.8) * 255;
      }
      for (i = 0; i < px.length; i += 4) {
        px[i] = lut[px[i]]; px[i + 1] = lut[px[i + 1]]; px[i + 2] = lut[px[i + 2]];
      }
      g.putImageData(im, 0, 0);
      img.dataset.done = "1";
      img.src = c.toDataURL("image/jpeg", 0.92);
      img.classList.add("enhanced");
    } catch (e) { /* CORS 실패 시 CSS 밝기 보정 유지 */ }
  }
  function attachEnhance(img, url) {
    img.crossOrigin = "anonymous";
    img.addEventListener("load", function () { enhanceImg(img); });
    img.src = url;
  }

  function openLightbox(o) {
    var img = $("lightbox-img");
    img.dataset.done = "";
    img.classList.remove("enhanced");
    img.removeAttribute("src");
    attachEnhance(img, thumbURL(o, 512));
    $("lightbox-cap").innerHTML = objTitle(o);
    $("lightbox").classList.remove("hidden");
  }
  $("lightbox").addEventListener("click", function () {
    this.classList.add("hidden");
    $("lightbox-img").src = "";
  });

  function objTitle(o) {
    var t = "<b>" + o[0] + "</b>";
    if (o[2]) t += " " + o[2];
    else if (o[3]) t += " " + o[3].split(",")[0];
    return t;
  }

  function rowHTML(i, ana) {
    var o = CAT[i];
    var when;
    if (ana.window) {
      when = "적기 " + fmtTime(ana.window[0]) + "~" + fmtTime(ana.window[1]) +
             " · 최고 " + Math.round(ana.maxAlt) + "° " + dirName(ana.maxAz);
    } else if (ana.maxAlt >= 10) {
      when = "오늘 밤 낮음 (최고 " + Math.round(ana.maxAlt) + "°)";
    } else {
      when = "오늘 밤 안 보임";
    }
    var meta = (TYPE_KO[o[4]] || o[4]) + (o[7] != null ? " · " + o[7].toFixed(1) + "등급" : "");
    return '<div class="t-row" data-i="' + i + '">' +
      '<img class="t-thumb" loading="lazy" data-src="' + thumbURL(o, 96) + '" alt="">' +
      '<div class="t-info"><div class="t-name">' + objTitle(o) + ' <span class="t-type">' + meta + "</span></div>" +
      '<div class="t-when ' + (ana.window ? "ok" : "") + '">' + when + "</div></div></div>";
  }

  function renderList(q) {
    var loc = getLoc();
    var ctx = nightCtx(new Date(), loc.lat, loc.lon);
    var box = $("target-list");
    $("target-detail").classList.add("hidden");
    box.classList.remove("hidden");

    var items, title;
    if (q && norm(q)) {
      items = search(q);
      title = items.length ? "검색 결과" : "검색 결과 없음 — M31, NGC 7000처럼 입력해보세요";
    } else {
      // 오늘 밤 추천: 유명한 대상 중 어둠 속 30°↑
      var famous = [];
      for (var i = 0; i < CAT.length; i++) {
        var o = CAT[i];
        if ((o[0][0] === "M" && o[0][1] >= "0" && o[0][1] <= "9") || o[2]) famous.push(i);
      }
      var scored = [];
      famous.forEach(function (i) {
        var ana = analyze(CAT[i], ctx, loc.lat, loc.lon);
        if (!ana.window) return;
        var mag = CAT[i][7] == null ? 9 : CAT[i][7];
        scored.push({ i: i, ana: ana, score: Math.min(ana.maxAlt, 75) + (10 - mag) * 4 });
      });
      scored.sort(function (a, b) { return b.score - a.score; });
      items = scored.slice(0, 12);
      if (ctx.effStart >= ctx.effEnd) {
        title = "설정한 촬영 시간이 어두운 시간과 겹치지 않아요 (완전한 어둠 " +
          fmtTime(ctx.darkStart) + "~" + fmtTime(ctx.darkEnd) + ")";
      } else {
        title = "오늘 밤 추천 " + fmtTime(ctx.effStart) + "~" + fmtTime(ctx.effEnd) +
          (ctx.limited ? " (촬영 시간 반영)" : "") + " 기준";
      }
    }

    var html = '<div class="t-head">' + title + "</div>";
    items.forEach(function (it) {
      var i = typeof it === "number" ? it : it.i;
      var ana = typeof it === "number" ? analyze(CAT[i], ctx, loc.lat, loc.lon) : it.ana;
      html += rowHTML(i, ana);
    });
    box.innerHTML = html;
    box.querySelectorAll(".t-row").forEach(function (el) {
      el.addEventListener("click", function () { renderDetail(+el.dataset.i); });
      var th = el.querySelector(".t-thumb");
      if (th) {
        th.addEventListener("click", function (e) {
          e.stopPropagation();
          openLightbox(CAT[+el.dataset.i]);
        });
        th.addEventListener("error", function () { th.style.visibility = "hidden"; });
        attachEnhance(th, th.dataset.src);
      }
    });
  }

  function renderDetail(i) {
    current = i;
    var o = CAT[i];
    var loc = getLoc();
    var ctx = nightCtx(new Date(), loc.lat, loc.lon);
    var ana = analyze(o, ctx, loc.lat, loc.lon);
    var seas = fmtSeason(season(o, loc.lat, loc.lon));

    var badge, badgeCls = "badge";
    if (ana.window) {
      badge = "오늘 밤 적기 " + fmtTime(ana.window[0]) + " ~ " + fmtTime(ana.window[1]) +
              " · 최고 " + Math.round(ana.maxAlt) + "° " + dirName(ana.maxAz) +
              (ana.maxT ? " (" + fmtTime(ana.maxT) + ")" : "");
    } else if (ana.maxAlt >= 10) {
      badge = "오늘 밤은 낮게 뜸 — 최고 " + Math.round(ana.maxAlt) + "° " + dirName(ana.maxAz);
      badgeCls += " warn";
    } else {
      badge = "오늘 밤은 보이지 않음";
      badgeCls += " warn";
    }

    // 달 간섭
    var moonNote = "";
    if (ana.window) {
      var mid = new Date((ana.window[0].getTime() + ana.window[1].getTime()) / 2);
      var mf = SunCalc.getMoonIllumination(mid).fraction;
      var mAlt = SunCalc.getMoonPosition(mid, loc.lat, loc.lon).altitude;
      moonNote = mAlt > 0
        ? "적기 시간에 달이 떠 있음 · 밝기 " + Math.round(mf * 100) + "%"
        : "적기 시간에 달 없음 — 달빛 간섭 없음";
    }

    var meta = (TYPE_KO[o[4]] || o[4]) + " · " + (CONST_KO[o[9]] || o[9]) + "자리" +
      (o[7] != null ? " · " + o[7].toFixed(1) + "등급" : "") +
      (o[8] != null ? " · 크기 " + (o[8] >= 60 ? (o[8] / 60).toFixed(1) + "°" : Math.round(o[8]) + "′") : "");

    var d = $("target-detail");
    d.innerHTML =
      '<div class="card">' +
      '<button id="btn-back" class="btn-back">← 목록으로</button>' +
      '<div class="d-head"><div><div class="big" style="margin-top:8px">' + objTitle(o) + "</div>" +
      '<div class="detail">' + meta + "</div></div>" +
      '<img class="d-thumb" loading="lazy" data-src="' + thumbURL(o, 220) + '" alt=""></div>' +
      '<div class="' + badgeCls + '" style="margin-top:10px">' + badge + "</div>" +
      '<canvas id="alt-chart" style="width:100%;height:170px;margin-top:14px"></canvas>' +
      '<div class="chart-legend"><span class="lg-obj">━ 대상</span> <span class="lg-moon">┄ 달</span> · 진한 배경 = 완전한 어둠</div>' +
      (seas ? '<div class="row"><span>촬영 시즌</span><b>' + seas + "</b></div>"
            : '<div class="row"><span>촬영 시즌</span><b>이 위도에서는 늘 낮음</b></div>') +
      (moonNote ? '<div class="row"><span>오늘 달</span><b>' + moonNote + "</b></div>" : "") +
      "</div>";
    d.classList.remove("hidden");
    $("target-list").classList.add("hidden");
    $("btn-back").addEventListener("click", function () {
      current = null;
      renderList($("target-search").value);
    });
    var dth = d.querySelector(".d-thumb");
    if (dth) {
      dth.addEventListener("click", function (e) {
        e.stopPropagation();
        openLightbox(o);
      });
      dth.addEventListener("error", function () { dth.style.display = "none"; });
      attachEnhance(dth, dth.dataset.src);
    }
    drawChart($("alt-chart"), o, ctx, loc);
    d.scrollIntoView({ behavior: "instant", block: "start" });
  }

  function drawChart(canvas, o, ctx, loc) {
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var g = canvas.getContext("2d");
    g.scale(dpr, dpr);

    var padL = 26, padB = 18, padT = 6;
    var t0 = ctx.sunset.getTime(), t1 = ctx.sunrise.getTime();
    var X = function (t) { return padL + (t - t0) / (t1 - t0) * (W - padL - 4); };
    var Y = function (alt) { return padT + (1 - alt / 90) * (H - padT - padB); };

    // 배경: 박명(연한) / 완전한 어둠(진한)
    g.fillStyle = "#1e2650";
    g.fillRect(padL, padT, W - padL - 4, H - padT - padB);
    g.fillStyle = "#0b1026";
    g.fillRect(X(ctx.darkStart.getTime()), padT,
      X(ctx.darkEnd.getTime()) - X(ctx.darkStart.getTime()), H - padT - padB);

    // 사용자 촬영 시간 경계선
    if (ctx.limited && ctx.effStart < ctx.effEnd) {
      g.strokeStyle = "rgba(110,231,160,0.7)";
      g.setLineDash([5, 3]);
      [ctx.effStart.getTime(), ctx.effEnd.getTime()].forEach(function (tt) {
        g.beginPath(); g.moveTo(X(tt), padT); g.lineTo(X(tt), H - padB); g.stroke();
      });
      g.setLineDash([]);
    }

    // 30° 기준선
    g.strokeStyle = "rgba(154,163,207,0.5)";
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(padL, Y(30)); g.lineTo(W - 4, Y(30)); g.stroke();
    g.setLineDash([]);

    // 눈금
    g.fillStyle = "#9aa3cf";
    g.font = "10px sans-serif";
    g.textAlign = "right";
    [0, 30, 60, 90].forEach(function (a) { g.fillText(a + "°", padL - 4, Y(a) + 3); });
    g.textAlign = "center";
    var d0 = new Date(t0); d0.setMinutes(0, 0, 0);
    for (var t = d0.getTime(); t <= t1; t += 3600000) {
      var hh = new Date(t).getHours();
      if (hh % 2 === 0 && t >= t0) {
        g.fillText(hh + "시", X(t), H - 5);
        g.strokeStyle = "rgba(255,255,255,0.06)";
        g.beginPath(); g.moveTo(X(t), padT); g.lineTo(X(t), H - padB); g.stroke();
      }
    }

    // 달 고도 곡선
    g.strokeStyle = "rgba(154,163,207,0.8)";
    g.setLineDash([2, 4]);
    g.beginPath();
    var started = false;
    for (var tt = t0; tt <= t1; tt += 10 * 60000) {
      var ma = SunCalc.getMoonPosition(new Date(tt), loc.lat, loc.lon).altitude * 180 / Math.PI;
      if (ma < 0) { started = false; continue; }
      if (!started) { g.moveTo(X(tt), Y(ma)); started = true; }
      else g.lineTo(X(tt), Y(ma));
    }
    g.stroke();
    g.setLineDash([]);

    // 대상 고도 곡선
    g.strokeStyle = "#ffd76a";
    g.lineWidth = 2.5;
    g.beginPath();
    started = false;
    var maxA = -90, maxTt = null;
    for (tt = t0; tt <= t1; tt += 5 * 60000) {
      var a = altAz(o[5], o[6], new Date(tt), loc.lat, loc.lon).alt;
      if (a > maxA) { maxA = a; maxTt = tt; }
      if (a < 0) { started = false; continue; }
      if (!started) { g.moveTo(X(tt), Y(a)); started = true; }
      else g.lineTo(X(tt), Y(a));
    }
    g.stroke();
    g.lineWidth = 1;

    // 최고점 표시
    if (maxA > 0) {
      g.fillStyle = "#ffd76a";
      g.beginPath(); g.arc(X(maxTt), Y(maxA), 3.5, 0, Math.PI * 2); g.fill();
    }
  }

  /* ---------- 탭 전환 ---------- */
  function showView(v) {
    ["today", "targets", "milkyway", "spots"].forEach(function (name) {
      var el = $("view-" + name);
      if (el) el.classList.toggle("hidden", v !== name);
    });
    document.querySelectorAll(".tabbar button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === v);
    });
    if (v === "targets" && CAT && !$("target-detail").innerHTML) renderList("");
  }

  document.querySelectorAll(".tabbar button").forEach(function (b) {
    b.addEventListener("click", function () { showView(b.dataset.view); });
  });

  ["hour-start", "hour-end"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      var pref = { s: $("hour-start").value, e: $("hour-end").value };
      try { localStorage.setItem(HOURS_KEY, JSON.stringify(pref)); } catch (e) {}
      if (current != null) renderDetail(current);
      else renderList($("target-search").value);
    });
  });
  (function () {
    var p = getHourPref();
    $("hour-start").value = p.s;
    $("hour-end").value = p.e;
  })();

  var searchTimer = null;
  $("target-search").addEventListener("input", function () {
    clearTimeout(searchTimer);
    var v = this.value;
    searchTimer = setTimeout(function () { renderList(v); }, 200);
  });

  document.addEventListener("todaystar:loc", function () {
    if (!CAT) return;
    if (current != null) renderDetail(current);
    else if (!$("view-targets").classList.contains("hidden")) renderList($("target-search").value);
  });

  /* ---------- 데이터 로드 ---------- */
  fetch("objects.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      CAT = data;
      buildIndex();
      if (!$("view-targets").classList.contains("hidden")) renderList("");
    });
})();
