export function shouldShowArtisanActivityLoadError(
  offersLoaded: boolean,
  missionLoaded: boolean,
) {
  return !offersLoaded && !missionLoaded;
}
