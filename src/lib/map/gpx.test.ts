import { describe, it, expect } from 'vitest';
import { generateGPX } from './gpx';
import type { Route } from '$lib/types';

describe('generateGPX', () => {
  it('generates a valid GPX XML string', () => {
    const routeData: Route = {
      coordinates: [
        { lat: 10, lng: 20, meta: { elevation: 100 } },
        { lat: 11, lng: 21, meta: { elevation: 110 } }
      ]
    } as any;

    const user = { name: 'TestUser', id: '123' };
    const sessionName = 'TestSession';
    const apSlot = 'Player1';

    const gpx = generateGPX(routeData, sessionName, apSlot, user);

    expect(gpx).toContain('<?xml version=\'1.0\' encoding=\'UTF-8\'?>');
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<name>TestSession_Player1</name>');
    expect(gpx).toContain('<author><name>TestUser</name><link href="123" /></author>');
    expect(gpx).toContain('<trkpt lat="10" lon="20"><ele>100</ele></trkpt>');
    expect(gpx).toContain('<trkpt lat="11" lon="21"><ele>110</ele></trkpt>');
  });

  it('handles missing user and elevation gracefully', () => {
    const routeData: Route = {
      coordinates: [
        { lat: 10, lng: 20 }
      ]
    } as any;

    const gpx = generateGPX(routeData, 'Session', 'Slot', null);

    expect(gpx).toContain('<name>Session_Slot</name>');
    expect(gpx).toContain('<author><name>Player</name><link href="" /></author>');
    expect(gpx).toContain('<trkpt lat="10" lon="20"><ele>0</ele></trkpt>');
  });
});
