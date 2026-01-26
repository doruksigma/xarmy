import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Sarı uçak ikonu
const planeIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/744/744465.png",
  iconSize: [25, 25],
  iconAnchor: [12, 12]
});

export default function Radar() {
  const [planes, setPlanes] = useState([]);

  async function loadPlanes() {
    try {
      const res = await fetch("/api/planes");
      const data = await res.json();

      const formatted = data.states
        .filter(p => p[5] && p[6])
        .map(p => ({
          id: p[0],
          callsign: p[1],
          country: p[2],
          lon: p[5],
          lat: p[6],
          alt: Math.round(p[7])
        }));

      setPlanes(formatted);
    } catch (e) {
      console.log("Uçak verisi alınamadı");
    }
  }

  useEffect(() => {
    loadPlanes();
    const interval = setInterval(loadPlanes, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer center={[20, 0]} zoom={2} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {planes.map(p => (
          <Marker
            key={p.id}
            position={[p.lat, p.lon]}
            icon={planeIcon}
          >
            <Popup>
              ✈️ <b>{p.callsign || "Bilinmiyor"}</b><br />
              🌍 {p.country}<br />
              🛫 Yükseklik: {p.alt} m
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
