/**
 * Generated plan registry. Every entry was surveyed OFFLINE from the verified
 * shareware reference by tools/export-episode1-plans.mjs and passed its table
 * counts, so the game can offer the level. A missing entry means the level is
 * not playable and the menu must never advertise it.
 */
import {E1M1_PLAN} from './e1m1-plan.js';
import {E1M2_PLAN} from './e1m2-plan.js';
import {E1M3_PLAN} from './e1m3-plan.js';
import {E1M4_PLAN} from './e1m4-plan.js';
import {E1M5_PLAN} from './e1m5-plan.js';
import {E1M6_PLAN} from './e1m6-plan.js';
import {E1M7_PLAN} from './e1m7-plan.js';
import {E1M8_PLAN} from './e1m8-plan.js';
import {E1M9_PLAN} from './e1m9-plan.js';

export const EPISODE_PLANS = Object.freeze({
  E1M1: E1M1_PLAN,
  E1M2: E1M2_PLAN,
  E1M3: E1M3_PLAN,
  E1M4: E1M4_PLAN,
  E1M5: E1M5_PLAN,
  E1M6: E1M6_PLAN,
  E1M7: E1M7_PLAN,
  E1M8: E1M8_PLAN,
  E1M9: E1M9_PLAN
});

export default EPISODE_PLANS;
