const Koa = require('koa');
const route = require('koa-route');
const bodyParser = require('koa-body');
const commonTags = require('common-tags');

// Serves up enough HTML to nicely direct users to the account page
exports.DoorwaySite = class DoorwaySite {
  constructor(context) {
    if (!context) throw new Error(
      `GateSite requires a context`);
    this.context = context;

    this.koa = new Koa();
    // this.koa.use(async (ctx, next) => {
    //   ctx.state.domain = await context.selectDomain(ctx.request.hostname);
    //   return next();
    // });

    // install serviceworkers that give real content
    // case parts[0] === 'apps':
    //   // serviceworkers can only fuck with things in the same subfolder
    //   // for now the sw.js gets overlaid at a higher level
    //   return new GateSiteServiceWorker();

    // accept form POSTs
    this.koa.use(bodyParser({
       multipart: false,
       urlencoded: true,
    }));

    // check the cookie
    this.koa.use(this.checkCookie.bind(this));

    // dynamic entry points
    this.koa.use(route.get('/login', ctx => new GateSiteLogin(this).get(ctx)));
    this.koa.use(route.post('/login', ctx => new GateSiteLogin(this).post(ctx)));
    this.koa.use(route.get('/register', ctx => new GateSiteRegister(this).get(ctx)));
    this.koa.use(route.post('/register', ctx => new GateSiteRegister(this).post(ctx)));

    // dynamic gated pages
    this.koa.use(route.get('/home', ctx => new GateSiteHome(this).get(ctx)));
    // this.koa.use(route.get('/ftue', ctx => new GateSiteFtue(this).get(ctx)));
    // this.koa.use(route.get('/add-domain', ctx => new GateSiteAddDomain(this).get(ctx)));
    this.koa.use(route.get('/create-password', ctx => new GateSiteCreatePassword(this).get(ctx)));
    this.koa.use(route.post('/create-password', ctx => new GateSiteCreatePassword(this).post(ctx)));
    this.koa.use(route.get('/logout', ctx => new GateSiteLogout(this).get(ctx)));
    this.koa.use(route.post('/logout', ctx => new GateSiteLogout(this).post(ctx)));

    this.koa.use(route.get('/handle/:handle', (...args) => new GateSiteHandle(this).get(...args)));
    this.koa.use(route.get('/handle/:handle/install-app', ctx => new GateSiteInstallApp(this).get(ctx)));
    this.koa.use(route.post('/handle/:handle/install-app', ctx => new GateSiteInstallApp(this).post(ctx)));
    // this.koa.use(route.get('/remove-app', ctx => new GateSiteRemoveApp(this).get(ctx)));

    // case parts.length === 2 && parts[0] === 'my-domains' && parts[1].length > 0:
    //   return new GateSiteManageDomain(this, parts[1]);

    // api for the vue sdk (and other in-browser sdks)
    this.koa.use(route.post('/app-session', ctx => new GateSiteAppSessionApi(this).post(ctx)));

    // extra pages/assets
    this.koa.use(route.get('/about', ctx => new GateSiteAbout(this).get(ctx)));
    this.koa.use(route.get('/style.css', ctx => new GateSiteStyle().get(ctx)));
  }

  async checkCookie(ctx, next) {
    const sessionCookie = ctx.cookies.get('DustSessionJwt');
    ctx.state.claims = null;
    if (sessionCookie) {
      try {
        ctx.state.claims = await this.context.readCookie(sessionCookie);
        //console.debug('have claims', ctx.state.claims)
      } catch (err) {
        ctx.state.claims = null;
        console.warn('JWT check failed!', err.message);
        ctx.cookies.set('DustSessionJwt', '', {
          path: '/~/',
          maxAge: -10000,
          httpOnly: true,
        });
      }
    }

    await next();
    if (ctx.state.claims) {
      const {uid} = ctx.state.claims;
      this.context.markUserSeen(uid);
    }
  }
}

