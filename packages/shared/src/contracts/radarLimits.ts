// Kept apart from the Zod schemas so web code can import the limits without pulling Zod into first-load JS.
export const RADAR_WINDOWS = ['7d', '30d'] as const;
export const RADAR_METRICS = ['stories', 'engagement'] as const;
export const RADAR_TAGS_MAX = 5;
