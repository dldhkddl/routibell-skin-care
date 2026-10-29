export const STRATEGY = 'A';

export const RECOMMENDATION_SETTINGS = Object.freeze({
  changeMargin: 3,
  graduationRise: 8,
  graduationStreak: 1,
  nextAnalysisDays: [14, 28],
  bands: {
    redness: {attention: 58, good: 82},
    pore: {attention: 50, good: 78},
    texture: {attention: 58, good: 82},
    acne: {attention: 60, good: 85},
    moisture: {attention: 60, good: 82},
    oiliness: {attention: 58, good: 82},
    age_spot: {attention: 58, good: 82},
    radiance: {attention: 60, good: 82},
    wrinkle: {attention: 58, good: 82},
    firmness: {attention: 60, good: 82},
    dark_circle_v2: {attention: 55, good: 80},
    eye_bag: {attention: 55, good: 80},
    tear_trough: {attention: 55, good: 80},
    droopy_upper_eyelid: {attention: 55, good: 80},
    droopy_lower_eyelid: {attention: 55, good: 80},
  },
});
