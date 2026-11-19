/** Two years: the HSTS lifetime both apps send, since they share one origin. */
export const HSTS_MAX_AGE_SECONDS = 63_072_000;

/** Denies every browser feature the app does not use (§8.6). */
export const PERMISSIONS_POLICY = [
  'accelerometer',
  'autoplay',
  'browsing-topics',
  'camera',
  'display-capture',
  'geolocation',
  'gyroscope',
  'hid',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'serial',
  'usb',
  'xr-spatial-tracking',
]
  .map((feature) => `${feature}=()`)
  .join(', ');
