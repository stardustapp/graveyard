const Koa = require('koa');
const route = require('koa-route');
const bodyParser = require('koa-body');
const commonTags = require('common-tags');

// Serves up enough HTML to nicely direct users to the account page
exports.DoorwaySite = class DoorwaySite {
  constructor(domain) {
    if (!domain.fqdn) throw new Error(
      `GateSite requires a domain name`);
    this.domain = domain;

    this.koa = new Koa();

    // install serviceworkers that give real content
    // case parts[0] === 'apps':
    //   // serviceworkers can only fuck with things in the same subfolder
    //   // for now the sw.js gets overlaid at a higher level
    //   return new GateSiteServiceWorker();

    // accept form POSTs
    this.koa.use(bodyParser({
       multipart: false,
       urlencoded: true
    }));

    // check the cookie
    this.koa.use(this.checkCookie.bind(this));

    // dynamic entry points
    this.koa.use(route.get('/login', ctx => new GateSiteLogin(this).get(ctx)));
    this.koa.use(route.post('/login', ctx => new GateSiteLogin(this).invoke(ctx)));
    this.koa.use(route.get('/register', ctx => new GateSiteRegister(this).get(ctx)));
    this.koa.use(route.post('/register', ctx => new GateSiteRegister(this).invoke(ctx)));

    // dynamic gated pages
    this.koa.use(route.get('/home', ctx => new GateSiteHome(this).invoke(ctx)));
    this.koa.use(route.get('/profiles/:profile', ctx => new GateSiteProfile(this).invoke(ctx)));
    // this.koa.use(route.get('/ftue', ctx => new GateSiteFtue(this).get(ctx)));
    // this.koa.use(route.get('/add-domain', ctx => new GateSiteAddDomain(this).get(ctx)));
    // this.koa.use(route.get('/install-app', ctx => new GateSiteInstallApp(this).get(ctx)));
    // this.koa.use(route.get('/remove-app', ctx => new GateSiteRemoveApp(this).get(ctx)));
    // this.koa.use(route.get('/set-password', ctx => new GateSiteSetPassword(this).get(ctx)));
    this.koa.use(route.get('/logout', ctx => new GateSiteLogout(this).get(ctx)));
    this.koa.use(route.post('/logout', ctx => new GateSiteLogout(this).invoke(ctx)));

    // case parts.length === 2 && parts[0] === 'my-domains' && parts[1].length > 0:
    //   return new GateSiteManageDomain(this, parts[1]);

    // api for the vue sdk (and other in-browser sdks)
    this.koa.use(route.post('/app-session', ctx => new GateSiteAppSessionApi(this).get(ctx)));

    // extra pages/assets
    this.koa.use(route.get('/about', ctx => new GateSiteAbout(this).get(ctx)));
    this.koa.use(route.get('/style.css', ctx => new GateSiteStyle().get(ctx)));
  }

  async checkCookie(ctx, next) {
    const sessionCookie = ctx.cookies.get('DustSessionJwt');
    ctx.state.claims = null;
    if (!sessionCookie) return next();
    try {
      ctx.state.claims = await this.domain.adminApp.auth()
        .verifySessionCookie(sessionCookie, false /* checkRevoked */)
      //console.debug('have claims', ctx.state.claims)
    } catch (err) {
      console.warn('JWT check failed!', err.message);
      ctx.cookies.set('DustSessionJwt', '', {
        path: '/~/',
        maxAge: -10000,
        httpOnly: true,
      });
    }

    await next();
    if (ctx.state.claims) {
      const {uid} = ctx.state.claims;
      this.domain.markUserSeen(uid);
    }
  }
}

class GateSiteLogin {
  constructor(site) {
    this.site = site;
  }

  async get(ctx) {
    return sendGatePage(ctx, `login | ${this.site.domain.fqdn}`, commonTags.safeHtml`
      <form method="post" class="modal-form">
        <h1>login to <em>${this.site.domain.fqdn}</em></h1>
        <input type="hidden" name="domain" value="${this.site.domain.fqdn}">
        <input type="email" name="email" placeholder="external email" autocomplete="email" required autofocus>
        <input type="password" name="password" placeholder="password" autocomplete="current-password">
        <button type="submit">log in</button>
      </form>
      <div style="align-self: center;">
        <a href="register">or register a new account</a>
      </div>`);
  }

