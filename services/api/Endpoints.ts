export const ENDPOINTS = {
  HEALTH: "/api/v1/health",
  IPOS: "/api/v1/ipos",
  IPO_BY_SYMBOL: (symbol: string) => `/api/v1/ipos/${symbol}`,
  CALENDAR: "/api/v1/calendar",
  OPEN: "/api/v1/open",
  UPCOMING: "/api/v1/upcoming",
  CLOSED: "/api/v1/closed",
  ALLOTMENTS: "/api/v1/allotments",
  GMP: "/api/v1/gmp",
  SEARCH: "/api/v1/search",
  STATISTICS: "/api/v1/statistics",
  VERSION: "/api/v1/version",
} as const;
