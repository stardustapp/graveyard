build.as("Data.Graph")

build.name("Connection", function (build)
  build.as("Data.Node")

  build.relation({ predicate="ISSUED", object=".Request" })
  build.relation({ predicate="RETURNED", object=".Response" })
  build.relation({ predicate="UPGRADED", object=".WebSocket" })

  build.fields({
    OpenedAt="Date",
    ClosedAt={ type="Date", optional=true },

    WireProtocol="String",
    SocketFamily="String",
    Server={ fields={
      Address="String",
      Port="Number",
    }, optional=true },
    Peer={ fields={
      Address="String",
      Port="Number",
    }, optional=true },
  })
end)

-- Represents a client-to-server request.
build.name("Request", function (build)
  build.as("Data.Node")

  build.relation({ subject=".Connection", predicate="ISSUED" })
  build.relation({ predicate="RETURNED", object=".Response" })
  build.relation({ predicate="STREAMED", object=".Frame" })

  build.fields({
    Timestamp="Date",
    -- raw request line
    Method="String",
    Url="String",
    HttpVersion="String",
    -- raw header list
    Headers={ fields={
      Key="String",
      Value="String",
    }, isList=true },
    -- processed fields
    RemoteAddress="String", -- accounts for proxies
    HostName="String",
    AltPort={ type="Number", optional=true },
    Origin="String",
    Path="String",
    Query={ fields={
      Key="String",
      Value="String",
    }, isList=true },
    -- attached data
    Body={ anyOfKeyed={
      StringData="String",
      Base64="String",
      Stream="Boolean",
      HttpUpgrade="Boolean",
    }},
  })
end)

-- Represents a server-to-client message fulfilling a Request.
build.name("Response", function (build)
  build.as("Data.Node")

  build.relation({ subject="Connection", predicate="RETURNED" })
  build.relation({ subject="Request", predicate="RETURNED" })
  build.relation({ predicate="STREAMED", object="Frame" })

  build.fields({
    Timestamp="Date",
    Status={ fields={
      Code="Number",
      Message={ type="String", optional=true },
    }},
    Headers={ fields={
      Key="String",
      Value="String",
    }, isList=true },
    Body={ anyOfKeyed={
      StringData="String",
      Base64="String",
      NativeStream="Boolean",
      ChunkStream="Boolean",
      -- TODO=Stream={ reference={ engine="streaming", name="ByteStream" }}
      WebSocket={ reference="WebSocket" },
    }},
  })
end)

-- Ordered data chunk to support streaming responses.
-- Sending a zero-length Data packet (of either encoding) terminates the stream.
build.name("Frame", function (build)
  build.as("Data.Node")

  build.relation({ subject=".Request", predicate="STREAMED" })
  build.relation({ subject=".Response", predicate="STREAMED" })
  build.relation({ subject=".WebSocket", predicate="STREAMED" })

  build.fields({
    Timestamp="Date",
    Sequence="Number",
    -- inner value
    Data={ anyOfKeyed={
      StringData="String",
      Base64="String",
    }},
    -- extra stuff for WS
    WebSocketFlags={ fields={
      Incomplete={ type="Boolean", defaultValue=false },
      Source={ type="String", allowedValues=[
        "Client", "Server"
      ]},
      -- markers can only have 126 bytes of data
      Control={ type="String", allowedValues=[
        "Continuation", -- 0x00
        "CloseSocket", -- 0x08
        "Ping", -- 0x09
        "Pong", -- 0x0a
      ]},
    }},
  })
end)

build.name("WebSocket", function (build)
  build.as("Data.Node")

  build.relation({ subject=".Connection", predicate="UPGRADED" })
  build.relation({ subject=".Request", predicate="UPGRADED" })
  build.relation({ predicate="STREAMED", object=".Frame" })

  build.fields({
    ReadyState="Number",
  })
end)