  async invoke(ctx) {
    ctx.response.body = 'hi'
    const {domain, email, password} = ctx.request.body;

    // look up the account
    const idToken = await this.site.domain.logInUser(email, password);

    // vend a new session
    const expiresIn = 60 * 60 * 24 *  5  * 1000;
    // const sessionCookie = await this.site.domain.adminApp.auth()
    //   .createCustomToken('kXJQ97sZBPaJg71ReIWLgvg7ZR33', {asdf:true});
    const sessionCookie = await this.site.domain.adminApp.auth()
      .createSessionCookie(idToken, {expiresIn});
    console.log('cookie', sessionCookie);
    ctx.cookies.set('DustSessionJwt', sessionCookie, {
      path: '/~/',
      maxAge: expiresIn,
      httpOnly: true,
      secure: false, // TODO
    });
    console.log(`User ${email} successfully logged in`);

    ctx.redirect('/~/home');
  }
}

class GateSiteRegister {
  constructor(site) {
    this.site = site;
  }

  async get(ctx, partialData={}) {
    if (!ctx.state.claims) {
      const idToken = await this.site.domain.createAnonUser();
      const {cookieVal, maxAge} = await this.site.domain.createCookie(idToken);
      ctx.state.claims = await this.domain.adminApp.auth()
        .verifySessionCookie(cookieVal)

      ctx.cookies.set('DustSessionJwt', cookieVal, {
        path: '/~/',
        maxAge,
        httpOnly: true,
        secure: false, // TODO
      });
    }
    const csrf = await this.site.domain
      .makeCSRF(ctx.state.claims.uid);

    return sendGatePage(ctx, `register | ${this.site.domain.fqdn}`, commonTags.safeHtml`
      <form method="post" class="modal-form">
        <h1>register new account</h1>
        <input type="hidden" name="csrf" value="${csrf}">
        <input type="hidden" name="fqdn" value="${this.site.domain.fqdn}">
        <div class="row">
          <label style="text-align: right; margin: 0 0 0 2em;" for="handle">${this.site.domain.fqdn}/~</label>
          <input style="text-align: left;" type="text" name="handle" value="${partialData.handle}" placeholder="username" autocomplete="username required" autofocus style="width: 12em; text-align: right;">
        </div>
        <input type="email" name="contactEmail" value="${partialData.contactEmail}" placeholder="your contact email (private)" autocomplete="email" required>
        <input type="text" name="displayName" value="${partialData.displayName}" placeholder="your 'real' name (shared)" autocomplete="name" required>
        <button type="submit">submit registration</button>
      </form>`);
  }

  async invoke(ctx) {
    const {uid} = ctx.state.claims;
    const {csrf, fqdn, handle, contactEmail, displayName} = ctx.request.body;
    await (async () => {
      await this.site.domain.checkCSRF(csrf, uid);
      return await this.site.domain
        .registerHandle({fqdn, handle, uid, contactEmail, displayName})
    })().then(profileId => {
      ctx.redirect(`/~/profiles/${profileId}`);
    }, err => {
      ctx.state.error = err;
      console.error('registration error', ctx.request.body);
      console.error(err.stack);
      return this.get(ctx, ctx.request.body);
    });
  }
}

class GateSiteAddDomain {
  constructor(site) {
    this.site = site;
  }

  renderForm(request) {
    if (!request.session) {
      return ctx.redirect('/~/login');
    }

    return sendGatePage(ctx, `add domain | ${this.site.domain.fqdn}`, commonTags.safeHtml`
      <form method="post" class="modal-form">
        <h1>add new domain</h1>
        <div class="row">
          <label for="owner" style="margin: 0 0 0 2em;">owner</label>
          <input type="text" name="owner" disabled value="${request.session.account.address()}"
              style="width: 12em;">
        </div>
        <input type="text" name="fqdn" placeholder="domain name (as in DNS)" required autofocus>
        <button type="submit">add domain to profile</button>
      </form>`);
  }

