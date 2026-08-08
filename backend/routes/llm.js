const express = require('express');
const router = express.Router();
const db = require('../db');

// LLM Interaction Endpoint
// This endpoint receives queries from a local LLM (like Ollama or Gemma4)
// and returns relevant geospatial data, or performs actions.
router.post('/query', (req, res) => {
  const { prompt, action, payload } = req.body;

  // Basic implementation to allow LLM to query map state
  if (action === 'get_map_data') {
    db.all('SELECT * FROM features', [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const features = rows.map(row => ({
        type: row.type,
        id: row.id,
        geometry: JSON.parse(row.geometry),
        properties: row.properties ? JSON.parse(row.properties) : {}
      }));

      // Return context data back to the LLM
      res.json({
        response_to_llm: `The map currently has ${features.length} features.`,
        data: {
          type: 'FeatureCollection',
          features: features
        }
      });
    });
  } 
  else if (action === 'add_feature' && payload) {
    // LLM decides to add a feature to the map
    const { type, geometry, properties } = payload;
    
    if (!geometry) {
       return res.status(400).json({ error: 'Invalid payload from LLM' });
    }
    
    const geomStr = JSON.stringify(geometry);
    const propsStr = properties ? JSON.stringify(properties) : JSON.stringify({});

    db.run(
      `INSERT INTO features (type, geometry_type, geometry, properties) VALUES (?, ?, ?, ?)`,
      [type || 'Feature', geometry.type, geomStr, propsStr],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ response_to_llm: `Successfully added feature with ID ${this.lastID}` });
      }
    );
  }
  else {
    res.status(400).json({ error: 'Unknown action or missing payload' });
  }
});

module.exports = router;
