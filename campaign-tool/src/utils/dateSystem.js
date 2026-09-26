/**
 * Campaign Date System
 * 
 * Manages the campaign timeline from April 1861 to December 1865
 * Each turn advances by 2 months (6 turns per year)
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Month constants for easy reference
 */
export const MONTHS = {
  JANUARY: 1,
  FEBRUARY: 2,
  MARCH: 3,
  APRIL: 4,
  MAY: 5,
  JUNE: 6,
  JULY: 7,
  AUGUST: 8,
  SEPTEMBER: 9,
  OCTOBER: 10,
  NOVEMBER: 11,
  DECEMBER: 12
};

/**
 * Month names for display
 */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Default campaign settings
 */
export const CAMPAIGN_START_MONTH = MONTHS.APRIL;
export const CAMPAIGN_START_YEAR = 1861;
export const CAMPAIGN_END_MONTH = MONTHS.DECEMBER;
export const CAMPAIGN_END_YEAR = 1865;
export const TURNS_PER_YEAR = 6;
export const MONTHS_PER_TURN = 2;

// ============================================================================
// DATE CREATION AND MANIPULATION
// ============================================================================

/**
 * Create a campaign date object
 * 
 * @param {number} month - Month (1-12)
 * @param {number} year - Year (1861-1865)
 * @param {number} [turn] - Optional turn number (will be calculated if not provided)
 * @returns {Object} Campaign date object
 */
