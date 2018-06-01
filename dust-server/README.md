# ProfileServ: Stardust home-server appliance

This repository contains a self-sustaining Stardust profile server
  targetted at Chromeboxes and other ChromeOS devices,
  implemented in pure JavaScript as a Chrome Packaged App.

The Stardust platform is not nearly complete,
  and neither is this implementation.
There will be a day when this paragraph is removed.
Until then don't pay too much attention. :-)

There are a couple initial servers deployed, but not useful yet.

## Goals

1. Build a monolithic next-gen Stardust backend
1. Design for 1-25 daily active users
1. No external hard-dependencies to install and access
1. Target low-power machines e.g. Rockchip and Celeron
1. Actually implement some security
1. Implement enough platform to selfhost the Stardust IRC Client
   1. Domains, Web hosting, Accounts, Apps, Threads, Devices, Drivers
   1. A whole persistent data backend!

The previous generation of Stardust has a microservice backend architecture.
The golang/cloud design was intended to help with scalability.
Unfortunately, the service isolation made the overall system
  harder to prototype with, design, & maintain.

ProfileServ is a from-scratch rewrite of a Stardust application backend
  without any focus on scalability.
Configuring many self-contained personal or communal servers
  is a more relevant goal for Stardust's second-year plan.
Supporting nonzero amounts of cloud users isn't expected until Q4 2019.
This gives time to create a final nonscalable prototype-as-v1
  and use it to orchestrate the scalable cloud experiance.
  
## Target Runtime

Though this project contains little more than pure Javascript/HTML/CSS source,
  it is only usable in a Chrome runtime and tries making calls
  to APIs that are only available on a ChromeOS device.

The app manifest configures ProfileServ to run as a Kiosk application.
Kiosk mode is a ChromeOS feature where the system can boot directly into a given app.
Under this single-application operating mode,
  Chrome gives the application extra hardware and system APIs.
For example, the application can be notified of available OS updates
  and sit on that information until the app decides to reboot the OS and get the update.
And the kiosk app can also access arbitrary named folders on the host operating system
  to store actual files and folders using the DirectoryEntry API.

There's two ways to deploy Kiosk applications.
The officially supported way is purchasing a Single-Application License
  from a Google reseller like Provo.
This license associates to a Google Apps domain and you can theoretically
  use an online dashboard to configure kiosk applications on a fleet.
The alternate way is a somewhat involved, yet non-invasive procedure
  which usually requires completely wiping the Chrome device first.
A successfully provisioned Kiosk device becomes a 24/7 evergreen appliance.
It's pretty gorgeous, actually.

Unfortunately I'm not currently aware of what resource constraints Kiosk apps can use.
For example, will ChromeOS delete my database on a whim? Let's find out!