  get(ctx) {
    return this.renderForm(ctx);
  }
  async invoke(ctx) {
    console.log('add domain', ctx.request.body);
    const {fqdn} = ctx.request.body;
    if (!fqdn) {
      return this.renderForm(request);
    }

    const domain = await this.site.domainManager
        .registerDomain(fqdn, request.session.account);

    return ctx.redirect('/~/my-domains/'+domain.record.did);
  }
}

class GateSiteSetPassword {
  constructor(site) {
    this.site = site;
  }

  renderForm(ctx) {
    if (!ctx.state.claims) {
      return ctx.redirect('/~/login');
    }

    const rows = [commonTags.safeHtml`
      <div class="row">
        <label for="owner" style="margin: 0 0 0 2em; width: 5em;">account</label>
        <input type="text" name="owner" disabled value="${ctx.state.claims.email}"
            style="flex: 1;">
      </div>`
    ];
    //if (request.session.account.hasPassword()) {
      rows.push(commonTags.safeHtml`
        <div class="row">
          <label for="current" style="margin: 0 0 0 2em; width: 5em;">current</label>
          <input type="password" name="current" required autofocus style="flex: 1;">
        </div>`);
    //}
    rows.push(commonTags.safeHtml`
        <div class="row">
          <label for="desired" style="margin: 0 0 0 2em; width: 5em;">new</label>
          <input type="password" name="desired" required style="flex: 1;">
        </div>`);

    return sendGatePage(ctx, `set password | ${ctx.state.claims.email}`, commonTags.html`
      <form method="post" class="modal-form">
        <h1>set account password</h1>
        ${rows.join('\n')}
        <button type="submit">submit</button>
      </form>`);
  }

  get(ctx) {
    return this.renderForm(ctx);
  }
  async invoke(ctx) {
    if (!ctx.state.claims) {
      return ctx.redirect('/~/login');
    }

    const {current, desired} = ctx.request.body;
    if (!desired) {
      return this.renderForm(request);
    }

    if (request.session.account.hasPassword()) {
      await request.session.account.assertPassword(current);
    }

    await this.site.accountManager
        .setPassword(request.session.account, desired);
    return ctx.redirect('/~/home');
  }
}

class GateSiteManageDomain {
  constructor(site, domainId) {
    this.site = site;
    this.domainId = domainId;
  }

  async invoke(input) {
    const request = await new GateSiteRequest(this.site, input).loadState();
    if (!request.session) {
      return ctx.redirect('/~/login');
    }
    const domain = await this.site.domainManager.getDomain(this.domainId);
    if (!domain) {
      throw new Error(`Domain not found`);
    }
    const role = domain.highestRoleFor(request.session.account);
    if (role !== 'owner') {
      throw new Error(`Only domain owners can manage the domain`);
    }

    if (request.req.method === 'GET') {
      return sendGatePage(ctx, `manage domain`, commonTags.safeHtml`
        <section class="modal-form">
          <h1>domain: <em>${domain.record.primaryFqdn}</em></h1>
          <div style="text-align: left;">
            <p>Identity: ${domain.record.did}</p>
            <p>Status: ${domain.record.status}</p>
            <p>FQDNs: ${domain.record.fqdns}</p>
            <p>Grants: ${domain.record.grants.map(g => commonTags.safeHtml`${g.aid}=${g.role}`)}</p>
            <p>Web root: ${domain.record.webroot ? domain.record.webroot.type : 'none'}</p>
          </div>
          <form method="post">
            <input type="hidden" name="action" value="attach webroot">
            <button type="submit" class="action">attach static website</button>
          </form>
        </section>
        <div style="align-self: center;">
          <a href="../home">return home</a>
        </div>`);
    }

    if (request.req.method === 'POST' && request.req.bodyparams.action === 'attach webroot') {
      await this.site.domainManager.attachStaticWebRoot(domain);
      return ctx.redirect(domain.record.did);
    }
  }
}

class GateSiteInstallApp {
  constructor(site) {
    this.site = site;
  }

