/**
 * DOOM episode 1 progression and metadata. No WAD/media dependency.
 * Geometry lives in the separate, offline-exported per-level plan modules.
 */
export const EPISODE_1 = Object.freeze([
  Object.freeze({id:'E1M1',title:'Hangar',next:'E1M2'}),
  Object.freeze({id:'E1M2',title:'Nuclear Plant',next:'E1M3'}),
  Object.freeze({id:'E1M3',title:'Toxin Refinery',next:'E1M4',secretNext:'E1M9'}),
  Object.freeze({id:'E1M4',title:'Command Control',next:'E1M5'}),
  Object.freeze({id:'E1M5',title:'Phobos Lab',next:'E1M6'}),
  Object.freeze({id:'E1M6',title:'Central Processing',next:'E1M7'}),
  Object.freeze({id:'E1M7',title:'Computer Station',next:'E1M8'}),
  Object.freeze({id:'E1M8',title:'Phobos Anomaly',next:null}),
  Object.freeze({id:'E1M9',title:'Military Base',next:'E1M4',secret:true})
]);
const INDEX = new Map(EPISODE_1.map(level=>[level.id,level]));
export function episodeLevel(id){
  const level=INDEX.get(id);
  if(!level)throw new RangeError('Unknown episode 1 level: '+id);
  return level;
}
export function episodeNext(id,{secret=false}={}){
  const current=episodeLevel(id);
  return secret && current.secretNext ? current.secretNext : current.next;
}
export function episodeTitle(id){
  const level=episodeLevel(id);
  return level.id+' · '+level.title.toUpperCase();
}
/** Build only exposes plans generated offline; never create a fake map. */
export function episodeAvailable(planRegistry){
  return EPISODE_1.filter(level=>Object.hasOwn(planRegistry,level.id));
}
