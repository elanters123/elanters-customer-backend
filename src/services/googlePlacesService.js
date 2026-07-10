/**
 * Google Places Autocomplete + Place Details + Geocoding (server-side only).
 * Requires GOOGLE_API_KEY with Places API + Geocoding API enabled.
 */

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
/** Prefer English address labels (avoids Hindi/local script in India). */
const GOOGLE_LANGUAGE = 'en';

function isConfigured() {
  return Boolean(GOOGLE_API_KEY.trim());
}

function hashPlaceId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickComponent(components, ...types) {
  for (const type of types) {
    const hit = components.find((c) => c.types && c.types.includes(type));
    if (hit?.long_name) return hit.long_name;
  }
  return '';
}

function mapAddressComponents(components = []) {
  const pinRaw = pickComponent(components, 'postal_code');
  const pincode = pinRaw.replace(/\D/g, '').slice(0, 6);
  return {
    city:
      pickComponent(components, 'locality', 'administrative_area_level_2', 'sublocality_level_1') ||
      pickComponent(components, 'sublocality', 'neighborhood'),
    state: pickComponent(components, 'administrative_area_level_1'),
    pincode: pincode.length === 6 ? pincode : '',
    sublocality: pickComponent(components, 'sublocality_level_1', 'sublocality', 'neighborhood'),
    route: pickComponent(components, 'route'),
    premise: pickComponent(components, 'premise', 'subpremise', 'establishment'),
  };
}

function toSuggestion({
  googlePlaceId,
  label,
  line1,
  line2,
  city,
  state,
  pincode,
  latitude,
  longitude,
}) {
  return {
    placeId: hashPlaceId(googlePlaceId),
    googlePlaceId,
    label,
    addressLine: label,
    line1: line1 || '',
    line2: line2 || '',
    city: city || '',
    state: state || '',
    pincode: pincode || '',
    latitude: latitude ?? 0,
    longitude: longitude ?? 0,
  };
}

async function googleGet(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('upstream');
  return r.json();
}

function withCityBias(query, biasCity) {
  const q = String(query || '').trim();
  const city = String(biasCity || '').trim();
  if (!city || q.toLowerCase().includes(city.toLowerCase())) return q;
  return `${q}, ${city}`;
}

async function autocomplete(query, biasCity) {
  if (!isConfigured()) return null;

  const input = withCityBias(query, biasCity);
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', input);
  url.searchParams.set('components', 'country:in');
  url.searchParams.set('language', GOOGLE_LANGUAGE);
  url.searchParams.set('key', GOOGLE_API_KEY);

  const data = await googleGet(url.toString());
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.status || 'google_error');
  }

  return (data.predictions || []).map((p) =>
    toSuggestion({
      googlePlaceId: p.place_id,
      label: p.description,
      line1: p.structured_formatting?.main_text || p.description,
      line2: p.structured_formatting?.secondary_text || '',
      city: '',
      state: '',
      pincode: '',
      latitude: 0,
      longitude: 0,
    }),
  );
}

async function placeDetails(googlePlaceId) {
  if (!isConfigured()) return null;
  if (!googlePlaceId) throw new Error('missing_place_id');

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', googlePlaceId);
  url.searchParams.set(
    'fields',
    'place_id,geometry,address_components,formatted_address,name',
  );
  url.searchParams.set('language', GOOGLE_LANGUAGE);
  url.searchParams.set('key', GOOGLE_API_KEY);

  const data = await googleGet(url.toString());
  if (data.status !== 'OK' || !data.result) {
    throw new Error(data.status || 'google_error');
  }

  const r = data.result;
  const parts = mapAddressComponents(r.address_components);
  const line1 = [r.name, parts.premise, parts.route, parts.sublocality]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ') || r.name || '';

  return toSuggestion({
    googlePlaceId: r.place_id,
    label: r.formatted_address || r.name,
    line1,
    line2: parts.route && line1 !== parts.route ? parts.route : '',
    city: parts.city,
    state: parts.state,
    pincode: parts.pincode,
    latitude: r.geometry?.location?.lat,
    longitude: r.geometry?.location?.lng,
  });
}

async function reverseGeocode(lat, lon) {
  if (!isConfigured()) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lon}`);
  url.searchParams.set('language', GOOGLE_LANGUAGE);
  url.searchParams.set('key', GOOGLE_API_KEY);

  const data = await googleGet(url.toString());
  if (data.status !== 'OK' || !data.results?.length) {
    throw new Error(data.status || 'google_error');
  }

  const r = data.results[0];
  const parts = mapAddressComponents(r.address_components);
  const line1 =
    [parts.premise, parts.route, parts.sublocality].filter(Boolean).join(', ') ||
    r.formatted_address?.split(',')[0]?.trim() ||
    '';

  return toSuggestion({
    googlePlaceId: r.place_id,
    label: r.formatted_address,
    line1,
    line2: '',
    city: parts.city,
    state: parts.state,
    pincode: parts.pincode,
    latitude: lat,
    longitude: lon,
  });
}

module.exports = {
  isConfigured,
  autocomplete,
  placeDetails,
  reverseGeocode,
};
