build.as("Data.Library")
Messages = build.import("Network.Http.Messages")

BaseAction = build.name("Base", function (build)
  build.as("Data.Trait")

  build.function("Handle", {
    input=Messages.Request,
    output=Messages.Response,
  })
end)

-- Hardcoded HTTP response
build.name("FixedResponse", function (build)
  build.as("Data.Struct")

  build.fields({
    StatusCode="Number",
    Body={ anyOfKeyed={
      StringData="String",
      Base64="String",
    }, optional=true },
    Headers={ fields={
      Key="String",
      Value={ type="String" },
    }, isList=true },
  })

  build.instanceOf(BaseAction, {
    Handle=function (self, request)
      return Messages.Response.new({
        Status={ Code=self.StatusCode },
        Body=self.Body,
        Headers=self.Headers,
      })
    end,
  })
end)
--[[
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
