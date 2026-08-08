import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap, ZoomControl, useMapEvents } from 'react-leaflet';
import html2canvas from 'html2canvas';
import * as turf from '@turf/turf';

// Fix for default Leaflet icons in Vite/React
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

// Geoman for drawing
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import Draggable from 'react-draggable';
import * as toGeoJSON from '@tmcw/togeojson';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function GeomanSetup({ onCreated }) {
  const map = useMap();

  useEffect(() => {
    map.pm.addControls({
      position: 'topright',
      drawCircleMarker: false,
      drawCircle: false,
      drawText: false,
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
function MapController({ jumpTo, routingMode, routePoints, setRoutePoints }) {
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

  const fetchFeatures = () => {
    fetch('http://localhost:3001/api/features')
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
        
        const response = await fetch('http://localhost:3001/api/features', {
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
      const response = await fetch('http://localhost:3001/api/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'Feature',
          geometry: geojson.geometry,
          properties: { layerType, name: `New ${layerType}` }
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
        await fetch(`http://localhost:3001/api/features/${feature.id}`, {
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
        await fetch(`http://localhost:3001/api/features/${feature.id}`, {
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
    downloadAnchorNode.setAttribute("download", "simplegis_export.geojson");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const exportToMarkdown = () => {
    let md = "# SimpleGIS Data Export\n\n";
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
    a.download = "simplegis_export.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

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

        // Validate structure
        const importFeatures = geojsonResult.type === 'FeatureCollection' 
          ? geojsonResult.features 
          : (geojsonResult.type === 'Feature' ? [geojsonResult] : null);

        if (!importFeatures) {
          throw new Error("Invalid GeoJSON structure");
        }

        // Save each feature to database
        for (const f of importFeatures) {
          await fetch('http://localhost:3001/api/features', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'Feature',
              geometry: f.geometry,
              properties: f.properties || { name: `Imported ${f.geometry.type}` }
            })
          });
        }
        
        fetchFeatures(); // refresh map
        alert(`Successfully imported ${importFeatures.length} features!`);

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
      const res = await fetch('http://localhost:3001/api/llm/query', {
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
      await fetch(`http://localhost:3001/api/features/${editingFeature.id}`, {
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
    fetch(`http://localhost:3001/api/features/${id}`, { method: 'DELETE' })
      .then(() => fetchFeatures());
  };

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
        
        await fetch('http://localhost:3001/api/features', {
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
      
      {/* Draggable Glassmorphism Toolbar */}
      <Draggable handle=".drag-handle" bounds="parent">
        <header className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1 rounded-full bg-slate-900/60 backdrop-blur-lg border border-white/10 shadow-2xl flex flex-col w-max hover:bg-slate-900/70 transition-colors duration-200">
          <div className="flex items-center gap-3">
          <div className="drag-handle cursor-grab active:cursor-grabbing text-white/40 hover:text-white/80 transition px-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
          </div>

          <div className="flex items-center gap-2 border-r border-white/10 pr-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-500 to-emerald-400 flex items-center justify-center shadow-lg">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h1 className="text-xs font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-100 to-white tracking-tight">SimpleGIS</h1>
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
              <button onClick={exportToImage} className="hover:bg-white/20 text-white/80 px-2.5 py-1 text-[10px] font-medium transition flex items-center gap-1">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                Snap
              </button>
            </div>
              <button onClick={() => window.location.href = 'http://localhost:3001/api/auth/github'} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white px-3 py-1 text-[10px] rounded-md font-semibold shadow-md transition-all active:scale-95 ml-1">Login</button>
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
      <div className={`absolute top-20 left-4 bottom-4 z-[999] w-64 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'}`}>
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
              const name = f.properties?.name || `Feature ${f.id}`;
              const typeColor = f.geometry.type === 'Point' ? 'bg-orange-500' : f.geometry.type === 'LineString' ? 'bg-blue-500' : 'bg-emerald-500';
              
              return (
                <div key={f.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg group transition">
                  <div className="flex items-center gap-3 overflow-hidden cursor-pointer flex-1" onClick={() => flyToFeature(f)}>
                    <div className={`w-2 h-2 rounded-full ${typeColor} flex-shrink-0 ${isHidden ? 'opacity-30' : ''}`}></div>
                    <div className="truncate">
                      <p className={`text-xs font-medium truncate ${isHidden ? 'text-white/40 line-through' : 'text-white/90'}`}>{name}</p>
                      <p className="text-[10px] text-white/40">{f.geometry.type}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggleFeatureVisibility(f.id)} className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-md">
                      {isHidden ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      )}
                    </button>
                    <button onClick={() => deleteFeature(f.id)} className="p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-400/10 rounded-md">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path></svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Sidebar Toggle Button */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="absolute top-20 left-0 z-[1000] bg-slate-900/80 backdrop-blur-xl border border-white/10 p-2 rounded-r-lg shadow-2xl text-white/70 hover:text-white transition"
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
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingFeature(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 transition">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition shadow-lg shadow-blue-500/20">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Chat UI */}
      <div className="absolute bottom-6 right-6 z-[1001] flex flex-col items-end pointer-events-none">
        
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
        <MapContainer center={position} zoom={13} zoomControl={false} className="h-full w-full absolute inset-0 z-0" ref={mapRef}>
          <ZoomControl position="bottomright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <GeomanSetup onCreated={onCreated} />
          <MapController jumpTo={jumpTo} routingMode={routingMode} routePoints={routePoints} setRoutePoints={setRoutePoints} />

          {/* Render temp route points */}
          {routePoints.map((pt, idx) => (
            <Marker key={`rp-${idx}`} position={pt} />
          ))}

          {visibleFeatures && visibleFeatures.features && visibleFeatures.features.length > 0 && (
            <GeoJSON 
              data={visibleFeatures} 
              key={JSON.stringify(visibleFeatures)} 
              onEachFeature={onEachFeature}
            />
          )}

        </MapContainer>
      </main>
    </div>
  );
}

export default App;
