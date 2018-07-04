chrome.management.getSelf(self => {
  const versionEl = document.querySelector('#app-version');
  versionEl.innerText = `${self.shortName} v${self.version}`;
});

const historyCol = document.querySelector('#history-col');
function addEntry (action) {

  const title = document.createElement('h4');
  const progress = document.createElement('progress');
  const output = document.createElement('textarea');
  output.readOnly = true;
  output.rows = 1;
  const time = document.createElement('time');

  const box = document.createElement('section');
  box.classList.add('entry');
  box.appendChild(title);
  historyCol.insertBefore(box, historyCol.children[0]);

  let boxState = 'init';
  let progressTimer = false;
  const startProgressTimer = () =>
    progressTimer = setTimeout(() => {
      if (boxState === 'init') {
        box.appendChild(progress);
        boxState = 'progress';
      }
    }, 50);

  const finalizeBox = () => {
    if (boxState === 'progress')
      box.removeChild(progress);
    else if (progressTimer !== false)
      clearTimeout(progressTimer);
    boxState = 'final';

    box.appendChild(output);
    box.appendChild(time);
    setTimeout(() => {
      output.style.height = output.scrollHeight+'px';
    }, 0);
  }

  let actions = null;
  return {
    title(text) { title.innerText = text; },
    action(title, cb) {
      if (!actions) {
        actions = document.createElement('ul');
        actions.classList.add('actions');
        box.appendChild(actions);
      }

      const action = document.createElement('button');
      action.addEventListener('click', evt => {
        box.removeChild(actions);
        cb(evt);
      });
      action.innerText = title;

      const li = document.createElement('li');
      li.appendChild(action);
      actions.appendChild(li);
    },
    promise(p) {
      startProgressTimer();
      p.then(text => {
        output.value = text.trim();
        finalizeBox();
      }, err => {
        output.classList.add('error-msg');
        output.value = (err.constructor === String) ? err :
            (err.message || JSON.stringify(err, null, 2));
        finalizeBox();
      });
    },
  };
};

const inputName = document.querySelector('#input-name');
const inputUrl = document.querySelector('#input-url');

function callAsPromise(func, ...args) {
  return new Promise((resolve, reject) => {
    args.push(resolve);
    func.apply(null, args);
  })
}

function doAction (action) {
  var entry = addEntry(action.query);

  switch (action.query) {

    case 'clear-console':
      entry.title('clearing console...');
      entry.promise(new Promise(resolve => {
        setTimeout(() => {
          resolve('ok');
          setTimeout(() => {
            const historyCol = document.querySelector('#history-col');
            Array.from(document.querySelectorAll('.entry')).forEach(entry => {
              historyCol.removeChild(entry);
            });
          }, 1);
        }, 1000);
      }));
      break;

    case 'persist':
      entry.title('set data persistence');
      entry.promise(navigator.storage.persist().then(x => {
        if (!x) throw new Error(`Data persistence request was rejected`);
        return `Data persistence is now enabled`;
      }));
      break;
    case 'persisted':
      entry.title('query data persistence');
      entry.promise(navigator.storage.persisted().then(x =>
        `Data persistence is currently ${x ? 'enabled' : 'disabled'}`));
      break;

    case 'update':
      entry.title('update check');
      entry.promise(new Promise((resolve, reject) => {
        chrome.runtime.requestUpdateCheck(status => resolve(status));
      }));
      break;

    case 'restart':
      entry.promise(new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(`Failed somehow...`);
        }, 6000);
        chrome.runtime.restartAfterDelay(5);
      }));
      entry.title('restarting system in 5 seconds');
      break;

    case 'cpu':
      entry.title('CPU information');
      entry.promise(callAsPromise(chrome.system.cpu.getInfo)
          .then(info => JSON.stringify(info, null, 2)));
      break;
    case 'storage':
      entry.title('storage device status');
      entry.promise(callAsPromise(chrome.system.storage.getInfo)
          .then(info => JSON.stringify(info, null, 2)));
      break;
    case 'memory':
      entry.title('memory usage');
      entry.promise(callAsPromise(chrome.system.memory.getInfo)
          .then(info => JSON.stringify(info, null, 2)));
      break;
    case 'display':
      entry.title('detected displays');
      entry.promise(callAsPromise(chrome.system.display.getInfo)
          .then(info => JSON.stringify(info, null, 2)));
      break;
    case 'battery':
      entry.title('battery status');
      entry.promise(navigator.getBattery()
          .then(info => JSON.stringify({
            charging: info.charging,
            chargingTime: info.chargingTime,
            dischargingTime: info.dischargingTime,
            level: info.level,
          }, null, 2)));
      break;
    case 'network':
      entry.title('network interfaces');
      entry.promise(callAsPromise(chrome.system.network.getNetworkInterfaces)
          .then(info => {
            return JSON.stringify(info, null, 2);
          }));
      break;