class GateSiteLogin {
  constructor(site) {
    this.site = site;
  }

  async get(ctx, partialData={}) {
    if (ctx.state.claims) {
      return ctx.redirect(ctx.request.origin+'/~/home');
    }

    return sendGatePage(ctx, `login | ${ctx.state.domain.domainId}`, commonTags.safeHtml`
      <form method="post" action="login" class="modal-form">
        <h1>login to <em>${ctx.state.domain.domainId}</em></h1>
        <input type="hidden" name="domain" value="${ctx.state.domain.domainId}">
        <input type="email" name="email" placeholder="external email" autocomplete="email" value="${partialData.email||''}" required autofocus>
        <input type="password" name="password" placeholder="password" autocomplete="current-password">
        <button type="submit">log in</button>
      </form>
      <div style="align-self: center;">
        <a href="register">or register a new account</a>
      </div>`);
  }

  async post(ctx) {
    const {domain, email, password} = ctx.request.body;
    await (async () => {

      const idToken = await this.site.context.logInUserPassword(email, password);
      const {cookieVal, maxAge} = await this.site.context.createCookie(idToken);
      ctx.cookies.set('DustSessionJwt', cookieVal, {
        path: '/~/',
        maxAge,
        httpOnly: true,
        secure: false, // TODO
      });

    })().then(() => {
      console.log(`User ${email} successfully logged in`);
      ctx.redirect(ctx.request.origin+'/~/home');
    }, err => {
      ctx.state.error = err;
      console.error('login error', ctx.request.body);
      console.error(err.stack);
      return this.get(ctx, {email});
    });

  }
}

class GateSiteRegister {
  constructor(site) {
    this.site = site;
  }

  async get(ctx, partialData={}) {
    if (!ctx.state.claims) {
      const idToken = await this.site.context.createAnonUser();
      const {cookieVal, maxAge} = await this.site.context.createCookie(idToken);
      ctx.state.claims = await this.site.context.readCookie(cookieVal);

      ctx.cookies.set('DustSessionJwt', cookieVal, {
        path: '/~/',
        maxAge,
        httpOnly: true,
        secure: false, // TODO
      });
    }
    const {uid} = ctx.state.claims;
    const csrf = await this.site.context.makeCSRF(uid, ctx.request.origin);

    return sendGatePage(ctx, `register | ${ctx.state.domain.domainId}`, commonTags.safeHtml`
      <form method="post" action="register" class="modal-form">
        <h1>register new account</h1>
        <input type="hidden" name="csrf" value="${csrf}">
        <input type="hidden" name="fqdn" value="${ctx.state.domain.domainId}">
        <div class="row">
          <label style="text-align: right; margin: 0 0 0 2em;" for="handle">${ctx.state.domain.domainId}/~</label>
          <input style="text-align: left; width: 0; flex: 1;" type="text" name="handle" value="${partialData.handle||''}" placeholder="username" autocomplete="username required" autofocus>
        </div>
        <input type="email" name="contactEmail" value="${partialData.contactEmail||''}" placeholder="your contact email (private)" autocomplete="email" required>
        <input type="text" name="displayName" value="${partialData.displayName||''}" placeholder="your 'real' name (shared)" autocomplete="name" required>
        <button type="submit">submit registration</button>
      </form>
      <div style="align-self: center;">
        <a href="home">nevermind!</a>
      </div>`);
  }

  async post(ctx) {
    const {uid} = ctx.state.claims;
    const {csrf, fqdn, handle, contactEmail, displayName} = ctx.request.body;
    await (async () => {
      await this.site.context.checkCSRF(csrf, uid, ctx.request.origin);
      await ctx.state.domain
        .registerHandle({fqdn, handle, uid, contactEmail, displayName})
    })().then(handleId => {
      ctx.redirect(`/~/home`);
    }, err => {
      ctx.state.error = err;
      console.error('registration error', ctx.request.body);
      console.error(err.stack);
      return this.get(ctx, ctx.request.body);
    });
  }
}

