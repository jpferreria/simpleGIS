import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap, ZoomControl, useMapEvents } from 'react-leaflet';
import html2canvas from 'html2canvas';
import * as turf from '@turf/turf';

// Fix for default Leaflet icons in Vite/React
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import Draggable from 'react-draggable';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";

import 'leaflet/dist/leaflet.css';

// Geoman for drawing
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import * as toGeoJSON from '@tmcw/togeojson';

// --- M17 Custom Point Icons ---
const ICON_SVGS = {
  pin: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
  star: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  hospital: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
  alert: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  target: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`
};

const geoJsonPointToLayer = (feature, latlng) => {
  const iconName = feature.properties?.icon || 'pin';
  const iconHtml = `<div style="color: ${feature.properties?.color || '#3b82f6'};">${ICON_SVGS[iconName] || ICON_SVGS.pin}</div>`;
  const markerIcon = L.divIcon({
    className: 'custom-div-icon',
    html: iconHtml,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
  return L.marker(latlng, { icon: markerIcon });
};

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const liveLocationIcon = L.divIcon({
  className: 'custom-location-icon',
  html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-pulse"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

// M12: Basemap Providers
const BASEMAPS = {
  osm: {
    name: 'Standard (OSM)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  satellite: {
    name: 'Satellite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  },
  dark: {
    name: 'Dark Matter',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  },
  topo: {
    name: 'Topographic',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; OpenTopoMap'
  }
};

function GeomanSetup({ onCreated }) {
  const map = useMap();

  useEffect(() => {
    map.pm.addControls({
      position: 'topright',
      drawCircleMarker: false,
      drawCircle: false,
      drawText: true,
      editControls: true, // Enabled edits, drags, and removals
    });

    const handleCreate = (e) => {
      onCreated({ layerType: e.shape, layer: e.layer });
    };

    map.on('pm:create', handleCreate);

    // Make the Geoman toolbar draggable using Leaflet's native Draggable class
    setTimeout(() => {
      const toolbars = document.querySelectorAll('.leaflet-pm-toolbar');
      toolbars.forEach(toolbar => {
        toolbar.style.cursor = 'move';
        
        // Prevent click events on buttons from initiating drag
        const buttons = toolbar.querySelectorAll('a');
        buttons.forEach(btn => {
          btn.addEventListener('mousedown', (e) => e.stopPropagation());
          btn.addEventListener('touchstart', (e) => e.stopPropagation());
        });

        // Initialize Leaflet's built-in Draggable class
        const draggable = new L.Draggable(toolbar);
        draggable.enable();
      });
    }, 500);

    return () => {
      map.pm.removeControls();
      map.off('pm:create', handleCreate);
    };
  }, [map, onCreated]);

  return null;
}

// Helper component to jump map to bounds
function MapController({ jumpTo, routingMode, setRoutePoints }) {
  const map = useMap();
  
  useMapEvents({
    click(e) {
      if (routingMode) {
        setRoutePoints(prev => [...prev, e.latlng]);
      }
    }
  });

  useEffect(() => {
    if (jumpTo) {
      if (jumpTo.bounds) {
        map.flyToBounds(jumpTo.bounds, { padding: [50, 50], duration: 1.5 });
      } else if (jumpTo.center) {
        map.flyTo(jumpTo.center, 15, { duration: 1.5 });
      }
    }
  }, [jumpTo, map]);
  return null;
}

function App() {
  const position = [51.505, -0.09]; // Default to London
  const [features, setFeatures] = useState({ type: 'FeatureCollection', features: [] });
  const mapRef = useRef(null);

  // M8 State
  const [hiddenFeatureIds, setHiddenFeatureIds] = useState(new Set());
  const [editingFeature, setEditingFeature] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [jumpTo, setJumpTo] = useState(null);

  // M9 State (Imports)
  const fileInputRef = useRef(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // M10 State (Routing)
  const [routingMode, setRoutingMode] = useState(false);
  const [routePoints, setRoutePoints] = useState([]);

  // M11 State (Geolocation)
  const [isTracking, setIsTracking] = useState(false);
  const [liveLocation, setLiveLocation] = useState(null);
  const watchIdRef = useRef(null);

  // M12 State (Basemaps)
  const [activeBasemap, setActiveBasemap] = useState('osm');

  // M13 State (Hexbin Density)
  const [showDensityMap, setShowDensityMap] = useState(false);
  const [hexGridData, setHexGridData] = useState(null);

  // M14 State (Analytics Dashboard)
  const [showDashboard, setShowDashboard] = useState(false);

  // M16 State (Geocoding Search)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPin, setSearchPin] = useState(null); // [lat, lng]

  // M18 State (Spatial Boolean Ops)
  const [selectedFeatureIds, setSelectedFeatureIds] = useState([]);

  // M19 State (Elevation Profiling)
  const [elevationData, setElevationData] = useState(null);
  const [isFetchingElevation, setIsFetchingElevation] = useState(false);
  const [isSimulatingRunoff, setIsSimulatingRunoff] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState({ progress: 0, status: '' });
  const cancelSimulationRef = useRef(false);

  const fetchFeatures = () => {
    fetch('/api/features')
      .then(res => res.json())
      .then(data => {
        if (data.type === 'FeatureCollection') {
          setFeatures(data);
        }
      })
      .catch(err => console.error("Error fetching map features:", err));
  };

  useEffect(() => {
    fetchFeatures();
  }, []);

  // Set up global functions for the popup buttons
  useEffect(() => {
    window.generateBuffer = async (featureStr) => {
      try {
        const feature = JSON.parse(decodeURIComponent(featureStr));
        const buffered = turf.buffer(feature, 1, { units: 'kilometers' });
        
        const response = await fetch('/api/features', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'Feature',
            geometry: buffered.geometry,
            properties: { layerType: 'Polygon', isBuffer: true, parentId: feature.id, name: 'Buffer Zone' }
          })
        });
        
        if (response.ok) {
          fetchFeatures();
        }
      } catch (err) {
        console.error("Error generating buffer:", err);
      }
    };

    window.editFeature = (featureStr) => {
      const feature = JSON.parse(decodeURIComponent(featureStr));
      setEditingFeature(feature);
    };
    
    return () => {
      delete window.generateBuffer;
      delete window.editFeature;
    };
  }, [features]);

  const onCreated = async (e) => {
    const { layerType, layer } = e;
    
    let geojson;
    if (typeof layer.toGeoJSON === 'function') {
      geojson = layer.toGeoJSON();
    } else {
      console.error("Layer cannot be converted to GeoJSON");
      return;
    }
    
    try {
      const response = await fetch('/api/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'Feature',
          geometry: geojson.geometry,
          properties: { 
            layerType, 
            name: `New ${layerType}`,
            icon: layerType === 'Point' ? 'pin' : undefined
          }
        })
      });
      if (response.ok) {
        layer.remove();
        fetchFeatures(); 
      }
    } catch (err) {
      console.error("Failed to save feature", err);
    }
  };

  const onEachFeature = (feature, layer) => {
    let popupContent = `<b>${feature.properties?.name || 'Unnamed Feature'}</b><br/>`;
    
    if (feature.properties?.description) {
      popupContent += `<p style="margin:4px 0; font-size:12px; color:#555;">${feature.properties.description}</p>`;
    } else {
      popupContent += `<p style="margin:4px 0; font-size:12px; color:#999;"><i>No description</i></p>`;
    }

    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      const area = turf.area(feature); // Area in square meters
      const areaDisplay = area > 10000 
        ? `${(area / 1000000).toFixed(2)} sq km` 
        : `${area.toFixed(2)} sq m`;
      popupContent += `<b>Area:</b> ${areaDisplay}<br/>`;
    } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
      const length = turf.length(feature, { units: 'kilometers' });
      const lengthDisplay = length < 1 
        ? `${(length * 1000).toFixed(2)} meters` 
        : `${length.toFixed(2)} km`;
      popupContent += `<b>Distance:</b> ${lengthDisplay}<br/>`;
    }
    
    if (feature.properties && feature.properties.isBuffer) {
      popupContent += `<span style="color: #10b981; font-weight: bold;">(Buffer Zone)</span><br/>`;
    }

    const featureStr = encodeURIComponent(JSON.stringify(feature));
    const btnStyle = "margin-top: 6px; padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer; font-family: Inter, sans-serif; font-size: 11px; width: 100%; font-weight: 500; transition: opacity 0.2s;";
    
    const bufferBtn = `<button onclick="window.generateBuffer('${featureStr}')" style="${btnStyle} background: #3b82f6; color: white; margin-bottom: 4px;">Generate 1km Buffer</button>`;
    const editBtn = `<button onclick="window.editFeature('${featureStr}')" style="${btnStyle} background: #64748b; color: white;">Edit Properties</button>`;
    
    popupContent += bufferBtn + editBtn;

    layer.bindPopup(popupContent);
    
    // Apply styling based on properties
    if (feature.properties && feature.properties.isBuffer && layer.setStyle) {
      layer.setStyle({
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.2,
        dashArray: '5, 5'
      });
    } else if (feature.properties?.color && layer.setStyle) {
      layer.setStyle({
        color: feature.properties.color,
        fillColor: feature.properties.color
      });
    }

    // Bind Edit Events
    const handleUpdate = async (e) => {
      const updatedGeoJson = e.target.toGeoJSON();
      try {
        await fetch(`/api/features/${feature.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            geometry: updatedGeoJson.geometry,
            properties: feature.properties
          })
        });
        fetchFeatures();
      } catch (err) {
        console.error("Error updating feature:", err);
      }
    };

    const handleDelete = async () => {
      try {
        await fetch(`/api/features/${feature.id}`, {
          method: 'DELETE'
        });
        fetchFeatures();
      } catch (err) {
        console.error("Error deleting feature:", err);
      }
    };

    layer.on('pm:edit', handleUpdate);
    layer.on('pm:dragend', handleUpdate);
    layer.on('pm:markerdragend', handleUpdate);
    layer.on('pm:remove', handleDelete);
  };

  // Export functions
  const exportToJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(features, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "litegis_export.geojson");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const exportToMarkdown = () => {
    let md = "# LiteGIS Data Export\n\n";
    features.features.forEach((f, i) => {
      const name = f.properties?.name || `Feature ${i + 1}`;
      md += `## ${name}\n`;
      md += `- **Type**: ${f.geometry.type}\n`;
      if (f.properties?.description) md += `- **Description**: ${f.properties.description}\n`;
      if (f.geometry.type === 'Polygon') {
         md += `- **Area**: ${turf.area(f).toFixed(2)} sq meters\n`;
      }
      if (f.geometry.type === 'LineString') {
         md += `- **Length**: ${turf.length(f, {units: 'kilometers'}).toFixed(2)} km\n`;
      }
      md += "\n";
    });
    const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "litegis_export.md";
    document.body.appendChild(a);
    a.click();
  };

  // --- M11 Geolocation Logic ---
  const toggleTracking = () => {
    if (isTracking) {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      setIsTracking(false);
      setLiveLocation(null);
      watchIdRef.current = null;
    } else {
      if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
      }
      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLiveLocation([latitude, longitude]);
          setJumpTo({ center: [latitude, longitude] }); // Auto-pan follow mode
        },
        (error) => {
          console.error("Geolocation error:", error);
          let errorMessage = "Unable to retrieve your location.";
          if (error.code === 1) { // PERMISSION_DENIED
            errorMessage = "Location access was denied. Please allow location permissions in your browser settings.";
          } else if (error.code === 2) { // POSITION_UNAVAILABLE
            errorMessage = "Location information is unavailable.";
          } else if (error.code === 3) { // TIMEOUT
            errorMessage = "The location request timed out. Trying again or moving to a clearer area might help.";
          }
          alert(errorMessage);
          setIsTracking(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
      watchIdRef.current = id;
      setIsTracking(true);
    }
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const exportToImage = () => {
    const mapElement = document.querySelector('.leaflet-container');
    if (!mapElement) return;

    html2canvas(mapElement, { useCORS: true }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const dlAnchorElem = document.createElement('a');
      dlAnchorElem.setAttribute("href", imgData);
      // In a real app we'd use dom-to-image or leaflet-image. 
      alert("Image export triggered (Requires html2canvas/dom-to-image implementation)");
    });
  };

  const handleSaveFeature = async (f) => {
    await fetch('/api/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'Feature',
        geometry: f.geometry,
        properties: f.properties
      })
    });
    fetchFeatures();
  };

  const processImportFile = async (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      let geojsonResult = null;

      try {
        if (file.name.endsWith('.kml')) {
          const doc = new DOMParser().parseFromString(content, 'text/xml');
          geojsonResult = toGeoJSON.kml(doc);
        } else if (file.name.endsWith('.json') || file.name.endsWith('.geojson')) {
          geojsonResult = JSON.parse(content);
        } else {
          alert("Unsupported file format. Please use .kml or .geojson");
          return;
        }

        if (geojsonResult.features) {
          geojsonResult.features.forEach(f => {
            if (!f.properties) f.properties = {};
            f.properties.id = crypto.randomUUID();
            // Give new points a default icon if not present
            if (f.geometry.type === 'Point' && !f.properties.icon) f.properties.icon = 'pin';
            handleSaveFeature(f);
          });
        } else {
          if (!geojsonResult.properties) geojsonResult.properties = {};
          geojsonResult.properties.id = crypto.randomUUID();
          if (geojsonResult.geometry.type === 'Point' && !geojsonResult.properties.icon) geojsonResult.properties.icon = 'pin';
          handleSaveFeature(geojsonResult);
        }
        
        alert(`Successfully imported features!`);

      } catch (err) {
        console.error("Import failed:", err);
        alert("Failed to import file. Check console for details.");
      }
    };
    reader.readAsText(file);
  };

  // LLM Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState([{ sender: 'ai', text: 'Hello! Ask me what is on the map, or tell me to draw a point.' }]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatOpen]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput.trim();
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setChatInput('');

    // Simulated NLP heuristics
    try {
      const res = await fetch('/api/llm/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg, action: 'chat' })
      });
      
      const data = await res.json();
      
      if (data.error) {
        setMessages(prev => [...prev, { sender: 'ai', text: data.error }]);
      } else {
        setMessages(prev => [...prev, { sender: 'ai', text: data.response_to_llm }]);
        if (data.refreshRequired) {
          fetchFeatures();
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { sender: 'ai', text: "Error communicating with the backend API. Make sure Ollama is running!" }]);
    }
  };

  const handleSaveProperties = async (e) => {
    e.preventDefault();
    if (!editingFeature) return;

    try {
      await fetch(`/api/features/${editingFeature.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geometry: editingFeature.geometry,
          properties: editingFeature.properties
        })
      });
      setEditingFeature(null);
      fetchFeatures();
    } catch (err) {
      console.error("Error saving properties", err);
    }
  };

  const toggleFeatureVisibility = (id) => {
    setHiddenFeatureIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const flyToFeature = (feature) => {
    try {
      if (feature.geometry.type === 'Point') {
        setJumpTo({ center: [feature.geometry.coordinates[1], feature.geometry.coordinates[0]] });
      } else {
        const bbox = turf.bbox(feature);
        const bounds = [
          [bbox[1], bbox[0]], // [minLat, minLng]
          [bbox[3], bbox[2]]  // [maxLat, maxLng]
        ];
        setJumpTo({ bounds });
      }
    } catch (e) {
      console.error("FlyTo error", e);
    }
  };

  const deleteFeature = (id) => {
    fetch(`/api/features/${id}`, { method: 'DELETE' })
      .then(() => fetchFeatures());
  };

  // --- M16 Geocoding Logic ---
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`);
        const data = await res.json();
        setSearchResults(data);
      } catch (err) {
        console.error("Geocoding failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSelectSearchResult = (result) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    setSearchPin([lat, lon]);
    setSearchQuery('');
    setSearchResults([]);
    setJumpTo({ center: [lat, lon] });
  };

  // --- M18 Spatial Boolean Operations ---
  const handleToggleMultiSelect = (id) => {
    setSelectedFeatureIds(prev => 
      prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id]
    );
  };

  const handleBooleanOperation = async (operation) => {
    try {
      const selectedPolygons = features.features.filter(f => selectedFeatureIds.includes(f.properties.id));
      
      if (selectedPolygons.length < 2) return alert("Select at least 2 features.");
      if (selectedPolygons.some(f => f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) {
        return alert("Boolean operations currently only support Polygons.");
      }

      let resultFeature = null;

      if (operation === 'intersect') {
        if (selectedPolygons.length !== 2) return alert("Intersection requires exactly 2 polygons.");
        resultFeature = turf.intersect(turf.featureCollection([selectedPolygons[0], selectedPolygons[1]]));
        if (!resultFeature) return alert("Polygons do not intersect!");
        resultFeature.properties = { name: "Intersection Result", color: "#f59e0b", layerType: 'Polygon' };
      } else if (operation === 'union') {
        resultFeature = selectedPolygons[0];
        for (let i = 1; i < selectedPolygons.length; i++) {
          resultFeature = turf.union(turf.featureCollection([resultFeature, selectedPolygons[i]]));
        }
        resultFeature.properties = { name: "Union Result", color: "#10b981", layerType: 'Polygon' };
      }

      if (resultFeature) {
        resultFeature.properties.id = crypto.randomUUID();
        await fetch('/api/features', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(resultFeature)
        });
        setSelectedFeatureIds([]); // clear selection
        fetchFeatures();
      }
    } catch (e) {
      console.error("Boolean Operation failed:", e);
      alert("Operation failed. Ensure your polygons are valid and overlapping correctly.");
    }
  };

  // --- M19 Elevation Profiling ---
  const generateElevationProfile = async (feature) => {
    try {
      setIsFetchingElevation(true);
      setElevationData(null);
      
      let coords = [];
      if (feature.geometry.type === 'LineString') {
        coords = feature.geometry.coordinates;
      } else if (feature.geometry.type === 'MultiLineString') {
        coords = feature.geometry.coordinates.flat();
      } else {
        alert("Elevation profiling is only supported for lines.");
        setIsFetchingElevation(false);
        return;
      }

      // We need to sample the line to max 100 points to respect OpenTopoData limits
      const line = turf.lineString(coords);
      const totalLength = turf.length(line, { units: 'kilometers' });
      
      if (totalLength === 0) {
        alert("Line has no length.");
        setIsFetchingElevation(false);
        return;
      }
      
      const numSegments = Math.max(1, Math.min(coords.length - 1, 99)); 
      const segmentLength = totalLength / numSegments;
      
      const sampledCoords = [];
      for (let i = 0; i <= numSegments; i++) {
        const point = turf.along(line, i * segmentLength, { units: 'kilometers' });
        sampledCoords.push(point.geometry.coordinates);
      }

      // OpenTopoData expects lat,lon format
      const locationsString = sampledCoords.map(c => `${c[1]},${c[0]}`).join('|');
      
      const response = await fetch('/api/elevation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ locations: locationsString })
      });
      const data = await response.json();

      if (data.status === 'OK') {
        // Map to recharts format
        const profile = data.results.map((res, idx) => ({
          distance: (idx * segmentLength).toFixed(2), // km
          elevation: res.elevation, // meters
        }));
        setElevationData({ featureName: feature.properties.name || 'Unnamed Line', profile });
      } else {
        alert("Failed to fetch elevation data.");
      }
    } catch (e) {
      console.error(e);
      alert("Error generating elevation profile.");
    } finally {
      setIsFetchingElevation(false);
    }
  };

  const simulateRunoff = async (polygonFeature) => {
    setIsSimulatingRunoff(true);
    cancelSimulationRef.current = false;
    setSimulationProgress({ progress: 5, status: 'Initializing simulation area...' });

    const checkCancel = () => {
      if (cancelSimulationRef.current) {
        setIsSimulatingRunoff(false);
        setSimulationProgress({ progress: 0, status: '' });
        return true;
      }
      return false;
    };

    try {
      await new Promise(r => setTimeout(r, 50));
      if (checkCancel()) return;

      const bbox = turf.bbox(polygonFeature);
      const z = 13;
      
      const lon2tile = (lon, zoom) => Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
      const lat2tile = (lat, zoom) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
      
      const minX = lon2tile(bbox[0], z);
      const maxX = lon2tile(bbox[2], z);
      const maxY = lat2tile(bbox[1], z); 
      const minY = lat2tile(bbox[3], z); 
  
      if ((maxX - minX) > 2 || (maxY - minY) > 2) {
        alert("Area too large! Please draw a smaller polygon to simulate runoff.");
        setIsSimulatingRunoff(false);
        return;
      }
  
      const cols = maxX - minX + 1;
      const rows = maxY - minY + 1;
      const totalTiles = cols * rows;

      setSimulationProgress({ progress: 15, status: `Fetching live weather data...` });
      await new Promise(r => setTimeout(r, 50));
      if (checkCancel()) return;

      let accumThreshold = 100; // default (light/no rain)
      let rainMM = 0;
      try {
        const center = turf.center(polygonFeature).geometry.coordinates;
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${center[1]}&longitude=${center[0]}&current=precipitation,rain&timezone=auto`);
        if (weatherRes.ok) {
          const weatherData = await weatherRes.json();
          rainMM = weatherData.current?.precipitation || 0;
          if (rainMM > 5) { accumThreshold = 20; } 
          else if (rainMM > 1) { accumThreshold = 50; } 
          else if (rainMM > 0) { accumThreshold = 80; } 
        }
      } catch (err) {
        console.warn("Could not fetch live weather.", err);
      }
  
      setSimulationProgress({ progress: 30, status: `Downloading ${totalTiles} terrain tiles...` });
      
      const canvas = document.createElement('canvas');
      canvas.width = cols * 256;
      canvas.height = rows * 256;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
      let loadedTiles = 0;
      const promises = [];
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          promises.push(new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
              if (cancelSimulationRef.current) return resolve();
              ctx.drawImage(img, (x - minX) * 256, (y - minY) * 256);
              loadedTiles++;
              setSimulationProgress({ progress: 30 + Math.floor((loadedTiles/totalTiles)*20), status: `Downloading terrain (${loadedTiles}/${totalTiles})...` });
              resolve();
            };
            img.onerror = () => resolve(); // ignore missing tiles
            img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
          }));
        }
      }
      
      await Promise.all(promises);
      if (checkCancel()) return;
  
      setSimulationProgress({ progress: 55, status: 'Decoding elevation models...' });
      await new Promise(r => setTimeout(r, 50));
      if (checkCancel()) return;

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const width = canvas.width;
      const height = canvas.height;
      
      const elevation = new Float32Array(width * height);
      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i+1];
        const b = imgData[i+2];
        if (r===0 && g===0 && b===0) { elevation[i/4] = 0; continue; }
        elevation[i/4] = (r * 256 + g + b / 256) - 32768;
      }
      
      setSimulationProgress({ progress: 70, status: 'Running physical flow simulation...' });
      await new Promise(r => setTimeout(r, 50));
      if (checkCancel()) return;

      const accumulation = new Float32Array(width * height);
      for(let i = 0; i < accumulation.length; i++) accumulation[i] = 1;
  
      const indices = new Int32Array(width * height);
      for (let i = 0; i < indices.length; i++) indices[i] = i;
      indices.sort((a, b) => elevation[b] - elevation[a]);
      
      for (let i = 0; i < indices.length; i++) {
        if (i % 10000 === 0 && checkCancel()) return; // check occasionally during tight loop
        const idx = indices[i];
        const x = idx % width;
        const y = Math.floor(idx / width);
        
        let lowestNeighbor = -1;
        let minElev = elevation[idx];
        
        for (let d = 0; d < 8; d++) {
          const dx = [-1, 0, 1, -1, 1, -1, 0, 1][d];
          const dy = [-1, -1, -1, 0, 0, 1, 1, 1][d];
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (elevation[nIdx] < minElev) {
              minElev = elevation[nIdx];
              lowestNeighbor = nIdx;
            }
          }
        }
        
        if (lowestNeighbor !== -1) {
          accumulation[lowestNeighbor] += accumulation[idx];
        }
      }
      
      setSimulationProgress({ progress: 90, status: 'Mapping flood zones...' });
      await new Promise(r => setTimeout(r, 50));
      if (checkCancel()) return;

      const floodedPointsData = [];
      const tile2lon = (x, zoom) => (x / Math.pow(2, zoom) * 360 - 180);
      const tile2lat = (y, zoom) => {
        const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
        return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
      };
  
      for (let idx = 0; idx < accumulation.length; idx++) {
        if (accumulation[idx] > accumThreshold) {
          const px = idx % width;
          const py = Math.floor(idx / width);
          
          const globalTileX = minX + (px / 256);
          const globalTileY = minY + (py / 256);
          
          const lng = tile2lon(globalTileX, z);
          const lat = tile2lat(globalTileY, z);
          
          const pt = turf.point([lng, lat]);
          if (turf.booleanPointInPolygon(pt, polygonFeature)) {
            floodedPointsData.push({ lng, lat, acc: accumulation[idx] });
          }
        }
      }
      
      if (floodedPointsData.length > 0) {
        floodedPointsData.sort((a,b) => b.acc - a.acc);
        const topPoints = floodedPointsData.slice(0, 1500).map(p => [p.lng, p.lat]);
        const multiPt = turf.multiPoint(topPoints);
        
        const floodedPolygons = turf.buffer(multiPt, 0.05, { units: 'kilometers' });
        
        const newFeature = {
          type: 'Feature',
          geometry: floodedPolygons.geometry,
          properties: {
            id: crypto.randomUUID(),
            name: `Flood Zone (${rainMM}mm Rain)`,
            color: '#0ea5e9',
            description: `Simulated heavy rain runoff accumulation. Based on ${topPoints.length} convergence points. Live Rainfall: ${rainMM}mm.`
          }
        };
  
        await fetch('/api/features', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newFeature)
        });
        fetchFeatures();
        if (editingFeature && editingFeature.id === polygonFeature.properties.id) {
          setEditingFeature(null);
        }
      } else {
        alert("No significant flood zones found within this area. Try drawing over steeper terrain.");
      }
      
    } catch(e) {
      console.error("Runoff sim error", e);
      if (!cancelSimulationRef.current) {
        alert("Simulation failed. Check console for details.");
      }
    }
    
    setIsSimulatingRunoff(false);
    setSimulationProgress({ progress: 0, status: '' });
  };

  // --- M15 Spatial Buffering ---
  const generateBuffer = async (feature) => {
    try {
      // Generate a 500 meter (0.5 km) buffer around the selected feature
      const buffered = turf.buffer(feature, 0.5, { units: 'kilometers' });
      
      buffered.properties = {
        name: `${feature.properties?.name || 'Feature'} (500m Buffer)`,
        color: '#a855f7', // purple-500
        description: 'Generated 500m spatial buffer.'
      };

      await fetch('/api/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buffered)
      });
      fetchFeatures();
    } catch (e) {
      console.error("Failed to generate buffer:", e);
      alert("Failed to generate buffer. Ensure the geometry is valid.");
    }
  };

  // --- M13 Hexbin Density Mapping ---
  useEffect(() => {
    if (!showDensityMap || !features.features.length) {
      setHexGridData(null);
      return;
    }
    
    // Get visible Point features
    const pointFeatures = features.features.filter(f => f.geometry.type === 'Point' && !hiddenFeatureIds.has(f.id));
    if (pointFeatures.length === 0) {
      setHexGridData(null);
      return;
    }

    try {
      const pointsCollection = turf.featureCollection(pointFeatures);
      const bbox = turf.bbox(pointsCollection);
      
      // Calculate dynamic cell size based on bounding box (approx 20 hexes wide)
      const widthKm = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[1]]);
      const cellSide = Math.max(widthKm / 20, 0.5); // min 500m

      const hexGrid = turf.hexGrid(bbox, cellSide, { units: 'kilometers' });

      let maxCount = 0;
      const countedHexes = hexGrid.features.map(hex => {
        const ptsWithin = turf.pointsWithinPolygon(pointsCollection, hex);
        const count = ptsWithin.features.length;
        if (count > maxCount) maxCount = count;
        hex.properties.count = count;
        return hex;
      }).filter(hex => hex.properties.count > 0);

      countedHexes.forEach(hex => {
        const ratio = hex.properties.count / maxCount;
        let color = '#fef08a'; // yellow
        if (ratio > 0.33) color = '#f97316'; // orange
        if (ratio > 0.66) color = '#ef4444'; // red
        
        hex.properties.fillColor = color;
        hex.properties.fillOpacity = 0.6;
        hex.properties.color = color;
      });

      setHexGridData({ type: 'FeatureCollection', features: countedHexes });
    } catch (e) {
      console.error("Hexgrid generation failed", e);
    }
  }, [showDensityMap, features, hiddenFeatureIds]);

  // --- M10 Routing Logic ---
  useEffect(() => {
    if (routePoints.length === 2) {
      calculateRoute(routePoints[0], routePoints[1]);
      setRoutePoints([]); // reset points
      setRoutingMode(false); // exit mode
    }
  }, [routePoints]);

  const calculateRoute = async (start, end) => {
    // OSRM expects lon,lat format
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes.length > 0) {
        const routeGeoJSON = data.routes[0].geometry;
        const distanceKm = (data.routes[0].distance / 1000).toFixed(2);
        const durationMin = (data.routes[0].duration / 60).toFixed(1);
        
        await fetch('/api/features', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'Feature',
            geometry: routeGeoJSON,
            properties: {
              name: `Route (${distanceKm} km)`,
              color: '#ef4444',
              description: `Driving route taking approximately ${durationMin} minutes.`
            }
          })
        });
        fetchFeatures();
      } else {
        alert("No driving route found between these points.");
      }
    } catch (err) {
      console.error(err);
      alert("Routing service failed.");
    }
  };

  const visibleFeatures = {
    type: 'FeatureCollection',
    features: features.features.filter(f => !hiddenFeatureIds.has(f.id))
  };

  const calculateMetrics = () => {
    let pointCount = 0;
    let lineCount = 0;
    let polyCount = 0;
    let totalLengthKm = 0;
    let totalAreaSqKm = 0;

    visibleFeatures.features.forEach(f => {
      const type = f.geometry.type;
      if (type === 'Point') pointCount++;
      else if (type === 'LineString') {
        lineCount++;
        totalLengthKm += turf.length(f, {units: 'kilometers'});
      }
      else if (type === 'Polygon' || type === 'MultiPolygon') {
        polyCount++;
        totalAreaSqKm += turf.area(f) / 1000000;
      }
    });

    return {
      pointCount, lineCount, polyCount,
      totalLengthKm: totalLengthKm.toFixed(2),
      totalAreaSqKm: totalAreaSqKm.toFixed(2),
      chartData: [
        { name: 'Points', value: pointCount, color: '#f97316' },
        { name: 'Lines', value: lineCount, color: '#3b82f6' },
        { name: 'Polygons', value: polyCount, color: '#10b981' }
      ].filter(d => d.value > 0)
    };
  };

  const metrics = showDashboard ? calculateMetrics() : null;

  return (
    <div 
      className="h-screen w-screen flex flex-col bg-slate-900 font-sans overflow-hidden relative"
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processImportFile(e.dataTransfer.files[0]);
        }
      }}
    >
      {/* Drag overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-[9999] bg-blue-500/20 backdrop-blur-sm border-4 border-blue-500 border-dashed flex items-center justify-center pointer-events-none">
          <div className="bg-slate-900/90 text-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-bounce">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"></path></svg>
            <h2 className="text-2xl font-bold tracking-tight">Drop KML or GeoJSON to import</h2>
          </div>
        </div>
      )}
      
      {/* Geocoding Search Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-80 flex flex-col gap-1">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl flex items-center px-3 py-2 transition-all focus-within:border-blue-500/50">
          <svg className="w-4 h-4 text-white/50 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for places..."
            className="bg-transparent border-none outline-none text-xs text-white placeholder-white/40 ml-2 w-full"
          />
          {isSearching && <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin ml-2"></div>}
        </div>
        
        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden mt-1 flex flex-col max-h-60 overflow-y-auto custom-scrollbar">
            {searchResults.map((result, idx) => (
              <button 
                key={idx} 
                onClick={() => handleSelectSearchResult(result)}
                className="text-left px-3 py-2 text-[10px] text-white/80 hover:bg-white/10 hover:text-white transition border-b border-white/5 last:border-b-0 leading-tight"
              >
                {result.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Draggable Glassmorphism Toolbar */}
      <Draggable handle=".drag-handle" bounds="parent">
        <header className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1 rounded-full bg-slate-900/60 backdrop-blur-lg border border-white/10 shadow-2xl flex flex-col w-max hover:bg-slate-900/70 transition-colors duration-200">
          <div className="flex items-center gap-3">
          <div className="drag-handle cursor-grab active:cursor-grabbing text-white/40 hover:text-white/80 transition px-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
          </div>

          <div className="flex items-center gap-2 border-r border-white/10 pr-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-500 to-emerald-400 flex items-center justify-center shadow-lg">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h1 className="text-xs font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-100 to-white tracking-tight">LiteGIS</h1>
          </div>
          
          <div className="flex gap-2 items-center">
            <div className="flex bg-white/10 rounded-md overflow-hidden border border-white/5 shadow-inner">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => e.target.files?.length && processImportFile(e.target.files[0])} 
                className="hidden" 
                accept=".kml,.geojson,.json"
              />
              <button onClick={() => fileInputRef.current.click()} className="hover:bg-blue-500/20 text-blue-300 px-2.5 py-1 text-[10px] font-medium border-r border-white/10 transition flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"></path></svg>
                Import
              </button>
              <button onClick={exportToJSON} className="hover:bg-white/20 text-white/80 px-2.5 py-1 text-[10px] font-medium border-r border-white/10 transition">JSON</button>
              <button onClick={exportToMarkdown} className="hover:bg-white/20 text-white/80 px-2.5 py-1 text-[10px] font-medium border-r border-white/10 transition">MD</button>
              <button onClick={exportToImage} className="hover:bg-white/20 text-white/80 px-2.5 py-1 text-[10px] font-medium border-r border-white/10 transition flex items-center gap-1">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                Snap
              </button>
              <button onClick={toggleTracking} className={`hover:bg-white/20 px-2.5 py-1 text-[10px] font-medium transition flex items-center gap-1 ${isTracking ? 'text-blue-400 bg-blue-500/10' : 'text-white/80'}`}>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
                Locate Me
              </button>
              <button onClick={() => setShowDensityMap(!showDensityMap)} className={`hover:bg-white/20 px-2.5 py-1 text-[10px] font-medium transition border-l border-white/10 flex items-center gap-1 ${showDensityMap ? 'text-orange-400 bg-orange-500/10' : 'text-white/80'}`}>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                Density
              </button>
              <button onClick={() => setShowDashboard(!showDashboard)} className={`hover:bg-white/20 px-2.5 py-1 text-[10px] font-medium transition border-l border-white/10 flex items-center gap-1 ${showDashboard ? 'text-purple-400 bg-purple-500/10' : 'text-white/80'}`}>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                Metrics
              </button>
            </div>
              <button onClick={() => window.location.href = '/api/auth/github'} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white px-3 py-1 text-[10px] rounded-md font-semibold shadow-md transition-all active:scale-95 ml-1">Login</button>
            </div>
          </div>
          
          <div className="flex justify-center mt-2 pb-2">
             <button 
                onClick={() => { setRoutingMode(!routingMode); setRoutePoints([]); }}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold shadow-lg transition-all transform active:scale-95 ${routingMode ? 'bg-red-500 text-white animate-pulse' : 'bg-white/10 text-white/80 border border-white/10 hover:bg-white/20'}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
                {routingMode ? (routePoints.length === 1 ? 'Select End Point...' : 'Select Start Point...') : 'Plan Route'}
              </button>
          </div>
        </header>
      </Draggable>

      {/* Layer Management Sidebar */}
      <div className={`absolute top-4 left-4 bottom-4 z-[999] w-64 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'}`}>
        <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/5 rounded-t-2xl">
          <h2 className="text-white text-sm font-semibold flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
            Layers
          </h2>
          <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">{features.features.length}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {features.features.length === 0 ? (
            <div className="text-white/40 text-xs text-center mt-6">No layers drawn yet</div>
          ) : (
            features.features.map(f => {
              const isHidden = hiddenFeatureIds.has(f.id);
              
              return (
                <div key={f.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg group transition">
                  <div className="flex items-center gap-3 overflow-hidden cursor-pointer flex-1" onClick={() => flyToFeature(f)}>
                    <div className="flex items-center justify-center w-6 h-6 rounded bg-white/10 mr-2 text-[10px] text-white/50">
                      {f.geometry.type === 'Point' ? '•' : f.geometry.type === 'LineString' ? '—' : '⬠'}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="text-sm font-medium truncate">{f.properties?.name || 'Unnamed Feature'}</div>
                      <div className="text-[10px] text-white/40">{f.geometry.type}</div>
                      
                      {(f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); generateElevationProfile(f); }}
                          disabled={isFetchingElevation}
                          className="w-full mt-2 flex items-center justify-center gap-2 p-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg transition disabled:opacity-50"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20M5 20l4-8 5 4 8-12"/></svg>
                          <div className="text-[10px]">{isFetchingElevation ? '...' : 'Profile'}</div>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <input 
                      type="checkbox" 
                      className="mr-2 cursor-pointer w-4 h-4 rounded border-gray-300 bg-gray-100 focus:ring-blue-500" 
                      title="Select for Boolean Ops"
                      checked={selectedFeatureIds.includes(f.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => handleToggleMultiSelect(f.id)}
                    />
                    <button onClick={(e) => { e.stopPropagation(); generateBuffer(f); }} className="p-1 text-white/50 hover:text-purple-400 transition" title="Generate 500m Buffer">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                    </button>
                    <button onClick={() => toggleFeatureVisibility(f.id)} className="p-1 text-white/50 hover:text-white transition" title="Toggle Visibility">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {isHidden ? <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path> : <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>}
                        {!isHidden && <circle cx="12" cy="12" r="3"></circle>}
                      </svg>
                    </button>
                    <button onClick={() => deleteFeature(f.id)} className="p-1 text-white/50 hover:text-red-400 transition" title="Delete Feature"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Analytics Dashboard Sidebar */}
      <div className={`absolute top-20 right-4 bottom-4 z-[999] w-80 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col transition-transform duration-300 ${showDashboard ? 'translate-x-0' : 'translate-x-[110%]'}`}>
        <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/5 rounded-t-2xl">
          <h2 className="text-white text-sm font-semibold flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6"></path></svg>
            Data Analytics
          </h2>
          <button onClick={() => setShowDashboard(false)} className="text-white/50 hover:text-white transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          </button>
        </div>
        
        {metrics && (
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <p className="text-white/40 text-[10px] uppercase font-bold tracking-wider mb-1">Total Features</p>
                <p className="text-2xl font-light text-white">{visibleFeatures.features.length}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <p className="text-white/40 text-[10px] uppercase font-bold tracking-wider mb-1">Polygons</p>
                <p className="text-xl font-light text-emerald-400">{metrics.polyCount}</p>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col gap-2">
              <div className="flex justify-between items-end">
                <p className="text-white/40 text-[10px] uppercase font-bold tracking-wider">Total Area</p>
                <p className="text-lg font-medium text-emerald-400">{metrics.totalAreaSqKm} <span className="text-xs text-white/50">sq km</span></p>
              </div>
              <div className="flex justify-between items-end border-t border-white/5 pt-2">
                <p className="text-white/40 text-[10px] uppercase font-bold tracking-wider">Total Length</p>
                <p className="text-lg font-medium text-blue-400">{metrics.totalLengthKm} <span className="text-xs text-white/50">km</span></p>
              </div>
            </div>

            <div className="flex-1 min-h-[200px] flex flex-col">
              <p className="text-white/40 text-[10px] uppercase font-bold tracking-wider mb-2">Feature Distribution</p>
              {metrics.chartData.length > 0 ? (
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={metrics.chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {metrics.chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff', fontSize: '12px' }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-white/20 text-xs">No data to chart</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Toggle Button */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="absolute top-4 left-0 z-[1000] bg-slate-900/80 backdrop-blur-xl border border-white/10 p-2 rounded-r-lg shadow-2xl text-white/70 hover:text-white transition"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isSidebarOpen ? <path d="M15 18l-6-6 6-6"/> : <path d="M9 18l6-6-6-6"/>}
        </svg>
      </button>

      {/* Feature Properties Editor Modal */}
      {editingFeature && (
        <div className="absolute inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h2 className="text-white font-semibold">Edit Feature Properties</h2>
              <button onClick={() => setEditingFeature(null)} className="text-white/50 hover:text-white"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg></button>
            </div>
            <form onSubmit={handleSaveProperties} className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Name</label>
                <input 
                  type="text" 
                  value={editingFeature.properties?.name || ''} 
                  onChange={e => setEditingFeature(prev => ({...prev, properties: {...prev.properties, name: e.target.value}}))}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition"
                  placeholder="E.g., Central Park"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Description</label>
                <textarea 
                  value={editingFeature.properties?.description || ''} 
                  onChange={e => setEditingFeature(prev => ({...prev, properties: {...prev.properties, description: e.target.value}}))}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition min-h-[80px]"
                  placeholder="Enter details about this location..."
                />
              </div>
              {/* M17 Icon Picker for Points */}
              {editingFeature.geometry.type === 'Point' && (
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Point Icon</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(ICON_SVGS).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setEditingFeature(prev => ({...prev, properties: {...prev.properties, icon: key}}))}
                        className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-all ${
                          (editingFeature.properties.icon || 'pin') === key
                            ? 'border-blue-500 bg-blue-500/20 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]'
                            : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                        }`}
                        title={key.charAt(0).toUpperCase() + key.slice(1)}
                        dangerouslySetInnerHTML={{ __html: ICON_SVGS[key] }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Color</label>
                <div className="flex gap-2">
                  <input 
                    type="color" 
                    value={editingFeature.properties?.color || '#3b82f6'} 
                    onChange={e => setEditingFeature(prev => ({...prev, properties: {...prev.properties, color: e.target.value}}))}
                    className="h-9 w-14 bg-black/30 border border-white/10 rounded-lg cursor-pointer"
                  />
                  <input 
                    type="text" 
                    value={editingFeature.properties?.color || '#3b82f6'} 
                    onChange={e => setEditingFeature(prev => ({...prev, properties: {...prev.properties, color: e.target.value}}))}
                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition uppercase font-mono"
                  />
                </div>
              </div>
              {(editingFeature.geometry.type === 'LineString' || editingFeature.geometry.type === 'MultiLineString') && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <button 
                    type="button"
                    onClick={() => { generateElevationProfile(editingFeature); setEditingFeature(null); }}
                    disabled={isFetchingElevation}
                    className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl transition disabled:opacity-50"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20M5 20l4-8 5 4 8-12"/></svg>
                    <div className="text-sm font-medium">{isFetchingElevation ? 'Fetching...' : 'Generate Elevation Profile'}</div>
                  </button>
                </div>
              )}
              {(editingFeature.geometry.type === 'Polygon' || editingFeature.geometry.type === 'MultiPolygon') && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  {!isSimulatingRunoff ? (
                    <button 
                      type="button"
                      onClick={() => { simulateRunoff(editingFeature); }}
                      className="w-full flex items-center justify-center gap-2 p-3 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 rounded-xl transition"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                      </svg>
                      <div className="text-sm font-medium">Simulate Rain Run-off</div>
                    </button>
                  ) : (
                    <div className="w-full p-3 bg-sky-900/20 border border-sky-500/20 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-sky-400 text-xs">
                        <span>{simulationProgress.status || 'Simulating...'}</span>
                        <span>{simulationProgress.progress}%</span>
                      </div>
                      <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-sky-400 h-1.5 rounded-full transition-all duration-300" style={{ width: `${simulationProgress.progress}%` }}></div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => { cancelSimulationRef.current = true; }}
                        className="w-full mt-2 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-medium transition"
                      >
                        Cancel Simulation
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingFeature(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 transition">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition shadow-lg shadow-blue-500/20">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Chat UI */}
      <div className="absolute bottom-6 right-20 z-[1001] flex flex-col items-end pointer-events-none">
        
        {isChatOpen && (
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/20 rounded-2xl w-80 h-96 mb-4 shadow-2xl flex flex-col overflow-hidden pointer-events-auto transform transition-all animate-in slide-in-from-bottom-5">
            <div className="bg-white/10 px-4 py-3 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <h3 className="text-white text-sm font-semibold tracking-wide">GIS Assistant</h3>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-white/50 hover:text-white transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
              {messages.map((msg, i) => (
                <div key={i} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.sender === 'user' ? 'bg-blue-600 text-white self-end rounded-br-sm' : 'bg-white/10 text-white/90 self-start rounded-bl-sm border border-white/5'}`}>
                  {msg.text}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 bg-black/20 flex gap-2">
              <input 
                type="text" 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask me to draw something..." 
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-500 transition-colors"
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 flex items-center justify-center transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </form>
          </div>
        )}

        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all transform hover:scale-105 active:scale-95 pointer-events-auto ${isChatOpen ? 'bg-slate-800 border border-white/20 text-white' : 'bg-gradient-to-tr from-blue-600 to-indigo-500 text-white'}`}
        >
          {isChatOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          )}
        </button>
      </div>

      <main className="flex-1 relative z-0 flex">
      {/* Basemap Switcher Widget */}
      <div className="absolute bottom-6 left-6 z-[1000] flex flex-col gap-1.5 bg-slate-900/70 backdrop-blur-md border border-white/10 p-2 rounded-xl shadow-2xl w-40 transition-all">
        <div className="text-[9px] text-white/50 uppercase tracking-widest font-bold px-2 mb-1 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
          Map Style
        </div>
        {Object.entries(BASEMAPS).map(([key, mapConfig]) => (
          <button 
            key={key} 
            onClick={() => setActiveBasemap(key)}
            className={`text-left px-3 py-1.5 rounded-lg text-xs font-medium transition duration-200 shadow-sm ${activeBasemap === key ? 'bg-blue-500 text-white border border-blue-400' : 'text-white/70 hover:bg-white/10 border border-transparent hover:text-white'}`}
          >
            {mapConfig.name}
          </button>
        ))}
      </div>

      <div className={`h-full w-full absolute inset-0 z-0 transition-all duration-300 ${isDraggingOver ? 'brightness-50' : ''}`}>
        <MapContainer center={position} zoom={13} zoomControl={false} className="h-full w-full" ref={mapRef}>
          <ZoomControl position="bottomright" />
          <TileLayer
            attribution={BASEMAPS[activeBasemap].attribution}
            url={BASEMAPS[activeBasemap].url}
          />
          
          <GeomanSetup onCreated={onCreated} />
          <MapController jumpTo={jumpTo} routingMode={routingMode} routePoints={routePoints} setRoutePoints={setRoutePoints} />

          {/* Render temp route points */}
          {routePoints.map((pt, idx) => (
            <Marker key={`rp-${idx}`} position={pt} />
          ))}

          {/* Render Search Pin */}
          {searchPin && (
            <Marker position={searchPin}>
              <Popup className="custom-popup">
                <div className="text-center font-semibold text-slate-800">Search Result</div>
              </Popup>
            </Marker>
          )}

          {/* Render live location */}
          {liveLocation && (
            <Marker position={liveLocation} icon={liveLocationIcon} zIndexOffset={1000} />
          )}

          {/* Render Hexbin Density Map */}
          {showDensityMap && hexGridData && (
            <GeoJSON 
              data={hexGridData} 
              key={`hexgrid-${hexGridData.features.length}`}
              style={(feature) => ({
                fillColor: feature.properties.fillColor,
                fillOpacity: feature.properties.fillOpacity,
                color: feature.properties.color,
                weight: 1
              })}
            />
          )}

          {visibleFeatures && visibleFeatures.features && visibleFeatures.features.length > 0 && (
            <GeoJSON 
              data={visibleFeatures} 
              key={JSON.stringify(visibleFeatures)} 
              onEachFeature={onEachFeature}
              pointToLayer={geoJsonPointToLayer}
            />
          )}

        </MapContainer>
      </div>

      {/* Boolean Operations Action Bar */}
      {selectedFeatureIds.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="text-sm text-white/80 font-medium">
            <span className="text-white font-bold">{selectedFeatureIds.length}</span> Features Selected
          </div>
          <div className="h-4 w-px bg-white/20"></div>
          <button 
            onClick={() => handleBooleanOperation('intersect')}
            disabled={selectedFeatureIds.length !== 2}
            className="px-4 py-1.5 rounded-lg bg-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-wide hover:bg-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-orange-500/30"
          >
            Intersect
          </button>
          <button 
            onClick={() => handleBooleanOperation('union')}
            className="px-4 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wide hover:bg-emerald-500/30 transition-colors border border-emerald-500/30"
          >
            Union
          </button>
        </div>
      )}

      {/* Elevation Profile Panel */}
      {elevationData && (
        <div className="absolute bottom-8 right-8 z-[1000] w-[500px] h-[300px] bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-300 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" className="text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20M5 20l4-8 5 4 8-12"/></svg>
              <h3 className="text-white font-semibold text-sm">Elevation: {elevationData.featureName}</h3>
            </div>
            <button onClick={() => setElevationData(null)} className="text-white/50 hover:text-white/90">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div className="flex-1 p-4 w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={elevationData.profile} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorElevation" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis dataKey="distance" stroke="rgba(255,255,255,0.4)" fontSize={10} tickFormatter={(val) => `${val}km`} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} tickFormatter={(val) => `${val}m`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ color: '#818cf8' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                  formatter={(value) => [`${value}m`, 'Elevation']}
                  labelFormatter={(label) => `Distance: ${label}km`}
                />
                <Area type="monotone" dataKey="elevation" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorElevation)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      </main>
    </div>
  );
}

export default App;
