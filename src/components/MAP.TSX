
'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import L, { LatLngExpression } from 'leaflet';
import type { Node } from '@/types/hydro';

export interface MapRef {
  setLayer: (layer: 'streets' | 'topo' | 'satellite' | 'neutral') => void;
  setView: (position: L.LatLngExpression, zoom?: number) => void;
  addNodeMarker: (position: L.LatLngExpression, tooltipText: string, nodeId: string) => void;
  addPipePolyline: (latlngs: L.LatLngExpression[]) => void;
  highlightNode: (nodeId: string, highlight: boolean) => void;
  startGuideLine: (startPos: L.LatLngExpression) => void;
  stopGuideLine: () => void;
  clearElements: () => void;
}

const tileLayers = {
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
};

interface MapProps {
  onMapClick?: (latlng: L.LatLng, clickedNode: Node | null) => void;
  drawingMode: 'node' | 'pipe' | null;
  initialCenter: L.LatLngExpression;
  initialZoom: number;
  nodes: Node[];
  hideNodeTooltips?: boolean;
}

const Map = forwardRef<MapRef, MapProps>(({ onMapClick, drawingMode, initialCenter, initialZoom, nodes, hideNodeTooltips = false }, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
  const nodeMarkersRef = useRef(new globalThis.Map<string, L.Marker>());
  const pipePolylinesRef = useRef<L.Polyline[]>([]);
  const guideLineRef = useRef<L.Polyline | null>(null);
  const onMapClickRef = useRef(onMapClick);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (mapContainerRef.current) {
        if (drawingMode === 'node') {
            mapContainerRef.current.style.cursor = 'crosshair';
        } else if (drawingMode === 'pipe') {
            mapContainerRef.current.style.cursor = 'crosshair'; // or a special pipe cursor
        } else {
            mapContainerRef.current.style.cursor = '';
        }
    }
  }, [drawingMode]);

  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapContainerRef.current, {
        zoomControl: false
      }).setView(initialCenter, initialZoom);
      mapInstanceRef.current = map;

      const initialLayerInfo = tileLayers['streets'];
      currentTileLayerRef.current = L.tileLayer(initialLayerInfo.url, {
        attribution: initialLayerInfo.attribution,
      }).addTo(map);

      map.on('click', (e) => {
        if (onMapClickRef.current) {
            // No node was clicked, it's a map click
            onMapClickRef.current(e.latlng, null);
        }
      });

      map.on('mousemove', (e) => {
        if (guideLineRef.current) {
          const startPos = guideLineRef.current.getLatLngs()[0] as L.LatLng;
          guideLineRef.current.setLatLngs([startPos, e.latlng]);
        }
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once

  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(initialCenter, initialZoom);
    }
  }, [initialCenter, initialZoom]);


  useImperativeHandle(ref, () => ({
    setLayer: (layer) => {
      if (!mapInstanceRef.current || !mapContainerRef.current) return;

      if (layer === 'neutral') {
        if (currentTileLayerRef.current) {
          mapInstanceRef.current.removeLayer(currentTileLayerRef.current);
          currentTileLayerRef.current = null;
        }
        mapContainerRef.current.style.backgroundColor = 'hsl(var(--muted))';
        mapInstanceRef.current.dragging.disable();
        mapInstanceRef.current.scrollWheelZoom.disable();
        return;
      }
      
      mapContainerRef.current.style.backgroundColor = '';
      mapInstanceRef.current.dragging.enable();
      mapInstanceRef.current.scrollWheelZoom.enable();

      if (currentTileLayerRef.current) {
        mapInstanceRef.current.removeLayer(currentTileLayerRef.current);
      }
      
      const newLayerInfo = tileLayers[layer];
      const newTileLayer = L.tileLayer(newLayerInfo.url, {
        attribution: newLayerInfo.attribution,
      });

      newTileLayer.addTo(mapInstanceRef.current!);
      currentTileLayerRef.current = newTileLayer;
    },
    setView: (position, zoom) => {
      if(mapInstanceRef.current) {
        mapInstanceRef.current.setView(position, zoom || mapInstanceRef.current.getZoom());
      }
    },
    addNodeMarker: (position, tooltipText, nodeId) => {
        if (!mapInstanceRef.current) return;
        const steelIcon = L.divIcon({
          html: `<div style="background-color: #B0C4DE; width: 12px; height: 12px; border-radius: 50%; border: 1px solid #4682B4;"></div>`,
          className: 'node-icon-default',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const marker = L.marker(position, { icon: steelIcon }).addTo(mapInstanceRef.current);
        
        if (!hideNodeTooltips) {
            marker.bindTooltip(tooltipText, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
        }
        
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            const clickedNode = nodes.find(n => n.id === nodeId);
            if (onMapClickRef.current && clickedNode) {
                onMapClickRef.current(e.latlng, clickedNode);
            }
        });
        
        nodeMarkersRef.current.set(nodeId, marker);
    },
    highlightNode: (nodeId, highlight) => {
        const marker = nodeMarkersRef.current.get(nodeId);
        if (!marker || !marker.getElement()) return;

        const iconEl = marker.getElement()?.querySelector('div');
        if (!iconEl) return;

        if (highlight) {
            iconEl.style.backgroundColor = 'red';
            iconEl.style.borderColor = 'darkred';
        } else {
            iconEl.style.backgroundColor = '#B0C4DE';
            iconEl.style.borderColor = '#4682B4';
        }
    },
    addPipePolyline: (latlngs) => {
        if (!mapInstanceRef.current) return;
        const polyline = L.polyline(latlngs, { 
            color: 'blue',
            weight: 3,
            opacity: 0.7,
        }).addTo(mapInstanceRef.current);
        pipePolylinesRef.current.push(polyline);
    },
    startGuideLine: (startPos) => {
        if (!mapInstanceRef.current) return;
        // Ensure previous guide line is removed
        if (guideLineRef.current) {
            guideLineRef.current.remove();
        }
        guideLineRef.current = L.polyline([startPos, startPos], {
            color: 'green',
            weight: 2,
            dashArray: '5, 10',
        }).addTo(mapInstanceRef.current);
    },
    stopGuideLine: () => {
        if (guideLineRef.current) {
            guideLineRef.current.remove();
            guideLineRef.current = null;
        }
    },
    clearElements: () => {
        nodeMarkersRef.current.forEach(marker => marker.remove());
        nodeMarkersRef.current.clear();
        pipePolylinesRef.current.forEach(polyline => polyline.remove());
        pipePolylinesRef.current = [];
    }
  }));

  return (
    <>
      <style>{`
        .node-tooltip {
          background-color: rgba(255, 255, 255, 0.9);
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 8px;
          font-size: 12px;
          min-width: 180px;
        }
        .node-icon-default {
            transition: background-color 0.2s, border-color 0.2s;
        }
      `}</style>
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
    </>
  );
});

Map.displayName = 'Map';

export default Map;
