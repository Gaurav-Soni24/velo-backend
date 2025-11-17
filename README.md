# Bike Rental + IoT System Backend

A complete backend solution for managing bike rentals with IoT integration, RFID system, and AI camera monitoring.

## Features

- **RFID System**: Rent and return bikes using RFID tags
- **IoT Integration**: Monitor bike status via camera detection
- **Admin Dashboard**: Manage bikes, rentals, and alerts
- **Alert System**: Automatic alerts for missing bikes and camera issues
- **Clean Architecture**: MVC structure with proper separation of concerns

## Project Structure

\`\`\`
src/
├── config/          # Database configuration
├── controllers/     # Business logic
├── routes/         # API endpoints
├── models/         # Database schemas
├── middleware/     # Express middleware
└── utils/          # Utility functions and constants
\`\`\`

## Models

### Bike
- `bikeId`: Unique identifier
- `status`: available | rented | missing | maintenance
- `lastSeenCameraTime`: Last detection timestamp
- `lastSeenLocation`: Last known location
- `assignedRFID`: RFID tag (optional)

### User
- `name`: User name
- `rfidTag`: Unique RFID identifier

### Rental
- `userId`: Reference to User
- `bikeId`: Reference to Bike
- `startTime`: Rental start time
- `endTime`: Rental end time
- `status`: ongoing | completed

### Alert
- `bikeId`: Reference to Bike
- `type`: missing_mismatch | returned_manually | camera_issue
- `message`: Alert description
- `timestamp`: Alert creation time
- `videoUrl`: Optional video evidence
- `imageUrl`: Optional image evidence

## API Endpoints

### RFID System (Public)
- `POST /rent` - Rent a bike (body: { rfidTag })
- `POST /return` - Return a bike (body: { rfidTag })

### Admin Routes
- `POST /admin/bike/add` - Add a new bike
- `GET /admin/bike/all` - Get all bikes
- `PATCH /admin/bike/update/:id` - Update bike status
- `GET /admin/rentals` - Get all rentals
- `GET /admin/alerts` - Get all alerts
- `POST /admin/alert/manual` - Create manual alert

### Camera Integration
- `POST /camera/update-status` - Update bike detection status (body: { bikesPresent: [ids], timestamp })

## Installation

1. **Clone the repository**
   \`\`\`bash
   git clone <repository-url>
   cd bike-rental-iot-backend
   \`\`\`

2. **Install dependencies**
   \`\`\`bash
   npm install
   \`\`\`

3. **Setup MongoDB**
   - Ensure MongoDB is running locally on `mongodb://localhost:27017`
   - Or modify the MONGODB_URI in your .env file

4. **Create .env file**
   \`\`\`bash
   cp .env.example .env
   \`\`\`
   
   Configure the following variables:
   - `PORT` - Server port (default: 5000)
   - `NODE_ENV` - Environment (development/production)
   - `MONGODB_URI` - MongoDB connection string
   - `MISSING_BIKE_TIMEOUT_MINUTES` - Minutes before marking bike as missing (default: 10)

5. **Start the server**
   \`\`\`bash
   npm run dev        # Development with nodemon
   npm start          # Production
   \`\`\`

## Testing

### Health Check
\`\`\`bash
curl http://localhost:5000/health
\`\`\`

### Rent a Bike
\`\`\`bash
curl -X POST http://localhost:5000/rent \
  -H "Content-Type: application/json" \
  -d '{ "rfidTag": "user123" }'
\`\`\`

### Return a Bike
\`\`\`bash
curl -X POST http://localhost:5000/return \
  -H "Content-Type: application/json" \
  -d '{ "rfidTag": "user123" }'
\`\`\`

### Get All Bikes
\`\`\`bash
curl http://localhost:5000/admin/bike/all
\`\`\`

### Get Alerts
\`\`\`bash
curl http://localhost:5000/admin/alerts
\`\`\`

### Update Camera Status
\`\`\`bash
curl -X POST http://localhost:5000/camera/update-status \
  -H "Content-Type: application/json" \
  -d '{
    "bikesPresent": ["bike_object_id_1", "bike_object_id_2"],
    "timestamp": "2024-01-15T10:30:00Z"
  }'
\`\`\`

## Error Handling

The API uses standard HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

All error responses follow this format:
\`\`\`json
{
  "error": "Error message"
}
\`\`\`

## Database Seeding

To add sample data for testing, run:

\`\`\`bash
# MongoDB CLI
mongo

# Connect to database
use bike-rental-iot

# Add sample user
db.users.insertOne({ name: "John Doe", rfidTag: "user123" })

# Add sample bike
db.bikes.insertOne({ bikeId: 1, status: "available" })
\`\`\`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 5000 | Server port |
| NODE_ENV | development | Environment mode |
| MONGODB_URI | mongodb://localhost:27017/bike-rental-iot | Database URL |
| MISSING_BIKE_TIMEOUT_MINUTES | 10 | Alert timeout for missing bikes |

## License

MIT