class GateSiteHome {
  constructor(site) {
    this.site = site;
  }

  async get(ctx) {
    if (!ctx.state.claims) {
      return ctx.redirect(ctx.request.origin+'/~/login');
    }
    const {aud, uid, email, firebase} = ctx.state.claims;

    let userRecord;
    try {
      userRecord = await this.site.context.getUserProfile(uid);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        ctx.cookies.set('DustSessionJwt', '', {
          path: '/~/',
          maxAge: -10000,
          httpOnly: true,
        });
        ctx.response.status = 400;
        return sendGatePage(ctx, `server error`, commonTags.safeHtml`
          <h2>auth error: user not found</h2>
          <p>
            Something happened to your user record.
            Either the server reclaimed the account due to inactivity,
            or the server's records have been deleted more broadly.
            Please try registering again.
          </p>
          <p>
            <a href="register">register now</a>
          </p>
        `);
      }
      throw err;
    }
    const hasPassword = !!userRecord.passwordHash;

    const handles = await ctx.state.domain.listHandlesForUser(uid);
    let handleListing = handles.map(m => commonTags.safeHtml`
      <li>
        <a href="handle/${m.id}">${m.get('handle')}</a> (${m.get('displayName')})
      </li>
    `).join('\n');
    if (!handles.length) {
      handleListing = commonTags.safeHtml`<li>None yet</li>`;
    }

    return sendGatePage(ctx, `home | ${ctx.state.domain.domainId}`, commonTags.html`
      <section class="compact modal-form">
        ${userRecord.providerData.length === 0 ? commonTags.safeHtml`
          <p>
            <span style="font-weight: 200; font-size: 1.4em;">Welcome!</span>
            Your account is not yet linked to an authentication method.
            To keep access to your account, please add a login identity below.
          </p>
          <a href="create-password" class="action">Create account password</a>
          <a href="email-link" class="action">Send magic e-mail link</a>
        ` : commonTags.safeHtml`
          <p>${commonTags.safeHtml`You are ${userRecord.email}!`}</p>
          <a href="reset-password" class="action">Reset password</a>
        `}
        <a href="logout" class="action">Log out</a>
      </section>

      <section class="compact modal-form">
        <h2>Your handles</h2>
        <ul style="text-align: left;">
          ${handleListing}
        </ul>
        <a href="register" class="action">Register new handle</a>
      </section>
    `);
  }
}

class GateSiteHandle {
  constructor(site) {
    this.site = site;
  }

  async get(ctx, handleId) {
    if (!ctx.state.claims) {
      return ctx.redirect(ctx.request.origin+'/~/login');
    }
    const {aud, uid, email, firebase} = ctx.state.claims;

    const memberships = [];//await this.site.contextManager.getMembershipsFor(account);
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

    // const handle = await ctx.state.domain.getHandle(handleId);

    return sendGatePage(ctx, `home | ${ctx.state.domain.domainId}`, commonTags.html`
      <section class="compact modal-form">
        <p>${commonTags.safeHtml`You are ${uid}!`}</p>
        <a href="home" class="action">manage handle</a>
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
    `);
  }
}

class GateSiteCreatePassword {
  constructor(site) {
    this.site = site;
  }

