import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../src/App';
import React from 'react';
import '@testing-library/jest-dom';

// Mock the fetch API to prevent actual network calls during testing
global.fetch = vi.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ type: 'FeatureCollection', features: [] })
  })
);

describe('App Component', () => {
  it('renders the header correctly', () => {
    render(<App />);
    const headerTitle = screen.getByText('SimpleGIS');
    expect(headerTitle).toBeInTheDocument();
  });

  it('renders the login button', () => {
    render(<App />);
    const loginButton = screen.getByText('Login with GitHub');
    expect(loginButton).toBeInTheDocument();
  });

  it('contains the map container with Leaflet classes', () => {
    const { container } = render(<App />);
    const mapElement = container.querySelector('.leaflet-container');
    expect(mapElement).toBeInTheDocument();
  });
});
