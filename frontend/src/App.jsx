import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';

// Fix for default Leaflet icons in Vite/React
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function App() {
  const position = [51.505, -0.09]; // Default to London
  const [features, setFeatures] = useState(null);

  useEffect(() => {
    // Fetch features from our backend API
    fetch('http://localhost:3001/api/features')
      .then(res => res.json())
      .then(data => {
        if (data.type === 'FeatureCollection') {
          setFeatures(data);
        }
      })
      .catch(err => console.error("Error fetching map features:", err));
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="bg-gray-800 text-white p-4 shadow-md flex justify-between items-center z-10 relative">
        <h1 className="text-xl font-bold">SimpleGIS</h1>
        <button className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded transition">Login with GitHub</button>
      </header>
      <main className="flex-1 relative z-0">
        <MapContainer center={position} zoom={13} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {features && <GeoJSON data={features} />}
          <Marker position={position}>
            <Popup>
              A sample point on the map.
            </Popup>
          </Marker>
        </MapContainer>
      </main>
    </div>
  );
}

export default App;