  async get(ctx, partialData={}) {
    if (!ctx.state.claims) {
      return ctx.redirect(ctx.request.origin+'/~/login');
    }
    const {uid} = ctx.state.claims;

    const csrf = await this.site.context.makeCSRF(uid, ctx.request.origin);
    const handles = await ctx.state.domain.listHandlesForUser(uid);
    if (handles.length < 1) {
      return ctx.redirect(ctx.request.origin+'/~/register');
    }
    if (!partialData.email)
      partialData.email = handles[0].get('metadata.contactEmail');

    const rows = [commonTags.safeHtml`
      <div class="row">
        <label for="email" style="margin: 0 0 0 2em; width: 5em;">email</label>
        <input type="email" name="email" autocomplete="email" value="${partialData.email||''}" required style="flex: 1;">
      </div>`
    ];
    if (false) {
      rows.push(commonTags.safeHtml`
        <div class="row">
          <label for="current" style="margin: 0 0 0 2em; width: 5em;">current</label>
          <input type="password" name="current" autocomplete="current-password" value="${partialData.current||''}" required style="flex: 1;">
        </div>`);
    }
    rows.push(commonTags.safeHtml`
        <div class="row">
          <label for="desired" style="margin: 0 0 0 2em; width: 5em;">new</label>
          <input type="password" name="desired" autocomplete="new-password" value="${partialData.desired||''}" required autofocus style="flex: 1;">
        </div>`);

    return sendGatePage(ctx, `create password | ${ctx.state.claims.email}`, commonTags.html`
      <form method="post" action="create-password" class="modal-form">
        <h1>create account password</h1>
        ${rows.join('\n')}
        <button type="submit">submit</button>
        <input type="hidden" name="csrf" value="${csrf}"/>
      </form>
      <div style="align-self: center;">
        <a href="home">return home</a>
      </div>`);
  }

  async post(ctx) {
    if (!ctx.state.claims) {
      return ctx.redirect(ctx.request.origin+'/~/login');
    }

    const {uid} = ctx.state.claims;
    const {csrf} = ctx.request.body;
    await (async () => {
      await this.site.context.checkCSRF(csrf, uid, ctx.request.origin);

      const idToken = await this.site.context
        .linkToEmailPassword({uid, ...ctx.request.body});

      const {cookieVal, maxAge} = await this.site.context.createCookie(idToken);
      ctx.cookies.set('DustSessionJwt', cookieVal, {
        path: '/~/',
        maxAge,
        httpOnly: true,
        secure: false, // TODO
      });

    })().then(() => {
      ctx.redirect(`/~/home`);
    }, err => {
      ctx.state.error = err;
      console.error('set password error', ctx.request.body);
      console.error(err.stack);
      return this.get(ctx, ctx.request.body);
    });
  }
}

// class GateSiteAddDomain {
//   constructor(site) {
//     this.site = site;
//   }
//
//   renderForm(request) {
//     if (!request.session) {
//       return ctx.redirect(ctx.request.origin+'/~/login');
//     }
//
//     return sendGatePage(ctx, `add domain | ${ctx.state.domain.domainId}`, commonTags.safeHtml`
//       <form method="post" class="modal-form">
//         <h1>add new domain</h1>
//         <div class="row">
//           <label for="owner" style="margin: 0 0 0 2em;">owner</label>
//           <input type="text" name="owner" disabled value="${request.session.account.address()}"
//               style="width: 12em;">
//         </div>
//         <input type="text" name="fqdn" placeholder="domain name (as in DNS)" required autofocus>
//         <button type="submit">add domain to handle</button>
//       </form>`);
//   }
//
//   get(ctx) {
//     return this.renderForm(ctx);
//   }
//   async post(ctx) {
//     console.log('add domain', ctx.request.body);
//     const {fqdn} = ctx.request.body;
//     if (!fqdn) {
//       return this.renderForm(request);
//     }
//
//     const domain = await this.site.contextManager
//         .registerDomain(fqdn, request.session.account);
//
//     return ctx.redirect(ctx.request.origin+'/~/my-domains/'+domain.record.did);
//   }
// }

