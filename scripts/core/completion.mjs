import { MODULE_ID } from "./constants.mjs";

export function safeTrapComplete(callback, payload) {
  if (!(callback instanceof Function)) return;
  try { callback(payload); }
  catch (error) { console.warn(`${MODULE_ID} | Trap completion callback failed`, error); }
}
