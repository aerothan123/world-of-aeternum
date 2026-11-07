// i18n source catalog: the add-on platform's own chrome (the Addons window, the
// Esc menu row, publish results). English only; the locale fills live in the
// src/ui/i18n.locales overlays. Text an ADD-ON draws is the author's content
// and never comes from here. Merged into `hudChrome.addons` by ./hud_chrome.ts.

export const addonStrings = {
  menuEntry: 'AddOns',
  title: 'AddOns',
  close: 'Close',
  masterToggle: 'Load add-ons',
  loadOutdated: 'Load out of date add-ons',
  masterHint: 'Changes take effect when you reload the interface.',
  reloadNeeded: 'Reload UI to apply this change.',
  leaveSafe: 'Load add-ons now',
  safeCrash:
    'The game closed unexpectedly while add-ons were starting, so this session started in safe mode with no add-ons.',
  safeRequested: 'You restarted in safe mode, so no add-ons are loaded.',
  safeUrl: 'Safe mode was requested at launch, so no add-ons are loaded.',
  workshopUnavailable:
    'Steam Workshop is not available right now, so only add-ons in your local folder are listed.',
  empty:
    'No add-ons installed. Subscribe to some on the Steam Workshop, or put an add-on folder in your add-ons folder.',
  reload: 'Reload UI',
  openFolder: 'Open add-ons folder',
  restartSafe: 'Restart in safe mode',
  memoryNote:
    'Memory is shown as interface widgets and saved data, because add-on workers do not report their heap size.',
  enable: 'Enable {name}',
  version: 'Version {version}',
  by: 'by {author}',
  permissions: 'Permissions',
  options: 'Options',
  showErrors: 'Errors ({count})',
  resetSaved: 'Reset saved data',
  resetDone: 'Saved data cleared for {name}.',
  publish: 'Publish to Workshop',
  stats: 'CPU {cpu} ms/s, {msgs} messages/s, {widgets} widgets, saved {kb} KB, {errors} errors',
  optionsTitle: '{name} options',
  back: 'Back',
  publishTitle: 'Publish {name}',
  publishHint:
    'Uploads this folder to the Steam Workshop. The first upload creates the item; later uploads update it.',
  changeNote: 'Change note',
  publishConfirm: 'Publish',
  publishing: 'Publishing to the Workshop...',
  visibility: {
    label: 'Visibility',
    private: 'Private',
    friends: 'Friends only',
    unlisted: 'Unlisted',
    public: 'Public',
  },
  publishResult: {
    published: 'Published to the Workshop as item {id}.',
    agreement:
      'Uploaded as item {id}. Accept the Steam Workshop legal agreement on the item page to make it visible.',
    noSteam: 'Steam is not running, so the add-on could not be published.',
    invalid: 'The add-on folder did not pass validation.',
    notFound: 'The add-on folder was not found.',
    failed: 'Publishing failed. The desktop log has the details.',
  },
  status: {
    disabled: 'Disabled',
    loading: 'Loading',
    running: 'Running',
    error: 'Load error',
    stopped: 'Stopped',
    blocked: 'Not loaded',
    tooNew: 'Needs a newer game version',
    outdated: 'Out of date',
    invalid: 'Invalid add-on',
  },
  stop: {
    errors: 'Stopped after repeated errors. Enable it again to retry.',
    hang: 'Stopped because it stopped responding. Enable it again to retry.',
    flood: 'Stopped because it sent too many interface updates. Enable it again to retry.',
    load: 'Failed to load.',
  },
  invalidJson: 'Its addon.json file is not valid JSON.',
  invalidField: 'Its addon.json file has a problem in "{field}".',
  blockedPending: 'Still downloading from the Workshop.',
  blockedDuplicate: 'Another add-on with the id {id} is already loaded.',
  blockedDependency: 'A required add-on is missing or not loading: {id}.',
  origin: {
    dev: 'Developer example',
    local: 'Local',
    workshop: 'Workshop',
  },
  perm: {
    party: 'Party and raid',
    combatLog: 'Combat log',
    chat: 'Reads your chat, whispers included',
    minimap: 'Minimap',
    inventory: 'Bags and equipment',
    quests: 'Quest log',
    secureActions: 'Action buttons',
  },
};
