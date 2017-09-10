## Stardust Utility Belt
The core utilities are a set of standalone POSIX executables
that implement portions of starsystem behavior and operational tooling.

Utilities are generally either interactive tools or daemons.
Don't let the name mislead you:
utilities can be composed into a functional starsystem.

### Core Daemons
* `skychart` implements per-user namespaces and serves standard HTTP.
  A skychart service requires a unique DNS hostname to serve on.
  Users can architect a filesystem graph using internal and external "devices".
  Various endpoints are provided to access those virtual systems.
  A reference implementation of a web control panel exists by the same name.
* `starfs` mounts a FUSE-based filesystem on the host OS,
  backed of course by a Stardust namesystem.
  Files are natively presented while Strings are transformed.
  Other types of entries are just not available for now.
  This daemon is also a useful operational utility.
* `starsystem` works as a bootstrapper and host-OS initsystem.
  It uses no persistent storage; instead,
  a master process is launched that operates as the system's controller.
  Executables may be either local or an HTTPS URL.
  Binary immutability is expected - to update the binary, provide a new path.
  Starsystem can use any API-compatible master,
  of which two are anticipated: `skychart` and `skyremote`

### Operational utilities (Meeseeks)
* `starcp` allows copying trees between the host OS and the starsystem.
  It's used like `cp` or `scp` with URI locations referring to remote systems.
  For example, `starcp -R blog/ sky://dan@devmode.cloud/public/web/`
* `stargen` generates and compiles a certain Stardriver.
  It currently supports golang drivers and produces a host executable.
  Stargen is tasked with providing wrapping code to
  natively expose existing Golang libraries into a starsystem with minimal glue.
  The output should be easily launched by `starsystem`.
* `starnotify` sends a single chat message to a given IRC channel.
  Currently based on `irc-client` and joins channels as needed.
  Will need to be rewritten to be more generic / support more chat drivers.
