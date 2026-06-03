// shared/data/countryStates.js
//
// Country → State/Province data for SmartBillr's worldwide dropdown system.
//
// HOW IT WORKS:
//   The StateDropdown component looks up the countryCode here.
//   If the country has state data → a dropdown is shown.
//   If the country is NOT listed here (or has an empty array) → a text input is shown.
//
// FORMAT:
//   { 'COUNTRY_CODE': [{ code: 'STATE_CODE', name: 'State Display Name' }, ...] }
//
// INDIA (IN):
//   States are critical for GST compliance —
//   same state = CGST + SGST (intrastate)
//   different states = IGST (interstate)
//   Use the EXACT official names as recognised by GST system.
//
// NOTE ON `code` FIELD:
//   The `code` is used as the React key and for state code lookups.
//   The `name` is what gets saved to the DB (cust_state / supp_state fields).

export const COUNTRY_STATES = {

  // ──────────────────────────────────────────────────────────────
  // INDIA — 28 States + 8 Union Territories (critical for GST)
  // ──────────────────────────────────────────────────────────────
  'IN': [
    // States
    { code: 'AP', name: 'Andhra Pradesh' },
    { code: 'AR', name: 'Arunachal Pradesh' },
    { code: 'AS', name: 'Assam' },
    { code: 'BR', name: 'Bihar' },
    { code: 'CG', name: 'Chhattisgarh' },
    { code: 'GA', name: 'Goa' },
    { code: 'GJ', name: 'Gujarat' },
    { code: 'HR', name: 'Haryana' },
    { code: 'HP', name: 'Himachal Pradesh' },
    { code: 'JH', name: 'Jharkhand' },
    { code: 'KA', name: 'Karnataka' },
    { code: 'KL', name: 'Kerala' },
    { code: 'MP', name: 'Madhya Pradesh' },
    { code: 'MH', name: 'Maharashtra' },
    { code: 'MN', name: 'Manipur' },
    { code: 'ML', name: 'Meghalaya' },
    { code: 'MZ', name: 'Mizoram' },
    { code: 'NL', name: 'Nagaland' },
    { code: 'OD', name: 'Odisha' },
    { code: 'PB', name: 'Punjab' },
    { code: 'RJ', name: 'Rajasthan' },
    { code: 'SK', name: 'Sikkim' },
    { code: 'TN', name: 'Tamil Nadu' },
    { code: 'TG', name: 'Telangana' },
    { code: 'TR', name: 'Tripura' },
    { code: 'UP', name: 'Uttar Pradesh' },
    { code: 'UK', name: 'Uttarakhand' },
    { code: 'WB', name: 'West Bengal' },
    // Union Territories
    { code: 'AN', name: 'Andaman and Nicobar Islands' },
    { code: 'CH', name: 'Chandigarh' },
    { code: 'DN', name: 'Dadra and Nagar Haveli and Daman and Diu' },
    { code: 'DL', name: 'Delhi (NCT)' },
    { code: 'JK', name: 'Jammu and Kashmir' },
    { code: 'LA', name: 'Ladakh' },
    { code: 'LD', name: 'Lakshadweep' },
    { code: 'PY', name: 'Puducherry' },
  ],

  // ──────────────────────────────────────────────────────────────
  // UNITED STATES — 50 States + District of Columbia
  // ──────────────────────────────────────────────────────────────
  'US': [
    { code: 'AL', name: 'Alabama' },
    { code: 'AK', name: 'Alaska' },
    { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' },
    { code: 'CA', name: 'California' },
    { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' },
    { code: 'DE', name: 'Delaware' },
    { code: 'DC', name: 'District of Columbia' },
    { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' },
    { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' },
    { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' },
    { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' },
    { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' },
    { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' },
    { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' },
    { code: 'WY', name: 'Wyoming' },
  ],

  // ──────────────────────────────────────────────────────────────
  // CANADA — 10 Provinces + 3 Territories
  // ──────────────────────────────────────────────────────────────
  'CA': [
    { code: 'AB', name: 'Alberta' },
    { code: 'BC', name: 'British Columbia' },
    { code: 'MB', name: 'Manitoba' },
    { code: 'NB', name: 'New Brunswick' },
    { code: 'NL', name: 'Newfoundland and Labrador' },
    { code: 'NT', name: 'Northwest Territories' },
    { code: 'NS', name: 'Nova Scotia' },
    { code: 'NU', name: 'Nunavut' },
    { code: 'ON', name: 'Ontario' },
    { code: 'PE', name: 'Prince Edward Island' },
    { code: 'QC', name: 'Quebec' },
    { code: 'SK', name: 'Saskatchewan' },
    { code: 'YT', name: 'Yukon' },
  ],

  // ──────────────────────────────────────────────────────────────
  // AUSTRALIA — 6 States + 2 Territories
  // ──────────────────────────────────────────────────────────────
  'AU': [
    { code: 'ACT', name: 'Australian Capital Territory' },
    { code: 'NSW', name: 'New South Wales' },
    { code: 'NT',  name: 'Northern Territory' },
    { code: 'QLD', name: 'Queensland' },
    { code: 'SA',  name: 'South Australia' },
    { code: 'TAS', name: 'Tasmania' },
    { code: 'VIC', name: 'Victoria' },
    { code: 'WA',  name: 'Western Australia' },
  ],

  // ──────────────────────────────────────────────────────────────
  // UNITED KINGDOM — 4 Nations
  // ──────────────────────────────────────────────────────────────
  'GB': [
    { code: 'ENG', name: 'England' },
    { code: 'SCT', name: 'Scotland' },
    { code: 'WLS', name: 'Wales' },
    { code: 'NIR', name: 'Northern Ireland' },
  ],

  // ──────────────────────────────────────────────────────────────
  // UNITED ARAB EMIRATES — 7 Emirates
  // ──────────────────────────────────────────────────────────────
  'AE': [
    { code: 'AZ', name: 'Abu Dhabi' },
    { code: 'AJ', name: 'Ajman' },
    { code: 'DU', name: 'Dubai' },
    { code: 'FU', name: 'Fujairah' },
    { code: 'RK', name: 'Ras Al Khaimah' },
    { code: 'SH', name: 'Sharjah' },
    { code: 'UQ', name: 'Umm Al Quwain' },
  ],

  // ──────────────────────────────────────────────────────────────
  // GERMANY — 16 Federal States (Bundesländer)
  // ──────────────────────────────────────────────────────────────
  'DE': [
    { code: 'BB', name: 'Brandenburg' },
    { code: 'BE', name: 'Berlin' },
    { code: 'BW', name: 'Baden-Württemberg' },
    { code: 'BY', name: 'Bavaria' },
    { code: 'HB', name: 'Bremen' },
    { code: 'HE', name: 'Hesse' },
    { code: 'HH', name: 'Hamburg' },
    { code: 'MV', name: 'Mecklenburg-Vorpommern' },
    { code: 'NI', name: 'Lower Saxony' },
    { code: 'NW', name: 'North Rhine-Westphalia' },
    { code: 'RP', name: 'Rhineland-Palatinate' },
    { code: 'SH', name: 'Schleswig-Holstein' },
    { code: 'SL', name: 'Saarland' },
    { code: 'SN', name: 'Saxony' },
    { code: 'ST', name: 'Saxony-Anhalt' },
    { code: 'TH', name: 'Thuringia' },
  ],

  // ──────────────────────────────────────────────────────────────
  // MALAYSIA — 13 States + 3 Federal Territories
  // ──────────────────────────────────────────────────────────────
  'MY': [
    { code: 'JHR', name: 'Johor' },
    { code: 'KDH', name: 'Kedah' },
    { code: 'KTN', name: 'Kelantan' },
    { code: 'KUL', name: 'Kuala Lumpur' },
    { code: 'LBN', name: 'Labuan' },
    { code: 'MLK', name: 'Melaka' },
    { code: 'NSN', name: 'Negeri Sembilan' },
    { code: 'PHG', name: 'Pahang' },
    { code: 'PNG', name: 'Penang' },
    { code: 'PRK', name: 'Perak' },
    { code: 'PLS', name: 'Perlis' },
    { code: 'PJY', name: 'Putrajaya' },
    { code: 'SBH', name: 'Sabah' },
    { code: 'SWK', name: 'Sarawak' },
    { code: 'SGR', name: 'Selangor' },
    { code: 'TRG', name: 'Terengganu' },
  ],

  // ──────────────────────────────────────────────────────────────
  // NEW ZEALAND — 16 Regions
  // ──────────────────────────────────────────────────────────────
  'NZ': [
    { code: 'AUK', name: 'Auckland' },
    { code: 'BOP', name: 'Bay of Plenty' },
    { code: 'CAN', name: 'Canterbury' },
    { code: 'GIS', name: 'Gisborne' },
    { code: 'HKB', name: "Hawke's Bay" },
    { code: 'MBH', name: 'Marlborough' },
    { code: 'MWT', name: 'Manawatu-Whanganui' },
    { code: 'NSN', name: 'Nelson' },
    { code: 'NTL', name: 'Northland' },
    { code: 'OTA', name: 'Otago' },
    { code: 'STL', name: 'Southland' },
    { code: 'TAS', name: 'Tasman' },
    { code: 'TKI', name: 'Taranaki' },
    { code: 'WGN', name: 'Wellington' },
    { code: 'WKO', name: 'Waikato' },
    { code: 'WTC', name: 'West Coast' },
  ],

  // ──────────────────────────────────────────────────────────────
  // SOUTH AFRICA — 9 Provinces
  // ──────────────────────────────────────────────────────────────
  'ZA': [
    { code: 'EC',  name: 'Eastern Cape' },
    { code: 'FS',  name: 'Free State' },
    { code: 'GP',  name: 'Gauteng' },
    { code: 'KZN', name: 'KwaZulu-Natal' },
    { code: 'LP',  name: 'Limpopo' },
    { code: 'MP',  name: 'Mpumalanga' },
    { code: 'NC',  name: 'Northern Cape' },
    { code: 'NW',  name: 'North West' },
    { code: 'WC',  name: 'Western Cape' },
  ],

  // ──────────────────────────────────────────────────────────────
  // SINGAPORE — City-state (no states; empty = text input shown)
  // ──────────────────────────────────────────────────────────────
  'SG': [],

  // ──────────────────────────────────────────────────────────────
  // Countries that commonly have no state distinction in billing:
  // Empty array = StateDropdown falls back to text input
  // ──────────────────────────────────────────────────────────────
  'JP': [],  // Japan — use text input (prefectures are too many for typical billing)
  'CN': [],  // China — use text input
  'FR': [],  // France — use text input
  'IT': [],  // Italy
  'ES': [],  // Spain
  'PT': [],  // Portugal
  'NL': [],  // Netherlands
  'BE': [],  // Belgium
  'CH': [],  // Switzerland
  'AT': [],  // Austria
  'SE': [],  // Sweden
  'NO': [],  // Norway
  'DK': [],  // Denmark
  'FI': [],  // Finland
  'PL': [],  // Poland
  'BR': [],  // Brazil (27 states — too many, use text)
  'MX': [],  // Mexico (32 states — use text)
  'NG': [],  // Nigeria
  'KE': [],  // Kenya
  'GH': [],  // Ghana
  'PK': [],  // Pakistan
  'BD': [],  // Bangladesh
  'LK': [],  // Sri Lanka
  'NP': [],  // Nepal
  'PH': [],  // Philippines
  'ID': [],  // Indonesia
  'TH': [],  // Thailand
  'VN': [],  // Vietnam
  'KR': [],  // South Korea
  'SA': [],  // Saudi Arabia
  'QA': [],  // Qatar
  'KW': [],  // Kuwait
  'BH': [],  // Bahrain
  'OM': [],  // Oman
};


/**
 * Helper: get states for a country code.
 * Returns an empty array if the country is not found or has no states.
 *
 * @param {string} countryCode - ISO 3166-1 alpha-2 code (e.g., 'IN', 'US')
 * @returns {Array<{code: string, name: string}>}
 */
export function getStatesForCountry(countryCode) {
  if (!countryCode) return [];
  return COUNTRY_STATES[countryCode.toUpperCase()] || [];
}


/**
 * Helper: check whether a country has a state dropdown.
 * Returns false if not in the list OR if the list is empty.
 *
 * @param {string} countryCode
 * @returns {boolean}
 */
export function hasStateDropdown(countryCode) {
  if (!countryCode) return false;
  const states = COUNTRY_STATES[countryCode.toUpperCase()];
  return Array.isArray(states) && states.length > 0;
}
