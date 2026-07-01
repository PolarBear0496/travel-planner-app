import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Itinerary, Spot } from "../types/itinerary";

type MapViewProps = {
  itinerary: Itinerary;
  selectedSpotId: string | null;
  onSelectSpot: (spotId: string) => void;
};

type MapSpot = Spot & {
  routeIndex: number;
};

function hasCoordinates<T extends Spot>(spot: T): spot is T & { lat: number; lng: number } {
  return typeof spot.lat === "number" && typeof spot.lng === "number";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createNumberedIcon(index: number, isSelected: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="trip-map-pin${isSelected ? " trip-map-pin-selected" : ""}"><span>${index}</span></span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -34],
  });
}

function getAllSpots(itinerary: Itinerary): MapSpot[] {
  return itinerary.days.flatMap((day) =>
    day.spots.map((spot) => ({
      ...spot,
      dayId: day.id,
    })),
  ).map((spot, index) => ({ ...spot, routeIndex: index + 1 }));
}

export function MapView({ itinerary, selectedSpotId, onSelectSpot }: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const markerRefs = useRef<Record<string, L.Marker>>({});

  const spots = useMemo(() => getAllSpots(itinerary), [itinerary]);
  const mappedSpots = useMemo(() => spots.filter(hasCoordinates), [spots]);
  const missingLocationSpots = spots.filter((spot) => !hasCoordinates(spot));

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return;
    }

    mapRef.current = L.map(mapElementRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    routeLayerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      markerRefs.current = {};
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !routeLayerRef.current) {
      return;
    }

    routeLayerRef.current.clearLayers();
    markerRefs.current = {};

    const latLngs = mappedSpots.map((spot) => L.latLng(spot.lat, spot.lng));

    if (latLngs.length > 1) {
      L.polyline(latLngs, {
        color: "#2563eb",
        weight: 4,
        opacity: 0.78,
        dashArray: "8 8",
      }).addTo(routeLayerRef.current);
    }

    mappedSpots.forEach((spot) => {
      const marker = L.marker([spot.lat, spot.lng], {
        icon: createNumberedIcon(spot.routeIndex, spot.id === selectedSpotId),
        title: spot.name,
      })
        .addTo(routeLayerRef.current as L.LayerGroup)
        .bindPopup(
          `<strong>${spot.routeIndex}. ${escapeHtml(spot.title ?? spot.name)}</strong><br>${escapeHtml(
            spot.time,
          )}<br>${escapeHtml(spot.memo ?? spot.description)}`,
        )
        .on("click", () => onSelectSpot(spot.id));

      markerRefs.current[spot.id] = marker;
    });

    if (latLngs.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(latLngs), {
        padding: [42, 42],
        maxZoom: 15,
      });
    } else {
      mapRef.current.setView([35.3192, 139.5505], 13);
    }
  }, [mappedSpots, onSelectSpot, selectedSpotId]);

  useEffect(() => {
    const selectedMarker = selectedSpotId ? markerRefs.current[selectedSpotId] : null;

    if (!selectedMarker || !mapRef.current) {
      return;
    }

    selectedMarker.setIcon(
      createNumberedIcon(
        mappedSpots.find((spot) => spot.id === selectedSpotId)?.routeIndex ?? 1,
        true,
      ),
    );
    mapRef.current.panTo(selectedMarker.getLatLng(), { animate: true });
    selectedMarker.openPopup();
  }, [mappedSpots, selectedSpotId]);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.10)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-extrabold text-slate-950">ルートマップ</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            ピン番号は旅程の順番と同期します。
          </p>
        </div>
        <p className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          {mappedSpots.length}地点を表示
        </p>
      </div>

      <div ref={mapElementRef} className="h-[360px] w-full sm:h-[520px]" aria-label="旅程地図" />

      {missingLocationSpots.length > 0 ? (
        <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800">
          位置情報がないスポット:
          {" "}
          {missingLocationSpots.map((spot) => spot.name).join("、")}
        </div>
      ) : null}
    </section>
  );
}
