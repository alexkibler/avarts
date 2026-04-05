import { FitWriter } from '@markw65/fit-file-writer';
import * as fs from 'fs';

const writer = new FitWriter();
writer.writeMessage('file_id', {
    type: 'activity',
    manufacturer: 'development',
    product: 0,
    serial_number: 12345,
    time_created: writer.time(new Date())
});

const startTime = new Date();
writer.writeMessage('activity', {
    timestamp: writer.time(startTime),
    num_sessions: 1,
    type: 'manual',
    event: 'activity',
    event_type: 'start'
});

writer.writeMessage('session', {
    timestamp: writer.time(startTime),
    start_time: writer.time(startTime),
    sport: 'cycling',
    sub_sport: 'generic',
    total_elapsed_time: 1000,
    total_timer_time: 1000,
    total_distance: 1000,
    total_ascent: 50
});

writer.writeMessage('record', {
    timestamp: writer.time(startTime),
    position_lat: writer.latlng(40.0),
    position_long: writer.latlng(-80.0),
    distance: 0,
    altitude: 100,
    heart_rate: 150,
    power: 200
});

const endTime = new Date(startTime.getTime() + 10000);
writer.writeMessage('record', {
    timestamp: writer.time(endTime),
    position_lat: writer.latlng(40.001),
    position_long: writer.latlng(-80.001),
    distance: 100,
    altitude: 110,
    heart_rate: 160,
    power: 250
});

const data = writer.finish();
fs.writeFileSync('test.fit', new Uint8Array(data.buffer));
console.log('Generated test.fit');
