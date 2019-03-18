// Serves up a JSON API that has access to the session cookies under /~

AppsApi = class AppsApi {
  constructor(kernel, domain, {workerSource}) {
    const {accountManager, sessionManager} = kernel;

    if (!domain)
      throw new Error(`AppsApi requires a domain`);
    if (!accountManager)
      throw new Error(`AppsApi requires an account manager`);
    if (!sessionManager)
      throw new Error(`AppsApi requires a session manager`);

    this.domain = domain;
    this.kernel = kernel;
    this.workerSource = workerSource;
  }

  async getEntry(path) {
    const fragment = PathFragment.parse(path);
    var match;
    switch (true) {

      // api for the vue sdk (and other in-browser sdks)
      case fragment.startsWith('/~~'):
        if (fragment.count() !== 2)
          return null;

        switch (fragment.lastName()) {

          case 'list accounts':
            return new AppsApiListAccounts(this);

          case 'start app session':
            return new AppsApiStartAppSession(this);

          default:
            return null;
        }

      case fragment.equals('/sw.js'):
        // serviceworkers can only fuck with things in the same subfolder
        // so we have to serve it up here
        return this.workerSource.getEntry('');

      // application bundle downloads
      case (match = fragment.matchWith('/:app.zip')).ok:
        return new AppsApiDownloadBundle(this, match);

      default:
        // install the serviceworker that makes the real content
        // serviceworkers can only fuck with things in the same subfolder
        // for now the sw.js gets overlaid at a higher level
        return new AppsApiServiceWorker();
    }
  }
}

// Created from a user request
// Parses cookies and such
// What more could you want?
class AppsApiRequest {
  constructor(site, request) {
    this.site = site;
    this.req = JSON.parse(request.StringValue);

    this.allCookies = new Map;
    this.acctCookies = new Map;
    const acctPrefix = 'stardust:acct:';
    if ('cookie' in this.req.headers) {
      this.req.headers.cookie.split(';')
        .map(s => s.trim().split('='))
        .filter(([k,v]) => {
          this.allCookies.set(k, v);
          return k.startsWith(acctPrefix);
        })
        .forEach(([k,v]) => this.acctCookies.set(k.slice(acctPrefix.length), v));
    }
  }

  async getSessionFor(aid) {
    if (this.acctCookies.has(aid)) {
      const sessId = this.acctCookies.entries().next().value;
      return await this.site.sessionManager.getById(sessId);
    }
    throw new Error(`aid not listed in cookies: ${aid}`);
  }
}

function parseAppReferer(referer) {
  const parts = referer.split('/').slice(3);
  if (parts[0] === '~') {
    const appParts = parts.slice(2); // TODO: assumes we are at /~/apps
    const hasUsername = appParts[0].startsWith('~');
    const username = hasUsername ? appParts.shift().slice(1) : null;
    const appKey = appParts[0];
    return {username, appKey};
  } else {
    const parts = referer.split('/~')[1].split('/');
    const username = parts[0];
    const appKey = parts[1];
    return {username, appKey};
  }
}

class AppsApiListAccounts {
  constructor(site) {
    this.site = site;
  }

  async invoke(input) {
    const state = await new AppsApiRequest(this.site, input);
    console.log(state);
    const aids = Array.from(state.acctCookies.keys());
    const result = {
      accounts: await Promise.all(aids.map(async aid => {
        try {
          const account = await this.site.kernel.accountManager.getById(aid);
          return {
            aid,
            username: account.record.username,
            domain: account.record.domain,
            apps: Object.keys(account.record.apps).map(appKey => {
              const app = account.record.apps[appKey];
              return {
                appKey,
                pid: app.pid,
              }
            }),
          };
        } catch (err) {
          console.warn('failed to list account', aid, err);
          return {
            aid,
            error: err.message,
          };
        }
      })),
    };
    const json = JSON.stringify(result, null, 2);
    return BlobLiteral.fromString(json, 'application/json');
  }
}

class AppsApiStartAppSession {
  constructor(site) {
    this.site = site;
  }

  async invoke(input) {
    const state = await new AppsApiRequest(this.site, input).loadState();
    if (!state.session) {
      throw new Error(`user is not logged in`);
    }
    if (state.req.method !== 'POST') {
      throw new Error(`must be a POST`);
    }

    const {referer} = state.req.headers;
    const {username, appKey} = parseAppReferer(referer);
    if (!appKey) {
      throw new Error('app-session needs an appKey (did you block Referer?)');
    }

    const domain = await this.site.domainManager.getDomain(this.site.domainId);
    const {account} = state.session;
    const session = await this.site.sessionManager.create(account, {
      lifetime: 'short',
      volatile: true,
      client: 'gate app-session - for '+referer,
      appKey: appKey,
    });

    const result = {
      metadata: {
        chartName: account.record.username,
        homeDomain: domain.record.primaryFqdn,
        ownerName: account.record.contact.name,
        ownerEmail: account.record.contact.email,
      },
      sessionPath: '/pub/sessions/' + session.record.sid + '/mnt',
    };
    const json = JSON.stringify(result, null, 2);
    return BlobLiteral.fromString(json, 'application/json');
  }
}

class AppsApiServiceWorker {
  async get() {
    return wrapGatePage('webapp bootstrapper', commonTags.html`
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async function() {
    try {
      const registration = await navigator.serviceWorker.register('/~/apps/sw.js');
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    } catch (err) {
      console.log(err);
      alert('failed to install serviceWorker');
    }
  });
} else alert('ServiceWorkers are required');
</script>
`);
  }
}

class AppsApiDownloadBundle {
  constructor(site, match) {
    this.site = site;
    this.appName = match.params.get('name');
  }

  async invoke(input) {
    const state = await new AppsApiRequest(this.site, input);
    console.log(state);
    if (!state.session) {
      throw new Error(`user is not logged in`);
    }
    if (state.req.method !== 'POST') {
      throw new Error(`must be a POST`);
    }
    return BlobLiteral.fromString('{}', 'application/json');
  }
}
