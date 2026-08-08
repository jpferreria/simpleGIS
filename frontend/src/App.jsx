import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import html2canvas from 'html2canvas';

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
      editControls: false,
    });

    const handleCreate = (e) => {
      onCreated({ layerType: e.shape, layer: e.layer });
    };

    map.on('pm:create', handleCreate);

    return () => {
      map.pm.removeControls();
      map.off('pm:create', handleCreate);
    };
  }, [map, onCreated]);

  return null;
}

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

  const onCreated = async (e) => {
    const { layerType, layer } = e;
    
    let geojson;
    if (typeof layer.toGeoJSON === 'function') {
      geojson = layer.toGeoJSON();
    } else {
      console.error("Layer cannot be converted to GeoJSON");
      return;
    }
    
    // Save to backend
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
        // Remove the drawn layer immediately since we fetch from DB as a GeoJSON layer
        layer.remove();
        fetchFeatures(); // Reload features from DB
      }
    } catch (err) {
      console.error("Failed to save feature", err);
    }
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
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      <header className="bg-gray-800 text-white p-4 shadow-md flex justify-between items-center z-10 relative">
        <h1 className="text-xl font-bold">SimpleGIS</h1>
        <div className="flex gap-4">
          <div className="flex bg-gray-700 rounded overflow-hidden shadow-sm">
            <button onClick={exportToJSON} className="hover:bg-gray-600 px-3 py-2 text-sm border-r border-gray-600 transition">Export JSON</button>
            <button onClick={exportToMarkdown} className="hover:bg-gray-600 px-3 py-2 text-sm border-r border-gray-600 transition">Export MD</button>
            <button onClick={exportToImage} className="hover:bg-gray-600 px-3 py-2 text-sm transition">Export Image</button>
          </div>
          <button className="bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm rounded font-medium transition">Login with GitHub</button>
        </div>
      </header>
      <main className="flex-1 relative z-0 flex">
        <MapContainer center={position} zoom={13} className="h-full w-full" ref={mapRef}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <GeomanSetup onCreated={onCreated} />

          {features && features.features && features.features.length > 0 && (
            <GeoJSON data={features} key={JSON.stringify(features)} />
          )}

        </MapContainer>
      </main>
    </div>
  );
}

export default App;
