const googlePlaces = require('../services/googlePlacesService');

const suggest = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const city = String(req.query.city || '').trim();
    if (q.length < 3) {
      return res.json({ success: true, results: [], provider: 'none' });
    }

    if (!googlePlaces.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Address search is not configured. Set GOOGLE_API_KEY on the server.',
      });
    }

    const results = await googlePlaces.autocomplete(q, city);
    return res.json({ success: true, results: results || [], provider: 'google' });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: error.message || 'Address search failed',
    });
  }
};

const resolvePlace = async (req, res) => {
  try {
    const placeId = String(req.query.placeId || '').trim();
    if (!placeId) {
      return res.status(400).json({ success: false, message: 'placeId is required' });
    }

    if (!googlePlaces.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Address search is not configured. Set GOOGLE_API_KEY on the server.',
      });
    }

    const result = await googlePlaces.placeDetails(placeId);
    return res.json({ success: true, result, provider: 'google' });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: error.message || 'Could not resolve place',
    });
  }
};

const reverse = async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ success: false, message: 'lat and lon are required' });
    }

    if (!googlePlaces.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Address search is not configured. Set GOOGLE_API_KEY on the server.',
      });
    }

    const result = await googlePlaces.reverseGeocode(lat, lon);
    return res.json({ success: true, result, provider: 'google' });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: error.message || 'Reverse geocode failed',
    });
  }
};

module.exports = { suggest, resolvePlace, reverse };
