// MPC 혜성 궤도요소 프록시 + 경량 JSON 변환
export default async function handler(req, res) {
  try {
    const r = await fetch("https://www.minorplanetcenter.net/iau/MPCORB/CometEls.txt");
    const txt = await r.text();
    const out = [];
    for (const line of txt.split("\n")) {
      if (line.length < 100) continue;
      const num = (v) => parseFloat(v.trim());
      const Ty = parseInt(line.slice(14, 18)), Tm = parseInt(line.slice(19, 21)), Td = num(line.slice(22, 29));
      const q = num(line.slice(30, 39));
      const e = num(line.slice(41, 49));
      const peri = num(line.slice(51, 59));
      const node = num(line.slice(61, 69));
      const incl = num(line.slice(71, 79));
      const g = num(line.slice(91, 95));
      const k = num(line.slice(96, 100));
      const name = line.slice(102, 158).trim();
      if (![Ty, Tm, Td, q, e, peri, node, incl].every(Number.isFinite)) continue;
      // 근일점 통과가 ±3년 밖이거나 근일점이 너무 멀면 제외 (밝을 가능성 낮음)
      const now = new Date();
      if (Math.abs(Ty - now.getFullYear()) > 3 || q > 4) continue;
      out.push({
        name,
        T: [Ty, Tm, Td],
        q, e, peri, node, incl,
        g: Number.isFinite(g) ? g : 10,
        k: Number.isFinite(k) ? k : 4
      });
    }
    res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: "upstream" });
  }
}
