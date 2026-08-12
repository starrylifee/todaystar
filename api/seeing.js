// 7Timer ASTRO 프록시 (CORS 우회)
export default async function handler(req, res) {
  const { lat, lon } = req.query;
  const la = parseFloat(lat), lo = parseFloat(lon);
  if (!isFinite(la) || !isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
    return res.status(400).json({ error: "bad coords" });
  }
  try {
    const r = await fetch(
      `https://www.7timer.info/bin/astro.php?lon=${lo.toFixed(3)}&lat=${la.toFixed(3)}&ac=0&unit=metric&output=json&tzshift=0`
    );
    const j = await r.json();
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.status(200).json(j);
  } catch (e) {
    res.status(502).json({ error: "upstream" });
  }
}
