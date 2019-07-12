build.as("Data/Schema")

build.name("Package", function (build)
  build.as("Data/Entries/Folder")
  build.fields({
    DisplayName="String",
    PackageKey="String",
    PackageType={ type="String", choices=[ "Package", "Library", "App" ] },
    License="String",
  })
end)

-- These fields are for DUST bookkeeping
-- Every "resource" from PoC has them
local ResourceFields = {
  Name="String",
  Version="Number",
}

-- These fields store arbitrary executable code
-- Should probably be refactored into its own node
local ScriptFields = {
  Source={ anyOfKeyed={
    Coffee="String",
    -- TODO=add other languages
  }},
  JS="String",
  Refs={ reference=true, isList=true },
}

build.name("AppRouter", function (build)
  build.as("Data/Struct")
  build.fields(mergeTables(ResourceFields, {
    IconUrl={ type="String", optional=true },
    DefaultLayout={ reference="Template", optional=true },
    RouteTable={ reference="Route", isList=true },
  })
end)

build.name("Route", function (build)
  build.as("Data/Struct")
  -- relations=[
  --   { exactly=1, subject="AppRouter", predicate="REFERENCES" },
  -- ],
  build.fields({
    Path="String",
    Action={
      anyOfKeyed={
        Script={ fields=ScriptFields },
        Render={ fields={
          Template={
            reference="Template",
          },
          Layout={
            reference="Template",
            optional=true,
          },
        }},
      },
    },
  })
end)

build.name("Template", function (build)
  build.as("Data/Struct")
  build.fields(mergeTables(ResourceFields, {
    Handlebars="String",
    Style={ fields={
      CSS="String",
      SCSS="String",
    }},
    -- TODO=map of scripts
    Scripts={ isList=true, fields=mergeTables(ScriptFields, {
      Type={ anyOfKeyed={
        Lifecycle={ type="String", choices=[ "Render", "Create", "Destroy" ] },
        Helper={ type="String" },
        Event={ type="String" },
        Hook={ type="String" },
      }},
    }},
  })
end)

local RecordField = {
  Key="String",
  Type={ anyOfKeyed={
    BuiltIn={ type="String", choices=[
      "String", "URI", "Secret", "Number", "Boolean", "Moment", "Object", "Graph", "Reference"
    ]},
    SchemaEmbed={ reference="RecordSchema" },
    SchemaRef={ reference="RecordSchema" },
  }},
  IsList={ type=Boolean, default=false },
  Optional={ type=Boolean, default=false },
  Immutable={ type=Boolean, default=false },
  DefaultValue={ type="String", optional=true }, -- TODO=as [E]JSON string
  -- TODO=enum, transient, mapping
}

build.name("RecordSchema", function (build) -- was CustomRecord
  build.as("Data/Struct")
  build.fields(mergeTables(ResourceFields, {
    Base={ anyOfKeyed={
      BuiltIn={ type="String", choices=[ "Record", "Class" ]},
      SchemaRef={ reference="RecordSchema" },
    }},
    Fields={ fields=RecordField, isList=true },
    -- Behaviors
    TimestampBehavior={ type=Boolean, default=false },
    SlugBehavior={ optional=true, fields={
      Field="String",
    }},
  })
end)

build.name("Dependency", function (build)
  build.as("Data/Struct")
  build.fields(mergeTables(ResourceFields, {
    -- TODO=support npm, apt, docker deps
    PackageKey={ type="String" },
    ChildRoot={ reference="Package" },
  })
end)

local DocLocatorFields = {
  RecordType={ anyOfKeyed={
    BuiltIn={ type="String", choices=[ "Record", "Class" ]},
    SchemaRef={ reference="RecordSchema" },
  }},
  -- TODO=these three "String" fields should be "JSON"
  FilterBy={ type="String", optional=false },
  SortBy={ type="String", optional=true },
  Fields={ type="String", optional=true },
  LimitTo={ type="Number", optional=true },
  --Children={ embed="@" }, -- self recursion
}
-- recursive field just to make things difficult
DocLocatorFields.Children = { fields=DocLocatorFields, isList=true }

build.name("Publication", function (build)
  build.as("Data/Struct")
  build.fields(mergeTables(ResourceFields, DocLocatorFields))
end)

build.name("ServerMethod", function (build)
  build.as("Data/Struct")
  build.fields(mergeTables(ResourceFields, ScriptFields))
end)