  async renderForm(request) {
    if (!request.session) {
      return ctx.redirect('/~/login');
    }

    const packages = await this.site.packageManager.getAll();

    let installUI = '';
    if (request.req.queryParams.pid) {
      const pkg = await this.site.packageManager.getOne(request.req.queryParams.pid);

      const mountRows = [];
      Object.keys(pkg.record.mounts).forEach(mountPoint => {
        const mountDef = pkg.record.mounts[mountPoint];
        const fieldKey = `mount-${encodeURIComponent(mountPoint)}`;
        switch (mountDef.type) {
          case 'bind':
            mountRows.push(commonTags.safeHtml`
              <div class="row">
                <label for="${fieldKey}" style="margin: 0 0 0 2em; width: 5em;">${mountPoint}</label>
                <input type="text" name="${fieldKey}" value="${mountDef.suggestion}"
                    style="width: 12em;">
              </div>
              <p class="hint">${mountDef.hint}</p>
            `);
            break;
        }
      });
      if (mountRows.length) {
        mountRows.unshift(commonTags.html`
          <hr>
          <h2>mount points</h2>
        `);
      }

      const workloadRows = [];
      Object.keys(pkg.record.workloads).forEach(wlId => {
        const workload = pkg.record.workloads[wlId];
        const fieldKey = `workload-${encodeURIComponent(wlId)}`;

        workloadRows.push(commonTags.safeHtml`
          <div class="row">
            <label for="${fieldKey}" style="margin: 0 0 0 2em; width: 5em;">${wlId}</label>
            <input type="text" name="${fieldKey}" value="${workload.sourceUri}" readonly
                style="width: 12em;">
          </div>
          <p class="hint">type: ${workload.type} / runtime: ${workload.runtime}</p>
        `);
      });
      if (workloadRows.length) {
        workloadRows.unshift(commonTags.html`
          <hr>
          <h2>workloads</h2>
        `);
      }

      installUI = commonTags.html`
        <form method="post" class="modal-form" style="border-left: 4px solid #ccc;">
          <h1>install as app</h1>
          <div class="row">
            <label for="account" style="margin: 0 0 0 2em; width: 5em;">account</label>
            <input type="text" name="account" disabled value="${request.session.account.address()}"
                style="width: 12em;">
          </div>
          <div class="row">
            <label for="sourceUri" style="margin: 0 0 0 2em; width: 5em;">source uri</label>
            <input type="text" name="sourceUri" disabled value="${pkg.record.sourceUri}"
                style="width: 12em;">
          </div>
          <div class="row">
            <label for="appKey" style="margin: 0 0 0 2em; width: 5em;">app key</label>
            <input type="text" name="appKey" value="${pkg.record.defaultKey}"
                style="width: 12em;">
          </div>
          ${mountRows}
          ${workloadRows}
          <button type="submit">
            install application
          </button>
        </form>`;
    }

    return sendGatePage(ctx, `install app | ${this.site.domain.fqdn}`, commonTags.html`
      <div style="display: flex; align-self: center;">
        <div class="modal-form" style="justify-content: flex-start;">
          <h1>select a package</h1>
          ${packages.map(pkg => commonTags.safeHtml`
            <form method="get" style="display: flex;">
              <input type="hidden" name="pid" value="${pkg.record.pid}">
              <button type="submit" style="flex: 1;"${
                request.req.queryParams.pid === pkg.record.pid ? ' class=action' : ''
                }>${pkg.record.displayName}</button>
            </form>
          `)}
        </div>
        ${installUI}
      </div>`);
  }

  async invoke(input) {
    const request = await new GateSiteRequest(this.site, input).loadState();
    if (request.req.method === 'GET') {
      return await this.renderForm(request);
    }

    if (request.req.method === 'POST') {
      const {pid} = request.req.queryParams;
      const {appKey} = request.req.bodyparams;
      if (!pid || !appKey) {
        return await this.renderForm(request);
      }

      const pkg = await this.site.packageManager.getOne(pid);
      const installation = pkg.createAppInstall(request.session.account, appKey, request.req.bodyparams);
      // TODO: should be one database transaction!!
      await this.site.accountManager.installApp(request.session.account, installation);
      await this.site.workloadManager.installAppWorkloads('aid', request.session.account.record.aid, installation.appKey, pkg);

      return ctx.redirect('/~/home');
    }
  }
}

class GateSiteRemoveApp {
  constructor(site) {
    this.site = site;
  }

