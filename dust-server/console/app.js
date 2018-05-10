chrome.management.getSelf(self => {
  const versionEl = document.querySelector('#app-version');
  versionEl.innerText = `${self.shortName} v${self.version}`;
});