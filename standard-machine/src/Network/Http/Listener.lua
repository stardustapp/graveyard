build.as("Data.Node")

build.relation({ predicate="HOLDS", object=".Messages.Connection" })

build.fields({
  --DefaultDomain="String",
  RootHandler={ reference="Handler" },
  Metrics={ reference={ engine="metric-emitter", name="Emitter"} },
  Interface={ anyOfKeyed={
    Unix={ fields={
      Path="String",
    }},
    Tcp={ fields={
      Interface={ type="String", optional=true },
      Host="String",
      Port="Number",
    }},
  }},
  TrustProxyLevels={ type="Number", defaultValue=1 },
  Status={ fields={
    State="String",
    Message="String",
    LastChange="Date",
    Heartbeat="Date",
  }, optional=true },
})
--[[
  build.node("Handler", {
    relations=[
      { subject="Server", predicate="REFERENCES" },
    ],
    fields={
      -- Table of other handlers that the request can be forwarded to.
      -- This concept nests and lets traffic fan out to different destinations.
      -- Once there are no more matching rules, the request gets handled there.
      InnerRules={ fields={
        Conditions={ anyOfKeyed={
          Host={ fields={
            Names={ type="String", isList=true },
            AltPort={ type="Number", optional=true },
          }},
          Methods={ type="String", isList=true },
          PathPatterns={ type="String", isList=true },
          HttpHeader={ fields={
            Key="String",
            Values={ type="String", isList=true },
          }},
          QueryString={ fields={
            Key="String",
            Values="String",
          }, isList=true },
          SourceIps={ type="String", isList=true },
        }, isList=true },
        ForwardTo={ reference="Handler" },
      }, isList=true },
      -- How requests that stop at this handler get responded to.
      DefaultAction={ anyOfKeyed={
        -- Hardcoded HTTP response
        FixedResponse={ fields={
          StatusCode="Number",
          Body={ anyOfKeyed={
            StringData="String",
            Base64="String",
          }, optional=true },
          Headers={ fields={
            Key="String",
            Value={ type="String" },
          }, isList=true },
        }},
        -- Arbitrary logic from outside behavior
        ForeignNode={ fields={
          Ref={ reference=true },
          Behavior={ type="String" },
          AllowUpgrades={ type="String", isList=true },
          Input={ type=JSON, optional=true },
        }},
        -- Rich file serving from outside filesystem
        StreamFiles={ fields={
          PathDepth="Number",
          RootDir={ reference={
            engine="host-filesystem",
            name="Directory",
          }},
          AcceptRanges={ type=Boolean, defaultValue=true },
          CacheControl={ type=Boolean, defaultValue=true },
          ETag={ type=Boolean, defaultValue=true },
          DotFiles={
            type="String",
            allowedValues=["ignore", "allow", "deny"],
            defaultValue="ignore",
          },
          Extensions={ type="String", isList=true },
          Immutable={ type=Boolean, defaultValue=false },
          IndexFiles={ type="String", isList=true, defaultValue=["index.html"] },
          LastModified={ type=Boolean, defaultValue=true },
          MaxAge={ type=Boolean, defaultValue=0 }, -- 60 * 60 * 24 * 365 * 1000 -- 1 year
        }},
      }},
    },
  });

});
]]--
