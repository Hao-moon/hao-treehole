// Angles are calibrated against the shipped GLB's tonearm pivot and stylus.
// They place the needle at radii .132 m and .060 m on the .139 m record.
const OUTER_ANGLE=-.26221,INNER_ANGLE=-.60163;
const clamp=value=>Math.max(0,Math.min(1,value));

export function tonearmAngle(state={}) {
  if(!state.current)return 0;
  const progress=Number.isFinite(state.duration)&&state.duration>0&&Number.isFinite(state.time)
    ?clamp(state.time/state.duration):0;
  // A pause stops the platter, but does not move the needle away from the song.
  return OUTER_ANGLE+(INNER_ANGLE-OUTER_ANGLE)*progress;
}

export function sliderPosition(volume) {
  // Unknown volume uses the player's initial full-volume setting.
  return .105-clamp(Number.isFinite(volume)?volume:1)*.12;
}
