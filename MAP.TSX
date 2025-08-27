
'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import L from 'leaflet';
import type { Node, Pipe } from '@/types/hydro';

type PolylineOptions = {
    color?: string;
    weight?: number;
    opacity?: number;
    dashArray?: string;
};

export interface MapRef {
  setLayer: (layer: 'streets' | 'topo' | 'satellite' | 'neutral') => void;
  setView: (position: L.LatLngExpression, zoom?: number) => void;
  highlightNode: (nodeId: string, highlight: boolean) => void;
  startGuideLine: (startPos: L.LatLngExpression, options?: PolylineOptions) => void;
  stopGuideLine: () => void;
  drawMeasurementResultLine: (startPos: L.LatLngExpression, endPos: L.LatLngExpression) => void;
  clearMeasurementResultLine: () => void;
}

const tileLayers = {
  streets: {
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank">OpenStreetMap France</a>',
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
  onMapClick?: (latlng: L.LatLng, clickedNode: Node | null, clickedPipe: Pipe | null) => void;
  drawingMode: 'node' | 'pipe' | 'reservoir' | 'valve' | 'pump' | 'tank' | 'wtp' | 'well' | 'intake' | 'vertex' | 'dual' | 'mesh' | 'delete-component' | 'measure' | 'delete-selection' | 'clean' | 'purge' | 'renumber' | 'move' | 'viewer' | 'undo' | null;
  initialCenter: L.LatLngExpression;
  initialZoom: number;
  nodes: Node[];
  pipes: Pipe[];
  hideNodeTooltips?: boolean;
}

const MapComponent = forwardRef<MapRef, MapProps>(({ onMapClick, drawingMode, initialCenter, initialZoom, nodes, pipes, hideNodeTooltips = false }, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
  const nodeMarkersRef = useRef(new Map<string, L.Marker>());
  const pipePolylinesRef = useRef(new Map<string, L.Polyline>());
  const guideLineRef = useRef<L.Polyline | null>(null);
  const measurementResultLineRef = useRef<L.Polyline | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const activeTooltipTimeout = useRef<NodeJS.Timeout | null>(null);


  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (mapContainerRef.current) {
        if (drawingMode === 'node' || drawingMode === 'pipe' || drawingMode === 'dual' || drawingMode === 'mesh' || drawingMode === 'measure') {
            mapContainerRef.current.style.cursor = 'crosshair';
        } else if (drawingMode === 'delete-component') {
            mapContainerRef.current.style.cursor = 'pointer';
        }
        else {
            mapContainerRef.current.style.cursor = '';
        }
    }
  }, [drawingMode]);

  // Map initialization and update effect
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

      const initialLayerInfo = tileLayers['satellite'];
      currentTileLayerRef.current = L.tileLayer(initialLayerInfo.url, {
        attribution: initialLayerInfo.attribution,
      }).addTo(map);

      map.on('click', (e) => {
        if (onMapClickRef.current) {
            onMapClickRef.current(e.latlng, null, null);
        }
      });

      map.on('mousemove', (e) => {
        if (guideLineRef.current) {
          const startPos = guideLineRef.current.getLatLngs()[0] as L.LatLng;
          guideLineRef.current.setLatLngs([startPos, e.latlng]);
        }
      });
    }
    
    const map = mapInstanceRef.current;
    if (!map) return;

    // Update nodes
    const displayedNodeIds = new Set(nodeMarkersRef.current.keys());
    const incomingNodeIds = new Set(nodes.map(n => n.id));

    // Remove old nodes
    for (const nodeId of displayedNodeIds) {
        if (!incomingNodeIds.has(nodeId)) {
            nodeMarkersRef.current.get(nodeId)?.remove();
            nodeMarkersRef.current.delete(nodeId);
        }
    }

    // Add or update nodes
    nodes.forEach(node => {
        if (node && node.latitud != null && node.longitud != null) {
            const tooltipContent = `
                <div style="text-align: left;">
                  <strong>Nudo ${node.id}</strong><br/>
                  Latitud: ${node.latitud.toFixed(6)}<br/>
                  Longitud: ${node.longitud.toFixed(6)}<br/>
                  Cota: ${node.cotaTerreno !== null ? node.cotaTerreno.toFixed(2) + ' m' : 'N/A'}
                </div>
            `;
            
            const existingMarker = nodeMarkersRef.current.get(node.id);

            if (!existingMarker) {
                const steelIcon = L.divIcon({
                    html: `<div style="background-color: #B0C4DE; width: 12px; height: 12px; border-radius: 50%; border: 1px solid #4682B4;"></div>`,
                    className: 'node-icon-default',
                    iconSize: [12, 12],
                    iconAnchor: [6, 6],
                });
                const marker = L.marker([node.latitud, node.longitud], { icon: steelIcon }).addTo(map);

                marker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (onMapClickRef.current) {
                        onMapClickRef.current(e.latlng, node, null);
                    }
                    marker.openTooltip();
                    if(activeTooltipTimeout.current) clearTimeout(activeTooltipTimeout.current);
                    activeTooltipTimeout.current = setTimeout(() => {
                        marker.closeTooltip();
                    }, 10000);
                });
                
                marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
                nodeMarkersRef.current.set(node.id, marker);

            } else {
                existingMarker.setLatLng([node.latitud, node.longitud]);
                if (existingMarker.getTooltip()) {
                    existingMarker.setTooltipContent(tooltipContent);
                } else {
                    existingMarker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
                }
            }

             const marker = nodeMarkersRef.current.get(node.id);
             if (marker) {
                if (hideNodeTooltips) {
                    if (marker.getTooltip()) {
                        marker.unbindTooltip();
                    }
                } else if (!marker.getTooltip()) {
                    marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
                }
             }
        }
    });

    // Update pipes
    const displayedPipeIds = new Set(pipePolylinesRef.current.keys());
    const incomingPipeIds = new Set(pipes.map(p => p.id));

    // Remove old pipes
    for (const pipeId of displayedPipeIds) {
        if (!incomingPipeIds.has(pipeId)) {
            pipePolylinesRef.current.get(pipeId)?.remove();
            pipePolylinesRef.current.delete(pipeId);
        }
    }

    // Add or update pipes
    pipes.forEach(pipe => {
        const startNode = nodes.find(n => n.id === pipe.startNodeId);
        const endNode = nodes.find(n => n.id === pipe.endNodeId);
        if (!startNode || !endNode) return;

        const latlngs: L.LatLngExpression[] = [
            [startNode.latitud, startNode.longitud],
            [endNode.latitud, endNode.longitud]
        ];

        const existingPolyline = pipePolylinesRef.current.get(pipe.id);
        const tooltipContent = `
            <div style="text-align: left;">
                <strong>Tubería ${pipe.id}</strong><br/>
                De: <strong>${pipe.startNodeId}</strong> a <strong>${pipe.endNodeId}</strong><br/>
                Longitud: ${pipe.length.toFixed(2)} m
            </div>
        `;

        if (!existingPolyline) {
            const polyline = L.polyline(latlngs, { 
                color: 'blue',
                weight: 3,
                opacity: 0.7,
            }).addTo(map);

            polyline.bindTooltip(tooltipContent, { className: 'pipe-tooltip' });
            
            polyline.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                if (onMapClickRef.current) {
                    onMapClickRef.current(e.latlng, null, pipe);
                }
            });

            const highlight = () => {
                polyline.setStyle({ color: 'red', weight: 5 });
                if (drawingMode === 'delete-component') mapContainerRef.current!.style.cursor = 'pointer';
            };
            const unhighlight = () => {
                polyline.setStyle({ color: 'blue', weight: 3 });
                if (drawingMode === 'delete-component') mapContainerRef.current!.style.cursor = 'pointer'; 
            };
            
            polyline.on('mouseover', highlight);
            polyline.on('mouseout', unhighlight);

            pipePolylinesRef.current.set(pipe.id, polyline);
        } else {
            existingPolyline.setLatLngs(latlngs);
            existingPolyline.unbindTooltip().bindTooltip(tooltipContent);
        }
    });
  }, [nodes, pipes, hideNodeTooltips, initialCenter, initialZoom, drawingMode]);


  useImperativeHandle(ref, () => ({
    setLayer: (layer) => {
      if (!mapInstanceRef.current || !mapContainerRef.current) return;

      if (layer === 'neutral') {
        if (currentTileLayerRef.current) {
          mapInstanceRef.current.removeLayer(currentTileLayerRef.current);
          currentTileLayerRef.current = null;
        }
        mapContainerRef.current.style.backgroundColor = 'hsl(var(--muted))';
        return;
      }
      
      mapContainerRef.current.style.backgroundColor = '';

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
    startGuideLine: (startPos, options) => {
        if (!mapInstanceRef.current) return;
        if (guideLineRef.current) {
            guideLineRef.current.remove();
        }
        const defaultOptions = {
            color: 'green',
            weight: 2,
            dashArray: '5, 10',
        };
        guideLineRef.current = L.polyline([startPos, startPos], { ...defaultOptions, ...options }).addTo(mapInstanceRef.current);
    },
    stopGuideLine: () => {
        if (guideLineRef.current) {
            guideLineRef.current.remove();
            guideLineRef.current = null;
        }
    },
    drawMeasurementResultLine: (startPos, endPos) => {
        if (!mapInstanceRef.current) return;
        if (measurementResultLineRef.current) {
            measurementResultLineRef.current.remove();
        }
        measurementResultLineRef.current = L.polyline([startPos, endPos], {
            color: 'red',
            weight: 3,
        }).addTo(mapInstanceRef.current);
    },
    clearMeasurementResultLine: () => {
        if (measurementResultLineRef.current) {
            measurementResultLineRef.current.remove();
            measurementResultLineRef.current = null;
        }
    },
  }));

  return (
    <>
      <style>{`
        .node-tooltip, .pipe-tooltip {
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

MapComponent.displayName = 'MapComponent';

export default MapComponent;
