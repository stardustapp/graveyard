const Koa = require('koa');
const route = require('koa-route');
const commonTags = require('common-tags');

exports.DefaultSite = class DefaultSite {
  constructor(domain) {
    if (!domain)
      throw new Error(`DefaultSite requires a domain`);
    this.domain = domain;
    this.koa = new Koa();

    this.koa.use(route.get('/', ctx => {
      ctx.type = 'html';
      ctx.body = commonTags.safeHtml`<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1.0"/>
  <title>${this.domain.fqdn}</title>
  <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500" rel="stylesheet">
  <style type="text/css">
    html, body {
      height: 100%;
      margin: 0;
    }
    body {
      background-image: linear-gradient(145deg, #3e4b66 0%, #1f2533 100%);
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
      color: #ddd;
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
  </style>
</head>
<body>
  <header>
    <h1>${this.domain.fqdn}</h1>
    <h2>a <em>Stardust</em> system</h2>
  </header>

  <nav>
    <a href="/~/home" class="action">Login</a>
    <a href="/~/register" class="action">Register</a>
    <a href="/~/about" class="action alt-action">About</a>
  </nav>

  <div class="fill"></div>

  <footer>
    powered by the Stardust platform,
    built by
    <a href="http://danopia.net">danopia</a>
  </footer>
</body>
</html>`;
    }));
  }
}
