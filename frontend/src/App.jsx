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
