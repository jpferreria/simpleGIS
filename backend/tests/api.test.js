const request = require('supertest');
const app = require('../server');
const db = require('../db');

describe('SimpleGIS Backend API Tests', () => {
  
  // Cleanup database after tests
  afterAll((done) => {
    db.run('DELETE FROM features', (err) => {
      done();
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('Feature API (/api/features)', () => {
    let createdFeatureId;

    it('should POST a new feature', async () => {
      const newFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [125.6, 10.1]
        },
        properties: {
          name: 'Test Point'
        }
      };

      const res = await request(app).post('/api/features').send(newFeature);
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
      createdFeatureId = res.body.id;
    });

    it('should GET all features', async () => {
      const res = await request(app).get('/api/features');
      expect(res.statusCode).toBe(200);
      expect(res.body.type).toBe('FeatureCollection');
      expect(res.body.features.length).toBeGreaterThan(0);
      
      const feature = res.body.features.find(f => f.id === createdFeatureId);
      expect(feature).toBeDefined();
      expect(feature.geometry.type).toBe('Point');
      expect(feature.properties.name).toBe('Test Point');
    });
  });

  describe('LLM API (/api/llm/query)', () => {
    it('should return map data on get_map_data action', async () => {
      const payload = {
        action: 'get_map_data'
      };

      const res = await request(app).post('/api/llm/query').send(payload);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('response_to_llm');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.type).toBe('FeatureCollection');
    });
  });
});
