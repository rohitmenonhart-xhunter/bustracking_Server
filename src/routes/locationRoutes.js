const express = require('express');
const router = express.Router();
const Location = require('../models/Location');

// Get recent locations for all buses
router.get('/recent', async (req, res, next) => {
  try {
    const { minutes = 30 } = req.query;
    const recentLocations = await Location.getBusesWithRecentLocations(parseInt(minutes));
    
    res.status(200).json({
      success: true,
      message: `Recent locations from last ${minutes} minutes`,
      data: recentLocations
    });
  } catch (error) {
    next(error);
  }
});

// Get locations by bus number with pagination
router.get('/bus/:busNumber', async (req, res, next) => {
  try {
    const { busNumber } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const locations = await Location.getByBusNumber(busNumber, parseInt(limit));
    
    res.status(200).json({
      success: true,
      message: `Locations for bus ${busNumber}`,
      data: locations,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: locations.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// Bulk location update (for future use)
router.post('/bulk', async (req, res, next) => {
  try {
    const { locations } = req.body;
    
    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Locations array is required and must not be empty'
      });
    }

    const results = [];
    for (const locationData of locations) {
      try {
        const location = await Location.create(locationData);
        results.push(location);
      } catch (error) {
        console.error(`Failed to create location for bus ${locationData.busNumber}:`, error.message);
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Bulk location update completed`,
      data: {
        processed: locations.length,
        successful: results.length,
        failed: locations.length - results.length,
        results: results
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
