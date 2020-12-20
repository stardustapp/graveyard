build.as("Data.Node")

build.relation({ subject=".Directory", predicate="REFERENCES" })
build.relation({ subject=".File", predicate="REFERENCES" })

build.fields({
  Anchor={ anyOfKeyed={
    HostPath="String",
  }},
  AllowWrites="Boolean",
  Root={ reference="Directory", defaultValue={
    Path='.',
    Meta={ Unknown=true },
  }},
})