/*
      <button data-query="cpu">CPU usage</button>
      <button data-query="storage">Storage usage</button>
      <button data-query="memory">Memory usage</button>
      <button data-query="display">Display surfaces</button>
      <button data-query="battery">Battery level</button>
      <button data-query="network">Network interfaces</button>
*/
/*
    case 'attr':
      var hostname = 'da.gd';
      var title = 'attribute query: '+action.path;
      if (action.proto) {
        hostname = action.proto + '.' + hostname;
        title += ` (using IPv${action.proto})`;
      }

      entry.title(title);
      entry.promise(
        fetch('https://'+hostname+action.path)
        .then(x => x.text()));
      break;

    case 'name':
      let name;
      try {
        name = cleanName(inputName.value);
      } catch (err) {
        return entry.promise(Promise.reject(err));
      }

      entry.title('name query: '+action.path+'/'+name);
      if (name) {
        entry.promise(
          fetch('https://da.gd'+action.path+'/'+name)
          .then(x => x.text()));
      } else {
        entry.promise(
          Promise.reject(new Error('Name is required')));
        inputName.focus();
      }
      break;

    case 'url':
      const url = inputUrl.value;
      entry.title('url query: '+action.path+'/'+url);
      if (url) {
        entry.promise(
          fetch('https://da.gd'+action.path+'/'+url)
          .then(x => x.text()));
      } else {
        entry.promise(
          Promise.reject(new Error('URL is required')));
        inputUrl.focus();
      }
      break;
*/
    default:
      entry.title('action: '+JSON.stringify(action));
      entry.promise(
        Promise.reject(new Error('Unknown client action')));
      break;
  }
}

document.addEventListener("click", event => {
  var element = event.target;
  while (element) {
    if (element.nodeName === 'BUTTON' && 'query' in element.dataset) {
      return doAction(element.dataset);
    }
    element = element.parentNode;
  }
}, false);

chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  if (sender.id !== chrome.runtime.id) {
    console.warn('Dropping message from other source', sender);
    return;
  }
  if (!sender.url.endsWith('background_page.html')) {
    return; // ignore messages not from the background
  }

  switch (msg.type) {
    case 'select-folder':
      // prompt the user to start selection
      const entry = addEntry('select-folder');
      entry.title('select folder: '+msg.prompt);
      entry.action('choose read/write directory', () => {
        // get the entry as a promise
        const promise = new Promise((resolve, reject) => {
          chrome.fileSystem.chooseEntry({type: 'openDirectory'}, entry => {
            if (chrome.runtime.lastError)
              reject(chrome.runtime.lastError);
            else
              resolve(entry);
          });
        }).then(fEntry => {
          return chrome.fileSystem.retainEntry(fEntry);
        });
        entry.promise(promise.then(id =>
          `Selected and retained folder entry ${id} :)`));

        // send the result back
        promise.then(id => {
          reply({ok: true, id});
        }, err => {
          reply({ok: false, error: err});
        });
      });
      // bring to front
      chrome.app.window.current().focus();
      return true;
  }
});