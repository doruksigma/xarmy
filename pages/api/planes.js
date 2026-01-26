import fetch from "node-fetch";

let cache = null;
let lastFetch = 0;
const CACHE_TIME = 15000; // 15 saniye

export default async function handler(req, res) {
  try {
    const now = Date.now();

    if (cache && now - lastFetch < CACHE_TIME) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).json(cache);
    }

    const response = await fetch("https://opensky-network.org/api/states/all");
    const data = await response.json();

    cache = data;
    lastFetch = now;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Uçak verisi alınamadı" });
  }
}