export function createCampaignDate(month, year, turn = null) {
  // Validate inputs
  if (typeof month !== 'number' || month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be between 1 and 12.`);
  }
  
  if (typeof year !== 'number' || year < 1861 || year > 1865) {
    throw new Error(`Invalid year: ${year}. Must be between 1861 and 1865.`);
  }
  
  // Calculate turn number if not provided
  const turnNumber = turn !== null ? turn : calculateTurnNumber(month, year);
  
  return {
    month,
    year,
    turn: turnNumber,
    displayString: formatCampaignDate({ month, year })
  };
}

/**
 * Advance campaign date by one turn (2 months by default)
 * 
 * @param {Object} currentDate - Current campaign date
 * @param {number} currentDate.month - Current month (1-12)
 * @param {number} currentDate.year - Current year
 * @param {number} currentDate.turn - Current turn number
 * @param {number} [monthsPerTurn=2] - Months to advance per turn
 * @returns {Object} New campaign date
 */
export function advanceTurn(currentDate, monthsPerTurn = MONTHS_PER_TURN) {
  if (!currentDate) {
    throw new Error('Current date is required');
  }
  
  const { month, year, turn } = currentDate;
  
  // Calculate new month and year
  let newMonth = month + monthsPerTurn;
  let newYear = year;
  
  // Handle year rollover
  while (newMonth > 12) {
    newMonth -= 12;
    newYear++;
  }
  
  // Create new date object
  return createCampaignDate(newMonth, newYear, turn + 1);
}

/**
 * Format campaign date as a display string
 * 
 * @param {Object} date - Campaign date object
 * @param {number} date.month - Month (1-12)
 * @param {number} date.year - Year
 * @returns {string} Formatted date string (e.g., "April 1861")
 */
export function formatCampaignDate(date) {
  if (!date) {
    throw new Error('Date is required');
  }
  
  const { month, year } = date;
  
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  
  const monthName = MONTH_NAMES[month - 1];
  return `${monthName} ${year}`;
}

/**
 * Check if campaign has reached or passed the end date
 * 
 * @param {Object} date - Campaign date to check
 * @param {number} date.month - Month (1-12)
 * @param {number} date.year - Year
 * @param {Object} [endDate] - Optional custom end date (defaults to December 1865)
 * @returns {boolean} True if campaign is over
 */
export function isCampaignOver(date, endDate = null) {
  if (!date) {
    throw new Error('Date is required');
  }
  
  const { month, year } = date;
  const endMonth = endDate ? endDate.month : CAMPAIGN_END_MONTH;
  const endYear = endDate ? endDate.year : CAMPAIGN_END_YEAR;
  
  // Check if we've passed the end year
  if (year > endYear) {
    return true;
  }
  
  // Check if we're in the end year and at or past the end month
  if (year === endYear && month >= endMonth) {
    return true;
  }
  
  return false;
}

/**
 * Calculate turn number from a given date
 * Assumes campaign starts in April 1861 (turn 1)
 * 
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @param {number} [monthsPerTurn=2] - Months per turn
 * @returns {number} Turn number
 */
export function getTurnNumber(month, year, monthsPerTurn = MONTHS_PER_TURN) {
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  
  if (year < CAMPAIGN_START_YEAR) {
    throw new Error(`Year ${year} is before campaign start (${CAMPAIGN_START_YEAR})`);
  }
  
  return calculateTurnNumber(month, year, monthsPerTurn);
}

/**
 * Internal function to calculate turn number
 * 
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @param {number} [monthsPerTurn=2] - Months per turn
 * @returns {number} Turn number
 */
function calculateTurnNumber(month, year, monthsPerTurn = MONTHS_PER_TURN) {
  // Calculate total months since campaign start
  const yearsSinceStart = year - CAMPAIGN_START_YEAR;
  const monthsSinceStart = (yearsSinceStart * 12) + (month - CAMPAIGN_START_MONTH);
  
  // Calculate turn number (1-based)
  const turnNumber = Math.floor(monthsSinceStart / monthsPerTurn) + 1;
  
  return Math.max(1, turnNumber);
}

/**
 * Compare two campaign dates
 * 
 * @param {Object} date1 - First date
 * @param {Object} date2 - Second date
 * @returns {number} -1 if date1 < date2, 0 if equal, 1 if date1 > date2
 */
export function compareDates(date1, date2) {
  if (!date1 || !date2) {
    throw new Error('Both dates are required');
  }
  
  if (date1.year < date2.year) return -1;
  if (date1.year > date2.year) return 1;
  
  if (date1.month < date2.month) return -1;
  if (date1.month > date2.month) return 1;
  
  return 0;
}

/**
 * Check if a date is within the campaign period
 * 
 * @param {Object} date - Date to check
 * @param {Object} [startDate] - Optional custom start date
 * @param {Object} [endDate] - Optional custom end date
 * @returns {boolean} True if date is within campaign period
 */
export function isDateInCampaign(date, startDate = null, endDate = null) {
  if (!date) {
    throw new Error('Date is required');
  }
  
  const start = startDate || createCampaignDate(CAMPAIGN_START_MONTH, CAMPAIGN_START_YEAR);
  const end = endDate || createCampaignDate(CAMPAIGN_END_MONTH, CAMPAIGN_END_YEAR);
  
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0;
}

/**
 * Get the default campaign start date
 * 
 * @returns {Object} Campaign date object for April 1861
 */
export function getDefaultStartDate() {
  return createCampaignDate(CAMPAIGN_START_MONTH, CAMPAIGN_START_YEAR, 1);
}

/**
 * Get the default campaign end date
 * 
 * @returns {Object} Campaign date object for December 1865
 */
export function getDefaultEndDate() {
  return createCampaignDate(CAMPAIGN_END_MONTH, CAMPAIGN_END_YEAR);
}

/**
 * Calculate the number of turns between two dates
 * 
 * @param {Object} startDate - Starting date
 * @param {Object} endDate - Ending date
 * @param {number} [monthsPerTurn=2] - Months per turn
 * @returns {number} Number of turns between dates
 */
export function getTurnsBetween(startDate, endDate, monthsPerTurn = MONTHS_PER_TURN) {
  if (!startDate || !endDate) {
    throw new Error('Both dates are required');
  }
  
  const startTurn = getTurnNumber(startDate.month, startDate.year, monthsPerTurn);
  const endTurn = getTurnNumber(endDate.month, endDate.year, monthsPerTurn);
  
  return Math.abs(endTurn - startTurn);
}

/**
 * Get month name from month number
 * 
 * @param {number} month - Month number (1-12)
 * @returns {string} Month name
 */
export function getMonthName(month) {
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  
  return MONTH_NAMES[month - 1];
}
/**
 * The season a month falls in, for the weather over the board.
 *
 * @param {number} month - Month number (1-12)
 * @returns {'winter'|'spring'|'summer'|'autumn'|null}
 */
export function getSeason(month) {
  if (!month) return null;
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

/** The season to draw over a campaign's board, or null when that is switched off. */
export const getBoardSeason = (campaign) =>
  campaign?.settings?.seasonalWeather === false ? null : getSeason(campaign?.campaignDate?.month);
