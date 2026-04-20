"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Leaflet räknar ut tile-pane-dimensioner vid mount. När kartan ritas
 * inuti en container som fortfarande har 0x0 (t.ex. inne i ett utfällt
 * kort eller ett flex-layout som ännu inte är stabilt) hamnar tiles-panen
 * på 0x0 och bilderna blir osynliga fast de laddas. invalidateSize gör
 * om beräkningen när containern fått sin slutgiltiga storlek.
 */
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    // Kör först en liten stund efter mount för att fånga första layout.
    const timeouts = [
      setTimeout(() => map.invalidateSize(), 0),
      setTimeout(() => map.invalidateSize(), 250),
      setTimeout(() => map.invalidateSize(), 800),
    ];
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      timeouts.forEach(clearTimeout);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

const dotIcon = L.divIcon({
  className: "",
  html: '<div style="width:12px;height:12px;background:#007AFF;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const pinIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const CARTO_LIGHT =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png";

const OSM_SWEDISH = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

interface Props {
  lat: number;
  lng: number;
  height?: number | string;
  interactive?: boolean;
  zoom?: number;
  locale?: "en" | "sv";
  onClick?: () => void;
}

export default function InvestorMiniMap({
  lat,
  lng,
  height = 90,
  interactive = false,
  zoom = 10,
  locale = "en",
  onClick,
}: Props) {
  const tileUrl = locale === "sv" ? OSM_SWEDISH : CARTO_LIGHT;

  return (
    <div
      style={{
        position: "relative",
        cursor: onClick ? "pointer" : undefined,
      }}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              e.preventDefault();
              onClick();
            }
          : undefined
      }
    >
      <MapContainer
        center={[lat, lng]}
        zoom={zoom}
        style={{
          height,
          width: "100%",
          pointerEvents: onClick && !interactive ? "none" : undefined,
        }}
        zoomControl={interactive}
        dragging={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        attributionControl={false}
      >
        <TileLayer url={tileUrl} />
        <Marker position={[lat, lng]} icon={interactive ? pinIcon : dotIcon} />
        <InvalidateOnResize />
      </MapContainer>
    </div>
  );
}
