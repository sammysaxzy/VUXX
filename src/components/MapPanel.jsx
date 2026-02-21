import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const NODE_COLORS = {
  olt: "#20c8ff",
  mst: "#ffb342",
  client: "#21d07a",
  suspended: "#ff4d57"
};

function nodeColor(node) {
  if (node.type === "client") {
    return node.status === "active" ? NODE_COLORS.client : NODE_COLORS.suspended;
  }
  return NODE_COLORS[node.type] ?? NODE_COLORS.mst;
}

export default function MapPanel({ nodes = [], fiberRoutes = [] }) {
  const mapCenter = nodes.length ? [nodes[0].latitude, nodes[0].longitude] : [6.63, 3.36];

  return (
    <section className="map-panel">
      <MapContainer center={mapCenter} zoom={13} className="noc-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {fiberRoutes.map((route) => {
          const path = (route.path?.coordinates || []).map(([lng, lat]) => [lat, lng]);
          if (!path.length) return null;
          return (
            <Polyline key={route.id} positions={path} pathOptions={{ color: "#33f1a8", weight: 4, opacity: 0.8 }} />
          );
        })}
        {nodes.map((node) => (
          <CircleMarker
            key={node.id}
            center={[node.latitude, node.longitude]}
            radius={node.type === "olt" ? 10 : 6}
            pathOptions={{ color: nodeColor(node), fillColor: nodeColor(node), fillOpacity: 0.7, weight: 1.5 }}
          >
            <Tooltip direction="top">{node.name}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="alarm-card">
        <strong>Critical alarm</strong>
        <p>OLT-A uplink latency elevated • <span>15m ago</span></p>
      </div>
    </section>
  );
}
