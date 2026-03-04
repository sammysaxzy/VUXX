import { useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const MAP_CENTER = [34.0522, -118.2437];
const TRUNK = [
  [34.0527, -118.2472],
  [34.05255, -118.2457],
  [34.05245, -118.2443],
  [34.05242, -118.2424],
  [34.0525, -118.2409]
];
const MST = [34.05242, -118.2424];
const SPLITTER = [34.05155, -118.2422];
const CLIENT = [34.0511, -118.2415];
const NORTH_BRANCH = [34.0532, -118.2408];

function CursorTracker({ onChange }) {
  useMapEvents({
    mousemove(event) {
      onChange(event.latlng);
    },
    moveend(event) {
      onChange(event.target.getCenter());
    }
  });
  return null;
}

function formatCoordinate(value, positive, negative) {
  return {
    amount: `${Math.abs(value).toFixed(6)}°`,
    direction: value >= 0 ? positive : negative
  };
}

export default function MapPanel() {
  const [map, setMap] = useState(null);
  const [coords, setCoords] = useState({ lat: MAP_CENTER[0], lng: MAP_CENTER[1] });
  const [satelliteMode, setSatelliteMode] = useState(true);

  const lat = formatCoordinate(coords.lat, "N", "S");
  const lng = formatCoordinate(coords.lng, "E", "W");

  const tileUrl = satelliteMode
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  const handleLocate = () => {
    if (!navigator.geolocation || !map) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords: current }) => {
        map.flyTo([current.latitude, current.longitude], 18, { duration: 0.8 });
        setCoords({ lat: current.latitude, lng: current.longitude });
      },
      () => {}
    );
  };

  return (
    <section className="fg-map-wrap">
      <MapContainer
        center={MAP_CENTER}
        zoom={18}
        className="fg-map"
        zoomControl={false}
        attributionControl={false}
        whenCreated={setMap}
      >
        <TileLayer url={tileUrl} />
        <Polyline positions={TRUNK} pathOptions={{ color: "#1f6fff", weight: 4, opacity: 0.9, dashArray: "8 8" }} />
        <Polyline positions={[MST, SPLITTER]} pathOptions={{ color: "#1f6fff", weight: 2.5, opacity: 0.95 }} />
        <Polyline
          positions={[SPLITTER, CLIENT]}
          pathOptions={{ color: "#60a5fa", weight: 2, opacity: 0.9, dashArray: "5 6" }}
        />
        <Polyline positions={[TRUNK[4], NORTH_BRANCH]} pathOptions={{ color: "#1f6fff", weight: 2, opacity: 0.8 }} />
        <CircleMarker center={MST} radius={6} pathOptions={{ color: "#1f6fff", fillColor: "#1f6fff", fillOpacity: 1 }} />
        <CircleMarker
          center={SPLITTER}
          radius={5}
          pathOptions={{ color: "#1f6fff", fillColor: "#1f6fff", fillOpacity: 0.95 }}
        />
        <CircleMarker
          center={CLIENT}
          radius={4}
          pathOptions={{ color: "#60a5fa", fillColor: "#60a5fa", fillOpacity: 1 }}
        />
        <CursorTracker onChange={(point) => setCoords({ lat: point.lat, lng: point.lng })} />
      </MapContainer>

      <div className="fg-map-vignette"></div>
      <div className="fg-map-grid"></div>

      <div className="fg-building one"></div>
      <div className="fg-building two"></div>
      <div className="fg-building three"></div>

      <div className="fg-map-tag mst">MST-042 (8P)</div>
      <div className="fg-map-tag client">Client End (John Doe)</div>

      <div className="fg-map-controls">
        <div className="fg-zoom-box">
          <button type="button" onClick={() => map?.zoomIn()}>
            +
          </button>
          <button type="button" onClick={() => map?.zoomOut()}>
            -
          </button>
        </div>
        <button type="button" onClick={handleLocate}>
          LOC
        </button>
        <button type="button" onClick={() => setSatelliteMode((value) => !value)}>
          LYR
        </button>
      </div>

      <div className="fg-coordinate-card">
        <div>
          <small>LATITUDE</small>
          <strong>{lat.amount}</strong>
          <span>{lat.direction}</span>
        </div>
        <i></i>
        <div>
          <small>LONGITUDE</small>
          <strong>{lng.amount}</strong>
          <span>{lng.direction}</span>
        </div>
      </div>
    </section>
  );
}
