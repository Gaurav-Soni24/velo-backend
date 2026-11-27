# Velo — IoT Smart Cycle Sharing: Cloud API, Ground Station and Arduino

Velo lets riders rent a bike by **tapping an RFID card**. This repository holds the three pieces that run the system behind the tap:

| Piece | Folder | Runs on |
|---|---|---|
| **Cloud API** (Express + MongoDB) | `src/`, `server.js` | A server (Vercel, Render, any Node host) |
| **Ground station** (reads the Arduino and the camera, calls the API) | `ground-station/` | A PC or Raspberry Pi at the bike stand |
| **Arduino sketch** (RC522 RFID reader, LED, buzzer) | `arduino/velo_rfid/` | Arduino Uno |

It was published as a research paper: *Velo: An IoT-Based SmartCycle Sharing System for Sustainable Urban Mobility*, JETIR, Vol. 13, Issue 3, March 2026 ([paper](http://www.jetir.org/view?paper=JETIRHQ06008)).

- **Landing page and live simulator:** https://github.com/Gaurav-Soni24/Velo (live: https://velo-flame.vercel.app)
- **Admin dashboard:** https://github.com/Gaurav-Soni24/velo-frontend

## How the system works

```
 RFID card ─► Arduino + RC522 ──USB serial──► Ground station ──HTTPS + JSON──► Cloud API ◄──► MongoDB
 (RFID:04A1B2C3)                  "RFID:…"      (Node.js)        x-device-key    (Express)        ▲
                                                   ▲                                ▲            │
                              AI camera ──"CAM:1,2,3"                               └── Admin dashboard (Next.js)
```

1. A rider taps a card. The **Arduino** reads the UID and prints `RFID:<uid>` over USB serial.
2. The **ground station** forwards the tap to `POST /api/device/scan` and writes the result back to the Arduino (`ACK:RENT:3`, `ACK:RETURN:3` or `ERR:<reason>`) so it can light an LED, beep and open the lock.
3. The **cloud API** decides what the tap means. A rider with no ride gets the first available bike; a rider who already has one returns it. Everything is stored in MongoDB.
4. The **AI camera** reports which bikes are physically at the stand (`POST /api/device/camera`). The API compares that with the RFID records and raises alerts:
   - `missing_mismatch`: an *available* bike the camera has not seen for `MISSING_BIKE_TIMEOUT_MINUTES` (default 10) is marked **missing**. It recovers automatically when the camera sees it again.
   - `returned_manually`: the camera sees a *rented* bike at the stand, so the rider parked it without tapping. A proper return later clears the alert.
5. The **admin dashboard** reads the same database through `/api/admin/*`: live RFID activity, ground-station status (via heartbeat), riders, bikes, rentals and alerts.

## Quick start (no Arduino and no MongoDB needed)

```bash
git clone https://github.com/Gaurav-Soni24/velo-backend.git
cd velo-backend
npm install
npm run dev:memory        # API on :5000 with an in-memory database and demo riders and bikes
```

In a second terminal, run the ground station in simulator mode and type commands:

```bash
npm run ground-station
> tap 04A1B2C3            # Aarav rents Bike 1
> tap 04A1B2C3            # (ignored: same card within 3 s, debounce)
> camera 2,3              # camera sees bikes 2 and 3 → Bike 1 is rented, so nothing to flag
> tap DEADBEEF            # unknown card → refused and logged
> quit
```

Open the admin dashboard (`velo-frontend`) with `NEXT_PUBLIC_API_BASE_URL=http://localhost:5000` and watch the Overview update.

Demo RFID cards created by the seed script: `04A1B2C3` Aarav, `04D4E5F6` Diya, `04112233` Rohan, `04445566` Ananya, `04778899` Kabir.

## Run with a real database

```bash
cp .env.example .env      # set MONGODB_URI, DEVICE_API_KEY and the admin login
npm run seed              # demo data (npm run seed -- --reset wipes first)
npm run dev               # or: npm start
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Server port |
| `MONGODB_URI` | `mongodb://localhost:27017/bike-rental-iot` | Database connection string |
| `DEVICE_API_KEY` | *(empty)* | Ground station must send it as `x-device-key`. Required in production (the device API answers 503 without it); empty means open in development. |
| `ADMIN_EMAIL` | *(empty)* | The admin account's email |
| `ADMIN_PASSWORD_HASH` | *(empty)* | Recommended. Make it with `npm run hash-password -- "your password"` (scrypt) |
| `ADMIN_PASSWORD` | *(empty)* | Plain-text alternative to the hash (server side only) |
| `JWT_SECRET` | *(empty)* | 32+ random characters; signs admin session tokens. Without it admin login is disabled (503) |
| `ADMIN_SESSION_HOURS` | `12` | How long an admin stays signed in |
| `ADMIN_API_KEY` | *(empty)* | Optional `x-admin-key` for scripts that call the admin API without signing in |
| `CORS_ORIGIN` | `*` | Comma-separated allowed browser origins |
| `MISSING_BIKE_TIMEOUT_MINUTES` | `10` | Camera absence before a bike is flagged missing |
| `DEVICE_OFFLINE_AFTER_SECONDS` | `90` | Heartbeat gap before a ground station shows as offline |

## API

### Ground station → cloud (`x-device-key` header)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/device/scan` | Card tap. Rents if the rider has no ride, returns if they do. Body: `{ rfidTag, deviceId }` |
| POST | `/api/device/rent` · `/api/device/return` | Explicit rent or return |
| POST | `/api/device/camera` | Bikes the camera sees. Body: `{ bikesPresent: [1, 2], timestamp, deviceId }` |
| POST | `/api/device/heartbeat` | `{ deviceId, name, location }` marks the stand online |

Legacy aliases still work: `POST /rent`, `POST /return`, `POST /camera/update-status`.

Example:

```bash
curl -X POST http://localhost:5000/api/device/scan \
  -H "Content-Type: application/json" -H "x-device-key: $DEVICE_API_KEY" \
  -d '{ "rfidTag": "04A1B2C3", "deviceId": "stand-01" }'
# 201 { "success": true, "action": "rent", "message": "Bike 1 unlocked for Aarav Sharma", "bike": {...}, "rental": {...} }
```

### Admin dashboard → cloud (`/api/admin`, responses are `{ success, data }`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/dashboard/stats` | Bike, rider, rental and alert counts |
| GET | `/events?limit=20` | Recent card taps, including refused ones |
| GET | `/devices` | Ground stations with `online` flag |
| GET · POST · PATCH · DELETE | `/bikes`, `/bikes/:id` | Manage bikes (a rented bike cannot be deleted) |
| GET · POST · PATCH · DELETE | `/users`, `/users/:id` | Manage riders and their RFID cards (a rider with a ride cannot be deleted) |
| GET | `/rentals?status=ongoing` | Rentals with rider, bike and duration in minutes |
| GET · POST | `/alerts` | List alerts (`?resolved=false`) or create a manual one |
| PATCH | `/alerts/:id/resolve` | Mark an alert resolved |

Errors always look like `{ "success": false, "message": "…" }` with the right status (400, 401, 403, 404, 409).

## Data model

`User` (name, rollNumber, branch, semester, **rfidTag**, isActive) · `Bike` (bikeId, bikeName, status, lastSeenCameraTime, currentRentedBy) · `Rental` (userId, bikeId, startTime, endTime, duration, status) · `Alert` (bikeId, type, message, isResolved) · `ScanEvent` (audit log of every tap) · `Device` (ground station, lastHeartbeat).

## Ground station

```bash
cd ground-station
cp .env.example .env      # API_URL, DEVICE_KEY, MODE
npm install               # installs serialport (only needed for real hardware)
npm start                 # MODE=serial reads the Arduino on SERIAL_PORT
```

It debounces repeated reads of the same card, retries failed API calls with backoff, reports `OFFLINE` back to the Arduino when the internet is down, and sends a heartbeat every 30 s. Without hardware, use `MODE=simulator` (or `npm run ground-station` from the repo root).

## Arduino

Open `arduino/velo_rfid/velo_rfid.ino`, install the **MFRC522** library and upload it to an Arduino Uno. Wiring is in the sketch header. It prints `RFID:<uid>` on every new card and reacts to `ACK:` / `ERR:` lines from the ground station.

## Tests

```bash
npm test
```

Eleven end-to-end tests run the real API against an in-memory MongoDB: rent and return, case-insensitive tags, two riders and no bikes left, **simultaneous taps never give the same bike**, unknown and disabled cards, both camera alerts and recovery, heartbeat, admin CRUD and delete guards, device-key auth and the legacy routes.

## Design decisions

- **Atomic rental:** the bike is claimed with a single `findOneAndUpdate`, so races cannot double-rent a bike.
- **One reader, one endpoint:** `/scan` toggles between rent and return so the Arduino stays simple.
- **Camera reconciliation:** RFID is what the system believes, the camera is what is true. Alerts come from the difference.
- **Serverless-ready:** the app exports itself and connects to MongoDB lazily, so it runs on Vercel (`vercel.json`) or as a normal server.
- **Admin login:** `POST /api/admin/auth/login` with `{ email, password }` returns a signed token (HS256, 12 hours). Every other `/api/admin` route needs `Authorization: Bearer <token>`. Five failed logins from one IP lock sign-in for 15 minutes. `npm run dev:memory` uses a demo login (`admin@velo.local` / `velo-demo-admin`) when `.env` sets none.
- **Not production-complete:** one admin account only, and the login rate limit lives in memory (it resets on restart and is per instance on serverless hosts).

## License

MIT
