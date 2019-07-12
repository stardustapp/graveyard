build.as("Data.Node")

build.relation({ predicate="EMITS", object=".Metric" })

build.fields({
  HostName={ type="String" },
  MetricPrefix="String",
  GlobalTags={ type="String", isList=true },
  FlushPeriodSecs={ type=Number, defaultValue=10 },
  Sink={ anyOfKeyed={
    DatadogApi={ fields={
      BaseUrl={ type="String", defaultValue='https://api.datadoghq.com/api' },
      ApiKey="String",
    }},
    PostProxy={ fields={
      Endpoint="String",
    }},
  }},
})
