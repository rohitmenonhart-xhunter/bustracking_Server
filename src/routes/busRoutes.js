const express = require('express');
const router = express.Router();
const BusController = require('../controllers/busController');
const {
  validateStartTracking,
  validateStopTracking,
  validateUpdateLocation,
  validateGetHistory,
  validateCleanup
} = require('../middleware/validation');

// Bus tracking routes
router.post('/start-tracking', validateStartTracking, BusController.startTracking);
router.post('/stop-tracking', validateStopTracking, BusController.stopTracking);

// Bus information routes
router.get('/active', BusController.getActiveBuses);
router.get('/dashboard', BusController.getDashboard);
router.get('/:busNumber/history', validateGetHistory, BusController.getBusHistory);

// Location routes for specific bus
router.post('/:busNumber/location', validateUpdateLocation, BusController.updateLocation);
router.get('/:busNumber/location', BusController.getCurrentLocation);

// Maintenance routes
router.delete('/cleanup', validateCleanup, BusController.cleanupOldData);

module.exports = router;
