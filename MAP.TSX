
'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import L from 'leaflet';
import type { Node, Pipe, Vertex, Reservoir, Connectable, PTAP, Bocatoma, Captacion, PozoProfundo, TanqueElevado } from '@/types/hydro';

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
  calculateDistance: (point1: L.LatLngTuple, point2: L.LatLngTuple) => number;
  fitBounds: (point1: L.LatLng, point2: L.LatLng) => void;
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
  onMapClick?: (latlng: L.LatLng, clickedComponent: Connectable | null, clickedPipe: Pipe | null, clickedVertex: Vertex | null) => void;
  onNodeMove?: (nodeId: string, latlng: L.LatLng) => void;
  onVertexMove?: (vertexId: string, latlng: L.LatLng) => void;
  onMapDoubleClick?: () => void;
  drawingMode: 'node' | 'pipe' | 'reservoir' | 'valve-purge' | 'valve-air' | 'valve-control' | 'pump' | 'tank' | 'wtp' | 'well' | 'intake' | 'captation' | 'vertex' | 'dual' | 'mesh' | 'delete-component' | 'measure' | 'delete-selection' | 'clean' | 'purge' | 'renumber' | 'move' | 'viewer' | 'undo' | 'chamber-pumping' | 'chamber-junction' | 'chamber-pressure-break' | null;
  initialCenter: L.LatLngExpression;
  initialZoom: number;
  nodes: Node[];
  pipes: Pipe[];
  vertices: Vertex[];
  reservoirs: Reservoir[];
  ptaps: PTAP[];
  bocatomas: Bocatoma[];
  captaciones: Captacion[];
  pozosProfundos: PozoProfundo[];
  tanquesElevados: TanqueElevado[];
  hideNodeTooltips?: boolean;
  selectionPolygon?: L.LatLng[];
}