  async invoke(input) {
    const request = await new GateSiteRequest(this.site, input).loadState();
    const {appKey} = request.req.queryParams;
    if (!request.session) {
      return ctx.redirect('/~/login');
    }

    if (request.req.method !== 'POST' || !appKey) {
      return sendGatePage(ctx, `remove app | ${this.site.domain.fqdn}`, commonTags.html`
        <form class="modal-form" method="post">
          <h2>Remove app ${request.req.queryParams.appKey}</h2>
          <p>The application will be stopped and removed from your account, but no stored data will be cleaned up.</p>
          <button type="submit">uninstall</button>
          <p><a href="home">wait nvm</a></p>
        </form>`);
    }

    await this.site.workloadManager.purgeAppWorkloads('aid', request.session.account.record.aid, appKey);
    await this.site.accountManager.removeApp(request.session.account, appKey);
    return ctx.redirect('/~/home');
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

class GateSiteAppSessionApi {
  constructor(site) {
    this.site = site;
  }

  async invoke(input) {
    const state = await new GateSiteRequest(this.site, input).loadState();
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

class GateSiteHome {
  constructor(site) {
    this.site = site;
  }

  async invoke(ctx) {
    if (!ctx.state.claims) {
      return ctx.redirect('/~/login');
    }
    const {aud, uid, email, firebase} = ctx.state.claims;


    const currentUser = await this.site.domain.adminApp.auth()
      .getUser(uid);
      console.log('user', await this.site.domain.adminApp.auth().getUser(uid))
    console.log('user', await this.site.domain.adminApp.auth().getUser('kXJQ97sZBPaJg71ReIWLgvg7ZR33'))
  console.log('user', await this.site.domain.adminApp.auth().getUser('bgBRV2GfEcNsrpsRhaYK13gSyWl1'))

    const profiles = await this.site.domain.listAccountProfilesForUser(uid);
    let profileListing = profiles.map(m => commonTags.safeHtml`
      <li>
        <a href="profiles/${m.id}">${m.get('handle')}</a>
      </li>
    `).join('\n');
    if (!profiles.length) {
      profileListing = commonTags.safeHtml`<li>None yet</li>`;
    }

    const apps = [];//await this.site.packageManager.getInstalledApps(account);
    let appListing = apps.map(app => commonTags.safeHtml`
      <li style="display: flex;">
        <a href="/~${account.record.username}/${app.appRec.appKey}/" style="flex: 1;">
          ${app.package.record.displayName}
        </a>
        <a href="remove-app?appKey=${app.appRec.appKey}">
          <i class="material-icons">delete</i>
        </a>
      </li>
    `).join('\n');
    if (!apps.length) {
      appListing = commonTags.safeHtml`<li>None yet</li>`;
    }

    return sendGatePage(ctx, `home | ${this.site.domain.fqdn}`, commonTags.html`
    <div style="display: flex;">
      <section class="compact modal-form">
        <p>${commonTags.safeHtml`You are ${uid}!`}</p>
        ${true ? commonTags.html`
          <a href="set-password" class="action">Change account password</a>
        ` : commonTags.html`
          <p>You don't have a password!</p>
          <a href="set-password" class="action">Create password</a>
        `}
        <a href="logout" class="action">log out</a>
      </section>

      <section class="compact modal-form">
        <h2>Your apps</h2>
        <ul style="text-align: left; margin: 0; padding: 0 0.5em;">
          ${appListing}
        </ul>
        <a href="install-app" class="action">
          Install application
        </a>
      </section>

      <section class="compact modal-form">
        <h2>Your domains</h2>
        <ul style="text-align: left;">
          ${profileListing}
        </ul>
        <a href="add-domain" class="action">Add new domain</a>
      </section>
    </div>`);
  }
}

class GateSiteProfile {
  constructor(site) {
    this.site = site;
  }

  async invoke(ctx) {
    if (!ctx.state.claims) {
      return ctx.redirect('/~/login');
    }
    const {aud, uid, email, firebase} = ctx.state.claims;

    const memberships = [];//await this.site.domainManager.getMembershipsFor(account);
    let domainListing = memberships.map(m => commonTags.safeHtml`
      <li>
        <a href="my-domains/${m.domain.record.did}">${m.domain.record.primaryFqdn}</a>
        (${m.role})
      </li>
    `).join('\n');
    if (!memberships.length) {
      domainListing = commonTags.safeHtml`<li>None yet</li>`;
    }

    const apps = [];//await this.site.packageManager.getInstalledApps(account);
    let appListing = apps.map(app => commonTags.safeHtml`
      <li style="display: flex;">
        <a href="/~${account.record.username}/${app.appRec.appKey}/" style="flex: 1;">
          ${app.package.record.displayName}
        </a>
        <a href="remove-app?appKey=${app.appRec.appKey}">
          <i class="material-icons">delete</i>
        </a>
      </li>
    `).join('\n');
    if (!apps.length) {
      appListing = commonTags.safeHtml`<li>None yet</li>`;
    }

    return sendGatePage(ctx, `home | ${this.site.domain.fqdn}`, commonTags.html`
    <div style="display: flex;">
      <section class="compact modal-form">
        <p>${commonTags.safeHtml`You are ${uid}!`}</p>
        ${true ? commonTags.html`
          <a href="set-password" class="action">Change account password</a>
        ` : commonTags.html`
          <p>You don't have a password!</p>
          <a href="set-password" class="action">Create password</a>
        `}
        <a href="logout" class="action">log out</a>
      </section>

      <section class="compact modal-form">
        <h2>Your apps</h2>
        <ul style="text-align: left; margin: 0; padding: 0 0.5em;">
          ${appListing}
        </ul>
        <a href="install-app" class="action">
          Install application
        </a>
      </section>

      <section class="compact modal-form">
        <h2>Your domains</h2>
        <ul style="text-align: left;">
          ${domainListing}
        </ul>
        <a href="add-domain" class="action">Add new domain</a>
      </section>
    </div>`);
  }
}

class GateSiteFtue {
  constructor(site) {
    this.site = site;
  }

  async get(ctx) {
    return sendGatePage(ctx, `get started | ${this.site.domain.fqdn}`, commonTags.safeHtml`
      <section class="ftue">
        <a href="/~/home" class="action">welcome to your new account :)</a>
        <p>here's what you can do:</p>
        <ul>
          <li>nothing, yet</li>
        </ul>
      </section>`);
  }
}


class GateSiteLogout {
  constructor(site) {
    this.site = site;
  }

  get(ctx) {
    return sendGatePage(ctx, `logout | ${this.site.domain.fqdn}`, commonTags.html`
      <form class="modal-form" method="post">
        <h2>Push the button.</h2>
        <input type="hidden" name="csrf" value="TODO" />
        <button type="submit">log out</button>
        <p><a href="home">wait nvm</a></p>
      </form>`);
  }

  async invoke(ctx) {
    //await this.site.sessionManager.purge(request.session);
    ctx.cookies.set('DustSessionJwt', '', {
      path: '/~/',
      maxAge: -10000,
      httpOnly: true,
    });
    ctx.redirect('/');
  }
}

class GateSiteAbout {
  constructor(site) {
    this.site = site;
  }

  async get(ctx) {
    return sendGatePage(ctx, `about | ${this.site.domain.fqdn}`, commonTags.safeHtml`
      <nav>
        <a href="/~/login" class="action">Login</a>
        <a href="/~/register" class="action">Register</a>
        <a href="/~/about" class="action alt-action">About</a>
      </nav>`);
  }
}

class GateSiteServiceWorker {
  async get(ctx) {
    return sendGatePage(ctx, 'webapp bootstrapper', commonTags.html`
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

function sendGatePage(ctx, title, inner) {
  const stanzas = [
    inner,
    commonTags.safeHtml`
      <div class="fill"></div>
      <footer>
        powered by the Stardust platform,
        built by
        <a href="http://danopia.net">danopia</a>
      </footer>`,
  ];

  if (ctx.state.error) {
    const {name, message} = ctx.state.error;
    stanzas.unshift(commonTags.safeHtml`
      <div class="error banner">
        <div class="message">
          <strong>${name||'Oops'}</strong>:
          ${message}
        </div>
      </div>`);
  }

  ctx.type = 'html';
  ctx.body = [
    commonTags.safeHtml`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1.0"/>
        <title>${title}</title>
        <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500|Material+Icons" rel="stylesheet">
        <link href="/~/style.css" type="text/css" rel="stylesheet" media="screen,projection" />
      </head>
      <body>
    `,
    ...stanzas.map(x=>'  '+x.split('\n').join('\n  ')),
    commonTags.safeHtml`
      </body>
      </html>`,
  ].join('\n\n');
}

class GateSiteStyle {
  async get(ctx) {
    ctx.type = 'css';
    ctx.body = `
html, body {
  height: 100%;
  margin: 0;
}
body {
  background-image: linear-gradient(145deg, #3e4b66 0%, #1f2533 100%);
  background-attachment: fixed;
  color: #fff;
  font-family: Roboto, sans;
  display: flex;
  flex-direction: column;
}
body > * {
  flex-shrink: 0;
}
header {
  text-align: center;
  margin: 5em 1em 3em;
}
header h1 {
  font-size: 4em;
  margin: 0;
  font-weight: 500;
}
header h2 {
  font-size: 2em;
  margin: 0;
  color: #aaa;
  font-weight: 300;
}
header em {
  font-weight: 400;
  font-style: normal;
}
a {
  color: #ccc;
}
nav {
  display: flex;
  justify-content: center;
}
.fill {
  flex: 1;
}
.action {
  display: block;
  border: 3px solid #ccc;
  margin: 1em;
  padding: 0.7em 2em;
  text-decoration: none;
}
.alt-action {
  border-color: #999;
}
.action:hover {
  border-color: #fff;
  color: #fff;
  background-color: rgba(255, 255, 255, 0.15);
  text-decoration: underline;
}
footer {
  max-width: 40em;
  margin: 5em auto 3em;
  text-align: center;
  color: #999;
}

.banner {
  margin: 3em 0 -3em;
  padding: 1em;
  width: 40em;
  align-self: center;
}
.error.banner {
  background-color: #b71c1c;
  color: #ffebee;
}
.banner .message {
  font-size: 1.2em;
  margin: 0 1em;
  word-break: break-word;
}

.modal-form a {
  color: #333;
}
.modal-form .action {
  border-color: #666;
}
.modal-form .action:hover {
  border-color: #000;
  color: #000;
  background-color: rgba(0, 0, 0, 0.15);
}

.modal-form {
  display: flex;
  flex-direction: column;
  max-width: 40em;
  background-color: #eee;
  text-align: center;
  color: #000;
  margin: 5em auto 3em;
  padding: 2em 1em;
}
.modal-form.compact {
  margin: 1em auto;
  padding: 1em 1em;
}
.modal-form input, .modal-form select, .modal-form button {
  font-size: 1.3em;
  margin: 0.25em 1em;
  padding: 0.5em 1em;
  display: block;
  border: 3px solid #ccc;
}
.modal-form input:focus, .modal-form select:focus, .modal-form button:focus {
  border-color: #666;
  box-shadow: 0 0 4px 1px rgba(50, 50, 50, 0.3);
  outline: none;
}
.modal-form input:hover, .modal-form select:hover, .modal-form button:hover {
  border-color: #999;
  outline: none;
}
.modal-form input {
  background-color: #fff;
}
.modal-form select {
  background-color: #fff;
}
.modal-form button {
  background-color: rgba(0, 0, 0, 0.15);
  cursor: 666;
  color: #333;
}
.modal-form h1, .modal-form h2 {
  margin: 0.2em 1em 0.5em;
  font-weight: 300;
  color: #000;
}
.modal-form input {
  letter-spacing: 1px;
}
.modal-form input[type=password]:not(:placeholder-shown) {
  letter-spacing: 4px;
}
.modal-form input[disabled] {
  background-color: #f3f3f3;
}
.modal-form h1 em {
  font-weight: 400;
  font-style: normal;
}
.modal-form .row {
  display: flex;
}
.modal-form .row label {
  align-self: center;
  color: #000;
  font-size: 1.2em;
  margin-right: 2em;
  letter-spacing: 1px;
}
.modal-form .hint {
  margin-top: 0;
}
`;
  }
}
