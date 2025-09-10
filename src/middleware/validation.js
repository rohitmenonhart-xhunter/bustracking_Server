const { body, param, query } = require('express-validator');

const validateBusNumber = () => {
  return body('busNumber')
    .notEmpty()
    .withMessage('Bus number is required')
    .isLength({ min: 1, max: 20 })
    .withMessage('Bus number must be between 1 and 20 characters')
    .matches(/^[A-Z0-9\-]+$/i)
    .withMessage('Bus number can only contain letters, numbers, and hyphens');
};

const validateDriverName = () => {
  return body('driverName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Driver name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Driver name can only contain letters and spaces');
};

const validateLocation = () => {
  return [
    body('latitude')
      .notEmpty()
      .withMessage('Latitude is required')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    
    body('longitude')
      .notEmpty()
      .withMessage('Longitude is required')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    
    body('accuracy')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Accuracy must be a positive number'),
    
    body('timestamp')
      .optional()
      .isISO8601()
      .withMessage('Timestamp must be a valid ISO 8601 date')
  ];
};

const validateBusNumberParam = () => {
  return param('busNumber')
    .notEmpty()
    .withMessage('Bus number parameter is required')
    .isLength({ min: 1, max: 20 })
    .withMessage('Bus number must be between 1 and 20 characters');
};

const validateHours = () => {
  return query('hours')
    .optional()
    .isInt({ min: 1, max: 168 }) // Max 1 week
    .withMessage('Hours must be between 1 and 168 (1 week)');
};

const validateDays = () => {
  return query('days')
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage('Days must be between 1 and 30');
};

module.exports = {
  validateStartTracking: [validateBusNumber(), validateDriverName()],
  validateStopTracking: [validateBusNumber()],
  validateUpdateLocation: [validateBusNumberParam(), ...validateLocation()],
  validateGetHistory: [validateBusNumberParam(), validateHours()],
  validateCleanup: [validateDays()]
};
