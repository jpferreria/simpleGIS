import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
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
      position: 'topleft',
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

import Draggable from 'react-draggable';

function App() {
  const position = [51.505, -0.09]; // Default to London
  const [features, setFeatures] = useState({ type: 'FeatureCollection', features: [] });
  const mapRef = useRef(null);

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

  // Set up global function for the popup buttons
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
            properties: { layerType: 'Polygon', isBuffer: true, parentId: feature.id }
          })
        });
        
        if (response.ok) {
          fetchFeatures();
        }
      } catch (err) {
        console.error("Error generating buffer:", err);
      }
    };
    
    return () => {
      delete window.generateBuffer;
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
          properties: { layerType }
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
    let popupContent = `<b>Feature Type:</b> ${feature.geometry.type}<br/>`;

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
    const buttonHtml = `<button onclick="window.generateBuffer('${featureStr}')" style="margin-top: 8px; padding: 6px 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-family: Inter, sans-serif; font-size: 12px; width: 100%; font-weight: 500;">Generate 1km Buffer</button>`;
    
    popupContent += buttonHtml;

    layer.bindPopup(popupContent);
    
    if (feature.properties && feature.properties.isBuffer && layer.setStyle) {
      layer.setStyle({
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.2,
        dashArray: '5, 5'
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
      } catch (err) {
        console.error("Error updating feature:", err);
      }
    };

    const handleDelete = async () => {
      try {
        await fetch(`http://localhost:3001/api/features/${feature.id}`, {
          method: 'DELETE'
        });
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
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "map_data.json");
    dlAnchorElem.click();
  };

  const exportToMarkdown = () => {
    const featureCount = features.features.length;
    const mdContent = `# SimpleGIS Data Summary\n\n- **Total Features**: ${featureCount}\n- **Exported**: ${new Date().toLocaleString()}\n\n## Data Details\n\`\`\`json\n${JSON.stringify(features, null, 2)}\n\`\`\``;
    const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(mdContent);
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "map_report.md");
    dlAnchorElem.click();
  };

  const exportToImage = () => {
    const mapElement = document.querySelector('.leaflet-container');
    if (!mapElement) return;

    html2canvas(mapElement, { useCORS: true }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const dlAnchorElem = document.createElement('a');
      dlAnchorElem.setAttribute("href", imgData);
      dlAnchorElem.setAttribute("download", "map_view.png");
      dlAnchorElem.click();
    });
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
    const text = userMsg.toLowerCase();
    
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

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900 font-sans overflow-hidden">
      
      {/* Draggable Glassmorphism Toolbar */}
      <Draggable handle=".drag-handle" bounds="parent">
        <header className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1 rounded-full bg-slate-900/60 backdrop-blur-lg border border-white/10 shadow-2xl flex items-center gap-3 w-max hover:bg-slate-900/70 transition-colors duration-200">
          
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
              <button onClick={exportToJSON} className="hover:bg-white/20 text-white/80 px-2.5 py-1 text-[10px] font-medium border-r border-white/10 transition">JSON</button>
              <button onClick={exportToMarkdown} className="hover:bg-white/20 text-white/80 px-2.5 py-1 text-[10px] font-medium border-r border-white/10 transition">MD</button>
              <button onClick={exportToImage} className="hover:bg-white/20 text-white/80 px-2.5 py-1 text-[10px] font-medium transition flex items-center gap-1">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                Snap
              </button>
            </div>
            <button onClick={() => window.location.href = 'http://localhost:3001/api/auth/github'} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white px-3 py-1 text-[10px] rounded-md font-semibold shadow-md transition-all active:scale-95 ml-1">Login</button>
          </div>
        </header>
      </Draggable>

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
        <MapContainer center={position} zoom={13} className="h-full w-full absolute inset-0 z-0" ref={mapRef}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <GeomanSetup onCreated={onCreated} />

          {features && features.features && features.features.length > 0 && (
            <GeoJSON 
              data={features} 
              key={JSON.stringify(features)} 
              onEachFeature={onEachFeature}
            />
          )}

        </MapContainer>
      </main>
    </div>
  );
}

export default App;