// class GateSiteManageDomain {
//   constructor(site, domainId) {
//     this.site = site;
//     this.domainId = domainId;
//   }
//
//   async post(input) {
//     const request = await new GateSiteRequest(this.site, input).loadState();
//     if (!request.session) {
//       return ctx.redirect(ctx.request.origin+'/~/login');
//     }
//     const domain = await this.site.contextManager.getDomain(this.domainId);
//     if (!domain) {
//       throw new Error(`Domain not found`);
//     }
//     const role = domain.highestRoleFor(request.session.account);
//     if (role !== 'owner') {
//       throw new Error(`Only domain owners can manage the domain`);
//     }
//
//     if (request.req.method === 'GET') {
//       return sendGatePage(ctx, `manage domain`, commonTags.safeHtml`
//         <section class="modal-form">
//           <h1>domain: <em>${domain.record.primaryFqdn}</em></h1>
//           <div style="text-align: left;">
//             <p>Identity: ${domain.record.did}</p>
//             <p>Status: ${domain.record.status}</p>
//             <p>FQDNs: ${domain.record.fqdns}</p>
//             <p>Grants: ${domain.record.grants.map(g => commonTags.safeHtml`${g.aid}=${g.role}`)}</p>
//             <p>Web root: ${domain.record.webroot ? domain.record.webroot.type : 'none'}</p>
//           </div>
//           <form method="post">
//             <input type="hidden" name="action" value="attach webroot">
//             <button type="submit" class="action">attach static website</button>
//           </form>
//         </section>
//         <div style="align-self: center;">
//           <a href="home">return home</a>
//         </div>`);
//     }
//
//     if (request.req.method === 'POST' && request.req.bodyparams.action === 'attach webroot') {
//       await this.site.contextManager.attachStaticWebRoot(domain);
//       return ctx.redirect(domain.record.did);
//     }
//   }
// }

