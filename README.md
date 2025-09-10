# SVCE Bus Tracker Backend

A robust Express.js backend service for real-time bus tracking with Supabase integration.

## 🚀 Features

- **Real-time Location Tracking**: Track buses every 10 seconds
- **RESTful API**: Clean, documented endpoints
- **Supabase Integration**: Reliable PostgreSQL database
- **Modular Architecture**: Clean separation of concerns
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Graceful error management
- **Rate Limiting**: Protection against abuse
- **Security**: Helmet, CORS, and security best practices

## 📁 Project Structure

```
backend/
├── src/
│   ├── controllers/     # Request handlers
│   ├── models/         # Data models
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── middleware/     # Custom middleware
│   ├── config/         # Configuration files
│   ├── utils/          # Utility functions
│   └── server.js       # Main server file
├── .env.example        # Environment variables template
├── package.json        # Dependencies and scripts
└── README.md          # This file
```

## 🛠️ Setup Instructions

### 1. Environment Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Supabase credentials:
   ```env
   PORT=3000
   NODE_ENV=development
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   ```

### 2. Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)

2. Run the following SQL in your Supabase SQL editor:

   ```bash
   npm run setup
   ```

   This will output the SQL schema. Copy and run it in Supabase.

3. Alternatively, copy this SQL directly:

   ```sql
   -- Create buses table
   CREATE TABLE IF NOT EXISTS buses (
     id SERIAL PRIMARY KEY,
     bus_number VARCHAR(20) UNIQUE NOT NULL,
     driver_name VARCHAR(100) DEFAULT 'Unknown',
     is_active BOOLEAN DEFAULT true,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Create locations table
   CREATE TABLE IF NOT EXISTS locations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     bus_number VARCHAR(20) NOT NULL,
     latitude DECIMAL(10, 8) NOT NULL,
     longitude DECIMAL(11, 8) NOT NULL,
     accuracy DECIMAL(8, 2) DEFAULT 0,
     timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     FOREIGN KEY (bus_number) REFERENCES buses(bus_number) ON DELETE CASCADE
   );

   -- Create indexes for better performance
   CREATE INDEX IF NOT EXISTS idx_buses_number ON buses(bus_number);
   CREATE INDEX IF NOT EXISTS idx_buses_active ON buses(is_active);
   CREATE INDEX IF NOT EXISTS idx_locations_bus_number ON locations(bus_number);
   CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp);
   CREATE INDEX IF NOT EXISTS idx_locations_created_at ON locations(created_at);
   ```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Server

For development:
```bash
npm run dev
```

For production:
```bash
npm start
```

## 📡 API Endpoints

### Health Check
- `GET /health` - Check server status

### Bus Management
- `POST /api/buses/start-tracking` - Start tracking a bus
- `POST /api/buses/stop-tracking` - Stop tracking a bus
- `GET /api/buses/active` - Get all active buses
- `GET /api/buses/dashboard` - Get dashboard data
- `GET /api/buses/:busNumber/history` - Get bus history

### Location Management
- `POST /api/buses/:busNumber/location` - Update bus location
- `GET /api/buses/:busNumber/location` - Get current bus location
- `GET /api/locations/recent` - Get recent locations for all buses

### Maintenance
- `DELETE /api/buses/cleanup` - Clean up old location data

## 🔧 API Usage Examples

### Start Tracking a Bus
```bash
curl -X POST http://localhost:3000/api/buses/start-tracking \
  -H "Content-Type: application/json" \
  -d '{
    "busNumber": "KA-01-AB-1234",
    "driverName": "John Doe"
  }'
```

### Update Bus Location
```bash
curl -X POST http://localhost:3000/api/buses/KA-01-AB-1234/location \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 12.9716,
    "longitude": 77.5946,
    "accuracy": 10.5,
    "timestamp": "2024-01-01T12:00:00Z"
  }'
```

### Get Active Buses
```bash
curl http://localhost:3000/api/buses/active
```

## 🔒 Security Features

- **Rate Limiting**: 100 requests per minute per IP
- **CORS**: Configured for specific origins
- **Helmet**: Security headers
- **Input Validation**: Comprehensive validation with express-validator
- **Error Handling**: Graceful error responses

## 🚀 Deployment

This backend is ready for deployment on:
- **Heroku**
- **Vercel**
- **Railway**
- **DigitalOcean App Platform**
- **AWS Elastic Beanstalk**

Make sure to set environment variables in your deployment platform.

## 📊 Monitoring

The API includes:
- Health check endpoint at `/health`
- Comprehensive logging with Morgan
- Error tracking and reporting
- Performance monitoring ready

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License.
