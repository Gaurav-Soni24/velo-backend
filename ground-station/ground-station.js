#!/usr/bin/env node
/**
 * Velo ground station.
 *
 * Runs on the computer next to the bike stand. It
 *   1. reads RFID card taps from the Arduino over USB serial   (line format:  RFID:04A1B2C3)
 *   2. reads bike detections from the AI camera                 (line format:  CAM:1,2,3)
 *   3. forwards both to the cloud API over the internet and sends the result back to the
 *      Arduino so it can light an LED / buzz / drive the lock    (ACK:RENT:3, ACK:RETURN:3, ERR:<reason>)
 *   4. sends a heartbeat so the admin panel can show the stand as online.
 *
 * No hardware? Use simulator mode:  MODE=simulator node ground-station.js
 *   tap 04A1B2C3        simulate a card tap
 *   camera 1,2,3        simulate the camera seeing bikes 1, 2 and 3
 */
require('dotenv').config();
const readline = require('node:readline');

const config = {
  apiUrl: (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, ''),
  deviceKey: process.env.DEVICE_KEY || '',
  deviceId: process.env.DEVICE_ID || 'stand-01',
  deviceName: process.env.DEVICE_NAME || 'Main Gate Stand',
  location: process.env.DEVICE_LOCATION || 'Campus main gate',
  mode: process.argv.includes('--simulator') ? 'simulator' : (process.env.MODE || 'serial').toLowerCase(),
  serialPort: process.env.SERIAL_PORT || 'COM3',
  baudRate: parseInt(process.env.BAUD_RATE, 10) || 9600,
  heartbeatSeconds: parseInt(process.env.HEARTBEAT_SECONDS, 10) || 30,
  debounceMs: parseInt(process.env.DEBOUNCE_MS, 10) || 3000,
};

const log = (...args) => console.log(new Date().toISOString(), ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** POST to the cloud with a few retries for flaky internet. Returns { status, body }. */
async function callApi(path, payload, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetch(`${config.apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-key': config.deviceKey },
        body: JSON.stringify({ deviceId: config.deviceId, ...payload }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    } catch (error) {
      lastError = error;
      log(`network error calling ${path} (attempt ${i}/${attempts}): ${error.message}`);
      if (i < attempts) await sleep(500 * 2 ** i);
    }
  }
  throw lastError;
}

let writeToArduino = () => {};
const lastTap = new Map();

/** A card resting on the reader is read many times per second; act on it once. */
const isBounce = (tag) => {
  const now = Date.now();
  if (now - (lastTap.get(tag) || 0) < config.debounceMs) return true;
  lastTap.set(tag, now);
  return false;
};

async function handleTap(rawTag) {
  const rfidTag = String(rawTag).trim().toUpperCase();
  if (!rfidTag || isBounce(rfidTag)) return;
  log(`card ${rfidTag} tapped -> POST /api/device/scan`);
  try {
    const { status, body } = await callApi('/api/device/scan', { rfidTag });
    if (status === 200 || status === 201) {
      log(`OK  ${body.message}`);
      writeToArduino(`ACK:${body.action.toUpperCase()}:${body.bike ? body.bike.bikeId : 0}`);
    } else {
      log(`REFUSED (${status}) ${body.message}`);
      writeToArduino(`ERR:${body.message || status}`);
    }
  } catch (error) {
    log(`FAILED to reach the cloud: ${error.message}`);
    writeToArduino('ERR:offline');
  }
}

async function handleCamera(listText) {
  const bikesPresent = String(listText)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
  log(`camera sees bikes [${bikesPresent.join(', ')}] -> POST /api/device/camera`);
  try {
    const { status, body } = await callApi('/api/device/camera', {
      bikesPresent,
      timestamp: new Date().toISOString(),
    });
    if (status === 200) {
      log(
        `camera ok: seen=${body.bikesSeen} recovered=${body.recovered} missing=${body.missingFlagged} manualReturns=${body.manualReturnsFlagged}`
      );
    } else {
      log(`camera refused (${status}) ${body.message}`);
    }
  } catch (error) {
    log(`camera update failed: ${error.message}`);
  }
}

async function sendHeartbeat() {
  try {
    const { status } = await callApi('/api/device/heartbeat', { name: config.deviceName, location: config.location }, 1);
    if (status !== 200) log(`heartbeat refused (${status}) - check DEVICE_KEY`);
  } catch {
    /* already logged */
  }
}

/** One incoming text line from the Arduino or the simulator. */
function handleLine(line) {
  const text = line.trim();
  if (!text) return;
  if (/^RFID:/i.test(text)) return handleTap(text.slice(5));
  if (/^CAM:/i.test(text)) return handleCamera(text.slice(4));
  const parts = text.split(/\s+/);
  if (/^tap$/i.test(parts[0]) && parts[1]) return handleTap(parts[1]);
  if (/^camera$/i.test(parts[0])) return handleCamera(parts.slice(1).join(''));
  log(`ignored: ${text}   (expected "RFID:<uid>", "CAM:<ids>", "tap <uid>" or "camera <ids>")`);
}

function startSimulator() {
  log(`SIMULATOR mode. Cloud API: ${config.apiUrl}`);
  console.log('Commands:  tap <RFID>   |   camera 1,2,3   |   quit');
  const rl = readline.createInterface({ input: process.stdin });
  // Handle commands strictly in order, and finish in-flight requests before exiting.
  let chain = Promise.resolve();
  rl.on('line', (line) => {
    if (/^(quit|exit)$/i.test(line.trim())) return rl.close();
    chain = chain.then(() => handleLine(line)).catch((error) => log(`error: ${error.message}`));
  });
  rl.on('close', () => chain.then(() => process.exit(0)));
}

function startSerial() {
  // Loaded lazily so simulator mode works without the native serial dependency.
  const { SerialPort } = require('serialport');
  const { ReadlineParser } = require('@serialport/parser-readline');
  const port = new SerialPort({ path: config.serialPort, baudRate: config.baudRate });
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
  writeToArduino = (message) => port.write(`${message}\n`);
  port.on('open', () => log(`Arduino connected on ${config.serialPort} @ ${config.baudRate} baud. Cloud API: ${config.apiUrl}`));
  port.on('error', (error) => {
    log(`serial error: ${error.message}`);
    process.exit(1);
  });
  parser.on('data', handleLine);
}

log(`Velo ground station "${config.deviceId}" starting (${config.mode} mode)`);
if (!config.deviceKey) log('warning: DEVICE_KEY is empty. Fine for local development; set it for a deployed API.');
sendHeartbeat();
setInterval(sendHeartbeat, config.heartbeatSeconds * 1000).unref();
if (config.mode === 'simulator') startSimulator();
else startSerial();