// class GateSiteInstallApp {
//   constructor(site) {
//     this.site = site;
//   }
//
//   async renderForm(request) {
//     if (!request.session) {
//       return ctx.redirect(ctx.request.origin+'/~/login');
//     }
//
//     const packages = await this.site.packageManager.getAll();
//
//     let installUI = '';
//     if (request.req.queryParams.pid) {
//       const pkg = await this.site.packageManager.getOne(request.req.queryParams.pid);
//
//       const mountRows = [];
//       Object.keys(pkg.record.mounts).forEach(mountPoint => {
//         const mountDef = pkg.record.mounts[mountPoint];
//         const fieldKey = `mount-${encodeURIComponent(mountPoint)}`;
//         switch (mountDef.type) {
//           case 'bind':
//             mountRows.push(commonTags.safeHtml`
//               <div class="row">
//                 <label for="${fieldKey}" style="margin: 0 0 0 2em; width: 5em;">${mountPoint}</label>
//                 <input type="text" name="${fieldKey}" value="${mountDef.suggestion}"
//                     style="width: 12em;">
//               </div>
//               <p class="hint">${mountDef.hint}</p>
//             `);
//             break;
//         }
//       });
//       if (mountRows.length) {
//         mountRows.unshift(commonTags.html`
//           <hr>
//           <h2>mount points</h2>
//         `);
//       }
//
//       const workloadRows = [];
//       Object.keys(pkg.record.workloads).forEach(wlId => {
//         const workload = pkg.record.workloads[wlId];
//         const fieldKey = `workload-${encodeURIComponent(wlId)}`;
//
//         workloadRows.push(commonTags.safeHtml`
//           <div class="row">
//             <label for="${fieldKey}" style="margin: 0 0 0 2em; width: 5em;">${wlId}</label>
//             <input type="text" name="${fieldKey}" value="${workload.sourceUri}" readonly
//                 style="width: 12em;">
//           </div>
//           <p class="hint">type: ${workload.type} / runtime: ${workload.runtime}</p>
//         `);
//       });
//       if (workloadRows.length) {
//         workloadRows.unshift(commonTags.html`
//           <hr>
//           <h2>workloads</h2>
//         `);
//       }
//
//       installUI = commonTags.html`
//         <form method="post" class="modal-form" style="border-left: 4px solid #ccc;">
//           <h1>install as app</h1>
//           <div class="row">
//             <label for="account" style="margin: 0 0 0 2em; width: 5em;">account</label>
//             <input type="text" name="account" disabled value="${request.session.account.address()}"
//                 style="width: 12em;">
//           </div>
//           <div class="row">
//             <label for="sourceUri" style="margin: 0 0 0 2em; width: 5em;">source uri</label>
//             <input type="text" name="sourceUri" disabled value="${pkg.record.sourceUri}"
//                 style="width: 12em;">
//           </div>
//           <div class="row">
//             <label for="appKey" style="margin: 0 0 0 2em; width: 5em;">app key</label>
//             <input type="text" name="appKey" value="${pkg.record.defaultKey}"
//                 style="width: 12em;">
//           </div>
//           ${mountRows}
//           ${workloadRows}
//           <button type="submit">
//             install application
//           </button>
//         </form>`;
//     }
//
//     return sendGatePage(ctx, `install app | ${ctx.state.domain.domainId}`, commonTags.html`
//       <div style="display: flex; align-self: center;">
//         <div class="modal-form" style="justify-content: flex-start;">
//           <h1>select a package</h1>
//           ${packages.map(pkg => commonTags.safeHtml`
//             <form method="get" style="display: flex;">
//               <input type="hidden" name="pid" value="${pkg.record.pid}">
//               <button type="submit" style="flex: 1;"${
//                 request.req.queryParams.pid === pkg.record.pid ? ' class=action' : ''
//                 }>${pkg.record.displayName}</button>
//             </form>
//           `)}
//         </div>
//         ${installUI}
//       </div>`);
//   }
//
//   async post(input) {
//     const request = await new GateSiteRequest(this.site, input).loadState();
//     if (request.req.method === 'GET') {
//       return await this.renderForm(request);
//     }
//
//     if (request.req.method === 'POST') {
//       const {pid} = request.req.queryParams;
//       const {appKey} = request.req.bodyparams;
//       if (!pid || !appKey) {
//         return await this.renderForm(request);
//       }
//
//       const pkg = await this.site.packageManager.getOne(pid);
//       const installation = pkg.createAppInstall(request.session.account, appKey, request.req.bodyparams);
//       // TODO: should be one database transaction!!
//       await this.site.accountManager.installApp(request.session.account, installation);
//       await this.site.workloadManager.installAppWorkloads('aid', request.session.account.record.aid, installation.appKey, pkg);
//
//       return ctx.redirect(ctx.request.origin+'/~/home');
//     }
//   }
// }
//
// class GateSiteRemoveApp {
//   constructor(site) {
//     this.site = site;
//   }
//
//   async post(input) {
//     const request = await new GateSiteRequest(this.site, input).loadState();
//     const {appKey} = request.req.queryParams;
//     if (!request.session) {
//       return ctx.redirect(ctx.request.origin+'/~/login');
//     }
//
//     if (request.req.method !== 'POST' || !appKey) {
//       return sendGatePage(ctx, `remove app | ${ctx.state.domain.domainId}`, commonTags.html`
//         <form class="modal-form" method="post">
//           <h2>Remove app ${request.req.queryParams.appKey}</h2>
//           <p>The application will be stopped and removed from your account, but no stored data will be cleaned up.</p>
//           <button type="submit">uninstall</button>
//           <p><a href="home">wait nvm</a></p>
//         </form>`);
//     }
//
//     await this.site.workloadManager.purgeAppWorkloads('aid', request.session.account.record.aid, appKey);
//     await this.site.accountManager.removeApp(request.session.account, appKey);
//     return ctx.redirect(ctx.request.origin+'/~/home');
//   }
// }

