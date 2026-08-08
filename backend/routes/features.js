const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all features
router.get('/', (req, res) => {
  db.all('SELECT * FROM features', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Format rows into a GeoJSON FeatureCollection
    const features = rows.map(row => ({
      type: row.type,
      id: row.id,
      geometry: JSON.parse(row.geometry),
      properties: row.properties ? JSON.parse(row.properties) : {}
    }));

    res.json({
      type: 'FeatureCollection',
      features: features
    });
  });
});

// POST a new feature
router.post('/', (req, res) => {
  const { type, geometry, properties } = req.body;

  if (!geometry || !geometry.type || !geometry.coordinates) {
    return res.status(400).json({ error: 'Invalid GeoJSON geometry' });
  }

  const featureType = type || 'Feature';
  const geomType = geometry.type;
  const geomStr = JSON.stringify(geometry);
  const propsStr = properties ? JSON.stringify(properties) : JSON.stringify({});

  db.run(
    `INSERT INTO features (type, geometry_type, geometry, properties) VALUES (?, ?, ?, ?)`,
    [featureType, geomType, geomStr, propsStr],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, message: 'Feature created successfully' });
    }
  );
});

// PUT update a feature
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { geometry, properties } = req.body;

  if (!geometry) {
    return res.status(400).json({ error: 'Geometry is required for update' });
  }

  const geomType = geometry.type;
  const geomStr = JSON.stringify(geometry);
  const propsStr = properties ? JSON.stringify(properties) : null;

  db.run(
    `UPDATE features SET geometry_type = ?, geometry = ?, properties = ? WHERE id = ?`,
    [geomType, geomStr, propsStr, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Feature not found' });
      }
      res.json({ message: 'Feature updated successfully' });
    }
  );
});

// DELETE a feature
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM features WHERE id = ?`, id, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Feature not found' });
    }
    res.json({ message: 'Feature deleted successfully' });
  });
});

module.exports = router;
