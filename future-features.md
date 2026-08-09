# LiteGIS Future Features Roadmap

This document outlines high-impact features and enhancements planned for future development of LiteGIS.

## 1. High-Res Map Export (Reporting) 📸
*   **Description:** fully implement the "Export to Image" button on the map using `html2canvas` or a Leaflet plugin.
*   **Goal:** Allow users to instantly download a high-resolution PNG of their map—complete with custom polygons, elevation profiles, and flood zones—perfect for dropping into presentations or reports.

## 2. Cloud Deployment ☁️
*   **Description:** Deploy the Dockerized application to the live internet.
*   **Goal:** Host the backend and frontend on a cloud hosting service (like Render, Fly.io, or Railway) so the app can be accessed globally from any device, including mobile phones.

## 3. Layer Styling & Management 🎨
*   **Description:** Enhance the Properties Drawer to allow manual styling and visibility toggling.
*   **Goal:** Allow users to:
    *   Change the fill color and border color of any drawn shape.
    *   Adjust the opacity/transparency.
    *   Toggle specific layers on/off (e.g., temporarily hide a flood zone to see the satellite imagery underneath).

## 4. Progressive Web App (Offline Mode) 📱
*   **Description:** Convert the frontend into an installable PWA with service workers.
*   **Goal:** Allow users to click "Install to Home Screen" on their phone for an app-like experience. Add service workers to cache map tiles and drawn features, enabling basic viewing and location tracking even without cellular service in the field.