function parseAppReferer(referer) {
  const parts = referer.split('/').slice(3);
  if (parts[0] === '~~' || parts[0] === '~') {
    const appParts = parts.slice(1);
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

  async post(ctx) {
    if (!ctx.state.claims) {
      ctx.throw(401, `user is not logged in`);
    }
    const {uid} = ctx.state.claims;

    const {origin, referer} = ctx.request.header;
    if (!origin || !referer || !referer.startsWith(origin+'/')) throw new Error(
      `400: Referer isn't from this Origin`);

    const {username, appKey} = parseAppReferer(referer);
    if (!appKey) {
      throw new Error('app-session needs an appKey (did you block Referer?)');
    }

    const session = await ctx.state.domain.createRootSession(uid, {
      lifetime: 'short',
      client: 'doorway app-session - for '+referer,
      username, appKey,
    });
    ctx.response.body = session;
  }
}

class GateSiteFtue {
  constructor(site) {
    this.site = site;
  }

  async get(ctx) {
    return sendGatePage(ctx, `get started | ${ctx.state.domain.domainId}`, commonTags.safeHtml`
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

  async get(ctx) {
    if (!ctx.state.claims) {
      return ctx.redirect(ctx.request.origin+'/');
    }

    const {uid} = ctx.state.claims;
    const csrf = await this.site.context.makeCSRF(uid, ctx.request.origin);
    const userRecord = await this.site.context.getUserProfile(uid);
    const isAnonymous = userRecord.providerData.length === 0;

    return sendGatePage(ctx, `logout | ${ctx.state.domain.domainId}`, commonTags.html`
      <form method="post" action="logout" class="modal-form">
        <h2>Push the button.</h2>
        ${isAnonymous ? commonTags.safeHtml`
          <div class="error inline-banner">
            <div class="message">
              <strong>Your account will become inaccessible!</strong>
              <div>
                If you want to ever be able to log in back into this account,
                please go back now and register your account to an email address.
              </div>
              <div>
                Otherwise, logging out now will will mark this account for deletion.
              </div>
            </div>
          </div>
          <input type="hidden" name="andDelete" value="yes" />
        ` : ''}
        <input type="hidden" name="csrf" value="${csrf}" />
        <button type="submit">${isAnonymous ? 'log out & mark for deletion' : 'log out'}</button>
        <p><a href="home">wait nvm</a></p>
      </form>`);
  }

  async post(ctx) {
    if (!ctx.state.claims) {
      return ctx.redirect(ctx.request.origin+'/');
    }

    const {uid} = ctx.state.claims;
    const {csrf} = ctx.request.body;
    await this.site.context.checkCSRF(csrf, uid, ctx.request.origin);

    //await this.site.sessionManager.purge(request.session);
    ctx.cookies.set('DustSessionJwt', '', {
      path: '/~/',
      maxAge: -10000,
      httpOnly: true,
    });
    ctx.redirect(ctx.request.origin+'/');
  }
}

class GateSiteAbout {
  constructor(site) {
    this.site = site;
  }

  async get(ctx) {
    return sendGatePage(ctx, `about | ${ctx.state.domain.domainId}`, commonTags.safeHtml`
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
        <base href="${ctx.request.origin}/~/" />
        <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500|Material+Icons" rel="stylesheet">
        <link href="style.css" type="text/css" rel="stylesheet" media="screen,projection" />
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
footer {
  max-width: 40em;
  margin: 5em auto 3em;
  text-align: center;
  color: #999;
}
.fill {
  flex: 1;
}
@media (max-width: 599px) {
  header {
    margin: 2em 1em;
  }
  footer {
    margin: 2em auto 1em;
  }
}

a {
  color: #ccc;
}
nav {
  display: flex;
  justify-content: center;
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

.banner {
  margin: 3em 0 -3em;
  padding: 1em;
  width: 40em;
  align-self: center;
}
.inline-banner {
  margin: 1em 1.3em;
  padding: 1em 0;
  text-align: left;
}
.error {
  background-color: #b71c1c;
  color: #ffebee;
}
.banner .message, .inline-banner .message {
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
  width: 100vw;
  box-sizing: border-box;
  background-color: #eee;
  text-align: center;
  color: #000;
  margin: 5em auto 3em;
  padding: 2em 1em;
}
@media (min-width: 600px) {
  .modal-form {
    min-width: 20em;
    max-width: 30em;
  }
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
  cursor: pointer;
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
