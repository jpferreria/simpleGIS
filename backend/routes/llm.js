const express = require('express');
const router = express.Router();
const db = require('../db');

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'gemma:e4b';

// Helper to query the DB synchronously for the LLM context
const getMapFeatures = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM features', [], (err, rows) => {
      if (err) reject(err);
      const features = rows.map(row => ({
        type: row.type,
        id: row.id,
        geometry: JSON.parse(row.geometry),
        properties: row.properties ? JSON.parse(row.properties) : {}
      }));
      resolve(features);
    });
  });
};

const insertFeature = (type, geometry, properties) => {
  return new Promise((resolve, reject) => {
    const geomStr = JSON.stringify(geometry);
    const propsStr = properties ? JSON.stringify(properties) : JSON.stringify({});
    
    db.run(
      `INSERT INTO features (type, geometry_type, geometry, properties) VALUES (?, ?, ?, ?)`,
      [type || 'Feature', geometry.type, geomStr, propsStr],
      function(err) {
        if (err) reject(err);
        resolve(this.lastID);
      }
    );
  });
};

// LLM Interaction Endpoint
router.post('/query', async (req, res) => {
  const { prompt, action, payload } = req.body;

  // Fallback support for older manual requests
  if (action === 'get_map_data') {
    const features = await getMapFeatures();
    return res.json({
      response_to_llm: `The map currently has ${features.length} features.`,
      data: { type: 'FeatureCollection', features }
    });
  } 
  else if (action === 'add_feature' && payload) {
    const id = await insertFeature(payload.type, payload.geometry, payload.properties);
    return res.json({ response_to_llm: `Successfully added feature with ID ${id}` });
  }

  // New Chat flow using Ollama
  if (action === 'chat') {
    try {
      const features = await getMapFeatures();
      
      const systemPrompt = `You are a helpful GIS (Geographic Information System) Assistant. 
You can talk to the user, count map objects, and draw new shapes.
Current map state: The user has ${features.length} features drawn on the map.
If the user asks you to draw a point or marker, you MUST generate valid GeoJSON.
For example, a point near London is: {"type": "Point", "coordinates": [-0.1, 51.5]}.

You MUST respond ONLY with a raw, valid JSON object in the following format. Do not use markdown blocks like \`\`\`json.
{
  "message": "Your text response to the user.",
  "command": "add_feature" or null,
  "payload": {
    "type": "Feature",
    "geometry": { ... },
    "properties": { "name": "..." }
  } // Provide this ONLY if command is add_feature.
}`;

      const ollamaResponse = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          prompt: prompt,
          system: systemPrompt,
          stream: false,
          format: "json"
        })
      });

      if (!ollamaResponse.ok) {
        throw new Error('Ollama connection failed');
      }

      const ollamaData = await ollamaResponse.json();
      
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(ollamaData.response);
      } catch (e) {
        // Fallback if LLM didn't return perfect JSON
        parsedResponse = { message: ollamaData.response, command: null };
      }

      let refreshMap = false;
      let finalMessage = parsedResponse.message;

      // Execute commands on behalf of the LLM
      if (parsedResponse.command === 'add_feature' && parsedResponse.payload && parsedResponse.payload.geometry) {
        const p = parsedResponse.payload;
        try {
          await insertFeature(p.type, p.geometry, p.properties);
          refreshMap = true;
          finalMessage += ' (I have added this to your map!)';
        } catch (dbErr) {
          console.error("DB Insert Error", dbErr);
          finalMessage += ' (I tried to add it, but encountered an error.)';
        }
      }

      res.json({
        response_to_llm: finalMessage,
        refreshRequired: refreshMap
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to communicate with local LLM. Is Ollama running?' });
    }
  } else {
    res.status(400).json({ error: 'Unknown action' });
  }
});

module.exports = router;
