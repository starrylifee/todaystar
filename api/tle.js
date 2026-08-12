// ISS TLE 프록시 (Celestrak, CORS 우회)
export default async function handler(req, res) {
  try {
    const r = await fetch("https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle");
    const txt = await r.text();
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=43200");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(txt);
  } catch (e) {
    res.status(502).send("upstream error");
  }
}
