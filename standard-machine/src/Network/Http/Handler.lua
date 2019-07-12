build.as("Data.Node")

build.fields({
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
  DefaultAction={ reference=".Actions.Base" },
})
