build.as("Data.Node")

build.relation({ subject=".Emitter", predicate="EMITS" })

build.fields({
  MetricKind={ type="String", allowedValues=['gauge', 'rate', 'counter'] },
  MetricName="String",
  TagList={ type="String", isList=true },
  --PendingPoints={ type=Number, isList=true },
})