const MapComponent = forwardRef<MapRef, MapProps>(({ onMapClick, onNodeMove, onVertexMove, onMapDoubleClick, drawingMode, initialCenter, initialZoom, nodes, pipes, vertices, reservoirs, ptaps, bocatomas, captaciones, pozosProfundos, tanquesElevados, hideNodeTooltips = false, selectionPolygon = [] }, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
  const nodeMarkersRef = useRef(new Map<string, L.Marker>());
  const reservoirMarkersRef = useRef(new Map<string, L.Marker>());
  const ptapMarkersRef = useRef(new Map<string, L.Marker>());
  const bocatomaMarkersRef = useRef(new Map<string, L.Marker>());
  const captacionMarkersRef = useRef(new Map<string, L.Marker>());
  const pozoProfundoMarkersRef = useRef(new Map<string, L.Marker>());
  const tanqueElevadoMarkersRef = useRef(new Map<string, L.Marker>());
  const vertexMarkersRef = useRef(new Map<string, L.Marker>());
  const pipePolylinesRef = useRef(new Map<string, L.Polyline>());
  const guideLineRef = useRef<L.Polyline | null>(null);
  const measurementResultLineRef = useRef<L.Polyline | null>(null);
  const selectionPolygonRef = useRef<L.Polygon | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onNodeMoveRef = useRef(onNodeMove);
  const onVertexMoveRef = useRef(onVertexMove);
  const onMapDoubleClickRef = useRef(onMapDoubleClick);
  const activeTooltipTimeout = useRef<NodeJS.Timeout | null>(null);


  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onNodeMoveRef.current = onNodeMove;
    onVertexMoveRef.current = onVertexMove;
    onMapDoubleClickRef.current = onMapDoubleClick;
  }, [onMapClick, onNodeMove, onVertexMove, onMapDoubleClick]);

  useEffect(() => {
    if (mapContainerRef.current) {
        if (drawingMode === 'node' || drawingMode === 'reservoir' || drawingMode === 'pipe' || drawingMode === 'dual' || drawingMode === 'mesh' || drawingMode === 'measure' || drawingMode === 'delete-selection' || drawingMode === 'vertex' || drawingMode === 'viewer' || drawingMode === 'wtp' || drawingMode === 'intake' || drawingMode === 'captation' || drawingMode === 'well' || drawingMode === 'tank') {
            mapContainerRef.current.style.cursor = 'crosshair';
        } else if (drawingMode === 'delete-component') {
            mapContainerRef.current.style.cursor = 'pointer';
        } else if (drawingMode === 'move') {
            mapContainerRef.current.style.cursor = 'move';
        }
        else {
            mapContainerRef.current.style.cursor = '';
        }
    }
  }, [drawingMode]);

  const setNodeDraggable = useCallback((marker: L.Marker, isDraggable: boolean) => {
      if (isDraggable) {
          if (!marker.dragging?.enabled()) {
              marker.dragging?.enable();
          }
      } else {
          if (marker.dragging?.enabled()) {
              marker.dragging?.disable();
          }
      }
  }, []);

  // Map initialization and update effect
  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: '',
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
            onMapClickRef.current(e.latlng, null, null, null);
        }
      });

      map.on('dblclick', (e) => {
        L.DomEvent.stopPropagation(e);
        if (onMapDoubleClickRef.current) {
            onMapDoubleClickRef.current();
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

    // Update selection polygon
    if (selectionPolygon && selectionPolygon.length > 0) {
        if (!selectionPolygonRef.current) {
            selectionPolygonRef.current = L.polygon(selectionPolygon, {
                color: 'purple',
                fillColor: 'purple',
                fillOpacity: 0.2
            }).addTo(map);
        } else {
            selectionPolygonRef.current.setLatLngs(selectionPolygon);
        }
    } else {
        if (selectionPolygonRef.current) {
            selectionPolygonRef.current.remove();
            selectionPolygonRef.current = null;
        }
    }

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
                const marker = L.marker([node.latitud, node.longitud], { 
                    icon: steelIcon,
                    draggable: drawingMode === 'move',
                 }).addTo(map);

                marker.on('mouseover', () => {
                    if (!hideNodeTooltips) {
                        marker.openTooltip();
                    }
                });
                marker.on('mouseout', () => marker.closeTooltip());
                
                marker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (onMapClickRef.current) {
                        onMapClickRef.current(e.latlng, node, null, null);
                    }
                    
                    if (activeTooltipTimeout.current) clearTimeout(activeTooltipTimeout.current);
                    marker.openTooltip();
                    activeTooltipTimeout.current = setTimeout(() => {
                        marker.closeTooltip();
                    }, 10000);
                });
                
                marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
                
                marker.on('dragend', (e) => {
                    if (onNodeMoveRef.current) {
                        const newLatLng = e.target.getLatLng();
                        onNodeMoveRef.current(node.id, newLatLng);
                    }
                });

                nodeMarkersRef.current.set(node.id, marker);

            } else {
                existingMarker.setLatLng([node.latitud, node.longitud]);
                if (existingMarker.getTooltip()) {
                    existingMarker.setTooltipContent(tooltipContent);
                } else {
                    existingMarker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
                }
                setNodeDraggable(existingMarker, drawingMode === 'move');
            }

             const marker = nodeMarkersRef.current.get(node.id);
             if (marker) {
                 if (hideNodeTooltips) {
                    if (marker.isTooltipOpen()) marker.closeTooltip();
                    marker.off('mouseover');
                    marker.off('mouseout');
                } else if (!marker.listens('mouseover')) { // Re-bind if they were removed
                    marker.on('mouseover', () => marker.openTooltip());
                    marker.on('mouseout', () => marker.closeTooltip());
                }
             }
        }
    });

     // Update vertices
    const displayedVertexIds = new Set(vertexMarkersRef.current.keys());
    const incomingVertexIds = new Set(vertices.map(v => v.id));

    for (const vertexId of displayedVertexIds) {
        if (!incomingVertexIds.has(vertexId)) {
            vertexMarkersRef.current.get(vertexId)?.remove();
            vertexMarkersRef.current.delete(vertexId);
        }
    }
    
    vertices.forEach(vertex => {
        const tooltipContent = `
            <div style="text-align: left;">
              <strong>Vértice ${vertex.id}</strong><br/>
              Latitud: ${vertex.latitud.toFixed(6)}<br/>
              Longitud: ${vertex.longitud.toFixed(6)}<br/>
              Cota: ${vertex.cotaTerreno !== null ? vertex.cotaTerreno.toFixed(2) + ' m' : 'N/A'}
            </div>
        `;
        const existingMarker = vertexMarkersRef.current.get(vertex.id);

        if (!existingMarker) {
            const brownIcon = L.divIcon({
                html: `<div style="background-color: rgba(139, 69, 19, 0.7); width: 8px; height: 8px; border-radius: 50%; border: 1px solid #8B4513;"></div>`,
                className: 'vertex-icon-default',
                iconSize: [8, 8],
                iconAnchor: [4, 4],
            });
            const marker = L.marker([vertex.latitud, vertex.longitud], { 
                icon: brownIcon,
                draggable: drawingMode === 'move',
            }).addTo(map);

            marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -8), className: 'node-tooltip' });
            
            marker.on('dragend', (e) => {
                if (onVertexMoveRef.current) {
                    const newLatLng = e.target.getLatLng();
                    onVertexMoveRef.current(vertex.id, newLatLng);
                }
            });
            
            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                if (onMapClickRef.current) {
                    onMapClickRef.current(e.latlng, null, null, vertex);
                }
            });

            vertexMarkersRef.current.set(vertex.id, marker);
        } else {
            existingMarker.setLatLng([vertex.latitud, vertex.longitud]);
            existingMarker.setTooltipContent(tooltipContent);
            setNodeDraggable(existingMarker, drawingMode === 'move');
        }
    });


    // Update pipes
    const displayedPipeIds = new Set(pipePolylinesRef.current.keys());
    const incomingPipeIds = new Set(pipes.map(p => p.id));
    const allConnectables: Connectable[] = [...nodes, ...reservoirs, ...ptaps, ...bocatomas, ...captaciones, ...pozosProfundos, ...tanquesElevados];

    // Remove old pipes
    for (const pipeId of displayedPipeIds) {
        if (!incomingPipeIds.has(pipeId)) {
            pipePolylinesRef.current.get(pipeId)?.remove();
            pipePolylinesRef.current.delete(pipeId);
        }
    }

    // Add or update pipes
    pipes.forEach(pipe => {
        const startNode = allConnectables.find(c => c.id === pipe.startNodeId);
        const endNode = allConnectables.find(c => c.id === pipe.endNodeId);
        if (!startNode || !endNode) return;

        const pipeVertices = (pipe.vertexIds || []).map(vId => vertices.find(v => v.id === vId)).filter(v => v) as Vertex[];

        const latlngs: L.LatLngExpression[] = [
            [startNode.latitud, startNode.longitud],
            ...pipeVertices.map(v => [v.latitud, v.longitud]),
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

            if (!hideNodeTooltips) {
                polyline.bindTooltip(tooltipContent, { className: 'pipe-tooltip' });
            }
            
            polyline.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                if (onMapClickRef.current) {
                    onMapClickRef.current(e.latlng, null, pipe, null);
                }
            });

            const highlight = () => {
                if (drawingMode === 'node' || drawingMode === 'delete-component' || drawingMode === 'vertex') {
                  polyline.setStyle({ color: 'red', weight: 5 });
                  if (mapContainerRef.current) mapContainerRef.current!.style.cursor = 'pointer';
                }
            };
            const unhighlight = () => {
                if (drawingMode === 'node' || drawingMode === 'delete-component' || drawingMode === 'vertex') {
                  polyline.setStyle({ color: 'blue', weight: 3 });
                  if (mapContainerRef.current) mapContainerRef.current!.style.cursor = 'crosshair';
                }
            };
            
            polyline.on('mouseover', highlight);
            polyline.on('mouseout', unhighlight);

            pipePolylinesRef.current.set(pipe.id, polyline);
        } else {
            existingPolyline.setLatLngs(latlngs);
            if (hideNodeTooltips) {
                if (existingPolyline.getTooltip()) existingPolyline.unbindTooltip();
            } else {
                if (!existingPolyline.getTooltip()) {
                    existingPolyline.bindTooltip(tooltipContent, { className: 'pipe-tooltip' });
                } else {
                    existingPolyline.setTooltipContent(tooltipContent);
                }
            }
        }
    });

    // Update Reservoirs
    const displayedReservoirIds = new Set(reservoirMarkersRef.current.keys());
    const incomingReservoirIds = new Set(reservoirs.map(r => r.id));

    for (const reservoirId of displayedReservoirIds) {
        if (!incomingReservoirIds.has(reservoirId)) {
            reservoirMarkersRef.current.get(reservoirId)?.remove();
            reservoirMarkersRef.current.delete(reservoirId);
        }
    }

    reservoirs.forEach(reservoir => {
      const tooltipContent = `
          <div style="text-align: left;">
            <strong>Reservorio ${reservoir.id}</strong><br/>
            Cota: ${reservoir.cota !== null ? reservoir.cota.toFixed(2) + ' m' : 'N/A'}<br/>
            Volumen: ${reservoir.volumen} m³
          </div>
      `;
      const existingMarker = reservoirMarkersRef.current.get(reservoir.id);

      if (!existingMarker) {
          const greenIcon = L.divIcon({
              html: `<div style="background-color: rgba(34, 139, 34, 0.7); width: 12px; height: 12px; border-radius: 50%; border: 1px solid #006400;"></div>`,
              className: 'reservoir-icon-default',
              iconSize: [12, 12],
              iconAnchor: [6, 6],
          });
          const marker = L.marker([reservoir.latitud, reservoir.longitud], { 
              icon: greenIcon,
              draggable: drawingMode === 'move',
          }).addTo(map);

          marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
          
          marker.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              if (onMapClickRef.current) {
                  onMapClickRef.current(e.latlng, reservoir, null, null);
              }
          });

          reservoirMarkersRef.current.set(reservoir.id, marker);
      } else {
          existingMarker.setLatLng([reservoir.latitud, reservoir.longitud]);
          existingMarker.setTooltipContent(tooltipContent);
          setNodeDraggable(existingMarker, drawingMode === 'move');
      }
    });

    // Update PTAPs
    const displayedPtapIds = new Set(ptapMarkersRef.current.keys());
    const incomingPtapIds = new Set(ptaps.map(p => p.id));

    for (const ptapId of displayedPtapIds) {
        if (!incomingPtapIds.has(ptapId)) {
            ptapMarkersRef.current.get(ptapId)?.remove();
            ptapMarkersRef.current.delete(ptapId);
        }
    }

    ptaps.forEach(ptap => {
      const tooltipContent = `
          <div style="text-align: left;">
            <strong>PTAP ${ptap.id}</strong><br/>
            Cota: ${ptap.cota !== null ? ptap.cota.toFixed(2) + ' m' : 'N/A'}
          </div>
      `;
      const existingMarker = ptapMarkersRef.current.get(ptap.id);

      if (!existingMarker) {
          const yellowIcon = L.divIcon({
              html: `<div style="background-color: rgba(255, 255, 0, 0.7); width: 12px; height: 12px; border-radius: 50%; border: 1px solid #DAA520;"></div>`,
              className: 'ptap-icon-default',
              iconSize: [12, 12],
              iconAnchor: [6, 6],
          });
          const marker = L.marker([ptap.latitud, ptap.longitud], { 
              icon: yellowIcon,
              draggable: drawingMode === 'move',
          }).addTo(map);

          marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
          
          marker.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              if (onMapClickRef.current) {
                  onMapClickRef.current(e.latlng, ptap, null, null);
              }
          });

          ptapMarkersRef.current.set(ptap.id, marker);
      } else {
          existingMarker.setLatLng([ptap.latitud, ptap.longitud]);
          existingMarker.setTooltipContent(tooltipContent);
          setNodeDraggable(existingMarker, drawingMode === 'move');
      }
    });
    
    // Update Bocatomas
    const displayedBocatomaIds = new Set(bocatomaMarkersRef.current.keys());
    const incomingBocatomaIds = new Set(bocatomas.map(b => b.id));

    for (const bocatomaId of displayedBocatomaIds) {
        if (!incomingBocatomaIds.has(bocatomaId)) {
            bocatomaMarkersRef.current.get(bocatomaId)?.remove();
            bocatomaMarkersRef.current.delete(bocatomaId);
        }
    }

    bocatomas.forEach(bocatoma => {
      const tooltipContent = `
          <div style="text-align: left;">
            <strong>Bocatoma ${bocatoma.id}</strong><br/>
            Cota: ${bocatoma.cota !== null ? bocatoma.cota.toFixed(2) + ' m' : 'N/A'}
          </div>
      `;
      const existingMarker = bocatomaMarkersRef.current.get(bocatoma.id);

      if (!existingMarker) {
          const redIcon = L.divIcon({
              html: `<div style="background-color: rgba(255, 0, 0, 0.7); width: 12px; height: 12px; border-radius: 50%; border: 1px solid #B22222;"></div>`,
              className: 'bocatoma-icon-default',
              iconSize: [12, 12],
              iconAnchor: [6, 6],
          });
          const marker = L.marker([bocatoma.latitud, bocatoma.longitud], { 
              icon: redIcon,
              draggable: drawingMode === 'move',
          }).addTo(map);

          marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
          
          marker.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              if (onMapClickRef.current) {
                  onMapClickRef.current(e.latlng, bocatoma, null, null);
              }
          });

          bocatomaMarkersRef.current.set(bocatoma.id, marker);
      } else {
          existingMarker.setLatLng([bocatoma.latitud, bocatoma.longitud]);
          existingMarker.setTooltipContent(tooltipContent);
          setNodeDraggable(existingMarker, drawingMode === 'move');
      }
    });

    // Update Captaciones
    const displayedCaptacionIds = new Set(captacionMarkersRef.current.keys());
    const incomingCaptacionIds = new Set(captaciones.map(c => c.id));

    for (const captacionId of displayedCaptacionIds) {
        if (!incomingCaptacionIds.has(captacionId)) {
            captacionMarkersRef.current.get(captacionId)?.remove();
            captacionMarkersRef.current.delete(captacionId);
        }
    }

    captaciones.forEach(captacion => {
      const tooltipContent = `
          <div style="text-align: left;">
            <strong>Captación ${captacion.id}</strong><br/>
            Cota: ${captacion.cota !== null ? captacion.cota.toFixed(2) + ' m' : 'N/A'}
          </div>
      `;
      const existingMarker = captacionMarkersRef.current.get(captacion.id);

      if (!existingMarker) {
          const blueIcon = L.divIcon({
              html: `<div style="background-color: rgba(0, 0, 255, 0.7); width: 12px; height: 12px; border-radius: 50%; border: 1px solid #00008B;"></div>`,
              className: 'captacion-icon-default',
              iconSize: [12, 12],
              iconAnchor: [6, 6],
          });
          const marker = L.marker([captacion.latitud, captacion.longitud], { 
              icon: blueIcon,
              draggable: drawingMode === 'move',
          }).addTo(map);

          marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
          
          marker.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              if (onMapClickRef.current) {
                  onMapClickRef.current(e.latlng, captacion, null, null);
              }
          });

          captacionMarkersRef.current.set(captacion.id, marker);
      } else {
          existingMarker.setLatLng([captacion.latitud, captacion.longitud]);
          existingMarker.setTooltipContent(tooltipContent);
          setNodeDraggable(existingMarker, drawingMode === 'move');
      }
    });

    // Update Pozos Profundos
    const displayedPozoProfundoIds = new Set(pozoProfundoMarkersRef.current.keys());
    const incomingPozoProfundoIds = new Set(pozosProfundos.map(p => p.id));

    for (const pozoId of displayedPozoProfundoIds) {
        if (!incomingPozoProfundoIds.has(pozoId)) {
            pozoProfundoMarkersRef.current.get(pozoId)?.remove();
            pozoProfundoMarkersRef.current.delete(pozoId);
        }
    }

    pozosProfundos.forEach(pozo => {
      const tooltipContent = `
          <div style="text-align: left;">
            <strong>Pozo Profundo ${pozo.id}</strong><br/>
            Cota: ${pozo.cotaTerreno !== null ? pozo.cotaTerreno.toFixed(2) + ' m' : 'N/A'}
          </div>
      `;
      const existingMarker = pozoProfundoMarkersRef.current.get(pozo.id);

      if (!existingMarker) {
          const violetIcon = L.divIcon({
              html: `<div style="background-color: rgba(148, 0, 211, 0.7); width: 12px; height: 12px; border-radius: 50%; border: 1px solid #8A2BE2;"></div>`,
              className: 'pozo-profundo-icon-default',
              iconSize: [12, 12],
              iconAnchor: [6, 6],
          });
          const marker = L.marker([pozo.latitud, pozo.longitud], { 
              icon: violetIcon,
              draggable: drawingMode === 'move',
          }).addTo(map);

          marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
          
          marker.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              if (onMapClickRef.current) {
                  onMapClickRef.current(e.latlng, pozo, null, null);
              }
          });

          pozoProfundoMarkersRef.current.set(pozo.id, marker);
      } else {
          existingMarker.setLatLng([pozo.latitud, pozo.longitud]);
          existingMarker.setTooltipContent(tooltipContent);
          setNodeDraggable(existingMarker, drawingMode === 'move');
      }
    });

    // Update Tanques Elevados
    const displayedTanqueElevadoIds = new Set(tanqueElevadoMarkersRef.current.keys());
    const incomingTanqueElevadoIds = new Set(tanquesElevados.map(p => p.id));

    for (const tanqueId of displayedTanqueElevadoIds) {
        if (!incomingTanqueElevadoIds.has(tanqueId)) {
            tanqueElevadoMarkersRef.current.get(tanqueId)?.remove();
            tanqueElevadoMarkersRef.current.delete(tanqueId);
        }
    }

    tanquesElevados.forEach(tanque => {
      const tooltipContent = `
          <div style="text-align: left;">
            <strong>Tanque Elevado ${tanque.id}</strong><br/>
            Cota Terreno: ${tanque.cotaTerreno !== null ? tanque.cotaTerreno.toFixed(2) + ' m' : 'N/A'}
          </div>
      `;
      const existingMarker = tanqueElevadoMarkersRef.current.get(tanque.id);

      if (!existingMarker) {
          const orangeIcon = L.divIcon({
              html: `<div style="background-color: rgba(255, 165, 0, 0.7); width: 12px; height: 12px; border-radius: 50%; border: 1px solid #FFA500;"></div>`,
              className: 'tanque-elevado-icon-default',
              iconSize: [12, 12],
              iconAnchor: [6, 6],
          });
          const marker = L.marker([tanque.latitud, tanque.longitud], { 
              icon: orangeIcon,
              draggable: drawingMode === 'move',
          }).addTo(map);

          marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: L.point(0, -10), className: 'node-tooltip' });
          
          marker.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              if (onMapClickRef.current) {
                  onMapClickRef.current(e.latlng, tanque, null, null);
              }
          });

          tanqueElevadoMarkersRef.current.set(tanque.id, marker);
      } else {
          existingMarker.setLatLng([tanque.latitud, tanque.longitud]);
          existingMarker.setTooltipContent(tooltipContent);
          setNodeDraggable(existingMarker, drawingMode === 'move');
      }
    });


  }, [nodes, pipes, vertices, reservoirs, ptaps, bocatomas, captaciones, pozosProfundos, tanquesElevados, hideNodeTooltips, initialCenter, initialZoom, drawingMode, setNodeDraggable, selectionPolygon]);


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
        const marker = nodeMarkersRef.current.get(nodeId) 
          || reservoirMarkersRef.current.get(nodeId) 
          || ptapMarkersRef.current.get(nodeId) 
          || bocatomaMarkersRef.current.get(nodeId)
          || captacionMarkersRef.current.get(nodeId)
          || pozoProfundoMarkersRef.current.get(nodeId)
          || tanqueElevadoMarkersRef.current.get(nodeId);
        if (!marker || !marker.getElement()) return;

        const iconEl = marker.getElement()?.querySelector('div');
        if (!iconEl) return;

        if (highlight) {
            iconEl.style.backgroundColor = 'red';
            iconEl.style.borderColor = 'darkred';
        } else {
            // Restore original color based on component type
            if (nodeId.startsWith('N')) {
                 iconEl.style.backgroundColor = '#B0C4DE';
                 iconEl.style.borderColor = '#4682B4';
            } else if (nodeId.startsWith('R')) {
                 iconEl.style.backgroundColor = 'rgba(34, 139, 34, 0.7)';
                 iconEl.style.borderColor = '#006400';
            } else if (nodeId.startsWith('P')) { // PTAP
                iconEl.style.backgroundColor = 'rgba(255, 255, 0, 0.7)';
                iconEl.style.borderColor = '#DAA520';
            } else if (nodeId.startsWith('B')) {
                iconEl.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
                iconEl.style.borderColor = '#B22222';
            } else if (nodeId.startsWith('C')) {
                iconEl.style.backgroundColor = 'rgba(0, 0, 255, 0.7)';
                iconEl.style.borderColor = '#00008B';
            } else if (nodeId.startsWith('Pp')) {
                iconEl.style.backgroundColor = 'rgba(148, 0, 211, 0.7)';
                iconEl.style.borderColor = '#8A2BE2';
            } else if (nodeId.startsWith('Te')) {
                iconEl.style.backgroundColor = 'rgba(255, 165, 0, 0.7)';
                iconEl.style.borderColor = '#FFA500';
            }
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
    calculateDistance: (point1, point2) => {
        const latLng1 = L.latLng(point1);
        const latLng2 = L.latLng(point2);
        return latLng1.distanceTo(latLng2);
    },
    fitBounds: (point1, point2) => {
        if (mapInstanceRef.current) {
            const bounds = L.latLngBounds(point1, point2);
            mapInstanceRef.current.fitBounds(bounds);
        }
    }
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
        .node-icon-default, .reservoir-icon-default, .ptap-icon-default, .bocatoma-icon-default, .captacion-icon-default, .pozo-profundo-icon-default, .tanque-elevado-icon-default {
            transition: background-color 0.2s, border-color 0.2s;
        }
      `}</style>
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
    </>
  );
});

MapComponent.displayName = 'MapComponent';

export default MapComponent;

    